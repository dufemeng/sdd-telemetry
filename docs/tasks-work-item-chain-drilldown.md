# 需求链路下钻 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: 用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 按任务逐条执行。步骤用 checkbox（`- [ ]`）跟踪。

**Goal:** 在产出分析下增加「需求详情页」，从需求下钻到文档、再到每篇文档的「生成时间线」，时间线每个节点可回溯到那次 prompt 的全文。

**Architecture:** 新增派生表 `sdd_work_item_artifact_writes`，worker 在派生 artifact 时顺手记录每次写入；服务端新增生成时间线查询接口并扩展需求详情 summary；前端新增 `/sdd/work-items/:id` 详情路由（两栏：文档列表 | 生成时间线），turn 全文复用从交互明细抽出的共享 `InteractionDetailDrawer`。

**Tech Stack:** TypeScript / Midway（Koa）+ TypeORM + mysql2 / React Router v7 + TanStack Query / Zod contract（`@sdd-telemetry/api`）/ pnpm + turbo monorepo。

**验证约定（重要）：** 本仓库无单测 runner。按 `CLAUDE.md`，每个任务的验证用：`pnpm typecheck`、`pnpm build`、必要时 `docker compose up -d mysql` + `pnpm db:migrate` + `pnpm --filter @sdd-telemetry/worker once` + SQL / HTTP 抽查。构造可证伪查询，区分「修好+无数据」与「未修好+错配」。提交只在最后或用户要求时进行，commit message 用中文。

---

## 文件结构总览

**新建**
- `server/src/infrastructure/mysql/migrations/1780000003000-create-artifact-writes.ts` — 建表迁移
- `server/src/infrastructure/mysql/entities/sdd-work-item-artifact-write.entity.ts` — 实体
- `server/src/infrastructure/mysql/backfill-artifact-writes.ts` — 一次性回填脚本（从 event 层）
- `web/src/components/sdd/InteractionDetailDrawer.tsx` — 从交互明细抽出的共享全文抽屉
- `web/src/pages/sdd/work-items/WorkItemDetailPage.tsx` — 需求详情页（两栏）
- `web/src/pages/sdd/work-items/components/ArtifactList.tsx` — 左栏文档列表
- `web/src/pages/sdd/work-items/components/ArtifactWriteTimeline.tsx` — 右栏生成时间线
- `web/src/pages/sdd/work-items/useArtifactWrites.ts` — 生成时间线 hook

**修改**
- `worker/src/jobs/cleaning.repository.ts` — 新增 `UpsertArtifactWriteInput` / `upsertArtifactWrite` / `findArtifactIdByKey` / `findInteractionIdByPromptId` / `findSkillUsageIdForArtifact`
- `worker/src/jobs/cleaning-worker.ts` — `upsertWorkItems` 内追加写入记录；新增 `extractWriteKind`
- `packages/api/src/contracts/sdd.contract.ts` — 新增 `SddArtifactWrite*` schema；扩展 `SddWorkItemDetailSchema` summary 字段
- `server/src/modules/sdd/sdd-query.repository.ts` — 新增 timeline 查询 + summary 计数
- `server/src/modules/sdd/sdd-query.service.ts` — 新增 `listArtifactWrites`；`getWorkItemDetail` 补 summary
- `server/src/modules/sdd/sdd.controller.ts` — 新增 timeline 路由
- `server/src/infrastructure/mysql/entities/index.ts` — 注册新实体
- `server/src/infrastructure/mysql/verify-schema.ts` — 校验新表
- `web/src/pages/sdd/work-items/useSddWorkItems.ts` — 复用（详情 hook 已有，summary 字段随类型扩展自动带出）
- `web/src/pages/sdd/work-items/WorkItemsPage.tsx` — 行点击改为路由跳转，移除旧 `RowInspectorDrawer` 详情段
- `web/src/pages/sdd/interactions/InteractionsPage.tsx` — 改用共享 `InteractionDetailDrawer`
- `web/src/router.tsx` — 注册 `sdd/work-items/:id`
- `docs/database-model.md`、`docs/api-contract.md` — 文档保鲜

---

## Task 1: 派生表迁移 + 实体 + schema 校验

**Files:**
- Create: `server/src/infrastructure/mysql/migrations/1780000003000-create-artifact-writes.ts`
- Create: `server/src/infrastructure/mysql/entities/sdd-work-item-artifact-write.entity.ts`
- Modify: `server/src/infrastructure/mysql/entities/index.ts`
- Modify: `server/src/infrastructure/mysql/verify-schema.ts`

- [ ] **Step 1: 写迁移**（仿 `1780000001000-create-wiki-recalls.ts` 的 `tableExists` 守卫风格）

```ts
import type { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateArtifactWrites1780000003000 implements MigrationInterface {
  name = 'CreateArtifactWrites1780000003000';

  async up(queryRunner: QueryRunner): Promise<void> {
    if (await tableExists(queryRunner, 'sdd_work_item_artifact_writes')) return;

    await queryRunner.query(`
      CREATE TABLE \`sdd_work_item_artifact_writes\` (
        \`id\` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        \`write_key\` CHAR(64) NOT NULL,
        \`artifact_id\` BIGINT UNSIGNED NOT NULL,
        \`work_item_id\` BIGINT UNSIGNED NOT NULL,
        \`interaction_id\` BIGINT UNSIGNED NULL,
        \`skill_usage_id\` BIGINT UNSIGNED NULL,
        \`user_id\` BIGINT UNSIGNED NULL,
        \`session_id\` VARCHAR(191) NULL,
        \`prompt_id\` VARCHAR(191) NULL,
        \`event_id\` CHAR(64) NULL,
        \`write_kind\` VARCHAR(32) NOT NULL,
        \`content_preview\` TEXT NULL,
        \`event_sequence\` INT UNSIGNED NULL,
        \`event_time\` DATETIME(3) NULL,
        \`rule_version\` VARCHAR(32) NOT NULL,
        \`gmt_create\` DATETIME(3) NOT NULL,
        \`gmt_modified\` DATETIME(3) NOT NULL,
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`uk_artifact_write_key\` (\`write_key\`),
        KEY \`idx_artifact_writes_artifact_event_time\` (\`artifact_id\`, \`event_time\`),
        KEY \`idx_artifact_writes_work_item_id\` (\`work_item_id\`),
        KEY \`idx_artifact_writes_interaction_id\` (\`interaction_id\`),
        KEY \`idx_artifact_writes_skill_usage_id\` (\`skill_usage_id\`),
        KEY \`idx_artifact_writes_event_time\` (\`event_time\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    if (await tableExists(queryRunner, 'sdd_work_item_artifact_writes')) {
      await queryRunner.query(`DROP TABLE \`sdd_work_item_artifact_writes\``);
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

- [ ] **Step 2: 写实体**（仿 `sdd-work-item-artifact.entity.ts`，用 `TimestampedEntity` / `NullableDateColumn`）

```ts
import { Column, Entity, Index } from 'typeorm';
import { NullableDateColumn, TimestampedEntity } from './common';

@Entity({ name: 'sdd_work_item_artifact_writes' })
@Index('uk_artifact_write_key', ['writeKey'], { unique: true })
@Index('idx_artifact_writes_work_item_id', ['workItemId'])
@Index('idx_artifact_writes_interaction_id', ['interactionId'])
@Index('idx_artifact_writes_skill_usage_id', ['skillUsageId'])
export class SddWorkItemArtifactWriteEntity extends TimestampedEntity {
  @Column({ name: 'write_key', type: 'char', length: 64 })
  writeKey!: string;

  @Column({ name: 'artifact_id', type: 'bigint', unsigned: true })
  artifactId!: string;

  @Column({ name: 'work_item_id', type: 'bigint', unsigned: true })
  workItemId!: string;

  @Column({ name: 'interaction_id', type: 'bigint', unsigned: true, nullable: true })
  interactionId!: string | null;

  @Column({ name: 'skill_usage_id', type: 'bigint', unsigned: true, nullable: true })
  skillUsageId!: string | null;

  @Column({ name: 'user_id', type: 'bigint', unsigned: true, nullable: true })
  userId!: string | null;

  @Column({ name: 'session_id', type: 'varchar', length: 191, nullable: true })
  sessionId!: string | null;

  @Column({ name: 'prompt_id', type: 'varchar', length: 191, nullable: true })
  promptId!: string | null;

  @Column({ name: 'event_id', type: 'char', length: 64, nullable: true })
  eventId!: string | null;

  @Column({ name: 'write_kind', type: 'varchar', length: 32 })
  writeKind!: string;

  @Column({ name: 'content_preview', type: 'text', nullable: true })
  contentPreview!: string | null;

  @Column({ name: 'event_sequence', type: 'int', unsigned: true, nullable: true })
  eventSequence!: number | null;

  @NullableDateColumn('event_time')
  eventTime!: Date | null;

  @Column({ name: 'rule_version', type: 'varchar', length: 32 })
  ruleVersion!: string;
}
```

- [ ] **Step 3: 注册实体**：在 `entities/index.ts` 仿现有 artifact 实体的两处（import + 导出数组）加入 `SddWorkItemArtifactWriteEntity`。先 `rg -n "SddWorkItemArtifactEntity" server/src/infrastructure/mysql/entities/index.ts` 定位两处，照同样形式追加。

- [ ] **Step 4: schema 校验**：在 `verify-schema.ts` 找到校验表清单（`rg -n "sdd_wiki_recalls|sdd_work_item_artifacts" server/src/infrastructure/mysql/verify-schema.ts`），按同样形式把 `sdd_work_item_artifact_writes` 加入期望表集合。

- [ ] **Step 5: 迁移 + 校验**

Run:
```bash
docker compose up -d mysql
pnpm db:migrate
pnpm db:verify
```
Expected: 迁移执行无报错；`db:verify` 通过，列出 `sdd_work_item_artifact_writes`。

- [ ] **Step 6: typecheck**

Run: `pnpm --filter @sdd-telemetry/server typecheck`
Expected: PASS（新实体类型无误）。

- [ ] **Step 7: 提交（如启用逐任务提交）**

```bash
git add server/src/infrastructure/mysql
git commit -m "feat(db): 新增 sdd_work_item_artifact_writes 派生表与实体"
```

---

## Task 2: worker 记录每次 artifact 写入

**Files:**
- Modify: `worker/src/jobs/cleaning.repository.ts`（新增 input 接口 + 4 个方法）
- Modify: `worker/src/jobs/cleaning-worker.ts:944`（upsert 后追加写入记录）+ 新增 `extractWriteKind`

- [ ] **Step 1: cleaning.repository.ts 新增 input 接口**（放在 `UpsertWikiRecallInput` 附近）

```ts
export interface UpsertArtifactWriteInput {
  writeKey: string;
  artifactId: string;
  workItemId: string;
  interactionId: string | null;
  skillUsageId: string | null;
  userId: string | null;
  sessionId: string | null;
  promptId: string | null;
  eventId: string | null;
  writeKind: string;
  contentPreview: string | null;
  eventSequence: number | null;
  eventTime: Date | null;
  ruleVersion: string;
}
```

- [ ] **Step 2: cleaning.repository.ts 新增方法**（加在 `CleaningRepository` 类内，仿 `upsertWikiRecall` / `findIdByKey`）

```ts
async upsertArtifactWrite(
  connection: PoolConnection,
  input: UpsertArtifactWriteInput,
): Promise<void> {
  await connection.query<ResultSetHeader>(
    `INSERT INTO sdd_work_item_artifact_writes
      (write_key, artifact_id, work_item_id, interaction_id, skill_usage_id, user_id,
       session_id, prompt_id, event_id, write_kind, content_preview, event_sequence,
       event_time, rule_version, gmt_create, gmt_modified)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3))
     ON DUPLICATE KEY UPDATE
       interaction_id = COALESCE(VALUES(interaction_id), interaction_id),
       skill_usage_id = COALESCE(VALUES(skill_usage_id), skill_usage_id),
       user_id = COALESCE(VALUES(user_id), user_id),
       session_id = COALESCE(VALUES(session_id), session_id),
       prompt_id = COALESCE(VALUES(prompt_id), prompt_id),
       write_kind = VALUES(write_kind),
       content_preview = COALESCE(VALUES(content_preview), content_preview),
       event_sequence = COALESCE(VALUES(event_sequence), event_sequence),
       event_time = COALESCE(VALUES(event_time), event_time),
       rule_version = VALUES(rule_version),
       gmt_modified = CURRENT_TIMESTAMP(3)`,
    [
      input.writeKey,
      input.artifactId,
      input.workItemId,
      input.interactionId,
      input.skillUsageId,
      input.userId,
      input.sessionId,
      input.promptId,
      input.eventId,
      input.writeKind,
      input.contentPreview,
      input.eventSequence,
      input.eventTime,
      input.ruleVersion,
    ],
  );
}

async findArtifactIdByKey(
  connection: PoolConnection,
  artifactKey: string,
): Promise<string | null> {
  const [rows] = await connection.query<IdRow[]>(
    `SELECT id FROM sdd_work_item_artifacts WHERE artifact_key = ? LIMIT 1`,
    [artifactKey],
  );
  const id = rows[0]?.id;
  return id ? String(id) : null;
}

async findInteractionIdByPromptId(
  connection: PoolConnection,
  promptId: string,
): Promise<string | null> {
  const [rows] = await connection.query<IdRow[]>(
    `SELECT id FROM sdd_interactions WHERE prompt_id = ? ORDER BY id ASC LIMIT 1`,
    [promptId],
  );
  const id = rows[0]?.id;
  return id ? String(id) : null;
}

async findSkillUsageIdForArtifact(
  connection: PoolConnection,
  sessionId: string,
  rawSkillName: string,
  beforeTime: Date | null,
): Promise<string | null> {
  const [rows] = await connection.query<IdRow[]>(
    `SELECT id FROM sdd_skill_usages
     WHERE session_id = ? AND raw_skill_name = ?
       AND (? IS NULL OR event_time IS NULL OR event_time <= ?)
     ORDER BY event_time DESC, id DESC
     LIMIT 1`,
    [sessionId, rawSkillName, beforeTime, beforeTime],
  );
  const id = rows[0]?.id;
  return id ? String(id) : null;
}
```

- [ ] **Step 3: cleaning-worker.ts 新增 `extractWriteKind`**（放在 `extractWriteArtifactSignal` 附近）

```ts
function extractWriteKind(event: EventRow): string {
  const attributes = parseJsonObject(event.attributes_json);
  const toolName =
    readString(attributes['tool_name']) ??
    readString(attributes['tool.name']) ??
    readString(attributes['sdd.tool_name']);
  if (!toolName) return 'other';
  if (['Write', 'Edit', 'MultiEdit', 'NotebookEdit'].includes(toolName)) return toolName;
  return 'other';
}
```

- [ ] **Step 4: cleaning-worker.ts 在 `upsertWorkItems` 内追加写入记录**

在 `upsertWorkItemArtifact(...)` 调用之后、`if (attribution.skillCandidate?.semantic && event.session_id)` 之前（约 954 行），插入：

```ts
    const artifactId = await cleaningRepository.findArtifactIdByKey(
      connection,
      artifact.artifactKey,
    );
    if (artifactId) {
      const writeSessionId = event.session_id ?? null;
      const writeEventTime = asDate(event.event_time);
      const skillUsageId =
        attribution.skillCandidate && writeSessionId
          ? await cleaningRepository.findSkillUsageIdForArtifact(
              connection,
              writeSessionId,
              attribution.skillCandidate.rawSkillName,
              writeEventTime,
            )
          : null;
      const interactionId = event.prompt_id
        ? await cleaningRepository.findInteractionIdByPromptId(connection, event.prompt_id)
        : null;

      await cleaningRepository.upsertArtifactWrite(connection, {
        writeKey: sha256(`${event.event_id}:${artifact.artifactKey}`),
        artifactId,
        workItemId,
        interactionId,
        skillUsageId,
        userId: event.user_id != null ? String(event.user_id) : null,
        sessionId: writeSessionId,
        promptId: event.prompt_id ?? null,
        eventId: event.event_id,
        writeKind: extractWriteKind(event),
        contentPreview: extractToolInputPreview(event),
        eventSequence: event.event_sequence ?? null,
        eventTime: writeEventTime,
        ruleVersion: 'p0-cleaner-v1',
      });
    }
```

确认 `sha256` 已在本文件 import（`rg -n "sha256" worker/src/jobs/cleaning-worker.ts` —— 已用于 usageKey）。`extractToolInputPreview` / `asDate` / `readString` / `parseJsonObject` 均为本文件已有函数。

- [ ] **Step 5: build + 跑 worker once 验证**

Run:
```bash
pnpm build
pnpm --filter @sdd-telemetry/worker once
```
Expected: worker 处理完 outbox 无报错。

- [ ] **Step 6: 可证伪 SQL 抽查**（区分「修好+无数据」与「未修好」）

Run（用项目 mysql 连接，例如 `docker compose exec mysql mysql -uroot -p... sdd_telemetry -e "..."`）：
```sql
SELECT COUNT(*) AS writes,
       COUNT(DISTINCT artifact_id) AS docs,
       SUM(skill_usage_id IS NOT NULL) AS with_skill,
       SUM(interaction_id IS NOT NULL) AS with_turn
FROM sdd_work_item_artifact_writes;

SELECT write_key, COUNT(*) c
FROM sdd_work_item_artifact_writes GROUP BY write_key HAVING c > 1;
```
Expected: 第一条 `writes >= docs >= 1`（有数据时）；第二条返回空集（`write_key` 无重复）。若库里本就无写入事件，先用 Task 5 回填或确认数据来源，避免把空集误判为成功。

- [ ] **Step 7: 提交**

```bash
git add worker/src/jobs
git commit -m "feat(worker): 派生 artifact 时记录每次写入到 artifact_writes"
```

---

## Task 3: contract schema（时间线节点 + 需求 summary 扩展）

**Files:**
- Modify: `packages/api/src/contracts/sdd.contract.ts`

- [ ] **Step 1: 新增生成时间线 schema**（加在 `SddWorkItemDetailSchema` 之后）

```ts
export const SddArtifactWriteSchema = z.object({
  id: IdSchema,
  writeKind: z.string(),
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

export const SddArtifactWriteListResponseSchema = z.object({
  items: z.array(SddArtifactWriteSchema),
});
```

- [ ] **Step 2: 扩展需求详情 summary**（改 `SddWorkItemDetailSchema`，在现有 `usageCount` / `errorCount` 旁追加四个字段）

```ts
export const SddWorkItemDetailSchema = SddWorkItemSchema.extend({
  artifacts: z.array(
    z.object({
      id: IdSchema,
      artifactType: z.string(),
      artifactRelativePath: z.string(),
      systemModule: z.string().nullable(),
      lastSeenAt: ISODateTimeSchema.nullable(),
    }),
  ),
  usageCount: z.number(),
  errorCount: z.number(),
  turnCount: z.number(),
  sessionCount: z.number(),
  contributorCount: z.number(),
  wikiRecallCount: z.number(),
});
```

- [ ] **Step 3: 导出类型**（在文件底部 `export type ...` 区追加）

```ts
export type SddArtifactWrite = z.infer<typeof SddArtifactWriteSchema>;
export type SddArtifactWriteListResponse = z.infer<typeof SddArtifactWriteListResponseSchema>;
```

- [ ] **Step 4: build contract 包**

Run: `pnpm --filter @sdd-telemetry/api build`
Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add packages/api/src/contracts/sdd.contract.ts
git commit -m "feat(api): 新增 artifact 生成时间线 schema 与需求 summary 字段"
```

---

## Task 4: 服务端 timeline 接口 + summary 计数

**Files:**
- Modify: `server/src/modules/sdd/sdd-query.repository.ts`
- Modify: `server/src/modules/sdd/sdd-query.service.ts`
- Modify: `server/src/modules/sdd/sdd.controller.ts`

- [ ] **Step 1: repository 新增 timeline 查询**（仿 `listWorkItemArtifacts`，加在其后）

```ts
async listArtifactWrites(
  workItemId: string,
  artifactId: string,
): Promise<ArtifactWriteRow[]> {
  const dataSource = await this.mysqlDataSourceManager.getDataSource();
  return (await dataSource.query(
    `SELECT w.id, w.write_kind, w.event_time, w.event_sequence, w.interaction_id,
            w.content_preview, su.raw_skill_name,
            sem.semantic_code AS skill_semantic_code, sem.display_name AS skill_display_name,
            it.prompt_text,
            (SELECT COUNT(*) FROM sdd_wiki_recalls wr WHERE wr.interaction_id = w.interaction_id) AS wiki_recall_count
     FROM sdd_work_item_artifact_writes w
     LEFT JOIN sdd_skill_usages su ON su.id = w.skill_usage_id
     LEFT JOIN sdd_skill_semantics sem ON sem.id = su.semantic_id
     LEFT JOIN sdd_interaction_texts it ON it.interaction_id = w.interaction_id
     WHERE w.work_item_id = ? AND w.artifact_id = ?
     ORDER BY w.event_sequence IS NULL, w.event_sequence ASC, w.event_time ASC, w.id ASC`,
    [workItemId, artifactId],
  )) as ArtifactWriteRow[];
}
```

- [ ] **Step 2: repository 新增 summary 计数**（加在 `countWorkItemErrors` 后）

```ts
async getWorkItemSummary(workItemId: string): Promise<WorkItemSummaryRow[]> {
  const dataSource = await this.mysqlDataSourceManager.getDataSource();
  return (await dataSource.query(
    `SELECT
       (SELECT COUNT(DISTINCT interaction_id) FROM sdd_skill_usages
          WHERE work_item_id = ? AND interaction_id IS NOT NULL) AS turn_count,
       (SELECT COUNT(DISTINCT session_id) FROM sdd_skill_usages
          WHERE work_item_id = ? AND session_id IS NOT NULL) AS session_count,
       (SELECT COUNT(DISTINCT user_id) FROM sdd_skill_usages
          WHERE work_item_id = ? AND user_id IS NOT NULL) AS contributor_count,
       (SELECT COUNT(*) FROM sdd_wiki_recalls WHERE work_item_id = ?) AS wiki_recall_count`,
    [workItemId, workItemId, workItemId, workItemId],
  )) as WorkItemSummaryRow[];
}
```

- [ ] **Step 3: repository 新增行类型**（仿现有 `ArtifactRow` / `CountRow` 接口处）

```ts
export interface ArtifactWriteRow {
  id: string | number;
  write_kind: string;
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

export interface WorkItemSummaryRow {
  turn_count: string | number;
  session_count: string | number;
  contributor_count: string | number;
  wiki_recall_count: string | number;
}
```

- [ ] **Step 4: service 新增 `listArtifactWrites`**（仿 `getWorkItemDetail`；`toNumber` / `toStringId` / `toIsoDate` 已是本文件工具函数）

```ts
async listArtifactWrites(
  workItemId: string,
  artifactId: string,
): Promise<SddArtifactWriteListResponse> {
  const rows = await this.sddQueryRepository.listArtifactWrites(workItemId, artifactId);
  return {
    items: rows.map((row) => ({
      id: toStringId(row.id),
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
  };
}
```

- [ ] **Step 5: service `getWorkItemDetail` 补 summary**

在 `getWorkItemDetail` 的 `Promise.all([...])` 里追加 `this.sddQueryRepository.getWorkItemSummary(workItemId)`，解构为 `summaryRows`，并在返回对象追加：

```ts
      turnCount: toNumber(summaryRows[0]?.turn_count),
      sessionCount: toNumber(summaryRows[0]?.session_count),
      contributorCount: toNumber(summaryRows[0]?.contributor_count),
      wikiRecallCount: toNumber(summaryRows[0]?.wiki_recall_count),
```

- [ ] **Step 6: service import 类型**：在顶部从 `@sdd-telemetry/api` 引入 `type SddArtifactWriteListResponse`；从本地 repository 引入 `type ArtifactWriteRow, type WorkItemSummaryRow`（仿现有 `type WorkItemRow` 的引入处）。

- [ ] **Step 7: controller 新增路由**（加在 `workItemDetail` 之后；schema import 同步）

```ts
  @Get('/work-items/:workItemId/artifacts/:artifactId/writes')
  async artifactWrites() {
    const workItemId = this.ctx.params.workItemId as string;
    const artifactId = this.ctx.params.artifactId as string;
    const data: SddArtifactWriteListResponse =
      await this.sddQueryService.listArtifactWrites(workItemId, artifactId);
    return ok(parseWithSchema(SddArtifactWriteListResponseSchema, data));
  }
```
顶部 import 追加：`SddArtifactWriteListResponseSchema` 与 `type SddArtifactWriteListResponse`。

- [ ] **Step 8: typecheck + build server**

Run: `pnpm --filter @sdd-telemetry/server typecheck && pnpm --filter @sdd-telemetry/server build`
Expected: PASS。

- [ ] **Step 9: HTTP 抽查**（dev 模式起 server）

Run:
```bash
pnpm dev:server   # 另开终端
# 取一个有写入的 workItemId / artifactId（从 Task 2 SQL 结果或 /api/sdd/work-items 拿）
curl -s "http://localhost:<port>/api/sdd/work-items/<wid>/artifacts/<aid>/writes" | head
curl -s "http://localhost:<port>/api/sdd/work-items/<wid>" | head
```
Expected: 第一条返回 `items` 数组，节点含 `writeKind` / `promptPreview` / `wikiRecallCount`；第二条返回体含 `turnCount` / `sessionCount` / `contributorCount` / `wikiRecallCount`。端口以 server 启动日志为准。

- [ ] **Step 10: 提交**

```bash
git add server/src/modules/sdd
git commit -m "feat(server): 新增 artifact 生成时间线接口与需求 summary 计数"
```

---

## Task 5: 历史回填脚本（从 event 层）

**Files:**
- Create: `server/src/infrastructure/mysql/backfill-artifact-writes.ts`

> 目的：event 层（`otel_log_events`，≈30 天）里已有写入事件，但旧数据在 Task 2 上线前没进新表。脚本扫描这些事件灌入 `sdd_work_item_artifact_writes`。worker 的 `inferArtifact` 路径推断逻辑较重，回填用「已落库的 artifact 全路径 + 写入事件路径匹配」这一更简口径即可。

- [ ] **Step 1: 写回填脚本**（参考 `reset-derived-data.ts` 的 DataSource 获取方式 `rg -n "getDataSource|DataSource" server/src/infrastructure/mysql/reset-derived-data.ts`）

```ts
/**
 * 一次性回填：把 otel_log_events 里的 artifact 写入事件灌入 sdd_work_item_artifact_writes。
 * 口径：写入事件的 sdd.artifact_path 落在某 artifact.artifact_full_path 上即关联。
 * 幂等：write_key = sha256(event_id + ':' + artifact_key)，重复跑不产生重复。
 */
import { createHash } from 'node:crypto';
import { AppDataSource } from './data-source';

function sha256(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}

async function main(): Promise<void> {
  const ds = await AppDataSource.initialize();
  try {
    const events = (await ds.query(
      `SELECT e.event_id, e.user_id, e.session_id, e.prompt_id, e.event_sequence, e.event_time,
              JSON_UNQUOTE(JSON_EXTRACT(e.attributes_json, '$."sdd.artifact_path"')) AS artifact_path,
              JSON_UNQUOTE(JSON_EXTRACT(e.attributes_json, '$."tool_name"')) AS tool_name
       FROM otel_log_events e
       WHERE JSON_EXTRACT(e.attributes_json, '$."sdd.artifact_is_write"') = true
         AND JSON_EXTRACT(e.attributes_json, '$."sdd.artifact_path"') IS NOT NULL`,
    )) as Array<{
      event_id: string; user_id: string | null; session_id: string | null;
      prompt_id: string | null; event_sequence: number | null; event_time: Date | null;
      artifact_path: string | null; tool_name: string | null;
    }>;

    let inserted = 0;
    for (const e of events) {
      if (!e.artifact_path) continue;
      const art = (await ds.query(
        `SELECT id, artifact_key, work_item_id FROM sdd_work_item_artifacts
         WHERE artifact_full_path = ? LIMIT 1`,
        [e.artifact_path],
      )) as Array<{ id: string; artifact_key: string; work_item_id: string }>;
      const a = art[0];
      if (!a) continue;

      const interaction = e.prompt_id
        ? ((await ds.query(
            `SELECT id FROM sdd_interactions WHERE prompt_id = ? ORDER BY id ASC LIMIT 1`,
            [e.prompt_id],
          )) as Array<{ id: string }>)
        : [];
      const skillUsage = e.session_id
        ? ((await ds.query(
            `SELECT id FROM sdd_skill_usages
             WHERE session_id = ? AND work_item_id = ?
             ORDER BY event_time DESC, id DESC LIMIT 1`,
            [e.session_id, a.work_item_id],
          )) as Array<{ id: string }>)
        : [];
      const writeKind = ['Write', 'Edit', 'MultiEdit', 'NotebookEdit'].includes(e.tool_name ?? '')
        ? (e.tool_name as string)
        : 'other';

      await ds.query(
        `INSERT INTO sdd_work_item_artifact_writes
          (write_key, artifact_id, work_item_id, interaction_id, skill_usage_id, user_id,
           session_id, prompt_id, event_id, write_kind, content_preview, event_sequence,
           event_time, rule_version, gmt_create, gmt_modified)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, 'backfill-v1',
                 CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3))
         ON DUPLICATE KEY UPDATE gmt_modified = CURRENT_TIMESTAMP(3)`,
        [
          sha256(`${e.event_id}:${a.artifact_key}`),
          a.id, a.work_item_id,
          interaction[0]?.id ?? null,
          skillUsage[0]?.id ?? null,
          e.user_id, e.session_id, e.prompt_id, e.event_id, writeKind,
          e.event_sequence, e.event_time,
        ],
      );
      inserted += 1;
    }
    console.log(`[backfill] processed events=${events.length} inserted/updated=${inserted}`);
  } finally {
    await ds.destroy();
  }
}

main().catch((err) => {
  console.error('[backfill] failed', err);
  process.exit(1);
});
```

> 注：`AppDataSource` / `data-source` 的确切导出名先核对 `rg -n "export (const|class) .*DataSource|AppDataSource|MysqlDataSource" server/src/infrastructure/mysql/data-source.ts`，按实际命名调整 import。`content_preview` 回填留空（event 层不一定有入参预览，正文按设计解耦，可接受）。

- [ ] **Step 2: 运行回填**

Run（用 server 包的 tsx，仿 `db:migrate` 等脚本的执行方式，先 `rg -n "db:migrate|db:verify|reset-derived" server/package.json` 确认 runner，例如 `tsx`）：
```bash
pnpm --filter @sdd-telemetry/server exec tsx src/infrastructure/mysql/backfill-artifact-writes.ts
```
Expected: 打印 `processed events=N inserted/updated=M`，无报错。

- [ ] **Step 3: 验证回填生效**

Run（SQL）：取一个 30 天内有多次写入的文档，确认时间线非空：
```sql
SELECT artifact_id, COUNT(*) writes FROM sdd_work_item_artifact_writes
GROUP BY artifact_id ORDER BY writes DESC LIMIT 5;
```
Expected: 返回若干 `artifact_id`，`writes >= 1`。空集说明 30 天内无写入事件或路径未匹配——核对 `sdd.artifact_path` 与 `artifact_full_path` 是否同形（可证伪点）。

- [ ] **Step 4: 提交**

```bash
git add server/src/infrastructure/mysql/backfill-artifact-writes.ts
git commit -m "feat(server): 新增 artifact 写入历史回填脚本"
```

---

## Task 6: 前端共享 InteractionDetailDrawer（从交互明细抽出）

**Files:**
- Create: `web/src/components/sdd/InteractionDetailDrawer.tsx`
- Modify: `web/src/pages/sdd/interactions/InteractionsPage.tsx`

> 现状：`InteractionsPage` 内联渲染全文（`RowInspectorDrawer` + `toDetailFields` / `toTextBlocks` / `ToolCallsSection`）。抽出一个 `interactionId` 驱动的共享抽屉，交互明细与需求详情页共用，避免重复（第 2 次使用，符合抽象准则）。

- [ ] **Step 1: 新建共享组件**（把 `InteractionsPage` 里的 `toDetailFields` / `toTextBlocks` / `ToolCallsSection` / `toToolCallRow` 及相关 import 迁入此文件，对外暴露 `interactionId` 接口；内部用已有 hooks）

```tsx
import {
  useSddInteractionDetail,
  useSddInteractionToolCalls,
} from '@/pages/sdd/interactions/useSddInteractions';
import {
  RowInspectorDrawer,
  type RowInspectorField,
  type RowInspectorTextBlock,
} from '@/components/ui/RowInspectorDrawer';
import type { SddInteractionDetail, SddInteractionToolCall } from '@sdd-telemetry/api';
import { Workflow } from 'lucide-react';

export function InteractionDetailDrawer({
  interactionId,
  open,
  onOpenChange,
}: {
  interactionId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const detailQuery = useSddInteractionDetail(interactionId);
  const toolCallsQuery = useSddInteractionToolCalls(interactionId);
  const detail = detailQuery.data ?? null;

  return (
    <RowInspectorDrawer
      open={open}
      onOpenChange={onOpenChange}
      title={detail?.commandName ?? interactionId ?? '交互详情'}
      subtitle={detail?.interactionKey}
      icon={<Workflow size={18} />}
      row={detail}
      fields={detail ? toDetailFields(detail) : []}
      textBlocks={detail ? toTextBlocks(detail) : []}
      loading={detailQuery.isLoading}
    >
      <ToolCallsSection calls={toolCallsQuery.data?.items ?? []} loading={toolCallsQuery.isLoading} />
    </RowInspectorDrawer>
  );
}

// ↓ 从 InteractionsPage 原样迁入（保持实现不变）：
// function toDetailFields(...) {...}
// function toTextBlocks(...) {...}
// function ToolCallsSection(...) {...}
// function toToolCallRow(...) {...}
// 以及它们依赖的 display / displayNumber / formatPairingMethod / formatTokenPair 等小工具
```

> 实操：先看 `InteractionsPage.tsx:153-409`（`rg -n "^function" web/src/pages/sdd/interactions/InteractionsPage.tsx`）把上述纯函数整段剪切过来，确认 `RowInspectorDrawer` 是否支持 `textBlocks` prop（`rg -n "textBlocks|RowInspectorTextBlock" web/src/components/ui/RowInspectorDrawer.tsx`）；若交互明细原本用的是 `RowInspectorDrawer` 的 `textBlocks`，保持同名。

- [ ] **Step 2: InteractionsPage 改用共享组件**

把原来的 `RowInspectorDrawer`（详情段，约 121-147 行）替换为：
```tsx
<InteractionDetailDrawer
  interactionId={selectedInteractionId}
  open={Boolean(selectedInteractionId)}
  onOpenChange={(open) => { if (!open) setSelectedInteractionId(null); }}
/>
```
删除已迁出的本地函数与不再使用的 import（`toDetailFields` 等、`useSddInteractionToolCalls`、`RowInspector*` 若不再直接用）。`setSelectedInteractionId` 的实际状态/参数名以原文件为准。

- [ ] **Step 3: typecheck + build web**

Run: `pnpm --filter @sdd-telemetry/web typecheck && pnpm --filter @sdd-telemetry/web build`
Expected: PASS。

- [ ] **Step 4: 手动回归交互明细**

Run: `pnpm dev:web`，打开「交互明细」点一行，确认全文 prompt / response + 工具调用照旧展示。
Expected: 行为与改动前一致。

- [ ] **Step 5: 提交**

```bash
git add web/src/components/sdd/InteractionDetailDrawer.tsx web/src/pages/sdd/interactions/InteractionsPage.tsx
git commit -m "refactor(web): 抽出共享 InteractionDetailDrawer 供多页复用"
```

---

## Task 7: 前端生成时间线 hook

**Files:**
- Create: `web/src/pages/sdd/work-items/useArtifactWrites.ts`

- [ ] **Step 1: 写 hook**（仿 `useSddWorkItems.ts` 的 `requestData` + `useQuery` 风格）

```ts
import { useQuery } from '@tanstack/react-query';
import type { SddArtifactWriteListResponse } from '@sdd-telemetry/api';
import { requestData } from '@/api/client';

export function useArtifactWrites(workItemId: string | null, artifactId: string | null) {
  return useQuery({
    queryKey: ['sdd-artifact-writes', workItemId, artifactId],
    queryFn: () =>
      requestData<SddArtifactWriteListResponse>(
        `/api/sdd/work-items/${workItemId}/artifacts/${artifactId}/writes`,
      ),
    enabled: Boolean(workItemId) && Boolean(artifactId),
    staleTime: 30_000,
  });
}
```

- [ ] **Step 2: typecheck**

Run: `pnpm --filter @sdd-telemetry/web typecheck`
Expected: PASS。

---

## Task 8: 需求详情页（两栏）+ 路由 + 列表跳转

**Files:**
- Create: `web/src/pages/sdd/work-items/components/ArtifactList.tsx`
- Create: `web/src/pages/sdd/work-items/components/ArtifactWriteTimeline.tsx`
- Create: `web/src/pages/sdd/work-items/WorkItemDetailPage.tsx`
- Modify: `web/src/router.tsx`
- Modify: `web/src/pages/sdd/work-items/WorkItemsPage.tsx`

- [ ] **Step 1: ArtifactList（左栏）**

```tsx
import type { SddWorkItemDetail } from '@sdd-telemetry/api';
import { FileText } from 'lucide-react';

type Artifact = SddWorkItemDetail['artifacts'][number];

const CARD_STYLE = { border: '1px solid var(--color-border)', background: 'var(--color-surface)' };

export function ArtifactList({
  artifacts,
  selectedId,
  onSelect,
}: {
  artifacts: Artifact[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  return (
    <section className="rounded-[6px] overflow-hidden" style={CARD_STYLE}>
      <div className="flex items-center gap-2 px-[14px] py-3" style={{ borderBottom: '1px solid var(--color-border)', color: 'var(--color-primary)' }}>
        <FileText size={16} />
        <h3 className="text-[13px] font-semibold text-[#f5f5f5]">文档 · {artifacts.length}</h3>
      </div>
      <div className="grid">
        {artifacts.length === 0 ? (
          <div className="px-[14px] py-6 text-[12px] text-[var(--color-muted)]">该需求暂无文档</div>
        ) : (
          artifacts.map((a) => {
            const on = a.id === selectedId;
            return (
              <button
                key={a.id}
                onClick={() => onSelect(a.id)}
                className="flex flex-col gap-[2px] px-[14px] py-[10px] text-left transition-colors"
                style={{
                  borderBottom: '1px solid var(--color-border)',
                  background: on ? 'rgba(250,255,105,0.06)' : 'transparent',
                  borderLeft: on ? '3px solid var(--color-primary)' : '3px solid transparent',
                }}
              >
                <span className="text-[10px]" style={{ color: 'var(--color-primary)' }}>{a.artifactType}</span>
                <span className="text-[12px] text-[var(--color-secondary)] truncate" style={{ fontFamily: 'var(--font-mono)' }} title={a.artifactRelativePath}>
                  {a.artifactRelativePath}
                </span>
              </button>
            );
          })
        )}
      </div>
    </section>
  );
}
```

- [ ] **Step 2: ArtifactWriteTimeline（右栏）**

```tsx
import type { SddArtifactWrite } from '@sdd-telemetry/api';
import { BookOpen, GitCommitVertical } from 'lucide-react';
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
  return (
    <section className="rounded-[6px] overflow-hidden" style={CARD_STYLE}>
      <div className="flex items-center gap-2 px-[14px] py-3" style={{ borderBottom: '1px solid var(--color-border)', color: 'var(--color-primary)' }}>
        <GitCommitVertical size={16} />
        <h3 className="text-[13px] font-semibold text-[#f5f5f5]">生成时间线</h3>
        <span className="text-[11px] text-[var(--color-muted)]">· {writes.length} 次写入</span>
      </div>

      {isLoading ? (
        <div className="px-[14px] py-6 text-[12px] text-[var(--color-muted)]">正在加载时间线…</div>
      ) : writes.length === 0 ? (
        <div className="px-[14px] py-6 text-[12px] text-[var(--color-muted)]">
          暂无写入记录（event 层约 30 天内的写入才会出现；更早的需求请见 summary）
        </div>
      ) : (
        <div className="grid">
          {writes.map((w) => (
            <div key={w.id} className="flex flex-col gap-[6px] px-[14px] py-[12px]" style={{ borderBottom: '1px solid var(--color-border)' }}>
              <div className="flex items-center gap-2 text-[11px]">
                <span className="text-[var(--color-muted)]" style={{ fontFamily: 'var(--font-mono)' }}>{formatTime(w.eventTime)}</span>
                <span className="px-[6px] py-[1px] rounded-[3px] text-[10px]" style={{ color: 'var(--color-secondary)', background: 'rgba(255,255,255,0.06)' }}>{w.writeKind}</span>
                <span className="text-[var(--color-secondary)]">{w.skillDisplayName ?? w.rawSkillName ?? '无 skill'}</span>
                <span className="inline-flex items-center gap-1 text-[var(--color-muted)]">
                  <BookOpen size={11} /> wiki×{w.wikiRecallCount}
                </span>
              </div>
              {w.promptPreview ? (
                <p className="text-[12px] text-[var(--color-text)] line-clamp-2">{w.promptPreview}</p>
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
          ))}
        </div>
      )}
    </section>
  );
}
```
> 注：`line-clamp-2` 若 Tailwind 未启用对应插件，用 `truncate` 或 `formatText` 先核对（`rg -n "line-clamp" web/src`）。

- [ ] **Step 3: WorkItemDetailPage（两栏 + header + turn 抽屉）**

```tsx
import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, GitBranch } from 'lucide-react';
import { useSddWorkItemDetail } from './useSddWorkItems';
import { useArtifactWrites } from './useArtifactWrites';
import { ArtifactList } from './components/ArtifactList';
import { ArtifactWriteTimeline } from './components/ArtifactWriteTimeline';
import { InteractionDetailDrawer } from '@/components/sdd/InteractionDetailDrawer';
import { formatInteger } from '@/lib/format';

const CARD_STYLE = { border: '1px solid var(--color-border)', background: 'var(--color-surface)' };

export default function WorkItemDetailPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const detailQuery = useSddWorkItemDetail(id);
  const detail = detailQuery.data;

  const [selectedArtifactId, setSelectedArtifactId] = useState<string | null>(null);
  const [turnInteractionId, setTurnInteractionId] = useState<string | null>(null);

  // 默认选中第一篇文档
  useEffect(() => {
    if (!selectedArtifactId && detail && detail.artifacts.length > 0) {
      setSelectedArtifactId(detail.artifacts[0].id);
    }
  }, [detail, selectedArtifactId]);

  const writesQuery = useArtifactWrites(id, selectedArtifactId);

  if (detailQuery.isLoading) {
    return <div className="p-4 text-[13px] text-[var(--color-muted)]">加载中…</div>;
  }
  if (!detail) {
    return <div className="p-4 text-[13px] text-[var(--color-muted)]">需求不存在</div>;
  }

  return (
    <div className="grid gap-3">
      {/* Header */}
      <section className="flex flex-col gap-2 p-[14px] rounded-[6px]" style={CARD_STYLE}>
        <button onClick={() => navigate('/sdd/work-items')} className="self-start inline-flex items-center gap-1 text-[12px] text-[var(--color-muted)] hover:text-[var(--color-secondary)]">
          <ArrowLeft size={14} /> 产出分析
        </button>
        <div className="flex items-center gap-2">
          <GitBranch size={18} style={{ color: 'var(--color-primary)' }} />
          <h2 className="text-[16px] font-semibold text-[#f5f5f5]">
            {detail.businessDomain ? `${detail.businessDomain} / ` : ''}{detail.workItemTitle ?? detail.workItemSlug}
          </h2>
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-[var(--color-secondary)]" style={{ fontFamily: 'var(--font-mono)' }}>
          <span>文档 {detail.artifacts.length}</span>
          <span>参与 {formatInteger(detail.contributorCount)} 人</span>
          <span>{formatInteger(detail.turnCount)} turns</span>
          <span>跨 {formatInteger(detail.sessionCount)} session</span>
          <span>wiki 读取 {formatInteger(detail.wikiRecallCount)} 次</span>
        </div>
      </section>

      {/* 两栏 */}
      <div className="grid gap-3" style={{ gridTemplateColumns: '280px 1fr' }}>
        <ArtifactList
          artifacts={detail.artifacts}
          selectedId={selectedArtifactId}
          onSelect={setSelectedArtifactId}
        />
        <ArtifactWriteTimeline
          writes={writesQuery.data?.items ?? []}
          isLoading={writesQuery.isLoading}
          onOpenTurn={setTurnInteractionId}
        />
      </div>

      <InteractionDetailDrawer
        interactionId={turnInteractionId}
        open={Boolean(turnInteractionId)}
        onOpenChange={(open) => { if (!open) setTurnInteractionId(null); }}
      />
    </div>
  );
}
```

- [ ] **Step 4: 注册路由**（`router.tsx`）

import 区追加：
```ts
const WorkItemDetailPage = lazy(() => import('./pages/sdd/work-items/WorkItemDetailPage'));
```
在 `{ path: 'sdd/work-items', ... }` 之后追加：
```tsx
{ path: 'sdd/work-items/:id', element: wrap(WorkItemDetailPage), errorElement: <RouteError /> },
```

- [ ] **Step 5: 列表行改为跳转，移除旧 drawer**（`WorkItemsPage.tsx`）

1. 顶部 import `useNavigate`：`import { useSearchParams, useNavigate } from 'react-router-dom';`
2. 组件内加 `const navigate = useNavigate();`
3. 行 `onClick={() => selectWorkItem(item.id)}` 改为 `onClick={() => navigate(`/sdd/work-items/${item.id}`)}`。
4. 删除：`selectedId` / `detailQuery` / `selectWorkItem` / `drawerFields` / Section 5 整段 `RowInspectorDrawer`（648-725 行）/ `WorkItemWikiRecallPanel` / `groupRecallsBySkill` / `ARTIFACT_BADGE*` 以及随之不再使用的 import（`useSddWorkItemDetail`、`RowInspectorDrawer`、`useWikiRecallList`、`BookOpen`、`WikiRecallRow`、`useSearchParams` 若不再用）。
5. `params` / `setParams` 若仅服务于选中态则一并删除。

> 验收口径：每一行 diff 都能追溯到「行点击跳详情页」这一目标；不顺手改其它无关样式。

- [ ] **Step 6: typecheck + build web**

Run: `pnpm --filter @sdd-telemetry/web typecheck && pnpm --filter @sdd-telemetry/web build`
Expected: PASS（确认旧 drawer 删除后无残留引用报错）。

- [ ] **Step 7: 端到端手动验证**

Run: `pnpm dev:web`（配合 dev:server）。
路径验证：产出分析 → 点一个需求 → 进详情页（header summary 正确）→ 左栏选文档 → 右栏出生成时间线 → 点「展开全文」→ 抽屉出全文 prompt+response+工具时间线。
Expected: 链路无断点；无写入数据的文档显示空态文案而非报错。

- [ ] **Step 8: 提交**

```bash
git add web/src
git commit -m "feat(web): 需求详情页两栏下钻（文档列表 + 生成时间线 + 全文回溯）"
```

---

## Task 9: 文档保鲜 + 全量验证

**Files:**
- Modify: `docs/database-model.md`
- Modify: `docs/api-contract.md`

- [ ] **Step 1: database-model.md 增表**：在「SDD 业务层」补 `sdd_work_item_artifact_writes` 小节（字段表 + `write_key` 生成规则 + 保留期对齐 skill_usages），并在 §2 表分层清单加入该表。

- [ ] **Step 2: api-contract.md 增接口**：补 `GET /api/sdd/work-items/:workItemId/artifacts/:artifactId/writes` 与 `SddWorkItemDetail` 新增 summary 字段说明。

- [ ] **Step 3: 旧路径残留检查**

Run（CLAUDE.md 规定）：
```bash
rg --hidden "ap""ps/(web|server|worker)|\\.\\/ap""ps/(web|server|worker)|ap""ps/" . -g '!node_modules/**' -g '!.git/**'
```
Expected: 无新增违规路径。

- [ ] **Step 4: 全量基础验证**

Run:
```bash
pnpm typecheck
pnpm build
```
Expected: 全包 PASS。

- [ ] **Step 5: 链路验证（已动 worker / 迁移）**

Run:
```bash
docker compose up -d mysql
pnpm db:migrate
pnpm --filter @sdd-telemetry/worker once
curl -s "http://localhost:<port>/api/sdd/work-items/<wid>/artifacts/<aid>/writes" | head
```
Expected: 接口返回非空时间线（用有写入的需求）；worker 无报错。

- [ ] **Step 6: 提交**

```bash
git add docs/database-model.md docs/api-contract.md
git commit -m "docs: 同步 artifact_writes 表与生成时间线接口"
```

---

## 自查（写计划后回看 spec）

- **覆盖**：诉求 1（需求→文档列表）= Task 8 左栏 + 现有 `/work-items/:id` artifacts；诉求 2 + C（文档→生成时间线→prompt 全文）= Task 1-2（表+采集）、Task 4（接口）、Task 7-8（前端）、Task 6（全文复用）；持久骨架 = Task 1-2；回填 = Task 5；保鲜 = Task 9。spec 各节均有对应任务。
- **占位符**：无 TODO / 「类似上文」；每个改动给了实际代码或精确定位命令。
- **类型一致**：`SddArtifactWrite` / `SddArtifactWriteListResponse`（Task 3）在 service（Task 4）、hook（Task 7）、组件（Task 8）一致；`upsertArtifactWrite` 入参（Task 2）与表列（Task 1）逐字对齐；summary 四字段（turnCount/sessionCount/contributorCount/wikiRecallCount）schema（Task 3）↔ service（Task 4）↔ header（Task 8）一致。
- **风险**：Task 6 抽组件会动交互明细，Step 4 有回归验证；Task 8 Step 5 删旧 drawer 属用户已选方案 1 的预期破坏，diff 可追溯。
