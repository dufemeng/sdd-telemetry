# API Contract 设计

更新时间：2026-06-16
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
/api/profiles Profile 统一观测接口
/api/ops      运维 / 排障 / 数据库观察
/api/auth     Dashboard 登录与成员管理
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

## 3.1 登录与授权

Dashboard 用户通过签名 `HttpOnly` cookie `sdd_session` 维持登录态。cookie 默认有效期为 7 天，生产环境使用 `Secure; SameSite=Lax`。用户角色：

| 角色          | 权限                                                     |
| ------------- | -------------------------------------------------------- |
| `viewer`      | 访问 dashboard 只读查询                                  |
| `super_admin` | `viewer` 权限，以及成员管理、语义映射写入和 `/api/ops/*` |

公开端点：

```text
GET  /api/healthz
POST /api/auth/login
POST /api/auth/logout
POST /api/ingest/otlp-logs
```

其余 `/api/*` 均要求有效 session；未登录返回 `401 UNAUTHORIZED`。`viewer` 请求管理员端点返回 `403 FORBIDDEN`。

### Auth endpoints

```text
POST /api/auth/login
  body: { username: string, password: string }
  data: AuthSessionUser

GET /api/auth/me
  data: AuthSessionUser

POST /api/auth/password
  body: { currentPassword: string, newPassword: string(min 12) }
  data: AuthSessionUser

POST /api/auth/logout
  data: { loggedOut: true }
```

仅 `super_admin`：

```text
GET  /api/auth/users
POST /api/auth/users
  body: { username, displayName, password, role }
PUT  /api/auth/users/:id
  body: { displayName?, role? }
POST /api/auth/users/:id/reset-password
  body: { password }
POST /api/auth/users/:id/disable
POST /api/auth/users/:id/enable
```

`AuthSessionUser` 仅包含 `id / username / displayName / role`。管理员列表中的 `AuthUser` 另外包含 `status / lastLoginAt / createdAt / updatedAt`，绝不返回 `password_hash`。

修改角色、禁用或重置密码会增加 `session_version`，使目标用户现有 session 立即失效。最后一个启用状态的 `super_admin` 不允许被禁用或降级。

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

人工重算某个 batch。P0 contract 预留该接口，当前实现尚未开放 HTTP 入口。
本地开发环境如果需要从 raw payload 重建派生数据，使用：

```bash
pnpm db:reclean         # 推荐：一键 reset + 循环重清洗，带 prod 锁 / 丢失率检查
# 或者：
pnpm db:reset-derived && pnpm --filter @sdd-telemetry/worker once
```

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
5. 无可信 prompt anchor 的 orphan event 不写入 `sdd_interactions`，因此不参与 interaction 口径统计。

### 6.7 GET /api/sdd/skill-analytics

技能分析页聚合数据。

Query：

```ts
export const SddSkillAnalyticsQuerySchema = TimeRangeQuerySchema;
```

Response data 包含：

```ts
{
  kpis: {
    interactionCount: { current: number | null; previous: number | null },
    skillUsageCount: { current: number | null; previous: number | null },
    activeUserCount: { current: number | null; previous: number | null },
    coveredWorkItemCount: { current: number | null; previous: number | null },
    pairingSuccessRate: { current: number | null; previous: number | null },
    semanticMatchRate: { current: number | null; previous: number | null },
  },
  callQuality: {
    triggeredCount: number,
    withPromptCount: number,
    withResponseCount: number,
    pairedCount: number,
    promptCoverageRate: number | null,
    responseCoverageRate: number | null,
    pairingSuccessRate: number | null,
  },
  topSemantics: Array<{
    semanticCode: string,
    displayName: string,
    usageCount: number,
    userCount: number,
    workItemCount: number,
    conversionRate: number | null,
  }>,
  matchHealth: {
    matchedCount: number,
    unmatchedCount: number,
    matchRate: number | null,
    topUnmatched: Array<{ rawSkillName: string, usageCount: number }>,
  },
}
```

说明：

1. `previous` 为当前时间窗前一段等长窗口。
2. `semanticMatchRate` 按 usage 次数计算，`semantic_id IS NOT NULL` 为已匹配。
3. `callQuality.pairingSuccessRate` 沿用 `/api/sdd/funnel` 口径。
4. `callQuality.triggered/withPrompt/withResponse/paired` 在技能分析页按 usage 粒度统计，避免和 interaction 计数混用。

### 6.8 GET /api/sdd/skill-timeseries

技能调用时序。

Query：

```ts
export const SddSkillTimeseriesQuerySchema = TimeRangeQuerySchema.extend({
  bucket: z.enum(['15m', '1h', '3h']).optional(),
});
```

Response data：

```ts
{
  bucket: '15m' | '1h' | '3h',
  points: Array<{
    timestamp: string,
    triggeredCount: number,
    pairedCount: number,
  }>,
}
```

说明：固定返回 24 个点，缺数据 bucket 由后端补 0。

### 6.9 GET /api/sdd/usage-summary

Skill 使用概览，按 `rawSkillName` 聚合，并关联语义、用户、会话、需求和版本分布。

Query：

```ts
export const SddUsageSummaryQuerySchema = z.object({
  from: z.string().optional(),
  to: z.string().optional(),
  semanticCode: z.string().optional(),
  status: z.string().optional(),
  matched: z.enum(['all', 'matched', 'unmatched']).default('all'),
  keyword: z.string().trim().max(200).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(20),
  limit: z.coerce.number().int().min(1).max(200).optional(),
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
  total: z.number(),
  page: z.number(),
  pageSize: z.number(),
});
```

### 6.10 GET /api/sdd/usages

Skill usage 列表和过滤。

Query 支持：

```text
semanticCode
rawSkillName
userId
workItemId
status
from / to
limit / cursor
```

### 6.11 GET /api/sdd/interactions

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
pairingMethod: z.enum(['prompt_id', 'anchored_by_user_prompt']).optional(),
```

### 6.12 GET /api/sdd/interactions/:interactionId

共享事件层的单条原始交互详情。执行验证入口统一使用 `7.1` 的 profile execution snapshot；本接口保留给原始层观测和 API 排障，不包含 profile 知识、fallback 或产物证据。

Response：

```ts
export const SddInteractionDetailSchema = SddInteractionItemSchema.extend({
  promptText: z.string().nullable(),
  responseText: z.string().nullable(),
  responseJson: z.string().nullable(),
});
```

### 6.13 GET /api/sdd/interactions/:interactionId/tool-calls

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

### 6.14 GET /api/sdd/errors

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

### 6.15 GET /api/sdd/users

用户 / 机器维度。响应为 `SddUserItem[]`，每个 item 包含：

- 用户 / 机器标识：`id` / `userKey` / `installId` / `userName` / `machineId` / `machineName`
- 路径配置：`requirementsRootPath` / `wikiRootPath`
- 时间：`firstSeenAt` / `lastSeenAt`
- 活动量：`skillUsageCount` / `interactionCount` / `workItemCount`
- 三态 / 新成员标识：`status: 'live' | 'cold' | 'churn'` / `isNew: boolean`（口径受 `USER_COLD_DAYS` / `USER_CHURN_DAYS` / `USER_NEW_DAYS` env 控制，默认 7 / 30 / 14 天）
- 阶段渗透：`semanticStages: string[]`（命中过的 `sdd_skill_semantics.semantic_code` 列表）
- 产出：`artifactCount` / `codeWriteCount` / `codeReadCount`（基于 `sdd_interaction_tool_calls` 的工具调用计数，业务代码路径判定同 daily-report，最近无窗口）
- 上手进度：`rampDays: number | null`（从 `firstSeenAt` 到走通 4 个 canonical 阶段 `proposal/design/task/codereview` 的天数，未走通时为 `null`）

> 返回 `ORDER BY lastSeenAt DESC, id DESC`，受 `LIMIT 200` 限制。详情请用 `6.16 GET /api/sdd/users/:userId`（不受 200 限制）。

### 6.16 GET /api/sdd/users/:userId

单用户画像深下钻。响应为 `SddUserDetail`（contract schema `SddUserDetailSchema`）：

```json
{
  "user": {
    /* SddUserItem，字段同 6.15，但不受 LIMIT 200 限制 */
  },
  "summary": {
    "workItemCount": 5,
    "artifactCount": 3,
    "turnCount": 66,
    "sessionCount": 30,
    "wikiRecallCount": 23,
    "codeWriteCount": 12,
    "codeReadCount": 45
  },
  "maturity": {
    "stages": [
      { "stage": "proposal", "firstReachedAt": "2026-04-22T..." },
      { "stage": "design", "firstReachedAt": "2026-04-23T..." },
      { "stage": "task", "firstReachedAt": null },
      { "stage": "codereview", "firstReachedAt": null }
    ],
    "completionRate": 0.5,
    "rampDays": null
  },
  "workItems": [
    {
      "workItemId": "2762",
      "title": "user-analysis-redesign",
      "stageCodes": ["proposal", "design"],
      "lastActivityAt": "2026-05-18T..."
    }
  ]
}
```

服务端使用 60s TTL 缓存 ROI 聚合，避免重复扫描 `sdd_interaction_tool_calls`。

### 6.17 GET /api/sdd/versions

版本分析。

今日 MVP 不展示版本分析 Tab；当前接口只提供全局版本分布，不承担完整版本质量分析。

### 6.18 GET /api/sdd/work-items

需求维度列表。

### 6.19 GET /api/sdd/work-items/:workItemId

需求详情，包括相关 semantic、usage、artifact、error 摘要。

新增字段（需求维度 summary）：

- `turnCount` — 关联该需求的不重复 interaction 数
- `sessionCount` — 跨越的 session 数
- `contributorCount` — 参与的用户数
- `wikiRecallCount` — wiki 读取总次数

#### GET /api/sdd/work-items/:workItemId/artifacts/:artifactId/writes

返回单篇文档的生成时间线。是「写入节点 ∪ 讨论节点」按时间合并的列表，不再只有写入：

- `nodeKind: 'write'` — 一次 Write/Edit 写入（来自 `sdd_work_item_artifact_writes`），`writeKind` 为写入类型。
- `nodeKind: 'discussion'` — 产出这篇文档过程中的一轮讨论交互（来自 `sdd_work_item_artifact_turns`），`writeKind` 为 `null`。

两类节点都带 `interactionId`，可展开全文（复用 `GET /api/sdd/interactions/:interactionId`）；`wikiRecallCount` 为该轮读取 wiki 次数。按 `eventTime` 升序，同刻讨论排在写入之前。

支持可选 query 参数 `?userId=<id>` 用于过滤「只看指定用户的写入/讨论」，多成员协作同一 work item 时用于个人画像页避免串入他人数据。

**Response:** `SddArtifactWriteListResponse`

```json
{
  "items": [
    {
      "id": "789",
      "nodeKind": "discussion",
      "writeKind": null,
      "eventTime": "2026-05-10T14:18:00.000Z",
      "eventSequence": null,
      "interactionId": "455",
      "skillSemanticCode": "design",
      "skillDisplayName": "系统设计",
      "rawSkillName": "bk-fe:design",
      "wikiRecallCount": 1,
      "promptPreview": "先聊一下错误处理那段...",
      "contentPreview": null
    },
    {
      "id": "123",
      "nodeKind": "write",
      "writeKind": "Write",
      "eventTime": "2026-05-10T14:22:00.000Z",
      "eventSequence": 42,
      "interactionId": "456",
      "skillSemanticCode": "design",
      "skillDisplayName": "系统设计",
      "rawSkillName": "bk-fe:design",
      "wikiRecallCount": 3,
      "promptPreview": "帮我设计...",
      "contentPreview": null
    }
  ]
}
```

### 6.20 POST /api/sdd/user-settings

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

### 6.21 GET /api/sdd/wiki-recalls/content/:toolCallId

按 `toolCallId` 打开一次知识访问对应的当前文档内容。该端点只服务交互明细中的正文查看；累计聚合、覆盖率、domain/axis/system 查询端点均已删除。

Response：`SddWikiRecallContentSchema`。

### 6.22 GET /api/sdd/wiki-recalls/content/by-path

按 `repo + relativePath` 打开当前文档内容。知识库分析页的统计数据只走 `/api/profiles/:profileId/knowledge/*`。

## 7. profile API

Profile API 是前端看板的统一读接口。URL 中的 `profileId` 选择当前 profile；响应字段使用统一领域名，前端可按 profile presentation 映射成 SDD 文案。

### 7.0 GET /api/profiles/:profileId/users/:userId/activity

返回该用户的合并活动时间线（技能调用 / 知识访问 / 产物写入 / 代码活动 / 讨论），按 interaction 折叠、按时间倒序。

Query：`range`（24h/7d/30d/90d/all，默认 30d）、`limit`（1-500，默认 200）。

Response：`ProfileUserActivityResponseSchema`：

- `items[]`：折叠后的活动项。后端会拉取最多 `limit * 10`（上限 1000）条原始事实再折叠，因此一个高密度 interaction 可能挤掉更早的活动。
- `totalInteractions`：该用户在当前投影 + 时间范围内涉及的去重 interaction 总数（独立计数，不等于 items 长度，不受 limit 影响）。
- `truncated`：`true` 表示 `items` 不足 `totalInteractions`（被 limit 或 1000 条原始上限截断），前端需提示「仅加载最近 N 条」。

### 7.1 GET /api/profiles/:profileId/interactions/:interactionId/snapshot

返回一次 interaction 的执行快照，用于在用户活动时间线中核对本次 skill 执行的客观证据。`profileId` 决定知识访问、读取失败和 fallback 的当前投影口径；interaction、skill usage 与 tool call 来自共享事件层。

响应按 interaction 串联：

- `interaction`：执行状态、模型、时间、prompt 和 response。
- `skills[]`：本次观测到的 skill 名称、语义和版本。
- `knowledge.accesses[]`：成功归入当前 profile 的知识访问，保留来源空间、相对路径和工具调用顺序。
- `knowledge.failures[]`：当前 profile 中归类为 `knowledge_read_failed` 的失败证据，可用于发现死链接或读取错误。每条失败按 profile 的 `knowledge_read_failed` reasonGroups 在查询时算出 `reasonCode/reasonLabel/reasonDescription`（如 `file_missing` → 「文件不存在」），原始 `errorType`、`messagePreview` 作为次要证据保留。
- `fallbacks[]`：命中当前 profile 中 `surfaceRole=fallback` 规则的能力调用。
- `artifacts[]`：本次 interaction 关联的产物写入事实，包括类型、路径、写入方式和内容预览。
- `apiErrors[]`：本次 interaction 中归类为 `model_or_api_failed` 的模型/API 层异常（网络、模型超时、API 错误等），与知识读取失败区分展示。
- `toolCalls[]`：完整工具调用时间线；`knowledgeStatus` 只标记该调用是否关联成功知识访问或知识读取失败。
- `summary`：上述证据数组的客观计数（含 `apiErrorCount`）。

接口不判断业务路径或产物语义是否正确，也不返回“验证通过”结论。通过 `toolCallId` 打开的知识正文来自当前文件内容，不能视为执行当时的历史快照。

Response：`ProfileExecutionSnapshotSchema`。

### 7.2 GET /api/profiles/:profileId/knowledge/overview

返回知识访问事实概览。来源空间取 `evidence_json.sourceNamespace`；路径维度取相对路径中的全部目录段并在查询时计算，不读取物化的 domain/axis/system。同一文档可以属于多个路径维度。

Response：`ProfileKnowledgeOverviewResponseSchema`，核心字段为 `totals`、`sources[]` 和 `pathDimensions[]`。

### 7.3 GET /api/profiles/:profileId/knowledge/timeline

返回真实访问总量和独立路径维度。每条访问只计入一个 `buckets[].accessCount`；同一访问可以命中多个目录段维度，因此 `dimensions[]` 不能相加作为总量。

Query：

```text
range            24h | 7d | 30d | 90d | all
granularity      day | hour (optional)
sourceNamespace  string (optional)
pathSegment      string (optional, exact directory segment)
```

Response：`{ buckets: Array<{ t, accessCount }>, dimensions: Array<{ segment, accessCount, points }> }`。

### 7.4 GET /api/profiles/:profileId/knowledge/docs

返回指定来源空间中，相对路径包含指定目录段的实际访问文档。

Query：

```text
sourceNamespace  string
pathSegment      string
```

Response：`ProfileKnowledgePathDimensionDocsResponseSchema`。

### 7.5 GET /api/profiles/:profileId/knowledge/doc-detail

按 `sourceNamespace + relativePath` 返回文档趋势、读者和来源交付单元。Response：`ProfileKnowledgeDocDetailResponseSchema`。

### 7.6 GET /api/profiles/:profileId/knowledge/content/by-path

按 `sourceNamespace + relativePath` 读取知识文档当前内容。Response：`ProfileKnowledgeContentSchema`。

### 7.7 GET /api/profiles/:profileId/knowledge/content/:toolCallId

按知识访问的 `toolCallId` 读取对应文档内容。仅可读动作返回内容，其他动作按 `reason` 降级。Response：`ProfileKnowledgeContentSchema`。

### 7.8 GET /api/profiles/:profileId/errors/overview

Profile 异常分析概览。只读取当前 profile 的 current projection run，不回退 legacy `/api/sdd/errors`。

Query：

```text
from      ISO datetime (optional)
to        ISO datetime (optional)
category  knowledge_read_failed | process_doc_access_failed | code_operation_failed | tool_execution_failed | model_or_api_failed (optional)
reasonCode string (optional, knowledge_read_failed reason group from profile errorRules)
```

Response：`ProfileErrorOverviewResponseSchema`

```ts
{
  kpis: {
    totalCount: number,
    knowledgeReadFailedCount: number,
    toolExecutionFailedCount: number,
    affectedUserCount: number,
    affectedInteractionCount: number,
    latestAt: string | null,
  },
  categories: Array<{
    category: string,
    displayName: string,
    severity: 'error' | 'warning' | 'info',
    count: number,
    affectedUserCount: number,
    affectedInteractionCount: number,
    affectedDeliveryUnitCount: number,
    latestAt: string | null,
  }>,
  knowledgeDiagnostics: Array<{
    reasonCode: string,
    displayName: string,
    description: string | null,
    count: number,
    affectedUserCount: number,
    affectedInteractionCount: number,
    affectedDeliveryUnitCount: number,
    latestAt: string | null,
    sampleLocator: string | null,
  }>,
}
```

### 7.9 GET /api/profiles/:profileId/errors

Profile 异常明细列表，服务异常分类页和单事件详情页的表格入口。

Query：

```text
from            ISO datetime (optional)
to              ISO datetime (optional)
category        same as overview (optional)
severity        error | warning | info (optional)
reasonCode      string (optional, knowledge_read_failed reason group from profile errorRules)
toolName        string (optional)
errorType       string (optional)
userId          string (optional)
deliveryUnitId  string (optional)
keyword         string (optional)
page            number default 1
pageSize        number default 50 max 200
```

Response：`ProfileErrorListResponseSchema`

### 7.10 GET /api/profiles/:profileId/errors/:errorEventId

Profile 异常详情。返回列表字段，加上 `sessionId`、`promptId`、`errorMessageHash`、`stackPreview` 和 `evidence`。

Response：`ProfileErrorDetailSchema`

## 8. ops API

ops API 面向本地和公司内网排障，不作为业务公开接口。

### 8.1 GET /api/ops/tables

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

### 8.2 GET /api/ops/tables/:tableName/rows

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

### 8.3 GET /api/ops/jobs

查看 outbox 和清洗调度状态。P0 公司环境使用定时任务，BullMQ job 状态仅作为后续目标态增强。

### 8.4 GET /api/ops/jobs/:jobId

查看单个 outbox/job 的错误、attempts、payload。

### 8.5 GET /api/ops/queue

查看 outbox 积压和清洗调度健康度。

## 9. eval API（评测集 CMS）

评测集 CMS 端点，全部仅 `super_admin`（viewer 403，匿名 401）。鉴权由全局 `AuthMiddleware` 对 `/api/eval/` 前缀强制。所有端点要求显式 `profileId`（query 或 body），服务端与 item 的 profile 对照，不靠前端切换器隔离。

所有响应设置 `Cache-Control: no-store`（完整 prompt 与摘要都不被缓存）。BIGINT ID 一律十进制字符串。

列表只返回 ≤240 字符的 `promptPreview`，完整 `promptText` 仅由单条详情接口返回；关键字只搜索 title/notes/target_skill，不进 prompt 片段。

### 9.1 GET /api/eval/items

按 profile 分页列出评测项摘要。Query: `profileId`(必填)、`source`、`capabilityCode`、`targetSkill`、`enabled`、`keyword`(≤100)、`page`(默认1)、`pageSize`(默认20，上限100)。响应含 `items`（含 promptPreview、targetSkill、targetArtifactType、originCapabilityCode、originRawCapabilityName、occurrenceCount、observed 时间、enabled）、`total`（当前筛选命中）、`page`、`pageSize`、`summary`（该 profile 全量 total/enabled/cleaned/manual）。

### 9.2 GET /api/eval/items/:id

按 profile 读取单条详情和完整 prompt。Query: `profileId`。返回完整 `promptText`、来源 interaction/projection run、notes。

### 9.3 POST /api/eval/items/import-from-logs

从当前 profile 投影导入真实 prompt。Body: `{ profileId, capabilityCode?, from?, to? }`（from/to 成对出现、`from < to`、跨度 ≤31 天）。只读 `profile_current_projection_runs` 当前 run → 同 run 的 `profile_capability_usages` LEFT JOIN `sdd_interaction_texts`；空正文计 `skippedNoPromptCount`，>256000 字符计 `skippedOversizeCount`，归一化后按 `sha256([profileId,targetSkill,targetArtifactType,normalizedPrompt])` 幂等 upsert。响应: `{ projectionRunId, scannedCount, candidateCount, insertedCount, refreshedCount, upgradedCount, skippedNoPromptCount, skippedOversizeCount, skippedDeletedCount }`。

恒等式：`scannedCount = (inserted+refreshed+upgraded) + skippedNoPrompt + skippedOversize`；`candidateCount = inserted+refreshed+upgraded+skippedDeleted`。

### 9.4 POST /api/eval/items

手工新增 manual 样本。Body: `{ profileId, source:'manual', promptText, targetSkill, targetArtifactType:'design'|'proposal'|'tasks', title?, notes? }`。命中 tombstone 返回 409"已被删除"，命中已有 key 返回 409"已存在"。

### 9.5 PUT /api/eval/items/:id

更新允许字段。Body: `{ profileId, promptText?, targetSkill?, targetArtifactType?, title?, notes?, enabled? }`（`.strict()`，未知字段拒绝）。cleaned 样本只允许改 title/notes/enabled，改 prompt/target 返回 400 `EVAL_CLEANED_IMMUTABLE`；manual 允许改全部 key 字段，key 字段变化重算 `item_key`，冲突返回 409。

### 9.6 DELETE /api/eval/items/:id

无正文 tombstone 删除：清空 prompt/title/notes/origin 字段，置 `enabled=0`、`deleted_at`、`deleted_by_user_id`，保留 item_key/profile_id/target_*。同 key 后续 import 计 `skippedDeleted` 不复活。

## 10. 前端适配策略

旧 `web/src/api.ts` 不再是事实标准。

迁移步骤：

1. 保留旧页面和组件。
2. 新建 `web/src/api/client.ts`。
3. 用 `packages/api` contract 定义请求和响应。
4. 在前端请求层写 ViewModel adapter，把新 API response 转成页面当前容易消费的结构。
5. 后续再拆 feature 和清理旧类型。

后端不得为了旧页面返回旧字段结构。适配成本放在前端请求层。
