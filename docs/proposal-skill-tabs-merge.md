# 技术提案：合并「技能分布」与「技能概览」

## 背景

当前前端侧栏「观测」分组下有两个相邻入口：

- `技能分布`：`/sdd/funnel`，渲染 `FunnelPage`，读取 `/api/sdd/funnel`。
- `技能概览`：`/sdd/summary`，渲染 `SummaryPage`，读取 `/api/sdd/usage-summary`。

两个页面共用全局时间范围 `6h / 24h / 72h`，但一个展示语义级宏观分布，另一个展示 raw skill 明细。用户从宏观判断问题后通常还要切到明细页继续查，导航和信息路径都偏割裂。

## 目标

- 新增 `/sdd/skills`，作为唯一的「技能分析」入口。
- 侧栏「观测」分组从 5 项减到 4 项：事件分布、技能分析、用户维度、工作项。
- 在同一页面完成「KPI → 趋势/漏斗 → 语义健康 → 明细下钻」路径。
- 参考 `stitch_sdd (3)` 附件的高密度暗色监控台视觉，但只参考视觉和布局，不参考静态内容。
- 严格使用现有 `tokens.css`、`web/src/components/ui/*` 和 lucide 图标，不新增 UI 库或图表库。

## 非目标

- 不做移动端适配；当前应用最小视口仍按 `body min-width: 1180px`。
- 不增加本页独立时间范围选择器，继续使用全局 TopBar。
- 不做 URL query string 持久化。
- 不做导出数据能力。
- 不做行内编辑、批量操作、自定义看板。

## 推荐方案

采用「新技能分析页 + 删除旧页面路由」方案。

- 新路由：`/sdd/skills`。
- 旧路由：删除 `/sdd/funnel` 和 `/sdd/summary`，不做 redirect；直接落到现有 `RouteError`。
- 旧 API：保留 `/api/sdd/funnel`，因为 `OverviewPage` 仍依赖它。
- 新 API：新增聚合和时序端点，扩展明细端点，避免前端为新视觉反复拼装数据。

## 页面骨架

```text
/sdd/skills
├── 6 张 KPI
│   ├── 交互总数
│   ├── 技能调用数
│   ├── 活跃用户
│   ├── 覆盖工作项
│   ├── 配对成功率
│   └── 语义匹配率
├── 调用量趋势 + 调用质量漏斗
├── 语义 TOP10 + 语义匹配健康
└── 技能 × 语义明细
    ├── keyword 搜索
    ├── 全部 / 已匹配 / 未匹配筛选
    ├── 分页
    └── 行下钻：最近 10 次 usage + 交互跳转
```

## 影响范围

前端：

- 新增 `web/src/pages/sdd/skills/`。
- 修改 `web/src/router.tsx`：新增 `sdd/skills`，移除 `sdd/funnel`、`sdd/summary`。
- 修改 `web/src/components/layout/Sidebar.tsx`：两项合一为「技能分析」，图标用 `Layers3`。
- 移动 `useSddFunnel` 到 `web/src/pages/overview/useSddFunnel.ts`，修正 `OverviewPage` import。
- 删除旧 `FunnelPage`、`SummaryPage` 组件目录。

API contract：

- 在 `packages/api/src/contracts/sdd.contract.ts` 新增：
  - `SddSkillAnalyticsQuerySchema`
  - `SddSkillAnalyticsSchema`
  - `SddSkillTimeseriesQuerySchema`
  - `SddSkillTimeseriesSchema`
- 扩展：
  - `SddUsageSummaryQuerySchema`
  - `SddUsageSummaryResponseSchema`
  - `SddListQuerySchema` 增加 `rawSkillName`，用于行下钻。

后端：

- 修改 `server/src/modules/sdd/sdd.controller.ts`：新增 `/skill-analytics`、`/skill-timeseries`。
- 修改 `server/src/modules/sdd/sdd-query.service.ts`：新增聚合/时序查询，扩展 usage summary 和 usage list 过滤。

文档：

- 更新 `docs/api-contract.md` 中相关 API。
- 旧路由若在 `README.md`、`CLAUDE.md`、`AGENTS.md` 或 `docs/` 出现，按实际变更同步。

## 风险

- 新增聚合 API 会增加 SQL 查询复杂度，需要通过索引和本地 benchmark 验证。
- 删除旧路由会破坏旧书签；这是本方案明确接受的用户影响。
- 行下钻依赖新增 `rawSkillName` 过滤；当前端点尚不支持，必须一并实现。
- 调用质量漏斗必须统一口径，避免 interaction 计数和 usage 计数混用导致百分比不可解释。

## 验收标准

- 侧栏「观测」只剩 4 项，且「技能分析」进入 `/sdd/skills`。
- 访问 `/sdd/funnel`、`/sdd/summary` 显示 `RouteError`。
- `/sdd/skills` 包含 6 张 KPI、趋势、漏斗、语义 TOP10、匹配健康、明细表。
- TopBar 切换 `6h / 24h / 72h` 后所有 section 按新时间窗刷新。
- 明细表 keyword、匹配状态筛选、分页可用。
- 点击明细行打开抽屉，显示该 `rawSkillName` 最近 10 次 usage；有 `interactionId` 时可跳转交互详情。
- `pnpm typecheck` 和 `pnpm build` 通过。
- 发布前执行旧目录扫描和文档保鲜检查。
