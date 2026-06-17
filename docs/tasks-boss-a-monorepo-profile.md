# Boss A Monorepo Profile 接入实施计划（第二阶段-2）

关联设计：

- `docs/design-profile-observability-architecture.md`
- `docs/tasks-profile-observability-mvp.md`
- `docs/tasks-profile-contract-coverage.md`
- `docs/tasks-profile-contract-coverage-report.md`

## 1. 目标

本阶段接入第一套非 SDD profile：`boss-a-monorepo`。

老板 A 的项目不是 SDD 工作流，也没有 requirements / wiki 路径。项目是一个大仓库，根目录约定如下：

```text
<monorepo-root>/
  docs/           # 知识库，等价当前 wiki 读取语义
  plan/           # 计划 / 过程文档，等价当前 requirements 创建/更新语义
  frontend_repo/  # 前端代码，内部可能有多个 submodule
  backend_repo/   # 后端代码，内部可能有多个 submodule
```

本阶段目标不是新做一套 Boss A 定制页面，而是证明当前 Profile Observability Contract 可以承接非 SDD profile：

```text
raw/tool events
  -> source_references
  -> boss-a-monorepo projection
  -> /api/profiles/boss-a-monorepo/*
  -> 现有总览 + 四大看板
```

完成后，Profile Switcher 中应能选择 `boss-a-monorepo`，总览、用户分析、技能分析、产出分析、知识库分析可以在 Boss A 数据下运行。

## 2. 当前基线

已经具备：

- `source_references` 可从完整 tool input 抽取本地 path，支持 `Read / Grep / Glob / Write / Edit / MultiEdit`。
- `profile_*` 投影表与 current-pointer rebuild 框架已就位。
- `sdd-default` 已完成总览 + 四大看板 contract 覆盖。
- `profile_code_activities` 已进入 overview code read/write 概况。
- 前端 Profile Switcher 和 `profileId` queryKey 结构已就位。

仍缺失：

- `profile-config.ts` 只有 `sdd-default`，且配置在 server 侧，worker 不能复用。
- `getProfileOperators(profileId)` 只有 `sdd-default` 算子，非 SDD profile 当前返回空算子。
- 当前 profile service 的 legacy fallback 是 SDD 专用的；多个 profile endpoint 在无 current run 时会落到 `sddQueryService`，新增 Boss A 前必须避免 Boss A 无 current run 时误展示 SDD 数据。
- 现有 `knowledgeOperator` / `codeOperator` 依赖 SDD 用户的 `wiki_root_path / requirements_root_path`，不能直接复用给 Boss A。
- Boss A 的 delivery unit 需要从 `plan/` 路径规则生成，而不是从 `sdd_work_items` 桥接。
- 用户成熟度、产出阶段漏斗、技能分析部分 KPI 仍硬编码 SDD 阶段或 SDD skill 调用口径，Boss A 下必须隐藏、降级或配置化，不能让老板看到一排无意义的 0。

## 3. 非目标

- 不接入老板 B 在线文档 / MCP content adapter。
- 不做 profile 配置后台 UI。
- 不做 all-profile 汇总。
- 不把 Boss A 的代码活动包装成“需求完成率”或“交付完成率”。
- 不强求第一版完成需求级代码闭环。代码活动第一版以 profile / user / repo 维度为主，只有高置信上下文归因时才写 `delivery_unit_id`。
- 不改语义映射 tab；它仍属于 SDD 配置页面。
- 不重命名现有 `/sdd/*` 前端路由。本阶段只保证主数据来自 `/api/profiles/:profileId/*`。

## 4. 必须先定的口径

### 4.1 Boss A profile 配置方式

第一版不做 UI 配置。实现上允许“写死一套 profile”，但 monorepo 绝对路径必须可部署时替换：

```text
BOSS_A_MONOREPO_ROOT=/absolute/path/to/repo
```

配置语义：

| source | profile category | rule |
| --- | --- | --- |
| `<root>/plan/**` | `process_doc` | 创建/更新进入 delivery unit + artifact |
| `<root>/docs/**` | `knowledge` | read/grep/glob 进入 knowledge recalls |
| `<root>/frontend_repo/**` | `code` | code activity，`repoKind=frontend` |
| `<root>/backend_repo/**` | `code` | code activity，`repoKind=backend` |

如果 `BOSS_A_MONOREPO_ROOT` 未配置：

- `/api/profiles` 可以继续展示 `boss-a-monorepo`，但 status 建议为 `disabled` 或 manifest 仍完整但 projection rebuild 明确失败。
- 不允许 fallback 到 `legacy_sdd` 返回 SDD 数据。

### 4.1.1 无 current run 的正面响应

Boss A 冷启动时可能出现“profile 已配置，但还没有 completed projection run”。这时不能回退到 SDD，也不能让前端白屏。

第一版不强行给所有 response 增加 `hasData` 字段，避免扩大 contract 改造面；服务端必须返回 typed empty response：

| endpoint kind | Boss A 无 current run 时 |
| --- | --- |
| overview | 所有 count 返回 0 |
| list endpoints | `items=[]`、`total=0`、分页字段照常返回 |
| analytics | KPI `current=0, previous=null`，quality/match 计数为 0，rate 为 null，top 列表为空 |
| timeseries/timeline | `points=[]` |
| knowledge coverage | `scan.configured=false`，totals 全 0，repos/domains 为空 |
| detail/timeline by id | 返回 404 `PROFILE_DATA_NOT_READY` 或 `*_NOT_FOUND`，不得查询 SDD detail |

前端必须把 Boss A 的空 projection 渲染为“暂无 profile 数据 / 请先重建投影”的空态，而不是错误态或 SDD 数据。PR-1 就要验收这个行为，不能留到 PR-6。

### 4.2 Delivery Unit 身份

Boss A 的产品页面仍叫“需求”，架构上仍叫 `delivery unit`。

第一版从 `plan/` 下的创建/更新类 source reference 派生 delivery unit：

```text
plan/<unit-slug>/**        -> unitSlug = <unit-slug>
plan/<unit-slug>.md        -> unitSlug = file stem
plan/<domain>/<unit>/**    -> businessDomain = <domain>, unitSlug = <unit>（如果真实结构验证如此）
```

由于用户还会补 Boss A 完整目录结构，实现必须把 unit 解析封装成小函数并用 fixture 覆盖，不能把 path split 散落在多个 operator。

幂等 key：

```text
delivery_unit_key = sha256(profile_id + ':du:' + normalized_unit_locator)
```

其中 `normalized_unit_locator` 必须稳定，不得使用自增 id。

### 4.3 Artifact 身份

`plan/` 下创建/更新的过程文档同时是 artifact。

```text
artifact_key = sha256(profile_id + ':artifact:' + delivery_unit_key + ':' + normalized_artifact_locator)
```

artifact type 第一版按文件名 / 路径关键词推断：

| pattern | artifactType |
| --- | --- |
| `*plan*`, `*proposal*`, `*prd*` | `plan` |
| `*design*` | `design` |
| `*task*`, `*todo*` | `task` |
| `*review*` | `review` |
| otherwise | `process_doc` |

不要强行复用 SDD 的 `proposal/design/task/codereview` 阶段作为 Boss A 核心语义。Contract 可展示 `coverageStages: string[]`。

### 4.4 Capability 语义

Boss A 没有 SDD skill。`capabilityUsage` 第一版定义为“可观测研发行为能力”，从 source reference 派生：

| source category | action | capabilityCode |
| --- | --- | --- |
| `process_doc` | write/edit | `plan-doc-update` |
| `process_doc` | read/grep/glob | `plan-doc-read` |
| `knowledge` | read/grep/glob | `knowledge-recall` |
| `code frontend` | read/grep/glob | `frontend-code-read` |
| `code frontend` | write/edit | `frontend-code-change` |
| `code backend` | read/grep/glob | `backend-code-read` |
| `code backend` | write/edit | `backend-code-change` |

页面仍可显示“技能分析”，但 contract 字段保持 `capability`。实施报告必须说明 Boss A 的 capability 不是 SDD skill，不做 skill 漏斗强对账。

### 4.5 Knowledge 语义

只统计 `docs/` 下的 read-class source reference：

```text
action_type IN ('read', 'grep', 'glob')
locator_type = 'path'
normalized_locator under <root>/docs
```

`knowledge_domain` 第一版取 `docs/` 下第一段目录；如果文件直接在 `docs/` 根目录，domain 为 null 或“根目录”。不要用标题、prompt 关键词猜测知识库归属。

### 4.6 Code 语义

只统计 `frontend_repo/`、`backend_repo/` 下 source reference：

```text
read-class:  read / grep / glob
write-class: write / edit / update
```

字段建议：

| field | rule |
| --- | --- |
| `repo_kind` | `frontend` / `backend` |
| `repo_name` | `frontend_repo` 或 `backend_repo` 下第一段目录；如果文件直接在根下，用 `frontend_repo` / `backend_repo` |
| `module_name` | repo 内第二段目录，可空 |

第一版 codeChanges 只回答“有没有进入代码实施、读写分布、Top repo / user”。不要输出“完成率”。

### 4.7 Stable key 公式

Boss A 没有 `sdd_*` 稳定 key 可桥接，所有下游幂等 key 必须基于 `source_reference_key` 或稳定路径身份，不能使用自增 id。

| target | key formula |
| --- | --- |
| delivery unit | `sha256(profile_id + ':du:' + normalized_unit_locator)` |
| artifact | `sha256(profile_id + ':artifact:' + delivery_unit_key + ':' + normalized_artifact_locator)` |
| artifact write | `sha256(profile_id + ':artifact_write:' + source_reference_key)` |
| capability usage | `sha256(profile_id + ':capability:' + source_reference_key)` |
| knowledge recall | `sha256(profile_id + ':knowledge:' + source_reference_key)` |
| code activity | `sha256(profile_id + ':code:' + source_reference_key)` |

如果未来一条 source reference 需要生成多条 capability，再把 `capabilityCode` 加入 key；第一版一条 source reference 只能归入一个 category / capability。

### 4.8 Boss A 下需要降级的 SDD 专属指标

现有页面外壳仍叫“技能分析 / 用户分析 / 需求分析”，但其中有一些指标是 SDD skill 工作流专属。Boss A 第一版不应把这些指标原样展示成 0 或满值。

| 页面 / 指标 | 当前 SDD 依赖 | Boss A 第一版处理 |
| --- | --- | --- |
| 用户成熟度漏斗 / `AdoptionRamp` | `proposal/design/task/codereview` capability stage | 隐藏或显示“该 profile 未配置成熟度阶段”；不要展示 `0/4` |
| 用户列表阶段点 / 用户详情需求阶段 | SDD stage hardcode | 改为 generic `coverageStages` chips，或 Boss A 下隐藏阶段点 |
| 技能分析 user/auto triggered | `trigger_source=invocation_trigger` | Boss A 下显示 N/A 或隐藏；不要展示 0/0 当成真实结论 |
| 技能分析 callQuality | SDD skill prompt/response 配对 | Boss A 下显示 N/A 或隐藏，除非 projection 明确定义 prompt pairing |
| 技能分析 matchHealth | 语义映射匹配率 | Boss A 规则派生 capability 默认都是 matched，该卡片无诊断价值，隐藏或标注为规则派生 |
| multiStageDeliveryUnitCount | SDD artifact stages | Boss A 下隐藏，或后续基于 profile 配置的 artifact stage 重新计算 |
| knowledge coverage | 文件系统扫描总文档数 | Boss A 本阶段无 docs scan 时降级为召回事实概况，不展示为真实覆盖率 |

如果实现者选择“配置化”而不是“隐藏”，必须把 stage/metric display policy 放入共享 profile config，并让前端通过 profile 配置渲染，不能在页面里硬编码 `profileId === 'boss-a-monorepo'` 到处判断。

### 4.9 本期算子策略

架构设计的长期方向是“声明式 sourceRules + 通用 projection operators”。但本阶段优先证明非 SDD profile 可接入并服务老板 A 演示，允许使用 Boss A 专属 operator。

边界如下：

- PR-1 仍应把 `sourceRules` 从空的 `ProfileRuleBase[]` 补成能表达 local path 的结构，至少包含 `category / root / actions / repoKind`。
- PR-2 的 matcher 可以叫 `matchBossASource`，但内部应尽量消费共享 config 中的 source rules，避免把 `plan/docs/frontend_repo/backend_repo` 魔法字符串散落在多个 operator。
- 不要求本阶段实现完全通用的 `LocalPathProjectionOperator`。
- 实施报告必须说明：Boss A 专属算子是 MVP 取舍；Boss B 接入前需要把 Boss A matcher 中可复用的 path/category/key 逻辑下沉为通用规则执行器。

## 5. Attribution 规则

Boss A 没有 `sdd_skill_usages.work_item_id` 可桥接，所以需要 profile 内上下文归因。

### 5.1 直接归因

以下情况直接写 `delivery_unit_id`，confidence=`high`：

- `plan/` 下 write/edit source reference 生成的 artifact write。
- 同一 source reference 生成的 capability usage。

### 5.2 同 interaction 归因

同一个 interaction 中，如果一个 knowledge/code/capability source reference 之前存在唯一 plan delivery unit anchor，则归因到该 delivery unit，confidence=`high`。

anchor 优先级：

1. write/edit plan doc
2. read plan doc

如果同一个 interaction 里存在多个候选 delivery unit，取事件时间 / event sequence 最近且不晚于当前事件的候选。若仍无法稳定单选，`delivery_unit_id` 置 null，并在 stats 里计入 ambiguous。

### 5.3 同 session 窗口归因

为了保留当前站点“同一 session 多轮对话可归因”的能力，允许同 session 窗口归因，但必须保守：

- 只看同 `user_id + session_id`。
- 只取当前事件之前的 anchor。
- 默认窗口建议 2 小时，可放入 profile `attributionPolicy.sessionWindowMinutes`。
- 窗口内如果只有一个有效 delivery unit anchor，写 `delivery_unit_id`，confidence=`high`。
- 如果窗口内出现多个 delivery unit anchor，且无法按事件顺序稳定判定当前事件属于哪个需求，置 null，不进需求维度 KPI。

不要实现跨 profile conflict。Boss A 与 `sdd-default` 可以对同一 source reference 各自投影。

## 6. 实施切分

### PR-1：共享 profile config + Boss A manifest

目标：让 server 和 worker 使用同一份 profile 配置，新增 `boss-a-monorepo` 但不开始投影；同时封住非 SDD profile 的 legacy fallback 污染，并定义冷启动空态。

修改：

- 新增共享 profile config/schema，建议放在 `packages/api/src/profile-config.ts` 或独立 `packages/profile-config`。不要让 worker import server 模块。
- 将现有 `server/src/modules/profiles/profile-config.ts` 改为复用共享配置。
- 新增 `boss-a-monorepo`：
  - `profileId='boss-a-monorepo'`
  - `displayName='Boss A Monorepo'`
  - manifest：`capabilityUsage / deliveryUnits / artifacts / artifactTimeline / knowledgeRecalls / codeChanges = true`，`errors / evaluation / alerts = false`
  - source rules：`plan/docs/frontend_repo/backend_repo`
  - attributionPolicy：`sessionWindowMinutes=120`
- 修复 profile service fallback：只有 `sdd-default` 可以走 `legacy_sdd` adapter；Boss A 无 current projection 时走 §4.1.1 typed empty response，不得返回 SDD 数据。
- 建议抽统一守卫，避免逐方法漏改：

```text
resolveProjectionRead(profileId):
  if readSource === legacy_sdd:
    return profileId === sdd-default ? { mode: 'legacy' } : { mode: 'empty' }
  runId = current completed run
  if runId exists:
    return { mode: 'projection', runId }
  return profileId === sdd-default ? { mode: 'legacy' } : { mode: 'empty' }
```

必须覆盖的数据方法 checklist：

- `getOverview`
- `listDemands`
- `getDemandDetail`
- `getArtifactTimeline`
- `getCapabilityAnalytics`
- `getCapabilityTimeseries`
- `listCapabilityUsageSummary`
- `listCapabilityUsages`
- `listUsers`
- `getUserDetail`
- `getKnowledgeCoverage`
- `getKnowledgeTimeline`
- `listKnowledgeRecalls`
- `getKnowledgeDeliveryUnitRanking`

其中 list/analytics/timeline/coverage/overview 在 `mode=empty` 时返回 typed empty；detail/timeline-by-id 在 `mode=empty` 时返回 404，不允许再查 SDD detail。

验收：

```bash
pnpm --filter @sdd-telemetry/api typecheck
pnpm --filter @sdd-telemetry/server typecheck
pnpm --filter @sdd-telemetry/worker typecheck
curl -sS http://127.0.0.1:4318/api/profiles
curl -sS http://127.0.0.1:4318/api/profiles/boss-a-monorepo/manifest
curl -sS http://127.0.0.1:4318/api/profiles/boss-a-monorepo/overview
curl -sS http://127.0.0.1:4318/api/profiles/boss-a-monorepo/demands
curl -sS http://127.0.0.1:4318/api/profiles/boss-a-monorepo/capabilities/analytics
curl -sS http://127.0.0.1:4318/api/profiles/boss-a-monorepo/users
curl -sS http://127.0.0.1:4318/api/profiles/boss-a-monorepo/knowledge/coverage
```

必须验证：

- `/api/profiles` 返回 `sdd-default` 和 `boss-a-monorepo`。
- Boss A 没有 current run 时，overview/users/demands/capabilities/knowledge 返回 typed empty，不返回 SDD 数据。
- Boss A 没有 current run 时，detail endpoint 返回 404，不返回 SDD detail。
- `sdd-default` legacy fallback 不受影响。
- 对 `ProfilesService` 的 empty/fallback 分支补单测或 integration-style service 测试，至少覆盖 overview、demands、capabilities、users、knowledge coverage 五类主页面入口。

### PR-2：Boss A path rule matcher + fixture tests

目标：先把路径规则做成可测纯函数，再写 projection。

先补共享规则类型，不要继续让 `sourceRules` 只是空的 `ProfileRuleBase[]`。最小结构：

```text
LocalPathSourceRule:
  kind: 'local_path'
  category: 'process_doc' | 'knowledge' | 'code'
  rootEnv: 'BOSS_A_MONOREPO_ROOT'
  relativeRoot: 'plan' | 'docs' | 'frontend_repo' | 'backend_repo'
  actions: Array<'read' | 'grep' | 'glob' | 'write' | 'edit' | 'update'>
  repoKind?: 'frontend' | 'backend'
```

Boss A matcher 可以是专属函数，但必须消费这些规则，而不是在多个 operator 里重复写路径常量。

新增 helper：

```text
matchBossASource(locator, config)
parseBossADeliveryUnit(locator, config)
parseBossAArtifact(locator, deliveryUnit)
parseBossACodeLocator(locator, config)
parseBossAKnowledgeLocator(locator, config)
```

fixture 覆盖：

```text
<root>/plan/pay-order/design.md
<root>/plan/pay-order/tasks.md
<root>/plan/pay-order.md
<root>/docs/payment/api.md
<root>/frontend_repo/cashier-web/src/App.tsx
<root>/backend_repo/payment-service/src/main/java/App.java
```

验收：

- `plan/**` 只进入 process_doc。
- `docs/**` 只进入 knowledge。
- `frontend_repo/**` 和 `backend_repo/**` 只进入 code。
- repoKind / repoName / moduleName 解析稳定。
- matcher 输出包含后续 key 计算所需的稳定字段：`sourceCategory`、`normalizedRelativeLocator`、`deliveryUnitLocator?`、`artifactLocator?`、`repoKind?`。
- 不在四个根目录下的路径不进入 Boss A 核心 KPI。

### PR-3：Boss A delivery/artifact/capability projection

目标：让 Boss A 的“需求/过程产物/能力行为”先跑通。

新增 operator：

```text
boss-a-delivery-artifact-operator
boss-a-capability-operator
```

执行顺序建议：

```text
bossAPlanDeliveryArtifact
bossACapability
```

projection 规则：

- 只从 `source_references` 读取 `locator_type='path'`。
- `plan/` 下 write/edit 生成或更新：
  - `profile_delivery_units`
  - `profile_artifacts`
  - `profile_artifact_writes`
- `plan/docs/frontend/backend` 命中的 source reference 生成 `profile_capability_usages`。
- capability 对 plan write/edit 直接写 `delivery_unit_id`。
- artifact timeline 第一版至少有 write 节点；discussion turn 可后续增强，但不能影响列表和详情可用。
- key 必须使用 §4.7 公式：
  - `delivery_unit_key = sha256(profile_id + ':du:' + normalized_unit_locator)`
  - `artifact_key = sha256(profile_id + ':artifact:' + delivery_unit_key + ':' + normalized_artifact_locator)`
  - `write_key = sha256(profile_id + ':artifact_write:' + source_reference_key)`
  - `usage_key = sha256(profile_id + ':capability:' + source_reference_key)`

验收 SQL：

```sql
SELECT COUNT(*) FROM profile_delivery_units
WHERE profile_id='boss-a-monorepo' AND projection_run_id=?;

SELECT COUNT(*) FROM profile_artifacts
WHERE profile_id='boss-a-monorepo' AND projection_run_id=?;

SELECT COUNT(*) FROM profile_capability_usages
WHERE profile_id='boss-a-monorepo' AND projection_run_id=?;

SELECT COUNT(*) FROM profile_artifact_writes
WHERE profile_id='boss-a-monorepo' AND projection_run_id=?;
```

阻塞 gate：

- 每条 plan write/edit source reference 必须能生成 artifact write。
- 每个 artifact 必须关联 delivery unit。
- capability usage 的 `usage_key` 重跑稳定，不得使用自增 id。
- repeated rebuild 后 key set 稳定：同一批 source references 生成的 delivery/artifact/write/capability key 不变化、不重复计数。

### PR-4：Boss A knowledge/code projection + 上下文归因

目标：补齐知识库读取和代码实施概况。

新增 operator：

```text
boss-a-knowledge-operator
boss-a-code-operator
boss-a-context-attribution helper
```

projection 规则：

- `docs/` read-class -> `profile_knowledge_recalls`
- `frontend_repo/` / `backend_repo/` read/write-class -> `profile_code_activities`
- delivery unit 归因按 §5 执行；不能高置信归因时保留 null，并在 stats 中报告：
  - `unmappedKnowledge`
  - `unmappedCode`
  - `ambiguousContext`
- key 必须使用 §4.7 公式：
  - `recall_key = sha256(profile_id + ':knowledge:' + source_reference_key)`
  - `activity_key = sha256(profile_id + ':code:' + source_reference_key)`

验收 SQL：

```sql
SELECT repo_kind, COUNT(*)
FROM profile_code_activities
WHERE profile_id='boss-a-monorepo' AND projection_run_id=?
GROUP BY repo_kind;

SELECT knowledge_domain, COUNT(*)
FROM profile_knowledge_recalls
WHERE profile_id='boss-a-monorepo' AND projection_run_id=?
GROUP BY knowledge_domain;
```

阻塞 gate：

- `docs/` read-class source reference 不得进入 code。
- `frontend_repo/` / `backend_repo/` source reference 不得进入 knowledge。
- code repoKind 不得为 `unknown`，除非路径不在 frontend/backend 根下且被跳过。
- `source_reference_key` 必须可反查到 `source_references`。

### PR-5：Boss A profile verify / diff gate

Boss A 没有旧 `sdd_*` 基准，不能复用 sdd-default 的 key-set diff 作为强一致对账。需要新增 profile-specific verify。

这条 gate 是“内部一致性验证”，强度弱于 `sdd-default` 的新旧独立对账。它能发现漏投影、orphan、分类 unknown、重跑不稳定；但不能独立证明 unit slug、domain、repoName 的语义一定正确。PR-5 必须额外做真实路径样例人工抽检。

建议扩展：

```bash
pnpm profile:diff -- --profile boss-a-monorepo
```

输出：

```json
{
  "profileId": "boss-a-monorepo",
  "runId": 123,
  "sourceReferences": {
    "planWrites": 10,
    "knowledgeReads": 25,
    "frontendCode": 80,
    "backendCode": 65,
    "unknownInMonorepo": 0
  },
  "projection": {
    "deliveryUnits": 8,
    "artifacts": 10,
    "capabilityUsages": 180,
    "knowledgeRecalls": 25,
    "codeActivities": 145
  },
  "linkage": {
    "artifactWithoutDeliveryUnit": 0,
    "knowledgeOrphanSourceRef": 0,
    "codeOrphanSourceRef": 0,
    "ambiguousContext": 0
  },
  "gate": "PASS"
}
```

阻塞条件：

- plan write/edit source ref 未生成 artifact write。
- artifact 无 delivery unit。
- knowledge/code 无 source reference 反查。
- frontend/backend code 被分类成 unknown。
- repeated rebuild 后 current run 可读且核心数量稳定。
- repeated rebuild 后 core key set 稳定，不因自增 id 或 run id 改变。

允许但必须报告：

- knowledge/code 无法高置信归因到 delivery unit。
- docs 根目录直接文件导致 `knowledge_domain=null`。
- plan 目录真实结构和默认 unit 解析不同，需要 fixture 更新。
- 随机抽检至少 10 条 source_reference -> projection 证据链，覆盖 plan/docs/frontend/backend。报告必须写明抽检样例和结论。

### PR-6：Boss A 看板验收和报告

目标：不改页面形态，验证现有总览 + 四大看板在 `boss-a-monorepo` 下可演示。

验证命令：

```bash
pnpm profile:rebuild-source-references
pnpm profile:rebuild -- --profile boss-a-monorepo
pnpm profile:diff -- --profile boss-a-monorepo

curl -sS http://127.0.0.1:4318/api/profiles/boss-a-monorepo/overview
curl -sS http://127.0.0.1:4318/api/profiles/boss-a-monorepo/demands
curl -sS http://127.0.0.1:4318/api/profiles/boss-a-monorepo/capabilities/analytics
curl -sS http://127.0.0.1:4318/api/profiles/boss-a-monorepo/users
curl -sS http://127.0.0.1:4318/api/profiles/boss-a-monorepo/knowledge/coverage
```

前端验收：

- Profile Switcher 选择 Boss A 后，四大看板主请求均为 `/api/profiles/boss-a-monorepo/*`。
- 总览 code read/write 有数据。
- 产出分析能看到 `plan/` 下需求。
- 知识库分析能看到 `docs/` 读取。
- 用户分析能看到参与者、代码读写和知识库读取。
- 技能分析展示的是 Boss A profile 技能，不出现 SDD 专属映射文案。
- §4.8 中列出的 SDD 专属卡片和漏斗必须已隐藏、标 N/A、或改成 profile 配置化语义；不得显示明显错误的 0/0、0/4 或 100% matched。
- 产出分析和用户分析的阶段点如果仍硬编码 SDD stage，Boss A 下必须隐藏或替换为 generic artifact stage chips。

新增实施报告：

```text
docs/tasks-boss-a-monorepo-profile-report.md
```

报告必须写明：

- Boss A monorepo root。
- 真实路径结构样例。
- source reference 分类统计。
- projection stats。
- profile diff / verify 输出。
- 未能归因到 delivery unit 的 knowledge/code 数量和原因。
- typed empty / 无 current run 行为的验证结果。
- SDD 专属指标降级清单及前端截图或接口证据。
- 真实路径人工抽检样例，说明 Boss A 对账强度弱于 sdd-default。
- 是否满足老板演示路径。

## 7. 验收标准

本阶段完成必须同时满足：

1. `boss-a-monorepo` 出现在 `/api/profiles`。
2. Boss A profile config 能被 server 和 worker 同源读取，不复制两份配置。
3. Boss A 没有 current projection 时，所有 profile 主数据 endpoint 返回 typed empty 或明确 404，不会展示 SDD legacy 数据。
4. `profile:rebuild -- --profile boss-a-monorepo` 可完成并切 current pointer。
5. `profile:diff -- --profile boss-a-monorepo` gate PASS。
6. `profile_delivery_units` 来自 `plan/` 创建/更新过程文档。
7. `profile_knowledge_recalls` 只来自 `docs/` read-class source reference。
8. `profile_code_activities` 只来自 `frontend_repo/` / `backend_repo/`，且 repoKind 正确。
9. Artifact / knowledge / code 均可通过 `source_reference_key` 反查证据。
10. Delivery / artifact / write / capability / knowledge / code 的 key 公式符合 §4.7，重复 rebuild 不重复计数、不改变 key set。
11. 总览 + 四大看板在 Boss A profile 下不白屏。
12. 前端主数据请求路径均带 `/api/profiles/boss-a-monorepo/*`。
13. Boss A 下 SDD 专属漏斗 / 卡片已按 §4.8 隐藏、降级或配置化，不展示误导性 0/0、0/4、100% matched。
14. 至少 10 条真实路径 source reference 人工抽检通过，覆盖 plan/docs/frontend/backend。
15. sdd-default rebuild / diff / 页面读源不回归。
16. 文档和实施报告同步更新。

## 8. 回退策略

本阶段不删除旧表、不删除旧 API、不改变 sdd-default projection 逻辑。

回退方式：

- Profile Switcher 切回 `sdd-default`。
- 将 `boss-a-monorepo.status` 置为 `disabled`，或不展示该 profile。
- 保留 `profile_current_projection_runs` 中 Boss A run，不影响 sdd-default。
- 如 Boss A projection 出错，current-pointer 不切换；已有看板继续读上一个 completed run。
- 如果 Boss A 从未有过 completed run，页面应展示 §4.1.1 typed empty 空态，不回退 SDD。

注意：Boss A 不支持 `legacy_sdd` 回退。回退只能切回 sdd-default，不能让 Boss A 页面显示 SDD 数据。

## 9. 主要风险

### 9.1 目录结构未知

老板 A 完整结构还未提供。实现前必须拿到至少 3 类真实路径样例：

- 一个 plan 创建/更新路径。
- 一个 docs 读取路径。
- 一个 frontend/backend 代码读写路径。

没有真实样例时，只能用 fixture 开发，不能宣布 Boss A 接入完成。

### 9.2 需求级代码归因噪音

代码目录本身不包含需求 id。第一版只能通过上下文归因关联 delivery unit，必须保守。不能为了让 demand detail 好看而强行把整段 session 的所有代码都归到最近需求。

### 9.3 capability 语义变化

Boss A capability 不是 SDD skill。技能分析页面可继续复用，但实施报告和必要 UI 文案要说明它显示的是“能力/研发行为调用”，不是 SDD skill 漏斗。SDD 专属指标必须按 §4.8 降级，否则会出现老板可见的错误 0 值或恒定满值。

### 9.4 legacy fallback 污染

这是最容易造成老板演示误判的问题。新增 Boss A 前必须先封住非 sdd-default 的 SDD fallback。

### 9.5 source reference 覆盖不足

如果 Boss A 大量通过 Bash / git diff / shell script 改代码，而不是 Read/Write/Edit 工具，当前 source reference extractor 可能抓不到代码路径。本阶段先验证真实日志中路径是否进入 `source_references`；不足时再扩展 extractor，不要在 projection 里靠 prompt 文本猜路径。

### 9.6 对账强度弱于 sdd-default

Boss A 没有独立旧表基准，`profile:diff` 只能做 source reference 与 projection 的内部一致性验证。它不能证明 `unitSlug`、`knowledgeDomain`、`repoName` 的语义分类完全正确。第一版必须配合真实路径样例人工抽检；没有抽检证据时不能宣布“Boss A 语义接入完成”。

### 9.7 专属算子技术债

Boss A 专属 operator 是 MVP 取舍。它不能成为后续 Boss B 的默认复制方式。实施报告必须标明哪些 matcher/key/path 逻辑可以下沉为通用 LocalPathSourceRule executor，作为下一阶段重构入口。

## 10. 建议实施顺序

```text
PR-1 shared profile config + Boss A manifest + non-SDD fallback guard
PR-2 Boss A path matcher + fixture tests
PR-3 Boss A delivery/artifact/capability projection
PR-4 Boss A knowledge/code projection + conservative attribution
PR-5 Boss A profile diff/verify gate
PR-6 dashboard smoke + implementation report
```

不要把 PR-3/4/5 压成一个大 PR。Boss A 没有旧 SDD 基准，越需要先把 path matcher 和 verify gate 做扎实，否则页面有数据也无法判断是否可信。
