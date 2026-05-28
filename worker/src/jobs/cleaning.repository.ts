import type { Pool, PoolConnection, ResultSetHeader, RowDataPacket } from 'mysql2/promise';

export interface LoadedBatch {
  batchId: string;
  userId: string | null;
  payloadJson: string;
}

export interface BatchRow extends RowDataPacket {
  id: string;
  user_id: string | null;
  status: string;
  payload_json: string | null;
}

export interface EventRow extends RowDataPacket {
  id: string;
  event_id: string;
  batch_id: string;
  user_id: string | number | null;
  session_id: string | null;
  prompt_id: string | null;
  trace_id: string | null;
  span_id: string | null;
  event_name: string;
  service_version: string | null;
  severity_text: string | null;
  severity_number: number | null;
  event_time: Date | string | null;
  event_sequence: number | null;
  attributes_json: unknown;
  body_json: unknown;
  body_text: string | null;
}

export interface AliasRow extends RowDataPacket {
  alias_id: string;
  semantic_id: string;
  skill_name: string;
}

export interface UserRequirementsRootRow extends RowDataPacket {
  id: string;
  requirements_root_path: string | null;
}

export interface SemanticPatternRow extends RowDataPacket {
  semantic_id: string;
  semantic_code: string;
  artifact_filename_patterns: unknown;
  skill_name: string | null;
}

interface IdRow extends RowDataPacket {
  id: string;
}

interface UsageWorkItemRow extends RowDataPacket {
  id: string | number | null;
  work_item_id: string | number | null;
}

export interface UpsertLogEventInput {
  eventId: string;
  batchId: string;
  userId: string | null;
  sessionId: string | null;
  promptId: string | null;
  traceId: string | null;
  spanId: string | null;
  eventName: string;
  displayName: string | null;
  serviceName: string | null;
  serviceVersion: string | null;
  severityText: string | null;
  severityNumber: number | null;
  eventTime: Date | string | null;
  eventSequence: number | null;
  observedAt: Date | string | null;
  attributesJson: string | null;
  resourceJson: string | null;
  bodyJson: string | null;
  bodyText: string | null;
  eventRetentionDays: number;
}

export interface UpsertInteractionInput {
  interactionKey: string;
  userId: string | number | null;
  sessionId: string | null;
  promptId: string | null;
  requestEventId: string | null;
  responseEventId: string | null;
  status: string;
  model: string | null;
  commandName: string | null;
  commandSource: string | null;
  pairingMethod: string;
  startedAt: Date | null;
  completedAt: Date | null;
  durationMs: number | null;
  costUsd: number | null;
  inputTokens: number | null;
  outputTokens: number | null;
  cacheReadTokens: number | null;
  cacheCreationTokens: number | null;
  llmCallCount: number;
  toolCallCount: number;
  skillName: string | null;
  agentName: string | null;
  pluginName: string | null;
  querySource: string | null;
  effort: string | null;
  speed: string | null;
  sourceBatchId: string;
  evidenceJson: string | null;
}

export interface UpsertInteractionTextInput {
  interactionId: string;
  promptText: string | null;
  responseText: string | null;
  responseJson: string | null;
  textRetentionDays: number;
}

export interface UpsertToolCallInput {
  interactionId: string;
  skillUsageId: string | null;
  toolUseId: string;
  toolName: string;
  sequence: number;
  decision: string | null;
  decisionSource: string | null;
  success: boolean | null;
  durationMs: number | null;
  inputSizeBytes: number | null;
  resultSizeBytes: number | null;
  errorType: string | null;
  toolInputPreview: string | null;
  mcpServerScope: string | null;
  evidenceJson: string | null;
}

export interface UpsertSkillUsageInput {
  usageKey: string;
  semanticId: string | null;
  aliasId: string | null;
  interactionId: string | null;
  userId: string | number | null;
  sessionId: string | null;
  promptId: string | null;
  rawSkillName: string;
  skillSource: string | null;
  invocationTrigger: string | null;
  commandName: string | null;
  serviceVersion: string | null;
  observedVersion: string | null;
  matchedBy: string;
  eventSequence: number | null;
  eventTime: Date | null;
}

export interface UpsertErrorInput {
  errorKey: string;
  userId: string | number | null;
  batchId: string;
  eventId: string;
  interactionId: string | null;
  usageId: string | null;
  workItemId: string | null;
  errorType: string;
  severity: string;
  source: string | null;
  retryable: number;
  errorMessageHash: string | null;
  errorMessage: string | null;
  stackHash: string | null;
  stackTrace: string | null;
  eventTime: Date | null;
}

export interface UpsertWorkItemInput {
  workItemKey: string;
  requirementsRepoName: string | null;
  businessDomain: string | null;
  workItemSlug: string;
  workItemTitle: string | null;
  relativeDir: string;
  firstSeenAt: Date | null;
  lastSeenAt: Date | null;
}

export interface UpsertWorkItemArtifactInput {
  artifactKey: string;
  workItemId: string;
  artifactType: string;
  artifactRelativePath: string;
  artifactFullPath: string;
  systemModule: string | null;
  firstSeenEventId: string;
  firstSeenAt: Date | null;
  lastSeenAt: Date | null;
}

export interface LinkSkillUsageToWorkItemInput {
  workItemId: string;
  sessionId: string;
  rawSkillName: string;
  artifactEventTime: Date | null;
}

export interface UpsertWikiRecallInput {
  recallKey: string;
  toolCallId: string;
  interactionId: string;
  skillUsageId: string | null;
  workItemId: string | null;
  userId: string | null;
  actionType: string;
  rawPath: string;
  wikiRelativePath: string | null;
  wikiDomain: string | null;
  wikiAxis: string | null;
  wikiSystem: string | null;
  eventId: string | null;
  eventSequence: number | null;
  eventTime: Date | null;
  ruleVersion: string;
}

export class CleaningRepository {
  async markBatchFailed(
    pool: Pool,
    batchId: string,
    status: 'failed_retryable' | 'failed_terminal',
    statusReason: string,
    errorMessage: string,
  ): Promise<void> {
    await pool.query(
      `UPDATE otel_ingest_batches
       SET status = ?,
           status_reason = ?,
           parse_completed_at = CURRENT_TIMESTAMP(3),
           parse_duration_ms = IF(
             parse_started_at IS NULL,
             NULL,
             TIMESTAMPDIFF(MICROSECOND, parse_started_at, CURRENT_TIMESTAMP(3)) DIV 1000
           ),
           last_error = ?,
           gmt_modified = CURRENT_TIMESTAMP(3)
       WHERE id = ?`,
      [status, statusReason, errorMessage, batchId],
    );
  }

  async lockAndLoadBatch(connection: PoolConnection, batchId: string): Promise<BatchRow[]> {
    const [rows] = await connection.query<BatchRow[]>(
      `SELECT b.id, b.user_id, b.status, r.payload_json
       FROM otel_ingest_batches b
       LEFT JOIN otel_raw_payloads r ON r.batch_id = b.id
       WHERE b.id = ?
       LIMIT 1
       FOR UPDATE`,
      [batchId],
    );
    return rows;
  }

  async markBatchProcessing(connection: PoolConnection, batchId: string): Promise<void> {
    await connection.query(
      `UPDATE otel_ingest_batches
       SET status = 'processing',
           status_reason = 'cleaning started',
           parse_started_at = CURRENT_TIMESTAMP(3),
           parse_completed_at = NULL,
           parse_duration_ms = NULL,
           retry_count = retry_count + 1,
           last_error = NULL,
           gmt_modified = CURRENT_TIMESTAMP(3)
       WHERE id = ?`,
      [batchId],
    );
  }

  async upsertLogEvent(
    connection: PoolConnection,
    input: UpsertLogEventInput,
  ): Promise<void> {
    await connection.query<ResultSetHeader>(
      `INSERT INTO otel_log_events
        (event_id, batch_id, user_id, session_id, prompt_id, trace_id, span_id, event_name,
         display_name, service_name, service_version, severity_text, severity_number, event_time,
         event_sequence, observed_at, attributes_json, resource_json, body_json, body_text, expires_at,
         gmt_create, gmt_modified)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
         DATE_ADD(CURRENT_TIMESTAMP(3), INTERVAL ? DAY), CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3))
       ON DUPLICATE KEY UPDATE
         batch_id = VALUES(batch_id),
         user_id = VALUES(user_id),
         session_id = VALUES(session_id),
         prompt_id = VALUES(prompt_id),
         trace_id = VALUES(trace_id),
         span_id = VALUES(span_id),
         event_name = VALUES(event_name),
         display_name = VALUES(display_name),
         service_name = VALUES(service_name),
         service_version = VALUES(service_version),
         severity_text = VALUES(severity_text),
         severity_number = VALUES(severity_number),
         event_time = VALUES(event_time),
         event_sequence = VALUES(event_sequence),
         observed_at = VALUES(observed_at),
         attributes_json = VALUES(attributes_json),
         resource_json = VALUES(resource_json),
         body_json = VALUES(body_json),
         body_text = VALUES(body_text),
         expires_at = VALUES(expires_at),
         gmt_modified = CURRENT_TIMESTAMP(3)`,
      [
        input.eventId,
        input.batchId,
        input.userId,
        input.sessionId,
        input.promptId,
        input.traceId,
        input.spanId,
        input.eventName,
        input.displayName,
        input.serviceName,
        input.serviceVersion,
        input.severityText,
        input.severityNumber,
        input.eventTime,
        input.eventSequence,
        input.observedAt,
        input.attributesJson,
        input.resourceJson,
        input.bodyJson,
        input.bodyText,
        input.eventRetentionDays,
      ],
    );
  }

  async loadScopedEvents(
    connection: PoolConnection,
    clauses: string[],
    params: Array<string | string[]>,
  ): Promise<EventRow[]> {
    const [rows] = await connection.query<EventRow[]>(
      `SELECT id, event_id, batch_id, user_id, session_id, prompt_id, trace_id, span_id, event_name,
              service_version, severity_text, severity_number, event_time, event_sequence,
              attributes_json, body_json, body_text
       FROM otel_log_events
       WHERE ${clauses.map((clause) => `(${clause})`).join(' OR ')}
       ORDER BY event_sequence IS NULL, event_sequence ASC, COALESCE(event_time, gmt_create), id`,
      params,
    );
    return rows;
  }

  async loadSessionAnchorEvents(
    connection: PoolConnection,
    sessionIds: string[],
  ): Promise<EventRow[]> {
    if (sessionIds.length === 0) {
      return [];
    }

    const [rows] = await connection.query<EventRow[]>(
      `SELECT id, event_id, batch_id, user_id, session_id, prompt_id, trace_id, span_id, event_name,
              service_version, severity_text, severity_number, event_time, event_sequence,
              attributes_json, body_json, body_text
       FROM otel_log_events
       WHERE session_id IN (${sessionIds.map(() => '?').join(',')})
         AND prompt_id IS NOT NULL
         AND event_name LIKE '%user_prompt%'
       ORDER BY event_sequence IS NULL, event_sequence ASC, COALESCE(event_time, gmt_create), id`,
      sessionIds,
    );
    return rows;
  }

  async loadTraceAnchorEvents(
    connection: PoolConnection,
    traceIds: string[],
  ): Promise<EventRow[]> {
    if (traceIds.length === 0) {
      return [];
    }

    const [rows] = await connection.query<EventRow[]>(
      `SELECT id, event_id, batch_id, user_id, session_id, prompt_id, trace_id, span_id, event_name,
              service_version, severity_text, severity_number, event_time, event_sequence,
              attributes_json, body_json, body_text
       FROM otel_log_events
       WHERE trace_id IN (${traceIds.map(() => '?').join(',')})
         AND prompt_id IS NOT NULL
       ORDER BY event_sequence IS NULL, event_sequence ASC, COALESCE(event_time, gmt_create), id`,
      traceIds,
    );
    return rows;
  }

  async upsertInteraction(
    connection: PoolConnection,
    input: UpsertInteractionInput,
  ): Promise<void> {
    await connection.query<ResultSetHeader>(
      `INSERT INTO sdd_interactions
        (interaction_key, user_id, session_id, prompt_id, request_event_id, response_event_id,
         status, model, command_name, command_source, pairing_method, started_at, completed_at,
         duration_ms, cost_usd, input_tokens, output_tokens, cache_read_tokens, cache_creation_tokens,
         llm_call_count, tool_call_count, skill_name, agent_name, plugin_name, query_source, effort, speed,
         source_batch_id, evidence_json, gmt_create, gmt_modified)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
         CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3))
       ON DUPLICATE KEY UPDATE
         user_id = COALESCE(VALUES(user_id), user_id),
         session_id = COALESCE(VALUES(session_id), session_id),
         prompt_id = COALESCE(VALUES(prompt_id), prompt_id),
         request_event_id = COALESCE(VALUES(request_event_id), request_event_id),
         response_event_id = COALESCE(VALUES(response_event_id), response_event_id),
         status = VALUES(status),
         model = COALESCE(VALUES(model), model),
         command_name = COALESCE(VALUES(command_name), command_name),
         command_source = COALESCE(VALUES(command_source), command_source),
         pairing_method = VALUES(pairing_method),
         started_at = CASE
           WHEN started_at IS NULL THEN VALUES(started_at)
           WHEN VALUES(started_at) IS NULL THEN started_at
           ELSE LEAST(started_at, VALUES(started_at))
         END,
         completed_at = CASE
           WHEN completed_at IS NULL THEN VALUES(completed_at)
           WHEN VALUES(completed_at) IS NULL THEN completed_at
           ELSE GREATEST(completed_at, VALUES(completed_at))
         END,
         duration_ms = ${this.greatestNullableSql('duration_ms')},
         cost_usd = ${this.greatestNullableSql('cost_usd')},
         input_tokens = ${this.greatestNullableSql('input_tokens')},
         output_tokens = ${this.greatestNullableSql('output_tokens')},
         cache_read_tokens = ${this.greatestNullableSql('cache_read_tokens')},
         cache_creation_tokens = ${this.greatestNullableSql('cache_creation_tokens')},
         llm_call_count = GREATEST(VALUES(llm_call_count), llm_call_count),
         tool_call_count = GREATEST(VALUES(tool_call_count), tool_call_count),
         skill_name = COALESCE(VALUES(skill_name), skill_name),
         agent_name = COALESCE(VALUES(agent_name), agent_name),
         plugin_name = COALESCE(VALUES(plugin_name), plugin_name),
         query_source = COALESCE(VALUES(query_source), query_source),
         effort = COALESCE(VALUES(effort), effort),
         speed = COALESCE(VALUES(speed), speed),
         source_batch_id = COALESCE(VALUES(source_batch_id), source_batch_id),
         evidence_json = VALUES(evidence_json),
         gmt_modified = CURRENT_TIMESTAMP(3)`,
      [
        input.interactionKey,
        input.userId,
        input.sessionId,
        input.promptId,
        input.requestEventId,
        input.responseEventId,
        input.status,
        input.model,
        input.commandName,
        input.commandSource,
        input.pairingMethod,
        input.startedAt,
        input.completedAt,
        input.durationMs,
        input.costUsd,
        input.inputTokens,
        input.outputTokens,
        input.cacheReadTokens,
        input.cacheCreationTokens,
        input.llmCallCount,
        input.toolCallCount,
        input.skillName,
        input.agentName,
        input.pluginName,
        input.querySource,
        input.effort,
        input.speed,
        input.sourceBatchId,
        input.evidenceJson,
      ],
    );
  }

  async upsertInteractionText(
    connection: PoolConnection,
    input: UpsertInteractionTextInput,
  ): Promise<void> {
    await connection.query<ResultSetHeader>(
      `INSERT INTO sdd_interaction_texts
        (interaction_id, prompt_text, response_text, response_json, expires_at, gmt_create, gmt_modified)
       VALUES (?, ?, ?, ?, DATE_ADD(CURRENT_TIMESTAMP(3), INTERVAL ? DAY),
         CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3))
       ON DUPLICATE KEY UPDATE
         prompt_text = VALUES(prompt_text),
         response_text = VALUES(response_text),
         response_json = VALUES(response_json),
         expires_at = VALUES(expires_at),
         gmt_modified = CURRENT_TIMESTAMP(3)`,
      [
        input.interactionId,
        input.promptText,
        input.responseText,
        input.responseJson,
        input.textRetentionDays,
      ],
    );
  }

  async upsertToolCall(
    connection: PoolConnection,
    input: UpsertToolCallInput,
  ): Promise<void> {
    await connection.query<ResultSetHeader>(
      `INSERT INTO sdd_interaction_tool_calls
        (interaction_id, skill_usage_id, tool_use_id, tool_name, sequence, decision, decision_source,
         success, duration_ms, input_size_bytes, result_size_bytes, error_type,
         tool_input_preview, mcp_server_scope, evidence_json, gmt_create, gmt_modified)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3))
       ON DUPLICATE KEY UPDATE
         interaction_id = VALUES(interaction_id),
         skill_usage_id = COALESCE(VALUES(skill_usage_id), skill_usage_id),
         tool_name = COALESCE(VALUES(tool_name), tool_name),
         sequence = CASE
           WHEN sequence = 0 THEN VALUES(sequence)
           WHEN VALUES(sequence) = 0 THEN sequence
           ELSE LEAST(VALUES(sequence), sequence)
         END,
         decision = COALESCE(VALUES(decision), decision),
         decision_source = COALESCE(VALUES(decision_source), decision_source),
         success = COALESCE(VALUES(success), success),
         duration_ms = COALESCE(VALUES(duration_ms), duration_ms),
         input_size_bytes = COALESCE(VALUES(input_size_bytes), input_size_bytes),
         result_size_bytes = COALESCE(VALUES(result_size_bytes), result_size_bytes),
         error_type = COALESCE(VALUES(error_type), error_type),
         tool_input_preview = COALESCE(VALUES(tool_input_preview), tool_input_preview),
         mcp_server_scope = COALESCE(VALUES(mcp_server_scope), mcp_server_scope),
         evidence_json = JSON_MERGE_PATCH(COALESCE(evidence_json, JSON_OBJECT()), COALESCE(VALUES(evidence_json), JSON_OBJECT())),
         gmt_modified = CURRENT_TIMESTAMP(3)`,
      [
        input.interactionId,
        input.skillUsageId,
        input.toolUseId,
        input.toolName,
        input.sequence,
        input.decision,
        input.decisionSource,
        input.success,
        input.durationMs,
        input.inputSizeBytes,
        input.resultSizeBytes,
        input.errorType,
        input.toolInputPreview,
        input.mcpServerScope,
        input.evidenceJson,
      ],
    );
  }

  async listSkillUsagesByInteraction(
    connection: PoolConnection,
    interactionId: string,
  ): Promise<Array<{ id: string; eventSequence: number | null }>> {
    const [rows] = await connection.query<RowDataPacket[]>(
      `SELECT id, event_sequence AS eventSequence
       FROM sdd_skill_usages
       WHERE interaction_id = ?
       ORDER BY event_sequence ASC, id ASC`,
      [interactionId],
    );
    return rows as Array<{ id: string; eventSequence: number | null }>;
  }

  async listToolCallsByInteraction(
    connection: PoolConnection,
    interactionId: string,
  ): Promise<Array<{ id: string; sequence: number | null }>> {
    const [rows] = await connection.query<RowDataPacket[]>(
      `SELECT id, sequence
       FROM sdd_interaction_tool_calls
       WHERE interaction_id = ?`,
      [interactionId],
    );
    return rows as Array<{ id: string; sequence: number | null }>;
  }

  async listSubagentInteractionsByIds(
    connection: PoolConnection,
    interactionIds: string[],
  ): Promise<Array<{ id: string; sessionId: string | null; startedAt: Date | null }>> {
    if (interactionIds.length === 0) return [];
    const [rows] = await connection.query<RowDataPacket[]>(
      `SELECT id, session_id AS sessionId, started_at AS startedAt
       FROM sdd_interactions
       WHERE id IN (?) AND agent_name IS NOT NULL`,
      [interactionIds],
    );
    return rows as Array<{ id: string; sessionId: string | null; startedAt: Date | null }>;
  }

  async findParentInteractionBySessionAndTime(
    connection: PoolConnection,
    sessionId: string,
    beforeTime: Date,
  ): Promise<{ id: string } | null> {
    const [rows] = await connection.query<RowDataPacket[]>(
      `SELECT id FROM sdd_interactions
       WHERE session_id = ? AND agent_name IS NULL AND started_at < ?
       ORDER BY started_at DESC LIMIT 1`,
      [sessionId, beforeTime],
    );
    const r = (rows as Array<{ id: string }>)[0];
    return r ?? null;
  }

  async listSkillUsagesByInteractionWithTime(
    connection: PoolConnection,
    interactionId: string,
  ): Promise<Array<{ id: string; eventTime: Date | null }>> {
    const [rows] = await connection.query<RowDataPacket[]>(
      `SELECT id, event_time AS eventTime FROM sdd_skill_usages
       WHERE interaction_id = ?`,
      [interactionId],
    );
    return rows as Array<{ id: string; eventTime: Date | null }>;
  }

  async updateSubagentToolCallSkillUsage(
    connection: PoolConnection,
    subagentInteractionId: string,
    skillUsageId: string,
  ): Promise<number> {
    const [result] = await connection.query<ResultSetHeader>(
      `UPDATE sdd_interaction_tool_calls
       SET skill_usage_id = ?, gmt_modified = CURRENT_TIMESTAMP(3)
       WHERE interaction_id = ? AND skill_usage_id IS NULL`,
      [skillUsageId, subagentInteractionId],
    );
    return result.affectedRows;
  }

  async bulkUpdateToolCallSkillUsages(
    connection: PoolConnection,
    assignments: Array<{ toolCallId: string; skillUsageId: string | null }>,
  ): Promise<number> {
    // 过滤掉 skillUsageId 为 null 的（DB 里本来就是 NULL，无需 UPDATE）
    const updates = assignments.filter((a) => a.skillUsageId !== null);
    if (updates.length === 0) return 0;

    const caseWhen = updates.map(() => `WHEN ? THEN ?`).join(' ');
    const ids = updates.map((a) => a.toolCallId);
    const caseParams = updates.flatMap((a) => [a.toolCallId, a.skillUsageId]);
    const idPlaceholders = ids.map(() => '?').join(',');

    await connection.query<ResultSetHeader>(
      `UPDATE sdd_interaction_tool_calls
       SET skill_usage_id = CASE id ${caseWhen} ELSE skill_usage_id END,
           gmt_modified = CURRENT_TIMESTAMP(3)
       WHERE id IN (${idPlaceholders})`,
      [...caseParams, ...ids],
    );

    return updates.length;
  }

  async loadSkillAliases(connection: PoolConnection): Promise<AliasRow[]> {
    const [aliases] = await connection.query<AliasRow[]>(
      `SELECT id AS alias_id, semantic_id, skill_name
       FROM sdd_skill_aliases`,
    );
    return aliases;
  }

  async upsertSkillUsage(
    connection: PoolConnection,
    input: UpsertSkillUsageInput,
  ): Promise<void> {
    await connection.query<ResultSetHeader>(
      `INSERT INTO sdd_skill_usages
        (usage_key, semantic_id, alias_id, interaction_id, work_item_id, user_id, session_id,
         prompt_id, raw_skill_name, skill_source, invocation_trigger, command_name,
         service_version, observed_version, matched_by, rule_version, event_sequence,
         status, event_time, gmt_create, gmt_modified)
       VALUES (?, ?, ?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'p0-cleaner-v1',
         ?, 'observed', ?, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3))
       ON DUPLICATE KEY UPDATE
         semantic_id = VALUES(semantic_id),
         alias_id = VALUES(alias_id),
         interaction_id = VALUES(interaction_id),
         user_id = VALUES(user_id),
         session_id = VALUES(session_id),
         prompt_id = VALUES(prompt_id),
         raw_skill_name = VALUES(raw_skill_name),
         skill_source = VALUES(skill_source),
         invocation_trigger = VALUES(invocation_trigger),
         command_name = VALUES(command_name),
         service_version = VALUES(service_version),
         observed_version = VALUES(observed_version),
         matched_by = VALUES(matched_by),
         event_sequence = VALUES(event_sequence),
         status = VALUES(status),
         event_time = VALUES(event_time),
         gmt_modified = CURRENT_TIMESTAMP(3)`,
      [
        input.usageKey,
        input.semanticId,
        input.aliasId,
        input.interactionId,
        input.userId,
        input.sessionId,
        input.promptId,
        input.rawSkillName,
        input.skillSource,
        input.invocationTrigger,
        input.commandName,
        input.serviceVersion,
        input.observedVersion,
        input.matchedBy,
        input.eventSequence,
        input.eventTime,
      ],
    );
  }

  async upsertError(connection: PoolConnection, input: UpsertErrorInput): Promise<void> {
    await connection.query<ResultSetHeader>(
      `INSERT INTO sdd_errors
        (error_key, user_id, batch_id, event_id, interaction_id, usage_id, work_item_id,
         error_type, severity, source, retryable, error_message_hash, error_message,
         stack_hash, stack_trace, event_time, gmt_create, gmt_modified)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3))
       ON DUPLICATE KEY UPDATE
         user_id = VALUES(user_id),
         batch_id = VALUES(batch_id),
         event_id = VALUES(event_id),
         interaction_id = VALUES(interaction_id),
         usage_id = COALESCE(VALUES(usage_id), usage_id),
         work_item_id = COALESCE(VALUES(work_item_id), work_item_id),
         error_type = VALUES(error_type),
         severity = VALUES(severity),
         source = VALUES(source),
         retryable = VALUES(retryable),
         error_message_hash = VALUES(error_message_hash),
         error_message = VALUES(error_message),
         stack_hash = VALUES(stack_hash),
         stack_trace = VALUES(stack_trace),
         event_time = VALUES(event_time),
         gmt_modified = CURRENT_TIMESTAMP(3)`,
      [
        input.errorKey,
        input.userId,
        input.batchId,
        input.eventId,
        input.interactionId,
        input.usageId,
        input.workItemId,
        input.errorType,
        input.severity,
        input.source,
        input.retryable,
        input.errorMessageHash,
        input.errorMessage,
        input.stackHash,
        input.stackTrace,
        input.eventTime,
      ],
    );
  }

  async upsertWorkItem(connection: PoolConnection, input: UpsertWorkItemInput): Promise<void> {
    await connection.query<ResultSetHeader>(
      `INSERT INTO sdd_work_items
        (work_item_key, requirements_repo_name, business_domain, work_item_slug,
         work_item_title, relative_dir, first_seen_at, last_seen_at, gmt_create, gmt_modified)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3))
       ON DUPLICATE KEY UPDATE
         requirements_repo_name = COALESCE(VALUES(requirements_repo_name), requirements_repo_name),
         business_domain = COALESCE(VALUES(business_domain), business_domain),
         work_item_slug = VALUES(work_item_slug),
         work_item_title = COALESCE(VALUES(work_item_title), work_item_title),
         relative_dir = VALUES(relative_dir),
         first_seen_at = COALESCE(first_seen_at, VALUES(first_seen_at)),
         last_seen_at = GREATEST(COALESCE(last_seen_at, VALUES(last_seen_at)), VALUES(last_seen_at)),
         gmt_modified = CURRENT_TIMESTAMP(3)`,
      [
        input.workItemKey,
        input.requirementsRepoName,
        input.businessDomain,
        input.workItemSlug,
        input.workItemTitle,
        input.relativeDir,
        input.firstSeenAt,
        input.lastSeenAt,
      ],
    );
  }

  async upsertWorkItemArtifact(
    connection: PoolConnection,
    input: UpsertWorkItemArtifactInput,
  ): Promise<void> {
    await connection.query<ResultSetHeader>(
      `INSERT INTO sdd_work_item_artifacts
        (artifact_key, work_item_id, artifact_type, artifact_relative_path,
         artifact_full_path, system_module, first_seen_event_id, first_seen_at,
         last_seen_at, gmt_create, gmt_modified)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3))
       ON DUPLICATE KEY UPDATE
         work_item_id = VALUES(work_item_id),
         artifact_type = VALUES(artifact_type),
         artifact_relative_path = VALUES(artifact_relative_path),
         artifact_full_path = VALUES(artifact_full_path),
         system_module = VALUES(system_module),
         first_seen_event_id = COALESCE(first_seen_event_id, VALUES(first_seen_event_id)),
         first_seen_at = COALESCE(first_seen_at, VALUES(first_seen_at)),
         last_seen_at = GREATEST(COALESCE(last_seen_at, VALUES(last_seen_at)), VALUES(last_seen_at)),
         gmt_modified = CURRENT_TIMESTAMP(3)`,
      [
        input.artifactKey,
        input.workItemId,
        input.artifactType,
        input.artifactRelativePath,
        input.artifactFullPath,
        input.systemModule,
        input.firstSeenEventId,
        input.firstSeenAt,
        input.lastSeenAt,
      ],
    );
  }

  async loadUserRequirementsRoots(
    connection: PoolConnection,
    userIds: string[],
  ): Promise<UserRequirementsRootRow[]> {
    const [rows] = await connection.query<UserRequirementsRootRow[]>(
      `SELECT id, requirements_root_path
       FROM sdd_users
       WHERE id IN (${userIds.map(() => '?').join(',')})`,
      userIds,
    );
    return rows;
  }

  async loadSkillSemanticMatchers(connection: PoolConnection): Promise<SemanticPatternRow[]> {
    const [rows] = await connection.query<SemanticPatternRow[]>(
      `SELECT s.id AS semantic_id, s.semantic_code, s.artifact_filename_patterns, a.skill_name
       FROM sdd_skill_semantics s
       LEFT JOIN sdd_skill_aliases a ON a.semantic_id = s.id
       ORDER BY s.id ASC, a.skill_name ASC`,
    );
    return rows;
  }

  async findUsageAndWorkItemForError(
    connection: PoolConnection,
    sessionId: string,
    errorEventTime: Date | null,
  ): Promise<{ usageId: string | null; workItemId: string | null }> {
    const [rows] = await connection.query<UsageWorkItemRow[]>(
      `SELECT id, work_item_id
       FROM sdd_skill_usages
       WHERE session_id = ?
         AND (? IS NULL OR event_time IS NULL OR event_time <= ?)
       ORDER BY event_time DESC, id DESC
       LIMIT 1`,
      [sessionId, errorEventTime, errorEventTime],
    );
    const row = rows[0];
    if (!row) {
      return { usageId: null, workItemId: null };
    }
    return {
      usageId: row.id != null ? String(row.id) : null,
      workItemId: row.work_item_id != null ? String(row.work_item_id) : null,
    };
  }

  async linkSkillUsageToWorkItem(
    connection: PoolConnection,
    input: LinkSkillUsageToWorkItemInput,
  ): Promise<void> {
    await connection.query<ResultSetHeader>(
      `UPDATE sdd_skill_usages
       SET work_item_id = ?,
           gmt_modified = CURRENT_TIMESTAMP(3)
       WHERE id = (
         SELECT id FROM (
           SELECT id FROM sdd_skill_usages
           WHERE session_id = ?
             AND raw_skill_name = ?
             AND (work_item_id IS NULL OR work_item_id = ?)
             AND (? IS NULL OR event_time IS NULL OR event_time <= ?)
           ORDER BY event_time DESC, id DESC
           LIMIT 1
         ) t
       )`,
      [
        input.workItemId,
        input.sessionId,
        input.rawSkillName,
        input.workItemId,
        input.artifactEventTime,
        input.artifactEventTime,
      ],
    );
  }

  async markBatchParsed(
    pool: Pool,
    batchId: string,
    eventCount: number,
    derivedCount: number,
  ): Promise<void> {
    await pool.query(
      `UPDATE otel_ingest_batches
       SET status = 'parsed',
           status_reason = 'parsed',
           event_count = ?,
           derived_count = ?,
           parse_completed_at = CURRENT_TIMESTAMP(3),
           parse_duration_ms = IF(
             parse_started_at IS NULL,
             NULL,
             TIMESTAMPDIFF(MICROSECOND, parse_started_at, CURRENT_TIMESTAMP(3)) DIV 1000
           ),
           last_error = NULL,
           gmt_modified = CURRENT_TIMESTAMP(3)
       WHERE id = ?`,
      [eventCount, derivedCount, batchId],
    );
  }

  async markEventsAsOrphan(
    connection: PoolConnection,
    eventIds: string[],
    reason: string,
  ): Promise<void> {
    if (eventIds.length === 0) {
      return;
    }

    // 用 JSON_SET 在 attributes_json 上 patch 一个 sdd.orphan_reason 字段，
    // 让监控查询能用 JSON_EXTRACT 统计孤儿率。
    await connection.query<ResultSetHeader>(
      `UPDATE otel_log_events
       SET attributes_json = JSON_SET(
             COALESCE(attributes_json, JSON_OBJECT()),
             '$."sdd.orphan_reason"',
             ?
           ),
           gmt_modified = CURRENT_TIMESTAMP(3)
       WHERE event_id IN (${eventIds.map(() => '?').join(',')})`,
      [reason, ...eventIds],
    );
  }

  async selectIdByKey(
    connection: PoolConnection,
    tableName: 'sdd_interactions' | 'sdd_work_items',
    keyColumn: 'interaction_key' | 'work_item_key',
    key: string,
  ): Promise<string> {
    const id = await this.findIdByKey(connection, tableName, keyColumn, key);
    if (!id) {
      throw new Error(`failed to select id from ${tableName}`);
    }
    return id;
  }

  async findIdByKey(
    connection: PoolConnection,
    tableName: 'sdd_interactions' | 'sdd_work_items',
    keyColumn: 'interaction_key' | 'work_item_key',
    key: string,
  ): Promise<string | null> {
    const [rows] = await connection.query<IdRow[]>(
      `SELECT id FROM ${tableName} WHERE ${keyColumn} = ? LIMIT 1`,
      [key],
    );
    const id = rows[0]?.id;
    return id ? String(id) : null;
  }

  async upsertWikiRecall(
    connection: PoolConnection,
    input: UpsertWikiRecallInput,
  ): Promise<void> {
    await connection.query<ResultSetHeader>(
      `INSERT INTO sdd_wiki_recalls
        (recall_key, tool_call_id, interaction_id, skill_usage_id, work_item_id, user_id,
         action_type, raw_path, wiki_relative_path, wiki_domain, wiki_axis, wiki_system,
         event_id, event_sequence, event_time, rule_version, gmt_create, gmt_modified)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3))
       ON DUPLICATE KEY UPDATE
         skill_usage_id = COALESCE(VALUES(skill_usage_id), skill_usage_id),
         work_item_id = COALESCE(VALUES(work_item_id), work_item_id),
         user_id = COALESCE(VALUES(user_id), user_id),
         action_type = VALUES(action_type),
         wiki_relative_path = VALUES(wiki_relative_path),
         wiki_domain = VALUES(wiki_domain),
         wiki_axis = VALUES(wiki_axis),
         wiki_system = VALUES(wiki_system),
         event_id = COALESCE(VALUES(event_id), event_id),
         event_sequence = COALESCE(VALUES(event_sequence), event_sequence),
         event_time = COALESCE(VALUES(event_time), event_time),
         rule_version = VALUES(rule_version),
         gmt_modified = CURRENT_TIMESTAMP(3)`,
      [
        input.recallKey,
        input.toolCallId,
        input.interactionId,
        input.skillUsageId,
        input.workItemId,
        input.userId,
        input.actionType,
        input.rawPath,
        input.wikiRelativePath,
        input.wikiDomain,
        input.wikiAxis,
        input.wikiSystem,
        input.eventId,
        input.eventSequence,
        input.eventTime,
        input.ruleVersion,
      ],
    );
  }

  async loadUserWikiRoots(connection: PoolConnection): Promise<Map<string, string>> {
    const [rows] = await connection.query<RowDataPacket[]>(
      `SELECT id, wiki_root_path FROM sdd_users WHERE wiki_root_path IS NOT NULL`,
    );
    const m = new Map<string, string>();
    for (const r of rows as Array<{ id: string; wiki_root_path: string }>) {
      m.set(r.id, r.wiki_root_path);
    }
    return m;
  }

  async listToolCallsForWikiRecalls(
    connection: PoolConnection,
    interactionIds: string[],
  ): Promise<Array<{
    id: string;
    interactionId: string;
    skillUsageId: string | null;
    toolName: string;
    toolInputPreview: string | null;
    sequence: number | null;
  }>> {
    if (interactionIds.length === 0) return [];
    const [rows] = await connection.query<RowDataPacket[]>(
      `SELECT id, interaction_id AS interactionId, skill_usage_id AS skillUsageId,
              tool_name AS toolName, tool_input_preview AS toolInputPreview, sequence
       FROM sdd_interaction_tool_calls
       WHERE interaction_id IN (?)`,
      [interactionIds],
    );
    return rows as Array<{
      id: string;
      interactionId: string;
      skillUsageId: string | null;
      toolName: string;
      toolInputPreview: string | null;
      sequence: number | null;
    }>;
  }

  async getWorkItemIdBySkillUsage(
    connection: PoolConnection,
    skillUsageId: string,
  ): Promise<string | null> {
    const [rows] = await connection.query<RowDataPacket[]>(
      `SELECT work_item_id FROM sdd_skill_usages WHERE id = ?`,
      [skillUsageId],
    );
    const r = (rows as Array<{ work_item_id: string | null }>)[0];
    return r?.work_item_id ?? null;
  }

  private greatestNullableSql(columnName: string): string {
    return `CASE
           WHEN VALUES(${columnName}) IS NULL THEN ${columnName}
           WHEN ${columnName} IS NULL THEN VALUES(${columnName})
           ELSE GREATEST(VALUES(${columnName}), ${columnName})
         END`;
  }
}
