import { createHash } from 'node:crypto';

export interface OtlpUserHints {
  installId: string | null;
  userName: string | null;
  machineId: string | null;
  machineName: string | null;
  osName: string | null;
  osVersion: string | null;
  clientName: string | null;
  clientVersion: string | null;
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
  const attributes = collectResourceAttributes(payload);

  return {
    payloadJson,
    payloadHash,
    payloadBytes,
    rawLogCount: countLogRecords(payload),
    userHints: {
      installId: pickAttribute(attributes, [
        'install_id',
        'install.id',
        'installId',
        'claude.install_id',
        'sdd.install_id',
      ]),
      userName: pickAttribute(attributes, ['user.name', 'user_name', 'username', 'account.name']),
      machineId: pickAttribute(attributes, ['machine.id', 'machine_id', 'host.id', 'device.id']),
      machineName: pickAttribute(attributes, [
        'machine.name',
        'machine_name',
        'host.name',
        'device.name',
      ]),
      osName: pickAttribute(attributes, ['os.name', 'os.type']),
      osVersion: pickAttribute(attributes, ['os.version', 'os.description']),
      clientName: pickAttribute(attributes, ['service.name', 'telemetry.sdk.name']),
      clientVersion: pickAttribute(attributes, ['service.version', 'telemetry.sdk.version']),
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
