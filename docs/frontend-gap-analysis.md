# 前端迁移 Gap Analysis：旧 sdd-telemetry vs 新 sdd-telemetry

> 目的：逐 Tab 对齐旧前端展示功能与新后端 API，标记适配状态，为设计稿制定提供准确依据。

---

## 一、映射总览

| # | 旧 Tab | 旧 API 端点 | 新 API 端点 | 适配状态 |
|---|---|---|---|---|
| 全局 | Header KPI | `GET /health` | `GET /api/ingest/health` + `GET /api/sdd/funnel` | ⚠️ 需组合 |
| 1 | 采集健康 | `GET /api/ingest/health` | `GET /api/ingest/health` | ⚠️ 字段缺失 |
| 2 | 事件分布 | `GET /api/events/distribution?hours=` | `GET /api/events/distribution?from=&to=&limit=` + `GET /api/events/timeline` | ⚠️ 需组合 |
| 3 | 数据质量 | `GET /api/data-quality` | `GET /api/events/field-coverage` | ⚠️ 缺警告/衍生指标 |
| 4 | Raw 批次 | `GET /api/raw-batches` | `GET /api/ingest/batches` | ⚠️ 字段缺失 |
| 5 | Skill 漏斗 | `GET /api/skills/funnel` | `GET /api/sdd/funnel` | ✅ 已按新口径补调用质量指标 |
| 6 | 异常错误 | `GET /api/errors/summary` | `GET /api/sdd/errors` | ⏸ 今日 MVP 不做，挂后续 TODO |
| 7 | 用户机器 | `GET /api/users/machines` | `GET /api/sdd/users` | ⚠️ schema 已定义，字段需适配 |
| 8 | 版本分析 | `GET /api/skills/versions?days=` | `GET /api/sdd/versions` | ⏸ 今日 MVP 移除，当前数据只能做弱分析 |
| 9 | Skill 使用概览 | `GET /api/skills/usage` | `GET /api/sdd/usage-summary` | ✅ 已补聚合 API |
| 10 | Skill 调用明细 | `GET /api/skills/{name}/interactions` | `GET /api/sdd/interactions` | ⚠️ schema 已定义，字段需适配 |
| 11 | Raw 字段审计 | `GET /debug/field-audit` | `GET /api/events/field-coverage` | ⚠️ 合并到数据质量 |
| 12 | 表结构 | `GET /debug/db/tables` | `GET /api/ops/tables` | ✅ 已补字段元数据和最大 size 估算 |
| 13 | 数据库检索 | `GET /debug/db/tables/{t}/data` | `GET /api/ops/tables` + `GET /api/ops/tables/{t}/rows` | ✅ 已补字段筛选和表数据查询 |

状态说明：
- ✅ 可直接适配
- ⚠️ 部分适配（字段缺失或结构变化，需前端适配或后端补字段）
- ❌ 结构不兼容（旧前端展示逻辑无法直接对接新 API）
- ❓ 产品/展示口径仍未确定
- ⏸ 今日 MVP 暂不实现，保留后续 TODO

---

## 0. 今日 MVP 产品决策

| 决策项 | 结论 | 影响 |
|---|---|---|
| Skill 漏斗 | 已在 `GET /api/sdd/funnel` 补 `callQuality` | 不把旧 4 级漏斗硬塞到前端聚合，按新调用质量口径展示 |
| 异常错误 | 今日 MVP 不做这个 Tab，挂后续 TODO | 后端 `sdd_errors` 保留，但前端不进入今日验收 |
| 弱文本错误 | 走最短路径，不做弱文本匹配 | 避免噪音和错误归因复杂度 |
| Skill 概览 | 已补 `GET /api/sdd/usage-summary` | 不改数据库，基于 `sdd_skill_usages` 聚合 |
| prompt/response | 列表页使用 preview；全文后续走详情接口 | 当前数据库已有全文表，当前 API 只暴露 preview |
| 版本分析 | 今日 MVP 移除 Tab | 当前只能做全局版本分布，缺 skill 维度和错误率，价值不足 |
| 数据库浏览 | 要完整功能，已补 ops API | 不改核心业务库表，增强 ops API 的 schema detail 和 filter 查询能力 |
| 语义配置 / Work Item | 按建议保留 | 语义配置做入口；Work Item 做 SDD 分析二级页面 |

---

## 二、逐 Tab 详细 Gap 分析

---

### 全局 Header KPI

**旧前端展示**：4 个 stat card
- Raw OTel 批次 = `health.rawBatches`
- 标准化事件 = `health.normalizedEvents`
- 交互数 = `health.interactions`
- Skill 调用 / 用户 = `health.skillUsages / health.activeSkillUsers`

**新 API 能力**：
- `GET /api/ingest/health` → `totalBatches` / `parsedBatches`（无 normalizedEvents / interactions / skillUsages）
- `GET /api/sdd/funnel` → `totalInteractions` / `totalSkillUsages`（无 activeSkillUsers 顶层字段，需从 stages 聚合）

**Gap**：
| 旧展示字段 | 新 API 来源 | 状态 |
|---|---|---|
| rawBatches | ingest/health.totalBatches | ✅ |
| normalizedEvents | events/field-coverage.totalEvents | ⚠️ 需额外调接口 |
| interactions | sdd/funnel.totalInteractions | ✅ |
| skillUsages | sdd/funnel.totalSkillUsages | ✅ |
| activeSkillUsers | sdd/funnel stages 聚合 distinct userCount | ⚠️ 需前端聚合 |

**结论**：需调 2 个接口（ingest/health + sdd/funnel），可行但 normalizedEvents 需用 field-coverage.totalEvents 替代。

---

### Tab 1：采集健康

**旧前端展示**：
1. 采集器状态（正在接收/可能断流/暂无数据）← `collectorStatus` + `lastReceivedAt`
2. 4 个 KPI（成功/失败/重复/待解析）← `totals.*`
3. 时间窗口统计表（5m/15m/60m 的 batchCount/eventCount/failedBatches/payloadBytes/since）← `windows[]`
4. 队列深度 ← 无（旧 API 无此数据）
5. 原始数据保留（oldestRawExpiresAt / retentionDays / maxBatches）← `rawRetention.*`
6. 最近失败批次表格（batchId/receivedAt/payloadBytes/logRecordCount/errorMessage）← `recentFailures[]`

**新 API 响应** (`GET /api/ingest/health`):
```
windowHours, totalBatches, parsedBatches, processingBatches,
failedBatches, duplicateBatches, totalPayloadBytes,
latestReceivedAt, latestParsedAt,
queue: { pendingOutbox, queuedJobs, activeJobs, failedJobs }
```

**Gap**：
| 旧展示模块 | 新 API | 状态 |
|---|---|---|
| 采集器状态 | `latestReceivedAt` 可推算 | ✅ 前端可计算 |
| 4 个 KPI | `parsedBatches`/`failedBatches`/`duplicateBatches`/`processingBatches` | ✅ |
| 时间窗口统计表 `windows[]` | **缺失**。新 API 只有单窗口 `windowHours`，没有多窗口分桶 | ❌ 需后端补接口或前端多次调用 |
| 队列深度 | `queue.*` | ✅ 新增能力 |
| 原始数据保留 `rawRetention` | **缺失**。新 API 无 `rawRetention.*` 字段 | ❌ 需后端补字段 |
| 最近失败批次 `recentFailures[]` | **缺失**。需 `GET /api/ingest/batches?status=failed_*` 替代 | ⚠️ 需额外调 batches 接口 |

**结论**：核心 KPI 和队列深度可直接用。时间窗口统计表、原始数据保留、最近失败批次三个模块需要额外处理。

---

### Tab 2：事件分布

**旧前端展示**：
1. 时间窗口选择器（6h/24h/72h）← `hours` 参数
2. 4 个摘要卡片 ← `hours`/`totalEvents`/`distinctEventNames`/峰值小时（从 trendBuckets 计算）
3. Top N 水平柱状图 ← `topEvents[]` (eventName/count/share/lastSeenAt)
4. 按小时趋势柱状图 ← `trendBuckets[]` (bucketStart/eventCount)
5. 详情表格 ← `topEvents[]` (eventName/count/share/firstSeenAt/lastSeenAt/lastReceivedAt)

**新 API 响应** (`GET /api/events/distribution`):
```
eventName, description, count, percentage, latestAt
```
参数：`from` / `to` / `limit`（不再用 `hours`）

**Gap**：
| 旧展示模块 | 新 API | 状态 |
|---|---|---|
| 时间选择器 | `from`/`to` 替代 `hours` | ✅ 前端计算 ISO 时间范围 |
| 摘要卡片 | `totalEvents`/`distinctEventNames` 直接返回；峰值小时由 timeline 计算 | ✅ 需组合两个接口 |
| Top N 柱状图 | `eventName`/`count`/`percentage`/`latestAt` | ✅ 字段名微调 |
| **按小时趋势柱状图 `trendBuckets[]`** | `GET /api/events/timeline` 可替代 | ✅ schema 已定义，字段名需适配 |
| 详情表格 firstSeenAt / lastReceivedAt | **缺失**。新 API 只有 `latestAt` | ⚠️ |

**结论**：Top N 可直接用。趋势图依赖 `GET /api/events/timeline`，当前 schema 已定义，前端需从 `buckets[]` 映射到旧展示结构。

---

### Tab 3：数据质量

**旧前端展示**：
1. 4 个摘要卡片（logEvents/promptInteractions/高置信配对率/质量警告数）
2. 关键字段覆盖率列表（field/note/status/coverage/nonNullRows/totalRows/lastSeenAt/recentSamples）
3. 缺失字段警告列表（field/message/severity）
4. 衍生指标（prompt_text 覆盖率/response_text 覆盖率/skill 调用数）

**新 API 响应** (`GET /api/events/field-coverage`):
```
totalEvents: number
fields: Array<{ fieldPath, presentCount, coverageRate, examples[] }>
```

**Gap**：
| 旧展示模块 | 新 API | 状态 |
|---|---|---|
| totalEvents | `totalEvents` | ✅ |
| promptInteractions | **缺失** | ❌ 需从 sdd/interactions 统计 |
| 高置信配对率 | **缺失** | ❌ 需从 sdd/interactions 计算 |
| 质量警告数 | **缺失**。旧 API 后端生成 warnings[]，新 API 无 | ⚠️ 前端可根据 coverageRate 自行生成 |
| 字段覆盖率 | `fieldPath`/`presentCount`/`coverageRate`/`examples` | ✅ 可用 |
| 字段 note / status / lastSeenAt | **缺失** | ⚠️ note/status 可前端计算；lastSeenAt 无来源 |
| 警告列表 warnings[] | **缺失** | ⚠️ 前端按 coverageRate<80% 自动生成 |
| 衍生指标 | **全部缺失** | ❌ prompt_text/response_text 覆盖率需新接口 |

**结论**：核心的字段覆盖率列表可用。但摘要卡片的 3/4 个值（交互数、高置信率、警告数）和衍生指标模块都缺数据源。

---

### Tab 4：Raw 批次

**旧前端展示**：
1. 4 个 KPI（总批次/parsed/failed/raw size）
2. 批次表格（status/receivedAt/payloadBytes/logRecordCount/duplicateCount/rawExpiresAt/batchId）
3. 展开行详情（payloadHash/lastDuplicateAt/rawAvailable/errorMessage/summary JSON）

**新 API 响应** (`GET /api/ingest/batches`):
```
id, status, payloadBytes, rawLogCount, eventCount, derivedCount,
duplicateCount, receivedAt, parseDurationMs, lastError
```

**Gap**：
| 旧展示字段 | 新 API 字段 | 状态 |
|---|---|---|
| batchId | `id` | ✅ 重命名 |
| status | `status` | ✅ |
| receivedAt | `receivedAt` | ✅ |
| payloadBytes | `payloadBytes` | ✅ |
| logRecordCount | `rawLogCount` | ✅ 重命名 |
| duplicateCount | `duplicateCount` | ✅ |
| rawExpiresAt | **缺失** | ❌ 需关联 otel_raw_payloads.expires_at |
| payloadHash | **缺失**（仅列表） | ⚠️ 需 GET /api/ingest/batches/:batchId 详情 |
| lastDuplicateAt | **缺失** | ⚠️ 需详情接口 |
| rawAvailable | **缺失** | ⚠️ 需详情接口 |
| errorMessage | `lastError` | ✅ 重命名 |
| summary JSON | **缺失** | ❌ 新 API 无 summary 概念 |
| eventCount | `eventCount` | ✅ 新增字段 |
| derivedCount | `derivedCount` | ✅ 新增字段 |
| parseDurationMs | `parseDurationMs` | ✅ 新增字段 |

**结论**：基础列表可用。展开行详情依赖 `GET /api/ingest/batches/:batchId`，当前 schema 已定义，但旧版 `summary JSON` 仍无直接替代。

---

### Tab 5：Skill 漏斗

**旧前端展示**：
1. 4 个 KPI（触发次数/成功配对率/低置信配对/活跃用户会话）
2. **4 级漏斗可视化**（触发 → 有Prompt → 有Response → 成功配对）← `totals.triggered/withPrompt/withResponse/successfulPairs`
3. 按 Skill 分组表格（skillName/triggered/withPrompt/withResponse/successfulPairs/lowConfidencePairs/activeUsers/sessions/lastSeenAt）

**新 API 响应** (`GET /api/sdd/funnel`):
```
totalInteractions, totalSkillUsages,
callQuality: {
  triggeredCount, withPromptCount, withResponseCount, pairedCount,
  promptCoverageRate, responseCoverageRate, pairingSuccessRate
},
stages: Array<{ semanticCode, displayName, usageCount, userCount, workItemCount, conversionRate }>
```
参数：`from`/`to`/`groupBy`（当前仅支持 `semantic`；contract 已收紧 enum 与实现对齐，未来扩展 user/work_item 分组时再放开）。

**Gap**：
| 旧展示模块 | 新 API | 状态 |
|---|---|---|
| 触发次数 | `totalSkillUsages` | ✅ 近似 |
| 成功配对率 | `callQuality.pairingSuccessRate` | ✅ 新口径 |
| 低置信配对 | **完全缺失** | ❌ 新 API 无此概念 |
| 活跃用户/会话 | 需从 stages 聚合 userCount | ⚠️ 需前端聚合 |
| **4 级漏斗**（triggered→prompt→response→paired） | `callQuality.triggeredCount/withPromptCount/withResponseCount/pairedCount` | ✅ 按调用质量口径展示 |
| 按 Skill 分组表格 | `stages[]` 按 semanticCode 分组 | ⚠️ 可用但结构不同：旧按 rawSkillName 分组，新按 semanticCode 分组 |
| withPrompt / withResponse / successfulPairs | `callQuality.withPromptCount/withResponseCount/pairedCount` | ✅ 已补 |

**结论**：旧前端的 4 级串行漏斗不再原样复刻；新 API 同时提供 `callQuality` 调用质量指标和 `stages[]` 语义分布，更适合展示“调用质量 + 语义使用分布”。

**今日决策**：
- 不把旧 4 级漏斗硬塞到前端聚合。
- 后端已补 prompt/response/paired 统计，形成调用质量漏斗。
- 今日最短路径展示语义分布 + 基础调用质量指标。

---

### Tab 6：异常错误（今日 MVP 延后）

**旧前端展示**：
1. 4 个 KPI（强信号/api+retry/tool+hook/弱文本）
2. 错误签名卡片列表（evidenceLevel/title/relatedSkills/eventCount/affectedUsers/affectedSessions/sampleSource/lastSeenAt）
3. 3 个分组柱状图（bySkill/bySession/byUser）
4. 强信号事件表格（source/eventTimestamp/eventName/model/displayName/sessionId/skillName/message/attributesPreview）
5. 弱文本事件折叠列表

**今日决策**：本 Tab 不进入今日 MVP，挂后续 TODO。当前后端保留 `GET /api/sdd/errors` 和 `sdd_errors` 数据基座，但前端今日不适配该页。

**新 API 响应** (`GET /api/sdd/errors`):
```
id, errorType, severity, source, message, count?, latestAt,
userId, sessionId, semanticCode, workItemId
```

**Gap**：
| 旧展示模块 | 新 API | 状态 |
|---|---|---|
| 强信号 KPI | 可从 errorType 聚合 | ⚠️ 需前端聚合 |
| 弱文本命中 KPI | **完全缺失**。新 API 只包含强错误 | ❌ 新系统无弱文本匹配概念 |
| **错误签名分组 `issueSignatures[]`** | **缺失**。新 API 是扁平错误列表，无分组/签名聚合 | ❌ 需前端自行按 errorType+messageHash 分组 |
| evidenceLevel | **缺失** | ❌ 新 API 无证据等级概念 |
| relatedSkills | `semanticCode`（部分替代） | ⚠️ 新 API 用语义代码替代 raw skill name |
| affectedUsers / affectedSessions | `userId`/`sessionId`（需分组统计） | ⚠️ 需前端聚合 |
| **3 个分组柱状图 bySkill/bySession/byUser** | **缺失**。需前端自行分组聚合 | ⚠️ 可行但数据量大时性能差 |
| 强信号事件表格 | 基础字段可用（errorType/severity/source/message/latestAt） | ⚠️ 缺 eventName/model/displayName/skillName/attributesPreview |
| 弱文本事件 | **完全缺失** | ❌ |

**结论**：**第二大结构变化 Tab**。旧 API 返回的是已经分组聚合好的"错误洞察摘要"（带签名、分组、影响分析），新 API 返回的是扁平的错误记录列表。今日 MVP 不做；后续应由后端新增聚合接口，不建议前端加载全量错误后自行聚合。

---

### Tab 7：用户机器

**旧前端展示**：
1. 4 个 KPI（总安装/7天活跃/Skill调用/异常事件）
2. 用户表格（displayName/installId/serviceName+Version/eventCount/interactionCount/skillCallCount+条形/distinctSkills/sessionCount/errorEventCount+pill/recentSkills[]/lastActiveAt）

**新 API**：`GET /api/sdd/users` — **响应 schema 已定义**

**数据库表** `sdd_users` 有以下可用字段：
user_key, install_id, user_name, machine_id, machine_name, os_name, os_version, client_name, client_version, requirements_root_path, wiki_root_path, first_seen_at, last_seen_at

**Gap**：
| 旧展示字段 | 新 API / 数据库 | 状态 |
|---|---|---|
| displayName | `userName` | ✅ 已返回 |
| installId | `installId` | ✅ 已返回 |
| machineId / machineName | `machineId` / `machineName` | ✅ 已返回 |
| serviceName + serviceVersion | 当前 API 未返回 | ⚠️ 可后续补 |
| interactionCount / skillCallCount | `interactionCount` / `skillUsageCount` | ✅ 已返回 |
| eventCount | 当前 API 未返回 | ⚠️ 可选增强 |
| distinctSkills / sessionCount | 当前 API 未返回 | ⚠️ 可选增强 |
| errorEventCount | 当前 API 未返回 | ⚠️ 异常页延期后可延后 |
| recentSkills[] | 当前 API 未返回 | ⚠️ 可选增强 |
| lastActiveAt | `lastSeenAt` | ✅ 已返回 |

**结论**：今日 MVP 可直接做用户机器列表和基础 KPI。高级字段（recentSkills、sessionCount、errorEventCount、客户端版本）后续再补，不阻塞 MVP。

---

### Tab 8：版本分析（今日 MVP 移除）

**旧前端展示**：
1. 时间窗口（7d/14d/30d）
2. 5 个 KPI
3. 版本分布表格（skillName/observedSkillVersion/calls+条形/errorEvents+pill/errorRate/activeUsers/sessions/firstSeenAt/lastSeenAt）
4. 每日版本汇总列表

**今日决策**：移除该 Tab。当前 `GET /api/sdd/versions` 只能返回全局版本分布，能分析 `version/usageCount/userCount/latestAt`，但缺少 skill/semantic 维度、错误率、会话数、每日趋势，做出来价值弱。

**新 API**：`GET /api/sdd/versions` — **响应 schema 已定义**

**数据库相关字段**：`sdd_skill_usages.raw_skill_name` / `observed_version` / `service_version` / `event_time`

**Gap**：
| 旧展示字段 | 数据库来源 | 状态 |
|---|---|---|
| 全局 version | `version` | ✅ 已返回 |
| calls | `usageCount` | ✅ 已返回 |
| activeUsers | `userCount` | ✅ 已返回 |
| lastSeenAt | `latestAt` | ✅ 已返回 |
| skillName + observedSkillVersion | 当前 API 未按 skill/semantic 分组 | ❌ |
| errorEvents / errorRate | 当前 API 未关联错误 | ❌ |
| sessions | 当前 API 未统计 session | ❌ |
| firstSeenAt | 当前 API 未返回 | ❌ |
| 每日汇总 daily[] | 当前 API 未返回 | ❌ |

**结论**：有最短路径，但价值不足：只能做全局版本排行。今日 MVP 直接移除该 Tab；后续若恢复，建议新增 `GET /api/sdd/version-summary?groupBy=semantic`。

---

### Tab 9：Skill 使用概览

**旧前端展示**：
1. 可排序表格（skillName/calls/activeUsers/sessions/versions[]/firstSeenAt/lastSeenAt）
2. 点击 skillName 跳转到交互明细

**新 API**：`GET /api/sdd/usage-summary` 已补，按 `rawSkillName` 聚合，并关联 semantic、用户、会话、需求和版本分布。

当前查询参数：`semanticCode`/`status`/`from`/`to`/`limit`

**Gap**：
| 旧展示字段 | 新 API | 状态 |
|---|---|---|
| skillName | `rawSkillName`，并返回 `semanticCode` + `semanticDisplayName` | ✅ |
| calls / activeUsers / sessions | `usageCount` / `activeUserCount` / `sessionCount` | ✅ |
| versions[] | `versions[]`，基于 `observed_version/service_version` 聚合 | ✅ |
| firstSeenAt / lastSeenAt | `MIN/MAX(event_time)` | ✅ |

**结论**：已实现，不需要改数据库。`sdd_skill_usages` 已有 `raw_skill_name`、`semantic_id`、`user_id`、`session_id`、`observed_version`、`service_version`、`event_time` 及相关索引，符合先基于明细表实时聚合的最佳实践；只有数据量明显变大后，才考虑日聚合表。

---

### Tab 10：Skill 调用明细

**旧前端展示**：
1. Skill 下拉选择器 ← `GET /api/skills/usage`
2. 筛选器（sessionId/promptId/userId/hasError/时间范围）
3. 交互表格（endedAt/displayName/observedSkillVersion/promptText/responseText/pairingMethod:confidence/eventCount/apiResponseCount）

**新 API**：`GET /api/sdd/interactions` — **响应 schema 已定义**

当前查询参数：`semanticCode`/`sessionId`/`promptId`/`userId`/`workItemId`/`status`/`from`/`to`/`limit`/`cursor`

**数据库相关**：`sdd_interactions` + `sdd_interaction_texts`（prompt_text / response_text）

**Gap**：
| 旧展示字段 | 数据库来源 | 状态 |
|---|---|---|
| endedAt / startedAt | completed_at / started_at | ❓ |
| displayName | sdd_users.user_name | ❓ |
| observedSkillVersion | sdd_skill_usages.observed_version | ❓ |
| promptText / responseText | 当前 API 只返回 `promptPreview` / `responsePreview` | ⚠️ 全文需后续详情接口 |
| pairingMethod:confidence | pairing_method + evidence_json | ❓ |
| eventCount / apiResponseCount | 需关联 otel_log_events 聚合 | ❓ |

**结论**：preview 是当前已实现能力，来源于 `sdd_interaction_texts.prompt_text/response_text` 截断后的 `promptPreview/responsePreview`。全文不是当前 API 能力，后续建议新增 interaction detail 接口。

---

### Tab 11：Raw 字段审计

**旧前端展示**：
1. 10 个关键字段的覆盖状态（found/unfound dot/count/examples[0]）
2. 事件名称分布列表

**新 API**：`GET /api/events/field-coverage` 可部分替代

**Gap**：
| 旧展示模块 | 新 API | 状态 |
|---|---|---|
| 字段覆盖 found/unfound dot | `presentCount > 0` 等价 | ✅ |
| count | `presentCount` | ✅ |
| examples[0] | `examples[]` | ✅ |
| 事件名称分布列表 | `GET /api/events/distribution` | ✅ 需额外调用 |

**结论**：可合并到数据质量页面，不需要独立 Tab。新 API 完全可覆盖。

---

### Tab 12+13：表结构 + 数据库检索

**旧前端展示**：
- 表结构：sidebar 表列表 + schema 详情（name/type/primaryKey/notNull/estimatedBytes/sizeBasis/defaultValue）
- 数据库检索：筛选器构建器（AND/OR 组）+ 分页数据表格

**新 API**：
- `GET /api/ops/tables` — 返回表名、估算行数、更新时间和字段元数据
- `GET /api/ops/tables/:tableName/rows` — 返回 columns + rows + cursor，并支持字段筛选

**Gap**：
| 旧展示模块 | 新 API | 状态 |
|---|---|---|
| 表列表 sidebar | `GET /api/ops/tables` | ✅ schema 已定义 |
| schema 详情 | `/tables` 返回 column type/primaryKey/notNull/default/estimatedBytes/sizeBasis | ✅ |
| 筛选器构建器 | `/rows` 支持 `filters` JSON、字段白名单、常用比较操作 | ✅ |
| 分页 | `rows` 已支持 cursor 分页 | ✅ |

**结论**：已按完整调试台方向补齐 `OpsColumnSchema`、表详情、白名单字段过滤、排序和分页；当前 filter 是 AND 组合，暂不做 OR 分组。

---

## 三、新 API 独有能力（旧前端未覆盖）

| 新 API | 能力 | 可用于 |
|---|---|---|
| `GET /api/sdd/semantics` CRUD | 语义配置管理 | 新页面：语义配置 |
| `GET /api/sdd/work-items` + 详情 | 工作项追踪 | 新页面：工作项 |
| `POST /api/ingest/batches/:batchId/reprocess` | 手动重处理 | contract 已定义但当前 server 未实现，今日 MVP 不承诺 |
| `POST /api/sdd/user-settings` | 用户设置上报 | 非展示类，无需前端页面 |

---

## 四、优先级建议

### P0 — 后端必须补齐的接口/字段

1. **`GET /api/sdd/usage-summary` 新增 Skill 概览聚合** — 已补，前端需要 Skill 概览页，基于 `sdd_skill_usages` 实时聚合，不改数据库
2. **`GET /api/sdd/funnel` 增加 prompt/response/paired 统计** — 已补 `callQuality`
3. **增强 `GET /api/ops/tables` 和 `GET /api/ops/tables/:tableName/rows`** — 已补 column metadata 和 filters
4. **语义配置入口** — `GET/POST /api/sdd/semantics` 已有，前端今日应提供基础管理入口

### P1 — 后端建议补充

5. **异常错误页后续 TODO** — 新增错误签名聚合、影响用户/session、样例事件；今日 MVP 不做
6. **`GET /api/ingest/health` 增加 `rawRetention` 字段**（oldestExpiresAt / retentionDays）
7. **`GET /api/ingest/health` 增加 `recentFailures[]`**（或前端用 batches 接口替代）
8. **`GET /api/ingest/health` 增加多窗口支持**（windows[] 或支持多次调用不同 windowHours）
9. **Interaction detail 接口** — 用于查看完整 prompt/response，列表页继续使用 preview
10. **版本分析后续恢复** — 若需要，新增 `GET /api/sdd/version-summary?groupBy=semantic`

### P2 — 可以前端自行处理的

11. **数据质量页的 warnings** — 前端根据 coverageRate<80% 自动生成
12. **Raw 字段审计** — 合并到数据质量页
13. **Header KPI** — 组合 ingest/health + sdd/funnel 两个接口

---

## 五、产品决策点（需要你定）

| # | 问题 | 选项 |
|---|---|---|
| D1 | **Skill 漏斗**：旧版 4 级串行漏斗在新 API 不存在，怎么处理？ | 已定：按后端补 prompt/response/paired 的方向，今日最短路径先展示语义分布 + 调用质量指标 |
| D2 | **异常错误**：旧版有后端聚合的签名分组和维度统计，新 API 是扁平列表。前端聚合还是后端补？ | 已定：今日 MVP 不做，后续由后端补聚合接口 |
| D3 | **弱文本匹配**：新 API 只保留强错误，弱文本命中是否需要保留？ | 已定：最短路径，不做弱文本 |
| D4 | **Skill 概览**：前端是否需要聚合概览页？ | 已定：需要，新增 `GET /api/sdd/usage-summary` |
| D5 | **prompt/response**：列表页展示 preview 还是全文？ | 已定：当前列表用 preview，全文后续详情接口 |
| D6 | **版本分析**：当前能力不足时是否保留 Tab？ | 已定：今日 MVP 移除 |
| D7 | **数据库浏览**：简单表格还是完整调试台？ | 已定：完整调试台，增强 ops API，不改核心业务表 |
| D8 | **语义配置 / Work Item**：是否进入新前端信息架构？ | 已定：语义配置做入口，Work Item 作为 SDD 分析二级页面 |
