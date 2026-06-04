# Profile Contract 覆盖补齐实施计划（第二阶段-1）

更新时间：2026-06-04  
状态：待实施  
关联文档：

- `docs/design-profile-observability-architecture.md`
- `docs/tasks-profile-observability-mvp.md`
- `docs/implementation-report-profile-observability-mvp.md`

## 1. 结论

第二阶段-1 的目标是补齐 `sdd-default` 的 Profile Observability Contract 覆盖，让**总览 + 四大看板**可以真实切到 `profile_projection` 读源：

```text
总览 / 用户分析 / 技能分析 / 产出分析 / 知识库分析
  -> /api/profiles/:profileId/*
  -> Profile Observability Contract
  -> profile_* current completed run
  -> raw / event / source_references / sdd bridge baseline
```

这一步不接入老板 A / 老板 B，也不做新的产品信息架构。它要解决的是：现有老板可见页面仍大量硬读 `/api/sdd/*`，底层 profile 化已经跑通，但上层看板还没有真正完成 DIP 解耦。

实施难度评估：**中等**。主要工作不是底层清洗，而是合同扩展、查询补齐、页面换源和对账验收。建议按本文 PR 顺序执行，不建议直接一把梭。

## 2. 为什么上线前建议先做这一步

当前 MVP-1 已经完成：

- `source_references` 抽取与幂等重建。
- `profile_*` 投影表与 current-pointer。
- `sdd-default` bridge projection。
- `knowledgeRecalls` 非自证投影。
- `profile:diff` key/locator 级 gate。
- `/api/profiles`、`/manifest`、`/overview`、`/demands` 基础端点。
- Profile Switcher 和 `useProfileOverview` / `useProfileDemands` hook。

但当前仍未完成：

- `profile_capability_usages.delivery_unit_id` 仍未补齐，导致“能力调用覆盖哪些需求”链路不完整。
- `profile_knowledge_recalls.delivery_unit_id` 仍未补齐，知识库召回无法完整支撑需求维度下钻。
- 产出分析页还在读 `useSddWorkItems()`。
- 技能分析页还在读 `useSkillAnalytics()`、`useSkillTimeseries()`、`useSddUsageSummary()`、`useSkillUsages()`。
- 用户分析页还在读 `useSddUsers()`，用户详情相关 hook 仍读 `/api/sdd/users/*`。
- 知识库分析页和下钻仍读 `/api/sdd/wiki-recalls/*`。
- 总览 headline 已接 profile，但后续模块仍混用 SDD hook。

所以，如果现在直接给老板看“profile 化能力”，可见价值有限，并且会出现“底层已经 profile 化，页面主链路还是旧 SDD”的割裂。第二阶段-1 做完后，才适合把 `PROFILE_DASHBOARD_READ_SOURCE=profile_projection` 作为正式演示路径。

## 3. 本阶段目标

### 3.1 产品目标

让 `sdd-default` 在当前页面形态下完成 profile contract 换源：

- 总览：主要 KPI、用户/能力/需求/知识库相关模块都走 profile contract。
- 用户分析：用户列表和用户详情走 profile contract。
- 技能分析：能力分析、趋势、能力汇总、原始调用明细走 profile contract。
- 产出分析：需求列表、需求详情、artifact timeline 走 profile contract。
- 知识库分析：coverage、趋势、列表、需求排行、文档列表、文档详情、内容读取走 profile contract。

页面文案第一期可以继续叫“技能”“需求”“知识库”。Contract 内部不能继续出现新的 `sdd` 命名。

### 3.2 架构目标

上层页面依赖方向调整为：

```text
页面 / hook
  -> Profile Contract hook
  -> /api/profiles/:profileId/*
  -> ProfilesService
  -> profile_projection repository 或 legacy_sdd adapter
```

而不是：

```text
页面 / hook
  -> /api/sdd/*
  -> sdd_* query
```

允许保留旧 `/api/sdd/*` 作为回退和历史页面能力，但四大看板主数据源不能继续依赖它。

## 4. 范围

### 4.1 做

- 扩展 `packages/api/src/contracts/profile.contract.ts`，补齐四大看板所需 schema。
- 补齐 `profile_capability_usages.delivery_unit_id` 映射。
- 补齐 `profile_knowledge_recalls.delivery_unit_id` 映射。
- 按需要补齐 `profile_code_activities.delivery_unit_id` 映射，但代码强归因仍不作为强一致 gate。
- 补齐 profile 查询索引，避免四大看板切源后性能退化。
- 扩展 `profile:diff`，新增 contract/linkage 级对账。
- 新增 `/api/profiles/:profileId/*` 端点，覆盖现有四大看板主调用面。
- 前端新增 profile hooks，并把总览和四大看板逐页切到 profile hooks。
- 保留 `PROFILE_DASHBOARD_READ_SOURCE=legacy_sdd` 回退。
- 输出实施报告，列出每个页面的换源证据、对账结果和未覆盖项。

### 4.2 不做

- 不接入 `boss-a-monorepo`。
- 不接入 `boss-b-online-docs`。
- 不做配置 UI。
- 不做 all-profile 汇总。
- 不做新版页面重设计。
- 不删除 `/api/sdd/*`。
- 不删除 `sdd_*` 表。
- 不做完整 canonical facts 重建。
- 不做需求级代码强归因、PR/commit 闭环、代码质量评测。
- 不做错误告警、评测业务表。
- 不把语义映射 tab 改成通用 profile 配置页面。

## 5. 关键原则

### 5.1 Contract 使用通用命名

`packages/api/src/contracts/profile.contract.ts` 中新增类型必须使用：

- `capability`，不用 `skill`
- `deliveryUnit`，不用 `workItem`
- `knowledge` / `knowledgeRecall`，不用 `wiki`
- `artifact`，不用 SDD 私有阶段命名做核心字段

页面文案和局部展示可以继续：

- 技能分析
- 需求
- 知识库
- 需求撰写 / 系统设计 / 任务拆分 / 代码评审

如果为了降低前端改造成本需要做字段适配，适配层只能放在页面本地 hook / adapter 中，不能把 `Sdd*` 类型继续扩散到 profile contract。

### 5.2 读源回退在服务端完成

服务端 `ProfilesService` 继续承担读源策略：

- `PROFILE_DASHBOARD_READ_SOURCE=profile_projection` 且存在 current completed run：读 `profile_*`。
- 无 current pointer 或 run 非 completed：回退 legacy。
- `PROFILE_DASHBOARD_READ_SOURCE=legacy_sdd`：读旧 SDD adapter。

前端最终状态不应该用“profile hook 失败后再调用 `/api/sdd/*`”作为主回退，否则审查时无法判断页面到底有没有切源。实施过程中短暂保留可以，但最终 PR 必须移除四大看板主数据的前端 SDD fallback。

### 5.3 ID 是 opaque，不假设等于旧 SDD id

Profile endpoints 返回的 `id` 是 profile 投影行 id；legacy adapter 返回的 `id` 可能是旧 `sdd_*` id。前端路由参数只能把它当 opaque id，不得在页面里假设它一定是旧 SDD id。

需求详情必须通过：

```text
GET /api/profiles/:profileId/demands/:demandId
```

不能在 profile 列表返回 profile id 后，又拿这个 id 去调用：

```text
GET /api/sdd/work-items/:id
```

### 5.4 不允许“表面换源”

本阶段完成后，以下页面主数据不能再直接请求 `/api/sdd/*`：

- `web/src/pages/overview/**`
- `web/src/pages/sdd/users/**`
- `web/src/pages/sdd/skills/**`
- `web/src/pages/sdd/work-items/**`
- `web/src/pages/sdd/wiki-recalls/**`

允许保留 `/api/sdd/*` 的范围：

- `web/src/pages/sdd/semantics/**`，语义映射配置本阶段不改。
- `web/src/pages/sdd/interactions/**`，原始交互下钻本阶段不改。
- 服务端 `ProfilesService` 的 legacy adapter。
- 测试、对账脚本、历史 SDD controller。

审查时必须用 `rg "/api/sdd"` 验证调用面。

## 6. 实施切分

建议分 6 个 PR。每个 PR 都必须可 typecheck，不能把半截 contract 留给下一个 PR 才能编译。

| PR | 目标 | 主要产物 | 是否可单独验收 |
| --- | --- | --- | --- |
| PR-1 | Contract + 链路补齐 | profile schema、projection delivery link、索引、diff gate | 是 |
| PR-2 | 产出分析换源 | demands list/detail/timeline API + WorkItems 页面 | 是 |
| PR-3 | 技能分析换源 | capabilities analytics/timeseries/summary/usages API + Skills 页面 | 是 |
| PR-4 | 用户分析换源 | users list/detail API + Users 页面/详情 | 是 |
| PR-5 | 知识库分析换源 | knowledge coverage/timeline/list/docs/detail/content API + Wiki 页面 | 是 |
| PR-6 | 总览收口 + canary | overview 剩余模块、全站切源验收、文档报告 | 是 |

PR-2 到 PR-5 可以并行开发，但合并顺序建议保持不变，避免前端页面依赖未发布的 contract。

## 7. PR-1：Contract、链路和对账基础

### Task 1.1 扩展 Profile Contract

修改：

- `packages/api/src/contracts/profile.contract.ts`
- 如有需要，同步 `packages/api/src/index.ts`

新增或扩展 schema：

```text
ProfileMetricWithPrevious

ProfileDemand
ProfileDemandDetail
ProfileDemandArtifact
ProfileArtifactTimelineItem
ProfileArtifactTimelineResponse

ProfileCapabilityAnalytics
ProfileCapabilityTimeseries
ProfileCapabilityUsageSummaryQuery
ProfileCapabilityUsageSummaryItem
ProfileCapabilityUsageSummaryResponse
ProfileCapabilityUsageItem

ProfileUserItem
ProfileUserDetail
ProfileUserSummary
ProfileUserMaturity
ProfileUserDeliveryUnit

ProfileKnowledgeCoverageResponse
ProfileKnowledgeTimelineResponse
ProfileKnowledgeRecallListResponse
ProfileKnowledgeDeliveryUnitRankingResponse
ProfileKnowledgeDomainDocsResponse
ProfileKnowledgeDocDetailResponse
ProfileKnowledgeContent
```

字段命名要求：

- 对外 contract 不能新增 `Sdd*` 类型。
- 兼容当前页面所需字段，但使用通用名。
- 如页面需要旧字段名，由前端 page-local adapter 转换。

`ProfileDemand` 最少补齐：

```text
id
deliveryUnitKey
businessDomain
unitSlug
title
locator
firstSeenAt
lastSeenAt
artifactCount
capabilityUsageCount
errorCount
coverageStages
```

`ProfileDemandDetail` 最少补齐：

```text
ProfileDemand fields
artifacts[]
capabilityUsageCount
errorCount
turnCount
sessionCount
contributorCount
knowledgeRecallCount
```

`ProfileCapabilityAnalytics` 需要覆盖当前技能分析页：

```text
kpis.capabilityUsageCount
kpis.activeUserCount
kpis.coveredDeliveryUnitCount
kpis.userTriggeredCount
kpis.autoTriggeredCount
kpis.multiStageDeliveryUnitCount
callQuality
topCapabilities
matchHealth
```

`ProfileUserItem` 需要覆盖当前用户分析页：

```text
id
userKey
installId
displayName
machineId
machineName
firstSeenAt
lastSeenAt
capabilityUsageCount
interactionCount
deliveryUnitCount
capabilityStages
status
isNew
artifactCount
knowledgeRecallCount
codeWriteCount
codeReadCount
rampDays
```

验收：

- `pnpm --filter @sdd-telemetry/api typecheck` 通过。
- `profile.contract.ts` 不新增 `Sdd` 命名前缀。
- 新 schema 能覆盖当前四大看板主数据字段，不要求一字不差复刻旧字段名。

### Task 1.2 补齐 capability -> delivery 链路

修改：

- `worker/src/jobs/profile-projection/sdd-bridge-operators.ts`
- 如有需要修改 runner registry 类型。

当前 `profile_capability_usages.delivery_unit_id` 为空。需要在 capability bridge 中把旧 `sdd_skill_usages.work_item_id` 映射到当前 run 的 `profile_delivery_units.id`。

注意依赖顺序：

当前 bridge operator 顺序是：

```text
capability -> deliveryUnit -> artifact -> artifactWrite -> artifactTurn
```

如果 capability 要写 `delivery_unit_id`，必须调整顺序或采用二段更新：

推荐方案：

```text
deliveryUnit -> capability -> artifact -> artifactWrite -> artifactTurn
```

理由：

- deliveryUnit 先建立 `ctx.registry.deliveryUnitByWorkItemId`。
- capability 插入时直接写 `delivery_unit_id`。
- artifact/writes/turns 原有依赖不受影响。

验收 SQL：

```sql
SELECT COUNT(*) AS missing
FROM profile_capability_usages p
JOIN profile_projection_runs r ON r.id = p.projection_run_id
JOIN sdd_skill_usages s
  ON p.usage_key = SHA2(CONCAT(p.profile_id, ':capability:', s.usage_key), 256)
WHERE r.profile_id = 'sdd-default'
  AND r.status = 'completed'
  AND s.work_item_id IS NOT NULL
  AND p.delivery_unit_id IS NULL;
```

`missing` 必须为 0。

### Task 1.3 补齐 knowledge/code -> delivery 链路

修改：

- `worker/src/jobs/profile-projection/knowledge-operator.ts`
- `worker/src/jobs/profile-projection/code-operator.ts`

`profile_knowledge_recalls.delivery_unit_id` 应通过：

```text
source_references.tool_call_id
  -> sdd_interaction_tool_calls.skill_usage_id
  -> sdd_skill_usages.work_item_id
  -> ctx.registry.deliveryUnitByWorkItemId
```

写入 `profile_knowledge_recalls.delivery_unit_id`。

`profile_code_activities.delivery_unit_id` 可按同样链路写入；代码活动仍不做强一致 gate，但字段应尽量补齐，方便 Boss A 后续做“有没有进入代码实施”的需求维度聚合。

验收 SQL：

```sql
SELECT COUNT(*) AS missing
FROM profile_knowledge_recalls k
JOIN sdd_interaction_tool_calls tc ON tc.id = k.tool_call_id
JOIN sdd_skill_usages su ON su.id = tc.skill_usage_id
WHERE k.projection_run_id = ?
  AND su.work_item_id IS NOT NULL
  AND k.delivery_unit_id IS NULL;
```

pipeline scope 内 `missing` 必须为 0。若某些 recall 没有 skill usage 或 work item，必须在 diff 输出中单独计数说明。

### Task 1.4 补齐查询索引

评估当前 `profile_*` 表索引。四大看板会新增按用户、能力、需求、时间聚合的查询，现有索引可能不足。

建议新增 migration，至少覆盖：

```text
profile_capability_usages(profile_id, projection_run_id, user_id)
profile_capability_usages(profile_id, projection_run_id, capability_code, event_time)
profile_capability_usages(profile_id, projection_run_id, delivery_unit_id)

profile_delivery_units(profile_id, projection_run_id, last_seen_at)

profile_knowledge_recalls(profile_id, projection_run_id, user_id, event_time)
profile_knowledge_recalls(profile_id, projection_run_id, delivery_unit_id)
profile_knowledge_recalls(profile_id, projection_run_id, knowledge_domain)

profile_code_activities(profile_id, projection_run_id, user_id, event_time)
profile_code_activities(profile_id, projection_run_id, delivery_unit_id)

profile_artifact_writes(profile_id, projection_run_id, delivery_unit_id, event_time)
profile_artifact_turns(profile_id, projection_run_id, delivery_unit_id, event_time)
```

验收：

- `pnpm db:migrate` 通过。
- `pnpm db:verify` 通过。
- 不给 `VARCHAR(2048)` 原文字段直接建普通索引。

### Task 1.5 扩展 profile diff gate

修改：

- `worker/src/jobs/profile-diff.ts`
- `worker/package.json`
- 根 `package.json` 如新增脚本需同步。

在现有 `profile:diff -- --profile sdd-default` 中新增 linkage / contract gate：

```text
capabilityDeliveryMissing
knowledgeDeliveryMissing
codeDeliveryResolvable / codeDeliveryMissing（只报告，不阻塞）
demandCapabilityCountDiff
demandArtifactCountDiff
demandKnowledgeCountDiff
userCapabilityCountDiff
userArtifactCountDiff
knowledgeOldNotInNew
```

阻塞条件：

- capability 有旧 `work_item_id` 但新 `delivery_unit_id` 为空：阻塞。
- knowledge pipeline scope 有旧 `work_item_id` 但新 `delivery_unit_id` 为空：阻塞。
- bridge 域 key-set 差异非 0：阻塞。
- knowledge `old_not_in_new` 非 0：阻塞。
- 旧 API 和新 contract 的核心 count 不一致且没有写入 `stats_json` 解释：阻塞。

非阻塞但必须报告：

- code activity 无法映射 delivery unit 的数量。
- knowledge `new_not_in_old`，只要可归因到完整 source reference 或规则差异。
- seed/demo 数据排除数量。

验收命令：

```bash
pnpm profile:rebuild-source-references
pnpm profile:rebuild -- --profile sdd-default
pnpm profile:diff -- --profile sdd-default
pnpm profile:link-check -- --profile sdd-default
```

全部通过。

## 8. PR-2：产出分析换源

### Task 2.1 扩展 demands API

修改：

- `server/src/modules/profiles/profiles.controller.ts`
- `server/src/modules/profiles/profiles.service.ts`
- `server/src/modules/profiles/profile-projection.repository.ts`
- `packages/api/src/contracts/profile.contract.ts`

新增 / 补齐端点：

```text
GET /api/profiles/:profileId/demands
GET /api/profiles/:profileId/demands/:demandId
GET /api/profiles/:profileId/demands/:demandId/artifacts/:artifactId/timeline
```

`/demands` 当前已存在，但字段不够，必须补齐：

- `capabilityUsageCount`
- `errorCount`
- `coverageStages`
- `artifactCount`

`/demands/:demandId` 必须返回 artifact 列表和聚合指标，覆盖当前 `SddWorkItemDetail` 使用面。

timeline 端点必须从 profile 表读：

- `profile_artifact_writes`
- `profile_artifact_turns`
- `profile_capability_usages`
- `profile_knowledge_recalls`

timeline item 需覆盖当前页面：

```text
nodeKind: write | discussion
writeKind
eventTime
eventSequence
interactionId
capabilityCode
capabilityDisplayName
rawCapabilityName
knowledgeRecallCount
promptPreview
contentPreview
```

legacy adapter 可继续复用 `SddQueryService`，但 controller 对外必须是 `/api/profiles/:profileId/*`。

### Task 2.2 前端 WorkItems 页面换源

修改：

- `web/src/pages/profiles/useProfiles.ts` 或新增 profile hooks 文件。
- `web/src/pages/sdd/work-items/useSddWorkItems.ts` 可保留历史 hook，但 WorkItems 页面不再使用它。
- `web/src/pages/sdd/work-items/WorkItemsPage.tsx`
- `web/src/pages/sdd/work-items/WorkItemDetailPage.tsx`
- `web/src/pages/sdd/work-items/useArtifactWrites.ts`

要求：

- 使用 `useShellContext().profileId`。
- 列表页请求 `/api/profiles/${profileId}/demands`。
- 详情页请求 `/api/profiles/${profileId}/demands/:demandId`。
- artifact timeline 请求 `/api/profiles/${profileId}/demands/:demandId/artifacts/:artifactId/timeline`。
- 页面文案可继续叫“需求”“需求总数”“活跃需求”。
- 路由可以暂时保留 `/sdd/work-items/*`，但数据源不能再直接调用 `/api/sdd/work-items/*`。

验收：

- `rg "/api/sdd/work-items" web/src/pages/sdd/work-items web/src/pages/overview` 无主数据调用。
- `PROFILE_DASHBOARD_READ_SOURCE=profile_projection` 下产出分析列表、详情、timeline 可用。
- `PROFILE_DASHBOARD_READ_SOURCE=legacy_sdd` 下仍可用。
- 旧 `profile:link-check` 仍 PASS。

## 9. PR-3：技能分析换源

### Task 3.1 新增 capabilities API

新增端点：

```text
GET /api/profiles/:profileId/capabilities/analytics
GET /api/profiles/:profileId/capabilities/timeseries
GET /api/profiles/:profileId/capabilities/usage-summary
GET /api/profiles/:profileId/capabilities/usages
```

查询参数对齐旧技能分析：

- `from`
- `bucket`
- `matched=all|matched|unmatched`
- `keyword`
- `page`
- `pageSize`
- `limit`
- `capabilityCode`
- `rawCapabilityName`
- `userId`

profile_projection 读法：

- 主表：`profile_capability_usages`
- 需求覆盖：`delivery_unit_id IS NOT NULL`
- 多阶段需求：同一个 `delivery_unit_id` 下 artifact stage 数量。
- 调用质量：沿用 `status`、prompt/response pairing 口径，必要时 join `sdd_interactions`。
- top capabilities：按 `capability_code` / `display_name` 聚合；未匹配能力单独进入 matchHealth。

注意：

- Contract 字段叫 capability；前端页面标题可以继续显示“技能分析”。
- `rawSkillName` 这类旧字段最多出现在 page-local adapter，不能出现在 profile contract。

### Task 3.2 前端 Skills 页面换源

修改：

- `web/src/pages/sdd/skills/hooks/*`
- `web/src/pages/sdd/skills/SkillsPage.tsx`
- 如有必要，新增 `web/src/pages/profiles/useProfileCapabilities.ts`

要求：

- 所有技能分析主数据请求改为 `/api/profiles/${profileId}/capabilities/*`。
- `ProfileSwitcher` 改变时，queryKey 必须包含 `profileId`。
- time range 仍按当前 Shell `timeRange` 语义传递。
- selected raw capability 的 drawer / 明细仍可用。

验收：

- `rg "/api/sdd/(skill-analytics|skill-timeseries|usage-summary|usages)" web/src/pages/sdd/skills web/src/pages/overview` 无主数据调用。
- 技能分析 KPI、趋势、调用质量、标杆技能、列表、drawer 都可渲染。
- `profile:diff` 中 capability bridge key-set 仍 0 差异。

## 10. PR-4：用户分析换源

### Task 4.1 新增 users API

新增端点：

```text
GET /api/profiles/:profileId/users
GET /api/profiles/:profileId/users/:userId
GET /api/profiles/:profileId/users/:userId/capability-usages
GET /api/profiles/:profileId/users/:userId/knowledge-recalls
GET /api/profiles/:profileId/users/:userId/artifact-writes
```

最小要求：

- 用户列表覆盖当前 UsersPage。
- 用户详情覆盖当前 UserProfilePage / activity 组件。
- 用户 activity 下钻如果本阶段工作量过大，可以先只迁移当前页面实际渲染需要的 tab，但必须在实施报告里明确未覆盖项。

profile_projection 读法：

- 用户全集来自 `profile_capability_usages.user_id`、`profile_artifact_writes.user_id`、`profile_knowledge_recalls.user_id`、`profile_code_activities.user_id` 的 union，再 join `sdd_users` 获取展示名和机器信息。
- `capabilityUsageCount` 来自 `profile_capability_usages`。
- `deliveryUnitCount` 来自 distinct `delivery_unit_id`。
- `artifactCount` 来自用户关联的 `profile_artifact_writes` / artifact。
- `knowledgeRecallCount` 来自 `profile_knowledge_recalls`。
- `codeReadCount` / `codeWriteCount` 来自 `profile_code_activities`。
- `status`、`isNew`、`rampDays` 复用当前 SDD 阈值，避免产品口径变化。

### Task 4.2 前端 Users 页面换源

修改：

- `web/src/pages/sdd/users/useSddUsers.ts` 可保留历史 hook，但页面不再使用。
- `web/src/pages/sdd/users/UsersPage.tsx`
- `web/src/pages/sdd/users/useUserProfile.ts`
- `web/src/pages/sdd/users/useUserActivity.ts`
- `web/src/pages/sdd/users/useUserSkillUsages.ts`
- `web/src/pages/sdd/users/useUserArtifactWrites.ts`

要求：

- 使用 `profileId` 构造 queryKey。
- 页面文案可继续使用“技能”“需求成熟度”。
- 用户详情、技能调用、知识召回、文档写入如果保留原 UI，数据必须来自 profile endpoint 或明确降级。

验收：

- `rg "/api/sdd/users|/api/sdd/usages|/api/sdd/wiki-recalls/list|/api/sdd/work-items" web/src/pages/sdd/users` 无主数据调用。
- 用户列表总数、状态分布、成熟度、代码读写数与旧口径对账一致或有解释。
- 用户详情打开无 404、无空白页。

## 11. PR-5：知识库分析换源

### Task 5.1 新增 knowledge API

新增端点：

```text
GET /api/profiles/:profileId/knowledge/coverage
GET /api/profiles/:profileId/knowledge/timeline
GET /api/profiles/:profileId/knowledge/list
GET /api/profiles/:profileId/knowledge/delivery-units
GET /api/profiles/:profileId/knowledge/docs
GET /api/profiles/:profileId/knowledge/doc-detail
GET /api/profiles/:profileId/knowledge/content/by-locator
GET /api/profiles/:profileId/knowledge/content/:referenceKey
```

Controller 注册顺序必须让 `content/by-locator` 先于 `content/:referenceKey`，避免动态参数吞掉固定路由。

命名说明：

- 旧页面里的 `wiki-recalls/work-items` 在 profile contract 中叫 `knowledge/delivery-units`。
- 旧页面里的 `repo/domain` 可以在 `sdd-default` 返回中保留，因为这是当前知识库组织方式；但 contract 层应使用 `sourceNamespace` / `domain` 等更通用字段，页面 adapter 可转换为现有组件需要的 repo/domain。

profile_projection 读法：

- recall 事实来自 `profile_knowledge_recalls`，不能复制或直接读取 `sdd_wiki_recalls` 作为 projection 结果。
- coverage 分母对 `sdd-default` 可复用现有服务器本地知识库扫描器。
- 如果服务器未挂载知识库，保持现有 degraded 行为。
- 文档内容读取对 `sdd-default` 可复用现有本地内容读取逻辑；未来 Boss B 再接 MCP 在线文档读取。

必须避免：

- 不能用 `source_references.id` 作为公开内容读取 key。
- 公开 key 优先使用 `source_reference_key` 或 locator query。

### Task 5.2 前端 WikiRecalls 页面换源

修改：

- `web/src/pages/sdd/wiki-recalls/useWikiRecalls.ts`
- `web/src/pages/sdd/wiki-recalls/WikiRecallsPage.tsx`
- `web/src/pages/sdd/wiki-recalls/WikiDomainDetailPage.tsx`
- `web/src/pages/sdd/wiki-recalls/components/*`

要求：

- coverage、timeline、list、delivery-unit ranking、domain docs、doc detail、content 都走 `/api/profiles/${profileId}/knowledge/*`。
- 页面文案可继续叫“知识库分析”“wiki 读取次数”。
- Degraded UI 继续可用。

验收：

- `rg "/api/sdd/wiki-recalls" web/src/pages/sdd/wiki-recalls web/src/pages/overview` 无主数据调用。
- 知识库首页 KPI、业务线对比、趋势、Top domains、资产表可用。
- 领域详情、文档详情、内容弹层可用。
- `profile:diff` knowledge gate 仍 PASS：`old_not_in_new=0`、`orphan_source_ref=0`。

## 12. PR-6：总览收口、全站 canary 和文档

### Task 6.1 Overview 剩余模块换源

修改：

- `web/src/pages/overview/OverviewPage.tsx`
- 相关 overview 子组件 / hooks。

要求：

- Overview 不再直接调用 `useSkillAnalytics()`、`useSddUsers()`、`useSddWorkItems()` 获取主数据。
- 使用 profile overview/users/capabilities/demands/knowledge hooks。
- queryKey 均包含 `profileId`。
- `timeRange` 语义与当前页面一致。

验收：

- `rg "useSdd|useSkillAnalytics|useSkillTimeseries|useSddWorkItems|useSddUsers" web/src/pages/overview` 无主数据调用。
- 总览 headline、知识库/代码卡片和后续模块在 `profile_projection` 下可用。

### Task 6.2 全站 Profile Switcher 验收

当前第一期只有 `sdd-default`，但页面仍必须从 ShellContext 读取 `profileId`。

验收：

- 所有新 profile queryKey 包含 `profileId`。
- 浏览器 Network 中四大看板请求路径均带 `/api/profiles/sdd-default/*`。
- 切换 profile 后，页面不会继续展示旧 profile cache。

### Task 6.3 文档和实施报告

更新：

- `docs/tasks-profile-observability-mvp.md`：只记录本阶段完成事实，不要重写历史决策。
- `docs/implementation-report-profile-observability-mvp.md`：如果引用“未完成项”，同步标注哪些已在第二阶段-1 完成。
- 新增执行报告：`docs/tasks-profile-contract-coverage-report.md`。

执行报告必须包含：

- commit 范围。
- 变更文件摘要。
- 每个 PR 的完成项。
- 每个页面的换源证据。
- `profile:diff` 输出摘要。
- API smoke 输出摘要。
- typecheck/build/test 结果。
- 未完成项和是否影响老板演示。
- 回退方式。

## 13. API 验收清单

本阶段完成后，以下端点必须存在，并通过 contract schema parse：

```text
GET /api/profiles
GET /api/profiles/:profileId/manifest
GET /api/profiles/:profileId/overview

GET /api/profiles/:profileId/demands
GET /api/profiles/:profileId/demands/:demandId
GET /api/profiles/:profileId/demands/:demandId/artifacts/:artifactId/timeline

GET /api/profiles/:profileId/capabilities/analytics
GET /api/profiles/:profileId/capabilities/timeseries
GET /api/profiles/:profileId/capabilities/usage-summary
GET /api/profiles/:profileId/capabilities/usages

GET /api/profiles/:profileId/users
GET /api/profiles/:profileId/users/:userId
GET /api/profiles/:profileId/users/:userId/capability-usages
GET /api/profiles/:profileId/users/:userId/knowledge-recalls
GET /api/profiles/:profileId/users/:userId/artifact-writes

GET /api/profiles/:profileId/knowledge/coverage
GET /api/profiles/:profileId/knowledge/timeline
GET /api/profiles/:profileId/knowledge/list
GET /api/profiles/:profileId/knowledge/delivery-units
GET /api/profiles/:profileId/knowledge/docs
GET /api/profiles/:profileId/knowledge/doc-detail
GET /api/profiles/:profileId/knowledge/content/by-locator
GET /api/profiles/:profileId/knowledge/content/:referenceKey
```

如果执行时发现某个用户详情子端点并非当前 UI 必需，可以推迟，但必须满足：

- 对应页面没有坏链路。
- manifest 或 UI 降级明确。
- 实施报告写明为什么不影响第二阶段-1 验收。

## 14. 数据对账标准

### 14.1 强一致 gate

以下必须 0 差异：

- bridge 域 key-set：capability / deliveryUnit / artifact / artifactWrite / artifactTurn。
- capability 有旧 work item 时，新 `delivery_unit_id` 不得为空。
- knowledge pipeline scope：old `(tool_call_id, locator)` 不得在 new 缺失。
- knowledge recall 不得有 orphan `source_reference_key`。
- demand 列表核心 count 与旧工作项一致：
  - delivery unit 数
  - artifact count
  - capability usage count
  - error count
  - coverage stages

### 14.2 非对称 gate

knowledge 对账继续采用非对称门槛：

```text
old 命中 - new 必须为 0
new 命中 - old 允许非 0，但必须解释
```

原因：new 从完整 source reference 抽取，可能比旧 `tool_input_preview` 更完整。

### 14.3 可解释差异

允许但必须报告：

- seed/demo 旧数据不在 source_references pipeline scope。
- code read/write 与旧日报 code impact 口径差异。
- 无 skill usage / work item 的 source reference 无法映射 delivery unit。
- 知识库 coverage 分母依赖服务器当前快照，和历史 recall 事实不是同一时间点。

### 14.4 时间范围口径

不得无意改变现有页面口径：

- 技能分析：继续使用 Shell `timeRange`。
- 总览：继续使用 Shell `timeRange`。
- 产出分析：当前主要是累计列表；只有传入 `from` 时才按 `lastSeenAt` 过滤。
- 用户分析：当前主要是累计用户画像；状态判断仍按当前时间窗口阈值。
- 知识库 coverage：累计口径，分母取服务器当前快照；timeline/list/ranking 支持 range。

## 15. 前端验收清单

### 15.1 静态检查

完成后执行：

```bash
rg "/api/sdd" web/src/pages/overview web/src/pages/sdd/users web/src/pages/sdd/skills web/src/pages/sdd/work-items web/src/pages/sdd/wiki-recalls
rg "useSdd|useSkillAnalytics|useSkillTimeseries|useSddWorkItems|useSddUsers|useWikiRecall" web/src/pages/overview web/src/pages/sdd/users web/src/pages/sdd/skills web/src/pages/sdd/work-items web/src/pages/sdd/wiki-recalls
```

要求：

- 主数据调用不得再出现。
- 如果仍有命中，必须是历史 hook 文件自身、测试、或明确降级路径，并在实施报告解释。

### 15.2 浏览器检查

启动本地服务后访问：

```text
/overview
/sdd/users
/sdd/users/:userId
/sdd/skills
/sdd/work-items
/sdd/work-items/:demandId
/sdd/wiki-recalls
/sdd/wiki-recalls/:sourceNamespace/:domain
```

检查：

- 页面无白屏。
- KPI 不出现 `NaN`。
- 表格分页可用。
- 搜索/筛选可用。
- 下钻链接不断。
- Network 主请求为 `/api/profiles/sdd-default/*`。
- Console 无新增错误。

视觉只做回归检查，不要求 redesign。

## 16. 验证命令

### 16.1 数据链路

```bash
docker compose up -d mysql
pnpm db:migrate
pnpm db:verify
pnpm profile:rebuild-source-references
pnpm profile:rebuild -- --profile sdd-default
pnpm profile:diff -- --profile sdd-default
pnpm profile:link-check -- --profile sdd-default
```

### 16.2 类型和构建

```bash
pnpm typecheck
pnpm build
```

如改动范围较大，补充：

```bash
pnpm --filter @sdd-telemetry/worker test
```

### 16.3 API smoke

服务启动后执行最小 smoke：

```bash
curl -sS http://127.0.0.1:4318/api/ingest/health
curl -sS http://127.0.0.1:4318/api/profiles
curl -sS http://127.0.0.1:4318/api/profiles/sdd-default/overview
curl -sS http://127.0.0.1:4318/api/profiles/sdd-default/demands
curl -sS http://127.0.0.1:4318/api/profiles/sdd-default/capabilities/analytics
curl -sS http://127.0.0.1:4318/api/profiles/sdd-default/capabilities/timeseries
curl -sS http://127.0.0.1:4318/api/profiles/sdd-default/capabilities/usage-summary
curl -sS http://127.0.0.1:4318/api/profiles/sdd-default/users
curl -sS http://127.0.0.1:4318/api/profiles/sdd-default/knowledge/coverage
curl -sS http://127.0.0.1:4318/api/profiles/sdd-default/knowledge/timeline
curl -sS http://127.0.0.1:4318/api/profiles/sdd-default/knowledge/list
```

每个响应都必须是统一 `ok` 响应，且通过对应 Zod schema parse。

### 16.4 双读源 canary

分别用两个读源启动 server：

```bash
PROFILE_DASHBOARD_READ_SOURCE=legacy_sdd pnpm --filter @sdd-telemetry/server dev
PROFILE_DASHBOARD_READ_SOURCE=profile_projection pnpm --filter @sdd-telemetry/server dev
```

要求：

- legacy 模式页面可用。
- profile_projection 模式页面可用。
- profile_projection 无 current pointer 时自动回退 legacy，不白屏。
- 注入 failed run 后 current pointer 不变，页面仍读旧 completed run。

## 17. 回退机制

本阶段不删除旧表、不删除旧 API，因此回退路径必须简单：

```text
PROFILE_DASHBOARD_READ_SOURCE=legacy_sdd
```

回退后：

- `/api/profiles/:profileId/*` 仍可通过 legacy adapter 返回数据。
- 旧 `/api/sdd/*` 仍存在。
- current pointer 不需要回滚。
- failed run 不影响当前可读 run。

上线前必须在实施报告中写清：

- 当前生产 env 的 `PROFILE_DASHBOARD_READ_SOURCE` 值。
- 如何切回 `legacy_sdd`。
- 切回后哪些 profile 新能力不可见。

## 18. Definition of Done

本阶段完成必须同时满足：

1. `profile:diff -- --profile sdd-default` PASS，包含 linkage / contract gate。
2. `profile:link-check -- --profile sdd-default` PASS。
3. `pnpm typecheck` PASS。
4. `pnpm build` PASS。
5. 总览和四大看板主数据都请求 `/api/profiles/sdd-default/*`。
6. `PROFILE_DASHBOARD_READ_SOURCE=profile_projection` 下页面可完整演示。
7. `PROFILE_DASHBOARD_READ_SOURCE=legacy_sdd` 下页面仍可用。
8. 需求列表、需求详情、artifact timeline 不断链。
9. 用户列表、用户详情不白屏。
10. 技能分析 KPI、趋势、汇总、明细可用。
11. 知识库 coverage、趋势、文档列表、文档详情可用。
12. Profile Switcher 的 `profileId` 进入所有新 queryKey。
13. `packages/api/src/contracts/profile.contract.ts` 不引入新的 `Sdd*` contract 类型。
14. 实施报告写入 `docs/tasks-profile-contract-coverage-report.md`。
15. 未完成项均明确标注，并确认不影响老板演示。

## 19. 常见误区

### 19.1 只改前端 hook，不补 delivery link

如果不补 `profile_capability_usages.delivery_unit_id`，技能分析里的“覆盖需求”和产出分析里的“调用次数”会失真。必须先补链路，再换页面。

### 19.2 页面看起来换源了，但详情还读旧接口

列表换成 `/api/profiles/:profileId/demands` 后，如果详情仍调用 `/api/sdd/work-items/:id`，会出现 id 语义错配。详情和 timeline 必须一起切。

### 19.3 Contract 里继续复制 SDD 命名

字段如果继续叫 `skillUsageCount`、`workItemCount`，短期最省事，但会把 Boss A/B 又拖回 SDD 模型。页面 adapter 可以兼容旧组件，contract 不可以。

### 19.4 用 source_references.id 做公开 key

`source_references.id` 是自增代理主键，跨 rebuild 不稳定。公开 key 和下游幂等 key 必须使用 `reference_key`。

### 19.5 对账只比 count

count 相同不能证明行级映射正确。bridge 域至少要 key-set 级；knowledge 至少要 `(tool_call_id, locator)` 级；本阶段新增的页面 contract 还要做核心字段对账。

## 20. 交付给审查者的信息

执行模型完成后，把以下内容发给审查者：

- 分支名和 commit 范围。
- `git diff --stat`。
- `profile:diff` 完整输出。
- `profile:link-check` 输出。
- `pnpm typecheck` / `pnpm build` 输出摘要。
- `rg "/api/sdd"` 静态检查结果。
- 每个页面的浏览器验证结果。
- `PROFILE_DASHBOARD_READ_SOURCE=profile_projection` 的 canary 结果。
- 未完成项和原因。

审查者会重点看：

- 有没有隐藏的 `/api/sdd/*` 主数据调用。
- contract 是否真的通用。
- projection link 是否补齐。
- 对账是否可证伪。
- 回退机制是否仍然成立。
