# PR5d1 / PR5d2 / PR5e 实施 Prompt

> 落盘时间：2026-05-19
> 用途：直接喂给其他大模型作为完整 prompt，执行 bkfesddcore 迁移源端重构剩余 3 个子 PR
> 前置依赖：PR5a / PR5b / PR5c 已完成（events / ops / ingest-health 的 repository 抽出）

---

## 0. 你是谁，要做什么

你是 senior TypeScript 工程师，正在 `/Users/loomisli/Desktop/lm/sdd-telemetry` 这个项目上做 **SDD Telemetry → bkfesddcore（Chair/tegg FaaS + dal v2）迁移源端重构**。目标是把当前散落在 service 内联的 SQL **提到 repository 层**，让未来 dal v2 替换 ORM 时只需替换 repository 实现，service / controller 零改动。

完整背景见同目录 `review.md`，本次任务的 SQL 清单见 `sql-registry.md`，事务边界与幂等性分析见 `transaction-registry.md`。

**当前已完成 PR**：

| commit | PR | 范围 |
| --- | --- | --- |
| `8e96a19` | PR1 死代码清理 | 删 BullMQ/outbox-dispatcher/Redis docker |
| `ffece27` | PR2 事务抽象统一 | sdd-query 3 处 + cleaning-worker:276 复用现有抽象层 |
| `f7ffb5c` | PR3 取消 MySQL GET_LOCK | upsert 已幂等，命名锁多余 |
| `b32e7bb` | PR5a events-query → repository | 7 条 SQL 试点 |
| `690cbbd` | PR5b ops-query → repository | 7 条 SQL（含动态表名） |
| `715ba1b` | PR5c ingest-health → repository | 4 条 SQL |

**你要做的 PR**：PR5d1 → PR5d2 → PR5e，三个 PR 依次完成，每个都按"改代码 → typecheck → 端点验证 → commit"的循环。

---

## 1. 必须遵守的约束

### 1.1 Commit message 用中文

按项目 `CLAUDE.md` 要求，subject + body 全用中文。格式：

```
refactor(<scope>): <subject 中文>

<2-3 段中文说明：为什么这么改、改了什么、对迁移的影响>

- <bullet 列具体改动 1>
- <bullet 列具体改动 2>

验证：
- pnpm typecheck 全绿
- <端点验证结果>

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
```

用 HEREDOC 传 message 避免格式损坏。

### 1.2 不 stage 任何 web/* 文件

`git status` 里有两个**预先存在的 web 改动**不是本次重构产出：

```
modified:   web/src/components/ui/DataTable.tsx
modified:   web/src/pages/ops/database/DatabasePage.tsx
```

**绝对不要** `git add web/*` 或 `git add -A`。每次 commit 都用**显式文件清单** stage。

### 1.3 ⚠️ 新 @Provide class 必须加进 bootstrap.ts preloadModules

这是 PR5a 试点时踩过的硬坑：仅在 `modules/index.ts` 加 side-effect import 不够。midway DI 容器只识别 `bootstrap.ts` 的 `preloadModules` 数组里显式列出的 class。

**每次新建一个 @Provide(...) class 都要同步做 3 件事**：

1. 创建 repository 文件本身（@Provide 装饰器）
2. 在 `server/src/modules/index.ts` 加 `import './<dir>/<file>';` （side-effect）
3. 在 `server/src/bootstrap.ts` 顶部 import 新 class + 加到 `preloadModules` 数组

漏掉第 3 步会得到这个 500 错误：

```
MidwayDefinitionNotFoundError: Definition for "xxxRepository" not found in current context.
Detection path: "XxxController -> XxxService"
```

**对应不到的根因都是 preloadModules 缺失**——不要尝试调换 import 顺序、清 turbo cache、清 tsx cache 来"修"它，没用。

### 1.4 写 SQL 的范式与命名

- repository 方法的命名采用 sql-registry.md 已经定义的"模块.动词名词"（如 `sdd.countOverviewUsage`、`sdd.aggregateInteractionQuality`、`sdd.listInteractions`）。具体每条 SQL 的建议命名见 `sql-registry.md` 第一节到第六节
- 动态 WHERE 拼接（`buildUsageWhere` 等 helper）**留在 service 内**，因为涉及业务校验（如列名白名单、参数组合规则）。service 拼好 `clauses` + `params` 数组传给 repository
- repository 方法返回 row 数组（`SemanticRow[]` 等），service 负责 row → DTO 转换
- repository 内部自己拿 `dataSource`，service 不需要传 `dataSource`（除非是事务参与）
- 事务参与 repository 接收 `manager: EntityManager`（参考 `ingest-write.repository.ts` 已有模式）

### 1.5 不要改业务行为

只搬 SQL，不改 SQL 内容、不改字段映射、不改业务转换逻辑。每个端点验证必须 200 + 关键数值与改造前一致（允许新数据导致的数字变化，但 `distinctXxx` / `items count` 等结构字段必须一致）。

### 1.6 不引入 ESLint 警告 / unused import

每次 typecheck 全绿。如果删的代码导致 import 不再使用，**同步删 import**（不要留着）。

---

## 2. PR5d1：sdd-write.repository（事务参与的 3 个 CRUD）

### 范围

提到 repository 的方法（service 文件：`server/src/modules/sdd/sdd-query.service.ts`）：

| Service 方法 | 行号 | SQL 数 | 涉及表 |
| --- | --- | --- | --- |
| `createSemantic` | 302-359 | 3（INSERT semantic + SELECT id + INSERT alias × N） | `sdd_skill_semantics`、`sdd_skill_aliases` |
| `updateSemantic` | 361-403 | 3（UPDATE semantic + DELETE aliases + INSERT alias × N） | 同上 |
| `deleteSemantic` | 405-415 | 2（DELETE aliases + DELETE semantic） | 同上 |

合计 **8 条事务 SQL**。

注意：这 3 个方法**已经被 PR2（commit ffece27）改成 TypeOrmUnitOfWork.run pattern**——但 SQL 仍内联在 service 里。本 PR 的工作是把 SQL 提到 repository。

### 设计 pattern：参考 `server/src/modules/ingest/ingest-write.repository.ts`

事务参与的 repository 不 inject `MysqlDataSourceManager`——它的方法接收 `manager: EntityManager`，让 service 控制事务边界。

```ts
// server/src/modules/sdd/sdd-write.repository.ts
import { Provide } from '@midwayjs/core';
import type { CreateSddSemanticRequest, UpdateSddSemanticRequest } from '@sdd-telemetry/api';
import type { EntityManager } from 'typeorm';

export interface SemanticIdRow {
  id: string;
}

@Provide('sddWriteRepository')
export class SddWriteRepository {
  async upsertSemantic(
    manager: EntityManager,
    input: CreateSddSemanticRequest,
  ): Promise<void> {
    await manager.query(
      `INSERT INTO sdd_skill_semantics
        (semantic_code, display_name, description, artifact_filename_patterns,
         gmt_create, gmt_modified)
       VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3))
       ON DUPLICATE KEY UPDATE
         display_name = VALUES(display_name),
         description = VALUES(description),
         artifact_filename_patterns = VALUES(artifact_filename_patterns),
         gmt_modified = CURRENT_TIMESTAMP(3)`,
      [
        input.semanticCode,
        input.displayName,
        input.description ?? null,
        input.artifactFilenamePatterns === undefined
          ? null
          : JSON.stringify(input.artifactFilenamePatterns),
      ],
    );
  }

  async findSemanticIdByCode(manager: EntityManager, semanticCode: string): Promise<string | null> {
    const rows = (await manager.query(
      `SELECT id FROM sdd_skill_semantics WHERE semantic_code = ? LIMIT 1`,
      [semanticCode],
    )) as SemanticIdRow[];
    return rows[0]?.id ?? null;
  }

  async upsertSemanticAlias(
    manager: EntityManager,
    semanticId: string,
    skillName: string,
  ): Promise<void> {
    await manager.query(
      `INSERT INTO sdd_skill_aliases
        (semantic_id, skill_name, gmt_create, gmt_modified)
       VALUES (?, ?, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3))
       ON DUPLICATE KEY UPDATE
         semantic_id = VALUES(semantic_id),
         gmt_modified = CURRENT_TIMESTAMP(3)`,
      [semanticId, skillName],
    );
  }

  async insertSemanticAlias(
    manager: EntityManager,
    semanticId: string,
    skillName: string,
  ): Promise<void> {
    await manager.query(
      `INSERT INTO sdd_skill_aliases
        (semantic_id, skill_name, gmt_create, gmt_modified)
       VALUES (?, ?, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3))`,
      [semanticId, skillName],
    );
  }

  async updateSemantic(
    manager: EntityManager,
    id: string,
    input: UpdateSddSemanticRequest,
  ): Promise<void> {
    await manager.query(
      `UPDATE sdd_skill_semantics
       SET display_name = ?,
           description = ?,
           artifact_filename_patterns = COALESCE(?, artifact_filename_patterns),
           gmt_modified = CURRENT_TIMESTAMP(3)
       WHERE id = ?`,
      [
        input.displayName,
        input.description ?? null,
        input.artifactFilenamePatterns === undefined
          ? null
          : JSON.stringify(input.artifactFilenamePatterns),
        id,
      ],
    );
  }

  async deleteSemanticAliases(manager: EntityManager, semanticId: string): Promise<void> {
    await manager.query(`DELETE FROM sdd_skill_aliases WHERE semantic_id = ?`, [semanticId]);
  }

  async deleteSemantic(manager: EntityManager, id: string): Promise<void> {
    await manager.query(`DELETE FROM sdd_skill_semantics WHERE id = ?`, [id]);
  }
}
```

### service 改造后的 3 个 CRUD 方法

```ts
async createSemantic(input: CreateSddSemanticRequest): Promise<SddSemantic> {
  const dataSource = await this.mysqlDataSourceManager.getDataSource();
  const unitOfWork = new TypeOrmUnitOfWork(dataSource);
  await unitOfWork.run(async (context) => {
    if (!context.manager) throw new Error('missing transaction manager');
    const manager = context.manager;
    await this.sddWriteRepository.upsertSemantic(manager, input);
    const semanticId = await this.sddWriteRepository.findSemanticIdByCode(manager, input.semanticCode);
    if (!semanticId) {
      throw new Error(`failed to create semantic: ${input.semanticCode}`);
    }
    for (const skillName of input.aliases) {
      await this.sddWriteRepository.upsertSemanticAlias(manager, semanticId, skillName);
    }
  });

  const semantic = (await this.listSemantics()).find(
    item => item.semanticCode === input.semanticCode,
  );
  if (!semantic) throw new Error(`semantic not found after create: ${input.semanticCode}`);
  return semantic;
}

async updateSemantic(id: string, input: UpdateSddSemanticRequest): Promise<SddSemantic> {
  const dataSource = await this.mysqlDataSourceManager.getDataSource();
  const unitOfWork = new TypeOrmUnitOfWork(dataSource);
  await unitOfWork.run(async (context) => {
    if (!context.manager) throw new Error('missing transaction manager');
    const manager = context.manager;
    await this.sddWriteRepository.updateSemantic(manager, id, input);
    await this.sddWriteRepository.deleteSemanticAliases(manager, id);
    for (const skillName of input.aliases) {
      await this.sddWriteRepository.insertSemanticAlias(manager, id, skillName);
    }
  });

  const all = await this.listSemantics();
  const updated = all.find(item => item.id === id);
  if (!updated) throw new Error(`semantic not found after update: ${id}`);
  return updated;
}

async deleteSemantic(id: string): Promise<void> {
  const dataSource = await this.mysqlDataSourceManager.getDataSource();
  const unitOfWork = new TypeOrmUnitOfWork(dataSource);
  await unitOfWork.run(async (context) => {
    if (!context.manager) throw new Error('missing transaction manager');
    const manager = context.manager;
    await this.sddWriteRepository.deleteSemanticAliases(manager, id);
    await this.sddWriteRepository.deleteSemantic(manager, id);
  });
}
```

注意：`@Inject('sddWriteRepository') sddWriteRepository!: SddWriteRepository;` 需要加到 `SddQueryService` class 顶部的 inject 列表。

### 必做检查清单（PR5d1）

- [ ] 新建 `server/src/modules/sdd/sdd-write.repository.ts`
- [ ] 改 `server/src/modules/sdd/sdd-query.service.ts`（3 个 CRUD + 加 inject）
- [ ] 改 `server/src/modules/index.ts`：在 sdd 区块加 `import './sdd/sdd-write.repository';`
- [ ] 改 `server/src/bootstrap.ts`：顶部 import + preloadModules 数组加 `SddWriteRepository`
- [ ] `pnpm typecheck` 全绿
- [ ] 验证 POST/PUT /api/sdd/semantics 行为不变（创建测试 semantic + 更新 + 用 mysql 清理，参考 PR2 验证流程，避免污染数据）
- [ ] commit（**只 add 上述 4 个文件**，不 add web/*）

### PR5d1 commit message 模板

```
refactor(sdd): sdd-write 抽出 repository（PR5d1 事务参与）

createSemantic / updateSemantic / deleteSemantic 三个 CRUD 方法的
8 条事务 SQL 提到新建的 sdd-write.repository.ts。模式跟
ingest-write.repository.ts 一致：repository 方法接收 manager:
EntityManager，service 用 TypeOrmUnitOfWork.run 控制事务边界。

- 新建 server/src/modules/sdd/sdd-write.repository.ts（7 个方法
  对应 sdd-query.service.ts 内联的 8 条事务 SQL，含 upsertSemantic /
  findSemanticIdByCode / upsertSemanticAlias / insertSemanticAlias /
  updateSemantic / deleteSemanticAliases / deleteSemantic）
- 重写 sdd-query.service.ts 的 3 个 CRUD 方法体：去掉 manager.query
  调用，改为 this.sddWriteRepository.xxx(manager, ...)
- bootstrap.ts preloadModules 加 SddWriteRepository
- modules/index.ts 加 side-effect import

验证：
- pnpm typecheck 全绿
- POST /api/sdd/semantics + PUT /api/sdd/semantics/:id 创建/更新
  测试 semantic 验证事务行为；用 mysql 直接 DELETE 清理测试数据

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
```

---

## 3. PR5d2：sdd-query.repository（14 个只读端点 / 29 条 SQL）

### 范围

提到 repository 的方法（同 service 文件）：

| Service 方法 | 行号 | SQL 数 | 备注 |
| --- | --- | --- | --- |
| `listSemantics` | 264-300 | 1 | JOIN aliases |
| `getOverview` | 418-468 | 3（usage count + work items + artifacts） | 共享 timeRange WHERE |
| `getFunnel` | 470-543 | 3（interaction count + quality + semantic 分布） | |
| `getSkillAnalytics` | 545-680 | 3 main + 2 internal | 内部调 `querySkillAnalyticsKpis` / `querySkillQuality`，2 个 private helper 也要拆出来 |
| `getSkillTimeseries` | 682-717 | 1 | bucketize |
| `getUsageSummary` | 719-802 | 3（count + list + versions IN 展开） | 用 `buildUsageSummaryWhere` 私有 helper |
| `listUsages` | 804-834 | 1 | 用 `buildUsageWhere` |
| `listInteractions` | 836-870 | 1 | EXISTS 子查询过滤 semanticCode |
| `getInteractionDetail` | 872-899 | 1 | |
| `listInteractionToolCalls` | 901-932 | 1 | |
| `listErrors` | 934-985 | 1 | 用 `buildErrorWhere`（注意：当前 `listErrors` 用的是 `addCommonFilters`/`buildXxxWhere` 类的逻辑，仔细看代码） |
| `listUsers` | 987-1016 | 1 | |
| `listVersions` | 1018-1037 | 1 | |
| `listWorkItems` | 1039-1060 | 1 | cursor 可选 |
| `getWorkItemDetail` | 1062-1106 | 4（work_item + artifacts + usage count + error count） | |
| `reportUserSettings` | 1108-1148 | 1 | upsert 单 SQL，无事务包裹 |
| private `querySkillAnalyticsKpis` | 1206-1239 | 1 | 6 个 sub-SELECT |
| private `querySkillQuality` | 1241-1264 | 1 | sub-SELECT triggered + main |

合计 **29 条只读 SQL**。

### 设计要点

1. **repository 内部 inject `MysqlDataSourceManager`**（不接收 manager）—— 跟 events-query / ops-query / ingest-health repository 一致
2. **`buildUsageWhere` / `buildUsageSummaryWhere` / `addCommonFilters` 等 helper 留在 service**（它们是动态 SQL 拼接，涉及业务规则）
3. **`toWorkItem` / 各种 row → DTO 转换函数留在 service**
4. **22 个 row interface 全部 export 到 repository**（service 重新 import 用作类型断言）
5. **`SDD_OVERVIEW_DOCUMENT_TYPES` 常量留在 service**（业务定义）

### 推荐 repository 方法签名（对应 sql-registry.md 第一节命名）

```ts
@Provide('sddQueryRepository')
export class SddQueryRepository {
  @Inject('mysqlDataSourceManager')
  mysqlDataSourceManager!: MysqlDataSourceManager;

  // SQL #1
  async listSemantics(): Promise<SemanticRow[]>;

  // SQL #10/11/12（getOverview）
  async countOverviewUsage(clauses: string[], params: unknown[]): Promise<OverviewUsageRow[]>;
  async countOverviewWorkItems(clauses: string[], params: unknown[]): Promise<CountRow[]>;
  async countOverviewArtifacts(clauses: string[], params: unknown[]): Promise<CountRow[]>;

  // SQL #13/14/15（getFunnel）
  async countInteractions(clauses: string[], params: unknown[]): Promise<CountRow[]>;
  async aggregateInteractionQuality(clauses: string[], params: unknown[]): Promise<FunnelQualityRow[]>;
  async aggregateSemanticDistribution(clauses: string[], params: unknown[]): Promise<FunnelRow[]>;

  // SQL #16/17/18（getSkillAnalytics main）
  async topSemanticsByWindow(window: ResolvedTimeWindow): Promise<FunnelRow[]>;
  async aggregateSemanticMatchHealth(window: ResolvedTimeWindow): Promise<SkillMatchHealthRow[]>;
  async topUnmatchedSkills(window: ResolvedTimeWindow): Promise<TopUnmatchedRow[]>;

  // SQL #19（getSkillTimeseries）
  async bucketizeSkillUsage(
    fromIso: string,
    toIso: string,
    bucketSeconds: number,
  ): Promise<SkillTimeseriesRow[]>;

  // SQL #20/21/22（getUsageSummary）
  async countUsageSummary(clauses: string[], params: unknown[]): Promise<CountRow[]>;
  async listUsageSummary(
    clauses: string[],
    params: unknown[],
    pageSize: number,
    offset: number,
  ): Promise<UsageSummaryRow[]>;
  async aggregateVersionsByRawSkillNames(
    clauses: string[],
    params: unknown[],
    rawSkillNames: string[],
  ): Promise<UsageVersionRow[]>;

  // SQL #23
  async listUsages(clauses: string[], params: unknown[], limit: number): Promise<UsageRow[]>;

  // SQL #24
  async listInteractions(
    clauses: string[],
    params: unknown[],
    limit: number,
  ): Promise<InteractionRow[]>;

  // SQL #25
  async getInteractionDetail(interactionId: string): Promise<InteractionDetailRow[]>;

  // SQL #26
  async listInteractionToolCalls(interactionId: string): Promise<InteractionToolCallRow[]>;

  // SQL #27
  async listErrors(clauses: string[], params: unknown[], limit: number): Promise<ErrorRow[]>;

  // SQL #28
  async listUsers(): Promise<UserRow[]>;

  // SQL #29
  async listVersions(): Promise<VersionRow[]>;

  // SQL #30
  async listWorkItems(clauses: string[], params: unknown[], limit: number): Promise<WorkItemRow[]>;

  // SQL #31/32/33/34（getWorkItemDetail）
  async getWorkItem(workItemId: string): Promise<WorkItemRow[]>;
  async listWorkItemArtifacts(workItemId: string): Promise<ArtifactRow[]>;
  async countWorkItemUsages(workItemId: string): Promise<CountRow[]>;
  async countWorkItemErrors(workItemId: string): Promise<CountRow[]>;

  // SQL #35
  async upsertUserSettings(input: ReportUserSettingsRequest, userKey: string): Promise<void>;

  // SQL #36/37（private helper → 提到 repository）
  async skillAnalyticsKpis(window: ResolvedTimeWindow): Promise<SkillAnalyticsKpiRow[]>;
  async skillQualityWithTrigger(window: ResolvedTimeWindow): Promise<SkillQualityAnalyticsRow[]>;
}
```

注意：`ResolvedTimeWindow` 是 `interface` 在 sdd-query.service.ts 第 252 行附近定义——也 export 到 repository 或者保留在 service 都行（建议 export 到 repository 让接口完整）。

### service 改造后大致样子

- 注入：`@Inject('sddQueryRepository') sddQueryRepository!: SddQueryRepository;`（替换 `@Inject('mysqlDataSourceManager')`，但保留它给 createSemantic/updateSemantic/deleteSemantic 用——这些方法仍要拿 dataSource 创建 TypeOrmUnitOfWork）
- 等等：仔细想，service 仍然需要 `MysqlDataSourceManager` 因为 PR5d1 的 3 个 CRUD 用 TypeOrmUnitOfWork。**保留两个 inject**：
  ```ts
  @Inject('mysqlDataSourceManager')
  mysqlDataSourceManager!: MysqlDataSourceManager;

  @Inject('sddWriteRepository')
  sddWriteRepository!: SddWriteRepository;

  @Inject('sddQueryRepository')
  sddQueryRepository!: SddQueryRepository;
  ```
- 14 个只读方法体改成 `this.sddQueryRepository.xxx(...)` 调用，外加业务转换
- `buildUsageWhere` / `buildUsageSummaryWhere` / `addCommonFilters` / `toWorkItem` 等 private 方法保留
- `querySkillAnalyticsKpis` / `querySkillQuality` 原本是 service 私有方法，现在它们的 SQL 提到 repository，service 端依然可以保留为私有方法（薄包装）或直接在 `getSkillAnalytics` 内 inline 调 repository

### 必做检查清单（PR5d2）

- [ ] 新建 `server/src/modules/sdd/sdd-query.repository.ts`
- [ ] 改 `server/src/modules/sdd/sdd-query.service.ts`（14 个只读方法 + 加 inject + 删除 dataSource.query / addTimeRangeWhere 直接用法 / 保留 buildXxxWhere helper）
- [ ] 改 `server/src/modules/index.ts`：加 `import './sdd/sdd-query.repository';`
- [ ] 改 `server/src/bootstrap.ts`：顶部 import + preloadModules 加 `SddQueryRepository`
- [ ] `pnpm typecheck` 全绿
- [ ] 验证 sdd 模块 16 个端点（详见下文 §5 验证清单）
- [ ] commit（**只 add 上述 4 个文件**，不 add web/*）

### PR5d2 commit message 模板

```
refactor(sdd): sdd-query 抽出 repository（PR5d2 14 个只读端点 / 29 条 SQL）

完成 sdd 模块所有只读 SQL 的 repository 抽离。这是本轮 repository
重构最大的一个 PR（sdd-query.service.ts 1452 行 → 大幅瘦身）。

设计要点：
- repository 方法跟 sql-registry.md 第一节的"建议命名"一一对应
- buildUsageWhere / buildUsageSummaryWhere / addCommonFilters /
  toWorkItem 等业务 helper 留在 service
- 22 个 row interface 全部 export 到 repository，service 重新 import
- private querySkillAnalyticsKpis / querySkillQuality 的 SQL 提到
  repository（命名 skillAnalyticsKpis / skillQualityWithTrigger）

- 新建 server/src/modules/sdd/sdd-query.repository.ts（约 26 个方法）
- 重写 sdd-query.service.ts 的 14 个只读端点方法体
- bootstrap.ts preloadModules 加 SddQueryRepository
- modules/index.ts 加 side-effect import

验证：
- pnpm typecheck 全绿
- 16 个 sdd 端点（13 @Get + 3 @Post/@Put）全 200，关键数值与 baseline 一致

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
```

---

## 4. PR5e：worker repository（cleaning + outbox 共 26 SQL）

### 范围

提到 repository 的方法：

| Worker 文件 | 函数 | 行号 | SQL 数 |
| --- | --- | --- | --- |
| `worker/src/jobs/cleaning-worker.ts` | markBatchFailed | 180-206 | 1 |
| 同上 | markBatchProcessing | 208-253 | 2（SELECT FOR UPDATE + UPDATE） |
| 同上 | upsertLogEvent | 359+ | 1 |
| 同上 | loadScopedEvents | 441+ | 1 |
| 同上 | upsertInteractions | 517+ | 1 |
| 同上 | upsertInteractionTexts | 609+ | 1 |
| 同上 | upsertToolCalls | 675+ | 1 |
| 同上 | upsertSkillUsages | 732+, 755+ | 2（loadAliases + upsert） |
| 同上 | upsertErrors | 834+ | 1 |
| 同上 | upsertWorkItems | 933+, 966+ | 2 |
| 同上 | loadUserRequirementsRoots | 1048+ | 1 |
| 同上 | loadSkillSemanticMatchers | 1068+ | 1 |
| 同上 | findUsageAndWorkItemForError | 1230+ | 1 |
| 同上 | linkSkillUsageToWorkItem | 1258+ | 1 |
| 同上 | markBatchParsed | 1283+ | 1 |
| 同上 | selectIdByKey | 2020+ | 1 |
| `worker/src/jobs/scheduled-cleaning-runner.ts` | claimOneOutbox | 88-137 | 3 |
| 同上 | markOutboxSucceeded | 139-152 | 1 |
| 同上 | markOutboxFailed | 154-181 | 1 |

合计 **26 SQL**（cleaning-worker 21 + scheduled-cleaning-runner 5）。

注意：PR3 已经删了 `acquireCleaningLocks` / `releaseCleaningLocks` 函数（GET_LOCK 命名锁不再使用），所以**不要把这两个函数当作 SQL 列在 repository 里**——它们已经不存在。

### 关键差异：worker 端不用 midway DI

worker 是独立进程（入口 `worker/src/main.ts`），**没有 midway 装饰器、没有 @Provide / @Inject**。当前所有函数都是模块级 `async function`，接收 `connection: PoolConnection` 或 `pool: Pool` 作为第一个参数。

repository 模式在 worker 端要适配：**用普通 class（不带 @Provide），手动 new、手动注入**。

### 设计 pattern

**两个 repository 文件**：

1. `worker/src/jobs/cleaning.repository.ts` —— 21 条 cleaning-worker.ts 内 SQL
2. `worker/src/jobs/outbox.repository.ts` —— 5 条 scheduled-cleaning-runner.ts 内 SQL

每个 repository 是普通 class：

```ts
// worker/src/jobs/cleaning.repository.ts
import type { Pool, PoolConnection, ResultSetHeader } from 'mysql2/promise';

export interface BatchRow { ... }
export interface EventRow { ... }
// ... 其他 row 类型

export class CleaningRepository {
  async markBatchFailed(
    pool: Pool,
    batchId: string,
    status: 'failed_retryable' | 'failed_terminal',
    statusReason: string,
    errorMessage: string,
  ): Promise<void> {
    await pool.query(
      `UPDATE otel_ingest_batches SET ...`,
      [status, statusReason, errorMessage, batchId],
    );
  }

  async lockAndLoadBatch(connection: PoolConnection, batchId: string): Promise<BatchRow[]> {
    const [rows] = await connection.query<BatchRow[]>(
      `SELECT ... FROM otel_ingest_batches ... LIMIT 1 FOR UPDATE`,
      [batchId],
    );
    return rows;
  }

  // ... 其他 19 个方法
}
```

方法签名设计原则：
- 事务参与的方法（在 `withTransaction` callback 内调用）：第一参数 `connection: PoolConnection`
- 事务外的方法（裸 query）：第一参数 `pool: Pool`
- 完全静态信息查询（loadSkillSemanticMatchers）：也接收 `connection`（因为它在 W2 事务内被调用）

### 调用方改造

`worker/src/jobs/cleaning-worker.ts`：

- 顶部 `const cleaningRepository = new CleaningRepository();`（或者在 `cleanBatch` 的 `dependencies` 参数里注入）
- 各个 inline async function 改成 `await cleaningRepository.xxx(connection, ...)` 调用
- 删除原 inline SQL，保留业务转换逻辑（如 `extractRequirementsRoot` 等辅助函数）

`worker/src/jobs/scheduled-cleaning-runner.ts`：

- 类似处理，注入 `new OutboxRepository()`

`worker/src/main.ts`：**无需改动**——worker 入口逻辑保持，只是内部 module 实现变了。

### 必做检查清单（PR5e）

- [ ] 新建 `worker/src/jobs/cleaning.repository.ts`
- [ ] 新建 `worker/src/jobs/outbox.repository.ts`
- [ ] 改 `worker/src/jobs/cleaning-worker.ts`（提取 21 处 SQL，删除原 inline async function 的 body 改为 repository 调用，保留业务逻辑）
- [ ] 改 `worker/src/jobs/scheduled-cleaning-runner.ts`（提取 5 处 SQL）
- [ ] **不要碰** `worker/src/main.ts`（已经是定时扫描入口，PR1 已 clean 过）
- [ ] `pnpm typecheck` 全绿
- [ ] `pnpm --filter @sdd-telemetry/worker build` 编译通过
- [ ] `pnpm --filter @sdd-telemetry/worker once` 跑一次，验证 `claimed > 0 / succeeded > 0 / failed=0`
- [ ] 派生表唯一键校验（5 张表 duplicates 全 0）—— 用 PR3 commit message 里的 SQL，参考 transaction-registry.md 第六节
- [ ] commit（**只 add worker 改动**，不 add web/*）

### PR5e commit message 模板

```
refactor(worker): cleaning + outbox 抽出 repository 层（PR5e）

worker 端 26 条 SQL 提到两个 repository 类（cleaning.repository.ts +
outbox.repository.ts）。worker 没有 midway DI，所以用普通 class
手动 new，方法接收 connection: PoolConnection 或 pool: Pool 作为
第一个参数——保持事务边界由调用方控制。

设计要点：
- cleaning-worker.ts 21 条 SQL → CleaningRepository（含 W1/W2 事务
  内的 upsert 系列 + 裸 query 的 markBatchFailed / markBatchParsed）
- scheduled-cleaning-runner.ts 5 条 SQL → OutboxRepository
- 业务逻辑（OTel 提取、stable key 计算、字段映射等）全部保留在
  原文件，repository 只负责 SQL
- 不动 worker/src/main.ts（定时扫描入口在 PR1 已稳定）

验证：
- pnpm typecheck 全绿
- pnpm --filter @sdd-telemetry/worker once: claimed=X, succeeded=X, failed=0
- 派生表唯一键校验：5 张表 (sdd_interactions/sdd_skill_usages/
  sdd_errors/sdd_work_items/sdd_work_item_artifacts) duplicates=0

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
```

---

## 5. 验证 / 调试

### 5.1 跑端点验证

每个 PR 完成后，curl 验证对应模块的所有端点。可以用同目录已经生成的 baseline 做参考：

```bash
# sdd 模块验证
for ep in "semantics" \
          "overview?from=2020-01-01T00:00:00Z&to=2030-01-01T00:00:00Z" \
          "funnel?from=2020-01-01T00:00:00Z&to=2030-01-01T00:00:00Z" \
          "skill-analytics?from=2020-01-01T00:00:00Z&to=2030-01-01T00:00:00Z" \
          "skill-timeseries?from=2020-01-01T00:00:00Z&to=2030-01-01T00:00:00Z&bucketSeconds=3600" \
          "usage-summary?from=2020-01-01T00:00:00Z&to=2030-01-01T00:00:00Z&limit=5" \
          "usages?from=2020-01-01T00:00:00Z&to=2030-01-01T00:00:00Z&limit=3" \
          "interactions?from=2020-01-01T00:00:00Z&to=2030-01-01T00:00:00Z&limit=3" \
          "errors?from=2020-01-01T00:00:00Z&to=2030-01-01T00:00:00Z&limit=3" \
          "users" "versions" "work-items?limit=5"; do
  STATUS=$(curl -s -o /tmp/eps.json -w "%{http_code}" "http://127.0.0.1:4318/api/sdd/$ep")
  SUCC=$(python3 -c "import json; d=json.load(open('/tmp/eps.json')); print(d.get('success'))")
  echo "GET sdd/$ep -> $STATUS / success=$SUCC"
done
```

`baseline` JSON 文件在 `endpoint-baseline.json`，可以用 Python 对比关键数值——但要注意时效字段（`timestamp` / `requestId` / `gmt_create` 等）已经被 mask 成 `<MASKED>`，**业务数据字段**（如 `totalEvents` / `items.length`）才有意义对比。

### 5.2 重启 server

dev server 用 `tsx watch`，理论上文件改动会自动 reload。但**新加 @Provide class 时，preloadModules 必须先加好再保存文件**——否则 tsx watch 触发的 reload 会跑 DI 时报 `MidwayDefinitionNotFoundError`。

如果调试中需要强重启 server：

```bash
pnpm stop       # 杀所有 dev 进程（含 server / worker / vite）
pnpm dev        # 重新起全部
# 或者只起 server：
pnpm --filter @sdd-telemetry/server dev
```

启动等就绪：

```bash
until curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:4318/api/ingest/health 2>/dev/null | grep -q "200"; do sleep 2; done
echo "server ready"
```

### 5.3 worker 冒烟

```bash
pnpm --filter @sdd-telemetry/worker build
pnpm --filter @sdd-telemetry/worker once
```

期望输出：

```
sdd-telemetry scheduled cleaner ready
scheduled cleaner once completed { claimed: X, succeeded: X, failed: 0 }
```

### 5.4 派生表唯一键校验

```bash
docker exec sdd-telemetry-mysql mysql -usdd-telemetry -psdd-telemetry sdd-telemetry -e "
SELECT 'sdd_interactions' AS table_name, COUNT(*) AS rows_total, COUNT(DISTINCT interaction_key) AS unique_keys, COUNT(*) - COUNT(DISTINCT interaction_key) AS duplicates FROM sdd_interactions
UNION ALL
SELECT 'sdd_skill_usages', COUNT(*), COUNT(DISTINCT usage_key), COUNT(*) - COUNT(DISTINCT usage_key) FROM sdd_skill_usages
UNION ALL
SELECT 'sdd_errors', COUNT(*), COUNT(DISTINCT error_key), COUNT(*) - COUNT(DISTINCT error_key) FROM sdd_errors
UNION ALL
SELECT 'sdd_work_items', COUNT(*), COUNT(DISTINCT work_item_key), COUNT(*) - COUNT(DISTINCT work_item_key) FROM sdd_work_items
UNION ALL
SELECT 'sdd_work_item_artifacts', COUNT(*), COUNT(DISTINCT artifact_key), COUNT(*) - COUNT(DISTINCT artifact_key) FROM sdd_work_item_artifacts;
"
```

期望：5 张表 `duplicates` 列全 0。

---

## 6. 停下来问 user 的场景

不要把以下场景擅自处理，停下来明确告诉 user：

1. **某个 SQL 在你的设计下不知道怎么映射 repository 方法** —— 例如某 SQL 的 WHERE 条件包含动态字段名（不是表名，而是列名），不能简单参数化，请 user 确认是否保留特殊处理
2. **端点验证失败且无法 30 分钟内定位原因** —— 不要无止境调试，列出排查过的方向报告 user
3. **修改 web/* 文件的需求** —— 这两个文件是 user 自己的预先存在改动，绝对不要碰
4. **任何会改变 SQL 语义的"优化"想法** —— 比如发现某 SQL 的 GROUP BY 多了一列、想精简——不要做。本次只搬不改
5. **超出 PR5d1 / PR5d2 / PR5e 范围的"顺手清理"想法** —— 例如想把 `sdd_users` 表的 upsertUser 也提到 ingest-write.repository.ts 之外的地方——不要做，超出本轮范围

## 7. 关键文件路径速查

```
项目根: /Users/loomisli/Desktop/lm/sdd-telemetry/

# 入口配置
server/src/bootstrap.ts             ← preloadModules 必加
server/src/modules/index.ts         ← side-effect import 必加

# 已有 repository 参考（PR5a/5b/5c 产出）
server/src/modules/events/events-query.repository.ts   ← 只读模式样板
server/src/modules/ops/ops-query.repository.ts         ← 动态表名样板
server/src/modules/ingest/ingest-health.repository.ts  ← 只读 + JOIN 样板
server/src/modules/ingest/ingest-write.repository.ts   ← 事务参与模式样板 (PR5d1 参考)

# 抽象层
server/src/common/transaction/unit-of-work.ts          ← TypeOrmUnitOfWork
worker/src/infrastructure/mysql/client.ts              ← withTransaction
server/src/infrastructure/mysql/data-source-manager.ts ← MysqlDataSourceManager

# PR5d 目标
server/src/modules/sdd/sdd-query.service.ts            ← 1452 行待瘦身
server/src/modules/sdd/sdd.controller.ts               ← 不改

# PR5e 目标
worker/src/jobs/cleaning-worker.ts                     ← 提取 21 SQL
worker/src/jobs/scheduled-cleaning-runner.ts           ← 提取 5 SQL
worker/src/main.ts                                     ← 不改

# 参考文档（背景）
docs/bkfesddcore-migration-prep/review.md
docs/bkfesddcore-migration-prep/sql-registry.md
docs/bkfesddcore-migration-prep/transaction-registry.md
docs/bkfesddcore-migration-prep/cleaning-steps.md
docs/bkfesddcore-migration-prep/schedule-mapping.md
```

上述路径均在当前 `sdd-telemetry` 仓库内，交接给公司电脑时不再依赖外部需求文档目录。

---

## 8. 完成后报告什么

每个 PR 完成后，给 user 一个简短状态：

```
PR5dX 完成 (commit <hash>)
- 改动：N 文件，+X 行 / -Y 行（不含 web/*）
- 验证：typecheck 全绿 / 端点 N/N 200 / 派生表 duplicates=0
- 下一步：PR5dY 还是收尾
```

3 个 PR 全部完成后，给一个完整汇总：5 个 PR 的 commit hash 表格 + 整体净行数变化 + 迁移友好度提升说明。

不要写新的文档（如 PR-summary.md），直接在对话里报告即可。

---

## 附：sdd-query.service.ts 22 个 row interface 速查

PR5d2 必须把这些 interface 全部 export 到 sdd-query.repository.ts（service 端 import 它们用作类型断言）：

```
SemanticRow              L42-50
FunnelRow                L52-58
OverviewUsageRow         L60-63
FunnelQualityRow         L65-70
CountRow                 L72-74
UsageSummaryRow          L76-86
UsageVersionRow          L88-92
SkillAnalyticsKpiRow     L94-101
SkillMatchHealthRow      L103-106
TopUnmatchedRow          L108-111
SkillTimeseriesRow       L113-117
SkillQualityAnalyticsRow L119-126
UsageRow                 L128-142
InteractionRow           L144-171
InteractionDetailRow     L173-175
InteractionToolCallRow   L177-191
ErrorRow                 L193-205
UserRow                  L207-219
VersionRow               L221-226
WorkItemRow              L228-238
ArtifactRow              L240-246
IdRow                    L248-250
ResolvedTimeWindow       L252+
```

行号基于 PR2/3/5a/5b/5c 完成后的当前版本（commit f7ffb5c 之后到本 prompt 落盘时刻）。后续如果有改动行号会偏移，以实际为准。
