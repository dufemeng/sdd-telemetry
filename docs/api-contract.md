# API Contract 设计

更新时间：2026-05-19  
原则：后端 API 按新领域模型设计，不兼容旧接口；前端以最低成本适配新 API。

## 1. Contract 原则

1. `packages/api` 是 request / response 的唯一事实来源。
2. P0 使用 Zod schema，同时提供运行时校验和 TypeScript 类型。
3. 后端 Controller 使用 Zod 校验 body / query / params。
4. 前端 API client 使用 `z.infer` 推导类型。
5. 测试使用 Zod schema 校验真实 API response。
6. P0 不先生成 OpenAPI client；P1 再接 OpenAPI / Swagger。

示例：

```ts
export const ApiResponseSchema = <T extends z.ZodTypeAny>(data: T) =>
  z.object({
    success: z.boolean(),
    data,
    error: z
      .object({
        code: z.string(),
        message: z.string(),
        details: z.unknown().optional(),
      })
      .optional(),
    requestId: z.string(),
    timestamp: z.string(),
  });
```

## 2. API 域划分

```text
/api/ingest   采集链路
/api/events   通用 OTel 事件分析
/api/sdd      SDD 业务分析
/api/ops      运维 / 排障 / 数据库观察
```

## 3. 统一响应

成功：

```json
{
  "success": true,
  "data": {},
  "requestId": "req_xxx",
  "timestamp": "2026-05-14T12:00:00.000Z"
}
```

失败：

```json
{
  "success": false,
  "error": {
    "code": "BAD_REQUEST",
    "message": "请求参数不合法",
    "details": {}
  },
  "requestId": "req_xxx",
  "timestamp": "2026-05-14T12:00:00.000Z"
}
```

## 4. ingest API

### 4.1 POST /api/ingest/otlp-logs

接收 OTel logs payload。

Request：

```ts
export const OtlpLogsPayloadSchema = z.record(z.string(), z.unknown());
```

Response：

```ts
export const IngestLogsResponseSchema = z.object({
  batchId: z.string(),
  status: z.enum([
    'received',
    'queued',
    'processing',
    'parsed',
    'failed_retryable',
    'failed_terminal',
  ]),
  duplicate: z.boolean(),
  payloadHash: z.string(),
});
```

语义：

1. raw 写入成功即返回。
2. 清洗异步执行。
3. 重复 payload 返回已有 `batchId`。
4. 如果历史 batch 是 `failed_retryable`，服务端应补偿 outbox。

### 4.2 GET /api/ingest/health

采集链路健康。

Query：

```ts
export const IngestHealthQuerySchema = z.object({
  windowHours: z.coerce.number().int().min(1).max(168).default(24),
});
```

Response data：

```ts
export const IngestHealthSchema = z.object({
  windowHours: z.number(),
  totalBatches: z.number(),
  parsedBatches: z.number(),
  processingBatches: z.number(),
  failedBatches: z.number(),
  duplicateBatches: z.number(),
  totalPayloadBytes: z.number(),
  latestReceivedAt: z.string().nullable(),
  latestParsedAt: z.string().nullable(),
  queue: z.object({
    pendingOutbox: z.number(),
    queuedJobs: z.number(),
    activeJobs: z.number(),
    failedJobs: z.number(),
  }),
});
```

### 4.3 GET /api/ingest/batches

Raw batch 列表。

Query：

```ts
export const BatchListQuerySchema = z.object({
  status: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  cursor: z.string().optional(),
});
```

Response data：

```ts
export const BatchListItemSchema = z.object({
  id: z.string(),
  status: z.string(),
  payloadBytes: z.number(),
  rawLogCount: z.number(),
  eventCount: z.number(),
  derivedCount: z.number(),
  duplicateCount: z.number(),
  receivedAt: z.string(),
  parseDurationMs: z.number().nullable(),
  lastError: z.string().nullable(),
});
```

### 4.4 GET /api/ingest/batches/:batchId

Batch 详情，包括 raw 摘要、清洗错误、状态流转。

### 4.5 POST /api/ingest/batches/:batchId/reprocess

人工重算某个 batch。

规则：

1. 只允许存在 raw 或事件层仍可回放的 batch。
2. 重算前清理受影响的派生数据。
3. 返回新的任务状态。

## 5. events API

### 5.1 GET /api/events/distribution

事件类型分布。

Query：

```ts
export const EventDistributionQuerySchema = z.object({
  from: z.string().optional(),
  to: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
```

Response item：

```ts
export const EventDistributionItemSchema = z.object({
  eventName: z.string(),
  description: z.string().nullable(),
  count: z.number(),
  percentage: z.number(),
  latestAt: z.string().nullable(),
});
```

### 5.2 GET /api/events/field-coverage

字段覆盖率和数据质量。

Response data：

```ts
export const FieldCoverageSchema = z.object({
  totalEvents: z.number(),
  fields: z.array(
    z.object({
      fieldPath: z.string(),
      presentCount: z.number(),
      coverageRate: z.number(),
      examples: z.array(z.string()).max(5),
    }),
  ),
});
```

### 5.3 GET /api/events/field-values

查看某个字段的 Top values。

### 5.4 GET /api/events/timeline

事件时间趋势。

## 6. sdd API

### 6.1 GET /api/sdd/semantics

查看 SDD 语义配置。

Response item：

```ts
export const SddSemanticSchema = z.object({
  id: z.string(),
  semanticCode: z.string(),
  displayName: z.string(),
  description: z.string().nullable(),
  artifactFilenamePatterns: z.array(z.string()).nullable(),
  aliases: z.array(
    z.object({
      id: z.string(),
      skillName: z.string(),
    }),
  ),
});
```

### 6.2 POST /api/sdd/semantics

新增语义和 alias。

Request：

```ts
export const CreateSddSemanticRequestSchema = z.object({
  semanticCode: z.string().min(1).max(64),
  displayName: z.string().min(1).max(191),
  description: z.string().max(1000).optional(),
  artifactFilenamePatterns: z.array(z.string().min(1).max(191)).optional(),
  aliases: z.array(z.string().min(1).max(191)).min(1),
});
```

### 6.3 PUT /api/sdd/semantics/:semanticId

更新展示名、描述、artifact 文件名模式和 alias 集合。未传 `artifactFilenamePatterns` 时保留原配置。

### 6.4 DELETE /api/sdd/semantics/:semanticId

删除语义。P0 可做软限制：已有 usage 的 semantic 不允许删除，只允许改名和 alias。

### 6.5 GET /api/sdd/overview

总览页业务 KPI。

Query：

```ts
export const SddOverviewQuerySchema = z.object({
  from: z.string().optional(),
  to: z.string().optional(),
});
```

Response data：

```ts
export const SddOverviewSchema = z.object({
  activeUserCount: z.number(),
  skillUsageCount: z.number(),
  coveredWorkItemCount: z.number(),
  generatedDocumentCount: z.number(),
});
```

说明：

1. `activeUserCount` 和 `skillUsageCount` 来自时间范围内的 `sdd_skill_usages`。
2. `coveredWorkItemCount` 来自时间范围内最近出现的 `sdd_work_items`。
3. `generatedDocumentCount` 统计 `proposal` / `design` / `task` / `codereview` 类型的 `sdd_work_item_artifacts`。

### 6.6 GET /api/sdd/funnel

Skill 调用漏斗。

Query：

```ts
export const SddFunnelQuerySchema = z.object({
  from: z.string().optional(),
  to: z.string().optional(),
  groupBy: z.enum(['semantic']).default('semantic'),
});
```

Response data：

```ts
export const SddFunnelSchema = z.object({
  totalInteractions: z.number(),
  totalSkillUsages: z.number(),
  callQuality: z.object({
    triggeredCount: z.number(),
    withPromptCount: z.number(),
    withResponseCount: z.number(),
    pairedCount: z.number(),
    promptCoverageRate: z.number().nullable(),
    responseCoverageRate: z.number().nullable(),
    pairingSuccessRate: z.number().nullable(),
  }),
  stages: z.array(
    z.object({
      semanticCode: z.string(),
      displayName: z.string(),
      usageCount: z.number(),
      userCount: z.number(),
      workItemCount: z.number(),
      conversionRate: z.number().nullable(),
    }),
  ),
});
```

说明：

1. P0 的 funnel 不假设固定流程顺序，只统计语义之间的出现、缺失和组合关系。
2. `callQuality` 用于今日 MVP 的调用质量漏斗：触发 Skill、有 prompt、有 response、prompt/response 成功配对。
3. `triggeredCount` 等于当前时间范围内的 `sdd_skill_usages` 数量；prompt/response 相关计数来自 `sdd_interactions` + `sdd_interaction_texts`。
4. `pairingSuccessRate` 当前口径为 `1 - failedInteractions / totalInteractions`，其中 failed interaction 由清洗出的 `status='failed'` 判定。

### 6.7 GET /api/sdd/usage-summary

Skill 使用概览，按 `rawSkillName` 聚合，并关联语义、用户、会话、需求和版本分布。

Query：

```ts
export const SddUsageSummaryQuerySchema = z.object({
  from: z.string().optional(),
  to: z.string().optional(),
  semanticCode: z.string().optional(),
  status: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(100),
});
```

Response data：

```ts
export const SddUsageSummaryResponseSchema = z.object({
  items: z.array(
    z.object({
      semanticCode: z.string().nullable(),
      semanticDisplayName: z.string().nullable(),
      rawSkillName: z.string(),
      usageCount: z.number(),
      activeUserCount: z.number(),
      sessionCount: z.number(),
      workItemCount: z.number(),
      versions: z.array(
        z.object({
          version: z.string(),
          count: z.number(),
        }),
      ),
      firstSeenAt: z.string().nullable(),
      lastSeenAt: z.string().nullable(),
    }),
  ),
});
```

### 6.8 GET /api/sdd/usages

Skill usage 列表和过滤。

Query 支持：

```text
semanticCode
userId
workItemId
status
from / to
limit / cursor
```

### 6.9 GET /api/sdd/interactions

prompt / response 交互列表。列表只返回 `promptPreview` / `responsePreview`，用于表格快速浏览；成本、token 和调用次数来自 `api_request` 默认事件聚合。

Query 支持：

```text
semanticCode
sessionId
promptId
userId
workItemId
from / to
limit / cursor
```

Response item 在基础字段外包含：

```ts
costUsd: z.number().nullable().optional(),
inputTokens: z.number().nullable().optional(),
outputTokens: z.number().nullable().optional(),
cacheReadTokens: z.number().nullable().optional(),
cacheCreationTokens: z.number().nullable().optional(),
llmCallCount: z.number().optional(),
toolCallCount: z.number().optional(),
skillName: z.string().nullable().optional(),
agentName: z.string().nullable().optional(),
pluginName: z.string().nullable().optional(),
querySource: z.string().nullable().optional(),
effort: z.string().nullable().optional(),
speed: z.string().nullable().optional(),
```

### 6.10 GET /api/sdd/interactions/:interactionId

单条交互详情，用于 Row Inspector 抽屉查看整行数据和完整 prompt / response。

Response：

```ts
export const SddInteractionDetailSchema = SddInteractionItemSchema.extend({
  promptText: z.string().nullable(),
  responseText: z.string().nullable(),
  responseJson: z.string().nullable(),
});
```

### 6.11 GET /api/sdd/interactions/:interactionId/tool-calls

单条 interaction 的工具调用时间线，按 `sequence ASC` 排序。

Response：

```ts
export const SddInteractionToolCallListResponseSchema = z.object({
  items: z.array(
    z.object({
      id: z.string(),
      toolUseId: z.string(),
      toolName: z.string(),
      sequence: z.number(),
      decision: z.string().nullable(),
      decisionSource: z.string().nullable(),
      success: z.boolean().nullable(),
      durationMs: z.number().nullable(),
      inputSizeBytes: z.number().nullable(),
      resultSizeBytes: z.number().nullable(),
      errorType: z.string().nullable(),
      toolInputPreview: z.string().nullable(),
      mcpServerScope: z.string().nullable(),
    }),
  ),
});
```

### 6.12 GET /api/sdd/errors

异常 / 错误视图。

Response item：

```ts
export const SddErrorItemSchema = z.object({
  id: z.string(),
  errorType: z.string(),
  severity: z.string(),
  source: z.string().nullable(),
  message: z.string().nullable(),
  count: z.number().optional(),
  latestAt: z.string().nullable(),
  userId: z.string().nullable(),
  sessionId: z.string().nullable(),
  semanticCode: z.string().nullable(),
  workItemId: z.string().nullable(),
});
```

P0 只纳入 strong error：

```text
api_error
tool_failure
hook_failure
retry_exhausted
uncaught_exception
schema_parse_failed
```

今日 MVP 不展示异常 / 错误 Tab，但保留 API 和数据表，后续再设计降噪视图。

### 6.13 GET /api/sdd/users

用户 / 机器维度。

Response item 包含用户标识、机器标识、`requirementsRootPath`、`wikiRootPath`、交互数、skill 调用数和最近活跃时间。

### 6.14 GET /api/sdd/versions

版本分析。

今日 MVP 不展示版本分析 Tab；当前接口只提供全局版本分布，不承担完整版本质量分析。

### 6.15 GET /api/sdd/work-items

需求维度列表。

### 6.16 GET /api/sdd/work-items/:workItemId

需求详情，包括相关 semantic、usage、artifact、error 摘要。

### 6.17 POST /api/sdd/user-settings

上报用户维度 `setting.json` 中的本地路径和配置。

Request：

```ts
export const ReportUserSettingsRequestSchema = z.object({
  installId: z.string().optional(),
  userName: z.string().optional(),
  machineId: z.string().optional(),
  machineName: z.string().optional(),
  requirementsRootPath: z.string().min(1),
  wikiRootPath: z.string().optional(),
  settings: z.record(z.string(), z.unknown()).optional(),
});
```

## 7. ops API

ops API 面向本地和公司内网排障，不作为业务公开接口。

### 7.1 GET /api/ops/tables

返回 MySQL 表列表、行数估算、最近更新时间和字段元数据。

Response item：

```ts
export const OpsColumnSchema = z.object({
  columnName: z.string(),
  dataType: z.string(),
  nullable: z.boolean(),
  key: z.string().nullable(),
  defaultValue: z.string().nullable(),
  extra: z.string().nullable(),
  estimatedMaxSize: z.number().nullable(),
  sizeBasis: z.string(),
});

export const OpsTableSchema = z.object({
  tableName: z.string(),
  estimatedRows: z.number(),
  updatedAt: z.string().nullable(),
  columns: z.array(OpsColumnSchema),
});
```

字段说明：

| 字段               | 语义                                                                                     |
| ------------------ | ---------------------------------------------------------------------------------------- |
| `dataType`         | MySQL `COLUMN_TYPE`，例如 `varchar(191)`、`bigint unsigned`、`longtext`                  |
| `estimatedMaxSize` | 当前字段理论最大占用字节估算，不是当前已使用 size                                        |
| `sizeBasis`        | size 估算依据，例如 `CHARACTER_MAXIMUM_LENGTH * utf8mb4 4 bytes` 或 `MySQL type maximum` |

### 7.2 GET /api/ops/tables/:tableName/rows

分页查看表数据。

Query：

```ts
export const OpsTableRowsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  cursor: z.string().optional(),
  orderBy: z.string().optional(),
  order: z.enum(['asc', 'desc']).default('desc'),
  filters: z.array(
    z.object({
      column: z.string(),
      operator: z.enum([
        'eq',
        'ne',
        'like',
        'not_like',
        'in',
        'gt',
        'gte',
        'lt',
        'lte',
        'is_null',
        'is_not_null',
      ]),
      value: z.union([z.string(), z.array(z.string())]).optional(),
    }),
  ),
});
```

`filters` 在 URL query 中使用 JSON 字符串传递，例如：

```text
GET /api/ops/tables/sdd_skill_usages/rows?filters=[{"column":"raw_skill_name","operator":"like","value":"bk-fe:%"}]
```

限制：

1. `tableName` 必须在 allowlist 中。
2. 默认 limit 50，最大 200。
3. `orderBy` 和 `filters.column` 必须是目标表真实字段。
4. `LONGTEXT` / `BLOB` / `JSON` 字段默认截断为 500 字符，详情页再展开。
5. cursor 仅对默认 `id` 排序提供稳定翻页；指定其他 `orderBy` 时只返回当前页。

### 7.3 GET /api/ops/jobs

查看 outbox 和清洗调度状态。P0 公司环境使用定时任务，BullMQ job 状态仅作为后续目标态增强。

### 7.4 GET /api/ops/jobs/:jobId

查看单个 outbox/job 的错误、attempts、payload。

### 7.5 GET /api/ops/queue

查看 outbox 积压和清洗调度健康度。

## 8. 前端适配策略

旧 `web/src/api.ts` 不再是事实标准。

迁移步骤：

1. 保留旧页面和组件。
2. 新建 `web/src/api/client.ts`。
3. 用 `packages/api` contract 定义请求和响应。
4. 在前端请求层写 ViewModel adapter，把新 API response 转成页面当前容易消费的结构。
5. 后续再拆 feature 和清理旧类型。

后端不得为了旧页面返回旧字段结构。适配成本放在前端请求层。
