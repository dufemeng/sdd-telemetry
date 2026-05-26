# 设计：技能分析页老板视角重构

## 背景

`/sdd/users` 与 `/sdd/work-items` 已改为面向管理者的总览页面，而
`/sdd/skills` 仍以语义匹配率、未匹配列表和四步调用漏斗为主。后者更适合
排障场景，不能直接回答技能投入规模、关键技能和使用链路是否有效。

## 目标

- 将技能分析改为与用户分析、产出分析一致的业务总览视觉语言。
- 用现有数据回答三个问题：技能调用规模如何、哪些技能最关键、有效配对链路是否健康。
- 保留按技能下钻最近调用的能力，将技术字段收敛到详情抽屉。
- 不修改 API contract、服务端查询、路由或共享 UI 组件。

## 风险判断

- 复用：继续使用 `useSkillAnalytics`、`useSkillTimeseries`、
  `useSddUsageSummary`、`useSkillUsages`、`TrendChart`、
  `RowInspectorDrawer` 和 `Pagination`，不重复建设数据能力。
- 抽象：页面结构与另外两个总览页一致，但仅此页使用的排名卡、筛选条和表格
  保持在 `SkillsPage.tsx` 内，不引入新的跨页抽象。
- 破坏性：API 与查询参数不变；删除旧页面私有展示组件并重建同一路由内容。
- 影响：仅影响 `/sdd/skills` 的信息展示和交互，符合将工程面板转为老板总览
  的目标。

## 数据口径

| 展示内容 | 已有来源 | 说明 |
| --- | --- | --- |
| 技能调用量、活跃用户、覆盖工作项、全链路需求 | `skill-analytics.kpis` | 继续展示较上一周期变化 |
| 有效配对率、已配对数、总触发数 | `skill-analytics.callQuality` | 汇总链路结果，不展示中间排障步骤 |
| 调用量趋势 | `skill-timeseries.points` | 沿用双线趋势图 |
| 标杆技能 | `skill-analytics.topSemantics` | 取前三名 |
| 技能列表、分页、筛选、搜索 | `usage-summary` | 服务器分页 |
| 最近调用详情 | `skill-usages` | 点击行后按需加载 |

`topSemantics.conversionRate` 在服务端定义为单个语义技能
`usageCount / currentSkillUsageCount`，即当前窗口内的**调用占比**，并非质量或
工作项转化率。排名卡必须标注为“调用占比”，避免误读。

## 页面结构

### Section 1：经营指标

四张并列卡：技能调用量、活跃用户、覆盖工作项、全链路需求。技能调用量卡
增加有效配对率进度条，在首屏同时呈现规模与链路结论。

### Section 2：趋势与配对摘要

左侧保留调用量趋势图；右侧用一个结论卡替代原四级漏斗，突出有效配对率、
已配对次数和总触发次数。

### Section 3：标杆技能

以调用量排序展示 Top 3，使用与标杆成员、标杆需求一致的排名色条及角标。
卡片展示调用量、用户数、覆盖需求和调用占比。

### Section 4：技能一览与详情

- 标题栏提供技能名搜索，300ms debounce。
- 筛选仅保留“全部”和“未匹配”；分页 API 无法准确给出另一筛选项数量，
  因此 tab 不展示伪精确计数。
- 表格只展示技能名称、调用量、用户数、覆盖需求、最近调用；行左色条用绿色
  表示已匹配、红色表示未匹配。
- 点击行打开详情抽屉；抽屉中保留语义代码、原始技能名、会话数及最近调用
  标识字段，以支持追查。

## 删除与保留

删除旧页面私有文件：

- `HeroKpiRow.tsx`
- `TrendsSection.tsx`
- `StructureHealthSection.tsx`
- `DetailTableSection.tsx`
- `components/CallQualityFunnel.tsx`
- `components/DetailTableToolbar.tsx`
- `components/MatchHealthDonut.tsx`
- `components/UnmatchedTopList.tsx`
- `components/VersionMiniBar.tsx`

保留 `components/TrendChart.tsx` 与现有四个查询 hook。

## 验证

- `rg --hidden "ap""ps/(web|server|worker)|\\.\\/ap""ps/(web|server|worker)|ap""ps/" . -g '!node_modules/**' -g '!.git/**'`
- `pnpm typecheck`
- `pnpm build`
- 浏览 `/sdd/skills`，核对时间范围切换、趋势、筛选、搜索、分页和详情抽屉。
