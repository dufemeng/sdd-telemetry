# 每日简报页 `/reports/daily/:date` 权威事实文档

> 本文档对应路由 `http://localhost:5173/reports/daily/2026-05-31`（举例日期 `2026-05-31`）。
> 它是该页所有字段语义、清洗链路、底层数据库表、可直接复制的校验 SQL 的**唯一权威来源**。
> 代码入口：
> - 前端：`web/src/pages/reports/daily/DailyReportsPage.tsx`、`DailyReportDocument.tsx`
> - 服务端生成：`server/src/modules/reports/daily-report.service.ts`、`daily-report.repository.ts`
> - Contract：`packages/api/src/contracts/reports.contract.ts`

## 0. 整体链路一句话

```
Claude Code → /api/ingest/otlp-logs → otel_raw_payloads → worker 清洗 → 派生层（sdd_*）
                                                                       ↓
                                          DailyReportService.generateDailyReport(date)
                                                                       ↓
                                                       sdd_daily_reports.metrics_json
                                                                       ↓
                                                          /api/reports/daily/:date
```

页面读的是 `sdd_daily_reports.metrics_json`，**不是**实时算的。重新生成入口：`POST /api/reports/daily/:date/regenerate`（会按当前派生层重跑）。

## 1. 时间口径（必须先理解）

| 概念 | 值（以 2026-05-31 为例） |
| --- | --- |
| 时区 | 固定 `Asia/Shanghai` |
| 当期窗口 `[periodStart, periodEnd)` | `2026-05-31T00:00:00.000+08:00` ~ `2026-06-01T00:00:00.000+08:00` |
| 前日窗口（用于 delta） | `2026-05-30T00:00:00.000+08:00` ~ `2026-05-31T00:00:00.000+08:00` |
| 比较 | 当期 vs 前日，**没有** week-over-week |
| `delta` | `current - previous` |
| `deltaRate` | `previous > 0 ? (current-previous)/previous : null` |

所有度量都使用表的 `event_time` 列做时间过滤：`event_time >= periodStart AND event_time < periodEnd`（左闭右开）。

> 服务端实现：`server/src/modules/reports/daily-report.service.ts:229` `computePeriods()`。

## 2. 涉及的数据库表

| 表 | 角色 | 关键字段 |
| --- | --- | --- |
| `sdd_skill_usages` | 一次 SDD skill 调用 | `id, user_id, work_item_id, raw_skill_name, event_time, status` |
| `sdd_work_items` | 需求维度 | `id, work_item_slug, business_domain` |
| `sdd_work_item_artifacts` | 需求下的过程文档 | `id, work_item_id, artifact_type, artifact_relative_path` |
| `sdd_work_item_artifact_writes` | 每次文档写入事件 | `id, artifact_id, work_item_id, event_time` |
| `sdd_wiki_recalls` | Wiki 知识召回事件 | `id, skill_usage_id, work_item_id, wiki_relative_path, wiki_domain, event_time` |
| `sdd_interaction_tool_calls` | 会话内工具调用，用于代码落地统计 | `interaction_id, skill_usage_id, tool_name, tool_input_preview` |
| `sdd_daily_reports` | 日报成品（页面直接读这张表） | `id, report_date, status, metrics_json, markdown_text, generated_at, generated_by, error_message` |
| `ingest_outbox` | 清洗 outbox | `status ∈ {pending, failed_terminal, ...}` |
| `otel_ingest_batches` | OTel 上报批次 | `status, received_at` |

## 3. 页面字段逐项语义 + 校验 SQL

> 校验时把 `@date_start` / `@date_end` / `@prev_start` / `@prev_end` 替换为 1 节里给出的 ISO 字符串，或在 MySQL 里直接用本地时区字符串（`'2026-05-31 00:00:00'`），但要确保 `event_time` 列存储是 UTC（看部署配置，下文 SQL 一律用 ISO 安全）。

### 3.1 顶部头部
- **`reportDate`**：URL 里的日期，来自 `sdd_daily_reports.report_date`。
- **`generatedAt`**：`sdd_daily_reports.generated_at`，ISO 字符串。
- **`headline`**：服务端在生成时根据各 KPI 用 `renderHeadline(metrics)` 模板拼出，**不是 SQL 算出来**。
- **`timezone`**：固定 `Asia/Shanghai`。

校验日报是否存在/状态：

```sql
SELECT id, report_date, status, generated_at, generated_by,
       error_message, template_version, query_version
FROM sdd_daily_reports
WHERE report_date = '2026-05-31';
```

### 3.2 总览 KPI（4 张大卡片）

每个 KPI 在 `metrics.kpis.*` 下都是 `{ current, previous, delta, deltaRate }`。

#### a) 活跃用户 `kpis.activeUsers.current`

- 语义：**当期**触发过任意 SDD skill 的**不同用户数**。
- 来源表：`sdd_skill_usages`
- 校验 SQL（当期）：

```sql
SELECT COUNT(DISTINCT user_id) AS active_users
FROM sdd_skill_usages
WHERE event_time >= '2026-05-31T00:00:00.000+08:00'
  AND event_time <  '2026-06-01T00:00:00.000+08:00';
```

前日把窗口换成 `2026-05-30T00:00:00.000+08:00` ~ `2026-05-31T00:00:00.000+08:00`。

#### b) Skill 调用 `kpis.skillUsages.current`

- 语义：当期 `sdd_skill_usages` 的**总行数**（每次调用一行，不去重）。
- 校验 SQL：

```sql
SELECT COUNT(*) AS skill_usages
FROM sdd_skill_usages
WHERE event_time >= '2026-05-31T00:00:00.000+08:00'
  AND event_time <  '2026-06-01T00:00:00.000+08:00';
```

#### c) 覆盖需求 `kpis.coveredWorkItems.current`

- 语义：当期被 skill 调用关联到的**不同 work_item_id 数**。
- 注意：`work_item_id IS NULL` 的调用不计入。
- 校验 SQL：

```sql
SELECT COUNT(DISTINCT work_item_id) AS covered_work_items
FROM sdd_skill_usages
WHERE event_time >= '2026-05-31T00:00:00.000+08:00'
  AND event_time <  '2026-06-01T00:00:00.000+08:00';
```

#### d) 文档产出 `kpis.documentOutputs.current`

- 语义：当期被写入过的**不同 artifact 数**（一篇文档即使被写多次也只算 1）。
- 来源表：`sdd_work_item_artifact_writes`
- 校验 SQL：

```sql
SELECT COUNT(DISTINCT artifact_id) AS document_outputs
FROM sdd_work_item_artifact_writes
WHERE event_time >= '2026-05-31T00:00:00.000+08:00'
  AND event_time <  '2026-06-01T00:00:00.000+08:00';
```

> 5 个 KPI 里还有第 5 个 `kpis.wikiRecalls`，UI 没显示在顶部 4 卡里，但在 `knowledge` 区块用到，见 3.5。

### 3.3 §1 采用规模 `metrics.adoption`

| 字段 | 语义 | 同 KPI |
| --- | --- | --- |
| `adoption.activeUsers` | 当期活跃用户数 | = `kpis.activeUsers.current` |
| `adoption.skillUsages` | 当期 skill 调用次数 | = `kpis.skillUsages.current` |
| `adoption.coveredWorkItems` | 当期覆盖需求数 | = `kpis.coveredWorkItems.current` |
| `adoption.summary` | 模板拼出的中文一句话判定 | 服务端 `buildAdoptionSummary()`，非 SQL |

校验：同 3.2 a/b/c，复用同一份 SQL。

### 3.4 §2 SDD 链路 `metrics.chain`

#### a) `chain.stages[*]`：四阶段每阶段覆盖的需求数

四个固定顺序：`proposal → design → task → review`。

- 语义：在当期**有 skill 活动**的需求里，每个需求**累计**（不限当期）产出了多少阶段的过程文档；统计某阶段覆盖需求数 = 「当期活跃需求 ∩ 该阶段 artifact 已落盘的需求」。
- artifact_type 映射：
  - `proposal` → `proposal`
  - `design` → `design`
  - `task` → `task`（注意：派生层 artifact_type 用单数 `task`，与 `tasks` 表写法规约的差异以迁移文件为准）
  - `codereview` → 归并到 `review`
  - 其余（如 `prd`, `test_case`, `other`）**不进**链路统计
- 校验 SQL（与服务端 `countStageCoverage` 完全一致）：

```sql
SELECT
  CASE WHEN a.artifact_type = 'codereview' THEN 'review' ELSE a.artifact_type END AS stage,
  COUNT(DISTINCT a.work_item_id) AS work_item_count
FROM sdd_work_item_artifacts a
WHERE a.artifact_type IN ('proposal','design','task','review','codereview')
  AND a.work_item_id IN (
    SELECT DISTINCT su.work_item_id
    FROM sdd_skill_usages su
    WHERE su.event_time >= '2026-05-31T00:00:00.000+08:00'
      AND su.event_time <  '2026-06-01T00:00:00.000+08:00'
  )
GROUP BY stage;
```

`previousDelta` 字段 = 当期数 − 同口径前日数。前日口径跑一次上面 SQL 把窗口换成前日即可。

每行的 `status` 字段判定：
- `cnt == 0` → `watch`
- `delta > 0` → `growing`
- 否则 → `healthy`

#### b) `chain.fullChainWorkItemCount`

- 语义：当期有 skill 活动的需求里，**累计**已覆盖 ≥3 个不同 stage 的需求数。
- 校验 SQL（与服务端 `countFullChainWorkItems` 一致）：

```sql
SELECT COUNT(*) AS full_chain_count FROM (
  SELECT su.work_item_id
  FROM sdd_skill_usages su
  WHERE su.event_time >= '2026-05-31T00:00:00.000+08:00'
    AND su.event_time <  '2026-06-01T00:00:00.000+08:00'
  GROUP BY su.work_item_id
  HAVING (
    SELECT COUNT(DISTINCT
      CASE WHEN a.artifact_type = 'codereview' THEN 'review' ELSE a.artifact_type END
    )
    FROM sdd_work_item_artifacts a
    WHERE a.work_item_id = su.work_item_id
  ) >= 3
) sub;
```

#### c) `chain.multiStageWorkItemCount`

- 语义：同上，门槛降到 ≥2 个 stage。
- 校验 SQL：把上一段 `>= 3` 改成 `>= 2` 即可。

#### d) `chain.summary`

模板拼出的中文一句话，**非 SQL**。规则（`buildChainSummary`）：
- 若四阶段都为 0：`昨日未观测到链路覆盖。`
- 否则列出有数据的阶段 + 必要时附 `其中 N 个需求进入 3+ 阶段全链路。`

### 3.5 §3 今日标杆 `metrics.benchmarks`

- 列表上限 5 条，按 `document_count DESC, usage_count DESC` 排序。
- 候选集：当期在 `sdd_skill_usages` 里有活动的工作项（即 `EXISTS` 当期 su）。
- **每个字段都是子查询在 `sdd_work_items` 行上展开**，所有阶段/文档/写入/参与人/Wiki 召回都不限定当期时间窗口（只有写入数、参与人数、Wiki 召回数、usage 数四项才限制当期）。

| 输出字段 | 来源 | 时间窗口 |
| --- | --- | --- |
| `workItemId` / `title` / `businessDomain` | `sdd_work_items.id / work_item_title / business_domain`（title 为空则取 `work_item_slug`） | 不限 |
| `stageCodes` | `sdd_work_item_artifacts.artifact_type` 去重（`codereview` → `review`） | 不限 |
| `documentCount` | `COUNT(DISTINCT sdd_work_item_artifacts.id)` | 不限 |
| `documentWriteCount` | `COUNT(DISTINCT sdd_work_item_artifact_writes.id)` | **当期** |
| `contributorCount` | `COUNT(DISTINCT sdd_skill_usages.user_id)` | **当期** |
| `wikiRecallCount` | `COUNT(sdd_wiki_recalls)`（按 `COALESCE(wr.work_item_id, su2.work_item_id) = wi.id` 关联） | **当期** |
| `usage_count`（仅排序用） | `COUNT(sdd_skill_usages)` | **当期** |

校验 SQL（与服务端 `listBenchmarks` 一致，limit 5）：

```sql
SELECT
  wi.id                                                            AS work_item_id,
  wi.work_item_title,
  wi.work_item_slug,
  wi.business_domain,
  (SELECT GROUP_CONCAT(DISTINCT a.artifact_type)
     FROM sdd_work_item_artifacts a WHERE a.work_item_id = wi.id)  AS stage_codes_csv,
  (SELECT COUNT(DISTINCT a.id)
     FROM sdd_work_item_artifacts a WHERE a.work_item_id = wi.id)  AS document_count,
  (SELECT COUNT(DISTINCT w.id)
     FROM sdd_work_item_artifact_writes w
    WHERE w.work_item_id = wi.id
      AND w.event_time >= '2026-05-31T00:00:00.000+08:00'
      AND w.event_time <  '2026-06-01T00:00:00.000+08:00')         AS write_count,
  (SELECT COUNT(DISTINCT su.user_id)
     FROM sdd_skill_usages su
    WHERE su.work_item_id = wi.id
      AND su.event_time >= '2026-05-31T00:00:00.000+08:00'
      AND su.event_time <  '2026-06-01T00:00:00.000+08:00')         AS contributor_count,
  (SELECT COUNT(*)
     FROM sdd_wiki_recalls wr
     LEFT JOIN sdd_skill_usages su2 ON su2.id = wr.skill_usage_id
    WHERE COALESCE(wr.work_item_id, su2.work_item_id) = wi.id
      AND wr.event_time >= '2026-05-31T00:00:00.000+08:00'
      AND wr.event_time <  '2026-06-01T00:00:00.000+08:00')         AS wiki_recall_count,
  (SELECT COUNT(*)
     FROM sdd_skill_usages su3
    WHERE su3.work_item_id = wi.id
      AND su3.event_time >= '2026-05-31T00:00:00.000+08:00'
      AND su3.event_time <  '2026-06-01T00:00:00.000+08:00')         AS usage_count
FROM sdd_work_items wi
WHERE EXISTS (
  SELECT 1 FROM sdd_skill_usages su
  WHERE su.work_item_id = wi.id
    AND su.event_time >= '2026-05-31T00:00:00.000+08:00'
    AND su.event_time <  '2026-06-01T00:00:00.000+08:00'
)
ORDER BY document_count DESC, usage_count DESC
LIMIT 5;
```

> 注意 `stageCodes` 经服务端再次 `STAGE_MAP` 归一（`codereview` → `review`），所以页面 dots 只有 4 格。

### 3.6 §4 代码落地 `metrics.codeImpact`

代码落地统计不依赖新派生表，直接读取 `sdd_interaction_tool_calls`，但只纳入满足以下条件的工具调用：

- 工具所在 interaction 存在 SDD skill usage，或 tool call 已挂 `skill_usage_id`
- 工具名属于 `Write/Edit/MultiEdit/Read/Grep/Glob`
- `tool_input_preview` 可解析出 `file_path` / `path`
- 路径不在当前用户的 `requirements_root_path` / `wiki_root_path` 下，也不命中 `bk-fe-requirements-*`、`bk-fe-knowledge-*`、`bksdd-wiki`

| 字段 | 语义 |
| --- | --- |
| `codeWriteCount` | 当期 SDD 相关会话里的业务代码写入工具调用数，含 `Write/Edit/MultiEdit` |
| `codeReadCount` | 当期 SDD 相关会话里的业务代码读取/检索工具调用数，含 `Read/Grep/Glob` |
| `touchedFileCount` | 当期涉及的不同代码文件数；目录级 `path` 不计入文件数 |
| `contributorCount` | 当期参与业务代码读写的不同用户数 |
| `topRepositories[]` | 按写入数、读取数排序的 Top 5 代码仓库，仓库名从路径推断 |
| `summary` | 模板拼出的中文一句话 |

候选工具调用校验 SQL：

```sql
SELECT i.started_at, tc.tool_name, u.user_name,
       u.requirements_root_path, u.wiki_root_path,
       LEFT(tc.tool_input_preview, 300) AS preview
FROM sdd_interaction_tool_calls tc
JOIN sdd_interactions i ON i.id = tc.interaction_id
LEFT JOIN sdd_users u ON u.id = i.user_id
WHERE i.started_at >= '2026-05-31T00:00:00.000+08:00'
  AND i.started_at <  '2026-06-01T00:00:00.000+08:00'
  AND tc.tool_name IN ('Write','Edit','MultiEdit','Read','Grep','Glob')
  AND (
    tc.skill_usage_id IS NOT NULL
    OR EXISTS (
      SELECT 1 FROM sdd_skill_usages su
      WHERE su.interaction_id = i.id
      LIMIT 1
    )
  )
ORDER BY i.started_at DESC
LIMIT 50;
```

### 3.7 §5 知识库使用 `metrics.knowledge`

| 字段 | 语义 | 校验 SQL |
| --- | --- | --- |
| `wikiRecallCount` | 当期 `sdd_wiki_recalls` 总行数 | `SELECT COUNT(*) FROM sdd_wiki_recalls WHERE event_time >= '2026-05-31T00:00:00.000+08:00' AND event_time < '2026-06-01T00:00:00.000+08:00';` |
| `distinctFileCount` | 当期不同 `wiki_relative_path` 数（NULL 不计） | `SELECT COUNT(DISTINCT wiki_relative_path) FROM sdd_wiki_recalls WHERE event_time >= '...' AND event_time < '...' AND wiki_relative_path IS NOT NULL;` |
| `distinctDomainCount` | 当期不同 `wiki_domain` 数（NULL 不计） | `SELECT COUNT(DISTINCT wiki_domain) FROM sdd_wiki_recalls WHERE event_time >= '...' AND event_time < '...' AND wiki_domain IS NOT NULL;` |
| `topDomains[]` | Top 5 业务域（按召回次数倒序） | 见下 |
| `summary` | 模板拼出的中文一句话 | 非SQL |

`topDomains` 校验 SQL（limit 5）：

```sql
SELECT wiki_domain AS domain, COUNT(*) AS count
FROM sdd_wiki_recalls
WHERE event_time >= '2026-05-31T00:00:00.000+08:00'
  AND event_time <  '2026-06-01T00:00:00.000+08:00'
  AND wiki_domain IS NOT NULL
GROUP BY wiki_domain
ORDER BY count DESC
LIMIT 5;
```

### 3.8 数据提示 `metrics.dataHealth`

页面只在 `warnings.length > 0` 时显示。三个底层计数：

| 字段 | 语义 | 校验 SQL |
| --- | --- | --- |
| `outboxPendingCount` | `ingest_outbox` 中 `status='pending'` 的任务数（**全表**，不限时间） | `SELECT COUNT(*) FROM ingest_outbox WHERE status = 'pending';` |
| `outboxFailedCount` | `ingest_outbox` 中终态失败任务数（**全表**） | `SELECT COUNT(*) FROM ingest_outbox WHERE status = 'failed_terminal';` |
| `failedBatchCount` | 当期 `otel_ingest_batches` 里终态失败的批次数 | `SELECT COUNT(*) FROM otel_ingest_batches WHERE status = 'failed_terminal' AND received_at >= '2026-05-31T00:00:00.000+08:00' AND received_at < '2026-06-01T00:00:00.000+08:00';` |

`warnings[]` 是模板拼的中文短句，规则：
- `outboxPending > 0` → `数据提示：当前仍有 N 个清洗任务 pending，本日报可能低估部分使用量。`
- `outboxFailed > 0` → `数据提示：当前有 N 个终态失败的清洗任务，部分数据可能缺失。`
- `failedBatch > 0` → `数据提示：昨日有 N 个采集批次失败。`

### 3.9 页脚 `methodology`

| 字段 | 取值 |
| --- | --- |
| `queryVersion` | 写死 `daily-report-query-v2`（`DailyReportService.QUERY_VERSION`） |
| `templateVersion` | 写死 `daily-report-v2`（`DailyReportService.TEMPLATE_VERSION`） |
| `generatedBy` | `schedule` / `manual` / `regenerate` 三选一，来自最后一次生成 |

### 3.10 链接 `metrics.links`

- `overview`：`dailyReport.baseUrl`（配置项）
- `workItems`：`{baseUrl}/sdd/work-items`
- `wikiRecalls`：`{baseUrl}/sdd/wiki-recalls`

页面上没有直接渲染 links 区块，是给 PDF / markdown 导出用的。

## 4. 数据是怎么"洗出来"的

日报字段全部来自**派生层** `sdd_*`，不是直接读 OTel 原始日志。清洗链路：

1. **接入**：Claude Code 客户端 OTel logs → `POST /api/ingest/otlp-logs` → 入 `otel_raw_payloads`（7 天）+ `otel_log_events`（30 天），同时往 `ingest_outbox` 里写一条 `pending` 任务。
2. **清洗（worker）**：`@sdd-telemetry/worker` 消费 outbox：
   - 解析每条 OTel log event → 识别 SDD skill 调用 → upsert `sdd_skill_usages`
   - 解析 `tool_input` 写文件路径 → 推断 `requirements_root_path` → upsert `sdd_work_items` + `sdd_work_item_artifacts` + `sdd_work_item_artifact_writes`
   - 解析 wiki tool 调用 → upsert `sdd_wiki_recalls`
   - 把 outbox 行置 `completed` 或 `failed_terminal`
3. **日报生成**：`DailyReportService.generateDailyReport(date, generatedBy)`：
   - 计算 periodStart/End + previousStart/End（Asia/Shanghai 左闭右开 24h）
   - 并发跑 §3 中所有 SQL（共 22 个 metric 查询），组装成 `DailyReportMetrics`
   - 渲染 `headline` 与 markdown（`daily-report-renderer.ts`）
   - `upsert sdd_daily_reports`：`report_date + timezone` 唯一键覆盖
4. **页面读取**：前端走 `GET /api/reports/daily/:date` → 直接 `SELECT * FROM sdd_daily_reports WHERE report_date = ?` → 返回 `metrics_json` 反序列化结果。

所以**校验顺序**：
1. 先确认 `sdd_daily_reports` 里 `2026-05-31` 那行 `status='generated'` 且 `generated_at` 是预期的；
2. 再用 §3 各 SQL 直接打派生层对比 `metrics_json` 里的数字；
3. 如果对不上，先看 `ingest_outbox` 里有没有 `pending` / `failed_terminal`，再看 `otel_ingest_batches` 当期有没有失败批次——日报里的 `dataHealth.warnings` 已经在做这件事。

## 5. 常见校验任务一览（复制即用）

### 5.1 一键看一份日报的整体状态

```sql
SELECT report_date, status, generated_at, generated_by, template_version, query_version, error_message
FROM sdd_daily_reports
WHERE report_date = '2026-05-31';
```

### 5.2 取出当日报的 metrics JSON 直接对照

```sql
SELECT JSON_EXTRACT(metrics_json, '$.kpis')               AS kpis,
       JSON_EXTRACT(metrics_json, '$.adoption')           AS adoption,
       JSON_EXTRACT(metrics_json, '$.chain')              AS chain,
       JSON_EXTRACT(metrics_json, '$.knowledge')          AS knowledge,
       JSON_EXTRACT(metrics_json, '$.dataHealth')         AS data_health,
       JSON_EXTRACT(metrics_json, '$.benchmarks')         AS benchmarks,
       JSON_EXTRACT(metrics_json, '$.methodology')        AS methodology
FROM sdd_daily_reports
WHERE report_date = '2026-05-31';
```

### 5.3 校验「数据提示」是否已平息

```sql
SELECT
  (SELECT COUNT(*) FROM ingest_outbox WHERE status = 'pending')         AS outbox_pending,
  (SELECT COUNT(*) FROM ingest_outbox WHERE status = 'failed_terminal') AS outbox_failed,
  (SELECT COUNT(*) FROM otel_ingest_batches
     WHERE status = 'failed_terminal'
       AND received_at >= '2026-05-31T00:00:00.000+08:00'
       AND received_at <  '2026-06-01T00:00:00.000+08:00')              AS failed_batch;
```

注意：`outbox_pending` / `outbox_failed` 是**全表**实时计数，所以即使你重新生成昨天的日报，`warnings` 仍然会反映今天这一刻的积压。这是设计如此，不是 bug。

### 5.4 重新生成某一天的日报

页面右上角 "重新生成" 按钮 → `POST /api/reports/daily/2026-05-31/regenerate`。命令行：

```bash
curl -X POST http://localhost:4318/api/reports/daily/2026-05-31/regenerate \
  -H "Cookie: <你的登录 cookie>"
```

或拥有 super_admin 时，页面会显示「立即生成昨天日报」按钮。

## 6. 字段到代码反查表

| 页面区块 | Contract 字段 | 服务端组装位置 | Repository SQL |
| --- | --- | --- | --- |
| 头部 | `reportDate, generatedAt, headline` | `daily-report.service.ts:123` `renderHeadline` | `findByDate` |
| KPI 4 卡 | `kpis.activeUsers/skillUsages/coveredWorkItems/documentOutputs` | `daily-report.service.ts:78-83` | `countDistinctUsers / countSkillUsages / countCoveredWorkItems / countDocumentOutputs` |
| §1 采用 | `adoption.*` | `:85-90` | 同上 |
| §2 链路 - 阶段表 | `chain.stages[]` | `:91` + `buildStages` | `countStageCoverage` |
| §2 全链路 | `chain.fullChainWorkItemCount` | `:93` | `countFullChainWorkItems` |
| §2 多阶段 | `chain.multiStageWorkItemCount` | `:94` | `countMultiStageWorkItems` |
| §3 标杆 | `benchmarks[]` | `:97` + `buildBenchmarks` | `listBenchmarks` |
| §4 代码落地 | `codeImpact.*` | `summarizeCodeImpactRows` | `listCodeImpactRows` |
| §5 知识 | `knowledge.*` | `:98-104` | `countWikiRecalls / countWikiDistinctFiles / countWikiDistinctDomains / topWikiDomains` |
| 数据提示 | `dataHealth.*` | `:110-115` + `buildWarnings` | `countOutboxPending / countOutboxFailed / countFailedBatches` |
| 页脚 | `methodology.*` | `:116-120`（常量） | — |

## 7. 已知口径提醒

1. **artifact_type 双轨**：迁移/历史里 `tasks` 与 `task` 都出现过，统计 SQL 只接受 `('proposal','design','task','review','codereview')`。如果某需求 `artifact_type` 写的是 `tasks`（带 s），它**不会**进入链路阶段数；这是当前实现的有意过滤。
2. **`work_item_id IS NULL` 不计入**：所有"覆盖需求"统计都基于 `sdd_skill_usages.work_item_id IS NOT NULL`。客户端没配 `requirements_root_path` 的调用会落进 `activeUsers` / `skillUsages`，但不会落进 `coveredWorkItems` / `chain` / `benchmarks`。
3. **`fullChainCount` / `multiStageCount` 的 stage 是历史累计**：当期只要这个需求有 skill 活动，就会用它当前在 `sdd_work_item_artifacts` 里所有 artifact 做阶段统计，并不要求这些 artifact 是当期产出的。所以"昨日进入 3+ 阶段"更准确的描述是"昨日活跃的需求里，累计已经覆盖 ≥3 阶段"。
4. **`outboxPending`/`outboxFailed` 是全局实时值**，不是当期值。这就是为什么一份日报的 `dataHealth.warnings` 在重新生成后可能变化。
5. **代码落地不是需求覆盖**：`codeImpact` 统计业务代码仓库读写，能说明 SDD 进入编码环节；但它不反推 `work_item_id`，也不计入 `coveredWorkItems`。
6. **时区**：所有时间过滤都用 ISO + `+08:00`，MySQL 会按存储时区（部署配置）做比较。如果服务器/数据库时区不是 `Asia/Shanghai`，需要先确认 `event_time` 是按哪个时区写入的——本仓库统一按本地 Asia/Shanghai 写入。
