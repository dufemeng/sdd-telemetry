# Wiki 召回看板 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 sdd-telemetry 看板里加"知识库召回"模块，覆盖谁/哪个需求/哪个 skill 召回了哪些 wiki，同时把 `sdd_interaction_tool_calls.skill_usage_id` 落地作为通用基础设施。

**Architecture:** worker 在现有 cleanBatch 末尾追加两个 step（`attachSkillUsageToToolCalls` 回填归属 + `upsertWikiRecalls` 写派生表）。新派生表 `sdd_wiki_recalls` 物化 3 个稳定维度（domain/axis/system）做索引加速，其余前端从 `wiki_relative_path` 解析。dashboard 新建一个 4-tab 页面 + 三处跨页联动。

**Tech Stack:** TypeScript / MidwayJS 4 / typeorm / mysql2 / Vitest / React 19 / Vite / TanStack Query / React Router v7 / Tailwind v4 / Zod。

**关联 spec：** `docs/superpowers/specs/2026-05-27-wiki-recall-dashboard-design.md`（必读）

---

## File Structure

### 新建文件

```
server/src/infrastructure/mysql/migrations/
  <timestamp1>-add-skill-usage-id-to-tool-calls.ts
  <timestamp2>-create-wiki-recalls.ts

server/src/infrastructure/mysql/entities/
  sdd-wiki-recall.entity.ts

worker/src/jobs/
  wiki-path.ts                                 # parseWikiPath / extractCandidatePath

worker/test/
  wiki-path.test.ts                            # 单元测试
  attach-skill-usage.test.ts                   # 单元测试
  integration/wiki-recall-cleaning.test.ts     # 集成测试

web/src/pages/sdd/wiki-recalls/
  WikiRecallsPage.tsx                          # 主 shell + tab 路由
  useWikiRecalls.ts                            # TanStack Query hooks
  tabs/UserRankingTab.tsx
  tabs/WorkItemRankingTab.tsx
  tabs/WikiHeatmapTab.tsx
  tabs/TimelineTab.tsx
  components/                                  # 共享小组件（按需建）
```

### 修改文件

```
server/src/infrastructure/mysql/entities/
  sdd-interaction-tool-call.entity.ts          # +skillUsageId
  index.ts                                     # +导出 SddWikiRecallEntity
server/src/infrastructure/mysql/
  reset-derived-data.ts                        # +清表
  verify-schema.ts                             # +校验
server/src/modules/sdd/
  sdd-query.repository.ts                      # +wiki recall 查询方法
  sdd-query.service.ts                         # +service 方法
  sdd.controller.ts                            # +路由
packages/api/src/contracts/sdd.contract.ts     # +wiki recall Zod schemas

worker/src/jobs/cleaning-worker.ts             # 在 cleanBatch 中追加 2 step
worker/src/jobs/cleaning.repository.ts         # +upsertWikiRecall / +attachSkillUsageToToolCall / 改 upsertToolCall

web/src/router.tsx                             # +路由
web/src/components/layout/Sidebar.tsx          # +nav 项
web/src/pages/sdd/users/UsersPage.tsx          # 详情区域加 wiki 召回 panel
web/src/pages/sdd/work-items/WorkItemsPage.tsx # 详情区域加 wiki 召回 panel
web/src/pages/sdd/interactions/InteractionsPage.tsx  # tool_calls 表加 wiki 标记列
```

### Task → 文件映射

| Task | 主要文件 |
|---|---|
| 1 | migration (加列) + entity |
| 2 | cleaning.repository.ts (upsertToolCall) |
| 3 | cleaning.repository.ts (attachSkillUsageToToolCall) + cleaning-worker.ts + test |
| 4 | migration (建表) + entity + index + reset-derived-data + verify-schema |
| 5 | worker/jobs/wiki-path.ts + test |
| 6 | cleaning.repository.ts (upsertWikiRecall) + cleaning-worker.ts (upsertWikiRecalls step) + test |
| 7 | packages/api contract |
| 8 | sdd-query.repository.ts |
| 9 | sdd-query.service.ts + sdd.controller.ts |
| 10 | router.tsx + Sidebar + WikiRecallsPage shell |
| 11 | Tab 1 UserRankingTab |
| 12 | Tab 2 WorkItemRankingTab |
| 13 | Tab 3 WikiHeatmapTab |
| 14 | Tab 4 TimelineTab |
| 15 | 用户详情 + 需求详情联动 |
| 16 | interactions 表格 wiki 标记列 |
| 17 | 部署 + 探查 + reclean + 可证伪查询 |

---

## 阶段 0：前置数据探查（必须在公司电脑生产数据库跑）

**这步在本地无意义**，因为本地没有真实生产数据。在公司电脑 mysql 客户端直接跑下面五个 SQL，确认数据形态符合 spec 假设：

```sql
-- 1. @wiki 路径都出现在哪些 tool_name 下
SELECT tc.tool_name, COUNT(*) AS cnt
FROM sdd_interaction_tool_calls tc
JOIN sdd_interactions i ON i.id = tc.interaction_id
JOIN sdd_users u ON u.id = i.user_id
WHERE u.wiki_root_path IS NOT NULL
  AND tc.tool_input_preview LIKE CONCAT('%', u.wiki_root_path, '%')
GROUP BY tc.tool_name
ORDER BY cnt DESC;

-- 2. Read 工具 tool_input 形态
SELECT tool_input_preview FROM sdd_interaction_tool_calls
WHERE tool_name = 'Read' LIMIT 20;

-- 3. wiki_root_path NULL 用户占比
SELECT
  SUM(wiki_root_path IS NULL) AS null_count,
  COUNT(*) AS total
FROM sdd_users;

-- 4. 极大 interaction 的 tool_call 数
SELECT interaction_id, COUNT(*) AS tc_count
FROM sdd_interaction_tool_calls
GROUP BY interaction_id ORDER BY tc_count DESC LIMIT 10;

-- 5. 现有 skill_activated 在 events 的字段名
SELECT attributes_json FROM otel_log_events
WHERE event_name = 'skill_activated' LIMIT 5;
```

**Gate**：如果 (1) 出现意料外的 tool_name（不是 Read/Glob/Grep），或 (2) Read 的 tool_input 字段名不是 `file_path`——**先把发现的事实记到 spec 补丁里再继续**。否则跳到 Task 1。

---

## Task 1: 加 `sdd_interaction_tool_calls.skill_usage_id` 列

**Files:**
- Create: `server/src/infrastructure/mysql/migrations/1780000000000-add-skill-usage-id-to-tool-calls.ts`
- Modify: `server/src/infrastructure/mysql/entities/sdd-interaction-tool-call.entity.ts`

- [ ] **Step 1.1: 写 migration**

```typescript
// server/src/infrastructure/mysql/migrations/1780000000000-add-skill-usage-id-to-tool-calls.ts
import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddSkillUsageIdToToolCalls1780000000000 implements MigrationInterface {
  name = 'AddSkillUsageIdToToolCalls1780000000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    if (
      (await tableExists(queryRunner, 'sdd_interaction_tool_calls')) &&
      !(await columnExists(queryRunner, 'sdd_interaction_tool_calls', 'skill_usage_id'))
    ) {
      await queryRunner.query(
        `ALTER TABLE \`sdd_interaction_tool_calls\`
         ADD COLUMN \`skill_usage_id\` BIGINT UNSIGNED NULL AFTER \`interaction_id\`,
         ADD KEY \`idx_sdd_interaction_tool_calls_skill_usage_id\` (\`skill_usage_id\`)`,
      );
    }
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    if (await columnExists(queryRunner, 'sdd_interaction_tool_calls', 'skill_usage_id')) {
      await queryRunner.query(
        `ALTER TABLE \`sdd_interaction_tool_calls\`
         DROP KEY \`idx_sdd_interaction_tool_calls_skill_usage_id\`,
         DROP COLUMN \`skill_usage_id\``,
      );
    }
  }
}

async function tableExists(qr: QueryRunner, t: string): Promise<boolean> {
  const rows = (await qr.query(
    `SELECT 1 FROM information_schema.tables WHERE table_schema=DATABASE() AND table_name=? LIMIT 1`,
    [t],
  )) as unknown[];
  return rows.length > 0;
}

async function columnExists(qr: QueryRunner, t: string, c: string): Promise<boolean> {
  const rows = (await qr.query(
    `SELECT 1 FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name=? AND column_name=? LIMIT 1`,
    [t, c],
  )) as unknown[];
  return rows.length > 0;
}
```

- [ ] **Step 1.2: 修改 entity，加 `skillUsageId` 列**

```typescript
// server/src/infrastructure/mysql/entities/sdd-interaction-tool-call.entity.ts
// 在 @Index 装饰器后追加：
@Index('idx_sdd_interaction_tool_calls_skill_usage_id', ['skillUsageId'])
// 在 interactionId 字段后追加：
@Column({ name: 'skill_usage_id', type: 'bigint', unsigned: true, nullable: true })
skillUsageId!: string | null;
```

- [ ] **Step 1.3: 跑 migration**

```bash
docker compose up -d mysql
pnpm db:migrate
```

预期：日志显示 `AddSkillUsageIdToToolCalls1780000000000` 应用成功，无报错。

- [ ] **Step 1.4: 校验**

```bash
pnpm db:verify
```

预期：通过；无 schema mismatch。

- [ ] **Step 1.5: typecheck + commit**

```bash
pnpm typecheck
git add server/src/infrastructure/mysql/migrations/1780000000000-add-skill-usage-id-to-tool-calls.ts \
        server/src/infrastructure/mysql/entities/sdd-interaction-tool-call.entity.ts
git commit -m "$(cat <<'EOF'
新增 sdd_interaction_tool_calls.skill_usage_id 字段

通用基础设施改造，作为 wiki 召回归属推断的载体；同时为未来"skill 工具画像"等
incremental 应用预留 FK。

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: `upsertToolCall` 支持写 `skillUsageId`

**Files:**
- Modify: `worker/src/jobs/cleaning.repository.ts`

- [ ] **Step 2.1: 扩展 UpsertToolCallInput 类型与 SQL**

在 `cleaning.repository.ts` 顶部的 `UpsertToolCallInput` 接口加字段：

```typescript
export interface UpsertToolCallInput {
  interactionId: string;
  skillUsageId: string | null;       // ★ 新增
  toolUseId: string;
  // ... 其余不变
}
```

修改 `upsertToolCall` 方法的 INSERT 列、VALUES、ON DUPLICATE KEY UPDATE：

```typescript
async upsertToolCall(
  connection: PoolConnection,
  input: UpsertToolCallInput,
): Promise<void> {
  await connection.query<ResultSetHeader>(
    `INSERT INTO sdd_interaction_tool_calls
      (interaction_id, skill_usage_id, tool_use_id, tool_name, sequence, decision, decision_source,
       success, duration_ms, input_size_bytes, result_size_bytes, error_type,
       tool_input_preview, mcp_server_scope, evidence_json, gmt_create, gmt_modified)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3))
     ON DUPLICATE KEY UPDATE
       interaction_id = VALUES(interaction_id),
       skill_usage_id = COALESCE(VALUES(skill_usage_id), skill_usage_id),
       tool_name = COALESCE(VALUES(tool_name), tool_name),
       sequence = CASE
         WHEN sequence = 0 THEN VALUES(sequence)
         WHEN VALUES(sequence) = 0 THEN sequence
         ELSE LEAST(VALUES(sequence), sequence)
       END,
       decision = COALESCE(VALUES(decision), decision),
       decision_source = COALESCE(VALUES(decision_source), decision_source),
       success = COALESCE(VALUES(success), success),
       duration_ms = COALESCE(VALUES(duration_ms), duration_ms),
       input_size_bytes = COALESCE(VALUES(input_size_bytes), input_size_bytes),
       result_size_bytes = COALESCE(VALUES(result_size_bytes), result_size_bytes),
       error_type = COALESCE(VALUES(error_type), error_type),
       tool_input_preview = COALESCE(VALUES(tool_input_preview), tool_input_preview),
       mcp_server_scope = COALESCE(VALUES(mcp_server_scope), mcp_server_scope),
       evidence_json = JSON_MERGE_PATCH(COALESCE(evidence_json, JSON_OBJECT()), COALESCE(VALUES(evidence_json), JSON_OBJECT())),
       gmt_modified = CURRENT_TIMESTAMP(3)`,
    [
      input.interactionId,
      input.skillUsageId,
      input.toolUseId,
      input.toolName,
      input.sequence,
      input.decision,
      input.decisionSource,
      input.success,
      input.durationMs,
      input.inputSizeBytes,
      input.resultSizeBytes,
      input.errorType,
      input.toolInputPreview,
      input.mcpServerScope,
      input.evidenceJson,
    ],
  );
}
```

- [ ] **Step 2.2: 修改 worker `upsertToolCalls` 调用点**

在 `worker/src/jobs/cleaning-worker.ts` 的 `upsertToolCalls` 函数（约 484 行起）的 `cleaningRepository.upsertToolCall(...)` 调用处加 `skillUsageId: null`（初值，后面 Task 3 的 step 回填）：

```typescript
await cleaningRepository.upsertToolCall(connection, {
  interactionId: interaction.id,
  skillUsageId: null,                   // ★ 新增；后续 attachSkillUsageToToolCalls 回填
  toolUseId,
  toolName,
  sequence,
  // ...
});
```

- [ ] **Step 2.3: 跑 typecheck**

```bash
pnpm typecheck
```

预期：通过。

- [ ] **Step 2.4: 跑既有 worker test 确认无回归**

```bash
pnpm --filter @sdd-telemetry/worker test
```

预期：所有现有测试 PASS。

- [ ] **Step 2.5: commit**

```bash
git add worker/src/jobs/cleaning.repository.ts worker/src/jobs/cleaning-worker.ts
git commit -m "$(cat <<'EOF'
upsertToolCall 支持写入 skill_usage_id

为下一步 attachSkillUsageToToolCalls 回填铺路；初值 null。

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: 实现 `attachSkillUsageToToolCalls` step

按 spec §4.2 算法：对每个 interaction，按 event_sequence 范围找最近的前置 skill_usage。

**Files:**
- Modify: `worker/src/jobs/cleaning.repository.ts` (加 `attachSkillUsageToToolCallsByInteractions` 方法)
- Modify: `worker/src/jobs/cleaning-worker.ts` (加 `attachSkillUsageToToolCalls` step 并接入 cleanBatch)
- Create: `worker/test/attach-skill-usage.test.ts`

- [ ] **Step 3.1: 先写测试（TDD）**

```typescript
// worker/test/attach-skill-usage.test.ts
import { describe, expect, it } from 'vitest';
import { attachSkillUsageToToolCallsForOneInteraction } from '../src/jobs/cleaning-worker';

// 测试纯函数版本（避免 DB 依赖）
describe('attachSkillUsageToToolCallsForOneInteraction', () => {
  it('归属到事件序号≤tool_call的最近 skill_usage', () => {
    const usages = [
      { id: 'u1', eventSequence: 10 },
      { id: 'u2', eventSequence: 30 },
    ];
    const toolCalls = [
      { id: 'tc1', sequence: 5 },   // 之前没有 usage
      { id: 'tc2', sequence: 15 },  // 归 u1
      { id: 'tc3', sequence: 30 },  // 归 u2（边界：相等）
      { id: 'tc4', sequence: 50 },  // 归 u2
    ];

    const assignments = attachSkillUsageToToolCallsForOneInteraction(toolCalls, usages);

    expect(assignments).toEqual([
      { toolCallId: 'tc1', skillUsageId: null },
      { toolCallId: 'tc2', skillUsageId: 'u1' },
      { toolCallId: 'tc3', skillUsageId: 'u2' },
      { toolCallId: 'tc4', skillUsageId: 'u2' },
    ]);
  });

  it('没有 skill_usage 时全部归 null', () => {
    const assignments = attachSkillUsageToToolCallsForOneInteraction(
      [{ id: 'tc1', sequence: 5 }],
      [],
    );
    expect(assignments).toEqual([{ toolCallId: 'tc1', skillUsageId: null }]);
  });

  it('tool_call 在所有 skill_usage 之前时归 null', () => {
    const assignments = attachSkillUsageToToolCallsForOneInteraction(
      [{ id: 'tc1', sequence: 1 }],
      [{ id: 'u1', eventSequence: 100 }],
    );
    expect(assignments).toEqual([{ toolCallId: 'tc1', skillUsageId: null }]);
  });
});
```

- [ ] **Step 3.2: 跑测试确认 FAIL**

```bash
pnpm --filter @sdd-telemetry/worker test attach-skill-usage
```

预期：FAIL with `attachSkillUsageToToolCallsForOneInteraction is not a function`（函数还没实现）。

- [ ] **Step 3.3: 在 cleaning-worker.ts 中实现纯函数 + DB step**

在 `worker/src/jobs/cleaning-worker.ts` 适当位置（例如 `upsertSkillUsages` 函数之后）添加：

```typescript
// 纯函数版本，便于单测
export function attachSkillUsageToToolCallsForOneInteraction(
  toolCalls: Array<{ id: string; sequence: number }>,
  usages: Array<{ id: string; eventSequence: number }>,
): Array<{ toolCallId: string; skillUsageId: string | null }> {
  const sortedUsages = [...usages].sort((a, b) => a.eventSequence - b.eventSequence);
  return toolCalls.map((tc) => {
    let nearest: { id: string; eventSequence: number } | null = null;
    for (const u of sortedUsages) {
      if (u.eventSequence <= tc.sequence) {
        nearest = u;
      } else {
        break;
      }
    }
    return { toolCallId: tc.id, skillUsageId: nearest ? nearest.id : null };
  });
}

// DB step
async function attachSkillUsageToToolCalls(
  connection: PoolConnection,
  interactions: Map<string, InteractionRef>,
): Promise<number> {
  let updated = 0;
  for (const interaction of interactions.values()) {
    const usagesRows = await cleaningRepository.listSkillUsagesByInteraction(connection, interaction.id);
    const toolCallRows = await cleaningRepository.listToolCallsByInteraction(connection, interaction.id);
    const assignments = attachSkillUsageToToolCallsForOneInteraction(
      toolCallRows.map((tc) => ({ id: tc.id, sequence: tc.sequence ?? 0 })),
      usagesRows
        .filter((u) => u.eventSequence != null)
        .map((u) => ({ id: u.id, eventSequence: u.eventSequence as number })),
    );
    for (const a of assignments) {
      await cleaningRepository.updateToolCallSkillUsageId(connection, a.toolCallId, a.skillUsageId);
      updated += 1;
    }
  }
  return updated;
}
```

- [ ] **Step 3.4: 在 cleaning.repository.ts 加 3 个 DB 方法**

```typescript
async listSkillUsagesByInteraction(
  connection: PoolConnection,
  interactionId: string,
): Promise<Array<{ id: string; eventSequence: number | null }>> {
  const [rows] = await connection.query<RowDataPacket[]>(
    `SELECT id, event_sequence AS eventSequence
     FROM sdd_skill_usages
     WHERE interaction_id = ?
     ORDER BY event_sequence ASC, id ASC`,
    [interactionId],
  );
  return rows as Array<{ id: string; eventSequence: number | null }>;
}

async listToolCallsByInteraction(
  connection: PoolConnection,
  interactionId: string,
): Promise<Array<{ id: string; sequence: number | null }>> {
  const [rows] = await connection.query<RowDataPacket[]>(
    `SELECT id, sequence
     FROM sdd_interaction_tool_calls
     WHERE interaction_id = ?`,
    [interactionId],
  );
  return rows as Array<{ id: string; sequence: number | null }>;
}

async updateToolCallSkillUsageId(
  connection: PoolConnection,
  toolCallId: string,
  skillUsageId: string | null,
): Promise<void> {
  await connection.query<ResultSetHeader>(
    `UPDATE sdd_interaction_tool_calls
     SET skill_usage_id = ?, gmt_modified = CURRENT_TIMESTAMP(3)
     WHERE id = ?`,
    [skillUsageId, toolCallId],
  );
}
```

注意：如果文件里 `RowDataPacket` 没 import，从 `mysql2` 加 import。

- [ ] **Step 3.5: 接入 cleanBatch**

在 `cleaning-worker.ts` 的 cleanBatch 中（约 233 行的 `upsertSkillUsages` 调用之后），追加：

```typescript
const usages = await upsertSkillUsages(connection, scopedEvents, interactions, assignments.eventToKey);
const toolCallAttachments = await attachSkillUsageToToolCalls(connection, interactions);  // ★ 新增
const artifacts = await upsertWorkItems(connection, scopedEvents);
// ...
return interactions.size + toolCalls + usages + errors + artifacts + toolCallAttachments;  // 计入 derived count
```

- [ ] **Step 3.6: 跑测试**

```bash
pnpm --filter @sdd-telemetry/worker test attach-skill-usage
pnpm --filter @sdd-telemetry/worker test
```

预期：新测试 PASS；旧测试无回归。

- [ ] **Step 3.7: smoke test 集成跑通**

跑一次 worker 单跑，确认无报错：

```bash
pnpm build
pnpm --filter @sdd-telemetry/worker once
```

预期：worker 处理 outbox 完成、退出码 0。然后查 DB 确认归属字段已写：

```sql
SELECT COUNT(*) FROM sdd_interaction_tool_calls WHERE skill_usage_id IS NOT NULL;
```

预期：> 0（取决于本地数据）。

- [ ] **Step 3.8: commit**

```bash
git add worker/src/jobs/cleaning.repository.ts \
        worker/src/jobs/cleaning-worker.ts \
        worker/test/attach-skill-usage.test.ts
git commit -m "$(cat <<'EOF'
新增 attachSkillUsageToToolCalls 清洗 step

按 (interaction_id, event_sequence) 范围推断 tool_call 归属，回填
sdd_interaction_tool_calls.skill_usage_id。不递归子 skill。

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: 新建 `sdd_wiki_recalls` 表与 entity

**Files:**
- Create: `server/src/infrastructure/mysql/migrations/1780000001000-create-wiki-recalls.ts`
- Create: `server/src/infrastructure/mysql/entities/sdd-wiki-recall.entity.ts`
- Modify: `server/src/infrastructure/mysql/entities/index.ts`
- Modify: `server/src/infrastructure/mysql/reset-derived-data.ts`
- Modify: `server/src/infrastructure/mysql/verify-schema.ts`

- [ ] **Step 4.1: 写 migration**

```typescript
// server/src/infrastructure/mysql/migrations/1780000001000-create-wiki-recalls.ts
import type { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateWikiRecalls1780000001000 implements MigrationInterface {
  name = 'CreateWikiRecalls1780000001000';

  async up(queryRunner: QueryRunner): Promise<void> {
    if (await tableExists(queryRunner, 'sdd_wiki_recalls')) return;

    await queryRunner.query(`
      CREATE TABLE \`sdd_wiki_recalls\` (
        \`id\` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        \`recall_key\` CHAR(64) NOT NULL,
        \`tool_call_id\` BIGINT UNSIGNED NOT NULL,
        \`interaction_id\` BIGINT UNSIGNED NOT NULL,
        \`skill_usage_id\` BIGINT UNSIGNED NULL,
        \`work_item_id\` BIGINT UNSIGNED NULL,
        \`user_id\` BIGINT UNSIGNED NULL,
        \`action_type\` VARCHAR(32) NOT NULL,
        \`raw_path\` VARCHAR(2048) NOT NULL,
        \`wiki_relative_path\` VARCHAR(1024) NULL,
        \`wiki_domain\` VARCHAR(191) NULL,
        \`wiki_axis\` VARCHAR(64) NULL,
        \`wiki_system\` VARCHAR(191) NULL,
        \`event_id\` CHAR(64) NULL,
        \`event_sequence\` INT UNSIGNED NULL,
        \`event_time\` DATETIME(3) NULL,
        \`rule_version\` VARCHAR(32) NOT NULL,
        \`gmt_create\` DATETIME(3) NOT NULL,
        \`gmt_modified\` DATETIME(3) NOT NULL,
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`uk_recall_key\` (\`recall_key\`),
        KEY \`idx_recalls_tool_call_id\` (\`tool_call_id\`),
        KEY \`idx_recalls_interaction_id\` (\`interaction_id\`),
        KEY \`idx_recalls_skill_usage_id\` (\`skill_usage_id\`),
        KEY \`idx_recalls_work_item_id\` (\`work_item_id\`),
        KEY \`idx_recalls_user_event_time\` (\`user_id\`, \`event_time\` DESC),
        KEY \`idx_recalls_relative_path\` (\`wiki_relative_path\`(255)),
        KEY \`idx_recalls_domain\` (\`wiki_domain\`),
        KEY \`idx_recalls_axis\` (\`wiki_axis\`),
        KEY \`idx_recalls_system\` (\`wiki_system\`),
        KEY \`idx_recalls_action_type\` (\`action_type\`),
        KEY \`idx_recalls_event_time\` (\`event_time\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    if (await tableExists(queryRunner, 'sdd_wiki_recalls')) {
      await queryRunner.query(`DROP TABLE \`sdd_wiki_recalls\``);
    }
  }
}

async function tableExists(qr: QueryRunner, t: string): Promise<boolean> {
  const rows = (await qr.query(
    `SELECT 1 FROM information_schema.tables WHERE table_schema=DATABASE() AND table_name=? LIMIT 1`,
    [t],
  )) as unknown[];
  return rows.length > 0;
}
```

- [ ] **Step 4.2: 写 entity**

```typescript
// server/src/infrastructure/mysql/entities/sdd-wiki-recall.entity.ts
import { Column, Entity, Index } from 'typeorm';
import { TimestampedEntity } from './common';

@Entity({ name: 'sdd_wiki_recalls' })
@Index('uk_recall_key', ['recallKey'], { unique: true })
@Index('idx_recalls_tool_call_id', ['toolCallId'])
@Index('idx_recalls_interaction_id', ['interactionId'])
@Index('idx_recalls_skill_usage_id', ['skillUsageId'])
@Index('idx_recalls_work_item_id', ['workItemId'])
@Index('idx_recalls_user_event_time', ['userId', 'eventTime'])
@Index('idx_recalls_relative_path', ['wikiRelativePath'])
@Index('idx_recalls_domain', ['wikiDomain'])
@Index('idx_recalls_axis', ['wikiAxis'])
@Index('idx_recalls_system', ['wikiSystem'])
@Index('idx_recalls_action_type', ['actionType'])
@Index('idx_recalls_event_time', ['eventTime'])
export class SddWikiRecallEntity extends TimestampedEntity {
  @Column({ name: 'recall_key', type: 'char', length: 64 })
  recallKey!: string;

  @Column({ name: 'tool_call_id', type: 'bigint', unsigned: true })
  toolCallId!: string;

  @Column({ name: 'interaction_id', type: 'bigint', unsigned: true })
  interactionId!: string;

  @Column({ name: 'skill_usage_id', type: 'bigint', unsigned: true, nullable: true })
  skillUsageId!: string | null;

  @Column({ name: 'work_item_id', type: 'bigint', unsigned: true, nullable: true })
  workItemId!: string | null;

  @Column({ name: 'user_id', type: 'bigint', unsigned: true, nullable: true })
  userId!: string | null;

  @Column({ name: 'action_type', type: 'varchar', length: 32 })
  actionType!: string;

  @Column({ name: 'raw_path', type: 'varchar', length: 2048 })
  rawPath!: string;

  @Column({ name: 'wiki_relative_path', type: 'varchar', length: 1024, nullable: true })
  wikiRelativePath!: string | null;

  @Column({ name: 'wiki_domain', type: 'varchar', length: 191, nullable: true })
  wikiDomain!: string | null;

  @Column({ name: 'wiki_axis', type: 'varchar', length: 64, nullable: true })
  wikiAxis!: string | null;

  @Column({ name: 'wiki_system', type: 'varchar', length: 191, nullable: true })
  wikiSystem!: string | null;

  @Column({ name: 'event_id', type: 'char', length: 64, nullable: true })
  eventId!: string | null;

  @Column({ name: 'event_sequence', type: 'int', unsigned: true, nullable: true })
  eventSequence!: number | null;

  @Column({ name: 'event_time', type: 'datetime', precision: 3, nullable: true })
  eventTime!: Date | null;

  @Column({ name: 'rule_version', type: 'varchar', length: 32 })
  ruleVersion!: string;
}
```

- [ ] **Step 4.3: 在 entities/index.ts 加导出**

```typescript
// server/src/infrastructure/mysql/entities/index.ts 末尾追加
export { SddWikiRecallEntity } from './sdd-wiki-recall.entity';
```

- [ ] **Step 4.4: 修改 reset-derived-data.ts，把新表加入清表列表**

打开文件，找到 derived table 清表列表（应该是个数组或 truncate 序列），在合适位置加 `'sdd_wiki_recalls'`。例如：

```typescript
// 在已有的 truncate 列表（如 sdd_skill_usages, sdd_errors, sdd_interaction_tool_calls 等）旁边
'sdd_wiki_recalls',
```

注意：清表顺序应在外键依赖之前（wiki_recalls 引用了 tool_calls/skill_usages/work_items，所以 wiki_recalls 应该**先**被清）。

- [ ] **Step 4.5: 修改 verify-schema.ts**

加入新表 + 新列校验，确保 `pnpm db:verify` 知道这两个新结构。具体改法：找到 expected tables / columns 列表，加入 `sdd_wiki_recalls` 与其字段名、以及 `sdd_interaction_tool_calls.skill_usage_id`。

- [ ] **Step 4.6: 跑 migration + verify**

```bash
pnpm db:migrate
pnpm db:verify
```

预期：两步都 PASS。

- [ ] **Step 4.7: typecheck + commit**

```bash
pnpm typecheck
git add server/src/infrastructure/mysql/migrations/1780000001000-create-wiki-recalls.ts \
        server/src/infrastructure/mysql/entities/sdd-wiki-recall.entity.ts \
        server/src/infrastructure/mysql/entities/index.ts \
        server/src/infrastructure/mysql/reset-derived-data.ts \
        server/src/infrastructure/mysql/verify-schema.ts
git commit -m "$(cat <<'EOF'
新增 sdd_wiki_recalls 派生表

物化 domain / axis / system 三个稳定维度做索引加速；wiki_relative_path 为
source of truth。reset-derived-data 与 verify-schema 同步更新。

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: 实现 `parseWikiPath` 与 `extractCandidatePath`

**Files:**
- Create: `worker/src/jobs/wiki-path.ts`
- Create: `worker/test/wiki-path.test.ts`

- [ ] **Step 5.1: 写测试（TDD）**

```typescript
// worker/test/wiki-path.test.ts
import { describe, expect, it } from 'vitest';
import { parseWikiPath, extractCandidatePath } from '../src/jobs/wiki-path';

describe('parseWikiPath', () => {
  const wikiRoot = '/Users/loomis/wiki';

  it('解析完整 system 路径', () => {
    const r = parseWikiPath(wikiRoot, '/Users/loomis/wiki/domain-cashier/system/apps/bk-cashier-sdk/core.md');
    expect(r).toEqual({
      relative: 'domain-cashier/system/apps/bk-cashier-sdk/core.md',
      domain: 'cashier',
      axis: 'system',
      system: 'bk-cashier-sdk',
    });
  });

  it('解析 business/pages 路径', () => {
    const r = parseWikiPath(wikiRoot, '/Users/loomis/wiki/domain-cashier/business/pages/sign-flow.md');
    expect(r).toEqual({
      relative: 'domain-cashier/business/pages/sign-flow.md',
      domain: 'cashier',
      axis: 'business',
      system: null,
    });
  });

  it('解析根目录文件', () => {
    const r = parseWikiPath(wikiRoot, '/Users/loomis/wiki/SUMMARY.md');
    expect(r).toEqual({
      relative: 'SUMMARY.md',
      domain: null,
      axis: 'root',
      system: null,
    });
  });

  it('路径不在 wiki 下时全部 null', () => {
    expect(parseWikiPath(wikiRoot, '/elsewhere/foo.md')).toEqual({
      relative: null, domain: null, axis: null, system: null,
    });
  });

  it('domain 目录但首段不是 domain- 前缀', () => {
    const r = parseWikiPath(wikiRoot, '/Users/loomis/wiki/scratch/x.md');
    expect(r.domain).toBeNull();
    expect(r.axis).toBe('root');
  });

  it('axis=system 但无 apps/ 二级目录', () => {
    const r = parseWikiPath(wikiRoot, '/Users/loomis/wiki/domain-cashier/system/README.md');
    expect(r).toEqual({
      relative: 'domain-cashier/system/README.md',
      domain: 'cashier',
      axis: 'system',
      system: null,
    });
  });

  it('wiki_root 尾部带 /', () => {
    expect(parseWikiPath('/Users/loomis/wiki/', '/Users/loomis/wiki/domain-x/data/m.md')).toEqual({
      relative: 'domain-x/data/m.md',
      domain: 'x',
      axis: 'data',
      system: null,
    });
  });

  it('含 ../ 段（应被 normalize）', () => {
    const r = parseWikiPath(wikiRoot, '/Users/loomis/wiki/domain-cashier/../domain-cashier/data/m.md');
    expect(r.relative).toBe('domain-cashier/data/m.md');
  });
});

describe('extractCandidatePath', () => {
  it('Read 工具取 file_path', () => {
    expect(extractCandidatePath('Read', { file_path: '/x/y.md' })).toEqual({
      actionType: 'read', candidate: '/x/y.md',
    });
  });

  it('Glob 工具优先取 path 再取 pattern', () => {
    expect(extractCandidatePath('Glob', { path: '/root', pattern: '*.md' })).toEqual({
      actionType: 'glob', candidate: '/root',
    });
    expect(extractCandidatePath('Glob', { pattern: '**/*.md' })).toEqual({
      actionType: 'glob', candidate: '**/*.md',
    });
  });

  it('Grep 工具取 path 或 glob', () => {
    expect(extractCandidatePath('Grep', { path: '/root', pattern: 'foo' })).toEqual({
      actionType: 'grep', candidate: '/root',
    });
    expect(extractCandidatePath('Grep', { glob: '*.md', pattern: 'foo' })).toEqual({
      actionType: 'grep', candidate: '*.md',
    });
  });

  it('未知 tool 返回 null', () => {
    expect(extractCandidatePath('Bash', { command: 'ls' })).toBeNull();
  });

  it('Read 缺失 file_path 返回 null', () => {
    expect(extractCandidatePath('Read', {})).toBeNull();
  });

  it('Read 但是相对路径不算 candidate（spec 4.7 边界）', () => {
    expect(extractCandidatePath('Read', { file_path: 'rel/x.md' })).toBeNull();
  });
});
```

- [ ] **Step 5.2: 跑测试确认全部 FAIL**

```bash
pnpm --filter @sdd-telemetry/worker test wiki-path
```

预期：FAIL（模块未找到）

- [ ] **Step 5.3: 实现 `wiki-path.ts`**

```typescript
// worker/src/jobs/wiki-path.ts
import path from 'node:path';

export interface ParsedWikiPath {
  relative: string | null;
  domain: string | null;
  axis: string | null;
  system: string | null;
}

export function parseWikiPath(wikiRootPath: string, rawPath: string): ParsedWikiPath {
  const normalizedRoot = wikiRootPath.replace(/\/+$/, '');
  const normalizedPath = path.posix.normalize(rawPath);

  if (
    !normalizedPath.startsWith(normalizedRoot + '/') &&
    normalizedPath !== normalizedRoot
  ) {
    return { relative: null, domain: null, axis: null, system: null };
  }

  const relative = normalizedPath
    .slice(normalizedRoot.length)
    .replace(/^\/+/, '');
  if (relative === '') {
    return { relative: '', domain: null, axis: 'root', system: null };
  }

  const segments = relative.split('/');

  // L1: domain
  if (!segments[0]?.startsWith('domain-')) {
    return { relative, domain: null, axis: 'root', system: null };
  }
  const domain = segments[0].slice('domain-'.length);

  // L2: axis
  const axis = segments[1] ?? null;

  // L3: system（仅 axis=system 且第三段为 apps）
  let system: string | null = null;
  if (axis === 'system' && segments[2] === 'apps') {
    system = segments[3] ?? null;
  }

  return { relative, domain, axis, system };
}

export interface CandidatePath {
  actionType: 'read' | 'glob' | 'grep';
  candidate: string;
}

interface ToolInput {
  file_path?: string;
  path?: string;
  pattern?: string;
  glob?: string;
}

export function extractCandidatePath(
  toolName: string,
  input: ToolInput,
): CandidatePath | null {
  switch (toolName) {
    case 'Read': {
      const fp = input.file_path;
      if (!fp || !fp.startsWith('/')) return null;  // 必须绝对路径
      return { actionType: 'read', candidate: fp };
    }
    case 'Glob': {
      const c = input.path ?? input.pattern;
      if (!c) return null;
      return { actionType: 'glob', candidate: c };
    }
    case 'Grep': {
      const c = input.path ?? input.glob;
      if (!c) return null;
      return { actionType: 'grep', candidate: c };
    }
    default:
      return null;
  }
}
```

- [ ] **Step 5.4: 跑测试确认 PASS**

```bash
pnpm --filter @sdd-telemetry/worker test wiki-path
```

预期：所有 case PASS。

- [ ] **Step 5.5: commit**

```bash
git add worker/src/jobs/wiki-path.ts worker/test/wiki-path.test.ts
git commit -m "$(cat <<'EOF'
新增 parseWikiPath 与 extractCandidatePath 路径解析工具

支持 Read/Glob/Grep 三种工具的 tool_input 入参；wiki 路径解析三层
(domain/axis/system)，容错任意一段失败。

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: 实现 `upsertWikiRecalls` step

**Files:**
- Modify: `worker/src/jobs/cleaning.repository.ts`
- Modify: `worker/src/jobs/cleaning-worker.ts`
- Create: `worker/test/integration/wiki-recall-cleaning.test.ts`

- [ ] **Step 6.1: 加 repository 写入方法**

在 `cleaning.repository.ts` 末尾追加：

```typescript
export interface UpsertWikiRecallInput {
  recallKey: string;
  toolCallId: string;
  interactionId: string;
  skillUsageId: string | null;
  workItemId: string | null;
  userId: string | null;
  actionType: string;
  rawPath: string;
  wikiRelativePath: string | null;
  wikiDomain: string | null;
  wikiAxis: string | null;
  wikiSystem: string | null;
  eventId: string | null;
  eventSequence: number | null;
  eventTime: Date | null;
  ruleVersion: string;
}

async upsertWikiRecall(
  connection: PoolConnection,
  input: UpsertWikiRecallInput,
): Promise<void> {
  await connection.query<ResultSetHeader>(
    `INSERT INTO sdd_wiki_recalls
      (recall_key, tool_call_id, interaction_id, skill_usage_id, work_item_id, user_id,
       action_type, raw_path, wiki_relative_path, wiki_domain, wiki_axis, wiki_system,
       event_id, event_sequence, event_time, rule_version, gmt_create, gmt_modified)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3))
     ON DUPLICATE KEY UPDATE
       skill_usage_id = COALESCE(VALUES(skill_usage_id), skill_usage_id),
       work_item_id = COALESCE(VALUES(work_item_id), work_item_id),
       user_id = COALESCE(VALUES(user_id), user_id),
       action_type = VALUES(action_type),
       wiki_relative_path = VALUES(wiki_relative_path),
       wiki_domain = VALUES(wiki_domain),
       wiki_axis = VALUES(wiki_axis),
       wiki_system = VALUES(wiki_system),
       event_id = COALESCE(VALUES(event_id), event_id),
       event_sequence = COALESCE(VALUES(event_sequence), event_sequence),
       event_time = COALESCE(VALUES(event_time), event_time),
       rule_version = VALUES(rule_version),
       gmt_modified = CURRENT_TIMESTAMP(3)`,
    [
      input.recallKey, input.toolCallId, input.interactionId, input.skillUsageId,
      input.workItemId, input.userId, input.actionType, input.rawPath,
      input.wikiRelativePath, input.wikiDomain, input.wikiAxis, input.wikiSystem,
      input.eventId, input.eventSequence, input.eventTime, input.ruleVersion,
    ],
  );
}

async loadUserWikiRoots(connection: PoolConnection): Promise<Map<string, string>> {
  const [rows] = await connection.query<RowDataPacket[]>(
    `SELECT id, wiki_root_path FROM sdd_users WHERE wiki_root_path IS NOT NULL`,
  );
  const m = new Map<string, string>();
  for (const r of rows as Array<{ id: string; wiki_root_path: string }>) {
    m.set(r.id, r.wiki_root_path);
  }
  return m;
}

async listToolCallsForWikiRecalls(
  connection: PoolConnection,
  interactionIds: string[],
): Promise<Array<{
  id: string;
  interactionId: string;
  skillUsageId: string | null;
  toolName: string;
  toolInputPreview: string | null;
  sequence: number | null;
}>> {
  if (interactionIds.length === 0) return [];
  const [rows] = await connection.query<RowDataPacket[]>(
    `SELECT id, interaction_id AS interactionId, skill_usage_id AS skillUsageId,
            tool_name AS toolName, tool_input_preview AS toolInputPreview, sequence
     FROM sdd_interaction_tool_calls
     WHERE interaction_id IN (?)`,
    [interactionIds],
  );
  return rows as Array<{
    id: string; interactionId: string; skillUsageId: string | null;
    toolName: string; toolInputPreview: string | null; sequence: number | null;
  }>;
}

async getWorkItemIdBySkillUsage(
  connection: PoolConnection,
  skillUsageId: string,
): Promise<string | null> {
  const [rows] = await connection.query<RowDataPacket[]>(
    `SELECT work_item_id FROM sdd_skill_usages WHERE id = ?`,
    [skillUsageId],
  );
  const r = (rows as Array<{ work_item_id: string | null }>)[0];
  return r?.work_item_id ?? null;
}
```

- [ ] **Step 6.2: 在 cleaning-worker.ts 实现 `upsertWikiRecalls` step**

在 `cleaning-worker.ts` 顶部 import：

```typescript
import { createHash } from 'node:crypto';
import { parseWikiPath, extractCandidatePath } from './wiki-path';
```

在 cleanBatch 末尾追加（在 upsertErrors 调用之后）：

```typescript
const wikiRecallCount = await upsertWikiRecalls(connection, interactions, scopedEvents, input.logger);
// ...
return interactions.size + toolCalls + usages + errors + artifacts + toolCallAttachments + wikiRecallCount;
```

实现：

```typescript
const WIKI_RECALL_ENABLED = process.env.WIKI_RECALL_ENABLED !== '0';
const WIKI_RECALL_RULE_VERSION = 'wiki_recall_v1';

async function upsertWikiRecalls(
  connection: PoolConnection,
  interactions: Map<string, InteractionRef>,
  events: EventRow[],
  logger: Logger,
): Promise<number> {
  if (!WIKI_RECALL_ENABLED) return 0;

  const userWikiRoots = await cleaningRepository.loadUserWikiRoots(connection);
  if (userWikiRoots.size === 0) return 0;

  const interactionIds = Array.from(interactions.values()).map((i) => i.id);
  const toolCalls = await cleaningRepository.listToolCallsForWikiRecalls(connection, interactionIds);

  // 构造 interaction → user_id 映射（从 events 反查；interactions ref 里已有 userId 取那个）
  const interactionToUser = new Map<string, string | null>();
  for (const event of events) {
    if (event.user_id) {
      // events 都带 user_id；用第一个出现的
      // (任何一个本 interaction 下的 event 的 user_id 都一致)
    }
  }
  // 简单起见，从 sdd_interactions 表读：
  const interactionUserRows = await connection.query<RowDataPacket[]>(
    `SELECT id, user_id FROM sdd_interactions WHERE id IN (?)`,
    [interactionIds.length === 0 ? ['0'] : interactionIds],
  );
  for (const r of (interactionUserRows[0] as Array<{ id: string; user_id: string | null }>)) {
    interactionToUser.set(r.id, r.user_id);
  }

  // events 按 eventId 索引，便于回填 event_time / event_sequence
  const eventById = new Map<string, EventRow>();
  for (const e of events) eventById.set(e.event_id, e);

  let inserted = 0;
  let hits = 0;
  let parseFailedPartial = 0;
  let skippedInputParseError = 0;
  let skippedWikiRootMissing = 0;

  for (const tc of toolCalls) {
    const userId = interactionToUser.get(tc.interactionId) ?? null;
    if (!userId) continue;
    const wikiRoot = userWikiRoots.get(userId);
    if (!wikiRoot) {
      skippedWikiRootMissing += 1;
      continue;
    }

    let input: unknown;
    try {
      input = tc.toolInputPreview ? JSON.parse(tc.toolInputPreview) : {};
    } catch {
      skippedInputParseError += 1;
      logger.warn({ toolCallId: tc.id }, 'wiki-recall: tool_input_preview JSON parse failed');
      continue;
    }

    const candidate = extractCandidatePath(tc.toolName, (input ?? {}) as Record<string, string>);
    if (!candidate) continue;

    if (!candidate.candidate.startsWith(wikiRoot) && candidate.candidate !== wikiRoot) continue;
    hits += 1;

    const parsed = parseWikiPath(wikiRoot, candidate.candidate);
    if (candidate.actionType === 'read' && !parsed.relative) {
      parseFailedPartial += 1;
    }

    const workItemId = tc.skillUsageId
      ? await cleaningRepository.getWorkItemIdBySkillUsage(connection, tc.skillUsageId)
      : null;

    const recallKey = createHash('sha256').update(`${tc.id}:${candidate.candidate}`).digest('hex');

    await cleaningRepository.upsertWikiRecall(connection, {
      recallKey,
      toolCallId: tc.id,
      interactionId: tc.interactionId,
      skillUsageId: tc.skillUsageId,
      workItemId,
      userId,
      actionType: candidate.actionType,
      rawPath: candidate.candidate,
      wikiRelativePath: parsed.relative,
      wikiDomain: parsed.domain,
      wikiAxis: parsed.axis,
      wikiSystem: parsed.system,
      eventId: null,           // tool_call 已聚合多 events；保持 null
      eventSequence: tc.sequence,
      eventTime: null,         // P0 不回填精确 event_time；后续按需补
      ruleVersion: WIKI_RECALL_RULE_VERSION,
    });
    inserted += 1;
  }

  logger.info(
    {
      candidateToolCalls: toolCalls.length,
      wikiHits: hits,
      inserted,
      parseFailedPartial,
      skippedWikiRootMissing,
      skippedInputParseError,
    },
    'wiki-recall: batch processed',
  );

  return inserted;
}
```

> 注：`event_time` 暂用 NULL；如需精确时间，后续从 `otel_log_events` 按 tool_call 的 `evidence_json.toolResultEventId` 反查（incremental，不在本 plan）。

- [ ] **Step 6.3: 跑 typecheck**

```bash
pnpm typecheck
```

预期：通过。

- [ ] **Step 6.4: 集成测试**

```typescript
// worker/test/integration/wiki-recall-cleaning.test.ts
import { describe, expect, it } from 'vitest';
import { parseWikiPath, extractCandidatePath } from '../../src/jobs/wiki-path';

// 端到端跑一遍真实数据形态——只测 path 解析 → wiki recall 字段映射的 invariant
// （完整 cleanBatch 集成依赖 mysql，复用现有 interaction-fidelity.test 套路）

describe('wiki-recall 端到端字段映射', () => {
  it('从 Read tool_input 到 wiki_recall 行的完整解析', () => {
    const wikiRoot = '/Users/u/wiki';
    const input = { file_path: '/Users/u/wiki/domain-cashier/system/apps/bk-cashier-sdk/core.md' };
    const candidate = extractCandidatePath('Read', input);
    expect(candidate).not.toBeNull();
    const parsed = parseWikiPath(wikiRoot, candidate!.candidate);
    expect(parsed).toEqual({
      relative: 'domain-cashier/system/apps/bk-cashier-sdk/core.md',
      domain: 'cashier',
      axis: 'system',
      system: 'bk-cashier-sdk',
    });
  });
});
```

跑：

```bash
pnpm --filter @sdd-telemetry/worker test wiki-recall
```

预期：PASS。

- [ ] **Step 6.5: smoke test 跑 worker once**

```bash
pnpm build
pnpm --filter @sdd-telemetry/worker once
```

预期：日志出现 `wiki-recall: batch processed`，包含合理的 stat 数字（如果本地有真实数据）。然后查 DB：

```sql
SELECT COUNT(*) FROM sdd_wiki_recalls;
SELECT wiki_domain, COUNT(*) FROM sdd_wiki_recalls GROUP BY wiki_domain;
```

- [ ] **Step 6.6: commit**

```bash
git add worker/src/jobs/cleaning.repository.ts \
        worker/src/jobs/cleaning-worker.ts \
        worker/test/integration/wiki-recall-cleaning.test.ts
git commit -m "$(cat <<'EOF'
新增 upsertWikiRecalls 清洗 step

按 wiki_root_path 前缀匹配识别召回；归属 skill_usage_id + work_item_id；
4 维 wiki 字段解析容错；env WIKI_RECALL_ENABLED=0 可软关闭。

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: 定义 Zod contract

**Files:**
- Modify: `packages/api/src/contracts/sdd.contract.ts`

- [ ] **Step 7.1: 在 sdd.contract.ts 末尾追加 wiki recall schemas**

```typescript
// 文件末尾追加，先确认顶部已经 import { z } from 'zod'
export const WikiRecallRangeSchema = z.enum(['7d', '30d', '90d', 'all']);
export type WikiRecallRange = z.infer<typeof WikiRecallRangeSchema>;

export const WikiRecallUserRankingItemSchema = z.object({
  userId: z.string(),
  userName: z.string().nullable(),
  hasWikiRootPath: z.boolean(),
  totalRecalls: z.number(),
  distinctFiles: z.number(),
  distinctDomains: z.number(),
  distinctSystems: z.number(),
  lastRecallAt: z.string().nullable(),
});
export type WikiRecallUserRankingItem = z.infer<typeof WikiRecallUserRankingItemSchema>;

export const WikiRecallUserRankingResponseSchema = z.object({
  items: z.array(WikiRecallUserRankingItemSchema),
  total: z.number(),
});
export type WikiRecallUserRankingResponse = z.infer<typeof WikiRecallUserRankingResponseSchema>;

export const WikiRecallWorkItemRankingItemSchema = z.object({
  workItemId: z.string(),
  workItemSlug: z.string(),
  businessDomain: z.string().nullable(),
  totalRecalls: z.number(),
  distinctDomains: z.number(),
  distinctSystems: z.number(),
  userCount: z.number(),
});
export type WikiRecallWorkItemRankingItem = z.infer<typeof WikiRecallWorkItemRankingItemSchema>;

export const WikiRecallWorkItemRankingResponseSchema = z.object({
  items: z.array(WikiRecallWorkItemRankingItemSchema),
  total: z.number(),
});
export type WikiRecallWorkItemRankingResponse = z.infer<typeof WikiRecallWorkItemRankingResponseSchema>;

export const WikiRecallHeatmapBucketSchema = z.object({
  key: z.string(),                 // domain / axis 值 / system 名
  totalRecalls: z.number(),
  distinctUsers: z.number(),
});
export const WikiRecallHeatmapResponseSchema = z.object({
  buckets: z.array(WikiRecallHeatmapBucketSchema),
});
export type WikiRecallHeatmapResponse = z.infer<typeof WikiRecallHeatmapResponseSchema>;

export const WikiRecallTimelinePointSchema = z.object({
  t: z.string(),                   // ISO datetime, hour 或 day 截断
  group: z.string().nullable(),
  count: z.number(),
});
export const WikiRecallTimelineResponseSchema = z.object({
  points: z.array(WikiRecallTimelinePointSchema),
});
export type WikiRecallTimelineResponse = z.infer<typeof WikiRecallTimelineResponseSchema>;

export const WikiRecallRowSchema = z.object({
  id: z.string(),
  toolCallId: z.string(),
  interactionId: z.string(),
  skillUsageId: z.string().nullable(),
  workItemId: z.string().nullable(),
  userId: z.string().nullable(),
  userName: z.string().nullable(),
  actionType: z.string(),
  rawPath: z.string(),
  wikiRelativePath: z.string().nullable(),
  wikiDomain: z.string().nullable(),
  wikiAxis: z.string().nullable(),
  wikiSystem: z.string().nullable(),
  eventSequence: z.number().nullable(),
  eventTime: z.string().nullable(),
});
export type WikiRecallRow = z.infer<typeof WikiRecallRowSchema>;

export const WikiRecallListResponseSchema = z.object({
  items: z.array(WikiRecallRowSchema),
  total: z.number(),
});
export type WikiRecallListResponse = z.infer<typeof WikiRecallListResponseSchema>;
```

- [ ] **Step 7.2: 跑 typecheck + commit**

```bash
pnpm typecheck
git add packages/api/src/contracts/sdd.contract.ts
git commit -m "$(cat <<'EOF'
新增 wiki 召回 API Zod schemas

5 个核心端点 + 1 个明细行 schema；range = 7d/30d/90d/all。
EOF
)"
```

---

## Task 8: server repository — 查询 SQL

**Files:**
- Modify: `server/src/modules/sdd/sdd-query.repository.ts`

- [ ] **Step 8.1: 加 5 个查询方法**

在文件末尾（class 内部）追加：

```typescript
async listWikiRecallUserRanking(
  rangeSinceDate: Date | null,
  sortBy: 'total' | 'distinct_files' | 'recent',
  limit: number,
  offset: number,
): Promise<{ items: WikiRecallUserRankingRow[]; total: number }> {
  const ds = await this.mysqlDataSourceManager.getDataSource();
  const whereTime = rangeSinceDate ? 'AND wr.event_time >= ?' : '';
  const params = rangeSinceDate ? [rangeSinceDate] : [];

  const orderBy =
    sortBy === 'distinct_files'
      ? 'distinctFiles DESC'
      : sortBy === 'recent'
      ? 'lastRecallAt DESC'
      : 'totalRecalls DESC';

  const items = (await ds.query(
    `SELECT u.id AS userId, u.user_name AS userName,
            (u.wiki_root_path IS NOT NULL) AS hasWikiRootPath,
            COUNT(wr.id) AS totalRecalls,
            COUNT(DISTINCT CASE WHEN wr.action_type='read' THEN wr.wiki_relative_path END) AS distinctFiles,
            COUNT(DISTINCT wr.wiki_domain) AS distinctDomains,
            COUNT(DISTINCT wr.wiki_system) AS distinctSystems,
            MAX(wr.event_time) AS lastRecallAt
     FROM sdd_users u
     LEFT JOIN sdd_wiki_recalls wr ON wr.user_id = u.id ${whereTime}
     GROUP BY u.id
     HAVING totalRecalls > 0
     ORDER BY ${orderBy}
     LIMIT ? OFFSET ?`,
    [...params, limit, offset],
  )) as WikiRecallUserRankingRow[];

  const totalRows = (await ds.query(
    `SELECT COUNT(DISTINCT wr.user_id) AS total
     FROM sdd_wiki_recalls wr
     WHERE wr.user_id IS NOT NULL ${whereTime}`,
    params,
  )) as Array<{ total: number }>;

  return { items, total: totalRows[0]?.total ?? 0 };
}

async listWikiRecallWorkItemRanking(
  rangeSinceDate: Date | null,
  businessDomain: string | null,
  userId: string | null,
  limit: number,
  offset: number,
): Promise<{ items: WikiRecallWorkItemRankingRow[]; total: number }> {
  const ds = await this.mysqlDataSourceManager.getDataSource();
  const clauses: string[] = ['wr.work_item_id IS NOT NULL'];
  const params: unknown[] = [];
  if (rangeSinceDate) { clauses.push('wr.event_time >= ?'); params.push(rangeSinceDate); }
  if (businessDomain) { clauses.push('wi.business_domain = ?'); params.push(businessDomain); }
  if (userId) { clauses.push('wr.user_id = ?'); params.push(userId); }
  const where = clauses.join(' AND ');

  const items = (await ds.query(
    `SELECT wi.id AS workItemId, wi.work_item_slug AS workItemSlug,
            wi.business_domain AS businessDomain,
            COUNT(wr.id) AS totalRecalls,
            COUNT(DISTINCT wr.wiki_domain) AS distinctDomains,
            COUNT(DISTINCT wr.wiki_system) AS distinctSystems,
            COUNT(DISTINCT wr.user_id) AS userCount
     FROM sdd_wiki_recalls wr
     JOIN sdd_work_items wi ON wi.id = wr.work_item_id
     WHERE ${where}
     GROUP BY wi.id
     ORDER BY totalRecalls DESC
     LIMIT ? OFFSET ?`,
    [...params, limit, offset],
  )) as WikiRecallWorkItemRankingRow[];

  const totalRows = (await ds.query(
    `SELECT COUNT(DISTINCT wr.work_item_id) AS total
     FROM sdd_wiki_recalls wr
     JOIN sdd_work_items wi ON wi.id = wr.work_item_id
     WHERE ${where}`,
    params,
  )) as Array<{ total: number }>;

  return { items, total: totalRows[0]?.total ?? 0 };
}

async wikiRecallHeatmap(
  rangeSinceDate: Date | null,
  groupBy: 'domain' | 'axis' | 'system',
): Promise<WikiRecallHeatmapBucketRow[]> {
  const col = groupBy === 'domain' ? 'wiki_domain' : groupBy === 'axis' ? 'wiki_axis' : 'wiki_system';
  const whereTime = rangeSinceDate ? 'AND event_time >= ?' : '';
  const params = rangeSinceDate ? [rangeSinceDate] : [];

  return (await (await this.mysqlDataSourceManager.getDataSource()).query(
    `SELECT ${col} AS \`key\`,
            COUNT(*) AS totalRecalls,
            COUNT(DISTINCT user_id) AS distinctUsers
     FROM sdd_wiki_recalls
     WHERE action_type = 'read' AND ${col} IS NOT NULL ${whereTime}
     GROUP BY ${col}
     ORDER BY totalRecalls DESC
     LIMIT 50`,
    params,
  )) as WikiRecallHeatmapBucketRow[];
}

async wikiRecallTimeline(
  rangeSinceDate: Date | null,
  granularity: 'day' | 'hour',
  groupBy: 'domain' | 'axis',
): Promise<WikiRecallTimelinePointRow[]> {
  const dateFormat =
    granularity === 'day'
      ? "DATE_FORMAT(event_time, '%Y-%m-%dT00:00:00.000Z')"
      : "DATE_FORMAT(event_time, '%Y-%m-%dT%H:00:00.000Z')";
  const col = groupBy === 'domain' ? 'wiki_domain' : 'wiki_axis';
  const whereTime = rangeSinceDate ? 'AND event_time >= ?' : '';
  const params = rangeSinceDate ? [rangeSinceDate] : [];

  return (await (await this.mysqlDataSourceManager.getDataSource()).query(
    `SELECT ${dateFormat} AS t, ${col} AS \`group\`, COUNT(*) AS count
     FROM sdd_wiki_recalls
     WHERE event_time IS NOT NULL ${whereTime}
     GROUP BY t, \`group\`
     ORDER BY t ASC`,
    params,
  )) as WikiRecallTimelinePointRow[];
}

async listWikiRecalls(
  filters: { workItemId?: string; userId?: string; skillUsageId?: string },
  rangeSinceDate: Date | null,
  limit: number,
  offset: number,
): Promise<{ items: WikiRecallListRow[]; total: number }> {
  const clauses: string[] = [];
  const params: unknown[] = [];
  if (filters.workItemId) { clauses.push('wr.work_item_id = ?'); params.push(filters.workItemId); }
  if (filters.userId) { clauses.push('wr.user_id = ?'); params.push(filters.userId); }
  if (filters.skillUsageId) { clauses.push('wr.skill_usage_id = ?'); params.push(filters.skillUsageId); }
  if (rangeSinceDate) { clauses.push('wr.event_time >= ?'); params.push(rangeSinceDate); }
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';

  const ds = await this.mysqlDataSourceManager.getDataSource();

  const items = (await ds.query(
    `SELECT wr.id, wr.tool_call_id AS toolCallId, wr.interaction_id AS interactionId,
            wr.skill_usage_id AS skillUsageId, wr.work_item_id AS workItemId,
            wr.user_id AS userId, u.user_name AS userName, wr.action_type AS actionType,
            wr.raw_path AS rawPath, wr.wiki_relative_path AS wikiRelativePath,
            wr.wiki_domain AS wikiDomain, wr.wiki_axis AS wikiAxis, wr.wiki_system AS wikiSystem,
            wr.event_sequence AS eventSequence, wr.event_time AS eventTime
     FROM sdd_wiki_recalls wr
     LEFT JOIN sdd_users u ON u.id = wr.user_id
     ${where}
     ORDER BY wr.id DESC
     LIMIT ? OFFSET ?`,
    [...params, limit, offset],
  )) as WikiRecallListRow[];

  const totalRows = (await ds.query(
    `SELECT COUNT(*) AS total FROM sdd_wiki_recalls wr ${where}`,
    params,
  )) as Array<{ total: number }>;

  return { items, total: totalRows[0]?.total ?? 0 };
}
```

加对应的 row type 定义到文件顶部（与现有 row type 同位置）：

```typescript
export interface WikiRecallUserRankingRow {
  userId: string; userName: string | null; hasWikiRootPath: number;
  totalRecalls: number; distinctFiles: number;
  distinctDomains: number; distinctSystems: number; lastRecallAt: Date | null;
}
export interface WikiRecallWorkItemRankingRow {
  workItemId: string; workItemSlug: string; businessDomain: string | null;
  totalRecalls: number; distinctDomains: number; distinctSystems: number; userCount: number;
}
export interface WikiRecallHeatmapBucketRow {
  key: string; totalRecalls: number; distinctUsers: number;
}
export interface WikiRecallTimelinePointRow {
  t: string; group: string | null; count: number;
}
export interface WikiRecallListRow {
  id: string; toolCallId: string; interactionId: string;
  skillUsageId: string | null; workItemId: string | null;
  userId: string | null; userName: string | null;
  actionType: string; rawPath: string; wikiRelativePath: string | null;
  wikiDomain: string | null; wikiAxis: string | null; wikiSystem: string | null;
  eventSequence: number | null; eventTime: Date | null;
}
```

- [ ] **Step 8.2: typecheck + commit**

```bash
pnpm typecheck
git add server/src/modules/sdd/sdd-query.repository.ts
git commit -m "$(cat <<'EOF'
新增 wiki 召回相关 5 个 repository 查询方法

覆盖用户排行 / 需求下钻 / wiki 热度榜 / 时间线 / 明细列表。
EOF
)"
```

---

## Task 9: server service + controller

**Files:**
- Modify: `server/src/modules/sdd/sdd-query.service.ts`
- Modify: `server/src/modules/sdd/sdd.controller.ts`

- [ ] **Step 9.1: 加 service 方法**

在 `sdd-query.service.ts` class 内部追加 5 个对应方法，把 repository 的 raw row 映射成 contract 类型（处理 Date → ISO string、boolean 转换等）：

```typescript
async getWikiRecallUserRanking(
  range: WikiRecallRange,
  sortBy: 'total' | 'distinct_files' | 'recent',
  page = 1,
  pageSize = 50,
): Promise<WikiRecallUserRankingResponse> {
  const since = rangeToSinceDate(range);
  const { items, total } = await this.repo.listWikiRecallUserRanking(
    since, sortBy, pageSize, (page - 1) * pageSize,
  );
  return {
    items: items.map((r) => ({
      userId: r.userId,
      userName: r.userName,
      hasWikiRootPath: Boolean(r.hasWikiRootPath),
      totalRecalls: Number(r.totalRecalls),
      distinctFiles: Number(r.distinctFiles),
      distinctDomains: Number(r.distinctDomains),
      distinctSystems: Number(r.distinctSystems),
      lastRecallAt: r.lastRecallAt ? r.lastRecallAt.toISOString() : null,
    })),
    total: Number(total),
  };
}

async getWikiRecallWorkItemRanking(
  range: WikiRecallRange,
  businessDomain: string | null,
  userId: string | null,
  page = 1, pageSize = 50,
): Promise<WikiRecallWorkItemRankingResponse> {
  const since = rangeToSinceDate(range);
  const { items, total } = await this.repo.listWikiRecallWorkItemRanking(
    since, businessDomain, userId, pageSize, (page - 1) * pageSize,
  );
  return {
    items: items.map((r) => ({
      workItemId: r.workItemId,
      workItemSlug: r.workItemSlug,
      businessDomain: r.businessDomain,
      totalRecalls: Number(r.totalRecalls),
      distinctDomains: Number(r.distinctDomains),
      distinctSystems: Number(r.distinctSystems),
      userCount: Number(r.userCount),
    })),
    total: Number(total),
  };
}

async getWikiRecallHeatmap(
  range: WikiRecallRange,
  groupBy: 'domain' | 'axis' | 'system',
): Promise<WikiRecallHeatmapResponse> {
  const since = rangeToSinceDate(range);
  const buckets = await this.repo.wikiRecallHeatmap(since, groupBy);
  return {
    buckets: buckets.map((b) => ({
      key: b.key, totalRecalls: Number(b.totalRecalls), distinctUsers: Number(b.distinctUsers),
    })),
  };
}

async getWikiRecallTimeline(
  range: WikiRecallRange,
  granularity: 'day' | 'hour',
  groupBy: 'domain' | 'axis',
): Promise<WikiRecallTimelineResponse> {
  const since = rangeToSinceDate(range);
  const points = await this.repo.wikiRecallTimeline(since, granularity, groupBy);
  return {
    points: points.map((p) => ({
      t: p.t, group: p.group, count: Number(p.count),
    })),
  };
}

async listWikiRecalls(
  range: WikiRecallRange,
  filters: { workItemId?: string; userId?: string; skillUsageId?: string },
  page = 1, pageSize = 50,
): Promise<WikiRecallListResponse> {
  const since = rangeToSinceDate(range);
  const { items, total } = await this.repo.listWikiRecalls(
    filters, since, pageSize, (page - 1) * pageSize,
  );
  return {
    items: items.map((r) => ({
      id: r.id,
      toolCallId: r.toolCallId,
      interactionId: r.interactionId,
      skillUsageId: r.skillUsageId,
      workItemId: r.workItemId,
      userId: r.userId,
      userName: r.userName,
      actionType: r.actionType,
      rawPath: r.rawPath,
      wikiRelativePath: r.wikiRelativePath,
      wikiDomain: r.wikiDomain,
      wikiAxis: r.wikiAxis,
      wikiSystem: r.wikiSystem,
      eventSequence: r.eventSequence,
      eventTime: r.eventTime ? r.eventTime.toISOString() : null,
    })),
    total: Number(total),
  };
}
```

`rangeToSinceDate` 工具函数（如果文件内已经存在类似的就复用；否则在 service 同文件加）：

```typescript
function rangeToSinceDate(range: WikiRecallRange): Date | null {
  if (range === 'all') return null;
  const now = Date.now();
  const map: Record<Exclude<WikiRecallRange, 'all'>, number> = {
    '7d': 7, '30d': 30, '90d': 90,
  };
  return new Date(now - map[range] * 24 * 60 * 60 * 1000);
}
```

- [ ] **Step 9.2: 加 controller 路由**

在 `sdd.controller.ts` 中追加路由（参考已有路由的写法 + `@Get` + `@Query` 装饰器 + Zod parse）：

```typescript
@Get('/wiki-recalls/users')
async wikiRecallUserRanking(
  @Query('range') range: string,
  @Query('sortBy') sortBy: string,
  @Query('page') page?: string,
  @Query('pageSize') pageSize?: string,
): Promise<WikiRecallUserRankingResponse> {
  const r = WikiRecallRangeSchema.parse(range ?? '30d');
  const s = (['total', 'distinct_files', 'recent'].includes(sortBy) ? sortBy : 'total') as
    'total' | 'distinct_files' | 'recent';
  return this.service.getWikiRecallUserRanking(
    r, s,
    page ? Math.max(1, Number(page)) : 1,
    pageSize ? Math.min(200, Math.max(1, Number(pageSize))) : 50,
  );
}

@Get('/wiki-recalls/work-items')
async wikiRecallWorkItemRanking(
  @Query('range') range: string,
  @Query('businessDomain') businessDomain?: string,
  @Query('userId') userId?: string,
  @Query('page') page?: string,
  @Query('pageSize') pageSize?: string,
): Promise<WikiRecallWorkItemRankingResponse> {
  const r = WikiRecallRangeSchema.parse(range ?? '30d');
  return this.service.getWikiRecallWorkItemRanking(
    r, businessDomain ?? null, userId ?? null,
    page ? Math.max(1, Number(page)) : 1,
    pageSize ? Math.min(200, Math.max(1, Number(pageSize))) : 50,
  );
}

@Get('/wiki-recalls/heatmap')
async wikiRecallHeatmap(
  @Query('range') range: string,
  @Query('groupBy') groupBy: string,
): Promise<WikiRecallHeatmapResponse> {
  const r = WikiRecallRangeSchema.parse(range ?? '30d');
  const g = (['domain', 'axis', 'system'].includes(groupBy) ? groupBy : 'domain') as
    'domain' | 'axis' | 'system';
  return this.service.getWikiRecallHeatmap(r, g);
}

@Get('/wiki-recalls/timeline')
async wikiRecallTimeline(
  @Query('range') range: string,
  @Query('granularity') granularity: string,
  @Query('groupBy') groupBy: string,
): Promise<WikiRecallTimelineResponse> {
  const r = WikiRecallRangeSchema.parse(range ?? '30d');
  const gran = granularity === 'hour' ? 'hour' : 'day';
  const gb = groupBy === 'axis' ? 'axis' : 'domain';
  return this.service.getWikiRecallTimeline(r, gran, gb);
}

@Get('/wiki-recalls/list')
async listWikiRecalls(
  @Query('range') range: string,
  @Query('workItemId') workItemId?: string,
  @Query('userId') userId?: string,
  @Query('skillUsageId') skillUsageId?: string,
  @Query('page') page?: string,
  @Query('pageSize') pageSize?: string,
): Promise<WikiRecallListResponse> {
  const r = WikiRecallRangeSchema.parse(range ?? '30d');
  return this.service.listWikiRecalls(
    r,
    { workItemId, userId, skillUsageId },
    page ? Math.max(1, Number(page)) : 1,
    pageSize ? Math.min(500, Math.max(1, Number(pageSize))) : 50,
  );
}
```

注意：文件顶部需要 import 新加的 schema 与 response 类型。controller 的 `@Controller` 前缀（应为 `/api/sdd`）由现有装饰器提供，不重复加。

- [ ] **Step 9.3: typecheck + 启动 server 手动 smoke test**

```bash
pnpm typecheck
pnpm dev:server &
sleep 3
curl 'http://localhost:4318/api/sdd/wiki-recalls/users?range=30d&sortBy=total' | jq .
curl 'http://localhost:4318/api/sdd/wiki-recalls/heatmap?range=30d&groupBy=domain' | jq .
```

预期：返回 JSON 含 `items` / `buckets`（即使空数组也算成功）。

- [ ] **Step 9.4: commit**

```bash
git add server/src/modules/sdd/sdd-query.service.ts server/src/modules/sdd/sdd.controller.ts
git commit -m "$(cat <<'EOF'
新增 wiki 召回 5 个 API 端点

users / work-items / heatmap / timeline / list；range 7d/30d/90d/all；
分页与 sortBy 参数。
EOF
)"
```

---

## Task 10: web 路由 + sidebar + 页面 shell

**Files:**
- Create: `web/src/pages/sdd/wiki-recalls/WikiRecallsPage.tsx`
- Create: `web/src/pages/sdd/wiki-recalls/useWikiRecalls.ts`
- Modify: `web/src/router.tsx`
- Modify: `web/src/components/layout/Sidebar.tsx`

- [ ] **Step 10.1: 新建 `useWikiRecalls.ts`（TanStack Query hooks）**

```typescript
// web/src/pages/sdd/wiki-recalls/useWikiRecalls.ts
import { useQuery } from '@tanstack/react-query';
import { httpClient } from '@/api/http-client';
import type {
  WikiRecallUserRankingResponse,
  WikiRecallWorkItemRankingResponse,
  WikiRecallHeatmapResponse,
  WikiRecallTimelineResponse,
  WikiRecallListResponse,
  WikiRecallRange,
} from '@sdd-telemetry/api';

export function useWikiRecallUserRanking(range: WikiRecallRange, sortBy: 'total' | 'distinct_files' | 'recent') {
  return useQuery<WikiRecallUserRankingResponse>({
    queryKey: ['wiki-recalls', 'users', range, sortBy],
    queryFn: () =>
      httpClient.get('/api/sdd/wiki-recalls/users', { range, sortBy }),
  });
}

export function useWikiRecallWorkItemRanking(
  range: WikiRecallRange,
  filters: { businessDomain?: string; userId?: string },
) {
  return useQuery<WikiRecallWorkItemRankingResponse>({
    queryKey: ['wiki-recalls', 'work-items', range, filters],
    queryFn: () => httpClient.get('/api/sdd/wiki-recalls/work-items', { range, ...filters }),
  });
}

export function useWikiRecallHeatmap(range: WikiRecallRange, groupBy: 'domain' | 'axis' | 'system') {
  return useQuery<WikiRecallHeatmapResponse>({
    queryKey: ['wiki-recalls', 'heatmap', range, groupBy],
    queryFn: () => httpClient.get('/api/sdd/wiki-recalls/heatmap', { range, groupBy }),
  });
}

export function useWikiRecallTimeline(
  range: WikiRecallRange,
  granularity: 'day' | 'hour',
  groupBy: 'domain' | 'axis',
) {
  return useQuery<WikiRecallTimelineResponse>({
    queryKey: ['wiki-recalls', 'timeline', range, granularity, groupBy],
    queryFn: () => httpClient.get('/api/sdd/wiki-recalls/timeline', { range, granularity, groupBy }),
  });
}

export function useWikiRecallList(
  range: WikiRecallRange,
  filters: { workItemId?: string; userId?: string; skillUsageId?: string },
) {
  return useQuery<WikiRecallListResponse>({
    queryKey: ['wiki-recalls', 'list', range, filters],
    queryFn: () => httpClient.get('/api/sdd/wiki-recalls/list', { range, ...filters }),
  });
}
```

注：`httpClient.get(url, queryParams)` 的实际签名以本项目 `web/src/api/http-client.ts` 现有方法为准；若签名不同，按它现有约定改写（之前看到该文件已存在）。

- [ ] **Step 10.2: 新建 `WikiRecallsPage.tsx` shell**

```tsx
// web/src/pages/sdd/wiki-recalls/WikiRecallsPage.tsx
import { useSearchParams } from 'react-router-dom';
import { UserRankingTab } from './tabs/UserRankingTab';
import { WorkItemRankingTab } from './tabs/WorkItemRankingTab';
import { WikiHeatmapTab } from './tabs/WikiHeatmapTab';
import { TimelineTab } from './tabs/TimelineTab';

const TABS = [
  { key: 'ranking', label: '用户排行', Component: UserRankingTab },
  { key: 'work-items', label: '需求 × wiki', Component: WorkItemRankingTab },
  { key: 'heatmap', label: 'Wiki 热度', Component: WikiHeatmapTab },
  { key: 'timeline', label: '召回时间线', Component: TimelineTab },
] as const;

export function WikiRecallsPage() {
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') ?? 'ranking';
  const Active = TABS.find((t) => t.key === tab)?.Component ?? UserRankingTab;

  return (
    <div className="flex flex-col gap-4">
      <header>
        <h1 className="text-xl font-semibold">知识库召回</h1>
      </header>

      <nav className="flex gap-2 border-b border-zinc-200">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => {
              const next = new URLSearchParams(params);
              next.set('tab', t.key);
              setParams(next);
            }}
            className={`px-3 py-2 text-sm ${tab === t.key ? 'border-b-2 border-zinc-900 font-semibold' : 'text-zinc-500'}`}
          >
            {t.label}
          </button>
        ))}
      </nav>

      <section><Active /></section>
    </div>
  );
}

export default WikiRecallsPage;
```

- [ ] **Step 10.3: 建 4 个 tab 文件的 stub**

为了让 shell 能编译，先建 4 个 stub。后续 Task 11-14 各自填充：

```tsx
// web/src/pages/sdd/wiki-recalls/tabs/UserRankingTab.tsx
export function UserRankingTab() { return <div>TODO: 用户排行</div>; }

// web/src/pages/sdd/wiki-recalls/tabs/WorkItemRankingTab.tsx
export function WorkItemRankingTab() { return <div>TODO: 需求 × wiki</div>; }

// web/src/pages/sdd/wiki-recalls/tabs/WikiHeatmapTab.tsx
export function WikiHeatmapTab() { return <div>TODO: wiki 热度</div>; }

// web/src/pages/sdd/wiki-recalls/tabs/TimelineTab.tsx
export function TimelineTab() { return <div>TODO: 时间线</div>; }
```

**重要**：这是**唯一允许的临时 stub**（因为 4 个 tab 是后续 task 的产物）；其余地方不写 TODO/TBD。

- [ ] **Step 10.4: 修 `router.tsx` 加路由**

参考现有 sdd 路由（`sdd/users` 等），在合适位置新增：

```tsx
import { lazy } from 'react';
const WikiRecallsPage = lazy(() => import('./pages/sdd/wiki-recalls/WikiRecallsPage'));
// ...
{ path: 'sdd/wiki-recalls', element: wrap(WikiRecallsPage), errorElement: <RouteError /> },
```

- [ ] **Step 10.5: 修 `Sidebar.tsx` 加 nav 项**

在 `NAV_GROUPS` 的"看板"组里追加：

```tsx
import { BookOpen } from 'lucide-react';
// ...
{ to: '/sdd/wiki-recalls', label: '知识库召回', icon: BookOpen },
```

- [ ] **Step 10.6: 跑 dev:web 验证导航能进**

```bash
pnpm dev:web
# 浏览器打开 http://localhost:5173/sdd/wiki-recalls
```

预期：页面能打开，看到 4 个 tab 标题，点击 tab 后 URL 带上 `?tab=...`。

- [ ] **Step 10.7: commit**

```bash
git add web/src/pages/sdd/wiki-recalls web/src/router.tsx web/src/components/layout/Sidebar.tsx
git commit -m "$(cat <<'EOF'
新增 sdd/wiki-recalls 路由与页面骨架

4-tab shell + sidebar 入口 + TanStack Query hooks；tabs 内容下个任务填充。
EOF
)"
```

---

## Task 11: Tab 1 — 用户使用排行

**Files:**
- Modify: `web/src/pages/sdd/wiki-recalls/tabs/UserRankingTab.tsx`

- [ ] **Step 11.1: 实现 UserRankingTab**

```tsx
import { useState } from 'react';
import { useWikiRecallUserRanking } from '../useWikiRecalls';
import type { WikiRecallRange } from '@sdd-telemetry/api';

const RANGES: WikiRecallRange[] = ['7d', '30d', '90d', 'all'];

export function UserRankingTab() {
  const [range, setRange] = useState<WikiRecallRange>('30d');
  const [sortBy, setSortBy] = useState<'total' | 'distinct_files' | 'recent'>('total');
  const { data, isLoading, error } = useWikiRecallUserRanking(range, sortBy);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-3 text-sm">
        <label>时间范围：</label>
        <select value={range} onChange={(e) => setRange(e.target.value as WikiRecallRange)}
                className="rounded border px-2 py-1">
          {RANGES.map((r) => <option key={r} value={r}>{r}</option>)}
        </select>

        <label>排序：</label>
        <select value={sortBy} onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
                className="rounded border px-2 py-1">
          <option value="total">总召回次数</option>
          <option value="distinct_files">不同 wiki 文件数</option>
          <option value="recent">最近活跃</option>
        </select>
      </div>

      {isLoading && <div>加载中…</div>}
      {error && <div className="text-red-600">加载失败：{String(error)}</div>}

      {data && (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b">
              <th className="py-2 text-left">用户</th>
              <th className="py-2 text-right">召回总次数</th>
              <th className="py-2 text-right">不同文件数</th>
              <th className="py-2 text-right">domain 数</th>
              <th className="py-2 text-right">system 数</th>
              <th className="py-2 text-right">最近召回</th>
              <th className="py-2 text-center">wiki 配置</th>
            </tr>
          </thead>
          <tbody>
            {data.items.map((row) => (
              <tr key={row.userId} className="border-b hover:bg-zinc-50">
                <td className="py-2">
                  <a href={`/sdd/users?userId=${row.userId}`} className="text-blue-600 hover:underline">
                    {row.userName ?? row.userId}
                  </a>
                </td>
                <td className="py-2 text-right">{row.totalRecalls}</td>
                <td className="py-2 text-right">{row.distinctFiles}</td>
                <td className="py-2 text-right">{row.distinctDomains}</td>
                <td className="py-2 text-right">{row.distinctSystems}</td>
                <td className="py-2 text-right">
                  {row.lastRecallAt ? new Date(row.lastRecallAt).toLocaleString() : '—'}
                </td>
                <td className="py-2 text-center">
                  {row.hasWikiRootPath ? '✓' : <span className="text-amber-600">未配置</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
```

- [ ] **Step 11.2: 跑 dev:web 验证表格能渲染、能切 range/sortBy**

```bash
pnpm dev:web
# 浏览器打开 /sdd/wiki-recalls?tab=ranking
```

预期：表格可显示数据；切换 range / sortBy 能触发 reload。

- [ ] **Step 11.3: commit**

```bash
git add web/src/pages/sdd/wiki-recalls/tabs/UserRankingTab.tsx
git commit -m "实现 wiki 召回看板 Tab 1：用户使用排行"
```

---

## Task 12: Tab 2 — 需求 × wiki 下钻

**Files:**
- Modify: `web/src/pages/sdd/wiki-recalls/tabs/WorkItemRankingTab.tsx`

- [ ] **Step 12.1: 实现 WorkItemRankingTab**

```tsx
import { useState } from 'react';
import { useWikiRecallWorkItemRanking } from '../useWikiRecalls';
import type { WikiRecallRange } from '@sdd-telemetry/api';

const RANGES: WikiRecallRange[] = ['7d', '30d', '90d', 'all'];

export function WorkItemRankingTab() {
  const [range, setRange] = useState<WikiRecallRange>('30d');
  const [businessDomain, setBusinessDomain] = useState('');
  const { data, isLoading } = useWikiRecallWorkItemRanking(range, {
    businessDomain: businessDomain || undefined,
  });

  return (
    <div className="flex flex-col gap-3">
      <div className="flex gap-3 text-sm">
        <label>时间范围：</label>
        <select value={range} onChange={(e) => setRange(e.target.value as WikiRecallRange)}
                className="rounded border px-2 py-1">
          {RANGES.map((r) => <option key={r} value={r}>{r}</option>)}
        </select>
        <label>业务域：</label>
        <input value={businessDomain} onChange={(e) => setBusinessDomain(e.target.value)}
               placeholder="如 cashier"
               className="rounded border px-2 py-1" />
      </div>

      {isLoading && <div>加载中…</div>}

      {data && (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b">
              <th className="py-2 text-left">需求 slug</th>
              <th className="py-2 text-left">业务域</th>
              <th className="py-2 text-right">召回总次数</th>
              <th className="py-2 text-right">domain 数</th>
              <th className="py-2 text-right">system 数</th>
              <th className="py-2 text-right">参与人</th>
            </tr>
          </thead>
          <tbody>
            {data.items.map((row) => (
              <tr key={row.workItemId} className="border-b hover:bg-zinc-50">
                <td className="py-2">
                  <a href={`/sdd/work-items?workItemId=${row.workItemId}`}
                     className="text-blue-600 hover:underline">{row.workItemSlug}</a>
                </td>
                <td className="py-2">{row.businessDomain ?? '—'}</td>
                <td className="py-2 text-right">{row.totalRecalls}</td>
                <td className="py-2 text-right">{row.distinctDomains}</td>
                <td className="py-2 text-right">{row.distinctSystems}</td>
                <td className="py-2 text-right">{row.userCount}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
```

- [ ] **Step 12.2: smoke + commit**

```bash
pnpm dev:web
# 验证 Tab 2 渲染
git add web/src/pages/sdd/wiki-recalls/tabs/WorkItemRankingTab.tsx
git commit -m "实现 wiki 召回看板 Tab 2：需求 × wiki 下钻"
```

---

## Task 13: Tab 3 — Wiki 热度榜

**Files:**
- Modify: `web/src/pages/sdd/wiki-recalls/tabs/WikiHeatmapTab.tsx`

- [ ] **Step 13.1: 实现 WikiHeatmapTab**

```tsx
import { useState } from 'react';
import { useWikiRecallHeatmap } from '../useWikiRecalls';
import type { WikiRecallRange } from '@sdd-telemetry/api';

const RANGES: WikiRecallRange[] = ['7d', '30d', '90d', 'all'];

function HeatBar({ data, label }: { data: { key: string; totalRecalls: number; distinctUsers: number }[]; label: string }) {
  const max = Math.max(1, ...data.map((d) => d.totalRecalls));
  return (
    <div>
      <h3 className="mb-2 text-sm font-semibold">{label}</h3>
      <div className="flex flex-col gap-1">
        {data.map((row) => (
          <div key={row.key} className="flex items-center gap-2 text-sm">
            <span className="w-32 truncate">{row.key || '(未识别)'}</span>
            <div className="flex-1 rounded bg-zinc-100">
              <div className="h-5 rounded bg-blue-500"
                   style={{ width: `${(row.totalRecalls / max) * 100}%` }} />
            </div>
            <span className="w-20 text-right">{row.totalRecalls}</span>
            <span className="w-16 text-right text-zinc-500">{row.distinctUsers} 人</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function WikiHeatmapTab() {
  const [range, setRange] = useState<WikiRecallRange>('30d');
  const byDomain = useWikiRecallHeatmap(range, 'domain');
  const byAxis = useWikiRecallHeatmap(range, 'axis');
  const bySystem = useWikiRecallHeatmap(range, 'system');

  return (
    <div className="flex flex-col gap-6">
      <div className="flex gap-3 text-sm">
        <label>时间范围：</label>
        <select value={range} onChange={(e) => setRange(e.target.value as WikiRecallRange)}
                className="rounded border px-2 py-1">
          {RANGES.map((r) => <option key={r} value={r}>{r}</option>)}
        </select>
      </div>

      {byDomain.data && <HeatBar data={byDomain.data.buckets} label="按业务域" />}
      {byAxis.data && <HeatBar data={byAxis.data.buckets} label="按维度" />}
      {bySystem.data && <HeatBar data={bySystem.data.buckets} label="按系统模块（TOP 10）" />}
    </div>
  );
}
```

- [ ] **Step 13.2: smoke + commit**

```bash
pnpm dev:web
git add web/src/pages/sdd/wiki-recalls/tabs/WikiHeatmapTab.tsx
git commit -m "实现 wiki 召回看板 Tab 3：wiki 热度榜（domain/axis/system）"
```

---

## Task 14: Tab 4 — 召回时间线

**Files:**
- Modify: `web/src/pages/sdd/wiki-recalls/tabs/TimelineTab.tsx`

- [ ] **Step 14.1: 实现 TimelineTab**

```tsx
import { useState, useMemo } from 'react';
import { useWikiRecallTimeline } from '../useWikiRecalls';
import type { WikiRecallRange } from '@sdd-telemetry/api';

const RANGES: WikiRecallRange[] = ['7d', '30d', '90d', 'all'];

export function TimelineTab() {
  const [range, setRange] = useState<WikiRecallRange>('30d');
  const [granularity, setGranularity] = useState<'day' | 'hour'>('day');
  const [groupBy, setGroupBy] = useState<'domain' | 'axis'>('domain');

  const { data } = useWikiRecallTimeline(range, granularity, groupBy);

  const { groups, byTime } = useMemo(() => {
    if (!data) return { groups: [] as string[], byTime: new Map<string, Map<string, number>>() };
    const groupsSet = new Set<string>();
    const byTime = new Map<string, Map<string, number>>();
    for (const p of data.points) {
      groupsSet.add(p.group ?? '(未识别)');
      const m = byTime.get(p.t) ?? new Map<string, number>();
      m.set(p.group ?? '(未识别)', p.count);
      byTime.set(p.t, m);
    }
    return { groups: [...groupsSet].sort(), byTime };
  }, [data]);

  const sortedTimes = useMemo(() => [...byTime.keys()].sort(), [byTime]);
  const max = useMemo(() => {
    let m = 1;
    for (const tm of byTime.values()) {
      let sum = 0;
      for (const v of tm.values()) sum += v;
      m = Math.max(m, sum);
    }
    return m;
  }, [byTime]);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex gap-3 text-sm">
        <label>时间范围：</label>
        <select value={range} onChange={(e) => setRange(e.target.value as WikiRecallRange)}
                className="rounded border px-2 py-1">
          {RANGES.map((r) => <option key={r} value={r}>{r}</option>)}
        </select>

        <label>粒度：</label>
        <select value={granularity} onChange={(e) => setGranularity(e.target.value as 'day' | 'hour')}
                className="rounded border px-2 py-1">
          <option value="day">按日</option>
          <option value="hour">按小时</option>
        </select>

        <label>分组：</label>
        <select value={groupBy} onChange={(e) => setGroupBy(e.target.value as 'domain' | 'axis')}
                className="rounded border px-2 py-1">
          <option value="domain">业务域</option>
          <option value="axis">维度</option>
        </select>
      </div>

      <div className="flex h-64 items-end gap-1 overflow-x-auto rounded border p-2">
        {sortedTimes.map((t) => {
          const m = byTime.get(t)!;
          const total = [...m.values()].reduce((a, b) => a + b, 0);
          return (
            <div key={t} className="flex flex-col items-center" title={`${t}: ${total}`}>
              <div className="w-3 rounded-t bg-blue-500"
                   style={{ height: `${(total / max) * 100}%` }} />
              <span className="text-[10px] text-zinc-500">{t.slice(5, 10)}</span>
            </div>
          );
        })}
      </div>

      <div className="text-xs text-zinc-500">分组：{groups.join(', ') || '—'}</div>
    </div>
  );
}
```

- [ ] **Step 14.2: smoke + commit**

```bash
pnpm dev:web
git add web/src/pages/sdd/wiki-recalls/tabs/TimelineTab.tsx
git commit -m "实现 wiki 召回看板 Tab 4：召回时间线"
```

---

## Task 15: 跨页联动 — 用户详情 + 需求详情

**Files:**
- Modify: `web/src/pages/sdd/users/UsersPage.tsx`
- Modify: `web/src/pages/sdd/work-items/WorkItemsPage.tsx`

> **如果这两个文件结构与下面假设不同**：先打开看一眼，找一个"用户详情侧抽屉/详情区域"的现有 DOM 节点，把下面的"wiki 召回区域"插进去。下方代码是 **最小展示**实现，便于对接现有 UI。

- [ ] **Step 15.1: 用户详情页插入 wiki 召回区域**

在 `UsersPage.tsx` 中，找到 "选中用户后渲染详情" 的 conditional 块，加入一个新 panel：

```tsx
import { useWikiRecallList } from '@/pages/sdd/wiki-recalls/useWikiRecalls';

// 在详情区域里：
function UserWikiRecallPanel({ userId }: { userId: string }) {
  const { data, isLoading } = useWikiRecallList('30d', { userId });
  if (isLoading) return <div className="text-sm text-zinc-500">加载召回…</div>;
  if (!data || data.items.length === 0)
    return <div className="text-sm text-zinc-500">该用户最近 30 天无 wiki 召回</div>;

  return (
    <div className="mt-4">
      <h3 className="mb-2 text-sm font-semibold">最近 wiki 召回</h3>
      <ul className="space-y-1 text-sm">
        {data.items.slice(0, 20).map((r) => (
          <li key={r.id} className="flex justify-between">
            <span className="truncate">{r.wikiRelativePath ?? r.rawPath}</span>
            <span className="text-zinc-500">{r.actionType}</span>
          </li>
        ))}
      </ul>
      <a className="mt-2 inline-block text-blue-600 hover:underline" href={`/sdd/wiki-recalls?tab=ranking`}>
        查看全部召回 →
      </a>
    </div>
  );
}
// 调用：<UserWikiRecallPanel userId={selectedUser.id} />
```

- [ ] **Step 15.2: 需求详情页插入 wiki 召回区域**

在 `WorkItemsPage.tsx` 详情区域同样加：

```tsx
import { useWikiRecallList } from '@/pages/sdd/wiki-recalls/useWikiRecalls';

function WorkItemWikiRecallPanel({ workItemId }: { workItemId: string }) {
  const { data, isLoading } = useWikiRecallList('30d', { workItemId });
  if (isLoading) return <div className="text-sm text-zinc-500">加载召回…</div>;
  if (!data || data.items.length === 0)
    return <div className="text-sm text-zinc-500">该需求无 wiki 召回</div>;

  // 按 skill_usage_id 分组展示
  const groups = new Map<string, typeof data.items>();
  for (const r of data.items) {
    const k = r.skillUsageId ?? 'unattached';
    groups.set(k, [...(groups.get(k) ?? []), r]);
  }

  return (
    <div className="mt-4">
      <h3 className="mb-2 text-sm font-semibold">wiki 召回（按 skill 分组）</h3>
      {[...groups.entries()].map(([usageId, rows]) => (
        <div key={usageId} className="mb-3">
          <div className="text-xs text-zinc-500">skill_usage: {usageId}</div>
          <ul className="space-y-1 text-sm">
            {rows.map((r) => (
              <li key={r.id} className="truncate">{r.wikiRelativePath ?? r.rawPath} <span className="text-zinc-400">[{r.actionType}]</span></li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
// 调用：<WorkItemWikiRecallPanel workItemId={selectedWorkItem.id} />
```

- [ ] **Step 15.3: smoke + commit**

```bash
pnpm dev:web
# 浏览器选中一个用户、一个 work_item，确认有"wiki 召回"区域显示
git add web/src/pages/sdd/users/UsersPage.tsx web/src/pages/sdd/work-items/WorkItemsPage.tsx
git commit -m "$(cat <<'EOF'
用户详情 / 需求详情页加 wiki 召回区域

复用 useWikiRecallList hook；用户页平铺最近 20 条；需求页按 skill_usage 分组。
EOF
)"
```

---

## Task 16: 跨页联动 — interactions 表格加 wiki 标记列

**Files:**
- Modify: `web/src/pages/sdd/interactions/InteractionsPage.tsx`

- [ ] **Step 16.1: 找到现有 tool_calls 渲染部分**

打开文件，找渲染 `listInteractionToolCalls` 返回数据的表格（应该是一个 `<table>` 或 `<ul>`）。

- [ ] **Step 16.2: 加 wiki 标记列**

需要两步：
1. 服务端 `listInteractionToolCalls` repository 方法的 SELECT 加 `skill_usage_id`（spec §3.1 字段已存在），同时 JOIN `sdd_wiki_recalls` 看 tool_call_id 是否有对应记录，返回 `isWikiRecall: boolean` 字段
2. 前端列表渲染：在已有列后加 "📚 wiki" 列

如果暂不动 server contract，前端可以单独发一次 `/api/sdd/wiki-recalls/list?interactionId=...`（API 不支持 interactionId 筛选时需要先加）——为最小变更，**本任务推荐方案 A**（动 server）：

```typescript
// server/src/modules/sdd/sdd-query.repository.ts 的 listInteractionToolCalls 改造：
async listInteractionToolCalls(interactionId: string): Promise<InteractionToolCallRow[]> {
  const dataSource = await this.mysqlDataSourceManager.getDataSource();
  return (await dataSource.query(
    `SELECT tc.id, tc.tool_use_id, tc.tool_name, tc.sequence, tc.decision, tc.decision_source,
            tc.success, tc.duration_ms, tc.input_size_bytes, tc.result_size_bytes,
            tc.error_type, tc.tool_input_preview, tc.mcp_server_scope,
            tc.skill_usage_id,
            (EXISTS (SELECT 1 FROM sdd_wiki_recalls wr WHERE wr.tool_call_id = tc.id)) AS isWikiRecall
     FROM sdd_interaction_tool_calls tc
     WHERE tc.interaction_id = ?
     ORDER BY tc.sequence ASC, tc.id ASC`,
    [interactionId],
  )) as InteractionToolCallRow[];
}
```

同步更新 `InteractionToolCallRow` 类型 + service 映射 + contract schema：

```typescript
// packages/api/src/contracts/sdd.contract.ts 现有 InteractionToolCall schema 加：
isWikiRecall: z.boolean(),
skillUsageId: z.string().nullable(),
```

前端：

```tsx
// 在 tool_calls 表格行：
<td>{tc.isWikiRecall ? <span title="召回 wiki 文件">📚</span> : ''}</td>
```

- [ ] **Step 16.3: typecheck + smoke + commit**

```bash
pnpm typecheck
pnpm dev
# 浏览器进 interactions 详情，找一条有 wiki 召回的 turn，确认 📚 标记显示
git add server/src/modules/sdd/sdd-query.repository.ts \
        server/src/modules/sdd/sdd-query.service.ts \
        packages/api/src/contracts/sdd.contract.ts \
        web/src/pages/sdd/interactions/InteractionsPage.tsx
git commit -m "$(cat <<'EOF'
interactions 详情 tool_calls 表格加 wiki 召回标记列

listInteractionToolCalls 返回 isWikiRecall + skill_usage_id；前端用 📚 标记。
EOF
)"
```

---

## Task 17: 部署 + db:reclean + 可证伪查询

**只在公司服务器 / 公司电脑跑**。本地仅适配性检查。

- [ ] **Step 17.1: 打包 + 转传 + 部署**

```bash
# 我的电脑：
pnpm docker:publish  # 一键打包 + 发 Release
# 或：pnpm docker:package + 手动 scp

# 公司电脑（通过 IM 拿到 bundle）：
SERVER=<user>@<host> VERSION=<v> ./scripts/scp-package.sh

# 服务器：
cd ~/project/sdd-telemetry-deploy
tar -xzf sdd-telemetry-deploy-bundle-<v>.tar.gz
VERSION=<v> ARCHIVE=sdd-telemetry-images-<v>.tar.gz ./deploy-docker.sh
```

预期：3 个容器（server / worker / web）启动 OK；migration 自动跑。

- [ ] **Step 17.2: 跑前置探查 SQL（阶段 0 的 5 个查询）**

mysql client 跑阶段 0 的 5 个 SQL，确认 Read/Glob/Grep 与 file_path 字段名假设无误。如不符合，停下来修代码再发版。

- [ ] **Step 17.3: 跑 db:reclean 回填历史**

```bash
docker compose -f compose.prod.yml exec server pnpm db:reclean
```

预期：清派生表 → 重排队 outbox → worker 循环跑 → outbox 清空 → 结束。

- [ ] **Step 17.4: 跑可证伪查询（spec §6.4）**

```sql
-- 1. system 一致性
SELECT COUNT(*) FROM sdd_wiki_recalls
WHERE wiki_system IS NOT NULL AND wiki_axis != 'system';
-- 期望：0

-- 2. read 类型必须解析出 relative path
SELECT COUNT(*) FROM sdd_wiki_recalls
WHERE action_type='read' AND wiki_relative_path IS NULL;
-- 期望：0

-- 3. wiki_recall 必须挂在 tool_call 上
SELECT COUNT(*) FROM sdd_wiki_recalls r
LEFT JOIN sdd_interaction_tool_calls t ON r.tool_call_id = t.id
WHERE t.id IS NULL;
-- 期望：0

-- 4. wiki_recall 总数 / 用户分布
SELECT COUNT(*) AS total FROM sdd_wiki_recalls;
SELECT user_id, COUNT(*) FROM sdd_wiki_recalls GROUP BY user_id ORDER BY 2 DESC LIMIT 10;
```

任一查询不符合预期 → 不发布给团队 → 排查 worker 逻辑。

- [ ] **Step 17.5: dashboard smoke test**

浏览器进 `https://<server>/sdd/wiki-recalls`，4 个 tab 都能加载数据，用户/需求详情联动正常，interactions 表格 📚 标记正确。

- [ ] **Step 17.6: 关单**

如果所有验证 OK，把 PR / 任务关掉，老板可以看了。

---

## Self-Review

**1. Spec coverage**：

| Spec 章节 | 实现 task |
|---|---|
| §2 架构 / 数据流 | Task 1-6 |
| §3.1 skill_usage_id 加列 | Task 1, 2 |
| §3.2 sdd_wiki_recalls 表 | Task 4 |
| §3.3 Retention | spec 文档明示，本期不实现清理逻辑 |
| §4.1 cleanBatch 改动 | Task 3, 6 |
| §4.2 attachSkillUsageToToolCalls | Task 3 |
| §4.3 路径匹配规则 | Task 5, 6 |
| §4.4 parseWikiPath | Task 5 |
| §4.5 work_item_id 反查 | Task 6 |
| §4.6 rule_version + db:reclean | Task 4 (reset-derived-data), Task 17 |
| §4.7 边界情况 | Task 5, 6 测试覆盖 |
| §5.1 路由 | Task 10 |
| §5.2 4 个 tab | Task 11-14 |
| §5.3 跨页联动 | Task 15, 16 |
| §5.4 API contract | Task 7 |
| §6.1 前置探查 | 阶段 0 + Task 17.2 |
| §6.2 worker 容错 | Task 6 实现 |
| §6.3 可观测性 log | Task 6 实现 |
| §6.4 测试覆盖 | Task 3, 5, 6 单测 + Task 17.4 可证伪查询 |
| §6.5 部署顺序 + WIKI_RECALL_ENABLED | Task 6 实现 + Task 17 部署 |

**2. Placeholder scan**：✅ 唯一允许的 stub 在 Task 10.3（4 个 tab 的占位组件），后续 Task 11-14 实现。其余无 TBD/TODO。

**3. Type consistency**：✅
- `WikiRecallRange` 在 contract / service / web 一致引用
- `WikiRecallRow` 字段命名（toolCallId / interactionId / skillUsageId / workItemId / userName / wikiRelativePath / wikiDomain / wikiAxis / wikiSystem）跨 contract / repository / service / web 一致
- `parseWikiPath` 返回值 `{ relative, domain, axis, system }` 在 worker / 测试 / spec 一致

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-05-27-wiki-recall-dashboard.md`. Two execution options:

**1. Subagent-Driven (recommended)** — 我每个 task 派一个 fresh subagent 执行 + review 后再下一个；速度快、context 不污染

**2. Inline Execution** — 在当前会话里 batch 执行 + checkpoint review

哪个？
