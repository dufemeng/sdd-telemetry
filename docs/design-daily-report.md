# SDD 每日简报方案

更新时间：2026-06-01

## 1. 目标

当前 SDD 质量观测台已经能展示使用、产出、知识库召回和采集健康，但老板不会每天主动打开 dashboard。每日简报要把这些分散证据包装成一份可查阅、可追溯、可复制、可导出的管理汇报产物。

这不是普通报表页，而是 SDD 的“门面页”。它要让老板在 30 秒内看懂三件事：

1. 团队昨天有没有用 SDD。
2. SDD 是否真的推进了需求、设计、任务、评审这些工程过程。
3. 监控网站能否用数据讲清 SDD 的推广价值。

日报不直接宣称“提效百分比”。除非后续有真实工时或周期对照数据，否则只使用可被 MySQL 派生层证明的采用、链路、产出、知识召回指标。

## 2. 产品决策

### 2.1 页面形态

新增“每日简报”页面，挂在现有 dashboard 登录体系内：

```text
/reports/daily
/reports/daily/latest
/reports/daily/:date
```

侧边栏放在「看板」分组，位于「知识库分析」之后。页面默认打开最近一份已生成日报。

### 2.2 快照优先

日报不是访问时实时计算，而是每天生成一份快照并落库保存。

原因：

- 历史日报不能因为后续 reclean、语义映射调整、数据修复而漂移。
- 老板看到的内容要能追溯到当时的统计口径。
- 导出、复制、转发的内容必须和页面一致。

### 2.3 生成时间

默认每天 12:00 生成昨天的日报：

```text
统计时区：Asia/Shanghai
统计周期：昨天 00:00:00.000 到今天 00:00:00.000，左闭右开
生成时间：每天 12:00
```

12 点生成是为了给 OTel 上报和 worker 清洗留缓冲。生成前做数据健康检查，但健康检查不阻断生成，只写入日报底部提示。

### 2.4 一期边界

一期做：

- 自动生成或手动生成日报快照。
- 按日期查看历史日报。
- 复制 Markdown。
- 浏览器打印 PDF。
- HTML 页面视觉与动效定稿。
- 链接跳转到现有 dashboard 明细页。

一期不做：

- 企业微信 / 飞书自动推送。
- 服务端 PNG 截图。
- 免登录分享 token。
- 周报。
- 用 LLM 自动改写日报文案。

这些能力放到二期或周报基础设施里。

## 3. 视觉方案

### 3.1 设计来源

视觉基于 `html-anything` 的 finance-report 信息架构：

```text
/Users/loomisli/Desktop/lm/html-anything/next/src/lib/templates/skills/finance-report
```

但当前定稿不是财报模板的直接照搬，而是“深色 dashboard 应用壳 + 浅色正式报告纸”：

```text
深色 SDD 质量观测台外壳
  顶部工具栏：日期、状态、复制、导出、重新生成
  白色报告纸：日报正文
```

已确认的预览文件：

```text
docs/design-daily-report-preview-v4.html
docs/design-daily-report-preview-v4.png
docs/design-daily-report-preview-v4-full.png
```

### 3.2 静态版式

日报正文采用正式审计报告语言：

- 顶部小号 monospace 元信息。
- Serif 大标题：`SDD 团队工程效能简报`。
- 右侧 `Internal` 标签。
- 一句话摘要。
- 4 个 KPI 卡片。
- 编号章节。
- 每章双栏 A/B 信息卡。
- 蓝色判定块。
- 简洁表格和状态标签。
- 底部统计口径与内部说明。

### 3.3 动效标准

最终动效原则是“酷炫但不乱，不喧宾夺主”。

保留的动效：

| 动效 | 用途 | 约束 |
| --- | --- | --- |
| `report-enter` | 报告纸轻微落位 | 只在初次进入执行，620ms 左右 |
| `section-reveal` | 区块横向显影 | 所有主区块统一动作，860ms 左右 |
| `rule-draw` | 标题线、A/B 卡片顶线绘制 | 用于强调报告结构 |
| `bar-in` | KPI 卡片底部指标线绘制 | 只出现在 KPI 卡片 |
| 数字滚动 | KPI 数字从 0 滚到目标值 | 920ms 左右 |
| `dot-in` | 阶段圆点轻量点亮 | 只用于阶段覆盖 |

明确禁止的动效：

- 从上往下滚动的大面积渐变色块。
- 无语义的扫光。
- A/B 标记晃动、旋转、盖章。
- 表格行跳动。
- 判定块反复扫描。
- 所有区块套不同入场动画。

`prefers-reduced-motion` 必须保留，降级为瞬时显示或极短过渡。

## 4. 日报内容

### 4.1 Masthead

字段：

- 标题：`SDD 团队工程效能简报`
- 报告日期：`2026-06-01`
- 生成时间：`Generated 2026-06-02 12:00`
- 数据源：`MySQL 派生层 vs Dashboard Links`
- 内部标记：`Internal`

### 4.2 一句话摘要

示例：

```text
昨天 12 人使用 SDD，覆盖 18 个需求，生成/更新 36 篇过程文档，5 个需求已进入 3+ 阶段全链路。
```

生成规则：

- 使用真实快照数字。
- 无数据时写“昨日未观测到有效 SDD 使用数据”，不写积极结论。
- 不写“显著提效”“大幅提升”这类无法由当前数据证明的词。

### 4.3 总览 KPI

固定 4 个 KPI：

| KPI | 口径 | 来源 |
| --- | --- | --- |
| 活跃用户 | 当日 `COUNT(DISTINCT user_id)` | `sdd_skill_usages` |
| Skill 调用 | 当日 skill usage 总量 | `sdd_skill_usages` |
| 覆盖需求 | 当日 `COUNT(DISTINCT work_item_id)` | `sdd_skill_usages` |
| 文档产出 | 当日被生成或更新过的 distinct artifact 数 | `sdd_work_item_artifact_writes` |

每个 KPI 显示：

- 当前值。
- 较前日变化。
- 简短解释。
- 底部进度线，作为视觉节奏，不作为精确比例图表。

### 4.4 采用规模

目的：回答“大家有没有用”。

展示：

- 昨日活跃用户数。
- Skill 调用次数。
- 覆盖需求数。
- 较前日变化。

判定文案只做采用层面的解释，例如：

```text
昨日用户数、调用量、覆盖需求均上升，可以作为日报头部的一句话结论。但这仍是采用规模信号，不直接等价于质量提升。
```

### 4.5 SDD 链路

目的：回答“有没有进入真正的工程流程”。

阶段定义：

| 阶段 | semantic code |
| --- | --- |
| 需求撰写 | `proposal` |
| 系统设计 | `design` |
| 任务拆分 | `task` |
| 代码评审 | `review` / `codereview` |

展示：

- 各阶段覆盖需求数。
- 3+ 阶段需求数。
- 表格列出阶段、需求数、较前日、说明、状态。

`全链路需求` 一期定义为：同一个 work item 覆盖 `proposal/design/task/review` 中任意 3 个及以上阶段。

### 4.6 今日标杆

目的：给老板可转述的具体案例。

展示 3 类标杆：

1. 阶段覆盖最完整的需求。
2. Wiki 召回最充分的需求。
3. 当日从上游阶段推进到下游阶段的需求。

标杆字段：

| 字段 | 说明 |
| --- | --- |
| 需求 | `work_item_title`，为空则用 `work_item_slug` |
| 业务域 | `business_domain` |
| 阶段 | proposal / design / task / review 覆盖圆点 |
| 文档 | artifact 或 write 数 |
| 参与人 | 当日相关 user 数 |
| Wiki | 当日 recall 数 |
| 状态 | `全链路` / `知识召回` / `推进到 task` 等 |
| 链接 | `/sdd/work-items/:id` |

补齐规则：

```text
score =
  阶段覆盖数 * 100
  + 文档写入数 * 10
  + 参与人数 * 8
  + wiki 召回数 * 3
  + skill 调用数
```

当某类标杆不足时，用综合分最高的需求补齐，但不重复展示同一个 work item。

### 4.7 知识库使用

目的：回答“SDD 是否把团队知识带入设计和任务拆分”。

展示：

- Wiki 召回次数。
- 覆盖知识文档数。
- 覆盖业务域数。
- Top 业务域。

示例判定：

```text
召回不只是数量指标，它说明设计和任务拆分正在引用已有知识资产。日报里应保留这段解释，帮助老板理解 SDD 不是普通聊天工具。
```

### 4.8 统计口径

页面底部保留轻量统计口径，不放在首屏抢注意力。

字段：

- 统计时区。
- 统计时间窗。
- 数据生成时间。
- 查询口径版本。
- 模板版本。
- 数据健康提示。

## 5. 快照数据结构

服务端聚合后写入 `metrics_json`。前端只负责展示，不在页面里重新拼复杂口径。

建议结构：

```ts
type DailyReportMetrics = {
  reportDate: string;
  timezone: 'Asia/Shanghai';
  period: {
    start: string;
    end: string;
  };
  generatedAt: string;
  headline: string;
  kpis: {
    activeUsers: MetricDelta;
    skillUsages: MetricDelta;
    coveredWorkItems: MetricDelta;
    documentOutputs: MetricDelta;
    wikiRecalls: MetricDelta;
  };
  adoption: {
    activeUsers: number;
    skillUsages: number;
    coveredWorkItems: number;
    summary: string;
  };
  chain: {
    stages: Array<{
      code: 'proposal' | 'design' | 'task' | 'review';
      label: string;
      workItemCount: number;
      previousDelta: number;
      status: 'healthy' | 'growing' | 'watch';
    }>;
    multiStageWorkItemCount: number;
    fullChainWorkItemCount: number;
    summary: string;
  };
  benchmarks: Array<{
    workItemId: string;
    title: string;
    businessDomain: string | null;
    stageCodes: string[];
    documentCount: number;
    documentWriteCount: number;
    contributorCount: number;
    wikiRecallCount: number;
    label: string;
    link: string;
  }>;
  knowledge: {
    wikiRecallCount: number;
    distinctFileCount: number;
    distinctDomainCount: number;
    topDomains: Array<{ domain: string; count: number }>;
    summary: string;
  };
  links: {
    overview: string;
    workItems: string;
    wikiRecalls: string;
  };
  dataHealth: {
    outboxPendingCount: number;
    outboxFailedCount: number;
    failedBatchCount: number;
    warnings: string[];
  };
  methodology: {
    queryVersion: string;
    templateVersion: string;
    generatedBy: 'schedule' | 'manual' | 'regenerate';
  };
};

type MetricDelta = {
  current: number;
  previous: number;
  delta: number;
  deltaRate: number | null;
};
```

`metrics_json` 是事实源；`markdown_text` 是由同一份 metrics 渲染出来的传播文本。

## 6. 数据库设计

新增快照表：

```text
sdd_daily_reports
```

字段：

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `id` | BIGINT UNSIGNED | 主键 |
| `report_date` | DATE | 业务日期 |
| `timezone` | VARCHAR(64) | 默认 `Asia/Shanghai` |
| `period_start` | DATETIME(3) | 统计窗口开始，UTC 存储 |
| `period_end` | DATETIME(3) | 统计窗口结束，UTC 存储 |
| `status` | VARCHAR(32) | `generated` / `failed` / `stale` |
| `metrics_json` | JSON | 结构化日报数据 |
| `markdown_text` | MEDIUMTEXT | 可复制 Markdown |
| `html_snapshot` | MEDIUMTEXT NULL | 二期可选，用于冻结历史 HTML |
| `data_health_json` | JSON NULL | 生成时的数据健康结果 |
| `template_version` | VARCHAR(32) | 如 `daily-report-v1` |
| `query_version` | VARCHAR(32) | 如 `daily-report-query-v1` |
| `generated_at` | DATETIME(3) | 生成时间 |
| `generated_by` | VARCHAR(32) | `schedule` / `manual` / `regenerate` |
| `error_message` | TEXT NULL | 失败原因 |
| `gmt_create` | DATETIME(3) | 创建时间 |
| `gmt_modified` | DATETIME(3) | 更新时间 |

索引：

```sql
UNIQUE KEY uk_daily_report_date_timezone(report_date, timezone)
KEY idx_daily_reports_generated_at(generated_at)
KEY idx_daily_reports_status_date(status, report_date)
```

一期 `html_snapshot` 可先为空。前端根据 `metrics_json` 渲染页面；导出 HTML 二期再决定是否保存静态快照。

## 7. 聚合查询口径

### 7.1 时间窗口

所有查询统一使用：

```sql
event_time >= period_start
AND event_time < period_end
```

前日对比使用同等长度窗口：

```text
previous_start = period_start - 1 day
previous_end   = period_end - 1 day
```

### 7.2 核心 KPI

| 指标 | SQL 口径 |
| --- | --- |
| 活跃用户 | `COUNT(DISTINCT user_id)` from `sdd_skill_usages` |
| Skill 调用 | `COUNT(*)` from `sdd_skill_usages` |
| 覆盖需求 | `COUNT(DISTINCT work_item_id)` from `sdd_skill_usages` |
| 文档产出 | `COUNT(DISTINCT artifact_id)` from `sdd_work_item_artifact_writes` |
| Wiki 召回 | `COUNT(*)` from `sdd_wiki_recalls` |

一期 KPI 使用“文档产出”，也就是当日被生成或更新过的过程文档篇数。写入次数仍可用于标杆需求排序，但不放进首屏 KPI，避免“篇数”和“次数”混淆。

### 7.3 阶段覆盖

阶段覆盖优先来自 `sdd_work_item_artifacts.artifact_type`，再用 skill semantic 做补充。这样比只看调用更接近“真的产生了过程文档”。

一期阶段映射：

```text
proposal -> 需求撰写
design -> 系统设计
task -> 任务拆分
review / codereview -> 代码评审
```

### 7.4 标杆需求

每个 work item 聚合：

- 当日 usage count。
- 当日 document write count。
- 阶段覆盖数。
- contributor count。
- wiki recall count。
- 是否当天出现新阶段。

排序先按标杆类型命中，再按综合分。

### 7.5 数据健康

生成时读取：

- `ingest_outbox` pending 数。
- `ingest_outbox` failed_terminal 数。
- 昨日 failed batch 数。
- 昨日核心表是否为空。

健康检查不阻断日报生成。若异常，日报底部显示：

```text
数据提示：昨日仍有 3 个清洗任务 pending，本日报可能低估部分使用量。
```

## 8. API 设计

API contract 放在：

```text
packages/api/src/contracts/reports.contract.ts
```

并从 `packages/api/src/index.ts` 导出。

接口：

```text
GET  /api/reports/daily/latest
GET  /api/reports/daily?from=2026-05-01&to=2026-06-01&page=1&pageSize=30
GET  /api/reports/daily/:date
POST /api/reports/daily/:date/regenerate
GET  /api/reports/daily/:date/export?format=markdown
```

说明：

- `latest` 返回最近一份 `status = generated` 的日报。
- 列表接口只返回摘要，不返回完整 `metrics_json`。
- 详情接口返回完整 metrics、markdown、生成信息。
- `regenerate` 仅 `super_admin` 可用，覆盖同日快照。
- `export?format=markdown` 返回 `text/markdown; charset=utf-8`。
- HTML/PDF 导出一期由浏览器页面完成，不强行让服务端生成。

响应结构建议：

```ts
type DailyReportDetailResponse = {
  id: string;
  reportDate: string;
  timezone: string;
  periodStart: string;
  periodEnd: string;
  status: 'generated' | 'failed' | 'stale';
  metrics: DailyReportMetrics;
  markdownText: string;
  templateVersion: string;
  queryVersion: string;
  generatedAt: string;
  generatedBy: 'schedule' | 'manual' | 'regenerate';
  errorMessage: string | null;
};
```

## 9. 服务端设计

新增模块：

```text
server/src/modules/reports/
  daily-report.controller.ts
  daily-report.repository.ts
  daily-report.service.ts
  daily-report-renderer.ts
  daily-report-scheduler.ts
```

职责：

| 文件 | 职责 |
| --- | --- |
| `daily-report.repository.ts` | SQL 聚合、快照表读写、数据健康查询 |
| `daily-report.service.ts` | 日期窗口、幂等生成、标杆选择、失败状态处理 |
| `daily-report-renderer.ts` | 根据 metrics 生成 headline 和 Markdown |
| `daily-report.controller.ts` | HTTP 查询、导出、重新生成 |
| `daily-report-scheduler.ts` | 每天 12 点触发生成，带开关和幂等保护 |

注册：

- `server/src/modules/index.ts` 引入 reports 模块文件。
- `server/src/bootstrap.ts` preload reports repository/service。
- `server/src/common/auth/auth.middleware.ts` 中把 `POST /api/reports/daily/:date/regenerate` 设为 `super_admin`。

### 9.1 幂等策略

生成流程：

1. 计算 report date 和 period。
2. 聚合 metrics。
3. 渲染 Markdown。
4. `INSERT ... ON DUPLICATE KEY UPDATE` 写入 `sdd_daily_reports`。

同一天多次生成不会插入多行。手动 regenerate 会覆盖 metrics、markdown、版本号和 generated_at。

### 9.2 失败策略

如果聚合失败：

- 写入或更新同日快照为 `status = failed`。
- 保留 `error_message`。
- 不覆盖上一份 `generated` 成功快照的内容，除非同日从未成功生成。

详情页遇到 failed：

- 显示失败态。
- `super_admin` 可点击重新生成。

### 9.3 调度策略

一期推荐做成服务端内置轻量 scheduler，避免引入新依赖：

```text
DAILY_REPORT_SCHEDULE_ENABLED=true
DAILY_REPORT_SCHEDULE_TIME=12:00
DAILY_REPORT_TIMEZONE=Asia/Shanghai
```

实现方式：

- server 启动后每 60 秒检查一次当前 Asia/Shanghai 时间。
- 到 12:00 窗口时生成昨天日报。
- 使用唯一键保证多实例重复触发不会产生多行。
- 调度结果写日志。

如果后续部署是多实例或更严格生产环境，再切到 host crontab / Kubernetes CronJob 调 `POST regenerate` 或 CLI 脚本。

## 10. 前端设计

新增目录：

```text
web/src/pages/reports/daily/
  DailyReportsPage.tsx
  DailyReportDocument.tsx
  DailyReportToolbar.tsx
  DailyReportHistory.tsx
  daily-report.css
  useDailyReport.ts
  useDailyReportList.ts
```

路由：

```tsx
const DailyReportsPage = lazy(() => import('./pages/reports/daily/DailyReportsPage'));

{ path: 'reports/daily', element: wrap(DailyReportsPage), errorElement: <RouteError /> }
{ path: 'reports/daily/latest', element: wrap(DailyReportsPage), errorElement: <RouteError /> }
{ path: 'reports/daily/:date', element: wrap(DailyReportsPage), errorElement: <RouteError /> }
```

侧边栏：

```text
看板
  用户分析
  技能分析
  产出分析
  知识库分析
  每日简报
```

推荐 icon：`FileText` 或 `Newspaper`。

### 10.1 页面布局

```text
DailyReportsPage
  DailyReportToolbar
    日期选择
    查看最新
    复制 Markdown
    打印 PDF
    重新生成（super_admin）
  DailyReportHistory（窄侧栏或顶部下拉）
  DailyReportDocument
```

`DailyReportDocument` 只吃 `DailyReportMetrics`，不直接发请求。这样后续周报可以复用一部分展示组件。

### 10.2 样式隔离

报告 CSS 必须局部隔离：

```css
.daily-report-document {
  --report-paper: #fffdf8;
  --report-ink: #111827;
  --report-muted: #667085;
  ...
}
```

禁止把 report 变量写到 `:root`，避免污染现有黑底 dashboard。

### 10.3 导出与打印

一期工具栏：

- 复制 Markdown：使用后端返回的 `markdownText`。
- 打印 PDF：调用 `window.print()`，打印样式隐藏 AppShell 工具栏，只保留报告纸。
- 导出 HTML：一期可先隐藏或作为二期，不要用不稳定的 DOM outerHTML 凑功能。

### 10.4 动效实现

动效可以直接从 `docs/design-daily-report-preview-v4.html` 迁移为 scoped CSS。

注意：

- 内容默认可见，只有 `motion-ready` 后才启用显影动画。
- 不依赖 IntersectionObserver 的可见性判断作为唯一触发，避免 clip-path 导致首屏空白。
- 打印媒体查询下禁用动画。
- reduced motion 下禁用动画。

## 11. Markdown 模板

Markdown 用于老板转发和聊天窗口粘贴，结构比 HTML 更短：

```markdown
# SDD 团队工程效能简报｜2026-06-01

昨天 12 人使用 SDD，覆盖 18 个需求，生成/更新 36 篇过程文档，5 个需求已进入 3+ 阶段全链路。

## 核心数据
- 活跃用户：12 人，较前日 +3
- Skill 调用：86 次，较前日 +24.6%
- 覆盖需求：18 个，新增 4 个
- 文档产出：36 篇，proposal/design/task/review 均有新增
- Wiki 召回：42 次，覆盖 18 个文件、4 个业务域

## SDD 链路
- 需求撰写：15 个需求
- 系统设计：10 个需求
- 任务拆分：8 个需求
- 代码评审：3 个需求
- 3+ 阶段需求：5 个

## 今日标杆
1. 账户解冻组件重构：4 阶段覆盖，产出 6 篇过程文档，3 人参与
2. 交易确认页性能治理：Wiki 召回 12 次，覆盖 trade / cashier 知识
3. 财富产品卡片规范补齐：从 design 推进到 task，已沉淀实施清单

查看详情：
- 总览：http://xxx/
- 产出分析：http://xxx/sdd/work-items
- 知识库分析：http://xxx/sdd/wiki-recalls
```

Markdown 和 HTML 必须来自同一份 `metrics_json`，不允许分别查询。

## 12. 空状态与异常状态

### 12.1 没有日报

`/reports/daily/latest` 找不到任何日报时：

- viewer：显示“还没有生成日报，请联系管理员”。
- super_admin：显示“生成昨天日报”按钮。

### 12.2 当日无数据

正常生成 `status = generated`，但 metrics 全为 0。

页面文案：

```text
昨日未观测到有效 SDD 使用数据。请检查团队是否接入、OTel 上报是否正常、worker 是否完成清洗。
```

### 12.3 数据不完整

如果 outbox pending 或 failed batch 存在：

- 页面仍显示日报。
- 底部显示数据提示。
- Markdown 末尾附加“数据提示”。

### 12.4 重新生成中

一期可以用普通按钮 loading，不需要异步任务队列。生成通常是聚合查询，应在几秒内完成。

## 13. 权限与安全

权限：

| 操作 | viewer | super_admin |
| --- | --- | --- |
| 查看日报 | 是 | 是 |
| 查看历史 | 是 | 是 |
| 复制 Markdown | 是 | 是 |
| 打印 PDF | 是 | 是 |
| 重新生成 | 否 | 是 |

安全边界：

- 日报只展示聚合指标和 work item 标题，不展示 prompt、response、tool input 明文。
- 标杆需求链接进入现有登录态页面。
- 一期不做免登录分享，避免聚合数据外流。

## 14. 实施顺序

### Step 1：API contract 与数据库

- 新增 `reports.contract.ts`。
- 新增 `sdd_daily_reports` migration。
- 新增 `SddDailyReportEntity`。
- 更新 `verify-schema.ts` 和 `docs/database-model.md`。

### Step 2：服务端聚合

- 新增 reports repository/service/renderer/controller。
- 实现 `generateDailyReport(date, generatedBy)`。
- 实现 latest/list/detail/export markdown。
- 补权限：regenerate 仅 super_admin。

### Step 3：前端页面

- 新增路由和侧边栏入口。
- 从 v4 预览迁移 `DailyReportDocument` 和 scoped CSS。
- 实现 toolbar、历史列表、复制 Markdown、打印 PDF。
- 处理空状态和失败态。

### Step 4：调度

- 新增 `daily-report-scheduler.ts`。
- 增加环境变量开关。
- 12:00 自动生成昨天日报。
- 加日志和幂等保护。

### Step 5：验证与保鲜

- 更新 `docs/api-contract.md`。
- 更新 `README.md` / `CLAUDE.md` / `AGENTS.md` 中受影响的启动、环境变量、验证说明。
- 跑 typecheck/build/db verify。

## 15. 验收标准

功能验收：

- `/reports/daily/latest` 能打开最近日报。
- `/reports/daily/:date` 能打开指定日期。
- 无日报、生成失败、无数据都有明确状态。
- 复制 Markdown 后数字与页面一致。
- 打印 PDF 只包含报告纸，不包含侧边栏。
- viewer 看不到重新生成按钮，直接请求 regenerate 返回 403。
- super_admin 可重新生成指定日期日报。

数据验收：

- 同一天重复生成只保留一条快照。
- `metrics_json`、`markdown_text`、页面展示数字一致。
- 前日对比窗口正确。
- 3+ 阶段需求口径可由 work item artifacts 复核。
- 数据健康 warning 能反映 outbox 和 failed batch 状态。

视觉验收：

- 页面静态观感接近 v4 预览。
- 没有大面积扫光、随机渐变色块、卡片乱跳。
- 动效只保留统一显影、线条绘制、数字滚动和阶段圆点。
- reduced motion 下内容正常显示。
- 打印模式无动画。

验证命令：

```bash
pnpm typecheck
pnpm build
docker compose up -d mysql
pnpm db:migrate
pnpm db:verify
```

涉及调度和真实数据链路时追加：

```bash
pnpm db:seed
pnpm --filter @sdd-telemetry/worker once
curl -sS http://127.0.0.1:4318/api/reports/daily/latest
```

## 16. 二期扩展

二期再做：

- 每日 12:05 自动推送 Markdown 到企业微信 / 飞书。
- 服务端 PNG 截图路由 `/reports/daily/:date/card`。
- 只读分享 token。
- 周报复用 `sdd_daily_reports` 汇总生成。
- 模板版本管理，允许历史日报用旧模板回放。
- 对接真实需求周期数据后再计算“效果”指标，如需求推进时长、返工率、评审发现问题数。
