const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:4318';

export interface ApiEnvelope<T> {
  success: boolean;
  data: T;
  message: string;
  timestamp: string;
}

export interface HealthData {
  status: string;
  rawBatches: number;
  ingestBatches: number;
  rawPayloadBytes: number;
  oldestRawExpiresAt: string | null;
  normalizedEvents: number;
  logEvents: number;
  interactions: number;
  skillUsages: number;
  activeSkillUsers: number;
}

export interface IngestHealthWindow {
  minutes: number;
  since: string;
  batchCount: number;
  eventCount: number;
  payloadBytes: number;
  failedBatches: number;
}

export interface IngestHealth {
  collectorStatus: 'empty' | 'receiving' | 'idle';
  generatedAt: string;
  lastReceivedAt: string | null;
  lastStoredBatchAt: string | null;
  lastDuplicateAt: string | null;
  minutesSinceLastReceived: number | null;
  windows: IngestHealthWindow[];
  totals: {
    ingestBatches: number;
    parsedBatches: number;
    failedBatches: number;
    receivedBatches: number;
    duplicateBatches: number;
    rawPayloads: number;
    rawPayloadBytes: number;
    logEvents: number;
  };
  rawRetention: {
    oldestRawExpiresAt: string | null;
    newestRawExpiresAt: string | null;
    retentionDays: number;
    maxBatches: number;
  };
  recentFailures: Array<{
    batchId: string;
    receivedAt: string;
    payloadBytes: number;
    logRecordCount: number;
    errorMessage: string | null;
  }>;
}

export interface EventDistributionRow {
  eventName: string;
  count: number;
  share: number;
  firstSeenAt: string | null;
  lastSeenAt: string | null;
  lastReceivedAt: string | null;
}

export interface EventTrendBucket {
  bucketStart: string;
  bucketEnd: string;
  eventCount: number;
  topEventName: string | null;
  topEventCount: number;
}

export interface EventDistribution {
  generatedAt: string;
  hours: number;
  limit: number;
  since: string;
  totalEvents: number;
  distinctEventNames: number;
  topEvents: EventDistributionRow[];
  trendBuckets: EventTrendBucket[];
}

export interface DataQualityField {
  field: string;
  sourceTable: string;
  totalRows: number;
  nonNullRows: number;
  nullRows: number;
  coverage: number;
  lastSeenAt: string | null;
  recentSamples: string[];
  status: 'good' | 'warn' | 'bad';
  note: string;
}

export interface DataQuality {
  generatedAt: string;
  totals: {
    logEvents: number;
    promptInteractions: number;
    skillInvocations: number;
    highConfidenceInteractions: number;
    interactionsWithPrompt: number;
    interactionsWithResponse: number;
  };
  fields: DataQualityField[];
  warnings: Array<{
    field: string;
    severity: 'warn' | 'bad';
    message: string;
  }>;
}

export interface RawBatchDetail {
  batchId: string;
  receivedAt: string;
  status: string;
  errorMessage: string | null;
  payloadHash: string;
  payloadBytes: number;
  logRecordCount: number;
  rawExpiresAt: string;
  duplicateCount: number;
  lastDuplicateAt: string | null;
  rawAvailable: boolean;
  summary: unknown;
}

export interface RawBatchDetails {
  generatedAt: string;
  limit: number;
  totals: {
    ingestBatches: number;
    parsedBatches: number;
    failedBatches: number;
    receivedBatches: number;
    duplicateBatches: number;
    rawPayloadBytes: number;
  };
  batches: RawBatchDetail[];
}

export interface SkillFunnelRow {
  skillName: string;
  triggered: number;
  withPrompt: number;
  withResponse: number;
  successfulPairs: number;
  lowConfidencePairs: number;
  activeUsers: number;
  sessions: number;
  firstSeenAt: string | null;
  lastSeenAt: string | null;
}

export interface SkillFunnel {
  generatedAt: string;
  totals: {
    triggered: number;
    withPrompt: number;
    withResponse: number;
    successfulPairs: number;
    lowConfidencePairs: number;
    activeUsers: number;
    sessions: number;
  };
  rows: SkillFunnelRow[];
}

export interface UserMachineSkillSummary {
  skillName: string;
  calls: number;
}

export interface UserMachineRow {
  installId: string;
  displayName: string | null;
  serviceName: string | null;
  serviceVersion: string | null;
  eventCount: number;
  interactionCount: number;
  skillCallCount: number;
  distinctSkills: number;
  sessionCount: number;
  errorEventCount: number;
  firstActiveAt: string | null;
  lastActiveAt: string | null;
  recentSkills: UserMachineSkillSummary[];
}

export interface UserMachineSummary {
  generatedAt: string;
  limit: number;
  totals: {
    installs: number;
    activeInstalls: number;
    events: number;
    interactions: number;
    skillCalls: number;
    errorEvents: number;
  };
  rows: UserMachineRow[];
}

export type ErrorEvidenceLevel = 'strong' | 'medium' | 'weak';

export type ErrorEventCategory =
  | 'llm_api'
  | 'retry_exhausted'
  | 'runtime_severity'
  | 'tool_or_hook'
  | 'weak_text';

export type ErrorEventSource =
  | 'api_error'
  | 'api_retries_exhausted'
  | 'severity'
  | 'tool_or_hook'
  | 'weak_text';

export interface ErrorGroupRow {
  key: string;
  label: string;
  eventCount: number;
  affectedUsers: number;
  affectedSessions: number;
  affectedSkills: number;
  relatedSkills: string[];
  firstSeenAt: string | null;
  lastSeenAt: string | null;
}

export interface ErrorIssueRow {
  signature: string;
  title: string;
  category: ErrorEventCategory;
  evidenceLevel: ErrorEvidenceLevel;
  eventCount: number;
  affectedUsers: number;
  affectedSessions: number;
  affectedSkills: number;
  relatedSkills: string[];
  firstSeenAt: string | null;
  lastSeenAt: string | null;
  sampleEventId: string;
  sampleEventName: string | null;
  sampleSource: ErrorEventSource;
  sampleMessage: string;
}

export interface ErrorEventRow {
  eventId: string;
  eventName: string | null;
  severityText: string | null;
  source: ErrorEventSource;
  category: ErrorEventCategory;
  evidenceLevel: ErrorEvidenceLevel;
  message: string;
  statusCode: number | null;
  model: string | null;
  toolName: string | null;
  durationMs: number | null;
  receivedAt: string;
  eventTimestamp: string | null;
  installId: string | null;
  displayName: string | null;
  sessionId: string | null;
  promptId: string | null;
  skillName: string | null;
  bodyPreview: string;
  attributesPreview: string;
}

export interface ErrorInsightSummary {
  generatedAt: string;
  limit: number;
  totals: {
    strongEvents: number;
    weakTextMatches: number;
    apiErrorEvents: number;
    retryExhaustedEvents: number;
    severityEvents: number;
    toolOrHookFailureEvents: number;
    affectedSkills: number;
    affectedSessions: number;
    affectedUsers: number;
  };
  issueSignatures: ErrorIssueRow[];
  bySkill: ErrorGroupRow[];
  bySession: ErrorGroupRow[];
  byUser: ErrorGroupRow[];
  recentStrongEvents: ErrorEventRow[];
  weakTextEvents: ErrorEventRow[];
}

export interface VersionDistributionRow {
  skillName: string;
  observedSkillVersion: string;
  calls: number;
  activeUsers: number;
  sessions: number;
  errorEvents: number;
  firstSeenAt: string | null;
  lastSeenAt: string | null;
}

export interface VersionDailyRow {
  date: string;
  skillName: string;
  observedSkillVersion: string;
  calls: number;
  activeInstalls: number;
  sessions: number;
  firstSeenAt: string | null;
  lastSeenAt: string | null;
}

export interface VersionDimensionSummary {
  generatedAt: string;
  limit: number;
  days: number;
  totals: {
    skillCalls: number;
    versions: number;
    skills: number;
    activeUsers: number;
    sessions: number;
    errorEvents: number;
  };
  rows: VersionDistributionRow[];
  daily: VersionDailyRow[];
}

export interface SkillUsage {
  skillName: string;
  calls: number;
  activeUsers: number;
  sessions: number;
  firstSeenAt: string | null;
  lastSeenAt: string | null;
  versions: Array<{ version: string; calls: number }>;
}

export interface Interaction {
  promptId: string;
  sessionId: string | null;
  installId: string | null;
  displayName: string | null;
  promptText: string | null;
  commandName: string | null;
  commandSource: string | null;
  responseText: string | null;
  responseJson: unknown;
  startedAt: string | null;
  endedAt: string | null;
  eventCount: number;
  apiResponseCount: number;
  pairingMethod: string;
  pairingConfidence: string;
  evidence: unknown;
  updatedAt: string;
  skillName: string | null;
  observedSkillVersion: string | null;
}

export interface FieldHit {
  found: boolean;
  count: number;
  examples: string[];
}

export interface FieldAudit {
  totalBatches: number;
  totalLogRecords: number;
  lastReceivedAt: string | null;
  fields: Record<string, FieldHit>;
  eventNames: Record<string, number>;
  resourceAttributes: Record<string, string[]>;
  recentBatches: Array<{
    id: string;
    batchId: string;
    receivedAt: string;
    logRecords: number;
    eventNames: string[];
  }>;
}

export interface DatabaseColumnInfo {
  name: string;
  type: string;
  notNull: boolean;
  primaryKey: boolean;
  defaultValue: string | null;
  avgBytes: number | null;
  maxBytes: number | null;
  estimatedBytes: string;
  sizeBasis: string;
}

export interface DatabaseTableInfo {
  name: string;
  rowCount: number;
  columns: DatabaseColumnInfo[];
}

export type DatabaseFilterOperator =
  | 'eq'
  | 'ne'
  | 'contains'
  | 'not_contains'
  | 'in'
  | 'not_in'
  | 'gt'
  | 'gte'
  | 'lt'
  | 'lte'
  | 'between';

export interface DatabaseFilterCondition {
  id?: string;
  field: string;
  operator: DatabaseFilterOperator;
  value: string;
  valueTo?: string;
}

export interface DatabaseFilterGroup {
  id?: string;
  conditions: DatabaseFilterCondition[];
}

export interface DatabaseTableData {
  table: string;
  columns: DatabaseColumnInfo[];
  rows: Array<Record<string, string | number | boolean | null | unknown[] | Record<string, unknown>>>;
  page: number;
  pageSize: number;
  totalRows: number;
  totalPages: number;
  searchField: string | null;
  query: string;
  filters: unknown;
}

async function getJson<T>(path: string): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`);
  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}`);
  }

  const payload = (await response.json()) as ApiEnvelope<T>;
  return payload.data;
}

export const api = {
  baseUrl: API_BASE_URL,
  health: () => getJson<HealthData>('/health'),
  ingestHealth: () => getJson<IngestHealth>('/api/ingest/health'),
  eventDistribution: (hours = 24, limit = 20) =>
    getJson<EventDistribution>(`/api/events/distribution?hours=${hours}&limit=${limit}`),
  dataQuality: () => getJson<DataQuality>('/api/data-quality'),
  rawBatchDetails: (limit = 50) => getJson<RawBatchDetails>(`/api/raw-batches?limit=${limit}`),
  skillFunnel: () => getJson<SkillFunnel>('/api/skills/funnel'),
  userMachines: (limit = 50) => getJson<UserMachineSummary>(`/api/users/machines?limit=${limit}`),
  errorSummary: (limit = 50) => getJson<ErrorInsightSummary>(`/api/errors/summary?limit=${limit}`),
  skillVersions: (days = 14, limit = 50) =>
    getJson<VersionDimensionSummary>(`/api/skills/versions?days=${days}&limit=${limit}`),
  skillUsage: () => getJson<SkillUsage[]>('/api/skills/usage'),
  skillInteractions: (skillName: string, limit = 20) =>
    getJson<Interaction[]>(
      `/api/skills/${encodeURIComponent(skillName)}/interactions?limit=${limit}`,
    ),
  interactions: (limit = 20) => getJson<Interaction[]>(`/api/interactions?limit=${limit}`),
  fieldAudit: () => getJson<FieldAudit>('/debug/field-audit'),
  databaseTables: () => getJson<DatabaseTableInfo[]>('/debug/db/tables'),
  databaseTableData: (
    table: string,
    params: {
      page: number;
      pageSize: number;
      field: string;
      q: string;
      filters?: DatabaseFilterGroup[];
    },
  ) => {
    const searchParams = new URLSearchParams({
      page: String(params.page),
      pageSize: String(params.pageSize),
      field: params.field,
      q: params.q,
    });
    if (params.filters && params.filters.length > 0) {
      searchParams.set('filters', JSON.stringify(params.filters));
    }
    return getJson<DatabaseTableData>(
      `/debug/db/tables/${encodeURIComponent(table)}/data?${searchParams.toString()}`,
    );
  },
};
