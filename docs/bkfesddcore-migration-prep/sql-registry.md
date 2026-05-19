# SQL 集中注册清单

> 输出时间：2026-05-19
> 用途：bkfesddcore (Chair/tegg + dal v2) 迁移源端清单
> 范围：所有业务代码中 `.query()` 调用 + 端点 → Service → SQL → Zod schema 关联图
> 关联：[transaction-registry.md](./transaction-registry.md)、[cleaning-steps.md](./cleaning-steps.md)、[schedule-mapping.md](./schedule-mapping.md)、[review.md](./review.md)

## TL;DR

精确实测数字（**修正 review.md 此前的 68 / 25+3 估算**）：

| 维度 | 数字 | 备注 |
| --- | --- | --- |
| 业务 `.query()` 总数 | **88** | 不含死代码 outbox-dispatcher 的 6 条，也不含 migrations / verify-schema / seed / import-legacy 的工具脚本 |
| 死代码 `.query()` | 6 | `worker/src/jobs/outbox-dispatcher.ts`（[详见 schedule-mapping.md 第九节](./schedule-mapping.md)） |
| Controller 端点 | **31** | **27 @Get + 3 @Post + 1 @Put**（review.md 此前 "25 @Get + 3 @Post = 28" 数字错误，sdd 模块实际是 15 @Get 不是 13） |
| Zod contract 文件 | 5 | `packages/api/src/contracts/{common,events,ingest,sdd,ops}.contract.ts` |

按模块分布：

| 模块 | `.query()` | 端点 | 文件 |
| --- | --- | --- | --- |
| sdd | 37 | 15 @Get + 2 @Post + 1 @Put | server/src/modules/sdd/sdd-query.service.ts |
| cleaning（worker） | 21 | — | worker/src/jobs/cleaning-worker.ts |
| ingest-write | 7 | — | server/src/modules/ingest/ingest-write.repository.ts（被 service 包 manager 传入） |
| events | 7 | 4 @Get | server/src/modules/events/events-query.service.ts |
| ops | 7 | 5 @Get | server/src/modules/ops/ops-query.service.ts |
| scheduled-cleaning（worker） | 5 | — | worker/src/jobs/scheduled-cleaning-runner.ts |
| ingest-health | 4 | 3 @Get | server/src/modules/ingest/ingest-health.service.ts |
| ingest-receive | 0 | 1 @Post | 仅做事务包装，SQL 在 ingest-write |

迁移建议执行顺序：**sdd（最复杂）→ ingest-write（P0 数据入口）→ cleaning（worker 核心）→ events → ops → scheduled-cleaning**

---

## 第一节：SDD 模块（37 条，sdd-query.service.ts）

### 1A. Semantics CRUD（3 个端点共用）

| # | 行 | 方法 | 建议命名 | SQL 摘要 | 动态参数 | 涉及表 | 事务 | Zod schema |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 265 | listSemantics | sdd.listSemantics | SELECT JOIN sdd_skill_semantics + sdd_skill_aliases，按 id+skill_name 排序 | 无 | sdd_skill_semantics, sdd_skill_aliases | no | `SddSemanticSchema[]` |
| 2 | 304 | createSemantic | sdd.upsertSemantic | INSERT semantic ON DUPLICATE KEY UPDATE | [semanticCode, displayName, description, artifactFilenamePatterns] | sdd_skill_semantics | **yes** S2 | `CreateSddSemanticRequestSchema` → `SddSemanticSchema` |
| 3 | 323 | createSemantic | sdd.findSemanticIdByCode | SELECT id WHERE semantic_code=? | [semanticCode] | sdd_skill_semantics | yes S2 | — |
| 4 | 333 | createSemantic | sdd.upsertSemanticAlias | INSERT alias ON DUPLICATE KEY UPDATE（循环 N 次） | [semanticId, skillName] | sdd_skill_aliases | yes S2 | — |
| 5 | 358 | updateSemantic | sdd.updateSemantic | UPDATE semantic SET ... WHERE id=? | [displayName, description, artifactFilenamePatterns, id] | sdd_skill_semantics | yes S3 | `UpdateSddSemanticRequestSchema` |
| 6 | 374 | updateSemantic | sdd.deleteSemanticAliases | DELETE FROM aliases WHERE semantic_id=? | [id] | sdd_skill_aliases | yes S3 | — |
| 7 | 376 | updateSemantic | sdd.insertSemanticAlias | INSERT alias（无 ON DUPLICATE）×N | [id, skillName] | sdd_skill_aliases | yes S3 | — |
| 8 | 397 | deleteSemantic | sdd.deleteSemanticAliases | DELETE FROM aliases WHERE semantic_id=? | [id] | sdd_skill_aliases | yes S4 | — |
| 9 | 398 | deleteSemantic | sdd.deleteSemantic | DELETE FROM semantics WHERE id=? | [id] | sdd_skill_semantics | yes S4 | — |

### 1B. Overview / Funnel / Skill Analytics

| # | 行 | 方法 | 建议命名 | SQL 摘要 | 动态参数 | 涉及表 | 事务 | Zod schema |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 10 | 424 | getOverview | sdd.countOverviewUsage | SELECT COUNT(DISTINCT user_id) + COUNT(*) FROM sdd_skill_usages | timeRange | sdd_skill_usages | no | `SddOverviewSchema.usages` |
| 11 | 432 | getOverview | sdd.countOverviewWorkItems | SELECT COUNT(*) FROM sdd_work_items | timeRange | sdd_work_items | no | `SddOverviewSchema.workItems` |
| 12 | 438 | getOverview | sdd.countOverviewArtifacts | SELECT COUNT(*) FROM artifacts WHERE artifact_type IN (proposal,design,task,codereview) AND time | timeRange + 固定 artifact_type 列表 | sdd_work_item_artifacts | no | `SddOverviewSchema.documents` |
| 13 | 465 | getFunnel | sdd.countInteractions | SELECT COUNT(*) FROM sdd_interactions WHERE started_at 范围 | timeRange | sdd_interactions | no | `SddFunnelSchema.totalInteractions` |
| 14 | 469 | getFunnel | sdd.aggregateInteractionQuality | SELECT SUM 条件计数（prompt/response/paired/failed） | timeRange | sdd_interactions, sdd_interaction_texts | no | `SddFunnelSchema.quality` |
| 15 | 483 | getFunnel | sdd.aggregateSemanticDistribution | SELECT semantic_code, COUNT, COUNT(DISTINCT user_id/work_item_id) GROUP BY semantic | timeRange | sdd_skill_usages, sdd_skill_semantics | no | `SddFunnelSchema.semantics` |
| 16 | 539 | getSkillAnalytics | sdd.topSemanticsByWindow | SELECT Top 10 by COUNT GROUP BY semantic | currentWindow(from/to) | sdd_skill_usages, sdd_skill_semantics | no | `SddSkillAnalyticsSchema.top` |
| 17 | 552 | getSkillAnalytics | sdd.aggregateSemanticMatchHealth | SELECT SUM(matched/unmatched) | currentWindow | sdd_skill_usages | no | `SddSkillAnalyticsSchema.matchHealth` |
| 18 | 560 | getSkillAnalytics | sdd.topUnmatchedSkills | SELECT raw_skill_name, COUNT WHERE semantic_id IS NULL GROUP BY Top 5 | currentWindow | sdd_skill_usages | no | `SddSkillAnalyticsSchema.unmatched` |
| 19 | 672 | getSkillTimeseries | sdd.bucketizeSkillUsage | SELECT FLOOR(TIMESTAMPDIFF/bucketSeconds), COUNT, SUM(paired) GROUP BY bucket | [window.from, bucketSeconds, window.from, window.to] | sdd_skill_usages, sdd_interactions, sdd_interaction_texts | no | `SddSkillTimeseriesSchema` |

### 1C. Usage Summary / Listing 系列

| # | 行 | 方法 | 建议命名 | SQL 摘要 | 动态参数 | 涉及表 | 事务 | Zod schema |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 20 | 709 | getUsageSummary | sdd.countUsageSummary | SELECT COUNT(*) FROM 子查询 GROUP BY semantic/skill | buildUsageSummaryWhere 输出（timeRange 必填 + semanticCode/status/matched/keyword 可选） | sdd_skill_usages, sdd_skill_semantics | no | `SddUsageSummaryResponseSchema.total` |
| 21 | 720 | getUsageSummary | sdd.listUsageSummary | SELECT semantic_code, COUNT, COUNT(DISTINCT ...), MIN/MAX event_time GROUP BY，分页 | 同上 + pageSize + offset | 同上 | no | `SddUsageSummaryItemSchema[]` |
| 22 | 744 | getUsageSummary | sdd.aggregateVersionsByRawSkillNames | SELECT raw_skill_name, COALESCE(version), COUNT GROUP BY，WHERE IN (?)×N 动态展开 | buildUsageSummaryWhere 输出 + rawSkillNames 数组 | sdd_skill_usages, sdd_skill_semantics | no | `SddUsageSummaryItemSchema.versions` |
| 23 | 791 | listUsages | sdd.listUsages | SELECT 用量字段 JOIN semantics ORDER BY id DESC LIMIT | buildUsageWhere 输出 + cursor | sdd_skill_usages, sdd_skill_semantics | no | `SddUsageItemSchema[]` |
| 24 | 838 | listInteractions | sdd.listInteractions | SELECT 交互字段 JOIN texts，可选 EXISTS 子查询过滤 semantic | buildInteractionWhere 输出 + cursor | sdd_interactions, sdd_interaction_texts, sdd_skill_usages（subquery）, sdd_skill_semantics（subquery） | no | `SddInteractionItemSchema[]` |
| 25 | 858 | getInteractionDetail | sdd.getInteractionDetail | SELECT 详情 + 文本 WHERE id=? | [interactionId] | sdd_interactions, sdd_interaction_texts | no | `SddInteractionDetailSchema` |
| 26 | 889 | listInteractionToolCalls | sdd.listInteractionToolCalls | SELECT tool_call WHERE interaction_id=? ORDER BY sequence | [interactionId] | sdd_interaction_tool_calls | no | `SddInteractionToolCallSchema[]` → `SddInteractionToolCallListResponseSchema` |

### 1D. Errors / Users / Versions / Work Items

| # | 行 | 方法 | 建议命名 | SQL 摘要 | 动态参数 | 涉及表 | 事务 | Zod schema |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 27 | 940 | listErrors | sdd.listErrors | SELECT 错误字段 JOIN interactions + usages + semantics GROUP BY ORDER BY id DESC | buildErrorWhere 输出 + cursor | sdd_errors, sdd_interactions, sdd_skill_usages, sdd_skill_semantics | no | `SddErrorItemSchema[]` |
| 28 | 973 | listUsers | sdd.listUsers | SELECT 用户 + COUNT(DISTINCT usage/interaction) GROUP BY LIMIT 200 | 无 | sdd_users, sdd_skill_usages, sdd_interactions | no | `SddUserItemSchema[]` |
| 29 | 1004 | listVersions | sdd.listVersions | SELECT COALESCE(version), COUNT, COUNT(DISTINCT user), MAX(event_time) GROUP BY LIMIT 100 | 无 | sdd_skill_usages | no | `SddVersionItemSchema[]` |
| 30 | 1033 | listWorkItems | sdd.listWorkItems | SELECT work_item 字段 ORDER BY id DESC LIMIT | cursor 可选 | sdd_work_items | no | `SddWorkItemSchema[]` |
| 31 | 1049 | getWorkItemDetail | sdd.getWorkItem | SELECT work_item WHERE id=? | [workItemId] | sdd_work_items | no | `SddWorkItemDetailSchema.workItem` |
| 32 | 1057 | getWorkItemDetail | sdd.listWorkItemArtifacts | SELECT artifacts WHERE work_item_id=? | [workItemId] | sdd_work_item_artifacts | no | `SddWorkItemDetailSchema.artifacts` |
| 33 | 1064 | getWorkItemDetail | sdd.countWorkItemUsages | SELECT COUNT(*) FROM usages WHERE work_item_id=? | [workItemId] | sdd_skill_usages | no | `SddWorkItemDetailSchema.usageCount` |
| 34 | 1068 | getWorkItemDetail | sdd.countWorkItemErrors | SELECT COUNT(*) FROM errors WHERE work_item_id=? | [workItemId] | sdd_errors | no | `SddWorkItemDetailSchema.errorCount` |
| 35 | 1096 | reportUserSettings | sdd.upsertUserSettings | INSERT user ON DUPLICATE KEY UPDATE | [userKey, installId, userName, machineId, machineName, requirementsRootPath, wikiRootPath, settingsJson] | sdd_users | no | `ReportUserSettingsRequestSchema` |

### 1E. 内部辅助查询（被多端点共用，但不直接对外）

| # | 行 | 方法 | 建议命名 | SQL 摘要 | 动态参数 | 涉及表 | 事务 | Zod schema |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 36 | 1194 | querySkillAnalyticsKpis | sdd.skillAnalyticsKpis | 6 个 sub-SELECT COUNT（interactions/usages/distinct users/distinct work items/failed/matched） | [from, to]×6 | sdd_interactions, sdd_skill_usages | no | `SddSkillAnalyticsSchema.kpis` |
| 37 | 1229 | querySkillQuality | sdd.skillQualityWithTrigger | sub-SELECT triggered count + COUNT(i.id) + SUM(prompt/response/paired/failed) | [from, to, from, to] | sdd_skill_usages（subquery）, sdd_interactions, sdd_interaction_texts | no | `SddSkillAnalyticsSchema.quality` |

---

## 第二节：Ingest 模块（11 条 = 7 + 4）

### 2A. ingest-write.repository.ts（被 ingest-receive.service 通过 TypeOrmUnitOfWork 包入 S1 事务）

| # | 行 | 方法 | 建议命名 | SQL 摘要 | 动态参数 | 涉及表 | 事务 | Zod schema |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 38 | 34 | recordReceive | ingest.touchDuplicateBatch | UPDATE batch SET duplicate_count++, last_duplicate_at WHERE id=? | [existingBatch.id] | otel_ingest_batches | **yes** S1 | — |
| 39 | 72 | findBatchByPayloadHash | ingest.findBatchByHashForUpdate | SELECT id, status WHERE payload_hash=? FOR UPDATE | [payloadHash] | otel_ingest_batches | yes S1 | — |
| 40 | 87 | upsertUser | ingest.upsertUser | INSERT user ON DUPLICATE KEY UPDATE（合并 install_id/machine_id/...） | [userKey, installId, userName, machineId, machineName, osPlatform, ...] | sdd_users | yes S1 | — |
| 41 | 122 | upsertUser | ingest.findUserIdByKey | SELECT id WHERE user_key=? | [userKey] | sdd_users | yes S1 | — |
| 42 | 139 | insertBatch | ingest.insertBatch | INSERT new batch（status='received'） | [payloadHash, userId, payloadBytes, rawLogCount] | otel_ingest_batches | yes S1 | — |
| 43 | 161 | insertRawPayload | ingest.insertRawPayload | INSERT raw payload + 自动过期日期 | [batchId, payloadJson, payloadBytes, contentType, rawRetentionDays] | otel_raw_payloads | yes S1 | — |
| 44 | 176 | ensureCleanBatchOutbox | ingest.ensureCleanBatchOutbox | INSERT outbox event_type='clean_batch' ON DUPLICATE KEY UPDATE | [batchId, jsonPayload, batchId] | ingest_outbox | yes S1 | — |

→ S1 事务对外暴露端点：`POST /api/ingest/otlp-logs` → `IngestLogsResponseSchema`

### 2B. ingest-health.service.ts（只读 health/list）

| # | 行 | 方法 | 建议命名 | SQL 摘要 | 动态参数 | 涉及表 | 事务 | Zod schema |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 45 | 61 | getHealth | ingest.aggregateHealth | SELECT COUNT, SUM(parsed/processing/failed/duplicate), SUM(payload_bytes), MAX(received_at) WHERE received_at >= NOW - ? HOUR | windowHours | otel_ingest_batches | no | `IngestHealthSchema.batches` |
| 46 | 75 | getHealth | ingest.countPendingOutbox | SELECT COUNT(*) FROM outbox WHERE status IN ('pending','dispatching') | 无 | ingest_outbox | no | `IngestHealthSchema.outbox` |
| 47 | 121 | listBatches | ingest.listBatches | SELECT batch 字段 WHERE status IN (?)*N AND id<cursor ORDER BY id DESC LIMIT | [statusList?, cursor?, limit] | otel_ingest_batches | no | `BatchListItemSchema[]` |
| 48 | 141 | getBatchDetail | ingest.getBatchDetail | SELECT b.*, r.payload_json, o.outbox_状态 JOIN raw_payloads LEFT JOIN outbox WHERE b.id=? | [batchId] | otel_ingest_batches, otel_raw_payloads, ingest_outbox | no | `BatchDetailSchema` |

---

## 第三节：Cleaning Worker（21 条，cleaning-worker.ts）

完整流程参见 [cleaning-steps.md](./cleaning-steps.md)；事务划分参见 [transaction-registry.md W1/W2](./transaction-registry.md)。

| # | 行 | 函数 | 建议命名 | SQL 摘要 | 动态参数 | 涉及表 | 事务 | 说明 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 49 | 186 | markBatchFailed | clean.markBatchFailed | UPDATE batch status=failed_terminal/retryable + last_error | [status, reason, errMsg, batchId] | otel_ingest_batches | no | catch 路径 |
| 50 | 210 | markBatchProcessing | clean.lockAndLoadBatch | SELECT b + raw_payload FOR UPDATE WHERE id=? | [batchId] | otel_ingest_batches, otel_raw_payloads | yes W1 | Step 1 |
| 51 | 233 | markBatchProcessing | clean.markBatchProcessing | UPDATE batch status='processing' + retry_count++ | [batchId] | otel_ingest_batches | yes W1 | Step 1 |
| 52 | 326 | acquireCleaningLocks | clean.getNamedLock | SELECT GET_LOCK(?, 10) AS lock_status | [lockName]×N（按 sha256 sorted） | （连接级锁） | yes W2 | Step 3.2 |
| 53 | 348 | releaseCleaningLocks | clean.releaseNamedLock | SELECT RELEASE_LOCK(?) | [lockName]×N（reverse） | （连接级锁） | yes W2 finally | Step 3.10 |
| 54 | 365 | upsertLogEvent | clean.upsertLogEvent | INSERT log_event ON DUPLICATE KEY UPDATE（20 字段） | [event_id, batch_id, user_id, session_id, prompt_id, trace_id, span_id, event_name, ..., retentionDays] | otel_log_events | yes W2 | Step 3.1 ×N |
| 55 | 441 | loadScopedEvents | clean.loadScopedEvents | SELECT events WHERE batch_id=? OR prompt_id IN (?)*N OR session_id IN (?)*N | [batchId, ...promptIds, ...sessionIds]（动态拼接） | otel_log_events | yes W2 | Step 3.3 |
| 56 | 517 | upsertInteractions | clean.upsertInteraction | INSERT interaction ON DUPLICATE KEY UPDATE（30 字段 + COALESCE/GREATEST 合并） | 30 字段全动态 | sdd_interactions | yes W2 | Step 3.4 |
| 57 | 609 | upsertInteractions | clean.upsertInteractionText | INSERT interaction_text ON DUPLICATE KEY UPDATE + 自动过期 | [interactionId, promptText, responseText, responseJson, textRetentionDays] | sdd_interaction_texts | yes W2 | Step 3.4 |
| 58 | 675 | upsertToolCalls | clean.upsertToolCall | INSERT tool_call ON DUPLICATE KEY UPDATE（含 JSON_MERGE_PATCH） | 16 字段全动态 | sdd_interaction_tool_calls | yes W2 | Step 3.5 |
| 59 | 732 | upsertSkillUsages | clean.loadAllAliases | SELECT all alias_id/semantic_id/skill_name | 无 | sdd_skill_aliases | yes W2 | Step 3.6 (prep) |
| 60 | 755 | upsertSkillUsages | clean.upsertSkillUsage | INSERT skill_usage ON DUPLICATE KEY UPDATE | [usageKey(sha256), semantic_id, alias_id, interaction_id, work_item_id, user_id, session_id, prompt_id, raw_skill_name, skill_source, invocation_trigger, command_name, service_version, observed_version, matchedBy, rule_version, status, event_time] | sdd_skill_usages | yes W2 | Step 3.6 |
| 61 | 834 | upsertErrors | clean.upsertError | INSERT error ON DUPLICATE KEY UPDATE | [error_key, user_id, batch_id, event_id, interaction_id, usage_id, work_item_id, error_type, severity, source, retryable, error_message_hash, error_message, stack_hash, stack_trace, event_time] | sdd_errors | yes W2 | Step 3.8 |
| 62 | 933 | upsertWorkItems | clean.upsertWorkItem | INSERT work_item ON DUPLICATE KEY UPDATE | [work_item_key, repo_name, business_domain, work_item_slug, work_item_title, relative_dir, first_seen_at, last_seen_at] | sdd_work_items | yes W2 | Step 3.7 |
| 63 | 966 | upsertWorkItems | clean.upsertWorkItemArtifact | INSERT artifact ON DUPLICATE KEY UPDATE | [artifact_key, work_item_id, artifact_type, relative_path, full_path, system_module, first_seen_event_id, first_seen_at, last_seen_at] | sdd_work_item_artifacts | yes W2 | Step 3.7 |
| 64 | 1048 | loadUserRequirementsRoots | clean.loadUserRequirementsRoots | SELECT user_id, requirements_root_path WHERE id IN (?)*N | [...userIds]（动态展开） | sdd_users | yes W2 | 辅助 |
| 65 | 1068 | loadSkillSemanticMatchers | clean.loadAllSemanticMatchers | SELECT semantics + alias LEFT JOIN | 无 | sdd_skill_semantics, sdd_skill_aliases | yes W2 | 辅助 |
| 66 | 1230 | findUsageAndWorkItemForError | clean.findUsageForError | SELECT usage WHERE session_id=? AND (? IS NULL OR event_time<=?) LIMIT 1 | [session_id, errorEventTime, errorEventTime] | sdd_skill_usages | yes W2 | 辅助 |
| 67 | 1258 | linkSkillUsageToWorkItem | clean.linkUsageToWorkItem | UPDATE usage SET work_item_id WHERE session_id=? AND raw_skill_name=? AND time | [workItemId, session_id, raw_skill_name, workItemId, artifactEventTime, artifactEventTime] | sdd_skill_usages | yes W2 | Step 3.7 后置 |
| 68 | 1283 | markBatchParsed | clean.markBatchParsed | UPDATE batch status='parsed' + event_count + derived_count + parse_duration | [eventCount, derivedCount, batchId] | otel_ingest_batches | no | Step 4 |
| 69 | 2020 | selectIdByKey | clean.selectIdByKey | SELECT id FROM {table} WHERE {key}=? LIMIT 1（动态表/列名） | [key]（key 类型：interaction_key / work_item_key） | sdd_interactions 或 sdd_work_items | yes W2 | 辅助 |

---

## 第四节：Events 模块（7 条，events-query.service.ts）

| # | 行 | 方法 | 建议命名 | SQL 摘要 | 动态参数 | 涉及表 | 事务 | Zod schema |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 70 | 69 | getDistribution | events.countTotal | SELECT COUNT(*) WHERE event_time IN range | [startMs, endMs] | otel_log_events | no | `EventDistributionSchema.total` |
| 71 | 73 | getDistribution | events.countDistinctEventNames | SELECT COUNT(DISTINCT event_name) | [startMs, endMs] | otel_log_events | no | `EventDistributionSchema.distinct` |
| 72 | 77 | getDistribution | events.aggregateByEventName | SELECT event_name, COUNT, MAX(event_time) GROUP BY ORDER BY count DESC LIMIT | [startMs, endMs, limit] | otel_log_events | no | `EventDistributionItemSchema[]` |
| 73 | 112 | getFieldCoverage | events.countTotal（同 70） | SELECT COUNT(*) | [startMs, endMs] | otel_log_events | no | `FieldCoverageSchema.total` |
| 74 | 116 | getFieldCoverage | events.sampleEvents1k | SELECT 1000 条样本 | [startMs, endMs] | otel_log_events | no | `FieldCoverageSchema.samples` |
| 75 | 186 | getFieldValues | events.sampleEvents5k | SELECT 5000 条样本 | [startMs, endMs] | otel_log_events | no | `FieldValuesSchema` |
| 76 | 232 | getTimeline | events.bucketizeByTimestamp | SELECT DATE_FORMAT 分桶 + COUNT + COUNT(DISTINCT event_name) GROUP BY bucket | [startMs, endMs, bucketFormat] | otel_log_events | no | `EventTimelineSchema` |

---

## 第五节：Ops 模块（7 条，ops-query.service.ts）

⚠️ **特殊：动态表名 + 白名单**。`tableName` 参数从 URL 路径取，受白名单校验（详见 `allowedTables` 数组，包含 12 个表名）。

| # | 行 | 方法 | 建议命名 | SQL 摘要 | 动态参数 | 涉及表 | 事务 | Zod schema |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 77 | 91 | listTables | ops.listAllowedTables | SELECT table_name, update_time FROM information_schema.tables WHERE table_name IN (?)×12 | [...allowedTables] | information_schema.tables | no | `OpsTableSchema[]` |
| 78 | 102 | listTables | ops.countRowsByTable | SELECT COUNT(*) FROM \`{name}\`（循环×12） | 动态表名（白名单） | 白名单 12 表 | no | `OpsTableSchema.rowCount` |
| 79 | 147 | listTableRows | ops.listTableRows | SELECT * FROM \`{table}\` WHERE filters AND id<cursor ORDER BY {orderBy} LIMIT | tableName + filters[] + orderBy + order + cursor + limit | 白名单表 | no | `OpsTableRowsResponseSchema` |
| 80 | 185 | getTableRow | ops.getTableRow | SELECT * FROM \`{table}\` WHERE id=? LIMIT 1 | [tableName, id] | 白名单表 | no | `OpsTableRowResponseSchema` |
| 81 | 202 | getQueue | ops.aggregateOutboxStatus | SELECT SUM(pending) + SUM(dispatching) + SUM(failed_terminal) | 无 | ingest_outbox | no | `OpsQueueSchema` |
| 82 | 229 | listJobs | ops.listOutboxJobs | SELECT outbox 字段 WHERE id<cursor ORDER BY id DESC LIMIT | [cursor?, limit] | ingest_outbox | no | `OpsJobSchema[]` |
| 83 | 265 | listColumnsForTables | ops.listTableColumns | SELECT column_name/type/length/etc FROM information_schema.columns WHERE table_name IN (?)×N | [...tableNames] | information_schema.columns | no | `OpsColumnSchema[]` |

---

## 第六节：Scheduled Cleaning Runner（5 条）

| # | 行 | 函数 | 建议命名 | SQL 摘要 | 动态参数 | 涉及表 | 事务 | 说明 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 84 | 92 | claimOneOutbox | schedule.claimOutbox | SELECT outbox FOR UPDATE WHERE status IN ('pending','dispatching') AND retry_at OK AND lock OK LIMIT 1 | 无（字面值） | ingest_outbox | yes W6 | claim |
| 85 | 109 | claimOneOutbox | schedule.markOutboxDispatching | UPDATE outbox SET status='dispatching' + attempts++ + locked_by + locked_until | [workerId, lockSeconds, id] | ingest_outbox | yes W6 | claim 后翻状态 |
| 86 | 120 | claimOneOutbox | schedule.markBatchQueued | UPDATE batch SET status='queued' WHERE id=? AND status IN (received, failed_retryable) | [aggregateId] | otel_ingest_batches | yes W6 | claim 同步 batch 状态 |
| 87 | 140 | markOutboxSucceeded | schedule.markOutboxDispatched | UPDATE outbox SET status='dispatched' + dispatched_at | [id] | ingest_outbox | no | dispatch 完成 |
| 88 | 162 | markOutboxFailed | schedule.markOutboxFailedOrRetry | UPDATE outbox SET status=IF(terminal,'failed_terminal','pending') + next_retry_at（退避） | [statusValue, terminal, retrySeconds, errMsg, id] | ingest_outbox | no | dispatch 失败 |

---

## 第七节：动态参数组合矩阵（吸收原任务 3）

凡含动态 WHERE 拼接的 SQL，组合矩阵在此节穷举。**所有矩阵中"timeRange 必填"指 query schema 强制要求 `from + to` 或 `timeRange`**（详见 `TimeRangeQuerySchema`）。

### 7.1 `buildUsageSummaryWhere`（SQL #20/#21/#22）

来源：`server/src/modules/sdd/sdd-query.service.ts` 中的 `SddUsageSummaryQuerySchema`（contract 第 78 行）。

| 组合 | 参数 | 拼出的 WHERE 片段 |
| --- | --- | --- |
| 最小 | timeRange | `u.event_time BETWEEN ? AND ?` |
| 含语义过滤 | timeRange + semanticCode | + `AND s.semantic_code = ?` |
| 含状态过滤 | timeRange + status | + `AND u.status = ?` |
| 含匹配过滤 | timeRange + matched=true | + `AND u.semantic_id IS NOT NULL` |
| 含匹配过滤 | timeRange + matched=false | + `AND u.semantic_id IS NULL` |
| 含关键字 | timeRange + keyword | + `AND (u.raw_skill_name LIKE ? OR s.display_name LIKE ?)` |
| 全开 | timeRange + semanticCode + status + matched + keyword | 上述 5 条合并 |

### 7.2 `buildUsageWhere`（SQL #23）

来源：`SddListQuerySchema`（contract 第 68 行）。

| 组合 | 参数 | 拼出的 WHERE 片段 |
| --- | --- | --- |
| 最小 | (无强制) | （无 WHERE，仅 ORDER BY + LIMIT） |
| timeRange 单独 | timeRange | `WHERE u.event_time BETWEEN ? AND ?` |
| + 用户/会话/工作项过滤 | + userId / sessionId / promptId / workItemId | 任意组合 `AND u.<field> = ?` |
| + 业务过滤 | + status / rawSkillName / semanticCode | 任意组合 `AND u.<field> = ?` / `s.semantic_code = ?` |
| + 分页 | + cursor | + `AND u.id < ?` |

实际矩阵 = 2^8 = 256 种组合，但大部分组合无业务意义。**dal v2 mapper 设计建议**：把所有 8 个可选字段定义为 nullable parameter，让 mapper 自动跳过 null。

### 7.3 `buildInteractionWhere`（SQL #24）

来源：同 7.2。

| 组合 | 参数 | 拼出的 WHERE 片段 |
| --- | --- | --- |
| 同 7.2 8 字段组合 | timeRange + userId + sessionId + promptId + workItemId + status + rawSkillName + cursor | 任意组合 |
| + 语义子查询 | + semanticCode | + `AND EXISTS (SELECT 1 FROM sdd_skill_usages u JOIN sdd_skill_semantics s WHERE u.interaction_id = i.id AND s.semantic_code = ?)` |

### 7.4 `buildErrorWhere`（SQL #27）

来源：同 7.2，但少 rawSkillName / status / semanticCode 三个字段。

| 组合 | 参数 |
| --- | --- |
| timeRange + userId + sessionId + workItemId + cursor 任意组合 | 同 7.2 模式 |

### 7.5 `claimOutboxRows` / `claimOneOutbox`（SQL #84）

WHERE 子句**固定**，仅取决于运行时 `CURRENT_TIMESTAMP(3)` 比较和 outbox 行状态。组合矩阵：

| 场景 | next_retry_at | locked_until | attempts vs max_attempts | 行为 |
| --- | --- | --- | --- | --- |
| 新行 | NULL | NULL | < | claim |
| 退避中 | future | NULL | < | 不 claim |
| 退避到期 | past | NULL | < | claim |
| 锁未到期 | NULL | future | < | 不 claim（被另一个 worker 持有） |
| 锁过期 | NULL | past | < | claim（前 worker 已挂） |
| 重试耗尽 | * | * | >= | 不 claim，scheduled-cleaning-runner 跳过 |

### 7.6 `loadScopedEvents`（SQL #55）

| 组合 | promptIds | sessionIds | WHERE 形态 |
| --- | --- | --- | --- |
| 仅 batch | 空 | 空 | `WHERE batch_id = ?` |
| batch + prompt | n 个 | 空 | `WHERE batch_id = ? OR prompt_id IN (?, ..., ?)`（n 个 ?） |
| batch + session | 空 | m 个 | `WHERE batch_id = ? OR session_id IN (?, ..., ?)` |
| 三种全开 | n 个 | m 个 | `WHERE batch_id = ? OR prompt_id IN (?×n) OR session_id IN (?×m)` |

### 7.7 `listBatches`（SQL #47）

| 组合 | status[] | cursor | WHERE 形态 |
| --- | --- | --- | --- |
| 全量 | undefined | undefined | （无 WHERE） |
| 状态过滤 | k 个 | undefined | `WHERE status IN (?×k)` |
| 翻页 | undefined | id | `WHERE id < ?` |
| 状态 + 翻页 | k 个 + id | | `WHERE status IN (?×k) AND id < ?` |

### 7.8 `getHealth`（SQL #45）

| 组合 | windowHours | WHERE 形态 |
| --- | --- | --- |
| 仅 | windowHours=1 | `WHERE received_at >= DATE_SUB(CURRENT_TIMESTAMP(3), INTERVAL 1 HOUR)` |
| | windowHours=24 | 同上替换 24 |
| | windowHours=168 | 同上替换 168 |

仅一个参数变量化，矩阵简单。

### 7.9 Ops 动态表名（SQL #79/#80）

`tableName` 必须在白名单 `allowedTables` 中（详见 ops-query.service.ts:38-50，含 12 个表名）。

`filters[]` 来自 query body（POST 提交的过滤组），每个 filter 含 `column / operator / value`，operator ∈ `OpsFilterOperatorSchema`（contract 第 26 行，含 14 种操作符）。

`orderBy` 必须是该表的合法列名。

---

## 第八节：端点 → Service 方法 → SQL → Zod Schema 关联表

29 个端点的完整映射，吸收原任务"endpoint-contract-map.md"产出物。

### 8.1 ingest 模块（4 端点）

| 方法 | 路径 | Service 方法 | SQL # | 请求 schema | 响应 schema |
| --- | --- | --- | --- | --- | --- |
| POST | `/api/ingest/otlp-logs` | IngestReceiveService.receive | #38-44 | `OtlpLogsPayloadSchema` | `IngestLogsResponseSchema` |
| GET | `/api/ingest/health` | IngestHealthService.getHealth | #45-46 | `IngestHealthQuerySchema` | `IngestHealthSchema` |
| GET | `/api/ingest/batches` | IngestHealthService.listBatches | #47 | `BatchListQuerySchema` | `BatchListResponseSchema` |
| GET | `/api/ingest/batches/:batchId` | IngestHealthService.getBatchDetail | #48 | (path) | `BatchDetailSchema` |

### 8.2 events 模块（4 端点）

| 方法 | 路径 | Service 方法 | SQL # | 请求 schema | 响应 schema |
| --- | --- | --- | --- | --- | --- |
| GET | `/api/events/distribution` | EventsQueryService.getDistribution | #70-72 | `EventDistributionQuerySchema` | `EventDistributionSchema` |
| GET | `/api/events/field-coverage` | EventsQueryService.getFieldCoverage | #73-74 | `TimeRangeQuerySchema` | `FieldCoverageSchema` |
| GET | `/api/events/field-values` | EventsQueryService.getFieldValues | #75 | `FieldValuesQuerySchema` | `FieldValuesSchema` |
| GET | `/api/events/timeline` | EventsQueryService.getTimeline | #76 | `EventTimelineQuerySchema` | `EventTimelineSchema` |

### 8.3 sdd 模块（15 @Get + 2 @Post + 1 @Put = 18 端点）

| 方法 | 路径 | Service 方法 | SQL # | 请求 schema | 响应 schema |
| --- | --- | --- | --- | --- | --- |
| GET | `/api/sdd/semantics` | SddQueryService.listSemantics | #1 | — | `SddSemanticSchema[]` |
| POST | `/api/sdd/semantics` | SddQueryService.createSemantic | #2-4 | `CreateSddSemanticRequestSchema` | `SddSemanticSchema` |
| PUT | `/api/sdd/semantics/:id` | SddQueryService.updateSemantic | #5-7 | `UpdateSddSemanticRequestSchema` | `SddSemanticSchema` |
| GET | `/api/sdd/overview` | SddQueryService.getOverview | #10-12 | `SddOverviewQuerySchema` | `SddOverviewSchema` |
| GET | `/api/sdd/funnel` | SddQueryService.getFunnel | #13-15 | `SddFunnelQuerySchema` | `SddFunnelSchema` |
| GET | `/api/sdd/skill-analytics` | SddQueryService.getSkillAnalytics | #16-18, 36, 37 | `SddSkillAnalyticsQuerySchema` | `SddSkillAnalyticsSchema` |
| GET | `/api/sdd/skill-timeseries` | SddQueryService.getSkillTimeseries | #19 | `SddSkillTimeseriesQuerySchema` | `SddSkillTimeseriesSchema` |
| GET | `/api/sdd/usage-summary` | SddQueryService.getUsageSummary | #20-22 | `SddUsageSummaryQuerySchema` | `SddUsageSummaryResponseSchema` |
| GET | `/api/sdd/usages` | SddQueryService.listUsages | #23 | `SddListQuerySchema` | `SddUsageItemSchema[]` |
| GET | `/api/sdd/interactions` | SddQueryService.listInteractions | #24 | `SddListQuerySchema` | `SddInteractionItemSchema[]` |
| GET | `/api/sdd/interactions/:interactionId` | SddQueryService.getInteractionDetail | #25 | (path) | `SddInteractionDetailSchema` |
| GET | `/api/sdd/interactions/:interactionId/tool-calls` | SddQueryService.listInteractionToolCalls | #26 | (path) | `SddInteractionToolCallListResponseSchema` |
| GET | `/api/sdd/errors` | SddQueryService.listErrors | #27 | `SddListQuerySchema` | `SddErrorItemSchema[]` |
| GET | `/api/sdd/users` | SddQueryService.listUsers | #28 | — | `SddUserItemSchema[]` |
| GET | `/api/sdd/versions` | SddQueryService.listVersions | #29 | — | `SddVersionItemSchema[]` |
| GET | `/api/sdd/work-items` | SddQueryService.listWorkItems | #30 | `PaginationQuerySchema` | `SddWorkItemSchema[]` |
| GET | `/api/sdd/work-items/:workItemId` | SddQueryService.getWorkItemDetail | #31-34 | (path) | `SddWorkItemDetailSchema` |
| POST | `/api/sdd/user-settings` | SddQueryService.reportUserSettings | #35 | `ReportUserSettingsRequestSchema` | （200 OK） |

### 8.4 ops 模块（5 端点）

| 方法 | 路径 | Service 方法 | SQL # | 请求 schema | 响应 schema |
| --- | --- | --- | --- | --- | --- |
| GET | `/api/ops/tables` | OpsQueryService.listTables | #77-78, 83 | — | `OpsTablesResponseSchema` |
| GET | `/api/ops/tables/:tableName/rows` | OpsQueryService.listTableRows | #79 | `OpsTableRowsQuerySchema` | `OpsTableRowsResponseSchema` |
| GET | `/api/ops/tables/:tableName/rows/:id` | OpsQueryService.getTableRow | #80 | (path) | `OpsTableRowResponseSchema` |
| GET | `/api/ops/jobs` | OpsQueryService.listJobs | #82 | `PaginationQuerySchema` | `OpsJobsResponseSchema` |
| GET | `/api/ops/queue` | OpsQueryService.getQueue | #81 | — | `OpsQueueSchema` |

合计 **4 + 4 + 18 + 5 = 31 端点**（27 @Get + 3 @Post + 1 @Put），对应到 SQL #1-#37（共 37 条业务 SQL）。

worker 端 SQL（#49-#88）不对应任何 controller 端点，由定时任务驱动。

---

## 第九节：迁移建议

1. **试点模块**：建议从 **sdd-query.service.ts** 入手——37 条 SQL、最复杂的动态 WHERE、含事务和读两类、有完整 contract 关联。先把它的 dal v2 DAO + transaction adapter 跑通，再扩到其他模块就是模板化复制。
2. **复用违反顺手解决**：sdd-query.service.ts 的 createSemantic/updateSemantic/deleteSemantic（S2/S3/S4）当前直接调 `dataSource.transaction()`，迁移时一并接入 dal v2 transaction adapter，消除"已有抽象未复用"。
3. **`buildXxxWhere` 三个动态拼接函数（7.1-7.4）建议封装为 dal v2 的可选 nullable 参数 mapper**——不要把 SQL 字符串直接传给 dal v2，让 mapper 自动跳过 null。这是减少迁移代码量的关键。
4. **ops 模块动态表名是 dal v2 短板**——dal v2 通常要求表名编译期确定。建议迁移时把 ops 端点保留为 raw SQL + 白名单方案，**不走 DAO**。
5. **死代码 outbox-dispatcher.ts 在迁移前后均不要动**，避免节外生枝；迁移完成后作为独立清理项删除（同 BullMQ 死代码 + Redis docker 服务）。
