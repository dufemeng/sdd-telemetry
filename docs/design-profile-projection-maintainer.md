# Profile Projection Maintainer 设计方案

## 背景

当前 `e2e-monorepo` 暴露的问题不是单个 profile 的配置问题，而是 Profile 架构缺少自动维护链路：

```text
OTel raw payload
-> worker 自动清洗 sdd_* 派生事实
-> source_references / profile_* 需要手工 CLI rebuild
-> 页面读 current projection，可能仍是旧 run 或 0
```

这违反了 Profile 的产品抽象。Profile 应该是同一批规范事实的不同投影视图，不应该有“SDD 默认工作流自动清洗，其他 profile 手工跑命令”的差异。

## 目标

1. 所有 active profile 共享同一条自动事实生产和投影维护链路。
2. `e2e-monorepo` 只是第一套 source-backed profile，不出现 profileId 特判。
3. worker 依赖抽象接口和 adapter registry，不依赖具体 profile 实现。
4. 新增 profile 主要通过配置组合完成；新增投影模式才新增 adapter。
5. CLI 保留为历史回填、强制重建、排障工具，不再是日常产品链路。
6. 投影失败不影响清洗主链路，不切换 current pointer。
7. 支持投影失败时继续读取上一版完整 snapshot projection run，并支持人工切回旧 run。

## 非目标

1. 不把每套 profile 做成独立清洗 pipeline。
2. 不在 worker 主流程里硬编码 `e2e-monorepo`、`online-docs` 或任何未来 profileId。
3. 不要求用户每次 prompt 后手工执行 profile 命令。
4. 不让页面直接读半成品 projection。
5. 当前版本不实现 delta projection；delta 只有在 copy-on-write 回退和跨窗口归因都闭环后，才作为后续优化进入实现。

## 审查修订结论

采纳独立审查意见后，本方案做以下收敛：

- 投影策略改为 snapshot-only。每次成功投影都生成新的 completed run，然后切换 current pointer；失败时 pointer 不变。
- `sdd_bridge` profile 不依赖 source rules 触发 dirty。清洗批次只要产出 `sdd_*` 派生事实，就标记所有 active `sdd_bridge` profile 为 dirty。
- source-backed profile 的配置 hash 以运行时解析结果为准，必须包含 env 解析后的 root、fallback base、rules、projection mode 和 adapter version。
- 配置 hash 变化时，先按 `profile_id + profile_config_version_id` 重匹配 `source_references` 并写入隔离的 `profile_source_matches`，再执行 snapshot 投影。
- worker 锁模型统一使用 `profile_projection_jobs` 行级 job lock；新维护链路不再叠加 `GET_LOCK`。
- CLI 强制重建也必须先 mark dirty 再 claim `profile_projection_jobs`，不能绕过 job lock 直接调用 adapter。
- dirty 竞态使用单调递增的 `dirty_seq` / `running_dirty_seq`，不使用 DATETIME 比较判断是否误清。

## 正确数据生命周期

```text
OTel raw payload
  -> clean_batch outbox
  -> CleanBatchProcessor
  -> Canonical Facts
       sdd_interactions
       sdd_interaction_tool_calls
       sdd_interaction_texts
       source_references
  -> Profile Source Matching
       profile_source_matches
  -> Profile Projection Jobs
       profile_projection_jobs
  -> Projection Adapter
       SddBridgeProjectionAdapter
       SourceBackedProjectionAdapter
       future adapters...
  -> Versioned Projection Run
       profile_projection_runs
       profile_current_projection_runs
       profile_* read model tables
  -> Dashboard
```

核心原则：

- 清洗产出 profile 无关事实。
- 匹配层把 profile config 应用到事实，产出 profile/source 的匹配结果。
- 投影层只消费匹配结果和 profile rules。
- 页面只读 current pointer 指向的已完成 run。

## 抽象边界

### 1. Canonical Fact

规范事实是 profile 无关的最小事实集合。

当前已有：

- `sdd_interactions`
- `sdd_interaction_tool_calls`
- `sdd_interaction_texts`
- `sdd_skill_usages`
- `source_references`

需要补强：

- `source_references` 必须在 clean batch 主链路内自动 upsert。
- `source_references` 需要记录来源 batch，用于 dirty 追踪。

新增字段：

```sql
ALTER TABLE source_references
  ADD COLUMN source_batch_id BIGINT UNSIGNED NULL AFTER event_id,
  ADD KEY idx_source_references_source_batch_id (source_batch_id);
```

`source_batch_id` 来自清洗中的 `otel_ingest_batches.id` 或 `sdd_interactions.source_batch_id`。它不是业务语义，只用于自动维护链路定位变化范围。

### 2. Source Reference Extraction

接口：

```ts
export interface SourceReferenceExtractor {
  extract(input: ToolCallFact): SourceReferenceInput[];
}

export interface SourceReferenceWriter {
  upsertMany(input: {
    batchId: string;
    references: SourceReferenceInput[];
  }): Promise<SourceReferenceWriteResult>;
}
```

现有 `extractSourceReferences()` 继续作为默认 extractor 的 implementation；现有 `rebuild-source-references.ts` 变成调用同一 writer 的 backfill adapter。

CleanBatchProcessor 在完成 tool call 派生后，拿本 batch 的 tool calls 和完整 attributes，调用 extractor + writer。这样新 prompt 产生的路径事实会自动进入 `source_references`。

### 3. Profile Catalog

接口：

```ts
export interface ProfileCatalog {
  listActiveProfiles(): WorkflowProfileConfig[];
  getProfile(profileId: string): WorkflowProfileConfig | undefined;
}
```

adapter：

- `RegistryProfileCatalog`：读取 `packages/api/src/profile-config/profile-registry.ts`。

worker 主流程只依赖 `ProfileCatalog`，不 import 具体 profile 文件，也不判断具体 profileId。

### 4. Profile Source Matching

Profile 匹配层负责把规范 source facts 应用到 profile source rules。

新增表：

```sql
CREATE TABLE profile_source_matches (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  profile_id VARCHAR(191) NOT NULL,
  source_reference_id BIGINT UNSIGNED NOT NULL,
  source_reference_key CHAR(64) NOT NULL,
  matched_rule_id VARCHAR(191) NOT NULL,
  category VARCHAR(32) NOT NULL,
  action_type VARCHAR(32) NOT NULL,
  locator_type VARCHAR(32) NOT NULL,
  normalized_locator VARCHAR(2048) NULL,
  relative_locator VARCHAR(2048) NULL,
  resource_id VARCHAR(2048) NULL,
  source_namespace VARCHAR(191) NULL,
  confidence VARCHAR(16) NULL,
  ambiguous TINYINT(1) NOT NULL DEFAULT 0,
  metadata_json JSON NULL,
  rule_version VARCHAR(32) NOT NULL,
  source_event_time DATETIME(3) NULL,
  gmt_create DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  gmt_modified DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uk_profile_source_matches_ref (profile_id, source_reference_key),
  KEY idx_profile_source_matches_profile_id (profile_id),
  KEY idx_profile_source_matches_source_ref_id (source_reference_id),
  KEY idx_profile_source_matches_rule (profile_id, matched_rule_id),
  KEY idx_profile_source_matches_event_time (source_event_time)
);
```

接口：

```ts
export interface ProfileSourceMatcher {
  match(input: {
    profile: WorkflowProfileConfig;
    source: SourceReferenceFact;
  }): ProfileSourceMatch | null;
}

export interface ProfileMatchWriter {
  upsertMatches(matches: ProfileSourceMatch[]): Promise<ProfileMatchWriteResult>;
}
```

已有 `matchSourceReference()` 作为 matcher implementation。`profile_source_matches` 是关键抽象层：后续第 N 个 profile 只要配置 source rules，就能进入同一匹配链路。

`profile_source_matches` 只保存匹配事实和排障所需字段。投影时仍然通过 `source_reference_id` join `source_references`，读取 `user_id`、`session_id`、`prompt_id`、`interaction_id`、`event_time`、`title`、`tool_name` 等事实字段，避免把规范事实重复冗余进 match 表。

### 5. Projection Job Store

profile 投影不能每个 source fact 同步重算。必须先 dirty 聚合，再由 scheduler 合并执行。

新增表：

```sql
CREATE TABLE profile_projection_jobs (
  profile_id VARCHAR(191) NOT NULL,
  status VARCHAR(32) NOT NULL,
  dirty_seq BIGINT UNSIGNED NOT NULL DEFAULT 0,
  running_dirty_seq BIGINT UNSIGNED NULL,
  dirty_since DATETIME(3) NULL,
  dirty_until DATETIME(3) NULL,
  dirty_reason VARCHAR(191) NULL,
  last_resolved_config_hash CHAR(64) NULL,
  attempts INT UNSIGNED NOT NULL DEFAULT 0,
  max_attempts INT UNSIGNED NOT NULL DEFAULT 20,
  next_retry_at DATETIME(3) NULL,
  locked_by VARCHAR(191) NULL,
  locked_until DATETIME(3) NULL,
  last_started_at DATETIME(3) NULL,
  last_completed_at DATETIME(3) NULL,
  last_projection_run_id BIGINT UNSIGNED NULL,
  last_error LONGTEXT NULL,
  gmt_create DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  gmt_modified DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (profile_id),
  KEY idx_profile_projection_jobs_status_retry (status, next_retry_at),
  KEY idx_profile_projection_jobs_locked_until (locked_until)
);
```

状态：

- `idle`：无待投影变化
- `dirty`：有事实变化待投影
- `running`：某 worker 正在投影
- `failed`：上次投影失败，等待重试或人工处理

接口：

```ts
export interface ProjectionJobStore {
  markDirty(input: ProfileDirtyInput): Promise<void>;
  claimNext(workerId: string, lockSeconds: number): Promise<ProjectionJob | null>;
  markSucceeded(input: ProjectionJobSuccess): Promise<void>;
  markFailed(input: ProjectionJobFailure): Promise<void>;
}
```

dirty 合并规则：

- 同一个 profile 多次 markDirty 只更新一行 job。
- 每次 markDirty 必须让 `dirty_seq = dirty_seq + 1`。
- `dirty_since` 保留最早时间。
- `dirty_until` 更新为最新时间。
- `dirty_reason` 记录最近一次主要原因，详细原因进入日志或维护事件表。
- `running` 期间如果再次 markDirty，不抢锁、不重启当前投影，只更新 `dirty_since` / `dirty_until` / `dirty_reason`。
- claim job 时记录 `running_dirty_seq = dirty_seq`。
- markSucceeded 时只有当当前行的 `dirty_seq <= running_dirty_seq`，才把 job 置为 `idle` 并清空 dirty 字段；如果 running 期间又来了新 dirty，成功 run 仍可发布，但 job 保持 `dirty`，等待下一轮 snapshot。

### 6. Projection Adapter

DIP 的核心是 worker 调度器依赖 `ProfileProjectionAdapter` 抽象，而不是依赖具体 profile 或具体表。

接口：

```ts
export interface ProfileProjectionAdapter {
  mode: ProjectionMode;
  project(input: {
    profile: WorkflowProfileConfig;
    runtime: RuntimeResolution;
    resolvedConfigHash: string;
    job: ProjectionJob;
    pool: Pool;
    logger: Logger;
  }): Promise<ProjectionRunResult>;
}

export interface ProfileProjectionAdapterRegistry {
  get(mode: ProjectionMode): ProfileProjectionAdapter;
}
```

adapter：

- `SddBridgeProjectionAdapter`
  - 包装现有 `SDD_BRIDGE_OPERATORS + knowledgeOperator + codeOperator`
  - 让 `sdd-default` 也进入同一调度模型
- `SourceBackedProjectionAdapter`
  - 消费 `profile_source_matches`
  - 复用现有 source-backed delivery/capability/knowledge/code operator 的业务规则
- 未来 adapter
  - 只注册新的 `projectionMode -> adapter`
  - 不改 worker scheduler

### 7. Projection Publication

继续保留 current pointer 模型：

```text
profile_projection_runs
profile_current_projection_runs
```

发布规则：

- adapter 写入一个新的 `profile_projection_runs`。
- 所有 profile\_\* 明细写入该 run。
- 成功后同一事务：
  - `profile_projection_runs.status = completed`
  - `profile_current_projection_runs.current_projection_run_id = newRunId`
- 失败：
  - `profile_projection_runs.status = failed`
  - 不更新 current pointer
  - 页面继续读旧 run

这是回退机制的根。

### 8. Projection Strategy

当前实现只做 snapshot。

snapshot 的含义：

- 每次投影都创建一个新的 `profile_projection_runs`。
- adapter 全量读取当前 profile 需要的事实和 match rows。
- 所有 profile read model 明细都写入新 run。
- 成功后同一事务切换 current pointer。
- 失败时新 run 标 failed，current pointer 继续指向旧 run。

适用场景：

- profile 第一次投影。
- 新 prompt 产生事实后自动投影。
- profile 配置版本变化。
- source rule / attribution rule 变化。
- env root / fallback base 变化。
- 人工强制重建。
- diff 检查失败后的修复。

当前不实现 delta 的原因：

- 回退机制依赖旧 completed run 仍然完整存在；原地 upsert current run 会破坏这个回退目标。
- attribution 需要同 interaction / session 窗口里的历史上下文，只处理 dirty range 容易归因错误。
- `source_references` 按 `reference_key` upsert，旧行更新时 id 不变，使用 id min/max 做增量边界会漏数据。

delta 作为未来优化，必须同时满足：

- copy-on-write 或独立 delta run，不能修改 current run 原始快照。
- attribution 能声明和加载完整上下文窗口。
- dirty 边界基于变更日志或 batch id，而不是 source_reference 自增 id。

### Resolved Config Hash

config hash 由运行时解析后的 profile config 中影响投影的字段计算：

- `projectionMode`
- `sourceRules`
- `deliveryUnitRules`
- `artifactRules`
- `capabilityRules`
- `attributionPolicy`
- env 解析后的 `root` / `fallbackBase`
- adapter version

必须基于 `resolveRuntimeProfileConfig(config, process.env)` 的结果计算 hash，而不是只 hash 原始 config。否则部署时只改 `E2E_MONOREPO_ROOT` / fallback env，路径匹配结果已经变化，但系统会误判为配置未变。

如果 `resolvedConfigHash !== profile_projection_jobs.last_resolved_config_hash`：

1. markDirty(profileId, reason=`config_changed`)。
2. 对目标配置版本全量重匹配历史 `source_references`，只删除或覆盖同一 `profile_id + profile_config_version_id` 下的 `profile_source_matches`。
3. 执行 snapshot projection。
4. 成功后更新 `last_resolved_config_hash`。

## Worker 主流程

常驻 worker 启动两个循环：

```text
CleaningLoop
  every SCHEDULE_CLEANING_INTERVAL_MS
  -> claim clean_batch
  -> cleanBatch
  -> sourceReferenceMaintainer.updateForBatch(batchId)
  -> dirtyProfileResolver.markDirtyBySddFacts(batchId)
  -> dirtyProfileResolver.markDirtyBySourceReferences(batchId)

ProjectionLoop
  every PROFILE_PROJECTION_INTERVAL_MS
  -> profileConfigChangeDetector.markDirtyIfResolvedHashChanged()
  -> claim dirty/failed job
  -> fullRematchIfNeeded(profile)
  -> adapterRegistry.get(profile.projectionMode)
  -> adapter.project(profile, runtime, resolvedConfigHash, job)
  -> markSucceeded / markFailed
```

默认配置：

```text
PROFILE_PROJECTION_ENABLED=true
PROFILE_PROJECTION_INTERVAL_MS=30000
PROFILE_PROJECTION_LOCK_SECONDS=300
PROFILE_PROJECTION_MAX_JOBS_PER_TICK=3
PROFILE_PROJECTION_MAX_ATTEMPTS=20
```

配置含义：

- enabled：可临时关闭自动投影，但默认开启。
- interval：后台调度频率。
- lockSeconds：防止多个 worker 同时投同一个 profile。
- maxJobsPerTick：避免投影占满 worker。

`compose.prod.yml` 需要透传这些 env，但都应有默认值。

### Dirty Profile Resolver

dirty 触发必须面向抽象，不面向 profileId。

触发来源：

- `sdd_bridge`：clean batch 产出任何 `sdd_interactions`、`sdd_interaction_tool_calls`、`sdd_interaction_texts`、`sdd_skill_usages` 等 SDD 派生事实时，标记所有 active published target `sdd_bridge` profile。
- `source_backed`：clean batch 产出或更新 `source_references` 后，标记所有 active published target source-backed profile。ProjectionLoop claim job 后先按目标配置版本重匹配 `profile_source_matches`，再投影；pending target 不能被后续 dirty 覆盖回旧 serving version。
- `config_changed`：projection loop 发现 resolved config hash 与上次成功投影 hash 不一致时，标记该 profile，并先执行全量 rematch。

这样 `sdd-default`、`e2e-monorepo` 和未来 profile 的 dirty 判断都由 projection mode 和 source rule 能力决定，不由 worker 硬编码 profileId。

## CLI 的新定位

现有命令保留，但语义调整：

```bash
node dist/jobs/rebuild-source-references.js
node dist/jobs/profile-rebuild.js --profile <profileId>
node dist/jobs/profile-diff.js --profile <profileId>
```

定位：

- 历史回填
- 修改 profile config 后强制 snapshot
- 排障
- 灾难恢复
- 与常驻 worker 使用同一个 `ProjectionJobStore` claim 流程，避免 CLI 和 worker 并发覆盖 current pointer。

日常用户 prompt 后不需要手动执行。

新增命令：

```bash
node dist/jobs/profile-maintain-once.js
```

作用：

- 执行一次 source match + projection job claim。
- 用于部署后 smoke test 和排障。
- 仍然走同一套 maintainer 抽象，不复制逻辑。

## 代码改动范围

### 新增模块

```text
worker/src/jobs/source-reference/
  extractor.ts
  writer.ts
  maintainer.ts

worker/src/jobs/profile-maintenance/
  profile-catalog.ts
  profile-config-hash.ts
  profile-source-matcher.ts
  profile-match-writer.ts
  dirty-profile-resolver.ts
  profile-config-change-detector.ts
  projection-job-store.ts
  projection-adapter.ts
  projection-adapter-registry.ts
  projection-maintainer.ts
  projection-scheduler.ts

worker/src/jobs/profile-maintain-once.ts
```

### 改造模块

```text
worker/src/jobs/cleaning-worker.ts
worker/src/jobs/scheduled-cleaning-runner.ts
worker/src/main.ts
worker/src/jobs/profile-projection/source-backed-operators.ts
worker/src/jobs/profile-rebuild.ts
worker/src/jobs/rebuild-source-references.ts
compose.prod.yml
server/src/infrastructure/mysql/verify-schema.ts
docs/database-model.md
README.md
```

### 新增 migrations

```text
server/src/infrastructure/mysql/migrations/
  1780000010000-add-source-reference-batch.ts
  1780000011000-create-profile-source-matches.ts
  1780000012000-create-profile-projection-jobs.ts
```

## 关键实现细节

### Source references 不能只靠全表 rebuild

`rebuild-source-references.ts` 当前是全表扫描工具。新实现中：

- `cleaning-worker` 在每个 batch 成功清洗后，直接对该 batch 的 tool calls 抽取 source references。
- `rebuild-source-references.ts` 调用同一个 `SourceReferenceMaintainer.rebuildAll()`。
- 避免出现“线上新 prompt 到了，但 source_references 仍然 0”的断层。

### Profile matching 独立于 projection

`source-backed-operators.ts` 当前每次投影都重新 load source facts 并 match。新实现应改成：

- clean batch 阶段只抽取 `source_references` 并标记 source-backed profile dirty。
- ProjectionLoop claim dirty source-backed profile 后，先按 `profile_id + profile_config_version_id` 全量重匹配历史 `source_references`，把匹配结果写入该配置版本隔离的 `profile_source_matches`。
- source-backed projection 消费 `profile_source_matches`。

这样做的收益：

- 匹配结果可观测，可直接排查“为什么某路径没有进入某 profile”。
- 多 profile 共享 source facts，但各自有独立 match rows。
- 投影 adapter 不需要知道路径匹配细节。

### Dirty profile 不能硬编码

受影响 profile 的计算逻辑：

```text
clean batch completed
-> if sdd facts changed
   -> markDirty(active profiles where projectionMode = sdd_bridge)
-> if source_references changed
   -> for each active source-backed profile
   -> markDirty(profileId)
   -> ProjectionLoop claim 后 full rematch profile_source_matches
-> if resolved config hash changed
   -> full rematch profile_source_matches
   -> markDirty(profileId)
```

`e2e-monorepo`、`sdd-default`、未来任意 profile 都走同一套 resolver。resolver 只判断 projection mode 和抽象能力，不判断具体 profileId。

### sdd-default 也要进入统一投影维护

`sdd-default` 和其他 profile 一样由统一投影维护 `profile_*`。

最终目标：

- 所有 profile 页面只读 current profile projection。
- current run 不存在时返回未就绪，不回退旧 SDD 聚合。

### 失败隔离

CleanBatch 成功后，projection 失败不能让 batch 回滚。

实现方式：

- source reference extraction 应该在 clean batch 事务内完成，因为它属于规范事实。
- profile matching / projection job markDirty 可以在 clean success 后执行；失败记录日志并可由 maintainer 后续补偿。
- projection job 独立运行，失败只更新 `profile_projection_jobs.last_error` 和 failed run。
- current pointer 不切换。

### 补偿机制

ProjectionMaintainer 每次 tick 前应能修复漏标，但不依赖 source_reference 自增 id 水位。

```text
scan active profiles
-> compare resolved config hash with last_resolved_config_hash
-> compare latest fact/update timestamps with last_completed_at
-> compare failed/dirty jobs that are retryable
-> markDirty or retry where needed
```

这保证即使某次 clean 后 match/markDirty 失败，下一次 worker tick 也能补上。因为当前策略是 snapshot-only，补偿只需要保证 profile 被重新投影，不需要维护精确增量水位。

## 回退机制

### 自动回退

投影失败时：

- 新 run 标 failed。
- `profile_current_projection_runs` 不变。
- 页面继续读旧 run。

### 人工回退

切回旧 run：

```sql
UPDATE profile_current_projection_runs
SET current_projection_run_id = <old_run_id>
WHERE profile_id = '<profileId>';
```

暂停自动投影：

```text
PROFILE_PROJECTION_ENABLED=false
```

清空 dirty job：

```sql
UPDATE profile_projection_jobs
SET status='idle',
    dirty_since=NULL,
    dirty_until=NULL,
    running_dirty_seq=NULL,
    last_error=NULL
WHERE profile_id='<profileId>';
```

## 可观测性

Profile Inspector 应增加“运行维护状态”区域：

- current run
- latest run
- projection job status
- dirty_since / dirty_until
- last_projected_at
- last_resolved_config_hash
- last error
- matched source count

新增 API 字段：

```text
GET /api/profiles/:profileId/inspector
  projection.job
  projection.configHash
  projection.matchCounts
```

这样用户能在页面上直接看出：

- 是否收到 source references
- 是否匹配到当前 profile
- 是否已经投影
- 失败原因是什么

## 测试计划

### 单元测试

1. `SourceReferenceMaintainer`
   - 同一 batch 重跑幂等。
   - 相同 reference key update 不重复插入。

2. `ProfileSourceMatcher`
   - 多 profile 同一 source 各自匹配。
   - disabled profile 不匹配。
   - unresolved source rule 不让 profile 进入 active projection。

3. `ProjectionJobStore`
   - 多次 markDirty 合并 dirty_since / dirty_until，并递增 dirty_seq。
   - running lock 互斥。
   - running 期间再次 markDirty 后，markSucceeded 通过 dirty_seq 不会误清新 dirty。
   - CLI claimProfile 与 ProjectionLoop claimNext 对同一 profile 互斥。
   - failed job 按 retry 时间恢复。

4. `ProjectionAdapterRegistry`
   - `sdd_bridge`、`source_backed` 正确分发。
   - 未注册 projectionMode 失败可解释。

5. `ProjectionMaintainer`
   - clean success 后 mark dirty。
   - sdd facts changed 时 active `sdd_bridge` profile 被 mark dirty。
   - resolved config hash 变化时触发 full rematch + snapshot。
   - projection success 切 current pointer。
   - projection failure 不切 current pointer。

### 集成测试

1. 模拟一个 batch，包含：
   - wiki read
   - docs/plan write
   - src edit

2. 跑一次 worker tick 后断言：
   - `source_references` 有路径事实。
   - `profile_source_matches` 有 e2e-monorepo 匹配。
   - `profile_projection_jobs` 从 dirty 变 idle。
   - `profile_current_projection_runs` 指向 completed run。
   - `profile_capability_usages` / `profile_delivery_units` / `profile_artifacts` / `profile_code_activities` 有数据。

3. 故意让 adapter 抛错：
   - run 为 failed。
   - current pointer 保持旧值。
   - job 为 failed，记录 last_error。

4. 多 profile：
   - 同一 source 同时匹配两个 active source-backed profile。
   - 两个 profile job 独立执行，互不阻塞。

5. 配置变化：
   - 修改 env root 或 fallback base。
   - 断言 `resolvedConfigHash` 变化。
   - 断言对应 profile 目标配置版本的 `profile_source_matches` 被全量重匹配。
   - 断言 current pointer 切到新的 completed snapshot run。

6. dirty 竞态：
   - projection job running 期间再次写入新 batch。
   - 当前 run 成功后 job 仍保持 dirty。
   - 下一轮投影后 job 才变 idle。

### 浏览器验收

1. 执行 Claude prompt 后，不手动跑 profile 命令。
2. 等待 worker 自动刷新。
3. 页面切到 `e2e-monorepo`：
   - 总览非 0。
   - 技能分析非 0。
   - 产出分析有交付单元。
   - Profile Inspector 显示 matched source 和 projection job 状态。

## 部署行为

部署后默认行为：

- `deploy-docker.sh` 跑 migration。
- worker 启动后自动：
  - 清洗 outbox。
  - 抽取 source references。
  - 匹配 active profiles。
  - 自动投影 dirty profiles。

用户不需要每次 prompt 后跑命令。

首次迁移已有历史数据时，仍建议跑一次 backfill：

```bash
docker compose --env-file .env -f compose.prod.yml run --rm worker \
  node dist/jobs/rebuild-source-references.js

docker compose --env-file .env -f compose.prod.yml run --rm worker \
  node dist/jobs/profile-maintain-once.js
```

这不是日常操作，只是把历史数据纳入新自动链路。

## 实施顺序

这不是分阶段交付给用户，而是一次完整功能的内部实现顺序：

1. 新增 migrations。
2. 抽 `SourceReferenceWriter`，让 CLI 和 clean batch 共用。
3. 新增 `ProfileCatalog` / `ProfileSourceMatcher` / `ProfileMatchWriter`。
4. 新增 `DirtyProfileResolver` / `ProfileConfigChangeDetector`。
5. 新增 `ProjectionJobStore`。
6. 新增 `ProfileProjectionAdapter` 和 registry。
7. 改造现有 `profile-rebuild` 使用 adapter。
8. 改造 source-backed operators 消费 `profile_source_matches`，并显式 join `source_references` 取事实字段。
9. 接入 `ProjectionMaintainer` 到 worker main loop。
10. 增加 Inspector 运行维护状态。
11. 补齐单测、集成测试、浏览器验收。
12. 更新 README / database model / deploy 文档。

## 验收标准

1. 不手动执行 `profile-rebuild`，新 prompt 数据能进入 profile 看板。
2. 新增一个 active profile 配置后，无需改 worker 主流程。
3. 禁用 profile 后，不再自动匹配和投影。
4. projection adapter 失败不影响 clean batch。
5. current pointer 只在 completed run 后切换。
6. Profile Inspector 能解释数据断在哪一层。
7. `sdd-default` 和 `e2e-monorepo` 都通过同一 ProjectionMaintainer 自动维护。

## 结论

这次要补的不是 e2e-monorepo 特例，而是 Profile 平台的投影维护能力。

最终架构应满足：

```text
新增 profile = 新增配置
新增投影模式 = 新增 adapter
worker 主流程 = 不变
页面读路径 = 不变
CLI = 运维工具，不是日常链路
```
