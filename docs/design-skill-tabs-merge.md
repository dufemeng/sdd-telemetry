# 系统设计：新「技能分析」页

## 实施前仓库事实

- 当前路由配置在 `web/src/router.tsx`，不是 `web/src/App.tsx`。
- 当前全局时间范围为 `6h / 24h / 72h`。
- 旧页面位于：
  - `web/src/pages/sdd/funnel/FunnelPage.tsx`
  - `web/src/pages/sdd/funnel/useSddFunnel.ts`
  - `web/src/pages/sdd/summary/SummaryPage.tsx`
  - `web/src/pages/sdd/summary/useSddUsageSummary.ts`
- `SddListQuerySchema` 当前不支持 `rawSkillName`，行下钻必须扩 contract 和 service。
- `sdd_skill_usages.event_time` 已有索引 `idx_sdd_skill_usages_event_time`。

## 视觉准则

参考附件 `stitch_sdd (3)` 的视觉方向：

- 高密度暗色监控台布局。
- 1px hairline border。
- 6px 面板圆角、4px 控件圆角。
- 数字使用 JetBrains Mono。
- 主强调色使用现有 `--color-primary: #faff69`。
- 只用现有 `tokens.css` 变量和局部 Tailwind class，不引入新色板。

不照搬附件里的内容和页面级控件：

- 不增加本页时间范围下拉，使用现有 TopBar。
- 不增加导出按钮。
- 不使用 Material Symbols，图标用 lucide。
- 不把静态样例数值写死进页面。

## 前端模块

```text
web/src/pages/sdd/skills/
├── SkillsPage.tsx
├── HeroKpiRow.tsx
├── TrendsSection.tsx
├── StructureHealthSection.tsx
├── DetailTableSection.tsx
├── components/
│   ├── CallQualityFunnel.tsx
│   ├── DetailTableToolbar.tsx
│   ├── MatchHealthDonut.tsx
│   ├── TrendChart.tsx
│   ├── UnmatchedTopList.tsx
│   └── VersionMiniBar.tsx
└── hooks/
    ├── useSkillAnalytics.ts
    ├── useSkillTimeseries.ts
    └── useSddUsageSummary.ts
```

职责：

- `SkillsPage` 只组合布局，从 `useShellContext()` 读取 `timeRange`。
- 每个 section 自己持有 query 状态和错误展示，互不阻塞。
- 小图表组件放在本页目录下，不提前上提到 `components/ui`。
- `StatCard` 当前只支持一个 `hint`；delta 可先通过 `hint` 呈现，不为了一个页面改共享组件。若需要更复杂样式，再局部包一层 KPI item。
- KPI 在 1180px 最小视口下不能硬性 6 列；建议 `grid-cols-3 2xl:grid-cols-6` 或等效布局。

## API contract

### `GET /api/sdd/skill-analytics`

Query：

```ts
export const SddSkillAnalyticsQuerySchema = TimeRangeQuerySchema;
```

Response：

```ts
export const SddMetricWithPreviousSchema = z.object({
  current: z.number().nullable(),
  previous: z.number().nullable(),
});

export const SddSkillAnalyticsSchema = z.object({
  kpis: z.object({
    interactionCount: SddMetricWithPreviousSchema,
    skillUsageCount: SddMetricWithPreviousSchema,
    activeUserCount: SddMetricWithPreviousSchema,
    coveredWorkItemCount: SddMetricWithPreviousSchema,
    pairingSuccessRate: SddMetricWithPreviousSchema,
    semanticMatchRate: SddMetricWithPreviousSchema,
  }),
  callQuality: z.object({
    triggeredCount: z.number(),
    withPromptCount: z.number(),
    withResponseCount: z.number(),
    pairedCount: z.number(),
    promptCoverageRate: z.number().nullable(),
    responseCoverageRate: z.number().nullable(),
    pairingSuccessRate: z.number().nullable(),
  }),
  topSemantics: z.array(z.object({
    semanticCode: z.string(),
    displayName: z.string(),
    usageCount: z.number(),
    userCount: z.number(),
    workItemCount: z.number(),
    conversionRate: z.number().nullable(),
  })).max(10),
  matchHealth: z.object({
    matchedCount: z.number(),
    unmatchedCount: z.number(),
    matchRate: z.number().nullable(),
    topUnmatched: z.array(z.object({
      rawSkillName: z.string(),
      usageCount: z.number(),
    })).max(5),
  }),
});
```

口径：

- 当前窗口：`from` 到 `to ?? now`。
- 上一周期：当前窗口前一段等长窗口。
- `semanticMatchRate` 按调用次数算：`semantic_id IS NOT NULL` 的 usage 数 / 全部 usage 数。
- 未匹配：`semantic_id IS NULL`。
- `pairingSuccessRate` 沿用现有 `/api/sdd/funnel` 口径：`1 - failed_interactions / total_interactions`。
- `callQuality` 在技能分析页按 usage 粒度计算：`triggered/withPrompt/withResponse/paired` 的分母均为当前时间窗内 skill usage。

### `GET /api/sdd/skill-timeseries`

Query：

```ts
export const SddSkillTimeseriesQuerySchema = TimeRangeQuerySchema.extend({
  bucket: z.enum(['15m', '1h', '3h']).optional(),
});
```

Response：

```ts
export const SddSkillTimeseriesSchema = z.object({
  bucket: z.enum(['15m', '1h', '3h']),
  points: z.array(z.object({
    timestamp: ISODateTimeSchema,
    triggeredCount: z.number(),
    pairedCount: z.number(),
  })),
});
```

Bucket：

- `6h`：15 分钟，24 点。
- `24h`：1 小时，24 点。
- `72h`：3 小时，24 点。
- 后端 JS 补 0，前端不处理缺桶。

### 扩展 `GET /api/sdd/usage-summary`

Query：

```ts
export const SddUsageSummaryQuerySchema = TimeRangeQuerySchema.extend({
  semanticCode: z.string().optional(),
  status: z.string().optional(),
  matched: z.enum(['all', 'matched', 'unmatched']).default('all'),
  keyword: z.string().trim().max(200).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(20),
  limit: z.coerce.number().int().min(1).max(200).optional(),
});
```

Response：

```ts
export const SddUsageSummaryResponseSchema = z.object({
  items: z.array(SddUsageSummaryItemSchema),
  total: z.number(),
  page: z.number(),
  pageSize: z.number(),
});
```

兼容：

- 若旧调用传 `limit` 但不传 `pageSize`，服务端把 `limit` 映射为 `pageSize`。
- `items` 形状不变。

### 扩展 `GET /api/sdd/usages`

在 `SddListQuerySchema` 增加：

```ts
rawSkillName: z.string().optional()
```

后端 `buildUsageWhere` 增加：

```sql
u.raw_skill_name = ?
```

该扩展用于明细表行下钻，不用于 keyword 模糊搜索。

## 后端查询设计

### `getSkillAnalytics`

建议并行查询：

- current/previous KPI 汇总。
- current call quality。
- current top semantics。
- current match health。

KPI 查询可按窗口复用 helper，避免复制 SQL。`activeUserCount` 和 `coveredWorkItemCount` 从 `sdd_skill_usages` 的 distinct user/work_item 统计，和技能分析语境一致。

### `getSkillTimeseries`

- 使用 `u.event_time` 范围过滤。
- 按 bucket 聚合 `COUNT(u.id)` 作为 `triggeredCount`。
- `pairedCount` 使用 `u.interaction_id` join `sdd_interactions` + `sdd_interaction_texts` 后，统计 prompt/response 均存在的 usage。
- SQL 返回已有 bucket，JS 生成固定 24 桶并补 0。

### `getUsageSummary`

- 在原聚合基础上增加 `matched`、`keyword`、分页。
- 需要额外 count 子查询统计 `total`。
- 版本分布只查当前页 rawSkillName，避免全量版本聚合。

## 路由和迁移

- 新增 lazy import：`SkillsPage`。
- 新增 route：`{ path: 'sdd/skills', element: wrap(SkillsPage) }`。
- 删除 route：`sdd/funnel`、`sdd/summary`。
- Sidebar 删除「技能分布」「技能概览」，新增「技能分析」。
- 移动 `useSddFunnel` 到 overview 目录，保持 `/api/sdd/funnel` hook 给 `OverviewPage` 使用。

## 验证

必须执行：

```bash
rg --hidden "ap""ps/(web|server|worker)|\\.\\/ap""ps/(web|server|worker)|ap""ps/" . -g '!node_modules/**' -g '!.git/**'
pnpm typecheck
pnpm build
```

本地手工验收：

- `/sdd/skills` 页面渲染完整。
- `/sdd/funnel` 和 `/sdd/summary` 进入 `RouteError`。
- TopBar 时间切换刷新所有 section。
- 明细表搜索、筛选、分页生效。
- 行点击打开抽屉，并按 rawSkillName 加载最近 10 条 usage。
- 浏览器 console 无错误。

若改动影响运行链路，再执行 AGENTS 中的 MySQL/Redis/worker/health 冒烟流程。
