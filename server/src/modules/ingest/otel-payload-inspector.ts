import { createHash } from 'node:crypto';

export interface OtlpUserHints {
  installId: string | null;
  otelUserId: string | null;
  userName: string | null;
  machineId: string | null;
  machineName: string | null;
  osName: string | null;
  osVersion: string | null;
  clientName: string | null;
  clientVersion: string | null;
  requirementsRootPath: string | null;
  wikiRootPath: string | null;
}

export interface OtlpPayloadSummary {
  payloadJson: string;
  payloadHash: string;
  payloadBytes: number;
  rawLogCount: number;
  userHints: OtlpUserHints;
}

export function summarizeOtlpPayload(payload: unknown): OtlpPayloadSummary {
  const payloadJson = JSON.stringify(payload);
  const payloadHash = sha256(payloadJson);
  const payloadBytes = Buffer.byteLength(payloadJson);
  const resourceAttributes = collectResourceAttributes(payload);

  return {
    payloadJson,
    payloadHash,
    payloadBytes,
    rawLogCount: countLogRecords(payload),
    userHints: {
      installId: pickAttribute(resourceAttributes, [
        'install_id',
        'install.id',
        'installId',
        'claude.install_id',
        'sdd.install_id',
      ]),
      otelUserId:
        pickAttribute(resourceAttributes, ['user.id', 'user_id', 'userId']) ??
        pickLogAttribute(payload, ['user.id', 'user_id', 'userId']),
      userName: pickAttribute(resourceAttributes, [
        'user.name',
        'user_name',
        'username',
        'account.name',
      ]),
      machineId: pickAttribute(resourceAttributes, [
        'machine.id',
        'machine_id',
        'host.id',
        'device.id',
      ]),
      machineName: pickAttribute(resourceAttributes, [
        'machine.name',
        'machine_name',
        'host.name',
        'device.name',
      ]),
      osName: pickAttribute(resourceAttributes, ['os.name', 'os.type']),
      osVersion: pickAttribute(resourceAttributes, ['os.version', 'os.description']),
      clientName: pickAttribute(resourceAttributes, ['service.name', 'telemetry.sdk.name']),
      clientVersion: pickAttribute(resourceAttributes, [
        'service.version',
        'telemetry.sdk.version',
      ]),
      requirementsRootPath: pickAttribute(resourceAttributes, [
        'requirements_root_path',
        'requirements.root_path',
        'sdd.requirements_root_path',
        'sdd.requirements.path',
      ]),
      wikiRootPath: pickAttribute(resourceAttributes, [
        'wiki_root_path',
        'wiki.root_path',
        'sdd.wiki_root_path',
        'sdd.wiki.path',
      ]),
    },
  };
}

export function createUserKey(hints: OtlpUserHints, payloadHash: string): string {
  if (hints.installId) {
    return sha256(`install:${hints.installId}`);
  }

  if (hints.machineId) {
    return sha256(`machine:${hints.machineId}`);
  }

  if (hints.otelUserId) {
    return sha256(`otel-user:${hints.otelUserId}`);
  }

  return sha256(`unknown:${payloadHash}`);
}

function countLogRecords(payload: unknown): number {
  if (!isRecord(payload)) {
    return 0;
  }

  const resourceLogs = Array.isArray(payload.resourceLogs) ? payload.resourceLogs : [];
  let count = 0;

  for (const resourceLog of resourceLogs) {
    if (!isRecord(resourceLog)) {
      continue;
    }

    const scopeLogs = Array.isArray(resourceLog.scopeLogs) ? resourceLog.scopeLogs : [];
    for (const scopeLog of scopeLogs) {
      if (!isRecord(scopeLog)) {
        continue;
      }

      const logRecords = Array.isArray(scopeLog.logRecords) ? scopeLog.logRecords : [];
      count += logRecords.length;
    }
  }

  return count;
}

function collectResourceAttributes(payload: unknown): Map<string, string> {
  const attributes = new Map<string, string>();

  if (!isRecord(payload)) {
    return attributes;
  }

  const resourceLogs = Array.isArray(payload.resourceLogs) ? payload.resourceLogs : [];
  for (const resourceLog of resourceLogs) {
    if (!isRecord(resourceLog)) {
      continue;
    }

    const resource = resourceLog.resource;
    if (!isRecord(resource) || !Array.isArray(resource.attributes)) {
      continue;
    }

    for (const attribute of resource.attributes) {
      if (!isRecord(attribute) || typeof attribute.key !== 'string') {
        continue;
      }

      const value = readOtelAttributeValue(attribute.value);
      if (value !== null && !attributes.has(attribute.key)) {
        attributes.set(attribute.key, value);
      }
    }
  }

  return attributes;
}

function pickLogAttribute(payload: unknown, keys: string[]): string | null {
  const attributes = new Map<string, string>();
  const normalizedTargets = new Set(keys.map(normalizeKey));

  if (!isRecord(payload)) {
    return null;
  }

  const resourceLogs = Array.isArray(payload.resourceLogs) ? payload.resourceLogs : [];
  for (const resourceLog of resourceLogs) {
    if (!isRecord(resourceLog)) {
      continue;
    }

    const scopeLogs = Array.isArray(resourceLog.scopeLogs) ? resourceLog.scopeLogs : [];
    for (const scopeLog of scopeLogs) {
      if (!isRecord(scopeLog)) {
        continue;
      }

      const logRecords = Array.isArray(scopeLog.logRecords) ? scopeLog.logRecords : [];
      for (const logRecord of logRecords) {
        if (!isRecord(logRecord) || !Array.isArray(logRecord.attributes)) {
          continue;
        }

        for (const attribute of logRecord.attributes) {
          if (
            !isRecord(attribute) ||
            typeof attribute.key !== 'string' ||
            !normalizedTargets.has(normalizeKey(attribute.key))
          ) {
            continue;
          }

          const value = readOtelAttributeValue(attribute.value);
          if (value !== null && !attributes.has(attribute.key)) {
            attributes.set(attribute.key, value);
          }
        }
      }
    }
  }

  return pickAttribute(attributes, keys);
}

function readOtelAttributeValue(value: unknown): string | null {
  if (!isRecord(value)) {
    return null;
  }

  for (const key of ['stringValue', 'intValue', 'doubleValue', 'boolValue']) {
    const candidate = value[key];
    if (candidate !== undefined && candidate !== null) {
      return String(candidate);
    }
  }

  return null;
}

function pickAttribute(attributes: Map<string, string>, keys: string[]): string | null {
  for (const key of keys) {
    const direct = attributes.get(key);
    if (direct) {
      return direct;
    }
  }

  const normalizedTargets = new Set(keys.map(normalizeKey));
  for (const [key, value] of attributes.entries()) {
    if (normalizedTargets.has(normalizeKey(key))) {
      return value;
    }
  }

  return null;
}

function normalizeKey(key: string): string {
  return key.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function sha256(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
