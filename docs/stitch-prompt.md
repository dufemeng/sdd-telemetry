# SDD 质量观测台 - Google Stitch 设计 Prompt

请为一个全新的开发者数据观测产品生成高保真前端设计稿。不要复刻旧系统界面，不要沿用旧 API 命名，不要做营销落地页。第一屏就是可用的 Dashboard 应用。

产品名称：`SDD 质量观测台`

产品定位：面向 SDD skill owner 的工程质量观测台，用于查看 SDD skill 是否被安装、是否被使用、用户在哪些需求和会话里使用、prompt / response 交互是否完整，以及采集链路和数据库数据是否健康。

语言：全站中文 UI。技术字段、API 路径、表名、eventName、semanticCode、rawSkillName、batchId、sessionId、promptId 保持英文原文。

重要边界：
- 今日 MVP 不设计“异常错误”页面。
- 今日 MVP 不设计“版本分析”页面。
- 今日 MVP 不设计 `reprocess` 操作。
- 列表页只展示 `promptPreview` / `responsePreview`，不要展示全文 prompt / response。全文查看后续再做详情页。
- 不在界面上展示“本页面来自某某 API”这类开发说明。下面的数据源只供设计对齐，不要作为 UI 文案显示。

---

## 1. 视觉方向

整体风格：深色、克制、工程化、信息密度高。参考 ClickHouse 的黑色技术产品气质，但不要做成纯黑黄单色页面。

配色：
- 页面背景：`#0A0A0A`
- 主内容背景：`#101010`
- 面板背景：`#171717`
- 悬浮 / hover：`#222222`
- 分割线：`rgba(255,255,255,0.08)`
- 主强调色：`#FAFF69`，用于当前选中、主数字、主按钮
- 成功：`#22C55E`
- 警告：`#F59E0B`
- 失败：`#EF4444`
- 信息：`#3B82F6`
- 文本：标题 `#F5F5F5`，正文 `#D4D4D4`，次要 `#A3A3A3`，弱提示 `#737373`

字体：
- UI 字体使用 Inter。
- ID、路径、表名、时间戳、代码字段使用 JetBrains Mono。
- 不使用负字距，不使用 viewport width 动态缩放字体。

形状和密度：
- 卡片圆角不超过 8px。
- 不要卡片套卡片。页面区域可以是 full-width 面板，重复列表项可以是卡片。
- 按钮和输入控件高度 32-40px。
- 表格要适合长时间排障使用，行高紧凑但可读。
- 不要大面积插画、渐变球、装饰 orb、营销式 hero。

组件倾向：
- 图标使用 lucide 风格。
- 时间范围用 segmented control。
- 状态用小 pill。
- 表格支持排序、筛选、展开。
- 长文本默认截断，hover 或点击显示 popover / drawer。

---

## 2. 信息架构

采用左侧固定导航 + 顶部工具栏 + 右侧内容区。

顶部工具栏：
- 左侧：产品名 `SDD 质量观测台`
- 中间：全局搜索，placeholder 为 `搜索 batchId / sessionId / promptId / user / skill`
- 右侧：时间范围选择器、刷新按钮、最后刷新时间

左侧导航平铺展示，不用手风琴：

```text
总览

观测
  事件分布
  Skill 分布
  Skill 概览
  用户维度
  工作项

质检
  采集健康
  批次列表
  数据质量
  交互明细

配置
  语义配置

运维
  任务队列
  数据库浏览
```

不要出现“异常错误”和“版本分析”导航项。

---

## 3. 页面清单

需要生成 12 个页面或关键状态：

1. 总览
2. 采集健康
3. 批次列表
4. 事件分布
5. 数据质量
6. Skill 分布
7. Skill 概览
8. 交互明细
9. 用户维度
10. 工作项
11. 语义配置
12. 数据库浏览

任务队列可以作为数据库浏览前的运维页面，也可以单独生成一屏。如果 Stitch 限制页面数量，优先保证：总览、Skill 概览、交互明细、数据库浏览、语义配置、采集健康。

---

## 4. 页面设计

### 4.1 总览

目标：一眼看到今天系统是否正常、SDD 是否有人在用、核心 skill 是否有数据。

布局：
- 顶部 4 个 KPI：
  - 已解析批次
  - 标准化事件
  - Skill 调用
  - 活跃用户
- 第二行两列：
  - 采集健康：parsed / processing / failed / duplicate 的小型堆叠条或环形图
  - 事件 Top 5：eventName 水平条形图
- 第三行两列：
  - Skill 语义分布：displayName + usageCount + userCount
  - 活跃用户 Top 5：userName / installId + skillUsageCount
- 底部：
  - 最近批次表：status、receivedAt、payloadBytes、rawLogCount、eventCount、lastError

数据来源说明：
- `GET /api/ingest/health`
- `GET /api/events/field-coverage`
- `GET /api/events/distribution`
- `GET /api/sdd/funnel`
- `GET /api/sdd/users`
- `GET /api/ingest/batches`

设计注意：
- 总览不要堆太多技术细节。
- 每个图都要能点击进入对应二级页面。
- 空数据时展示“暂无上报数据”，同时给出弱提示“等待 SDD skill 上报后自动展示”。

### 4.2 采集健康

目标：判断 OTel 上报链路是否正常。

模块：
- 顶部状态条：
  - `latestReceivedAt` 小于 5 分钟：正在接收
  - 5-30 分钟：可能断流
  - 空：暂无数据
- KPI：
  - parsedBatches
  - failedBatches
  - duplicateBatches
  - processingBatches
- 队列深度：
  - pendingOutbox
  - queuedJobs
  - activeJobs
  - failedJobs
- 原始数据概况：
  - totalPayloadBytes
  - totalBatches
  - latestReceivedAt
  - latestParsedAt
- 最近失败批次：
  - 用 `GET /api/ingest/batches` 获取后在前端筛选 `failed_retryable` 和 `failed_terminal`
  - 不要使用 `status=failed_*` 这种不存在的查询参数

### 4.3 批次列表

目标：查看 raw batch 的接收、解析、失败状态。

模块：
- 状态筛选 tabs：
  - 全部
  - received
  - queued
  - processing
  - parsed
  - failed_retryable
  - failed_terminal
- 批次表格：
  - status
  - id
  - receivedAt
  - payloadBytes
  - rawLogCount
  - eventCount
  - derivedCount
  - duplicateCount
  - parseDurationMs
  - lastError
- 行展开：
  - 调用 batch detail 后展示 payloadHash、rawAvailable、rawExpiresAt、lastDuplicateAt、retryCount、outbox 状态
- 分页：
  - cursor-based 加载更多

不要设计“重新处理”按钮。当前 MVP 不验收 reprocess。

### 4.4 事件分布

目标：理解采集到的 OTel 事件类型和时间趋势。

模块：
- 时间范围：6h / 24h / 72h
- KPI：
  - totalEvents
  - distinctEventNames
  - 当前窗口
  - 峰值时段，来自 timeline buckets
- 事件 Top N：
  - eventName
  - description，小字展示
  - count
  - percentage
  - latestAt
- 事件趋势：
  - `GET /api/events/timeline`
  - 按 hour bucket 绘制柱状图
- 详情表格：
  - eventName
  - description
  - count
  - percentage
  - latestAt

注意：
- `totalEvents` 和 `distinctEventNames` 是接口直接返回，不需要前端求和。
- description 是辅助排障文案，放在 eventName 下方小字。

### 4.5 数据质量

目标：让用户知道哪些字段能被清洗出来，哪些字段缺失会影响后续分析。

模块：
- KPI：
  - totalEvents
  - 字段数
  - 低覆盖字段数
  - 平均覆盖率
- 字段覆盖率表：
  - fieldPath
  - presentCount
  - coverageRate
  - examples
- 警告列表：
  - 前端根据 `coverageRate < 0.8` 生成
  - `< 0.5` 为 high
  - `0.5-0.8` 为 medium
- 事件名称快照：
  - `GET /api/events/distribution?limit=10`

注意：
- 当前 coverage 是近样本统计，不要在 UI 上表达为绝对精确的审计结论。
- 可以用“近期样本覆盖率”这样的标题降低误导。

### 4.6 Skill 分布

目标：按 SDD 语义观察 skill 调用分布。

模块：
- KPI：
  - totalInteractions
  - totalSkillUsages
  - 覆盖语义数
  - 活跃用户数
- 语义分布条形图：
  - displayName
  - semanticCode
  - usageCount
  - userCount
  - workItemCount
- 表格：
  - displayName
  - semanticCode
  - usageCount
  - userCount
  - workItemCount
  - conversionRate

注意：
- 当前 `groupBy` 虽然在 contract 中存在，但 server 还没有真正实现 user/work_item 分组。不要设计 groupBy 切换控件。
- `conversionRate` 不是严格的流程转化率，UI 文案用“调用占比/参考转化”更稳妥。

### 4.7 Skill 概览

目标：这是 MVP 重要页面。展示每个 skill 或语义的聚合使用情况。

需要后端新增聚合接口：`GET /api/sdd/usage-summary`

建议展示字段：
- semanticCode
- semanticDisplayName
- rawSkillName
- usageCount
- activeUserCount
- sessionCount
- workItemCount
- versions，展示为 pills
- firstSeenAt
- lastSeenAt

布局：
- 顶部筛选：
  - semanticCode 下拉
  - 时间范围
  - status
- 表格：
  - Skill / 语义
  - 调用次数，带水平条
  - 用户数
  - 会话数
  - 工作项数
  - 版本
  - 首次出现
  - 最近出现
- 行点击：
  - 进入交互明细页，并带上 semanticCode 或 rawSkillName 筛选

数据库影响说明：
- 不需要改数据库。
- 基于 `sdd_skill_usages` 实时聚合即可。
- 当前已有 `raw_skill_name`、`semantic_id`、`user_id`、`session_id`、`work_item_id`、`observed_version`、`service_version`、`event_time`。
- 未来数据量大后再考虑日聚合表。

### 4.8 交互明细

目标：排查某次 prompt / response 是否完整，关联到用户、session、prompt、模型和状态。

模块：
- 筛选：
  - semanticCode
  - sessionId
  - promptId
  - userId
  - status
  - 时间范围
- 表格：
  - startedAt / completedAt
  - userId
  - sessionId
  - promptId
  - commandName
  - model
  - status
  - durationMs
  - promptPreview
  - responsePreview
- 行展开：
  - 只展示当前 API 返回的 promptPreview / responsePreview
  - 明确不要设计全文 prompt / response 抽屉

注意：
- 当前 API 不返回 userName、installId、serviceVersion、pairingMethod、confidence。不要把这些作为 MVP 主字段。
- 不要设计 hasError 筛选，当前 contract 没有。

### 4.9 用户维度

目标：看谁安装了、谁在用、哪台机器最近活跃。

模块：
- KPI：
  - 用户数
  - 7 天活跃用户
  - Skill 调用总数
  - 最近活跃时间
- 用户表：
  - userName
  - installId
  - machineId
  - machineName
  - interactionCount
  - skillUsageCount
  - lastSeenAt

注意：
- 当前 API 不返回 clientName / clientVersion / osName / osVersion。不要设计客户端版本 pill。
- 异常数量今日不展示，因为异常错误页延期。

### 4.10 工作项

目标：围绕真实需求目录观察 SDD 产物是否形成。

模块：
- 工作项列表：
  - workItemTitle
  - workItemSlug
  - businessDomain
  - requirementsRepoName
  - relativeDir
  - firstSeenAt
  - lastSeenAt
- 详情 drawer：
  - artifacts 列表
  - artifactType
  - artifactRelativePath
  - systemModule
  - lastSeenAt
  - usageCount
  - errorCount

注意：
- 当前 API 不返回 artifact 的 firstSeenAt，只返回 lastSeenAt。
- 不要在 MVP 中展示“关联 Skill 使用统计表”，除非后端后续补字段。

### 4.11 语义配置

目标：让 owner 配置“语义”和“skill alias”的映射。

模块：
- 语义列表：
  - semanticCode
  - displayName
  - description
  - aliases
- 新建语义：
  - semanticCode
  - displayName
  - description
  - aliases 多行输入或 tag input

注意：
- 当前 server 只有 `GET /api/sdd/semantics` 和 `POST /api/sdd/semantics`。
- 不要设计编辑、删除、单 alias 删除。后续再补。

### 4.12 任务队列

目标：运维观察 outbox 是否积压。

模块：
- 队列 KPI：
  - pendingOutbox
  - queuedJobs
  - activeJobs
  - failedJobs
- Job 表：
  - id
  - kind
  - status
  - aggregateId
  - attempts
  - lastError
  - createdAt
  - updatedAt

注意：
- 当前没有 `GET /api/ops/jobs/:jobId`。不要设计 job 详情页。
- 可以设计行内展开 lastError，但不要求完整 payload。

### 4.13 数据库浏览

目标：完整调试台。用户认为这是基础功能。

这部分可以设计成目标态，允许后端后续增强 ops API，但不要改核心业务表。

页面结构：
- 左侧表列表：
  - tableName
  - estimatedRows
  - updatedAt
  - 按前缀分组：otel / ingest / sdd / ops
- 右侧顶部：
  - 当前表名
  - 行数估算
  - 更新时间
  - 刷新按钮
- Tabs：
  - 表结构
  - 数据

表结构 Tab：
- columnName
- dataType
- nullable
- key
- defaultValue
- extra
- estimatedMaxSize
- sizeBasis

数据 Tab：
- 筛选器构建器：
  - 字段下拉
  - 操作符：=、!=、LIKE、NOT LIKE、IN、>、>=、<、<=、IS NULL、IS NOT NULL
  - 值输入
  - 支持 AND 条件
- 表格：
  - 动态列
  - NULL 显示为 muted italic
  - LONGTEXT / JSON 截断
  - 点击单元格打开 drawer 查看完整值
- 分页：
  - limit 10 / 20 / 50 / 100
  - cursor 下一页

后端增强建议：
- `GET /api/ops/tables` 返回 table + columns metadata。
- `GET /api/ops/tables/:tableName/rows` 支持 filters、orderBy、order、limit、cursor。
- 对 tableName 和 columnName 使用白名单，避免 SQL 注入。

---

## 5. 关键交互

全局：
- 默认 30 秒自动刷新。
- 顶部可暂停自动刷新。
- 表格 loading 使用 skeleton。
- 空数据状态要安静，不用插画。
- 错误态显示失败原因和重试按钮。

筛选：
- 所有筛选器变更后即时刷新列表。
- 高成本查询可以用“应用筛选”按钮。
- ID 字段复制按钮使用 copy 图标。

表格：
- 支持列排序。
- 长 ID 中间截断，hover 显示完整值。
- 时间显示相对时间，hover 显示绝对时间。

响应式：
- 主要面向桌面端，优化 1440px 和 1280px。
- 小于 1024px 显示只读压缩布局，侧边栏折叠为图标。

---

## 6. 不要做的事情

- 不要做首页 hero。
- 不要做营销文案。
- 不要展示旧 API 路径。
- 不要展示异常错误页。
- 不要展示版本分析页。
- 不要设计 reprocess 按钮。
- 不要设计不存在的 semantic 编辑 / 删除能力。
- 不要把 prompt / response 全文放进列表。
- 不要用大面积渐变、插画、玻璃拟态。
- 不要把每个页面都做成独立大卡片套小卡片。

---

## 7. 交付要求

请生成一套高保真桌面端设计稿，至少包含：

1. 总览页
2. Skill 概览页
3. 交互明细页
4. 数据库浏览页
5. 语义配置页
6. 采集健康页

如果可以继续生成，再补：

7. 批次列表页
8. 事件分布页
9. 数据质量页
10. Skill 分布页
11. 用户维度页
12. 工作项页
13. 任务队列页

设计稿要体现这是一个真实可用的工程工具，而不是展示型概念页面。
