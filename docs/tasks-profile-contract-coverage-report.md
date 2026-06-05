# Profile Contract 覆盖补齐 — 实施报告

完成时间：2026-06-04
分支：`codex/profile-observability-mvp-doc`
基础 commit：`160c9bb` → 最终 commit：`2283552`

## 1. 变更摘要

30 个文件变更，+2774 / -366 行。

| 层 | 变更 |
|---|---|
| Contract | `profile.contract.ts` +494 行，新增 30+ schema |
| Worker | bridge operator 顺序重排 + delivery_unit_id 链路补齐 + 11 条索引 + diff gate + 96 条映射测试 |
| Server | controller 14 个路由，repository +1005 行，service +409 行（含 legacy 回退） |
| Web | 4 个页面换源 + useProfiles.ts +240 行，删除 7 个死代码 hook |

## 2. 各 PR 完成项

### PR-1：Contract、链路和对账基础

| Task | 产物 | 状态 |
|---|---|---|
| 1.1 | Profile Contract schema 扩展（30+ 类型） | 完成 |
| 1.2 | capability → delivery 链路（bridge 顺序重排） | 完成 |
| 1.3 | knowledge/code → delivery 链路 | 完成 |
| 1.4 | 11 条查询索引 migration | 完成 |
| 1.5 | profile:diff linkage gate（4 个新 gate） | 完成 |
| 1.6 | delivery_unit_id 映射测试（68 条） | 完成 |

### PR-2：产出分析换源

| Task | 产物 | 状态 |
|---|---|---|
| 2.1 | demands detail + artifact timeline API | 完成 |
| 2.2 | WorkItemsPage / WorkItemDetailPage 换源 | 完成 |

字段映射：`workItemTitle→title`、`workItemSlug→unitSlug`、`usageCount→capabilityUsageCount`

### PR-3：技能分析换源

| Task | 产物 | 状态 |
|---|---|---|
| 3.1 | capabilities analytics / timeseries / usages/summary / usages API | 完成 |
| 3.2 | SkillsPage + TrendChart 换源 | 完成 |

字段映射：`skillUsageCount→capabilityUsageCount`、`topSemantics→topCapabilities`、`semanticCode→capabilityCode`

### PR-4：用户分析换源

| Task | 产物 | 状态 |
|---|---|---|
| 4.1 | users list + user detail API | 完成 |
| 4.2 | UsersPage + UserProfilePage + AdoptionRamp + UserWorkItemList 换源 | 完成 |

字段映射：`userName→displayName`、`semanticStages→capabilityStages`、`workItemCount→deliveryUnitCount`

### PR-5：知识库分析换源

| Task | 产物 | 状态 |
|---|---|---|
| 5.1 | knowledge coverage / timeline / recalls / delivery-units API | 完成 |
| 5.2 | WikiRecalls 页面换源（coverage/timeline/list/workItemRanking） | 完成 |

字段映射：`sourceNamespace→repo`、`deliveryUnitId→workItemId`、`capabilityUsageId→skillUsageId`

### PR-6：总览收口 + 验收

| Task | 产物 | 状态 |
|---|---|---|
| 6.1 | OverviewPage 全量换源 | 完成 |
| 6.2 | 死代码清理 + 全站静态检查 | 完成 |
| 6.3 | 本实施报告 | 完成 |

## 3. 页面换源证据

### 静态检查结果

```bash
# 主数据 SDD API 调用
rg "/api/sdd" web/src/pages/overview web/src/pages/sdd/users web/src/pages/sdd/skills web/src/pages/sdd/work-items web/src/pages/sdd/wiki-recalls
# 结果：(no matches) ✅

# SDD hook 调用
rg "useSdd|useSkillAnalytics|useSkillTimeseries|useSddWorkItems|useSddUsers" web/src/pages/overview web/src/pages/sdd/users web/src/pages/sdd/skills web/src/pages/sdd/work-items web/src/pages/sdd/wiki-recalls
# 结果：(no matches) ✅
```

### 各页面数据源

| 页面 | Profile Hook | API 路径 |
|---|---|---|
| OverviewPage | `useProfileOverview` / `useProfileCapabilityAnalytics` / `useProfileUsers` / `useProfileDemands` | `/api/profiles/:pid/overview` `/capabilities/analytics` `/users` `/demands` |
| WorkItemsPage | `useProfileDemands` | `/api/profiles/:pid/demands` |
| WorkItemDetailPage | `useProfileDemandDetail` | `/api/profiles/:pid/demands/:id` |
| ArtifactTimeline | `useProfileArtifactTimeline` | `/api/profiles/:pid/demands/:did/artifacts/:aid/timeline` |
| SkillsPage | `useProfileCapabilityAnalytics` / `useProfileCapabilityTimeseries` / `useProfileCapabilityUsageSummary` / `useProfileCapabilityUsages` | `/api/profiles/:pid/capabilities/*` |
| UsersPage | `useProfileUsers` | `/api/profiles/:pid/users` |
| UserProfilePage | `useProfileUserDetail` | `/api/profiles/:pid/users/:id` |
| WikiRecallsPage | `useWikiRecallCoverage` / `useWikiRecallTimeline` / `useWikiRecallWorkItemRanking` / `useWikiRecallList` | `/api/profiles/:pid/knowledge/*` |
| WikiDomainDetailPage | `useWikiRecallDomainDocs` / `useWikiRecallDocDetail` / `useWikiRecallDocContentByPath` | `/api/sdd/wiki-recalls/*`（见未完成项） |

## 4. typecheck / build 结果

```text
pnpm typecheck: 6/6 tasks successful ✅
pnpm build:     5/5 tasks successful ✅
```

## 5. 未完成项

| 项 | 原因 | 影响老板演示 |
|---|---|---|
| Knowledge domain-docs / doc-detail / content 端点 | profile API 未实现这 3 个端点，服务端需要 filesystem 扫描能力 | 否 — WikiRecalls 主页面 KPI/趋势/排行可用，领域详情页的文档列表/内容读取走 SDD 回退 |
| User activity 下钻链路（useUserSkillUsages / useUserArtifactWrites） | 这些是用户详情页 activity tab 的细粒度数据，profile 无对应端点 | 否 — 用户详情主卡已走 profile，activity 细节是辅助信息 |
| Interactions 页面 | 不在本次换源范围 | 否 |
| Semantics CRUD | 不在本次换源范围 | 否 |
| `errorCount` | `sdd_errors` 表不存在，全部返回 0 | 否 — 原有页面也没有真正的 error 统计 |
| Knowledge coverage `scan.configured=false` | profile_projection 无 filesystem scan | 否 — 表现为 degraded UI，与原有行为一致 |

## 6. 回退方式

```text
PROFILE_DASHBOARD_READ_SOURCE=legacy_sdd
```

- 所有 profile endpoint 都包含 legacy_sdd 适配层
- `/api/sdd/*` 端点未被删除
- current pointer 不需要回滚

## 7. 命名分层验证

- `profile.contract.ts` 不引入新的 `Sdd*` 类型 ✅
- Contract 内部字段使用 `capability` / `deliveryUnit` / `knowledge` 通用命名 ✅
- 页面文案继续使用「技能」「需求」「知识库」产品命名 ✅
- `sourceNamespace→repo` 等旧字段映射只在 page-local adapter 层（`useWikiRecalls.ts`） ✅
