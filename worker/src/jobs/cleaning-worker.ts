import type { Pool, PoolConnection } from 'mysql2/promise';
import type { Logger } from 'pino';
import { withTransaction } from '../infrastructure/mysql/client';
import {
  CleaningRepository,
  type EventRow,
  type LoadedBatch,
} from './cleaning.repository';
import {
  extractArtifactFromToolResult,
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
  maxPayloadBytes?: number;
  maxEventCount?: number;
}

export interface CleanBatchResult {
  batchId: string;
  skipped: boolean;
  eventCount: number;
  derivedCount: number;
}

interface InteractionRef {
  id: string;
  key: string;
}

interface SkillSemanticMatcher {
  semanticId: string;
  semanticCode: string;
  artifactFilenamePatterns: string[];
  skillNames: Set<string>;
}

interface SkillCandidate {
  event: EventRow;
  eventIndex: number;
  rawSkillName: string;
  semantic: SkillSemanticMatcher | null;
  isActivatedEvent: boolean;
}

const cleaningRepository = new CleaningRepository();

export class TerminalCleaningError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TerminalCleaningError';
  }
}

export async function cleanBatch(
  job: CleanBatchJob,
  dependencies: CleaningWorkerDependencies,
): Promise<CleanBatchResult> {
  const eventRetentionDays =
    dependencies.eventRetentionDays ?? Number(process.env.EVENT_RETENTION_DAYS ?? 30);
  const textRetentionDays =
    dependencies.textRetentionDays ?? Number(process.env.TEXT_RETENTION_DAYS ?? 30);
  const maxPayloadBytes =
    dependencies.maxPayloadBytes ??
    Number(process.env.CLEAN_BATCH_MAX_PAYLOAD_BYTES ?? 5 * 1024 * 1024);
  const maxEventCount =
    dependencies.maxEventCount ?? Number(process.env.CLEAN_BATCH_MAX_EVENTS ?? 500);
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

    const payloadBytes = Buffer.byteLength(loadedBatch.payloadJson);
    if (payloadBytes > maxPayloadBytes) {
      throw new TerminalCleaningError(
        `raw payload is too large to clean in one FaaS schedule tick: ${payloadBytes} bytes, limit ${maxPayloadBytes} bytes`,
      );
    }

    const payload = parsePayload(loadedBatch.payloadJson);
    const events = extractOtelLogEvents(payload, loadedBatch.batchId);
    if (events.length > maxEventCount) {
      throw new TerminalCleaningError(
        `batch has too many events to clean in one FaaS schedule tick: ${events.length}, limit ${maxEventCount}`,
      );
    }

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
  await cleaningRepository.markBatchFailed(
    pool,
    batchId,
    status,
    status === 'failed_terminal' ? 'terminal cleaning failure' : 'retryable cleaning failure',
    stringifyError(error),
  );
}

async function markBatchProcessing(pool: Pool, batchId: string): Promise<LoadedBatch | null> {
  return withTransaction(pool, async (connection) => {
    const rows = await cleaningRepository.lockAndLoadBatch(connection, batchId);
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

    await cleaningRepository.markBatchProcessing(connection, batchId);

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
  return withTransaction(pool, async (connection) => {
    for (const event of input.events) {
      await upsertLogEvent(connection, input.batch, event, input.eventRetentionDays);
    }

    const scopedEvents = await loadScopedEvents(connection, input.batch.batchId, input.events);
    const interactions = await upsertInteractions(
      connection,
      scopedEvents,
      input.textRetentionDays,
    );
    const toolCalls = await upsertToolCalls(connection, scopedEvents, interactions);
    const usages = await upsertSkillUsages(connection, scopedEvents, interactions);
    const artifacts = await upsertWorkItems(connection, scopedEvents);
    const errors = await upsertErrors(connection, scopedEvents, interactions);

    return interactions.size + toolCalls + usages + errors + artifacts;
  });
}

async function upsertLogEvent(
  connection: PoolConnection,
  batch: LoadedBatch,
  event: ExtractedLogEvent,
  eventRetentionDays: number,
): Promise<void> {
  await cleaningRepository.upsertLogEvent(connection, {
    eventId: event.eventId,
    batchId: batch.batchId,
    userId: batch.userId,
    sessionId: event.sessionId,
    promptId: event.promptId,
    traceId: event.traceId,
    spanId: event.spanId,
    eventName: event.eventName,
    displayName: event.displayName,
    serviceName: event.serviceName,
    serviceVersion: event.serviceVersion,
    severityText: event.severityText,
    severityNumber: event.severityNumber,
    eventTime: event.eventTime,
    eventSequence: event.eventSequence,
    observedAt: event.observedAt,
    attributesJson: jsonParam(event.attributes),
    resourceJson: jsonParam(event.resource),
    bodyJson: jsonParam(event.bodyJson),
    bodyText: event.bodyText,
    eventRetentionDays,
  });
}

async function loadScopedEvents(
  connection: PoolConnection,
  batchId: string,
  events: ExtractedLogEvent[],
): Promise<EventRow[]> {
  const promptIds = unique(events.map((event) => event.promptId).filter(isNonEmptyString));
  const sessionIds = unique(events.map((event) => event.sessionId).filter(isNonEmptyString));
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

  return cleaningRepository.loadScopedEvents(connection, clauses, params);
}

async function upsertInteractions(
  connection: PoolConnection,
  events: EventRow[],
  textRetentionDays: number,
): Promise<Map<string, InteractionRef>> {
  const groups = groupInteractionEvents(events);
  const refs = new Map<string, InteractionRef>();

  for (const [key, groupEvents] of groups.entries()) {
    const orderedEvents = sortEventsBySequence(groupEvents);
    const apiRequestEvents = orderedEvents.filter(isApiRequestEvent);
    const apiErrorEvents = orderedEvents.filter(isApiErrorEvent);
    const responseEvents = orderedEvents.filter(isApiResponseBodyEvent);
    const firstEvent = orderedEvents[0];
    if (!firstEvent) {
      continue;
    }

    const terminalEvents = [...apiRequestEvents, ...apiErrorEvents].sort(compareEventsBySequence);
    const lastTerminalEvent = terminalEvents.at(-1) ?? null;
    const requestEvent =
      apiRequestEvents[0] ??
      orderedEvents.find(isApiRequestBodyEvent) ??
      orderedEvents.find(isUserPromptEvent) ??
      firstEvent;
    const responseEvent = responseEvents[0] ?? null;
    const completedEvent =
      [...terminalEvents, ...responseEvents].sort(compareEventsBySequence).at(-1) ?? null;
    const userId = firstNonNull(orderedEvents.map((event) => event.user_id));
    const sessionId = firstNonNull(orderedEvents.map((event) => event.session_id));
    const promptId = firstNonNull(orderedEvents.map((event) => event.prompt_id));
    const startedAt = asDate(firstEvent.event_time);
    const completedAt = asDate(completedEvent?.event_time);
    const tier1Metrics = extractTier1Metrics(apiRequestEvents);
    const fallbackDurationMs =
      startedAt && completedAt ? Math.max(0, completedAt.getTime() - startedAt.getTime()) : null;
    const durationMs = tier1Metrics.durationMs ?? fallbackDurationMs;
    const status = lastTerminalEvent
      ? isApiErrorEvent(lastTerminalEvent)
        ? 'failed'
        : 'completed'
      : 'partial';
    const commandName =
      pickFirstRowString(orderedEvents.filter(isUserPromptEvent), [
        'command_name',
        'command.name',
        'skill_name',
        'skill.name',
      ]) ??
      pickFirstRowString(orderedEvents, [
        'command_name',
        'command.name',
        'skill_name',
        'skill.name',
      ]);
    const commandSource =
      pickFirstRowString(orderedEvents.filter(isUserPromptEvent), [
        'command_source',
        'command.source',
      ]) ?? pickFirstRowString(orderedEvents, ['command_source', 'command.source']);
    const responseContent = extractResponseContent(orderedEvents);
    const promptText = extractPromptTextFromEvents(orderedEvents);

    await cleaningRepository.upsertInteraction(connection, {
      interactionKey: key,
      userId,
      sessionId,
      promptId,
      requestEventId: requestEvent?.event_id ?? null,
      responseEventId: responseEvent?.event_id ?? null,
      status,
      model: tier1Metrics.model,
      commandName,
      commandSource,
      pairingMethod: promptId ? 'prompt_id' : 'session_window',
      startedAt,
      completedAt,
      durationMs,
      costUsd: tier1Metrics.costUsd,
      inputTokens: tier1Metrics.inputTokens,
      outputTokens: tier1Metrics.outputTokens,
      cacheReadTokens: tier1Metrics.cacheReadTokens,
      cacheCreationTokens: tier1Metrics.cacheCreationTokens,
      llmCallCount: tier1Metrics.llmCallCount,
      toolCallCount: countToolCalls(orderedEvents),
      skillName: tier1Metrics.skillName,
      agentName: tier1Metrics.agentName,
      pluginName: tier1Metrics.pluginName,
      querySource: tier1Metrics.querySource,
      effort: tier1Metrics.effort,
      speed: tier1Metrics.speed,
      sourceBatchId: firstEvent.batch_id,
      evidenceJson: jsonParam({
        eventIds: groupEvents.map((event) => event.event_id),
        requestEventId: requestEvent?.event_id ?? null,
        responseEventId: responseEvent?.event_id ?? null,
      }),
    });

    const interactionId = await selectIdByKey(
      connection,
      'sdd_interactions',
      'interaction_key',
      key,
    );
    refs.set(key, { id: interactionId, key });

    await cleaningRepository.upsertInteractionText(connection, {
      interactionId,
      promptText,
      responseText: responseContent.responseText,
      responseJson: responseContent.responseJson,
      textRetentionDays,
    });
  }

  return refs;
}

async function upsertToolCalls(
  connection: PoolConnection,
  events: EventRow[],
  interactions: Map<string, InteractionRef>,
): Promise<number> {
  const toolEvents = sortEventsBySequence(events).filter(
    (event) => isToolDecisionEvent(event) || isToolResultEvent(event),
  );
  const groups = new Map<string, EventRow[]>();

  for (const event of toolEvents) {
    const toolUseId = pickRowString(event, ['tool_use_id', 'tool.use_id', 'toolUseId']);
    if (!toolUseId) {
      continue;
    }

    const group = groups.get(toolUseId) ?? [];
    group.push(event);
    groups.set(toolUseId, group);
  }

  let count = 0;
  for (const [toolUseId, groupEvents] of groups.entries()) {
    const orderedEvents = sortEventsBySequence(groupEvents);
    const decisionEvent = orderedEvents.find(isToolDecisionEvent) ?? null;
    const resultEvent = [...orderedEvents].reverse().find(isToolResultEvent) ?? null;
    const firstEvent = orderedEvents[0];
    if (!firstEvent) {
      continue;
    }

    const interaction = interactions.get(interactionKeyForEvent(firstEvent));
    if (!interaction) {
      continue;
    }

    const toolName =
      pickRowString(decisionEvent, ['tool_name', 'tool.name', 'name']) ??
      pickRowString(resultEvent, ['tool_name', 'tool.name', 'name']) ??
      'unknown';
    const sequence = firstEvent.event_sequence ?? 0;

    await cleaningRepository.upsertToolCall(connection, {
      interactionId: interaction.id,
      toolUseId,
      toolName,
      sequence,
      decision: pickRowString(decisionEvent, ['decision']),
      decisionSource: pickRowString(decisionEvent, ['decision_source', 'decision.source']),
      success: pickRowBoolean(resultEvent, ['success', 'tool_result.success', 'tool.success']),
      durationMs: pickRowNumber(resultEvent, ['duration_ms', 'duration.ms']),
      inputSizeBytes: pickRowNumber(resultEvent, ['tool_input_size_bytes', 'input_size_bytes']),
      resultSizeBytes: pickRowNumber(resultEvent, [
        'tool_result_size_bytes',
        'result_size_bytes',
      ]),
      errorType: pickRowString(resultEvent, ['error_type', 'error.type']),
      toolInputPreview: extractToolInputPreview(resultEvent ?? decisionEvent),
      mcpServerScope: pickRowString(resultEvent ?? decisionEvent, [
        'mcp_server_scope',
        'mcp.server.scope',
      ]),
      evidenceJson: jsonParam({
        eventIds: orderedEvents.map((event) => event.event_id),
        toolDecisionEventId: decisionEvent?.event_id ?? null,
        toolResultEventId: resultEvent?.event_id ?? null,
      }),
    });
    count += 1;
  }

  return count;
}

async function upsertSkillUsages(
  connection: PoolConnection,
  events: EventRow[],
  interactions: Map<string, InteractionRef>,
): Promise<number> {
  const aliases = await cleaningRepository.loadSkillAliases(connection);
  const aliasBySkillName = new Map(aliases.map((alias) => [alias.skill_name, alias]));
  let count = 0;

  for (const event of events) {
    if (normalizeEventName(event.event_name) !== 'skill_activated') {
      continue;
    }

    const rawSkillName = pickRowString(event, ['skill_name', 'skill.name', 'sdd.skill_name']);
    if (!rawSkillName) {
      continue;
    }

    const alias = aliasBySkillName.get(rawSkillName);
    const matchedBy = alias ? 'alias_exact' : 'unmatched';

    const interaction = interactions.get(interactionKeyForEvent(event));
    const usageKey = sha256(`usage:${event.event_id}:${rawSkillName}`);

    await cleaningRepository.upsertSkillUsage(connection, {
      usageKey,
      semanticId: alias?.semantic_id ?? null,
      aliasId: alias?.alias_id ?? null,
      interactionId: interaction?.id ?? null,
      userId: event.user_id,
      sessionId: event.session_id,
      promptId: event.prompt_id,
      rawSkillName,
      skillSource: pickRowString(event, ['skill_source', 'skill.source']),
      invocationTrigger: pickRowString(event, ['invocation_trigger', 'trigger']),
      commandName: pickRowString(event, ['command_name', 'command.name']) ?? rawSkillName,
      serviceVersion: event.service_version,
      observedVersion: pickRowString(event, ['skill.version', 'sdd.skill_version']),
      matchedBy,
      eventTime: asDate(event.event_time),
    });
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
    const { usageId, workItemId } = await findUsageAndWorkItemForError(connection, event);

    await cleaningRepository.upsertError(connection, {
      errorKey: sha256(`error:${event.event_id}:${messageHash ?? ''}`),
      userId: event.user_id,
      batchId: event.batch_id,
      eventId: event.event_id,
      interactionId: interaction?.id ?? null,
      usageId,
      workItemId,
      errorType,
      severity: normalizeSeverity(event.severity_text),
      source: pickRowString(event, ['error.source', 'source']),
      retryable: readBoolean(attributes.retryable) ? 1 : 0,
      errorMessageHash: messageHash,
      errorMessage,
      stackHash,
      stackTrace,
      eventTime: asDate(event.event_time),
    });
    count += 1;
  }

  return count;
}

async function upsertWorkItems(connection: PoolConnection, events: EventRow[]): Promise<number> {
  const artifactEvents = events
    .map((event) => ({
      event,
      artifact: extractWriteArtifactSignal(event),
    }))
    .filter(
      (
        item,
      ): item is {
        event: EventRow;
        artifact: { filePath: string; isWrite: true };
      } => item.artifact !== null,
    );

  if (artifactEvents.length === 0) {
    return 0;
  }

  const userRequirementsRoots = await loadUserRequirementsRoots(connection, events);
  const semantics = await loadSkillSemanticMatchers(connection);
  const skillByAlias = indexSkillSemanticsByAlias(semantics);
  const eventIndexById = new Map(events.map((event, index) => [event.event_id, index]));
  const skillCandidatesBySession = indexSkillCandidates(events, eventIndexById, skillByAlias);
  let count = 0;

  for (const { event, artifact: signal } of artifactEvents) {
    const requirementsRootPath = event.user_id
      ? userRequirementsRoots.get(String(event.user_id))
      : null;
    if (!requirementsRootPath || !isPathInsideRoot(signal.filePath, requirementsRootPath)) {
      continue;
    }

    const artifact = inferArtifact(signal.filePath, requirementsRootPath);
    if (!artifact) {
      continue;
    }

    const attribution = attributeSkillForArtifact({
      event,
      artifact,
      semantics,
      skillCandidatesBySession,
      eventIndex: eventIndexById.get(event.event_id) ?? 0,
    });
    const artifactType =
      attribution.filenameSemantic?.semanticCode ??
      attribution.skillCandidate?.semantic?.semanticCode ??
      artifact.artifactType;

    await cleaningRepository.upsertWorkItem(connection, {
      workItemKey: artifact.workItemKey,
      requirementsRepoName: artifact.repoName,
      businessDomain: artifact.businessDomain,
      workItemSlug: artifact.workItemSlug,
      workItemTitle: artifact.workItemTitle,
      relativeDir: artifact.relativeDir,
      firstSeenAt: asDate(event.event_time),
      lastSeenAt: asDate(event.event_time),
    });

    const workItemId = await selectIdByKey(
      connection,
      'sdd_work_items',
      'work_item_key',
      artifact.workItemKey,
    );

    await cleaningRepository.upsertWorkItemArtifact(connection, {
      artifactKey: artifact.artifactKey,
      workItemId,
      artifactType,
      artifactRelativePath: artifact.artifactRelativePath,
      artifactFullPath: artifact.artifactFullPath,
      systemModule: artifact.systemModule,
      firstSeenEventId: event.event_id,
      firstSeenAt: asDate(event.event_time),
      lastSeenAt: asDate(event.event_time),
    });

    if (attribution.skillCandidate?.semantic && event.session_id) {
      await linkSkillUsageToWorkItem(connection, {
        workItemId,
        sessionId: event.session_id,
        rawSkillName: attribution.skillCandidate.rawSkillName,
        artifactEventTime: asDate(event.event_time),
      });
    }

    count += 1;
  }

  return count;
}

function extractWriteArtifactSignal(event: EventRow): { filePath: string; isWrite: true } | null {
  const attributes = parseJsonObject(event.attributes_json);
  const isWrite =
    readBoolean(attributes['sdd.artifact_is_write']) ||
    readBoolean(attributes['sdd.artifact.is_write']);
  const persistedPath =
    readString(attributes['sdd.artifact_path']) ??
    readString(attributes['sdd.artifact.path']) ??
    readString(attributes['artifact.path']);

  if (isWrite && persistedPath) {
    return {
      filePath: persistedPath,
      isWrite: true,
    };
  }

  return extractArtifactFromToolResult({
    eventName: event.event_name,
    attributes,
  });
}

async function loadUserRequirementsRoots(
  connection: PoolConnection,
  events: EventRow[],
): Promise<Map<string, string>> {
  const userIds = unique(
    events
      .map((event) => event.user_id)
      .filter((userId): userId is string | number => userId !== null && userId !== undefined)
      .map(String)
      .filter((value) => value.length > 0),
  );
  if (userIds.length === 0) {
    return new Map();
  }

  const rows = await cleaningRepository.loadUserRequirementsRoots(connection, userIds);
  const roots = new Map<string, string>();

  for (const row of rows) {
    if (row.requirements_root_path) {
      roots.set(String(row.id), row.requirements_root_path);
    }
  }

  return roots;
}

async function loadSkillSemanticMatchers(
  connection: PoolConnection,
): Promise<SkillSemanticMatcher[]> {
  const rows = await cleaningRepository.loadSkillSemanticMatchers(connection);
  const byId = new Map<string, SkillSemanticMatcher>();

  for (const row of rows) {
    const semanticId = String(row.semantic_id);
    const semantic =
      byId.get(semanticId) ??
      ({
        semanticId,
        semanticCode: row.semantic_code,
        artifactFilenamePatterns:
          parsePatternArray(row.artifact_filename_patterns) ??
          defaultArtifactFilenamePatterns(row.semantic_code),
        skillNames: new Set<string>(),
      } satisfies SkillSemanticMatcher);

    if (row.skill_name) {
      semantic.skillNames.add(row.skill_name);
    }

    byId.set(semanticId, semantic);
  }

  return Array.from(byId.values());
}

function indexSkillSemanticsByAlias(
  semantics: SkillSemanticMatcher[],
): Map<string, SkillSemanticMatcher> {
  const byAlias = new Map<string, SkillSemanticMatcher>();

  for (const semantic of semantics) {
    for (const skillName of semantic.skillNames) {
      byAlias.set(skillName, semantic);
    }
  }

  return byAlias;
}

function indexSkillCandidates(
  events: EventRow[],
  eventIndexById: Map<string, number>,
  skillByAlias: Map<string, SkillSemanticMatcher>,
): Map<string, SkillCandidate[]> {
  const candidatesBySession = new Map<string, SkillCandidate[]>();

  for (const event of events) {
    if (!event.session_id) {
      continue;
    }

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

    const candidates = candidatesBySession.get(event.session_id) ?? [];
    candidates.push({
      event,
      eventIndex: eventIndexById.get(event.event_id) ?? 0,
      rawSkillName,
      semantic: skillByAlias.get(rawSkillName) ?? null,
      isActivatedEvent: normalizeEventName(event.event_name) === 'skill_activated',
    });
    candidatesBySession.set(event.session_id, candidates);
  }

  for (const candidates of candidatesBySession.values()) {
    candidates.sort((left, right) => left.eventIndex - right.eventIndex);
  }

  return candidatesBySession;
}

function attributeSkillForArtifact(input: {
  event: EventRow;
  artifact: NonNullable<ReturnType<typeof inferArtifact>>;
  semantics: SkillSemanticMatcher[];
  skillCandidatesBySession: Map<string, SkillCandidate[]>;
  eventIndex: number;
}): {
  filenameSemantic: SkillSemanticMatcher | null;
  skillCandidate: SkillCandidate | null;
} {
  const filenameSemantic = findSemanticByFileName(input.artifact.fileName, input.semantics);
  const sessionCandidates = input.event.session_id
    ? (input.skillCandidatesBySession.get(input.event.session_id) ?? [])
    : [];
  const previousCandidates = sessionCandidates.filter(
    (candidate) => candidate.eventIndex <= input.eventIndex,
  );

  if (previousCandidates.length === 0) {
    return {
      filenameSemantic,
      skillCandidate: null,
    };
  }

  const activatedCandidates = previousCandidates.filter((candidate) => candidate.isActivatedEvent);
  const candidates = activatedCandidates.length > 0 ? activatedCandidates : previousCandidates;

  if (filenameSemantic) {
    const semanticMatchedCandidate = findNearestCandidate(
      candidates.filter(
        (candidate) => candidate.semantic?.semanticId === filenameSemantic.semanticId,
      ),
    );
    if (semanticMatchedCandidate) {
      return {
        filenameSemantic,
        skillCandidate: semanticMatchedCandidate,
      };
    }
  }

  return {
    filenameSemantic,
    skillCandidate:
      findNearestCandidate(candidates.filter((candidate) => candidate.semantic !== null)) ??
      findNearestCandidate(candidates),
  };
}

function findNearestCandidate(candidates: SkillCandidate[]): SkillCandidate | null {
  return candidates.at(-1) ?? null;
}

function findSemanticByFileName(
  fileName: string,
  semantics: SkillSemanticMatcher[],
): SkillSemanticMatcher | null {
  for (const semantic of semantics) {
    if (semantic.artifactFilenamePatterns.some((pattern) => globMatch(fileName, pattern))) {
      return semantic;
    }
  }

  return null;
}

async function findUsageAndWorkItemForError(
  connection: PoolConnection,
  event: EventRow,
): Promise<{ usageId: string | null; workItemId: string | null }> {
  if (!event.session_id) {
    return { usageId: null, workItemId: null };
  }
  const errorEventTime = asDate(event.event_time);
  return cleaningRepository.findUsageAndWorkItemForError(
    connection,
    event.session_id,
    errorEventTime,
  );
}

async function linkSkillUsageToWorkItem(
  connection: PoolConnection,
  input: {
    workItemId: string;
    sessionId: string;
    rawSkillName: string;
    artifactEventTime: Date | null;
  },
): Promise<void> {
  await cleaningRepository.linkSkillUsageToWorkItem(connection, input);
}

async function markBatchParsed(
  pool: Pool,
  batchId: string,
  eventCount: number,
  derivedCount: number,
): Promise<void> {
  await cleaningRepository.markBatchParsed(pool, batchId, eventCount, derivedCount);
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

function sortEventsBySequence(events: EventRow[]): EventRow[] {
  return [...events].sort(compareEventsBySequence);
}

function compareEventsBySequence(left: EventRow, right: EventRow): number {
  const leftSequence = left.event_sequence ?? Number.MAX_SAFE_INTEGER;
  const rightSequence = right.event_sequence ?? Number.MAX_SAFE_INTEGER;
  if (leftSequence !== rightSequence) {
    return leftSequence - rightSequence;
  }

  const leftTime = asDate(left.event_time)?.getTime() ?? Number.MAX_SAFE_INTEGER;
  const rightTime = asDate(right.event_time)?.getTime() ?? Number.MAX_SAFE_INTEGER;
  if (leftTime !== rightTime) {
    return leftTime - rightTime;
  }

  return Number(left.id) - Number(right.id);
}

function extractTier1Metrics(events: EventRow[]): {
  model: string | null;
  costUsd: number | null;
  inputTokens: number | null;
  outputTokens: number | null;
  cacheReadTokens: number | null;
  cacheCreationTokens: number | null;
  durationMs: number | null;
  llmCallCount: number;
  skillName: string | null;
  agentName: string | null;
  pluginName: string | null;
  querySource: string | null;
  effort: string | null;
  speed: string | null;
} {
  return {
    model: pickLastRowString(events, ['model', 'llm.model', 'model_name']),
    costUsd: sumRowNumbers(events, ['cost_usd']),
    inputTokens: sumRowNumbers(events, ['input_tokens', 'input.token_count']),
    outputTokens: sumRowNumbers(events, ['output_tokens', 'output.token_count']),
    cacheReadTokens: sumRowNumbers(events, ['cache_read_tokens', 'cache_read_input_tokens']),
    cacheCreationTokens: sumRowNumbers(events, [
      'cache_creation_tokens',
      'cache_creation_input_tokens',
      'cache_write_tokens',
    ]),
    durationMs: sumRowNumbers(events, ['duration_ms', 'duration.ms']),
    llmCallCount: events.length,
    skillName: pickLastRowString(events, ['skill_name', 'skill.name']),
    agentName: pickLastRowString(events, ['agent_name', 'agent.name']),
    pluginName: pickLastRowString(events, ['plugin_name', 'plugin.name']),
    querySource: pickLastRowString(events, ['query_source', 'query.source']),
    effort: pickLastRowString(events, ['effort']),
    speed: pickLastRowString(events, ['speed']),
  };
}

function extractPromptTextFromEvents(events: EventRow[]): string | null {
  for (const event of events.filter(isUserPromptEvent)) {
    const prompt = pickRowString(event, ['prompt', 'request.prompt', 'input', 'message.content']);
    if (prompt && !isRedacted(prompt)) {
      return prompt;
    }
  }

  for (const event of events.filter(isApiRequestBodyEvent)) {
    const attributes = parseJsonObject(event.attributes_json);
    const fromBody = extractPromptFromApiBodyJson(readString(attributes.body));
    if (fromBody && !isRedacted(fromBody)) {
      return fromBody;
    }
  }

  return null;
}

function extractResponseContent(events: EventRow[]): {
  responseText: string | null;
  responseJson: string | null;
} {
  const responseBodies: unknown[] = [];
  const responseTextParts: string[] = [];
  let toolUseIndex = 0;

  for (const event of events.filter(isApiResponseBodyEvent)) {
    const attributes = parseJsonObject(event.attributes_json);
    if (readBoolean(attributes.body_truncated)) {
      responseTextParts.push('[本次响应被截断]');
      continue;
    }

    const body = parseApiBody(readString(attributes.body));
    if (!body) {
      continue;
    }

    responseBodies.push(body);
    const content = body.content;
    if (!Array.isArray(content)) {
      continue;
    }

    const blockTexts: string[] = [];
    for (const item of content) {
      if (typeof item !== 'object' || item === null) {
        continue;
      }

      const block = item as Record<string, unknown>;
      const type = readString(block.type);
      if (type === 'text') {
        const text = readString(block.text);
        if (text) {
          blockTexts.push(text);
        }
        continue;
      }

      if (type === 'thinking') {
        blockTexts.push('[思考（脱敏）]');
        continue;
      }

      if (type === 'tool_use') {
        toolUseIndex += 1;
        const name = readString(block.name) ?? 'unknown';
        const inputPreview = stringifyPreview(block.input, 80);
        blockTexts.push(`[工具 #${toolUseIndex}: ${name}(${inputPreview})]`);
      }
    }

    if (blockTexts.length > 0) {
      responseTextParts.push(blockTexts.join('\n\n'));
    }
  }

  const responseJson =
    responseBodies.length === 0
      ? null
      : JSON.stringify(responseBodies.length === 1 ? responseBodies[0] : responseBodies);

  return {
    responseText: responseTextParts.length > 0 ? responseTextParts.join('\n\n---\n\n') : null,
    responseJson,
  };
}

function countToolCalls(events: EventRow[]): number {
  const toolUseIds = new Set<string>();
  for (const event of events) {
    if (!isToolResultEvent(event)) {
      continue;
    }

    const toolUseId = pickRowString(event, ['tool_use_id', 'tool.use_id', 'toolUseId']);
    if (toolUseId) {
      toolUseIds.add(toolUseId);
    }
  }

  return toolUseIds.size;
}

function isApiRequestEvent(event: EventRow): boolean {
  return isNamedEvent(event, 'api_request');
}

function isApiRequestBodyEvent(event: EventRow): boolean {
  return isNamedEvent(event, 'api_request_body');
}

function isApiResponseBodyEvent(event: EventRow): boolean {
  return isNamedEvent(event, 'api_response_body');
}

function isApiErrorEvent(event: EventRow): boolean {
  return isNamedEvent(event, 'api_error');
}

function isUserPromptEvent(event: EventRow): boolean {
  return isNamedEvent(event, 'user_prompt');
}

function isToolDecisionEvent(event: EventRow): boolean {
  return isNamedEvent(event, 'tool_decision');
}

function isToolResultEvent(event: EventRow): boolean {
  return isNamedEvent(event, 'tool_result');
}

function isNamedEvent(event: EventRow, expectedName: string): boolean {
  const normalized = normalizeEventName(event.event_name);
  return normalized === expectedName || normalized.endsWith(`_${expectedName}`);
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

  const explicit = pickRowString(event, ['prompt', 'request.prompt', 'input', 'message.content']);
  if (explicit) return explicit;

  // Claude Code api_request_body 事件：实际内容在 attributes.body 的 JSON 里
  const attributes = parseJsonObject(event.attributes_json);
  const bodyStr = readString(attributes['body']);
  const fromBody = extractPromptFromApiBodyJson(bodyStr);
  if (fromBody) return fromBody;

  // fallback：过滤掉等于 event_name 的标识符（如 "claude_code.api_request_body"）
  return event.body_text && event.body_text !== event.event_name ? event.body_text : null;
}

function extractResponseText(event: EventRow | null): string | null {
  if (!event) {
    return null;
  }

  const explicit = pickRowString(event, ['response', 'completion', 'output', 'answer']);
  if (explicit) return explicit;

  // Claude Code api_response_body 事件：实际内容在 attributes.body 的 JSON 里
  const attributes = parseJsonObject(event.attributes_json);
  const bodyStr = readString(attributes['body']);
  const fromBody = extractResponseFromApiBodyJson(bodyStr);
  if (fromBody) return fromBody;

  // fallback：过滤掉等于 event_name 的标识符（如 "claude_code.api_response_body"）
  return event.body_text && event.body_text !== event.event_name ? event.body_text : null;
}

function extractPromptFromApiBodyJson(bodyStr: string | null): string | null {
  if (!bodyStr) return null;
  let body: unknown;
  try {
    body = JSON.parse(bodyStr);
  } catch {
    return null;
  }
  if (typeof body !== 'object' || body === null) return null;
  const messages = (body as Record<string, unknown>).messages;
  if (!Array.isArray(messages)) return null;
  // 取最后一条 user 消息的文本
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (typeof msg !== 'object' || msg === null) continue;
    const m = msg as Record<string, unknown>;
    if (m.role !== 'user') continue;
    const content = m.content;
    if (typeof content === 'string' && content) return content;
    if (Array.isArray(content)) {
      for (const part of content) {
        if (typeof part === 'object' && part !== null) {
          const p = part as Record<string, unknown>;
          if (p.type === 'text' && typeof p.text === 'string' && p.text) return p.text;
        }
      }
    }
  }
  return null;
}

function extractResponseFromApiBodyJson(bodyStr: string | null): string | null {
  if (!bodyStr) return null;
  let body: unknown;
  try {
    body = JSON.parse(bodyStr);
  } catch {
    return null;
  }
  if (typeof body !== 'object' || body === null) return null;
  const content = (body as Record<string, unknown>).content;
  if (!Array.isArray(content)) return null;
  // 优先取第一个 text 块
  for (const item of content) {
    if (typeof item === 'object' && item !== null) {
      const block = item as Record<string, unknown>;
      if (block.type === 'text' && typeof block.text === 'string' && block.text) return block.text;
    }
  }
  // fallback：取工具调用名称
  for (const item of content) {
    if (typeof item === 'object' && item !== null) {
      const block = item as Record<string, unknown>;
      if (block.type === 'tool_use' && typeof block.name === 'string')
        return `[工具: ${block.name}]`;
    }
  }
  return null;
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

function pickFirstRowString(events: EventRow[], keys: string[]): string | null {
  for (const event of events) {
    const value = pickRowString(event, keys);
    if (value) {
      return value;
    }
  }

  return null;
}

function pickLastRowString(events: EventRow[], keys: string[]): string | null {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index];
    if (!event) {
      continue;
    }

    const value = pickRowString(event, keys);
    if (value) {
      return value;
    }
  }

  return null;
}

function pickRowNumber(event: EventRow | undefined | null, keys: string[]): number | null {
  if (!event) {
    return null;
  }

  const attributes = parseJsonObject(event.attributes_json);
  for (const key of keys) {
    const value = readFiniteNumber(attributes[key]);
    if (value !== null) {
      return value;
    }
  }

  const normalizedKeys = new Set(keys.map(normalizeKey));
  for (const [key, value] of Object.entries(attributes)) {
    if (normalizedKeys.has(normalizeKey(key))) {
      const numberValue = readFiniteNumber(value);
      if (numberValue !== null) {
        return numberValue;
      }
    }
  }

  return null;
}

function pickRowBoolean(event: EventRow | undefined | null, keys: string[]): boolean | null {
  if (!event) {
    return null;
  }

  const attributes = parseJsonObject(event.attributes_json);
  for (const key of keys) {
    if (attributes[key] !== undefined) {
      return readBoolean(attributes[key]);
    }
  }

  const normalizedKeys = new Set(keys.map(normalizeKey));
  for (const [key, value] of Object.entries(attributes)) {
    if (normalizedKeys.has(normalizeKey(key))) {
      return readBoolean(value);
    }
  }

  return null;
}

function sumRowNumbers(events: EventRow[], keys: string[]): number | null {
  let total = 0;
  let seen = false;

  for (const event of events) {
    const value = pickRowNumber(event, keys);
    if (value === null) {
      continue;
    }

    total += value;
    seen = true;
  }

  return seen ? total : null;
}

function readFiniteNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function parseApiBody(bodyStr: string | null): Record<string, unknown> | null {
  if (!bodyStr) {
    return null;
  }

  try {
    const parsed: unknown = JSON.parse(bodyStr);
    return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function extractToolInputPreview(event: EventRow | undefined | null): string | null {
  if (!event) {
    return null;
  }

  const attributes = parseJsonObject(event.attributes_json);
  const value =
    attributes.tool_input ??
    attributes.tool_parameters ??
    attributes['tool.parameters'] ??
    attributes.input;

  if (value === null || value === undefined) {
    return null;
  }

  return stringifyPreview(value, 4096);
}

function stringifyPreview(value: unknown, maxBytes: number): string {
  if (value === null || value === undefined) {
    return '';
  }

  const text = typeof value === 'string' ? value : JSON.stringify(value);
  return truncateUtf8(text, maxBytes);
}

function truncateUtf8(value: string, maxBytes: number): string {
  if (Buffer.byteLength(value, 'utf8') <= maxBytes) {
    return value;
  }

  let end = value.length;
  while (end > 0 && Buffer.byteLength(value.slice(0, end), 'utf8') > maxBytes) {
    end -= 1;
  }

  return value.slice(0, end);
}

function isRedacted(value: string): boolean {
  return value.trim().toUpperCase() === '<REDACTED>';
}

function firstNonNull<T>(values: Array<T | null | undefined>): T | null {
  for (const value of values) {
    if (value !== null && value !== undefined) {
      return value;
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

function isPathInsideRoot(filePath: string, rootPath: string): boolean {
  const normalizedFilePath = normalizePath(filePath);
  const normalizedRootPath = trimTrailingSlash(normalizePath(rootPath));

  return (
    normalizedFilePath === normalizedRootPath ||
    normalizedFilePath.startsWith(`${normalizedRootPath}/`)
  );
}

function normalizePath(pathValue: string): string {
  return pathValue.replace(/\\/g, '/');
}

function trimTrailingSlash(pathValue: string): string {
  return pathValue.replace(/\/+$/g, '');
}

function parsePatternArray(value: unknown): string[] | null {
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === 'string');
  }

  if (typeof value !== 'string') {
    return null;
  }

  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === 'string')
      : null;
  } catch {
    return null;
  }
}

function defaultArtifactFilenamePatterns(semanticCode: string): string[] {
  switch (semanticCode) {
    case 'proposal':
      return ['proposal.md', 'proposal-*.md'];
    case 'design':
      return ['design.md', 'design-*.md'];
    case 'task':
      return ['tasks.md', 'tasks-*.md', 'task.md', 'task-*.md'];
    case 'codereview':
      return [
        'codereview.md',
        'codereview-*.md',
        'code-review.md',
        'code-review-*.md',
        'review.md',
        'review-*.md',
      ];
    case 'code':
      return ['implementation.md', 'implementation-*.md', 'code.md', 'code-*.md'];
    default:
      return [];
  }
}

function globMatch(value: string, pattern: string): boolean {
  const escapedPattern = pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*/g, '.*')
    .replace(/\?/g, '.');

  return new RegExp(`^${escapedPattern}$`, 'i').test(value);
}

function inferArtifact(
  artifactFullPath: string,
  requirementsRootPath: string,
): {
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
  fileName: string;
  systemModule: string | null;
} | null {
  const normalized = normalizePath(artifactFullPath);
  const normalizedRoot = trimTrailingSlash(normalizePath(requirementsRootPath));
  const relativePath = normalized.slice(normalizedRoot.length).replace(/^\/+/, '');
  const relativeSegments = relativePath.split('/').filter(Boolean);
  const workItemIndex = relativeSegments.findIndex((segment) =>
    /^\d{4}-\d{2}-\d{2}-.+/.test(segment),
  );

  if (workItemIndex <= 0) {
    return null;
  }

  const rootSegments = normalizedRoot.split('/').filter(Boolean);
  const repoName = rootSegments.at(-1) ?? null;
  const businessDomain = relativeSegments[workItemIndex - 1] ?? null;
  const workItemSlug = relativeSegments[workItemIndex] ?? '';
  if (!workItemSlug) {
    return null;
  }
  const workItemRelativeSegments = relativeSegments.slice(workItemIndex - 1);
  const artifactRelativeSegments = relativeSegments.slice(workItemIndex);
  const fileName = artifactRelativeSegments.at(-1) ?? '';
  const moduleCandidate = artifactRelativeSegments.length >= 3 ? artifactRelativeSegments[1] : null;
  const relativeDir = workItemRelativeSegments.slice(0, 2).join('/');

  return {
    artifactKey: sha256(`artifact:${relativeDir}:${artifactRelativeSegments.join('/')}`),
    workItemKey: sha256(`work-item:${businessDomain ?? ''}:${workItemSlug}`),
    repoName,
    businessDomain,
    workItemSlug,
    workItemTitle: titleFromSlug(workItemSlug),
    relativeDir,
    artifactType: artifactTypeFromFileName(fileName),
    artifactRelativePath: artifactRelativeSegments.join('/'),
    artifactFullPath: normalized,
    fileName,
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
  if (lower === 'tasks.md' || lower.startsWith('tasks-') || lower.startsWith('task')) {
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
  return cleaningRepository.selectIdByKey(connection, tableName, keyColumn, key);
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

function normalizeEventName(eventName: string): string {
  return eventName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
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
