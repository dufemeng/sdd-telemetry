# Profile 表单配置化设计

## 背景

当前 Profile 配置由 `packages/api/src/profile-config/profiles/*.ts` 硬编码注册：

- `sdd-default`：`projectionMode = sdd_bridge`，读现有 SDD 派生表，页面语义是“技能 / 需求 / 文档”。
- `e2e-monorepo`：展示名为“农小宝工作流”，`profileId` 仍是 `e2e-monorepo`，`projectionMode = source_backed`，通过 `sourceRules` 匹配 `nxb-mono-repo/wiki/`、`nxb-mono-repo/docs/plan/`、`nxb-mono-repo/src/`。
- `online-docs`：disabled 样例，用于证明 URL / MCP doc 规则形态。

现有设计已经把 source-backed 投影抽象成：

```text
source_references
  -> profile_source_matches
  -> profile_projection_jobs
  -> profile_projection_runs/current pointer
  -> profile_* fact tables
```

本设计的目标是让管理员通过页面新增、编辑、停用 Profile，而不是每接一个业务都修改 TS 文件并发版。

## 结论摘要

1. Profile 配置应该迁移为数据库持久化配置，但保留内置 TS profile 作为 seed 和 fallback。
2. `profileId` 是历史事实和投影表的稳定分区键，创建后不可修改；`e2e-monorepo` 必须保持不变。
3. 删除不做物理删除，只支持 `disabled` 和 `archived`；归档 profile 不出现在普通切换器，但历史 projection 数据保留。
4. 数据库存储采用“主表 + 版本表 + JSON 配置快照”的混合模型，不拆每类 rule 成独立表。表单按结构化字段编辑，JSON 只作为高级模式。
5. 发布不是直接覆盖线上读取配置。source-backed 配置发布后先进入 target version，由 worker 投影成功后再切 `serving_version_id + current_projection_run_id`，避免坏配置导致看板全空。
6. server 和 worker 都应通过同一个 `ProfileConfigCatalog` 读取配置；禁止继续在执行层按 `e2e-monorepo` 或其他 profileId 写特殊逻辑。

## 数据库设计

### 表：profile_configs

Profile 主表保存稳定身份、生命周期和当前版本指针。

```sql
CREATE TABLE profile_configs (
  profile_id VARCHAR(191) NOT NULL,
  display_name VARCHAR(191) NOT NULL,
  lifecycle_status VARCHAR(32) NOT NULL, -- active / disabled / archived
  origin VARCHAR(32) NOT NULL,           -- builtin / db
  projection_mode VARCHAR(32) NOT NULL,  -- sdd_bridge / source_backed
  published_version_id BIGINT UNSIGNED NULL,
  serving_version_id BIGINT UNSIGNED NULL,
  draft_version_id BIGINT UNSIGNED NULL,
  readiness_status VARCHAR(32) NOT NULL DEFAULT 'pending', -- ready / pending / failed / disabled
  readiness_message VARCHAR(500) NULL,
  created_by BIGINT UNSIGNED NULL,
  updated_by BIGINT UNSIGNED NULL,
  archived_at DATETIME(3) NULL,
  gmt_create DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  gmt_modified DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (profile_id),
  KEY idx_profile_configs_lifecycle (lifecycle_status),
  KEY idx_profile_configs_published_version (published_version_id),
  KEY idx_profile_configs_serving_version (serving_version_id)
);
```

关键约束：

- `profile_id` 创建后不可改。页面可以改 `display_name`，不能改 URL/API 使用的 ID。
- `lifecycle_status=disabled`：配置保留，可编辑，可发布，但普通看板切换器禁用或隐藏。
- `lifecycle_status=archived`：相当于软删除，不参与普通查询和 worker 自动维护。
- `serving_version_id` 是读侧和当前投影事实对应的版本。`published_version_id` 是管理员最新发布目标。

### 表：profile_config_versions

版本表保存完整配置快照。draft 可以更新；published/superseded 版本不可变。

```sql
CREATE TABLE profile_config_versions (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  profile_id VARCHAR(191) NOT NULL,
  version_no INT UNSIGNED NOT NULL,
  version_status VARCHAR(32) NOT NULL, -- draft / published / superseded / rejected
  base_version_id BIGINT UNSIGNED NULL,
  config_schema_version INT UNSIGNED NOT NULL DEFAULT 1,
  config_hash CHAR(64) NOT NULL,
  projection_definition_hash CHAR(64) NOT NULL,
  display_name VARCHAR(191) NOT NULL,
  projection_mode VARCHAR(32) NOT NULL,
  config_json JSON NOT NULL,
  validation_json JSON NULL,
  preview_json JSON NULL,
  change_summary VARCHAR(500) NULL,
  created_by BIGINT UNSIGNED NULL,
  published_by BIGINT UNSIGNED NULL,
  published_at DATETIME(3) NULL,
  gmt_create DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  gmt_modified DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uk_profile_config_versions_no (profile_id, version_no),
  KEY idx_profile_config_versions_profile_status (profile_id, version_status),
  KEY idx_profile_config_versions_config_hash (config_hash)
);
```

`config_json` 保存 profile 规则和展示配置的完整快照。第一期为了复用现有 `WorkflowProfileConfig`，读取 DB 后仍可 materialize 成 `WorkflowProfileConfig`；但 lifecycle 不由 `config_json.status` 拥有。

```json
{
  "profileId": "e2e-monorepo",
  "displayName": "农小宝工作流",
  "status": "active",
  "projectionMode": "source_backed",
  "manifest": {},
  "sourceRules": [],
  "deliveryUnitRules": [],
  "artifactRules": [],
  "capabilityRules": [],
  "attributionPolicy": {},
  "presentation": {}
}
```

Lifecycle 语义：

- `profile_configs.lifecycle_status` 是唯一生命周期真相。
- `config_json.status` 只是兼容现有 `WorkflowProfileConfig` 的派生字段，由 repository 从 `lifecycle_status` materialize，不能作为表单独立编辑项。
- `ProfileSummary.status` 是 public API 的兼容投影，只表达普通用户能否切换。
- `readiness_status` 只表达 serving 数据是否可读，不表达生命周期。

Hash 语义：

- `config_hash`：完整配置 hash，包含展示文案、manifest、lifecycle 相关可发布字段，用于版本 diff 和审计。
- `projection_definition_hash`：只包含会改变投影事实的配置定义：`projectionMode`、`sourceRules`、`deliveryUnitRules`、`artifactRules`、`capabilityRules`、`attributionPolicy`、adapter version。它不包含纯展示字段，也不包含 runtime resolved roots。
- `resolved_config_hash`：由 worker 在运行时基于 target config + env resolved roots 计算，存 `profile_projection_runs` 和 `profile_projection_jobs.last_resolved_config_hash`，用于发现 env root 变化导致的重投需求。

发布时用 `projection_definition_hash` 判断是否需要重投：

- 如果 target `projection_definition_hash` 与当前 serving version 相同，只是 presentation/labels/widgets 等展示变化，可以在校验通过后直接切 `serving_version_id`，不创建 projection job。
- 如果 target `projection_definition_hash` 变化，必须走 worker projection 成功后再切 serving。
- 如果只改 `manifest`，默认按展示/能力开关处理，不重投；但如果 manifest 打开了当前投影 operators 不会产出的能力，publish gate 必须阻止或要求先保持 disabled。

### 表：profile_config_events

审计表记录管理员动作。

```sql
CREATE TABLE profile_config_events (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  profile_id VARCHAR(191) NOT NULL,
  version_id BIGINT UNSIGNED NULL,
  event_type VARCHAR(64) NOT NULL, -- create / save_draft / publish / disable / enable / archive / rollback
  actor_user_id BIGINT UNSIGNED NULL,
  message VARCHAR(500) NULL,
  metadata_json JSON NULL,
  gmt_create DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY idx_profile_config_events_profile_time (profile_id, gmt_create)
);
```

### 需要补强的现有投影表

为保证“新配置投影失败时旧看板仍然可读”，投影运行和匹配结果应带配置版本。

建议新增：

```sql
ALTER TABLE profile_projection_runs
  ADD COLUMN profile_config_version_id BIGINT UNSIGNED NULL,
  ADD COLUMN resolved_config_hash CHAR(64) NULL,
  ADD KEY idx_profile_projection_runs_config_version (profile_id, profile_config_version_id);

ALTER TABLE profile_projection_jobs
  ADD COLUMN target_config_version_id BIGINT UNSIGNED NULL;

ALTER TABLE profile_source_matches
  ADD COLUMN profile_config_version_id BIGINT UNSIGNED NOT NULL;
```

并将 `profile_source_matches` 的唯一键从：

```text
(profile_id, source_reference_key)
```

调整为：

```text
(profile_id, profile_config_version_id, source_reference_key)
```

这样 worker 可以为待发布版本单独 rematch，不覆盖当前 serving version 的诊断数据。已有行迁移时把 `profile_config_version_id` 回填为当前 seeded serving version。

迁移顺序必须是：

1. 先把三个内置 profile seed 成真实 version row。
2. 给旧表临时增加 nullable `profile_config_version_id`。
3. 按 `profile_id` 回填旧 `profile_projection_runs` 和 `profile_source_matches` 的 seeded version id。
4. 回填完成后把 `profile_source_matches.profile_config_version_id` 改为 `NOT NULL`，再重建唯一键。

不能让 `(profile_id, profile_config_version_id, source_reference_key)` 中的 version 为空；MySQL unique index 会允许多行 NULL，破坏 rematch 幂等性。

当前第一阶段实现可以先落地为兼容迁移：

- 先新增 `profile_config_version_id` nullable 字段和索引，不立即改旧唯一键。
- seed 后尽量回填历史 run/job/match 的 published version id。
- 在唯一键仍是 `(profile_id, source_reference_key)` 时，worker rematch 必须按 `profile_id` 全量替换 `profile_source_matches`，否则新旧版本会因旧唯一键冲突。
- 后续补一段收紧迁移：确认所有行都已回填后，把 `profile_source_matches.profile_config_version_id` 改为 `NOT NULL`，再把唯一键升级为 `(profile_id, profile_config_version_id, source_reference_key)`。

### Rule 存储选择：JSON 而不是拆表

`sourceRules / capabilityRules / deliveryUnitRules / artifactRules / presentation` 不建议第一期拆表。

原因：

- 现有 `WorkflowProfileConfig` 已是稳定配置接口，worker 直接消费完整对象。
- rule 结构差异大：path / url / mcp_doc 的字段不同，拆表会制造大量浅表和 join。
- 管理后台主要按 profile 读写完整配置，不需要跨 profile 查询“所有 pathContains 包含 X 的 rule”。
- 版本、回滚、审计都需要完整快照；JSON 更适合保存可复现的 published config。

保留结构化表单，不等于让管理员编辑一坨 JSON。前端和 API 仍使用结构化 request schema，服务端组装和校验 `WorkflowProfileConfig`。高级模式可以显示 JSON diff，但不是主编辑入口。

后续只有在出现明确需求时再拆：

- 要跨 profile 搜索 rule。
- 要 rule 级权限或多人并发编辑。
- 要按 rule 维度做独立审计和发布。

### 内置模板

保留 `packages/api/src/profile-config/profiles/*.ts`，定位从“唯一注册表”调整为：

- 数据库初始化 seed 来源。
- DB 配置缺失或灰度关闭时的 fallback。
- 新建 profile 的模板来源。
- 单元测试和本地开发的 fixture。

内置模板不再是运行时唯一真相。DB 中存在同 `profile_id` 的 published/serving config 时，DB 优先。

## 后端设计

### ProfileConfigCatalog

新增 profile 配置读取接口，server 和 worker 都依赖它。

```ts
export interface ProfileConfigCatalog {
  listProfiles(input?: { includeDisabled?: boolean; includeArchived?: boolean }): Promise<WorkflowProfileConfig[]>;
  listProjectableProfiles(): Promise<Array<{ profile: WorkflowProfileConfig; versionId: number }>>;
  getServingProfile(profileId: string): Promise<{ profile: WorkflowProfileConfig; versionId: number | null } | null>;
  getPublishedTarget(profileId: string): Promise<{ profile: WorkflowProfileConfig; versionId: number } | null>;
}
```

实现：

- `BuiltinProfileConfigCatalog`：读取现有 TS registry。
- `DbProfileConfigCatalog`：读取 `profile_configs.serving_version_id` 或 `published_version_id`。
- `CompositeProfileConfigCatalog`：DB 优先，builtin fallback。

模块归属必须保持 framework-free：

- `ProfileConfigCatalog`、DB row mapper、schema migrate、hash 计算应放在共享运行时模块（建议 `packages/profile-config-store` 或同等 package）。
- 这个共享模块只能依赖 `@sdd-telemetry/api` 的 contract/schema 和 mysql pool 类型，不能依赖 Midway、Koa 或 worker 进程框架。
- server 和 worker 只在各自 composition root 注入 data source / pool / `PROFILE_CONFIG_SOURCE`。
- 禁止 server 与 worker 各自复制一套 DB catalog 查询，否则 fallback、hash、schema migrate 会漂移。

灰度开关：

```text
PROFILE_CONFIG_SOURCE=ts | db | db_with_builtin_fallback
```

默认迁移阶段建议使用 `db_with_builtin_fallback`。如果 DB 配置出现问题，可切回 `ts` 回滚。

### 现有读接口改造

现有 `/api/profiles`、`/api/profiles/:profileId/inspector`、dashboard 读接口保持路径不变，但内部从 catalog 读取 serving config。

需要把同步读取改为异步：

- `ProfilesService.listProfiles()` 改为 `async listProfiles()`。
- `getManifest()`、`requireProfile()` 改为 async。
- `ProfileProjectionRepository` 不直接读 config，只读投影事实。
- `ProfileProjectionRepository` 需要的 presentation/stage codes 由 `ProfilesService` 从 serving config 解析后作为参数传入；repository 禁止继续调用 `getProfileConfig()` 或 catalog。

public `ProfileSummary.status` 仍保持 `active | disabled` 兼容前端；DB 的 `archived` 不返回。对于 pending 或 failed 的 source-backed profile：

- 如果已有 serving version 和 current run：仍返回 `active`，看板读旧 run。
- 如果没有可读 serving run：返回 `disabled`，并在后续 contract 扩展 `readiness` 给 UI 展示原因。

建议扩展 `ProfileSummary`：

```ts
readiness?: {
  status: 'ready' | 'pending' | 'failed' | 'disabled';
  message?: string;
  servingVersionId?: string | null;
  publishedVersionId?: string | null;
}
```

旧前端不消费该字段也不会破坏。

### Admin API

新增 `/api/admin/profiles`，并在 `requiresSuperAdmin()` 中加入路径保护。普通 viewer 只读 `/api/profiles`。

建议接口：

```text
GET    /api/admin/profiles
POST   /api/admin/profiles
GET    /api/admin/profiles/:profileId
POST   /api/admin/profiles/:profileId/draft
PUT    /api/admin/profiles/:profileId/draft
POST   /api/admin/profiles/:profileId/validate
POST   /api/admin/profiles/:profileId/preview
POST   /api/admin/profiles/:profileId/publish
POST   /api/admin/profiles/:profileId/disable
POST   /api/admin/profiles/:profileId/enable
POST   /api/admin/profiles/:profileId/archive
POST   /api/admin/profiles/:profileId/rollback
POST   /api/admin/profiles/:profileId/rebuild
```

接口语义：

- `POST /api/admin/profiles`：创建 profile。可从 `sdd-default`、`e2e-monorepo`、`online-docs` 模板复制。`profileId` 只在这里填写，之后只读。
- `POST /draft`：从当前 published/serving version 创建或重置 draft。
- `PUT /draft`：保存结构化表单内容，返回 validation result、config hash、draft revision。
- `validate`：只做 schema 和静态引用检查，不触碰 projection 表。
- `preview`：dry-run matcher，返回 source match 统计和样例，不写 `profile_source_matches`。
- `publish`：把 draft 固化为 published target version，标记 projection job dirty。source-backed 不立即切 serving。
- `disable/enable/archive`：只改 lifecycle，不物理删除。
- `rollback`：把 serving 指回一个历史 published version，并尽量切回该版本最近 completed run。
- `rebuild`：复用 `ProjectionJobStore.markDirty()`，用于管理员手工重投。

### Contract 扩展

`packages/api/src/contracts/profile.contract.ts` 需要补：

- `WorkflowProfileConfigSchema` 及所有 rule Zod schema。
- `AdminProfileListItemSchema`。
- `AdminProfileDraftSchema`。
- `AdminProfileValidationResultSchema`。
- `AdminProfilePreviewRequestSchema` / `AdminProfilePreviewResponseSchema`。
- `AdminProfilePublishRequestSchema` / `AdminProfilePublishResponseSchema`。

不要只保留 TypeScript interface。表单提交、DB JSON 读取、worker 读取 target version 都应该经过 Zod parse。

### 发布校验

发布分四层 gate：

1. JSON/schema gate：`WorkflowProfileConfigSchema.parse()`。
2. 静态 gate：复用并扩展 `validateProfileConfig()`，检查重复 ruleId、未知引用、locator 必填、capabilityRule 目标等。
3. runtime gate：`resolveRuntimeProfileConfig(config, env)`，active source-backed profile 必须至少有一个 enabled source rule 且没有 unresolved rule。
4. preview gate：对历史 `source_references` 做 dry-run，返回：
   - 总 source references 数。
   - matched 数和 matchRate。
   - 按 category/rule/action 的命中数。
   - delivery unit 候选数。
   - artifact 候选数。
   - capability 候选数。
   - ambiguous 数。
   - top unmatched 样例。

active 发布建议要求：

- `source_backed`：preview 至少命中一个 enabled source rule。
- 如果 `manifest.deliveryUnits=true`，至少有 delivery unit 候选或明确发布为 disabled。
- 如果 `manifest.capabilityUsage=true`，至少有 capability 候选或明确发布为 disabled。

没有历史数据的新业务可以先保存并发布为 disabled，等 telemetry 进入后再 enable。第一期不建议提供“无数据但强制 active”的按钮，避免误把坏路径配置上线成空看板。

### 避免坏配置清空看板

关键机制：

1. 发布只更新 `published_version_id` 和 `profile_projection_jobs.target_config_version_id`，不直接更新 `serving_version_id`。
2. worker 使用 target version 投影，新 run 失败时只写 failed run 和 job error，`profile_current_projection_runs` 不切换。
3. 新 run 成功时，在同一事务里：
   - 标记 job succeeded。
   - 标记 projection run completed。
   - upsert `profile_current_projection_runs`。
   - 更新 `profile_configs.serving_version_id = target_config_version_id`。
   - 更新 readiness 为 ready。
4. server 读 dashboard 时只使用 serving config + current pointer。
5. 对没有 serving run 的新 profile，普通 switcher 显示为 disabled/pending。

这样坏配置的影响被限制在 admin preview/inspector/job error，不会把旧看板切空。

## Worker 设计

### Catalog 替换静态 registry

当前 worker 从 `@sdd-telemetry/api` 同步调用：

```ts
listProfileConfigs()
getProfileConfig(profileId)
```

需要改为注入 async `ProfileConfigCatalog`：

```ts
const profiles = await catalog.listProjectableProfiles();
const target = await catalog.getPublishedTarget(job.profileId);
```

`markConfigChangedProfilesDirty()` 不再遍历静态 registry，而是遍历 active/published target profiles。
它比较 worker 当前解析出的 `resolved_config_hash` 与 `profile_projection_jobs.last_resolved_config_hash`；不要拿 version 表里的 `projection_definition_hash` 替代 runtime hash。

### ProjectionContext 注入 config

当前 `source-backed-operators.ts` 内部再次 `getProfileConfig(ctx.profileId)`。配置化后这是高风险点：maintainer 可能拿 target version 投影，但 operator 又从 TS fallback 拿到旧配置。

需要把 config 放进 `ProjectionContext`：

```ts
export interface ProjectionContext {
  pool: Pool;
  profileId: string;
  profileConfigVersionId: number;
  config: WorkflowProfileConfig;
  projectionRunId: number;
  logger: Logger;
  registry: ProjectionIdRegistry;
}
```

`runProfileProjection()` 接收 `config`，operators 只消费 `ctx.config`，不再读取 registry。

### 发布后的 dirty 流程

发布 active profile：

```text
Admin publish
  -> insert published version
  -> update profile_configs.published_version_id
  -> update profile_projection_jobs.target_config_version_id
  -> markDirty(profileId, "profile_config_published:<versionId>")

ProjectionLoop
  -> claim job
  -> load target published version
  -> resolveRuntimeProfileConfig(target, env)
  -> adapter.prepare()
     source_backed: rematch source_references into profile_source_matches(profile_config_version_id)
     sdd_bridge: no source rematch
  -> run operators with ctx.config
  -> success transaction switches current run and serving_version_id
```

source reference clean batch 仍按 projection mode 标 dirty：

- `sdd_bridge`：SDD 派生事实变化后标记所有 active serving sdd_bridge profile。
- `source_backed`：`source_references` 变化后标记所有 active source-backed profile。

这里仍只判断 `projectionMode`，不判断 `sdd-default`、`e2e-monorepo`、`农小宝`。

### Rematch 策略

`rematchProfileSourceReferences()` 增加 `profileConfigVersionId` 参数：

- 读取全部或窗口内 `source_references`。
- 使用 target config 的 runtime rules 匹配。
- 在事务中删除同 `(profile_id, profile_config_version_id)` 的旧 matches。
- 插入新 matches。

projection operators 读取 matches 时加：

```sql
WHERE m.profile_id = ?
  AND m.profile_config_version_id = ?
```

新逻辑必须总是带版本。builtin fallback 也通过 seed version 表获得真实 version id；系统级回滚到 `PROFILE_CONFIG_SOURCE=ts` 时仍然可以读 TS config，但不应写入 nullable version 的 matches。

### sdd_bridge 和 source_backed 的统一抽象

保留 `ProfileProjectionAdapterRegistry`：

```ts
projectionMode=sdd_bridge
  -> SDD_BRIDGE_OPERATORS + knowledgeOperator + codeOperator

projectionMode=source_backed
  -> SOURCE_BACKED_OPERATORS
```

两种 mode 的差异只在 adapter 和 operator 集合，不出现在 profileId 分支。新增业务 profile 只能通过新增配置、或新增通用 projectionMode/adapter 来接入。

## 前端设计

### 页面位置

现有侧边栏“配置”下有：

- `Profile 配置`：当前只读 inspector。
- `语义映射`：SDD legacy 语义配置。

建议调整为：

- `Profile 管理`：新增管理员表单页，路径 `/profiles/admin`，仅 `super_admin` 可见。
- `Profile 诊断`：现有 inspector，路径可保持 `/profiles/inspector`。

普通 viewer 可以看 inspector，但不能编辑；或第一期只让 super_admin 看到管理入口。

### 页面结构

`ProfileAdminPage`：

1. 左侧 profile 列表
   - displayName
   - profileId
   - lifecycle status
   - readiness
   - serving version / published version
   - 最近投影状态
2. 右侧编辑区
   - 顶部：保存 draft、预览、发布、停用、归档、回滚。
   - 中间：分区表单。
   - 底部或抽屉：发布前预览、JSON diff、validation issues。

### 表单分区

#### 基础信息

字段：

- `profileId`：创建时填写，发布后只读。
- `displayName`：可改。
- `projectionMode`：`sdd_bridge` / `source_backed`，创建后建议锁定；若允许修改，必须作为高风险发布。
- `lifecycleStatus`：active / disabled。
- `manifest`：复选框，控制页面能力。
- 模板来源：新建时从内置 profile clone。

#### 数据来源规则

以 rule card 列表编辑 `sourceRules`：

- `ruleId`：稳定机器 ID，创建后默认只读。允许复制新增。
- `locatorType`：path / url / mcp_doc。
- `category`：process_doc / knowledge / code / unknown。
- `actions`：read / grep / glob / write / edit / update / delete。
- `confidence`、`priority`、`enabled`。
- path 字段：rootEnv、rootPath、fallbackBaseEnv、relativeRoot、pathContains、pathRegexes、includeGlobs、excludeGlobs、repoKind。
- url 字段：urlPrefixes、urlRegexes、resourceIdCapture、deny。
- mcp_doc 字段：mcpServers、toolNames、spaceIds、collectionIds、docTypes、docIdPatterns、deny。

提供“测试规则”按钮：输入一个 locator 或选择 preview 样例，展示是否命中、relativeLocator、sourceNamespace。

#### 能力规则

编辑 `capabilityRules`：

- `ruleId`
- `sourceRuleIds` 或 `sourceCategories`
- `actions`
- `capabilityCode`
- `displayName`
- `triggerSource`

UI 上用 source rule 多选和 action 多选，不让用户手写数组。

#### 交付单元规则

编辑 `deliveryUnitRules`：

- `ruleId`
- `sourceRuleIds`
- `locatorStrategy.kind`
- parent_dir / path_segment / url_resource_id / mcp_doc_id 对应参数
- `titleStrategy`

提供 locator preview：给一个路径样例，显示解析出的 businessDomain、unitSlug、title。

#### 产物规则

编辑 `artifactRules`：

- `ruleId`
- `sourceRuleIds`
- `typePatterns` 表格：artifactType + include globs。
- `defaultArtifactType`

和 presentation 的 artifact stage order 联动，但不要混在一个字段里：artifactRules 决定事实分类，presentation 决定页面顺序和文案。

#### 展示文案

编辑 `presentation`：

- workflowKind：sdd / local_path_monorepo / online_docs。
- labels：dashboardTitle、deliveryUnit、artifact、capability、knowledge。
- artifact stage descriptors：code、label、order、colorToken。
- maturity stages：source-backed 默认空。
- widgets：artifactCoverageFunnel、userMaturity、knowledgeCoverage、callQuality、matchHealth、triggerSourceBreakdown、multiStageDeliveryUnit。
- legacyOnlySurfaces：例如 semantics、dailyReport。

presentation normalize 逻辑只保留一份：

- 优先由 API 返回 normalized presentation，前端直接消费。
- 或者让 web 直接复用 `@sdd-telemetry/api` 导出的 `normalizeProfilePresentation()`。
- 不继续保留 server/web 两套默认 labels、stages、widgets 推导逻辑。

#### 发布前预览

展示 `preview` 结果：

- validation 状态。
- runtime unresolved rules。
- source match 总量、按 category/rule/action 分布。
- delivery unit / artifact / capability 候选数量。
- ambiguous matches。
- top unmatched source samples。
- 预计会被隐藏或降级的 widgets。
- 与当前 serving version 的 diff。

发布按钮只有 preview 通过后启用。高级模式可以查看和编辑 JSON，但默认折叠，并且每次修改都要回填结构化表单或重新 parse。

## 兼容性与迁移

### 迁移现有 profile

新增 seed 脚本或 migration 后置步骤：

1. 从 TS registry 读取 `sdd-default`、`e2e-monorepo`、`online-docs`。
2. 写入 `profile_configs`。
3. 写入 `profile_config_versions` version 1。
4. `published_version_id = serving_version_id = version 1`。
5. `online-docs` 保持 disabled。

必须保持：

- `sdd-default.profileId = sdd-default`
- `e2e-monorepo.profileId = e2e-monorepo`
- `e2e-monorepo.displayName = 农小宝工作流`
- `e2e-monorepo.projectionMode = source_backed`

### 历史投影数据

现有 `profile_*` fact tables 都按 `profile_id + projection_run_id` 分区。只要 `profileId` 不变，历史 current run 和历史 runs 仍可读。

迁移需要：

- 为当前 `profile_projection_runs` 回填 `profile_config_version_id`。
- 为当前 `profile_source_matches` 回填 `profile_config_version_id`。
- 不改 `profile_id`。
- 不清空 `profile_current_projection_runs`。

### 新旧读取灰度

阶段建议：

1. `PROFILE_CONFIG_SOURCE=ts`：只建表和 seed，不改运行行为。
2. `PROFILE_CONFIG_SOURCE=db_with_builtin_fallback`：server/worker 优先读 DB，但 DB 缺失时读 TS。
3. 对比 `/api/profiles`、`/api/profiles/:id/inspector` 和 config hash，确认 DB seed 与 TS 一致。
4. 打开 admin draft/save/preview，但暂不允许 active publish。
5. 允许发布 disabled profile。
6. 允许 active publish，并由 worker 成功后切 serving。
7. 稳定后可把 TS registry 降级为 builtin templates，不作为普通运行真相。

### 回滚

系统级回滚：

- 设置 `PROFILE_CONFIG_SOURCE=ts`，server/worker 回到内置 registry。
- DB 表保留，不丢数据。

单 profile 回滚：

- 选择历史 published version。
- 如果存在该 version 的 completed projection run，则事务内切 `serving_version_id` 和 `profile_current_projection_runs`。
- 如果不存在 completed run，则标记 dirty 重投；期间继续读当前 serving run。

失败发布回滚：

- 不需要人工切回。因为失败时 serving pointer 和 current pointer 没动。

## 实施步骤

### Step 1：补齐配置 schema

- 在 `packages/api` 增加 `WorkflowProfileConfigSchema` 和 rule schemas。
- 让 `validateProfileConfig()` 返回更结构化的 issue code、severity、path。
- 为现有三个内置 profile 加 schema parse 测试。

### Step 2：新增 DB migration 和 seed

- 创建 `profile_configs`、`profile_config_versions`、`profile_config_events`。
- 给 projection runs、jobs、source matches 增加配置版本字段。
- seed 三个内置 profile。
- 回填现有 projection run / source matches 的 version id。
- 第一阶段保留旧唯一键并让 worker 按 profile 全量替换 matches；第二阶段回填确认后把 `profile_source_matches.profile_config_version_id` 改成 `NOT NULL` 并重建唯一键。

### Step 3：抽象 ProfileConfigCatalog

- 抽出 framework-free 共享 catalog/store，server 和 worker 只注入 data source / pool。
- server 接入共享 store，不在 Midway service/repository 内复制 SQL。
- `ProfilesService` 改 async catalog。
- 保留 builtin fallback。

### Step 4：改造 worker 投影上下文

- `runProfileProjection()` 接收 config/versionId，投影写入路径的 versionId 不可为空。
- `ProjectionContext` 增加 `config` 和 `profileConfigVersionId`。
- source-backed operators 移除 `getProfileConfig()`。
- server repository 移除 `getProfileConfig()`，由 service 传入 presentation/stage codes。
- rematch 和 load matches 按 config version 隔离。
- publish success transaction 同时切 current pointer 和 serving version。

### Step 5：新增 Admin API

- 增加 `/api/admin/profiles` controller/service/repository。
- auth middleware 把 `/api/admin/` 纳入 super_admin。
- 实现 draft save、validate、preview、publish、disable、archive、rollback、rebuild。
- publish 调用 `ProjectionJobStore.markDirty()`，不直接跑 projection。

### Step 6：前端 Profile 管理页

- 新增 `/profiles/admin` 路由和侧边栏入口。
- 管理页按分区表单编辑 draft。
- 接入 validate/preview/publish。
- inspector 增加版本和 readiness 展示。
- ProfileSwitcher 根据 readiness 禁用 pending/failed 且无 serving run 的 profile。

### Step 7：灰度和清理

- 默认开启 `db_with_builtin_fallback`。
- 跑 DB seed 与 TS config hash 对比。
- 确认 e2e-monorepo 历史数据仍可读。
- 稳定后清理页面中“配置文件源码路径”类描述，改成“配置版本”描述。

## 风险点

1. 静态 registry 残留：如果某个 operator 或 service 仍直接调用 `getProfileConfig()`，DB 发布不会生效。实施后必须 `rg "getProfileConfig|listProfileConfigs"` 检查调用点。
2. 坏配置清空看板：必须坚持 serving pointer 只在 projection 成功后切换。
3. `profileId` 被误改：API 和 DB 都不提供 update profile_id；复制 profile 必须创建新 ID。
4. nullable version 破坏幂等：`profile_source_matches.profile_config_version_id` 必须最终 `NOT NULL`，否则 MySQL unique index 不能保护重复 match。第一阶段未收紧前，不允许按版本局部 delete + insert。
5. rematch 覆盖诊断数据：第一阶段仍按 profile 覆盖 matches；要支持 pending/serving 双版本诊断，必须先完成非空版本列和唯一键升级。
6. 状态漂移：lifecycle 只能由 `profile_configs.status` 拥有；`config_json.status` 作为兼容字段必须由发布流程同步写入，不能独立编辑。
7. hash 混淆：version 表保存 definition hash，worker job/run 保存 resolved hash，不能把 env resolved roots 写进发布版本 hash。
8. preview 成本：全量 dry-run 可能慢，第一期可以限制时间窗和样本量，同时返回“sampled=true”。
9. 并发编辑：draft 需要 revision 或 ETag，保存时带 `baseVersionId/draftRevision`，避免后保存覆盖先保存。
10. schema 漂移：DB JSON 必须有 `config_schema_version`，读取时 parse + migrate；不能把未知 JSON 直接交给 worker。

## 验收标准

1. 管理员可以从 `e2e-monorepo` 模板复制一个 disabled profile，保存 draft、预览、发布。
2. `e2e-monorepo` 在 DB 配置启用后，`profileId` 保持 `e2e-monorepo`，历史看板数据仍可读。
3. 修改 `e2e-monorepo.displayName` 后，不影响历史 projection 数据。
4. 修改 sourceRules 并发布坏路径时，worker job 失败或 preview 不通过，但旧 current run 仍可读，ProfileSwitcher 不切到空数据。
5. 发布有效 source-backed 配置后，worker 自动 mark dirty、rematch、projection，成功后切 current pointer。
6. sdd_bridge 和 source_backed 都通过 `projectionMode` 分发，没有新增农小宝专属逻辑。
7. 普通 viewer 不能访问 `/api/admin/profiles` 写接口。
8. 归档 profile 不在普通 profile 列表出现，但历史数据未删除。

## 测试计划

### 单元测试

- `WorkflowProfileConfigSchema` 解析三个内置 profile。
- `validateProfileConfig()` 覆盖重复 ruleId、未知 sourceRuleId、locator 缺失、capabilityRule 缺 source。
- `resolveRuntimeProfileConfig()` 覆盖 rootEnv、rootPath、fallbackBaseEnv、pathContains。
- `resolvedProfileConfigHash()` 对影响投影字段变化敏感，对纯展示字段可按设计决定是否触发 projection。

### 后端集成测试

- DB seed 后 catalog 读取结果与 TS registry hash 一致。
- `profile_configs.status` 是 lifecycle source；`config_json.status` 由发布流程同步写入，不可独立编辑。
- `projection_definition_hash` 不随 env root 变化，`resolved_config_hash` 随 env root 变化。
- draft save / validate / preview / publish 流程。
- publish active source-backed 后只更新 published target，不立即切 serving。
- worker success 后切 serving/current pointer。
- worker failure 后 serving/current pointer 不变。
- rollback 切回历史 version/run。
- `/api/admin/profile-configs` 需要 super_admin。

### Worker 测试

- source-backed rematch 写入带 config version 的 `profile_source_matches`；第一阶段在旧唯一键下按 profile 全量替换。
- 第二阶段完成后，`profile_source_matches.profile_config_version_id` 非空，唯一键能阻止同一 version 下重复 source match。
- operators 从 `ctx.config` 读取规则，不访问静态 registry。
- server repository 不访问静态 registry，presentation/stage 由 service 参数传入。
- clean batch source reference 变化只按 projectionMode mark dirty。
- sdd_bridge 和 source_backed adapter registry 无 profileId 特判。

### 前端测试

- Profile 管理页基础表单保存 draft。
- source rule card 根据 locatorType 切换字段。
- preview issue 能定位到具体 rule。
- pending/failed 且无 serving run 的 profile 在 switcher 中禁用。
- JSON 高级模式修改后能重新 parse 并回填 validation。

### 本地验证命令

提交前仍按仓库规范执行：

```bash
rg --hidden "ap""ps/(web|server|worker)|\\.\\/ap""ps/(web|server|worker)|ap""ps/" . -g '!node_modules/**' -g '!.git/**'
pnpm typecheck
pnpm build
```

影响运行链路时追加：

```bash
docker compose up -d mysql
pnpm db:migrate
pnpm db:seed
pnpm db:verify
pnpm --filter @sdd-telemetry/worker once
curl -sS http://127.0.0.1:4318/api/ingest/health
```

## 自审

### 逻辑漏洞检查

- 如果发布后立即让 server 读 `published_version_id`，旧 run 会和新 config 不一致，坏配置也可能造成空看板。本设计用 `serving_version_id` 规避。
- 如果 `profile_source_matches` 仍按 profile 维度唯一，target rematch 会覆盖 serving 诊断。本设计要求加 `profile_config_version_id`。
- 如果 operator 内继续 `getProfileConfig()`，DB target config 不会生效。本设计要求 config 注入 `ProjectionContext`。
- 如果新 profile active 但无 current run，普通看板会空。本设计要求 readiness 未 ready 时 public status 映射为 disabled。

### 兼容性遗漏检查

- `e2e-monorepo` 的 `profileId` 不变，展示名可变。
- `sdd-default` 仍保留 sdd_bridge 和 legacy fallback。
- `online-docs` 可作为 disabled 模板迁移，不要求立即启用。
- 历史 `profile_*` facts 不删除、不改 profile_id。
- TS registry 保留为 fallback，可通过 env 快速回退。

### 执行风险检查

- 最大改动面在 async catalog 改造和 worker context 注入，应先做 schema/catalog，再做 worker，最后做前端。
- DB migration 涉及唯一键调整，必须在本地 MySQL 上验证回填和索引重建。
- preview 全量扫描可能慢，第一期应支持 limit/timeRange。
- draft 并发编辑需要 revision，不能只靠最后写入覆盖。
