# Profile Dashboard 兼容性收口实施计划

日期：2026-06-08

## 1. 背景与目标

当前仓库已经具备端到端 monorepo 工作流的底层能力：

- `source_references` 可以从本地路径、URL、MCP 文档等输入抽取统一 source fact。
- `source_backed` profile 可以把 source fact 投影为 `profile_delivery_units`、`profile_artifacts`、`profile_capability_usages`、`profile_knowledge_recalls`、`profile_code_activities`。
- `e2e-monorepo` 已经可以通过本地 fixture 生成非 0 的 projection 数据，并通过 `profile:diff`。

但页面层和部分后端读路径仍残留 SDD 固定语义，导致切到 `e2e-monorepo` 后出现两类问题：

1. 有数据但页面隐藏或误读，例如产出分析隐藏了 SDD 阶段漏斗，却没有补上 monorepo 的产物类型覆盖漏斗。
2. 下钻路径仍调用旧 `/api/sdd/*` 或旧 SDD SQL，导致 source-backed profile 的详情、用户活动、知识详情可能空白、错读或运行时报错。

本计划的目标是先把 dashboard 的 profile 兼容性一次收口，确保后续再做“页面表单配置 + 持久化配置”时，表单保存出的 profile 不会被前端和后端硬编码拖回 SDD 模型。

## 2. 结论

这次不需要推翻底层 profile 投影表，也不需要把匹配治理做复杂。现有 `source_backed` executor 是可以继续复用的。

必须补齐的是三件事：

1. 建立统一的 Profile Presentation Model，让页面从 profile 展示模型读取阶段、文案、指标可见性，而不是各页各自判断 `hiddenMetrics` 或写死 `proposal/design/task/review`。
2. 收紧 profile projection 读路径，source-backed profile 一旦进入 projection 读源，就不能在详情缺失时回落到 legacy SDD。
3. 补齐 profile-native 下钻 API，至少覆盖用户活动、知识文档详情、用户详情 SQL 修复，避免页面再调用 `/api/sdd/*` 获取 source-backed 数据。

独立 subagent 审查后确认主线可行，但指出三个必须补上的执行闭环：

- P1 新增 `profile-presentation.ts` 时必须同步导出包入口，否则前端从 `@sdd-telemetry/api` 引用会 typecheck 失败。
- P4 用户活动不能只新增 API/hook，还要同步改 `UserActivityTimeline` 的 node kind、图标文案、code 行渲染、空态和可点击规则。
- P5 知识库 recall facts 不能只改页面文案，还要明确 `sourceNamespace` 派生、totals 字段和 profile knowledge detail controller/service 接线。

## 3. 审计范围

本次审计覆盖：

- 页面：总览、产出分析、产出详情、能力分析、用户分析、用户详情、知识库分析、知识领域详情、语义映射、交互明细、每日简报、导航壳层。
- Contract：`packages/api/src/contracts/profile.contract.ts`、`packages/api/src/profile-config.ts`。
- 后端：`server/src/modules/profiles/profiles.service.ts`、`server/src/modules/profiles/profile-projection.repository.ts`。
- Worker：`worker/src/jobs/profile-projection/operators.ts`、`source-backed-operators.ts`、旧 `knowledge-operator.ts` / `code-operator.ts`。
- DB migration：`profile_*` projection 表、`source_references`、profile 查询索引。
- 既有文档：`docs/tasks-profile-contract-coverage-report.md`、`docs/tasks-boss-a-monorepo-profile-report.md`、`/private/tmp/sdd-telemetry-profile-config-form-handoff.md`。

## 4. 当前数据库设计判断

### 4.1 已经足够 generic 的部分

`profile_*` projection 表没有把 SDD 四阶段写入表结构，当前设计可以继续作为多 profile 的事实层：

| 表 | 结论 |
|---|---|
| `profile_projection_runs` / `profile_current_projection_runs` | current-pointer 模型正确，可以隔离每次 full rebuild。 |
| `profile_delivery_units` | 用 `delivery_unit_key`、`unit_type`、`business_domain`、`relative_dir_or_locator` 表达交付单元，不绑定 SDD。 |
| `profile_artifacts` | `artifact_type` 是字符串，能表达 `plan/design/task/review/process_doc/requirement` 等类型。 |
| `profile_artifact_writes` / `profile_artifact_turns` | 可承载过程文档写入和讨论节点，不绑定 SDD。 |
| `profile_capability_usages` | `capability_code/display_name/raw_capability_name` 足够表达能力。 |
| `profile_knowledge_recalls` | 基于 `source_reference_key`，可以表达本地知识库和在线知识库读取。 |
| `profile_code_activities` | 能表达代码活动，不需要前端/后端专用表。 |

### 4.2 数据库层缺口

| 缺口 | 是否阻塞本次 dashboard 兼容性 | 处理方式 |
|---|---:|---|
| 无 `profile_configs` 持久化表 | 否 | 放到后续“配置表单 + 持久化配置”任务；本次只要求展示模型兼容。 |
| 无 `profile_errors` | 否 | 本次不新增。页面和 API 先按 `manifest.errors=false` 隐藏或返回 0；不要用 `sdd_errors` 污染 source-backed。 |
| 无独立 `profile_users` | 否 | 短期继续把 `sdd_users` 视为全局 telemetry user directory；中期改名或增加 `telemetry_users` 视图/adapter。 |
| 知识库 filesystem scan 只存在 SDD 旧口径 | 否 | `knowledgeCoverageMode='recall_facts'` 时页面显示“召回事实概况”，不要显示真实覆盖率。 |

结论：本次兼容性收口原则上不需要新 migration。只有后续做配置持久化时，才需要新增 `profile_configs` 或结构化规则表。

## 5. 硬编码与兼容性缺口清单

### 5.1 展示模型层

| 位置 | 当前实现 | 问题 | 修复方向 |
|---|---|---|---|
| `packages/api/src/profile-config.ts` | `presentation` 只有 `workflowKind/maturityStages/artifactStageOrder/hiddenMetrics/knowledgeCoverageMode` | 字段过薄，页面只能靠 `hiddenMetrics` 猜展示逻辑 | 扩展成 Profile Presentation Model，提供 labels、stage descriptors、widgets。 |
| `web/src/pages/profiles/useProfiles.ts` | `useProfileHiddenMetrics()` 返回 `Set<string>` | 各页面自行解释 hidden metric，造成重复判断和遗漏 | 增加 `useProfilePresentationModel(profileId)`，页面只消费模型。 |
| `profile.contract.ts` | `ProfilePresentationSchema` 没有 stage label、noun label、widget semantics | Contract 不能表达“产物类型覆盖漏斗”这种替代视图 | 兼容扩展 schema，保留旧字段作为过渡字段。 |

### 5.2 页面层

| 页面 | 发现的问题 | 影响 |
|---|---|---|
| `OverviewPage` | 写死 `WI_STAGES=['proposal','design','task','review']`、`SDD 深度`、`SDD 链路覆盖`、`全阶段覆盖` | source-backed 只能隐藏 SDD widget，不能显示 monorepo 的产物类型覆盖和交付深度。 |
| `WorkItemsPage` | 写死 `SDD_STAGES` 和 `STAGE_LABELS`；`showSddStages=false` 后漏斗直接消失 | 产物分析 tab 没有阶段覆盖漏斗，不是语义映射导致，而是页面无替代展示。 |
| `WorkItemDetailPage` | 主数据已走 profile，但文案仍是“需求 / 文档 / wiki”；下钻 drawer 复用 SDD interaction 详情 | source-backed 可用但语义不完整；interaction drawer 可保留为 telemetry 详情，但需要明确是通用 raw interaction。 |
| `SkillsPage` | 文案仍是“技能”；部分指标用 `hiddenMetrics` 隐藏 | 勉强可用，但需要 profile label 支持“能力/技能”等不同文案。 |
| `UsersPage` | 写死 `SDD_STAGES=['proposal','design','task','codereview']`、`完整 SDD 链路`、`SDD 阶段渗透` | source-backed 只能隐藏成熟度，没有替代用户能力覆盖/活动覆盖。 |
| `UserProfilePage` | `showSddActivity=false` 时关闭旧 activity hooks；`SkillUsageChart` 只在 SDD 下显示 | source-backed 用户详情失去关键活动时间线。 |
| `useUserActivity.ts` | 组合 `useUserSkillUsages`、`useUserArtifactWrites`、`useWikiRecallList`；前两者调用 `/api/sdd/*` | source-backed 选中 delivery unit 后写入和能力活动无法 profile-native 下钻。 |
| `SkillUsageChart` | 只统计 `rawSkillName.startsWith('bk-fe-')` | 明确的旧技能命名硬编码，必须改为 SDD-only 或移除。 |
| `UserWorkItemList` / `AdoptionRamp` | 写死 SDD 阶段和标签 | 需要改为 presentation stage descriptors。 |
| `WikiRecallsPage` | 已读 profile API，但 `scan.configured=false` 时显示“需服务器挂载知识库” | 对 `recall_facts` profile 是误导；应显示召回事实，不显示覆盖率/沉睡文档。 |
| `useWikiRecalls.ts` | 主页面 API 走 profile，但 domain docs/doc detail/content 仍走 `/api/sdd/wiki-recalls/*` | 知识领域详情对 source-backed 仍不兼容。 |
| `SemanticsPage` | 完全走 `/api/sdd/semantics` | 这是 SDD 语义映射页，不是 source-backed profile 的规则配置页。短期需标注/gate，长期由 Profile Config Admin 取代。 |
| `InteractionsPage` / `InteractionDetailDrawer` | 仍走 `/api/sdd/interactions/*` | 如果产品定位为 raw telemetry 明细，可以保留，但命名应从 SDD 降级为“交互明细”；不应作为 profile projection 真值。 |
| `DailyReportsPage` / `DailyReportDocument` | 写死 SDD Daily Brief、proposal/design/task/review | 暂时必须标注为 SDD-only 或仅在 `sdd-default` 显示。 |
| `Sidebar` / `AppShell` | 品牌名“SDD 质量观测台”、路由 `/sdd/...`、配置项“语义映射” | 路由可暂不重命名，但文案和可见性要 profile-aware；长期再做 taxonomy 迁移。 |

### 5.3 后端读路径

| 位置 | 当前实现 | 风险 | 修复方向 |
|---|---|---|---|
| `ProfilesService.resolveReadMode()` | 无 current run 时 `sdd_bridge` 回 legacy，source-backed 回 empty | 这个方向正确，需要保持 | 后续不要为 source-backed 加 legacy fallback。 |
| `getDemandDetail()` | projection 查不到 detail 后继续走 legacy SDD | source-backed id 可能被错读成 SDD work item id | projection mode 下未命中应直接 404；仅 `read.mode==='legacy'` 才查 SDD。 |
| `getUserDetail()` | projection 查不到 user 后继续走 legacy SDD | source-backed 用户详情可能错读 | 同上。 |
| `getArtifactTimeline()` | projection 直接返回 timeline；legacy 才查 SDD | 方向基本正确 | 保持，不要在 projection 空数组时 fallback。 |
| `ProfileProjectionRepository` | `MULTI_STAGE_ARTIFACT_TYPES=['proposal','design','task','review']` | source-backed 多阶段统计口径仍是 SDD | 改为由 presentation 传入 stage order，或隐藏时不计算。 |
| `ProfileProjectionRepository` | `MATURITY_STAGES=['proposal','design','task','codereview']` | 用户成熟度固定 SDD | 由 presentation `maturityStages` 决定；空数组时返回空 maturity。 |
| `listDemands/getDemandDetail` | `errorCount` join `sdd_errors` | source-backed 事实层被 SDD 旧表污染 | 仅 `sdd_bridge` adapter 使用，source-backed 返回 0 或等未来 `profile_errors`。 |
| `listUsers/getUserDetail` | JOIN `sdd_users` | 短期可接受，但命名上是全局 telemetry user directory | 加注释和 adapter 边界，后续改名或抽 `UserDirectoryRepository`。 |
| `getUserDetail` SQL | `SELECT ... su.machine_name, FROM sdd_users su` | projection 用户详情可能运行时报 SQL 语法错误 | P0 修复。 |
| `getKnowledgeCoverage` | projection 模式用 recall facts 模拟 coverage | 对 `recall_facts` 是不同量纲 | 由 presentation 控制页面文案和 KPI，API 字段保留兼容。 |

### 5.4 Worker 层

| 位置 | 结论 |
|---|---|
| `source-backed-operators.ts` | 可以继续复用。它按 source rules 投影通用 profile facts，符合当前产品取舍。 |
| `operators.ts` | `sdd_bridge` 继续挂旧 `knowledgeOperator/codeOperator`，source-backed 走 `SOURCE_BACKED_OPERATORS`，方向正确。 |
| `knowledge-operator.ts` / `code-operator.ts` | 仍依赖 `sdd_users.wiki_root_path/requirements_root_path`，但只用于 `sdd_bridge`，不应扩散到 source-backed。 |
| `profile-diff.ts` | source-backed diff gate 是结构一致性校验，不是 legacy 真值对账，继续保留。 |

## 6. 目标架构

### 6.1 分层原则

需要明确三层边界：

1. Fact Contract：`profile_*` 表和 `/api/profiles/:profileId/*` 返回通用事实，字段使用 `deliveryUnit/capability/knowledge/artifact/code`。
2. Presentation Contract：profile 配置声明这个事实应该怎么展示，包括阶段、标签、指标可见性、知识覆盖口径。
3. Page Model：前端页面只消费 Presentation Model，不再自己推断某个 profile 是否是 SDD。

### 6.2 Profile Presentation Model

新增共享纯函数，建议路径：

- `packages/api/src/profile-presentation.ts`
- `web/src/pages/profiles/useProfilePresentationModel.ts`

Contract 保留旧字段，同时增加结构化字段：

```ts
interface ProfilePresentation {
  workflowKind: 'sdd' | 'local_path_monorepo' | 'online_docs';
  maturityStages: string[];
  artifactStageOrder: string[];
  hiddenMetrics: string[];
  knowledgeCoverageMode: 'filesystem_scan' | 'recall_facts';

  labels?: ProfilePresentationLabels;
  stages?: ProfilePresentationStages;
  widgets?: ProfilePresentationWidgets;
  legacyOnlySurfaces?: string[];
}

interface ProfilePresentationLabels {
  dashboardTitle: string;
  deliveryUnitSingular: string;
  deliveryUnitPlural: string;
  artifactSingular: string;
  artifactPlural: string;
  capabilitySingular: string;
  capabilityPlural: string;
  knowledgeSingular: string;
  knowledgePlural: string;
}

interface StageDescriptor {
  code: string;
  label: string;
  order: number;
  colorToken?: string;
}

interface ProfilePresentationStages {
  artifactStages: StageDescriptor[];
  maturityStages: StageDescriptor[];
}

interface ProfilePresentationWidgets {
  artifactCoverageFunnel: 'sdd_stage' | 'artifact_type' | 'none';
  userMaturity: 'sdd_maturity' | 'none';
  knowledgeCoverage: 'filesystem_scan' | 'recall_facts';
  callQuality: boolean;
  matchHealth: boolean;
  triggerSourceBreakdown: boolean;
  multiStageDeliveryUnit: boolean;
}
```

兼容规则：

- 如果 API 仍只返回旧 `artifactStageOrder`，前端用默认 label 派生 `artifactStages`。
- 如果 API 仍只返回旧 `hiddenMetrics`，前端用 `deriveWidgetsFromHiddenMetrics()` 派生 widget。
- `sdd-default` 的显示效果必须保持不变。
- `e2e-monorepo` 默认显示 `artifact_type` 漏斗，阶段为 `plan/design/task/review/process_doc`。

### 6.3 页面消费规则

页面不得再直接写：

```ts
const SDD_STAGES = ['proposal', 'design', 'task', 'review'];
const WI_STAGES = ['proposal', 'design', 'task', 'review'];
rawSkillName.startsWith('bk-fe-');
```

页面应统一使用：

```ts
const presentation = useProfilePresentationModel(profileId);
presentation.stages.artifactStages;
presentation.widgets.artifactCoverageFunnel;
presentation.labels.deliveryUnitPlural;
```

允许保留 SDD 常量的地方：

- `packages/api/src/profile-config.ts` 的 `SDD_PRESENTATION` 默认配置。
- `server/src/modules/sdd/**` legacy SDD 模块。
- 明确标注为 SDD-only 的 `SemanticsPage`、Daily Report 旧版。

## 7. 实施任务拆分

### P0：修复读路径阻断项

目标：确保 source-backed profile 不会错读 legacy SDD，也不会在用户详情直接 SQL 失败。

任务：

- 修复 `ProfileProjectionRepository.getUserDetail()` 的 SQL 语法问题。
- 修改 `ProfilesService.getDemandDetail()`：
  - `read.mode==='projection'` 且 detail 不存在时直接抛 `404 DEMAND_NOT_FOUND`。
  - 只有 `read.mode==='legacy'` 才调用 `sddQueryService.getWorkItemDetail()`。
- 修改 `ProfilesService.getUserDetail()`：
  - `read.mode==='projection'` 且 detail 不存在时直接抛 `404 USER_NOT_FOUND`。
  - 只有 `read.mode==='legacy'` 才调用 `sddQueryService.getUserDetail()`。
- 对 `errorCount` 做 profile-aware 处理：
  - `source_backed`：返回 0 或不展示。
  - `sdd_bridge`：可继续用 legacy adapter 聚合 `sdd_errors`。

验收：

- `e2e-monorepo` 的不存在 demand/user id 不会触发 `/api/sdd/*` 查询。
- `GET /api/profiles/e2e-monorepo/users/:id` 不再 SQL 报错。
- `sdd-default` legacy fallback 行为不破坏。

### P1：建立 Profile Presentation Model

目标：所有页面共享一个展示模型。

任务：

- 扩展 `ProfilePresentationSchema`，增加可选 `labels/stages/widgets/legacyOnlySurfaces`。
- 在 `packages/api/src/profile-config.ts` 为 `sdd-default`、`e2e-monorepo`、`online-docs` 补齐默认 presentation。
- 新增纯函数：
  - `normalizeProfilePresentation(presentation)`
  - `deriveStageDescriptors(artifactStageOrder, workflowKind)`
  - `deriveWidgetsFromHiddenMetrics(hiddenMetrics, knowledgeCoverageMode)`
- 更新 `packages/api/src/index.ts`，导出新增的 presentation helpers 和相关类型，避免 web 从 `@sdd-telemetry/api` 引用时报未导出。
- 同步 `packages/api/src/profile-config.ts` 的 `ProfilePresentationConfig` interface 与 `ProfilePresentationSchema`，不要只改 zod schema。
- 前端新增 `useProfilePresentationModel(profileId)`。
- 保留 `useProfileHiddenMetrics()` 过渡，但新代码不再使用。

验收：

- `sdd-default` 模型包含 `proposal/design/task/review` artifact stages 和 SDD labels。
- `e2e-monorepo` 模型包含 `plan/design/task/review/process_doc` artifact stages 和 artifact-type funnel。
- 页面层不再各自定义 SDD stage constants。

### P2：总览和产出分析改为 presentation-driven

目标：解决“产物分析 tab 没有阶段覆盖漏斗”的直接问题，并同步修总览。

任务：

- `WorkItemsPage`：
  - 删除 page-local `SDD_STAGES/STAGE_LABELS`。
  - 使用 `presentation.stages.artifactStages` 排序和渲染阶段 chip。
  - `artifactCoverageFunnel='sdd_stage'` 时显示旧 SDD 阶段覆盖。
  - `artifactCoverageFunnel='artifact_type'` 时显示“产物类型覆盖漏斗”。
  - `artifactCoverageFunnel='none'` 时显示明确空态，不误称阶段漏斗。
- `OverviewPage`：
  - 删除 `WI_STAGES` 和内联 `['proposal','design','task','codereview']`。
  - 用户深度、交付单元覆盖、最近活跃列表统一使用 presentation stage model。
  - `showMultiStage` 改为 `presentation.widgets.multiStageDeliveryUnit`。
  - 文案从固定“需求/SDD 深度/全阶段覆盖”改为 profile labels。

验收：

- 切 `sdd-default`：旧 SDD 漏斗和阶段点保持可见。
- 切 `e2e-monorepo`：产出分析显示 `plan/design/task/review/process_doc` 口径的产物类型覆盖，不再空白。
- 总览不再出现与 source-backed 不匹配的“SDD 深度/全阶段覆盖”。

### P3：能力分析和用户分析改为 presentation-driven

目标：清除“技能/成熟度/阶段渗透”中的 SDD 专属假设。

任务：

- `SkillsPage`：
  - 文案通过 `presentation.labels.capabilityPlural` 控制。
  - `callQuality/matchHealth/triggerSourceBreakdown/multiStageDeliveryUnit` 只看 widgets。
  - 保留能力排名、趋势、usage summary。
- `UsersPage`：
  - 删除 page-local `SDD_STAGES/STAGE_LABELS`。
  - `AdoptionRamp` 改为接收 `StageDescriptor[]`。
  - `maturityStages=[]` 时不展示成熟度 KPI 和 ramp。
  - 表格中的阶段/能力覆盖使用 presentation stage chips。
- `UserWorkItemList`：
  - stage chips 从 presentation artifact stages 获取。
  - 不再以 `showStages=false` 直接隐藏所有结构信息。
- 删除或限制 `SkillUsageChart`：
  - 如果保留，只能作为 `sdd-default` 专属组件。
  - 推荐改成 profile capability distribution，不再匹配 `bk-fe-*`。

验收：

- `rg -n "bk-fe-|SDD_STAGES|WI_STAGES" web/src/pages/overview web/src/pages/sdd` 只允许命中 SDD-only 页面或配置常量。
- `e2e-monorepo` 用户分析仍有用户活动、能力数、交付单元、知识读取、代码活动，不再显示空的 SDD 成熟度。

### P4：补齐 profile-native 用户活动下钻

目标：UserProfilePage 在 source-backed profile 下也能看到可用活动时间线。

新增 contract：

```ts
ProfileUserActivityItem {
  id: string;
  kind: 'capability' | 'knowledge' | 'artifact_write' | 'artifact_discussion' | 'code';
  eventTime: string | null;
  interactionId: string | null;
  deliveryUnitId: string | null;
  artifactId: string | null;
  capabilityUsageId: string | null;
  capabilityCode: string | null;
  capabilityDisplayName: string | null;
  rawCapabilityName: string | null;
  title: string;
  detail: string | null;
  locator: string | null;
}
```

新增 API：

```text
GET /api/profiles/:profileId/users/:userId/activity
  ?deliveryUnitId=
  &range=30d
  &limit=200
```

repository 查询来源：

- `profile_capability_usages`
- `profile_knowledge_recalls`
- `profile_artifact_writes`
- `profile_artifact_turns`
- `profile_code_activities`

前端任务：

- 新增 `useProfileUserActivity(profileId, userId, filters)`。
- `UserProfilePage` 改用 profile-native activity hook。
- 改造 `UserActivityTimeline`：
  - node kind 支持 `capability/knowledge/artifact_write/artifact_discussion/code`。
  - `code` 活动有独立图标、标题和 locator 展示。
  - artifact discussion/write 与旧 `discussion/write` 的文案兼容。
  - 空态区分“无活动”和“当前 delivery unit 无活动”。
  - 只有存在 `interactionId` 的节点才允许打开 interaction drawer。
- `InteractionDetailDrawer` 若继续使用旧 `/api/sdd/interactions/*`，文案改成 raw interaction 详情；如果 profile activity item 没有 `interactionId`，drawer 不可打开。
- 删除 `useUserSkillUsages` / `useUserArtifactWrites` 在 source-backed 路径上的使用。

验收：

- `e2e-monorepo` 用户详情 activity timeline 能看到能力、知识、代码、过程文档写入。
- UserProfilePage 在 source-backed 下不调用 `/api/sdd/usages` 和 `/api/sdd/work-items`。
- `UserActivityTimeline` 不再从旧 `useUserActivity.ts` 导入 SDD-only node type；新增 activity kind 全部有渲染分支。

### P5：知识库页面按 coverage mode 降级

目标：不要把 recall facts 口径展示成真实知识库覆盖率。

任务：

- `WikiRecallsPage` 读取 presentation：
  - `filesystem_scan`：显示知识库规模、知识利用率、沉睡文档、新未读等旧 KPI。
  - `recall_facts`：显示召回文档数、累计召回、参与用户、来源空间/领域数；不显示覆盖率百分比和沉睡文档。
- `BusinessLineCompare`、`TopDomains`、`AssetTable` 支持 `recall_facts` 文案。
- 补齐 profile knowledge coverage 的 source namespace：
  - repository 不再把 `sourceNamespace` 固定为空字符串。
  - 优先从 `profile_knowledge_recalls.evidence_json` 中的 matched source namespace 读取。
  - 如果历史数据没有该字段，再从 `knowledge_locator` 或 `rawLocator` 派生稳定 fallback，例如 `local` / host / root namespace。
  - 前端路由段不得使用空字符串 namespace。
- 如页面要展示“参与用户、来源空间数、领域数”，必须二选一：
  - 扩展 `ProfileKnowledgeCoverageResponse.totals`，增加 `distinctUsers/sourceNamespaceCount/domainCount`。
  - 或把 KPI 文案改成现有字段能支撑的事实，不展示 contract 中没有的数据。
- 新增 profile-native domain docs/doc detail/content API，或短期在 source-backed profile 下禁用领域详情入口：
  - 推荐先做 API，避免主页面可点进去后又读 `/api/sdd/wiki-recalls/*`。

建议新增 API：

```text
GET /api/profiles/:profileId/knowledge/domains/:sourceNamespace/:domain/docs
GET /api/profiles/:profileId/knowledge/docs/detail?sourceNamespace=&relativePath=
GET /api/profiles/:profileId/knowledge/content?sourceNamespace=&relativePath=
```

接线要求：

- `ProfileKnowledgeDomainDocsResponseSchema`、`ProfileKnowledgeDocDetailResponseSchema`、`ProfileKnowledgeContentSchema` 已存在时，优先复用，不重新发明返回结构。
- `profiles.controller.ts` 必须补齐 domain docs/detail/content 路由。
- `ProfilesService` 必须补齐对应方法，并在 source-backed projection mode 下走 `ProfileProjectionRepository`，不能回退 `/api/sdd/wiki-recalls/*`。
- `ProfileProjectionRepository` 必须能按 `sourceNamespace + domain` 查询 docs，并按 `sourceNamespace + relativePath` 查询 doc detail/content；如果 content 无 filesystem backing，应返回明确 `not_configured` 或只提供 recall detail，不要伪造正文。

验收：

- `e2e-monorepo` 不显示“需服务器挂载知识库”。
- 知识领域详情不再从 `/api/sdd/wiki-recalls/*` 读取 source-backed 数据。
- source-backed 知识领域点击后的 URL 不包含空 namespace。

### P6：配置页、交互页、日报的边界处理

目标：明确哪些页面是 SDD-only，哪些是 raw telemetry，哪些是 profile-aware。

任务：

- `SemanticsPage`：
  - 短期改名或加副标题为“SDD 语义映射”。
  - 如果当前 profile 不是 `workflowKind='sdd'`，显示说明：source-backed profile 规则由后续 Profile Config Admin 管理。
  - 不允许用户误以为这里的语义列表会控制 `e2e-monorepo`。
- `InteractionsPage`：
  - 定位为 raw telemetry 明细，而不是 profile projection 页面。
  - 导航文案可继续“交互明细”，避免带 SDD。
- `DailyReportsPage`：
  - 当前先 gate 到 `sdd-default`，或标注“SDD 每日简报”。
  - 后续如要支持 profile report，单独设计 `ProfileReportContract`。
- `Sidebar` / `AppShell`：
  - 品牌名短期可改成中性“Profile 质量观测台”或“研发工作流观测台”。
  - 路由 `/sdd/...` 短期不迁移，避免破坏书签和导航；长期单独做 route alias。

验收：

- `e2e-monorepo` 下用户不会在“语义映射”页看到 SDD 列表并误认为它控制 monorepo。
- 每日简报不会对 source-backed profile 展示 SDD 四阶段结论。

### P7：后续配置表单的前置约束

这部分不在本次 dashboard 兼容性内实现，但必须作为后续表单设计的约束：

- 表单保存的 profile config 必须继续使用 `WorkflowProfileConfig` 和 `validateProfileConfig()`。
- server 和 worker 必须从同一来源加载 runtime profile config。
- 第一版持久化可以是 current-only，不做复杂版本管理。
- 表单不需要复杂项目根推断；保留用户确认过的低成本规则：
  - root 精确匹配
  - `pathContains/pathRegexes`
  - `urlPrefixes/urlRegexes`
  - MCP doc 条件
  - include/exclude globs
  - priority/confidence/enabled/actions/category

## 8. 推荐落地顺序

建议按下面顺序做，避免先改 UI 后被 API 兼容性阻断：

1. P0 读路径阻断项：SQL 修复、projection 404 不回落 legacy、errorCount 隔离。
2. P1 Presentation Model：先让页面有统一输入。
3. P2 Overview + WorkItems：先修用户最直接看到的产物覆盖问题。
4. P3 Skills + Users：清理 SDD 成熟度和能力文案硬编码。
5. P4 User activity：补齐 source-backed 用户详情下钻。
6. P5 Knowledge：修 coverage mode 和 domain detail。
7. P6 Semantics/Interactions/Daily/Navigation：标注和 gate SDD-only 页面。
8. 再启动 Profile Config Admin：持久化配置和表单 UI。

## 9. 验证计划

### 9.1 静态检查

```bash
rg -n "SDD_STAGES|WI_STAGES|proposal.*design.*task|bk-fe-" web/src/pages web/src/components
rg -n "/api/sdd" web/src/pages/sdd web/src/components/sdd
rg -n "MULTI_STAGE_ARTIFACT_TYPES|MATURITY_STAGES|sdd_errors" server/src/modules/profiles
```

允许命中：

- `server/src/modules/sdd/**`
- `packages/api/src/profile-config.ts` 的 SDD 默认配置
- 明确 SDD-only 页面

不允许命中：

- profile-aware dashboard 页面里的阶段数组。
- source-backed 路径的用户活动和知识详情下钻。

### 9.2 类型和单元测试

```bash
./node_modules/.bin/tsc --noEmit -p packages/api/tsconfig.json
./node_modules/.bin/tsc --noEmit -p server/tsconfig.json
./node_modules/.bin/tsc --noEmit -p worker/tsconfig.json
./node_modules/.bin/tsc --noEmit -p web/tsconfig.json
./node_modules/.bin/vitest run worker/test/profile-config.test.ts worker/test/source-registry-matcher.test.ts worker/test/source-backed-projection.test.ts worker/test/source-backed-attribution.test.ts
```

新增测试建议：

- `normalizeProfilePresentation()`：
  - `sdd-default` 派生 SDD stage labels。
  - `e2e-monorepo` 派生 artifact type funnel。
  - 旧 `hiddenMetrics` 能派生 widgets。
- `packages/api/src/index.ts`：
  - 新增 presentation helper 后，从包入口 import 能通过 typecheck。
- `ProfilesService`：
  - source-backed projection detail not found 不调用 legacy。
  - sdd-default 无 current run 仍可 legacy fallback。
- `ProfileUserActivity`：
  - contract/controller/service/repository 路由完整。
  - `code`、`knowledge`、`artifact_write`、`capability` 都能出现在返回结果。
- `ProfileKnowledgeDetail`：
  - domain docs/detail/content 路由完整。
  - source-backed sourceNamespace 非空。
- `ProfileProjectionRepository`：
  - maturity stages 空数组时返回空 maturity。
  - artifact stage order 按 presentation 排序。

### 9.3 本地数据烟测

使用已有本地 fixture 或重新生成：

```bash
export PROFILE_DASHBOARD_READ_SOURCE=profile_projection
export E2E_MONOREPO_ROOT=/private/tmp/sdd-telemetry-e2e-monorepo-demo

pnpm db:migrate
pnpm profile:rebuild-source-references
pnpm profile:rebuild -- --profile e2e-monorepo
pnpm profile:diff -- --profile e2e-monorepo
```

验收标准：

- `profile:rebuild` completed，current pointer 切到新 run。
- `profile:diff -- --profile e2e-monorepo` gate 为 `PASS`。
- `sourceReferences.matched > 0`。
- `projection.deliveryUnits > 0`、`artifacts > 0`、`capabilityUsages > 0`、`knowledgeRecalls > 0`、`codeActivities > 0`。

### 9.4 浏览器烟测

切换 `e2e-monorepo` 后逐页确认：

| 页面 | 验收 |
|---|---|
| 总览 | 不出现 SDD 深度/全阶段覆盖误导；展示 profile labels 和 artifact-type 覆盖。 |
| 产出分析 | 有产物类型覆盖漏斗；列表阶段 chip 来自 `plan/design/task/review/process_doc`。 |
| 产出详情 | artifacts 和 timeline 可打开；不存在 id 返回 profile 404。 |
| 能力分析 | 能力排名、趋势、summary 有数据；不显示不适用的 call quality/match health。 |
| 用户分析 | 用户列表有数据；不显示空 SDD 成熟度；阶段 chip 不写死 SDD。 |
| 用户详情 | activity timeline 有能力、知识、代码、写入；不调用旧 `/api/sdd/usages`。 |
| 知识库分析 | recall facts 口径文案正确；领域详情不读旧 SDD API，URL 不含空 namespace。 |
| 语义映射 | 明确 SDD-only，不让用户误解它控制当前 profile。 |
| 每日简报 | source-backed 下不展示 SDD Daily Brief，或明确禁用。 |

## 10. 完成定义

完成后必须满足：

1. `sdd-default` 页面体验不回退，旧 SDD 阶段漏斗、用户成熟度、语义映射仍可用。
2. `e2e-monorepo` 有数据时，核心页面不再展示 0 或空白来代替实际事实。
3. source-backed profile 的 profile-aware 页面不再调用 `/api/sdd/*` 获取业务数据。
4. profile projection read mode 下，详情未命中不会 fallback 到 legacy SDD。
5. 页面阶段、阶段标签、指标可见性统一由 Presentation Model 决定。
6. `knowledgeCoverageMode='recall_facts'` 不再被展示成 filesystem coverage。
7. 后续 Profile Config Admin 可以只关心配置加载和表单，不需要再补页面兼容性债务。

## 11. 非目标

本次不做：

- 不做复杂匹配治理、自动项目根推断、多层规则推荐。
- 不新增 profile config 持久化表。
- 不重命名所有 `/sdd/...` 路由。
- 不把 Daily Report 泛化为 profile report。
- 不新增 `profile_errors`，除非后续明确要把错误分析纳入 source-backed。
- 不把 code activity 拆回前端/后端模型。
