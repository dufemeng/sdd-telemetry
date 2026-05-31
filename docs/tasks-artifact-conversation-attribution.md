# 文档生成对话归因 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把「产出一篇文档的多轮对话」（不只是最后那条 Write/Edit）接进需求详情页的生成时间线。

**Architecture:** 新增派生表 `sdd_work_item_artifact_turns` 存「讨论 turn」归因关系。worker 在派生 artifact 写入时，按窗口 `[激活 turn, 写入)` 把同 session 的讨论 turn 物化进新表（正文不入库，仍走 `sdd_interaction_texts`）。读侧把讨论 turn 与既有写入节点 UNION 成一条按 `event_time` 排序的时间线，节点带 `nodeKind`。

**Tech Stack:** TypeScript / NestJS (server) / 独立 worker（mysql2 raw SQL）/ TypeORM 迁移与实体 / Zod contract (`packages/api`) / React + TanStack Query (web) / vitest。

**设计依据：** `docs/design-artifact-conversation-attribution.md`。

**测试取向：** 纯逻辑（窗口/键计算）走 vitest 单测（TDD）；迁移 / SQL / 接线 / UI 走「typecheck + build + 迁移 + worker once + 可证伪 SQL + curl」的具体验证，符合本仓库既有风格（纯函数单测，DB 行为构造可证伪查询验证）。

**SQL 速记（验证用）：**
```bash
SQL() { docker exec -i sdd-telemetry-mysql mysql -usdd-telemetry -psdd-telemetry sdd-telemetry -t -e "$1"; }
```

---

### Task 1: 建表迁移 + verify-schema + reclean 列表

**Files:**
- Create: `server/src/infrastructure/mysql/migrations/1780000004000-create-artifact-turns.ts`
- Modify: `server/src/infrastructure/mysql/verify-schema.ts`（`expectedTables` 数组）
- Modify: `server/src/infrastructure/mysql/reset-derived-data.ts`（`derivedTables` 数组）

- [ ] **Step 1: 写迁移文件**

`server/src/infrastructure/mysql/migrations/1780000004000-create-artifact-turns.ts`：

```ts
import type { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateArtifactTurns1780000004000 implements MigrationInterface {
  name = 'CreateArtifactTurns1780000004000';

  async up(queryRunner: QueryRunner): Promise<void> {
    if (await tableExists(queryRunner, 'sdd_work_item_artifact_turns')) return;

    await queryRunner.query(`
      CREATE TABLE \`sdd_work_item_artifact_turns\` (
        \`id\` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        \`turn_key\` CHAR(64) NOT NULL,
        \`artifact_id\` BIGINT UNSIGNED NOT NULL,
        \`work_item_id\` BIGINT UNSIGNED NOT NULL,
        \`interaction_id\` BIGINT UNSIGNED NOT NULL,
        \`skill_usage_id\` BIGINT UNSIGNED NULL,
        \`user_id\` BIGINT UNSIGNED NULL,
        \`session_id\` VARCHAR(191) NULL,
        \`anchor_event_time\` DATETIME(3) NULL,
        \`write_event_time\` DATETIME(3) NULL,
        \`event_time\` DATETIME(3) NULL,
        \`rule_version\` VARCHAR(32) NOT NULL,
        \`gmt_create\` DATETIME(3) NOT NULL,
        \`gmt_modified\` DATETIME(3) NOT NULL,
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`uk_artifact_turn_key\` (\`turn_key\`),
        KEY \`idx_artifact_turns_artifact_event_time\` (\`artifact_id\`, \`event_time\`),
        KEY \`idx_artifact_turns_work_item_id\` (\`work_item_id\`),
        KEY \`idx_artifact_turns_interaction_id\` (\`interaction_id\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    if (await tableExists(queryRunner, 'sdd_work_item_artifact_turns')) {
      await queryRunner.query(`DROP TABLE \`sdd_work_item_artifact_turns\``);
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

- [ ] **Step 2: 把新表加入 verify-schema 的 `expectedTables`**

在 `server/src/infrastructure/mysql/verify-schema.ts` 的 `expectedTables` 数组里，紧跟 `'sdd_work_item_artifact_writes',` 之后加一行：

```ts
  'sdd_work_item_artifact_turns',
```

- [ ] **Step 3: 把新表加入 reclean 的 `derivedTables`**

在 `server/src/infrastructure/mysql/reset-derived-data.ts` 的 `derivedTables` 数组顶部（`'sdd_work_item_artifact_writes',` 之前）加一行——派生子表先于被引用表删：

```ts
  'sdd_work_item_artifact_turns',
```

- [ ] **Step 4: 跑迁移并验证建表**

Run:
```bash
docker compose up -d mysql && pnpm db:migrate && pnpm db:verify
```
Expected: 迁移无报错；`db:verify` 打印 `schema verified: N tables ...`（N 比之前 +1），不报 missing table。

- [ ] **Step 5: 直接核对表结构**

Run:
```bash
SQL "SHOW CREATE TABLE sdd_work_item_artifact_turns\G"
```
Expected: 含 `uk_artifact_turn_key` 唯一键与三个 KEY 索引。

- [ ] **Step 6: 提交**

```bash
git add server/src/infrastructure/mysql/migrations/1780000004000-create-artifact-turns.ts \
        server/src/infrastructure/mysql/verify-schema.ts \
        server/src/infrastructure/mysql/reset-derived-data.ts
git commit -m "feat(db): 新增 sdd_work_item_artifact_turns 派生表 + 接入 verify/reclean"
```

---

### Task 2: TypeORM 实体并注册

**Files:**
- Create: `server/src/infrastructure/mysql/entities/sdd-work-item-artifact-turn.entity.ts`
- Modify: `server/src/infrastructure/mysql/entities/index.ts`

- [ ] **Step 1: 写实体（镜像 write 实体，去掉已删字段）**

`server/src/infrastructure/mysql/entities/sdd-work-item-artifact-turn.entity.ts`：

```ts
import { Column, Entity, Index } from 'typeorm';
import { NullableDateColumn, TimestampedEntity } from './common';

@Entity({ name: 'sdd_work_item_artifact_turns' })
@Index('uk_artifact_turn_key', ['turnKey'], { unique: true })
@Index('idx_artifact_turns_artifact_event_time', ['artifactId', 'eventTime'])
@Index('idx_artifact_turns_work_item_id', ['workItemId'])
@Index('idx_artifact_turns_interaction_id', ['interactionId'])
export class SddWorkItemArtifactTurnEntity extends TimestampedEntity {
  @Column({ name: 'turn_key', type: 'char', length: 64 })
  turnKey!: string;

  @Column({ name: 'artifact_id', type: 'bigint', unsigned: true })
  artifactId!: string;

  @Column({ name: 'work_item_id', type: 'bigint', unsigned: true })
  workItemId!: string;

  @Column({ name: 'interaction_id', type: 'bigint', unsigned: true })
  interactionId!: string;

  @Column({ name: 'skill_usage_id', type: 'bigint', unsigned: true, nullable: true })
  skillUsageId!: string | null;

  @Column({ name: 'user_id', type: 'bigint', unsigned: true, nullable: true })
  userId!: string | null;

  @Column({ name: 'session_id', type: 'varchar', length: 191, nullable: true })
  sessionId!: string | null;

  @NullableDateColumn('anchor_event_time')
  anchorEventTime!: Date | null;

  @NullableDateColumn('write_event_time')
  writeEventTime!: Date | null;

  @NullableDateColumn('event_time')
  eventTime!: Date | null;

  @Column({ name: 'rule_version', type: 'varchar', length: 32 })
  ruleVersion!: string;
}
```

- [ ] **Step 2: 注册实体**

在 `server/src/infrastructure/mysql/entities/index.ts`：
1. 在 `export * from './sdd-work-item-artifact-write.entity';` 后加：
```ts
export * from './sdd-work-item-artifact-turn.entity';
```
2. 在 `import { SddWorkItemArtifactWriteEntity } from './sdd-work-item-artifact-write.entity';` 后加：
```ts
import { SddWorkItemArtifactTurnEntity } from './sdd-work-item-artifact-turn.entity';
```
3. 在 `appEntities` 数组里 `SddWorkItemArtifactWriteEntity,` 后加：
```ts
  SddWorkItemArtifactTurnEntity,
```

- [ ] **Step 3: typecheck**

Run: `pnpm --filter @sdd-telemetry/server lint`
Expected: 无类型错误。

- [ ] **Step 4: 提交**

```bash
git add server/src/infrastructure/mysql/entities/
git commit -m "feat(db): 新增 artifact turns 实体并注册"
```

---

### Task 3: worker 仓库——upsert + 窗口查询

**Files:**
- Modify: `worker/src/jobs/cleaning.repository.ts`（新增 `UpsertArtifactTurnInput`、`upsertArtifactTurn`、`listDiscussionTurnsForWrite`）

- [ ] **Step 1: 新增输入接口**

在 `worker/src/jobs/cleaning.repository.ts` 的 `UpsertArtifactWriteInput` 接口之后，加：

```ts
export interface UpsertArtifactTurnInput {
  turnKey: string;
  artifactId: string;
  workItemId: string;
  interactionId: string;
  skillUsageId: string | null;
  userId: string | null;
  sessionId: string | null;
  anchorEventTime: Date | null;
  writeEventTime: Date | null;
  eventTime: Date | null;
  ruleVersion: string;
}
```

- [ ] **Step 2: 新增两个仓库方法**

在 `CleaningRepository` 类里、`upsertArtifactWrite` 方法之后，加：

```ts
  async upsertArtifactTurn(
    connection: PoolConnection,
    input: UpsertArtifactTurnInput,
  ): Promise<void> {
    await connection.query<ResultSetHeader>(
      `INSERT INTO sdd_work_item_artifact_turns
        (turn_key, artifact_id, work_item_id, interaction_id, skill_usage_id, user_id,
         session_id, anchor_event_time, write_event_time, event_time, rule_version,
         gmt_create, gmt_modified)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3))
       ON DUPLICATE KEY UPDATE
         skill_usage_id = COALESCE(VALUES(skill_usage_id), skill_usage_id),
         user_id = COALESCE(VALUES(user_id), user_id),
         session_id = COALESCE(VALUES(session_id), session_id),
         anchor_event_time = COALESCE(VALUES(anchor_event_time), anchor_event_time),
         write_event_time = COALESCE(VALUES(write_event_time), write_event_time),
         event_time = COALESCE(VALUES(event_time), event_time),
         rule_version = VALUES(rule_version),
         gmt_modified = CURRENT_TIMESTAMP(3)`,
      [
        input.turnKey,
        input.artifactId,
        input.workItemId,
        input.interactionId,
        input.skillUsageId,
        input.userId,
        input.sessionId,
        input.anchorEventTime,
        input.writeEventTime,
        input.eventTime,
        input.ruleVersion,
      ],
    );
  }

  async listDiscussionTurnsForWrite(
    connection: PoolConnection,
    input: {
      sessionId: string;
      anchorPromptId: string | null;
      anchorEventTime: Date | null;
      writeEventTime: Date;
    },
  ): Promise<Array<{ id: string; startedAt: Date | null }>> {
    const [rows] = await connection.query<RowDataPacket[]>(
      `SELECT i.id AS id, i.started_at AS startedAt
       FROM sdd_interactions i
       WHERE i.session_id = ?
         AND i.started_at IS NOT NULL
         AND i.started_at < ?
         AND i.started_at >= COALESCE(
               (SELECT i2.started_at FROM sdd_interactions i2
                WHERE i2.prompt_id = ? ORDER BY i2.id ASC LIMIT 1),
               ?)
         AND i.id NOT IN (
               SELECT awr.interaction_id FROM sdd_work_item_artifact_writes awr
               WHERE awr.session_id = ? AND awr.interaction_id IS NOT NULL)
       ORDER BY i.started_at ASC, i.id ASC`,
      [
        input.sessionId,
        input.writeEventTime,
        input.anchorPromptId,
        input.anchorEventTime,
        input.sessionId,
      ],
    );
    return (rows as Array<{ id: string | number; startedAt: Date | string | null }>).map((r) => ({
      id: String(r.id),
      startedAt: r.startedAt ? new Date(r.startedAt) : null,
    }));
  }
```

> 说明：下界用「激活 turn 的 `started_at`」（子查询按 `anchorPromptId` 解析），解析不到退回 `anchorEventTime`；两者都空则 `>= NULL` 为假、返回空集（无锚点不归因）。`NOT IN` 子查询已过滤 `interaction_id IS NOT NULL`，无 NULL 陷阱。

- [ ] **Step 3: typecheck**

Run: `pnpm --filter @sdd-telemetry/worker lint`
Expected: 无类型错误（`PoolConnection` / `ResultSetHeader` / `RowDataPacket` 已是本文件既有 import）。

- [ ] **Step 4: 提交**

```bash
git add worker/src/jobs/cleaning.repository.ts
git commit -m "feat(worker): artifact turns 仓库方法（upsert + 窗口查询）"
```

---

### Task 4: 纯函数 `buildArtifactTurnInputs`（TDD）

**Files:**
- Modify: `worker/src/jobs/cleaning-worker.ts`（新增导出纯函数）
- Create: `worker/test/artifact-turns.test.ts`

- [ ] **Step 1: 写失败的单测**

`worker/test/artifact-turns.test.ts`：

```ts
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { buildArtifactTurnInputs } from '../src/jobs/cleaning-worker';

const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');

describe('buildArtifactTurnInputs', () => {
  it('每个 turn 生成幂等 turn_key 并带齐归因字段', () => {
    const anchor = new Date('2026-05-28T06:00:00.000Z');
    const write = new Date('2026-05-28T06:30:00.000Z');
    const out = buildArtifactTurnInputs({
      artifactId: '3',
      workItemId: '7',
      skillUsageId: '99',
      userId: '5',
      sessionId: 'sess-1',
      anchorEventTime: anchor,
      writeEventTime: write,
      turns: [
        { id: '4188', startedAt: new Date('2026-05-28T06:10:00.000Z') },
        { id: '4189', startedAt: new Date('2026-05-28T06:20:00.000Z') },
      ],
    });

    expect(out).toHaveLength(2);
    expect(out[0]).toEqual({
      turnKey: sha256('turn:3:4188'),
      artifactId: '3',
      workItemId: '7',
      interactionId: '4188',
      skillUsageId: '99',
      userId: '5',
      sessionId: 'sess-1',
      anchorEventTime: anchor,
      writeEventTime: write,
      eventTime: new Date('2026-05-28T06:10:00.000Z'),
      ruleVersion: 'doc-conversation-v1',
    });
    expect(out[1].turnKey).toBe(sha256('turn:3:4189'));
  });

  it('空 turns 返回空数组', () => {
    expect(
      buildArtifactTurnInputs({
        artifactId: '3',
        workItemId: '7',
        skillUsageId: null,
        userId: null,
        sessionId: null,
        anchorEventTime: null,
        writeEventTime: null,
        turns: [],
      }),
    ).toEqual([]);
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `pnpm --filter @sdd-telemetry/worker exec vitest run test/artifact-turns.test.ts`
Expected: FAIL — `buildArtifactTurnInputs` is not exported / not a function。

- [ ] **Step 3: 实现纯函数**

在 `worker/src/jobs/cleaning-worker.ts` 中（紧邻其它导出纯函数，如 `attachSkillUsageToToolCallsForOneInteraction` 之后），加：

```ts
export interface SessionTurnRef {
  id: string;
  startedAt: Date | null;
}

export function buildArtifactTurnInputs(input: {
  artifactId: string;
  workItemId: string;
  skillUsageId: string | null;
  userId: string | null;
  sessionId: string | null;
  anchorEventTime: Date | null;
  writeEventTime: Date | null;
  turns: SessionTurnRef[];
}): UpsertArtifactTurnInput[] {
  return input.turns.map((turn) => ({
    turnKey: sha256(`turn:${input.artifactId}:${turn.id}`),
    artifactId: input.artifactId,
    workItemId: input.workItemId,
    interactionId: turn.id,
    skillUsageId: input.skillUsageId,
    userId: input.userId,
    sessionId: input.sessionId,
    anchorEventTime: input.anchorEventTime,
    writeEventTime: input.writeEventTime,
    eventTime: turn.startedAt,
    ruleVersion: 'doc-conversation-v1',
  }));
}
```

并确保从仓库 import 了类型 `UpsertArtifactTurnInput`——在 `cleaning-worker.ts` 顶部对 `./cleaning.repository` 的既有 import 里追加 `UpsertArtifactTurnInput`（`sha256` 已是本文件既有工具函数）。

- [ ] **Step 4: 跑测试确认通过**

Run: `pnpm --filter @sdd-telemetry/worker exec vitest run test/artifact-turns.test.ts`
Expected: PASS（2 passed）。

- [ ] **Step 5: 提交**

```bash
git add worker/src/jobs/cleaning-worker.ts worker/test/artifact-turns.test.ts
git commit -m "feat(worker): buildArtifactTurnInputs 纯函数 + 单测"
```

---

### Task 5: worker 派生接线

**Files:**
- Modify: `worker/src/jobs/cleaning-worker.ts`（`upsertWorkItems` 内追加 + 新增 `upsertArtifactDiscussionTurns`）

- [ ] **Step 1: 新增接线函数**

在 `cleaning-worker.ts` 中 `upsertWorkItems` 之后，加：

```ts
async function upsertArtifactDiscussionTurns(
  connection: PoolConnection,
  input: {
    artifactId: string;
    workItemId: string;
    skillUsageId: string | null;
    candidate: SkillCandidate;
    writeEvent: EventRow;
  },
): Promise<void> {
  const sessionId = input.writeEvent.session_id;
  const writeEventTime = asDate(input.writeEvent.event_time);
  if (!sessionId || !writeEventTime) return;

  const anchorEventTime = asDate(input.candidate.event.event_time);
  const turns = await cleaningRepository.listDiscussionTurnsForWrite(connection, {
    sessionId,
    anchorPromptId: input.candidate.event.prompt_id ?? null,
    anchorEventTime,
    writeEventTime,
  });
  if (turns.length === 0) return;

  const inputs = buildArtifactTurnInputs({
    artifactId: input.artifactId,
    workItemId: input.workItemId,
    skillUsageId: input.skillUsageId,
    userId: input.writeEvent.user_id != null ? String(input.writeEvent.user_id) : null,
    sessionId,
    anchorEventTime,
    writeEventTime,
    turns,
  });
  for (const turnInput of inputs) {
    await cleaningRepository.upsertArtifactTurn(connection, turnInput);
  }
}
```

- [ ] **Step 2: 在写入点之后调用**

在 `upsertWorkItems` 内 `if (artifactId) { ... }` 块里、`await cleaningRepository.upsertArtifactWrite({ ... });` 调用之后（仍在该 `if` 块内，`skillUsageId` 在作用域内），追加：

```ts
      if (attribution.skillCandidate) {
        await upsertArtifactDiscussionTurns(connection, {
          artifactId,
          workItemId,
          skillUsageId,
          candidate: attribution.skillCandidate,
          writeEvent: event,
        });
      }
```

- [ ] **Step 3: typecheck**

Run: `pnpm --filter @sdd-telemetry/worker lint`
Expected: 无类型错误（`SkillCandidate`、`EventRow`、`asDate`、`PoolConnection` 均本文件既有）。

- [ ] **Step 4: build + 跑一轮 worker，确认无报错且路径执行**

Run:
```bash
pnpm --filter @sdd-telemetry/worker build && pnpm --filter @sdd-telemetry/worker once
SQL "SELECT COUNT(*) AS turns, COUNT(DISTINCT artifact_id) AS docs FROM sdd_work_item_artifact_turns;"
```
Expected: worker 跑完 outbox 清空、无异常。`turns` 可能为 0（现有 demo session 多为「激活即写」的单交互，窗口内无独立讨论 turn）——这正常，**数据级证伪在 Task 9 回填后做**。本步只证明派生路径无错执行。

- [ ] **Step 5: 提交**

```bash
git add worker/src/jobs/cleaning-worker.ts
git commit -m "feat(worker): 派生 artifact 时归因生成对话 turn 到 artifact_turns"
```

---

### Task 6: contract 扩展（nodeKind + writeKind 可空）

**Files:**
- Modify: `packages/api/src/contracts/sdd.contract.ts`（`SddArtifactWriteSchema`）

- [ ] **Step 1: 改 schema**

把 `SddArtifactWriteSchema` 改为：

```ts
export const SddArtifactWriteSchema = z.object({
  id: IdSchema,
  nodeKind: z.enum(['write', 'discussion']),
  writeKind: z.string().nullable(),
  eventTime: ISODateTimeSchema.nullable(),
  eventSequence: z.number().nullable(),
  interactionId: IdSchema.nullable(),
  skillSemanticCode: z.string().nullable(),
  skillDisplayName: z.string().nullable(),
  rawSkillName: z.string().nullable(),
  wikiRecallCount: z.number(),
  promptPreview: z.string().nullable(),
  contentPreview: z.string().nullable(),
});
```

（仅新增 `nodeKind`、把 `writeKind` 从 `z.string()` 改为 `z.string().nullable()`；其余不动。`SddArtifactWriteListResponseSchema` 与类型导出不变。）

- [ ] **Step 2: build contract**

Run: `pnpm --filter @sdd-telemetry/api build`
Expected: 构建通过。

- [ ] **Step 3: 提交**

```bash
git add packages/api/src/contracts/sdd.contract.ts
git commit -m "feat(api): artifact 时间线节点新增 nodeKind、writeKind 改可空"
```

---

### Task 7: 读侧仓库——UNION 时间线

**Files:**
- Modify: `server/src/modules/sdd/sdd-query.repository.ts`（`ArtifactWriteRow` 接口 + `listArtifactWrites` 方法）

- [ ] **Step 1: 扩展 row 类型**

`ArtifactWriteRow` 接口里把 `write_kind` 改为可空，并加 `node_kind`：

```ts
export interface ArtifactWriteRow {
  id: string | number;
  node_kind: string;
  write_kind: string | null;
  event_time: Date | string | null;
  event_sequence: number | null;
  interaction_id: string | number | null;
  content_preview: string | null;
  raw_skill_name: string | null;
  skill_semantic_code: string | null;
  skill_display_name: string | null;
  prompt_text: string | null;
  wiki_recall_count: string | number;
}
```

- [ ] **Step 2: 重写 `listArtifactWrites` 查询为 UNION**

把 `listArtifactWrites` 方法体替换为：

```ts
  async listArtifactWrites(
    workItemId: string,
    artifactId: string,
  ): Promise<ArtifactWriteRow[]> {
    const dataSource = await this.mysqlDataSourceManager.getDataSource();
    return (await dataSource.query(
      `SELECT timeline.* FROM (
         SELECT w.id, 'write' AS node_kind, w.write_kind, w.event_time, w.event_sequence,
                w.interaction_id, w.content_preview, su.raw_skill_name,
                sem.semantic_code AS skill_semantic_code, sem.display_name AS skill_display_name,
                it.prompt_text,
                (SELECT COUNT(*) FROM sdd_wiki_recalls wr WHERE wr.interaction_id = w.interaction_id) AS wiki_recall_count
         FROM sdd_work_item_artifact_writes w
         LEFT JOIN sdd_skill_usages su ON su.id = w.skill_usage_id
         LEFT JOIN sdd_skill_semantics sem ON sem.id = su.semantic_id
         LEFT JOIN sdd_interaction_texts it ON it.interaction_id = w.interaction_id
         WHERE w.work_item_id = ? AND w.artifact_id = ?
         UNION ALL
         SELECT t.id, 'discussion' AS node_kind, NULL AS write_kind, t.event_time,
                NULL AS event_sequence, t.interaction_id, NULL AS content_preview, su.raw_skill_name,
                sem.semantic_code AS skill_semantic_code, sem.display_name AS skill_display_name,
                it.prompt_text,
                (SELECT COUNT(*) FROM sdd_wiki_recalls wr WHERE wr.interaction_id = t.interaction_id) AS wiki_recall_count
         FROM sdd_work_item_artifact_turns t
         LEFT JOIN sdd_skill_usages su ON su.id = t.skill_usage_id
         LEFT JOIN sdd_skill_semantics sem ON sem.id = su.semantic_id
         LEFT JOIN sdd_interaction_texts it ON it.interaction_id = t.interaction_id
         WHERE t.work_item_id = ? AND t.artifact_id = ?
       ) timeline
       ORDER BY timeline.event_time IS NULL, timeline.event_time ASC,
                FIELD(timeline.node_kind, 'discussion', 'write'), timeline.id ASC`,
      [workItemId, artifactId, workItemId, artifactId],
    )) as ArtifactWriteRow[];
  }
```

> 排序以 `event_time` 为主（两表 `id` 各自递增、不可跨表比较，仅作末位 tiebreak）；同刻讨论排在写入前。

- [ ] **Step 3: typecheck**

Run: `pnpm --filter @sdd-telemetry/server lint`
Expected: 报 `sdd-query.service.ts` 里映射缺 `nodeKind`——下一个 Task 修。可先确认仅此处错。

- [ ] **Step 4: 提交**

```bash
git add server/src/modules/sdd/sdd-query.repository.ts
git commit -m "feat(server): 文档时间线读侧 UNION 讨论 turn 与写入节点"
```

---

### Task 8: 读侧服务映射

**Files:**
- Modify: `server/src/modules/sdd/sdd-query.service.ts`（`listArtifactWrites` 映射）

- [ ] **Step 1: 映射新字段**

在 `listArtifactWrites` 的 `rows.map(...)` 里，每个 item 加 `nodeKind`，`writeKind` 改为透传可空：

```ts
      items: rows.map((row: ArtifactWriteRow) => ({
        id: toStringId(row.id),
        nodeKind: row.node_kind === 'discussion' ? 'discussion' : 'write',
        writeKind: row.write_kind,
        eventTime: toIsoDate(row.event_time),
        eventSequence: row.event_sequence === null ? null : toNumber(row.event_sequence),
        interactionId: row.interaction_id === null ? null : toStringId(row.interaction_id),
        skillSemanticCode: row.skill_semantic_code,
        skillDisplayName: row.skill_display_name,
        rawSkillName: row.raw_skill_name,
        wikiRecallCount: toNumber(row.wiki_recall_count),
        promptPreview: row.prompt_text ? row.prompt_text.slice(0, 200) : null,
        contentPreview: row.content_preview,
      })),
```

（`nodeKind` 显式收敛成联合字面量，满足 contract 的 `z.enum`。）

- [ ] **Step 2: typecheck + build server**

Run: `pnpm --filter @sdd-telemetry/server lint && pnpm --filter @sdd-telemetry/server build`
Expected: 通过。

- [ ] **Step 3: API contract 回归**

Run: `pnpm --filter @sdd-telemetry/server test:api`
Expected: PASS（`writeKind` 转可空向后兼容，写入行仍带值）。

- [ ] **Step 4: 起服务，curl 一个已知文档的时间线**

Run（dev 模式，按需 `pnpm dev:server`）:
```bash
curl -s "http://localhost:3000/api/sdd/work-items/3/artifacts/3/writes" | head -c 800
```
Expected: 返回 `items` 数组，每个节点含 `nodeKind`（现有数据下应至少有 `write` 节点；回填前可能无 `discussion`）。

- [ ] **Step 5: 提交**

```bash
git add server/src/modules/sdd/sdd-query.service.ts
git commit -m "feat(server): 时间线服务映射 nodeKind"
```

---

### Task 9: 历史回填脚本（数据级证伪在此完成）

**Files:**
- Create: `server/src/infrastructure/mysql/backfill-artifact-turns.ts`

- [ ] **Step 1: 写回填脚本（单条 set-based SQL，幂等）**

`server/src/infrastructure/mysql/backfill-artifact-turns.ts`：

```ts
/**
 * 一次性回填：为存量 artifact 写入补出「生成对话」讨论 turn。
 * 窗口：同 session、[控制它的 skill 运行激活 turn started_at, 写入 event_time)，排除写入节点 turn。
 * 幂等：turn_key = sha256('turn:' + artifact_id + ':' + interaction_id)，与 worker 口径一致。
 */
import { createAppDataSource } from './data-source';

async function main(): Promise<void> {
  const ds = await createAppDataSource();
  await ds.initialize();
  try {
    const result = await ds.query(`
      INSERT IGNORE INTO sdd_work_item_artifact_turns
        (turn_key, artifact_id, work_item_id, interaction_id, skill_usage_id, user_id,
         session_id, anchor_event_time, write_event_time, event_time, rule_version,
         gmt_create, gmt_modified)
      SELECT
        SHA2(CONCAT('turn:', w.artifact_id, ':', i.id), 256),
        w.artifact_id, w.work_item_id, i.id, w.skill_usage_id, i.user_id,
        w.session_id, COALESCE(anchor.started_at, su.event_time), w.event_time, i.started_at,
        'doc-conversation-v1', CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)
      FROM sdd_work_item_artifact_writes w
      JOIN sdd_skill_usages su ON su.id = w.skill_usage_id
      LEFT JOIN sdd_interactions anchor ON anchor.id = su.interaction_id
      JOIN sdd_interactions i
        ON i.session_id = w.session_id
       AND i.started_at IS NOT NULL
       AND i.started_at < w.event_time
       AND i.started_at >= COALESCE(anchor.started_at, su.event_time)
      WHERE w.skill_usage_id IS NOT NULL
        AND w.session_id IS NOT NULL
        AND w.event_time IS NOT NULL
        AND i.id NOT IN (
          SELECT awr.interaction_id FROM sdd_work_item_artifact_writes awr
          WHERE awr.session_id = w.session_id AND awr.interaction_id IS NOT NULL
        )
    `);
    console.info('[backfill-artifact-turns] done', result);
  } finally {
    await ds.destroy();
  }
}

if (require.main === module) {
  void main();
}
```

- [ ] **Step 2: 跑回填**

Run:
```bash
pnpm --filter @sdd-telemetry/server exec tsx src/infrastructure/mysql/backfill-artifact-turns.ts
```
Expected: 打印 done，无异常。

- [ ] **Step 3: 可证伪校验——窗口归因正确**

Run:
```bash
SQL "SELECT artifact_id, COUNT(*) AS discussion_turns FROM sdd_work_item_artifact_turns GROUP BY artifact_id;"
SQL "SELECT t.artifact_id, t.interaction_id, t.event_time
     FROM sdd_work_item_artifact_turns t ORDER BY t.artifact_id, t.event_time LIMIT 20;"
```
Expected（可证伪）：
- 回填出的讨论 turn 的 `event_time` 严格落在该 artifact 写入时间之前、且 ≥ 其 skill 激活时间；
- 这些 `interaction_id` 不出现在 `sdd_work_item_artifact_writes`（不是写入节点）；
- 若对某文档手工数「激活→写入」间的交互数 = 该文档讨论 turn 数，则归因正确（区分「修好+无数据」与「错配」）。

> 注：当前 demo 数据里 WI3/WI1 的 proposal 多为单交互「激活即写」，可能回填 0 行——这本身可证伪（不是 bug，是这些 session 确实没有独立讨论 turn）。如需端到端看到讨论节点，挑一个「激活后多轮问答、最后才写」的真实 session 验证；或在 dev 里跑一遍带多轮问答的 `/bk-fe-design` 后 `pnpm db:reclean`。

- [ ] **Step 4: 提交**

```bash
git add server/src/infrastructure/mysql/backfill-artifact-turns.ts
git commit -m "feat(server): artifact 生成对话 turn 历史回填脚本"
```

---

### Task 10: 前端时间线渲染讨论节点

**Files:**
- Modify: `web/src/pages/sdd/work-items/components/ArtifactWriteTimeline.tsx`

- [ ] **Step 1: 渲染区分 write / discussion**

把 `ArtifactWriteTimeline.tsx` 改为按 `nodeKind` 区分（讨论节点用更轻样式 + `MessageSquare` 图标，写入节点保持现状；表头统计区分节点数与写入数；React key 用 `nodeKind-id` 复合避免跨表 id 撞键）：

```tsx
import type { SddArtifactWrite } from '@sdd-telemetry/api';
import { BookOpen, GitCommit, MessageSquare } from 'lucide-react';
import { formatTime } from '@/lib/format';

const CARD_STYLE = { border: '1px solid var(--color-border)', background: 'var(--color-surface)' };

export function ArtifactWriteTimeline({
  writes,
  isLoading,
  onOpenTurn,
}: {
  writes: SddArtifactWrite[];
  isLoading: boolean;
  onOpenTurn: (interactionId: string) => void;
}) {
  const writeCount = writes.filter((w) => w.nodeKind === 'write').length;

  return (
    <section className="rounded-[6px] overflow-hidden" style={CARD_STYLE}>
      <div className="flex items-center gap-2 px-[14px] py-3" style={{ borderBottom: '1px solid var(--color-border)', color: 'var(--color-primary)' }}>
        <GitCommit size={16} />
        <h3 className="text-[13px] font-semibold text-[#f5f5f5]">生成时间线</h3>
        <span className="text-[11px] text-[var(--color-muted)]">· {writes.length} 个节点（{writeCount} 次写入）</span>
      </div>

      {isLoading ? (
        <div className="px-[14px] py-6 text-[12px] text-[var(--color-muted)]">正在加载时间线…</div>
      ) : writes.length === 0 ? (
        <div className="px-[14px] py-6 text-[12px] text-[var(--color-muted)]">
          暂无记录（event 层约 30 天内的写入与对话才会出现；更早的需求请见 summary）
        </div>
      ) : (
        <div className="grid">
          {writes.map((w) => {
            const isDiscussion = w.nodeKind === 'discussion';
            return (
              <div key={`${w.nodeKind}-${w.id}`} className="flex flex-col gap-[6px] px-[14px] py-[12px]" style={{ borderBottom: '1px solid var(--color-border)' }}>
                <div className="flex items-center gap-2 text-[11px]">
                  <span className="text-[var(--color-muted)]" style={{ fontFamily: 'var(--font-mono)' }}>{formatTime(w.eventTime)}</span>
                  {isDiscussion ? (
                    <span className="inline-flex items-center gap-1 px-[6px] py-[1px] rounded-[3px] text-[10px] text-[var(--color-muted)]" style={{ background: 'rgba(255,255,255,0.04)' }}>
                      <MessageSquare size={10} /> 讨论
                    </span>
                  ) : (
                    <span className="px-[6px] py-[1px] rounded-[3px] text-[10px]" style={{ color: 'var(--color-secondary)', background: 'rgba(255,255,255,0.06)' }}>{w.writeKind}</span>
                  )}
                  <span className="text-[var(--color-secondary)]">{w.skillDisplayName ?? w.rawSkillName ?? '无 skill'}</span>
                  <span className="inline-flex items-center gap-1 text-[var(--color-muted)]">
                    <BookOpen size={11} /> wiki×{w.wikiRecallCount}
                  </span>
                </div>
                {w.promptPreview ? (
                  <p className="text-[12px] text-[var(--color-text)] overflow-hidden" style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>{w.promptPreview}</p>
                ) : (
                  <p className="text-[12px] text-[var(--color-muted)]">（无 prompt 文本）</p>
                )}
                {w.interactionId ? (
                  <button
                    onClick={() => onOpenTurn(w.interactionId!)}
                    className="self-start text-[11px] px-[8px] py-[3px] rounded-[4px]"
                    style={{ color: 'var(--color-primary)', border: '1px solid rgba(250,255,105,0.22)', background: 'rgba(250,255,105,0.06)' }}
                  >
                    展开全文
                  </button>
                ) : (
                  <span className="self-start text-[11px] text-[var(--color-muted)]">无可回溯的交互</span>
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
```

- [ ] **Step 2: typecheck + build web**

Run: `pnpm --filter @sdd-telemetry/web lint && pnpm --filter @sdd-telemetry/web build`
Expected: 通过（`SddArtifactWrite` 已带 `nodeKind`；`writeKind` 可空仅在 write 分支用到，受 `isDiscussion` 守卫）。

- [ ] **Step 3: 目视验证**

起 `pnpm dev:web`，打开 `http://localhost:5173/sdd/work-items/3`，选中文档：写入节点与讨论节点按时间交错出现，讨论节点带「讨论」标，点任一节点抽屉出全文。

- [ ] **Step 4: 提交**

```bash
git add web/src/pages/sdd/work-items/components/ArtifactWriteTimeline.tsx
git commit -m "feat(web): 生成时间线渲染讨论节点（write/discussion 区分）"
```

---

### Task 11: 文档保鲜

**Files:**
- Modify: `docs/database-model.md`（新表 `sdd_work_item_artifact_turns`）
- Modify: `docs/api-contract.md`（时间线节点新增 `nodeKind`、`writeKind` 可空、discussion 节点语义）

- [ ] **Step 1: 更新 database-model.md**

在 `sdd_work_item_artifact_writes` 一节之后，补 `sdd_work_item_artifact_turns` 表说明：字段含义、`turn_key` 幂等口径、与 writes 表的关系（平行、只存讨论 turn）、归因窗口规则、`rule_version='doc-conversation-v1'`。

- [ ] **Step 2: 更新 api-contract.md**

在 `GET /work-items/:workItemId/artifacts/:artifactId/writes` 一节：节点新增 `nodeKind: 'write' | 'discussion'`；`writeKind` 改为可空（discussion 为 null）；说明返回是「写入 ∪ 讨论」按时间合并的时间线。

- [ ] **Step 3: 旧路径残留检查（保鲜硬约束）**

Run:
```bash
rg --hidden "ap""ps/(web|server|worker)|\./ap""ps/(web|server|worker)|ap""ps/" . -g '!node_modules/**' -g '!.git/**'
```
Expected: 无新增命中（本次未动目录结构）。

- [ ] **Step 4: 提交**

```bash
git add docs/database-model.md docs/api-contract.md
git commit -m "docs: 同步 artifact_turns 表与时间线节点 nodeKind 接口"
```

---

## 最终验证（对照设计 §12）

- [ ] `pnpm typecheck && pnpm build` 全绿。
- [ ] `pnpm db:migrate && pnpm db:verify` 通过，新表在册。
- [ ] worker `once` 派生无异常；回填脚本可重复跑不产生重复（`turn_key` 唯一）。
- [ ] 可证伪：讨论 turn 时间严格落窗口内、不与写入节点 interaction 重叠；多文档 session 不串台（查另一篇的 interaction 不应出现在本篇）。
- [ ] 前端：文档时间线出现讨论节点 + 写入节点，点节点抽屉出全文，链路无断点。

---

## Self-Review（计划对照设计 spec）

- **Spec 覆盖**：§4 数据模型→Task 1/2；§5 worker 派生→Task 3/4/5；§6 API→Task 6/7/8；§7 前端→Task 10；§9 回填+reclean+保鲜→Task 1(Step 3)/9/11。全部有任务承接，无缺口。
- **Placeholder 扫描**：无 TBD/TODO；每个改动步骤都给了完整代码与可执行命令 + 预期。
- **类型一致性**：`UpsertArtifactTurnInput`（Task 3 定义）= `buildArtifactTurnInputs` 返回（Task 4）= `upsertArtifactTurn` 入参（Task 3）；`turn_key` 口径 `sha256('turn:'+artifactId+':'+interactionId)` 在 worker（Task 4）与回填 SQL（Task 9）一致；contract 的 `nodeKind`/`writeKind?`（Task 6）与读侧 row（Task 7）、服务映射（Task 8）、前端消费（Task 10）逐一对齐。
- **已知取舍**：窗口下界=激活 turn（设计 §10）；demo 数据稀疏，数据级证伪放在 Task 9 回填后——计划中已显式标注，不掩盖。
