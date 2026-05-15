import type { Pool, PoolConnection, ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import type { Logger } from 'pino';
import { withTransaction } from '../infrastructure/mysql/client';
import {
  extractOtelLogEvents,
  parseJsonObject,
  readString,
  sha256,
  type ExtractedLogEvent,
} from './otel-extractor';

export interface CleanBatchJob {
  batchId: string;
}

export interface CleaningWorkerDependencies {
  pool: Pool;
  logger: Logger;
  eventRetentionDays?: number;
  textRetentionDays?: number;
}

export interface CleanBatchResult {
  batchId: string;
  skipped: boolean;
  eventCount: number;
  derivedCount: number;
}

interface LoadedBatch {
  batchId: string;
  userId: string | null;
  payloadJson: string;
}

interface BatchRow extends RowDataPacket {
  id: string;
  user_id: string | null;
  status: string;
  payload_json: string | null;
}

interface EventRow extends RowDataPacket {
  id: string;
  event_id: string;
  batch_id: string;
  user_id: string | null;
  session_id: string | null;
  prompt_id: string | null;
  event_name: string;
  service_version: string | null;
  severity_text: string | null;
  severity_number: number | null;
  event_time: Date | string | null;
  attributes_json: unknown;
  body_json: unknown;
  body_text: string | null;
}

interface AliasRow extends RowDataPacket {
  alias_id: string;
  semantic_id: string;
  skill_name: string;
}

interface IdRow extends RowDataPacket {
  id: string;
}

interface InteractionRef {
  id: string;
  key: string;
}

class TerminalCleaningError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TerminalCleaningError';
  }
}

export async function cleanBatch(
  job: CleanBatchJob,
  dependencies: CleaningWorkerDependencies,
): Promise<CleanBatchResult> {
  const eventRetentionDays = dependencies.eventRetentionDays ?? Number(process.env.EVENT_RETENTION_DAYS ?? 30);
  const textRetentionDays = dependencies.textRetentionDays ?? Number(process.env.TEXT_RETENTION_DAYS ?? 30);
  let loadedBatch: LoadedBatch | null = null;

  try {
    loadedBatch = await markBatchProcessing(dependencies.pool, job.batchId);
    if (!loadedBatch) {
      return {
        batchId: job.batchId,
        skipped: true,
        eventCount: 0,
        derivedCount: 0,
      };
    }

    const payload = parsePayload(loadedBatch.payloadJson);
    const events = extractOtelLogEvents(payload, loadedBatch.batchId);
    const derivedCount = await persistCleanedData(dependencies.pool, {
      batch: loadedBatch,
      events,
      eventRetentionDays,
      textRetentionDays,
    });

    await markBatchParsed(dependencies.pool, loadedBatch.batchId, events.length, derivedCount);

    return {
      batchId: loadedBatch.batchId,
      skipped: false,
      eventCount: events.length,
      derivedCount,
    };
  } catch (error) {
    const status = error instanceof TerminalCleaningError ? 'failed_terminal' : 'failed_retryable';
    await markBatchFailed(dependencies.pool, job.batchId, error, status);
    throw error;
  }
}

export async function markBatchFailed(
  pool: Pool,
  batchId: string,
  error: unknown,
  status: 'failed_retryable' | 'failed_terminal',
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
    [status, status === 'failed_terminal' ? 'terminal cleaning failure' : 'retryable cleaning failure', stringifyError(error), batchId],
  );
}

async function markBatchProcessing(pool: Pool, batchId: string): Promise<LoadedBatch | null> {
  return withTransaction(pool, async connection => {
    const [rows] = await connection.query<BatchRow[]>(
      `SELECT b.id, b.user_id, b.status, r.payload_json
       FROM otel_ingest_batches b
       LEFT JOIN otel_raw_payloads r ON r.batch_id = b.id
       WHERE b.id = ?
       LIMIT 1
       FOR UPDATE`,
      [batchId],
    );
    const row = rows[0];

    if (!row) {
      throw new TerminalCleaningError(`batch not found: ${batchId}`);
    }

    if (row.status === 'parsed') {
      return null;
    }

    if (!row.payload_json) {
      throw new TerminalCleaningError(`raw payload not found for batch: ${batchId}`);
    }

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

    return {
      batchId: String(row.id),
      userId: row.user_id === null ? null : String(row.user_id),
      payloadJson: row.payload_json,
    };
  });
}

function parsePayload(payloadJson: string): unknown {
  try {
    return JSON.parse(payloadJson);
  } catch (error) {
    throw new TerminalCleaningError(`invalid raw payload json: ${stringifyError(error)}`);
  }
}

async function persistCleanedData(
  pool: Pool,
  input: {
    batch: LoadedBatch;
    events: ExtractedLogEvent[];
    eventRetentionDays: number;
    textRetentionDays: number;
  },
): Promise<number> {
  return withTransaction(pool, async connection => {
    for (const event of input.events) {
      await upsertLogEvent(connection, input.batch, event, input.eventRetentionDays);
    }

    const scopedEvents = await loadScopedEvents(connection, input.batch.batchId, input.events);
    const interactions = await upsertInteractions(connection, scopedEvents, input.textRetentionDays);
    const usages = await upsertSkillUsages(connection, scopedEvents, interactions);
    const errors = await upsertErrors(connection, scopedEvents, interactions);
    const artifacts = await upsertWorkItems(connection, scopedEvents);

    return interactions.size + usages + errors + artifacts;
  });
}

async function upsertLogEvent(
  connection: PoolConnection,
  batch: LoadedBatch,
  event: ExtractedLogEvent,
  eventRetentionDays: number,
): Promise<void> {
  await connection.query<ResultSetHeader>(
    `INSERT INTO otel_log_events
      (event_id, batch_id, user_id, session_id, prompt_id, trace_id, span_id, event_name,
       display_name, service_name, service_version, severity_text, severity_number, event_time,
       observed_at, attributes_json, resource_json, body_json, body_text, expires_at,
       gmt_create, gmt_modified)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
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
       observed_at = VALUES(observed_at),
       attributes_json = VALUES(attributes_json),
       resource_json = VALUES(resource_json),
       body_json = VALUES(body_json),
       body_text = VALUES(body_text),
       expires_at = VALUES(expires_at),
       gmt_modified = CURRENT_TIMESTAMP(3)`,
    [
      event.eventId,
      batch.batchId,
      batch.userId,
      event.sessionId,
      event.promptId,
      event.traceId,
      event.spanId,
      event.eventName,
      event.displayName,
      event.serviceName,
      event.serviceVersion,
      event.severityText,
      event.severityNumber,
      event.eventTime,
      event.observedAt,
      jsonParam(event.attributes),
      jsonParam(event.resource),
      jsonParam(event.bodyJson),
      event.bodyText,
      eventRetentionDays,
    ],
  );
}

async function loadScopedEvents(
  connection: PoolConnection,
  batchId: string,
  events: ExtractedLogEvent[],
): Promise<EventRow[]> {
  const promptIds = unique(events.map(event => event.promptId).filter(isNonEmptyString));
  const sessionIds = unique(events.map(event => event.sessionId).filter(isNonEmptyString));
  const clauses = ['batch_id = ?'];
  const params: Array<string | string[]> = [batchId];

  if (promptIds.length > 0) {
    clauses.push(`prompt_id IN (${promptIds.map(() => '?').join(',')})`);
    params.push(...promptIds);
  }

  if (sessionIds.length > 0) {
    clauses.push(`session_id IN (${sessionIds.map(() => '?').join(',')})`);
    params.push(...sessionIds);
  }

  const [rows] = await connection.query<EventRow[]>(
    `SELECT id, event_id, batch_id, user_id, session_id, prompt_id, event_name,
            service_version, severity_text, severity_number, event_time,
            attributes_json, body_json, body_text
     FROM otel_log_events
     WHERE ${clauses.map(clause => `(${clause})`).join(' OR ')}
     ORDER BY COALESCE(event_time, gmt_create), id`,
    params,
  );

  return rows;
}

async function upsertInteractions(
  connection: PoolConnection,
  events: EventRow[],
  textRetentionDays: number,
): Promise<Map<string, InteractionRef>> {
  const groups = groupInteractionEvents(events);
  const refs = new Map<string, InteractionRef>();

  for (const [key, groupEvents] of groups.entries()) {
    const requestEvent = groupEvents.find(isRequestEvent) ?? groupEvents[0];
    const responseEvent = groupEvents.find(isResponseEvent) ?? null;
    const userId = requestEvent?.user_id ?? responseEvent?.user_id ?? null;
    const sessionId = requestEvent?.session_id ?? responseEvent?.session_id ?? null;
    const promptId = requestEvent?.prompt_id ?? responseEvent?.prompt_id ?? null;
    const startedAt = asDate(requestEvent?.event_time) ?? asDate(groupEvents[0]?.event_time);
    const completedAt = responseEvent ? asDate(responseEvent.event_time) : null;
    const durationMs =
      startedAt && completedAt ? Math.max(0, completedAt.getTime() - startedAt.getTime()) : null;
    const status = responseEvent ? 'completed' : 'partial';
    const commandName = pickRowString(requestEvent ?? responseEvent, [
      'command_name',
      'command.name',
      'skill_name',
      'skill.name',
    ]);

    await connection.query<ResultSetHeader>(
      `INSERT INTO sdd_interactions
        (interaction_key, user_id, session_id, prompt_id, request_event_id, response_event_id,
         status, model, command_name, command_source, pairing_method, started_at, completed_at,
         duration_ms, source_batch_id, evidence_json, gmt_create, gmt_modified)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3))
       ON DUPLICATE KEY UPDATE
         user_id = VALUES(user_id),
         session_id = VALUES(session_id),
         prompt_id = VALUES(prompt_id),
         request_event_id = VALUES(request_event_id),
         response_event_id = VALUES(response_event_id),
         status = VALUES(status),
         model = VALUES(model),
         command_name = VALUES(command_name),
         command_source = VALUES(command_source),
         pairing_method = VALUES(pairing_method),
         started_at = VALUES(started_at),
         completed_at = VALUES(completed_at),
         duration_ms = VALUES(duration_ms),
         source_batch_id = VALUES(source_batch_id),
         evidence_json = VALUES(evidence_json),
         gmt_modified = CURRENT_TIMESTAMP(3)`,
      [
        key,
        userId,
        sessionId,
        promptId,
        requestEvent?.event_id ?? null,
        responseEvent?.event_id ?? null,
        status,
        pickRowString(requestEvent ?? responseEvent, ['model', 'llm.model', 'model_name']),
        commandName,
        pickRowString(requestEvent ?? responseEvent, ['command_source', 'command.source']),
        promptId ? 'prompt_id' : 'session_window',
        startedAt,
        completedAt,
        durationMs,
        requestEvent?.batch_id ?? responseEvent?.batch_id ?? null,
        jsonParam({
          eventIds: groupEvents.map(event => event.event_id),
          requestEventId: requestEvent?.event_id ?? null,
          responseEventId: responseEvent?.event_id ?? null,
        }),
      ],
    );

    const interactionId = await selectIdByKey(
      connection,
      'sdd_interactions',
      'interaction_key',
      key,
    );
    refs.set(key, { id: interactionId, key });

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
        interactionId,
        extractPromptText(requestEvent),
        extractResponseText(responseEvent),
        responseEvent ? jsonParam(responseEvent.body_json) : null,
        textRetentionDays,
      ],
    );
  }

  return refs;
}

async function upsertSkillUsages(
  connection: PoolConnection,
  events: EventRow[],
  interactions: Map<string, InteractionRef>,
): Promise<number> {
  const [aliases] = await connection.query<AliasRow[]>(
    `SELECT id AS alias_id, semantic_id, skill_name
     FROM sdd_skill_aliases`,
  );
  const aliasBySkillName = new Map(aliases.map(alias => [alias.skill_name, alias]));
  let count = 0;

  for (const event of events) {
    const rawSkillName = pickRowString(event, [
      'skill_name',
      'skill.name',
      'sdd.skill_name',
      'command_name',
      'command.name',
      'tool.name',
    ]);
    if (!rawSkillName) {
      continue;
    }

    const alias = aliasBySkillName.get(rawSkillName);
    if (!alias) {
      continue;
    }

    const interaction = interactions.get(interactionKeyForEvent(event));
    const usageKey = sha256(`usage:${event.event_id}:${rawSkillName}`);

    await connection.query<ResultSetHeader>(
      `INSERT INTO sdd_skill_usages
        (usage_key, semantic_id, alias_id, interaction_id, work_item_id, user_id, session_id,
         prompt_id, raw_skill_name, skill_source, invocation_trigger, command_name,
         service_version, observed_version, matched_by, rule_version, event_sequence,
         status, event_time, gmt_create, gmt_modified)
       VALUES (?, ?, ?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'alias_exact', 'p0-cleaner-v1',
         NULL, 'observed', ?, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3))
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
         status = VALUES(status),
         event_time = VALUES(event_time),
         gmt_modified = CURRENT_TIMESTAMP(3)`,
      [
        usageKey,
        alias.semantic_id,
        alias.alias_id,
        interaction?.id ?? null,
        event.user_id,
        event.session_id,
        event.prompt_id,
        rawSkillName,
        pickRowString(event, ['skill_source', 'skill.source']),
        pickRowString(event, ['invocation_trigger', 'trigger']),
        pickRowString(event, ['command_name', 'command.name']) ?? rawSkillName,
        event.service_version,
        pickRowString(event, ['skill.version', 'sdd.skill_version']),
        asDate(event.event_time),
      ],
    );
    count += 1;
  }

  return count;
}

async function upsertErrors(
  connection: PoolConnection,
  events: EventRow[],
  interactions: Map<string, InteractionRef>,
): Promise<number> {
  let count = 0;

  for (const event of events) {
    if (!isStrongErrorEvent(event)) {
      continue;
    }

    const attributes = parseJsonObject(event.attributes_json);
    const errorType =
      readString(attributes['error.type']) ??
      readString(attributes['exception.type']) ??
      event.event_name;
    const errorMessage =
      readString(attributes['error.message']) ??
      readString(attributes['exception.message']) ??
      event.body_text;
    const stackTrace =
      readString(attributes['exception.stacktrace']) ??
      readString(attributes['exception.stack_trace']) ??
      readString(attributes['error.stack']);
    const messageHash = errorMessage ? sha256(errorMessage) : null;
    const stackHash = stackTrace ? sha256(stackTrace) : null;
    const interaction = interactions.get(interactionKeyForEvent(event));

    await connection.query<ResultSetHeader>(
      `INSERT INTO sdd_errors
        (error_key, user_id, batch_id, event_id, interaction_id, usage_id, work_item_id,
         error_type, severity, source, retryable, error_message_hash, error_message,
         stack_hash, stack_trace, event_time, gmt_create, gmt_modified)
       VALUES (?, ?, ?, ?, ?, NULL, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3))
       ON DUPLICATE KEY UPDATE
         user_id = VALUES(user_id),
         batch_id = VALUES(batch_id),
         event_id = VALUES(event_id),
         interaction_id = VALUES(interaction_id),
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
        sha256(`error:${event.event_id}:${messageHash ?? ''}`),
        event.user_id,
        event.batch_id,
        event.event_id,
        interaction?.id ?? null,
        errorType,
        normalizeSeverity(event.severity_text),
        pickRowString(event, ['error.source', 'source']),
        readBoolean(attributes.retryable) ? 1 : 0,
        messageHash,
        errorMessage,
        stackHash,
        stackTrace,
        asDate(event.event_time),
      ],
    );
    count += 1;
  }

  return count;
}

async function upsertWorkItems(connection: PoolConnection, events: EventRow[]): Promise<number> {
  let count = 0;

  for (const event of events) {
    const artifactPath = pickRowString(event, [
      'artifact.path',
      'file.path',
      'output_path',
      'requirements.path',
      'sdd.requirements_path',
      'sdd.artifact_path',
    ]);
    const artifact = artifactPath ? inferArtifact(artifactPath) : null;
    if (!artifact) {
      continue;
    }

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
        artifact.workItemKey,
        artifact.repoName,
        artifact.businessDomain,
        artifact.workItemSlug,
        artifact.workItemTitle,
        artifact.relativeDir,
        asDate(event.event_time),
        asDate(event.event_time),
      ],
    );

    const workItemId = await selectIdByKey(
      connection,
      'sdd_work_items',
      'work_item_key',
      artifact.workItemKey,
    );

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
        artifact.artifactKey,
        workItemId,
        artifact.artifactType,
        artifact.artifactRelativePath,
        artifact.artifactFullPath,
        artifact.systemModule,
        event.event_id,
        asDate(event.event_time),
        asDate(event.event_time),
      ],
    );
    count += 1;
  }

  return count;
}

async function markBatchParsed(
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

function groupInteractionEvents(events: EventRow[]): Map<string, EventRow[]> {
  const groups = new Map<string, EventRow[]>();

  for (const event of events) {
    const key = interactionKeyForEvent(event);
    if (!key) {
      continue;
    }

    const group = groups.get(key) ?? [];
    group.push(event);
    groups.set(key, group);
  }

  return groups;
}

function interactionKeyForEvent(event: EventRow): string {
  if (event.prompt_id) {
    return sha256(`prompt:${event.prompt_id}`);
  }

  if (event.session_id) {
    return sha256(`session:${event.session_id}`);
  }

  return '';
}

function isRequestEvent(event: EventRow): boolean {
  return /request|prompt|api_request_body/i.test(event.event_name);
}

function isResponseEvent(event: EventRow): boolean {
  return /response|completion|api_response_body/i.test(event.event_name);
}

function extractPromptText(event: EventRow | undefined): string | null {
  if (!event) {
    return null;
  }

  return pickRowString(event, ['prompt', 'request.prompt', 'input', 'message.content']) ?? event.body_text;
}

function extractResponseText(event: EventRow | null): string | null {
  if (!event) {
    return null;
  }

  return pickRowString(event, ['response', 'completion', 'output', 'answer']) ?? event.body_text;
}

function pickRowString(event: EventRow | undefined | null, keys: string[]): string | null {
  if (!event) {
    return null;
  }

  const attributes = parseJsonObject(event.attributes_json);
  for (const key of keys) {
    const value = readString(attributes[key]);
    if (value) {
      return value;
    }
  }

  const normalizedKeys = new Set(keys.map(normalizeKey));
  for (const [key, value] of Object.entries(attributes)) {
    if (normalizedKeys.has(normalizeKey(key))) {
      const stringValue = readString(value);
      if (stringValue) {
        return stringValue;
      }
    }
  }

  return null;
}

function isStrongErrorEvent(event: EventRow): boolean {
  const attributes = parseJsonObject(event.attributes_json);
  const severityNumber = event.severity_number;
  const severityText = event.severity_text;
  const hasException =
    Boolean(readString(attributes['exception.type'])) ||
    Boolean(readString(attributes['error.type'])) ||
    /(^|[_.:-])(error|exception|fatal)([_.:-]|$)/i.test(event.event_name);

  if (severityNumber !== null && severityNumber >= 17) {
    return true;
  }

  if (severityText && /^(error|fatal)$/i.test(severityText)) {
    return true;
  }

  return hasException;
}

function inferArtifact(artifactFullPath: string): {
  artifactKey: string;
  workItemKey: string;
  repoName: string | null;
  businessDomain: string | null;
  workItemSlug: string;
  workItemTitle: string | null;
  relativeDir: string;
  artifactType: string;
  artifactRelativePath: string;
  artifactFullPath: string;
  systemModule: string | null;
} | null {
  const normalized = artifactFullPath.replace(/\\/g, '/');
  const segments = normalized.split('/').filter(Boolean);
  const workItemIndex = segments.findIndex(segment => /^\d{4}-\d{2}-\d{2}-.+/.test(segment));

  if (workItemIndex <= 0) {
    return null;
  }

  const repoName = workItemIndex >= 2 ? segments[workItemIndex - 2] ?? null : null;
  const businessDomain = segments[workItemIndex - 1] ?? null;
  const workItemSlug = segments[workItemIndex] ?? '';
  if (!workItemSlug) {
    return null;
  }
  const relativeSegments = segments.slice(workItemIndex - 1);
  const artifactRelativeSegments = segments.slice(workItemIndex);
  const fileName = segments.at(-1) ?? '';
  const moduleCandidate = artifactRelativeSegments.length >= 3 ? artifactRelativeSegments[1] : null;
  const relativeDir = relativeSegments.slice(0, 2).join('/');

  return {
    artifactKey: sha256(`artifact:${normalized}`),
    workItemKey: sha256(`work-item:${repoName ?? ''}:${relativeDir}`),
    repoName,
    businessDomain,
    workItemSlug,
    workItemTitle: titleFromSlug(workItemSlug),
    relativeDir,
    artifactType: artifactTypeFromFileName(fileName),
    artifactRelativePath: artifactRelativeSegments.join('/'),
    artifactFullPath: normalized,
    systemModule: moduleCandidate && !moduleCandidate.endsWith('.md') ? moduleCandidate : null,
  };
}

function artifactTypeFromFileName(fileName: string): string {
  const lower = fileName.toLowerCase();
  if (lower.startsWith('proposal')) {
    return 'proposal';
  }
  if (lower.startsWith('design')) {
    return 'design';
  }
  if (lower === 'tasks.md') {
    return 'task';
  }
  if (lower.includes('review')) {
    return 'review';
  }
  if (lower.includes('test')) {
    return 'test';
  }
  return 'document';
}

function titleFromSlug(slug: string): string | null {
  const matched = /^\d{4}-\d{2}-\d{2}-(.+)$/.exec(slug);
  return matched?.[1] ?? null;
}

async function selectIdByKey(
  connection: PoolConnection,
  tableName: 'sdd_interactions' | 'sdd_work_items',
  keyColumn: 'interaction_key' | 'work_item_key',
  key: string,
): Promise<string> {
  const [rows] = await connection.query<IdRow[]>(
    `SELECT id FROM ${tableName} WHERE ${keyColumn} = ? LIMIT 1`,
    [key],
  );
  const id = rows[0]?.id;
  if (!id) {
    throw new Error(`failed to select id from ${tableName}`);
  }
  return String(id);
}

function normalizeSeverity(severityText: string | null): string {
  if (!severityText) {
    return 'error';
  }

  return severityText.toLowerCase();
}

function readBoolean(value: unknown): boolean {
  return value === true || value === 'true' || value === 1 || value === '1';
}

function jsonParam(value: unknown): string | null {
  if (value === null || value === undefined) {
    return null;
  }

  return JSON.stringify(value);
}

function asDate(value: Date | string | null | undefined): Date | null {
  if (!value) {
    return null;
  }

  return value instanceof Date ? value : new Date(value);
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values));
}

function isNonEmptyString(value: string | null): value is string {
  return typeof value === 'string' && value.length > 0;
}

function normalizeKey(key: string): string {
  return key.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function stringifyError(error: unknown): string {
  if (error instanceof Error) {
    return `${error.name}: ${error.message}\n${error.stack ?? ''}`.trim();
  }

  return String(error);
}
