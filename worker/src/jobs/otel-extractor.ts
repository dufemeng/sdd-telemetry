import { createHash } from 'node:crypto';

export interface ExtractedLogEvent {
  eventId: string;
  sequence: number;
  eventSequence: number | null;
  eventName: string;
  displayName: string | null;
  sessionId: string | null;
  promptId: string | null;
  traceId: string | null;
  spanId: string | null;
  serviceName: string | null;
  serviceVersion: string | null;
  severityText: string | null;
  severityNumber: number | null;
  eventTime: Date | null;
  observedAt: Date | null;
  attributes: Record<string, unknown>;
  resource: Record<string, unknown>;
  bodyJson: unknown;
  bodyText: string | null;
  rawSkillName: string | null;
  artifactPath: string | null;
  promptText: string | null;
  responseText: string | null;
  errorType: string | null;
  errorMessage: string | null;
  stackTrace: string | null;
  isStrongError: boolean;
}

export interface ExtractedArtifactSignal {
  filePath: string;
  isWrite: true;
}

export interface ArtifactExtractionEvent {
  eventName: string;
  attributes: Record<string, unknown>;
}

export function extractOtelLogEvents(payload: unknown, batchId: string): ExtractedLogEvent[] {
  if (!isRecord(payload)) {
    return [];
  }

  const events: ExtractedLogEvent[] = [];
  const resourceLogs = Array.isArray(payload.resourceLogs) ? payload.resourceLogs : [];

  for (const [resourceIndex, resourceLog] of resourceLogs.entries()) {
    if (!isRecord(resourceLog)) {
      continue;
    }

    const resource = readAttributes(resourceLog.resource);
    const scopeLogs = collectScopeLogs(resourceLog);

    for (const [scopeIndex, scopeLog] of scopeLogs.entries()) {
      if (!isRecord(scopeLog)) {
        continue;
      }

      const logRecords = Array.isArray(scopeLog.logRecords) ? scopeLog.logRecords : [];
      for (const [recordIndex, logRecord] of logRecords.entries()) {
        if (!isRecord(logRecord)) {
          continue;
        }

        const attributes = readAttributesFromArray(logRecord.attributes);
        const bodyJson = readAnyValue(logRecord.body);
        const bodyText = readBodyText(bodyJson);
        const eventName =
          pickString(attributes, ['event_name', 'event.name', 'event.type', 'type', 'name']) ??
          'unknown';
        const eventSequence = readNumber(attributes['event.sequence']);
        const eventTime = readUnixNanoDate(logRecord.timeUnixNano);
        const observedAt = readUnixNanoDate(logRecord.observedTimeUnixNano);
        const promptText = pickPromptText(attributes, bodyJson, bodyText, eventName);
        const responseText = pickResponseText(attributes, bodyJson, bodyText, eventName);
        const errorMessage = pickString(attributes, [
          'error.message',
          'exception.message',
          'message',
        ]);
        const stackTrace = pickString(attributes, [
          'exception.stacktrace',
          'exception.stack_trace',
          'error.stack',
          'stack',
        ]);
        const severityNumber = readNumber(logRecord.severityNumber);
        const severityText = readString(logRecord.severityText);
        const errorType =
          pickString(attributes, ['error.type', 'exception.type']) ??
          (isErrorEventName(eventName) ? eventName : null);
        const rawSkillName = pickString(attributes, [
          'skill_name',
          'skill.name',
          'sdd.skill_name',
          'command_name',
          'command.name',
          'tool.name',
        ]);
        const toolResultArtifact = extractArtifactFromToolResult({
          eventName,
          attributes,
        });
        const artifactPath =
          toolResultArtifact?.filePath ??
          pickString(attributes, [
            'artifact.path',
            'file.path',
            'output_path',
            'requirements.path',
            'sdd.requirements_path',
            'sdd.artifact_path',
          ]);
        const persistedAttributes = toolResultArtifact
          ? {
              ...attributes,
              'sdd.artifact_path': toolResultArtifact.filePath,
              'sdd.artifact_is_write': 'true',
            }
          : attributes;
        const sessionId = pickString(attributes, ['session_id', 'session.id', 'claude.session_id']);
        const promptId = pickString(attributes, ['prompt_id', 'prompt.id']);

        events.push({
          eventId: createEventId({
            batchId,
            resourceIndex,
            scopeIndex,
            recordIndex,
            eventName,
            eventTime,
            promptId,
            sessionId,
          }),
          sequence: events.length,
          eventSequence,
          eventName,
          displayName: null,
          sessionId,
          promptId,
          traceId: readString(logRecord.traceId),
          spanId: readString(logRecord.spanId),
          serviceName: pickString(resource, ['service.name', 'telemetry.sdk.name']),
          serviceVersion: pickString(resource, ['service.version', 'telemetry.sdk.version']),
          severityText,
          severityNumber,
          eventTime,
          observedAt,
          attributes: persistedAttributes,
          resource,
          bodyJson,
          bodyText,
          rawSkillName,
          artifactPath,
          promptText,
          responseText,
          errorType,
          errorMessage:
            errorMessage ??
            (isStrongError(severityText, severityNumber, eventName, errorType) ? bodyText : null),
          stackTrace,
          isStrongError: isStrongError(severityText, severityNumber, eventName, errorType),
        });
      }
    }
  }

  return events;
}

export function sha256(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}

export function readString(value: unknown): string | null {
  if (value === undefined || value === null) {
    return null;
  }

  if (typeof value === 'string') {
    return value;
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }

  return null;
}

export function parseJsonObject(value: unknown): Record<string, unknown> {
  if (isRecord(value)) {
    return value;
  }

  if (typeof value === 'string') {
    try {
      const parsed: unknown = JSON.parse(value);
      return isRecord(parsed) ? parsed : {};
    } catch {
      return {};
    }
  }

  return {};
}

export function extractArtifactFromToolResult(
  event: ArtifactExtractionEvent,
): ExtractedArtifactSignal | null {
  if (normalizeEventName(event.eventName) !== 'tool_result') {
    return null;
  }

  const success =
    readString(event.attributes['tool_result.success']) ??
    readString(event.attributes['success']) ??
    readString(event.attributes['tool.success']);

  if (success !== 'true') {
    return null;
  }

  const toolInput = parseJsonObject(event.attributes.tool_input);
  const filePath = readString(toolInput.file_path) ?? readString(toolInput.path);
  if (!filePath || !isPathLike(filePath) || !hasWritableContentField(toolInput)) {
    return null;
  }

  return {
    filePath,
    isWrite: true,
  };
}

function collectScopeLogs(resourceLog: Record<string, unknown>): unknown[] {
  if (Array.isArray(resourceLog.scopeLogs)) {
    return resourceLog.scopeLogs;
  }

  if (Array.isArray(resourceLog.instrumentationLibraryLogs)) {
    return resourceLog.instrumentationLibraryLogs;
  }

  return [];
}

function readAttributes(resource: unknown): Record<string, unknown> {
  if (!isRecord(resource)) {
    return {};
  }

  return readAttributesFromArray(resource.attributes);
}

function readAttributesFromArray(attributes: unknown): Record<string, unknown> {
  if (!Array.isArray(attributes)) {
    return {};
  }

  const result: Record<string, unknown> = {};
  for (const attribute of attributes) {
    if (!isRecord(attribute) || typeof attribute.key !== 'string') {
      continue;
    }

    result[attribute.key] = readAnyValue(attribute.value);
  }

  return result;
}

function readAnyValue(value: unknown): unknown {
  if (!isRecord(value)) {
    return value ?? null;
  }

  if ('stringValue' in value) {
    return value.stringValue;
  }
  if ('intValue' in value) {
    return Number(value.intValue);
  }
  if ('doubleValue' in value) {
    return Number(value.doubleValue);
  }
  if ('boolValue' in value) {
    return Boolean(value.boolValue);
  }
  if (isRecord(value.arrayValue) && Array.isArray(value.arrayValue.values)) {
    return value.arrayValue.values.map(readAnyValue);
  }
  if (isRecord(value.kvlistValue) && Array.isArray(value.kvlistValue.values)) {
    return readAttributesFromArray(value.kvlistValue.values);
  }

  return value;
}

function readBodyText(bodyJson: unknown): string | null {
  if (typeof bodyJson === 'string') {
    return bodyJson;
  }

  if (bodyJson === null || bodyJson === undefined) {
    return null;
  }

  return JSON.stringify(bodyJson);
}

function pickString(attributes: Record<string, unknown>, keys: string[]): string | null {
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

function pickPromptText(
  attributes: Record<string, unknown>,
  bodyJson: unknown,
  bodyText: string | null,
  eventName: string,
): string | null {
  const explicit = pickString(attributes, ['prompt', 'request.prompt', 'input', 'message.content']);
  if (explicit) {
    return explicit;
  }

  if (isRecord(bodyJson)) {
    const bodyPrompt = pickString(bodyJson, ['prompt', 'input', 'message']);
    if (bodyPrompt) {
      return bodyPrompt;
    }
  }

  return /request|prompt|api_request_body/i.test(eventName) ? bodyText : null;
}

function pickResponseText(
  attributes: Record<string, unknown>,
  bodyJson: unknown,
  bodyText: string | null,
  eventName: string,
): string | null {
  const explicit = pickString(attributes, ['response', 'completion', 'output', 'answer']);
  if (explicit) {
    return explicit;
  }

  if (isRecord(bodyJson)) {
    const bodyResponse = pickString(bodyJson, ['response', 'completion', 'output', 'answer']);
    if (bodyResponse) {
      return bodyResponse;
    }
  }

  return /response|completion|api_response_body/i.test(eventName) ? bodyText : null;
}

function readUnixNanoDate(value: unknown): Date | null {
  const raw = readString(value);
  if (!raw) {
    return null;
  }

  const nanoseconds = BigInt(raw);
  const milliseconds = Number(nanoseconds / 1_000_000n);
  return new Date(milliseconds);
}

function readNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string' && value.length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function createEventId(input: {
  batchId: string;
  resourceIndex: number;
  scopeIndex: number;
  recordIndex: number;
  eventName: string;
  eventTime: Date | null;
  promptId: string | null;
  sessionId: string | null;
}): string {
  return sha256(
    [
      input.batchId,
      input.resourceIndex,
      input.scopeIndex,
      input.recordIndex,
      input.eventName,
      input.eventTime?.toISOString() ?? '',
      input.promptId ?? '',
      input.sessionId ?? '',
    ].join(':'),
  );
}

function isStrongError(
  severityText: string | null,
  severityNumber: number | null,
  eventName: string,
  errorType: string | null,
): boolean {
  if (severityNumber !== null && severityNumber >= 17) {
    return true;
  }

  if (severityText && /^(error|fatal)$/i.test(severityText)) {
    return true;
  }

  return Boolean(errorType) || isErrorEventName(eventName);
}

function isErrorEventName(eventName: string): boolean {
  return /(^|[_.:-])(error|exception|fatal)([_.:-]|$)/i.test(eventName);
}

function normalizeEventName(eventName: string): string {
  return eventName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function isPathLike(value: string): boolean {
  return (
    value.includes('/') || value.includes('\\') || value.startsWith('.') || value.startsWith('~')
  );
}

function hasWritableContentField(input: Record<string, unknown>): boolean {
  return hasOwn(input, 'content') || hasOwn(input, 'new_string');
}

function hasOwn(input: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(input, key);
}

function normalizeKey(key: string): string {
  return key.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
