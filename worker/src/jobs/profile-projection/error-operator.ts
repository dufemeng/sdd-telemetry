import type { Pool, ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import type {
  ProfileErrorRule,
  SourceCategory,
} from '@sdd-telemetry/api';
import { sha256 } from './source-registry/projection';
import type { ProjectionContext, ProjectionOperator } from './runner';

const ERROR_RULE_VERSION = 'profile-error-v1';
const ERROR_PREVIEW_LIMIT = 1000;

interface ToolFailureRow extends RowDataPacket {
  tool_call_id: number;
  interaction_id: number;
  skill_usage_id: number | null;
  tool_use_id: string;
  tool_name: string;
  success: number | boolean | null;
  error_type: string | null;
  tool_input_preview: string | null;
  mcp_server_scope: string | null;
  tool_evidence_json: unknown;
  interaction_user_id: number | null;
  interaction_session_id: string | null;
  interaction_prompt_id: string | null;
  interaction_started_at: Date | null;
  source_reference_id: number | null;
  source_reference_key: string | null;
  source_event_id: string | null;
  source_user_id: number | null;
  source_session_id: string | null;
  source_prompt_id: string | null;
  source_event_time: Date | null;
  source_normalized_locator: string | null;
  matched_rule_id: string | null;
  match_category: string | null;
  match_action_type: string | null;
  match_locator_type: string | null;
  match_normalized_locator: string | null;
  relative_locator: string | null;
  resource_id: string | null;
  source_namespace: string | null;
  confidence: string | null;
  match_metadata_json: unknown;
}

interface ToolFailureGroup {
  toolCallId: number;
  interactionId: number;
  skillUsageId: number | null;
  toolUseId: string;
  toolName: string;
  success: boolean | null;
  errorType: string | null;
  toolInputPreview: string | null;
  mcpServerScope: string | null;
  evidenceJson: unknown;
  userId: number | null;
  sessionId: string | null;
  promptId: string | null;
  eventTime: Date | null;
  matches: ToolSourceMatch[];
}

interface ToolSourceMatch {
  sourceReferenceId: number;
  sourceReferenceKey: string;
  eventId: string | null;
  eventTime: Date | null;
  userId: number | null;
  sessionId: string | null;
  promptId: string | null;
  normalizedLocator: string | null;
  matchedRuleId: string;
  category: SourceCategory;
  actionType: string | null;
  locatorType: string | null;
  matchNormalizedLocator: string | null;
  relativeLocator: string | null;
  resourceId: string | null;
  sourceNamespace: string | null;
  confidence: string | null;
  metadata: Record<string, unknown>;
}

interface SddErrorRow extends RowDataPacket {
  sdd_error_id: number;
  error_key: string;
  user_id: number | null;
  event_id: string | null;
  interaction_id: number | null;
  usage_id: number | null;
  work_item_id: number | null;
  error_type: string;
  severity: string;
  source: string | null;
  retryable: number | boolean;
  error_message_hash: string | null;
  error_message: string | null;
  stack_hash: string | null;
  stack_trace: string | null;
  event_time: Date | null;
}

interface InteractionContextRow extends RowDataPacket {
  interaction_id: number;
  delivery_unit_id: number | null;
  capability_usage_id: number | null;
}

interface InteractionContext {
  deliveryUnitId: number | null;
  capabilityUsageId: number | null;
}

interface ClassifiedToolFailure {
  rule: ProfileErrorRule;
  match: ToolSourceMatch | null;
}

interface OperatorStats {
  toolFailures: number;
  modelErrors: number;
  projected: number;
  skipped: number;
}

export const profileErrorOperator: ProjectionOperator = {
  name: 'profileError',
  async run(ctx: ProjectionContext): Promise<OperatorStats> {
    const enabledRules = ctx.profileConfig.errorRules.filter((rule) => rule.enabled);
    if (enabledRules.length === 0) {
      return { toolFailures: 0, modelErrors: 0, projected: 0, skipped: 0 };
    }

    const interactionContext = await loadInteractionContext(ctx.pool, ctx.profileId, ctx.projectionRunId);
    const toolFailures = groupToolFailures(
      await loadToolFailureRows(ctx.pool, ctx.profileId, ctx.profileConfigVersionId),
    );
    let projected = 0;
    let skipped = 0;

    for (const failure of toolFailures) {
      const classified = classifyToolFailure(failure, enabledRules, interactionContext);
      if (!classified) {
        skipped += 1;
        continue;
      }
      await insertToolErrorEvent(ctx, failure, classified, interactionContext.get(failure.interactionId) ?? null);
      projected += 1;
    }

    const modelErrors = await loadSddErrors(ctx.pool);
    for (const error of modelErrors) {
      const context = error.interaction_id == null ? null : interactionContext.get(error.interaction_id) ?? null;
      const rule = classifySddError(error, enabledRules, context);
      if (!rule || !context) {
        skipped += 1;
        continue;
      }
      await insertSddErrorEvent(ctx, error, rule, context);
      projected += 1;
    }

    return { toolFailures: toolFailures.length, modelErrors: modelErrors.length, projected, skipped };
  },
};

async function loadToolFailureRows(
  pool: Pool,
  profileId: string,
  profileConfigVersionId: string | null,
): Promise<ToolFailureRow[]> {
  const matchJoin = profileConfigVersionId
    ? `LEFT JOIN profile_source_matches m
         ON m.profile_id = ? AND m.profile_config_version_id = ?
        AND m.source_reference_key = sr.reference_key`
    : `LEFT JOIN profile_source_matches m ON 1 = 0`;
  const params = profileConfigVersionId ? [profileId, profileConfigVersionId] : [];
  const [rows] = await pool.query<ToolFailureRow[]>(
    `SELECT tc.id AS tool_call_id, tc.interaction_id, tc.skill_usage_id, tc.tool_use_id,
            tc.tool_name, tc.success, tc.error_type, tc.tool_input_preview, tc.mcp_server_scope,
            tc.evidence_json AS tool_evidence_json,
            i.user_id AS interaction_user_id, i.session_id AS interaction_session_id,
            i.prompt_id AS interaction_prompt_id, i.started_at AS interaction_started_at,
            sr.id AS source_reference_id, sr.reference_key AS source_reference_key,
            sr.event_id AS source_event_id, sr.user_id AS source_user_id,
            sr.session_id AS source_session_id, sr.prompt_id AS source_prompt_id,
            sr.event_time AS source_event_time, sr.normalized_locator AS source_normalized_locator,
            m.matched_rule_id, m.category AS match_category, m.action_type AS match_action_type,
            m.locator_type AS match_locator_type, m.normalized_locator AS match_normalized_locator,
            m.relative_locator, m.resource_id, m.source_namespace, m.confidence,
            m.metadata_json AS match_metadata_json
     FROM sdd_interaction_tool_calls tc
     JOIN sdd_interactions i ON i.id = tc.interaction_id
     LEFT JOIN source_references sr ON sr.tool_call_id = tc.id
     ${matchJoin}
     WHERE tc.success = 0 OR tc.error_type IS NOT NULL
     ORDER BY tc.id ASC, sr.id ASC`,
    params,
  );
  return rows;
}

function groupToolFailures(rows: ToolFailureRow[]): ToolFailureGroup[] {
  const groups = new Map<number, ToolFailureGroup>();
  for (const row of rows) {
    let group = groups.get(row.tool_call_id);
    if (!group) {
      group = {
        toolCallId: Number(row.tool_call_id),
        interactionId: Number(row.interaction_id),
        skillUsageId: nullableNumber(row.skill_usage_id),
        toolUseId: String(row.tool_use_id),
        toolName: String(row.tool_name ?? 'unknown'),
        success: toNullableBoolean(row.success),
        errorType: row.error_type,
        toolInputPreview: row.tool_input_preview,
        mcpServerScope: row.mcp_server_scope,
        evidenceJson: row.tool_evidence_json,
        userId: nullableNumber(row.interaction_user_id),
        sessionId: row.interaction_session_id,
        promptId: row.interaction_prompt_id,
        eventTime: row.interaction_started_at,
        matches: [],
      };
      groups.set(row.tool_call_id, group);
    }

    if (row.source_reference_id == null || !row.source_reference_key || !row.matched_rule_id || !row.match_category) {
      continue;
    }
    group.matches.push({
      sourceReferenceId: Number(row.source_reference_id),
      sourceReferenceKey: row.source_reference_key,
      eventId: row.source_event_id,
      eventTime: row.source_event_time,
      userId: nullableNumber(row.source_user_id),
      sessionId: row.source_session_id,
      promptId: row.source_prompt_id,
      normalizedLocator: row.source_normalized_locator,
      matchedRuleId: row.matched_rule_id,
      category: row.match_category as SourceCategory,
      actionType: row.match_action_type,
      locatorType: row.match_locator_type,
      matchNormalizedLocator: row.match_normalized_locator,
      relativeLocator: row.relative_locator,
      resourceId: row.resource_id,
      sourceNamespace: row.source_namespace,
      confidence: row.confidence,
      metadata: parseJsonRecord(row.match_metadata_json),
    });
  }
  return [...groups.values()];
}

async function loadInteractionContext(
  pool: Pool,
  profileId: string,
  runId: number,
): Promise<Map<number, InteractionContext>> {
  const [rows] = await pool.query<InteractionContextRow[]>(
    `SELECT interaction_id, delivery_unit_id, capability_usage_id
     FROM (
       SELECT interaction_id, delivery_unit_id, id AS capability_usage_id
       FROM profile_capability_usages
       WHERE profile_id = ? AND projection_run_id = ? AND interaction_id IS NOT NULL
       UNION ALL
       SELECT interaction_id, delivery_unit_id, capability_usage_id
       FROM profile_artifact_writes
       WHERE profile_id = ? AND projection_run_id = ? AND interaction_id IS NOT NULL
       UNION ALL
       SELECT interaction_id, delivery_unit_id, capability_usage_id
       FROM profile_knowledge_recalls
       WHERE profile_id = ? AND projection_run_id = ? AND interaction_id IS NOT NULL
       UNION ALL
       SELECT interaction_id, delivery_unit_id, capability_usage_id
       FROM profile_code_activities
       WHERE profile_id = ? AND projection_run_id = ? AND interaction_id IS NOT NULL
     ) facts
     ORDER BY delivery_unit_id IS NULL, capability_usage_id IS NULL`,
    [profileId, runId, profileId, runId, profileId, runId, profileId, runId],
  );
  const map = new Map<number, InteractionContext>();
  for (const row of rows) {
    const interactionId = Number(row.interaction_id);
    const existing = map.get(interactionId);
    const next: InteractionContext = {
      deliveryUnitId: nullableNumber(row.delivery_unit_id),
      capabilityUsageId: nullableNumber(row.capability_usage_id),
    };
    if (!existing) {
      map.set(interactionId, next);
      continue;
    }
    if (existing.deliveryUnitId == null && next.deliveryUnitId != null) {
      existing.deliveryUnitId = next.deliveryUnitId;
    }
    if (existing.capabilityUsageId == null && next.capabilityUsageId != null) {
      existing.capabilityUsageId = next.capabilityUsageId;
    }
  }
  return map;
}

function classifyToolFailure(
  failure: ToolFailureGroup,
  rules: ProfileErrorRule[],
  interactionContext: Map<number, InteractionContext>,
): ClassifiedToolFailure | null {
  const toolRules = rules.filter((rule) => rule.failureSources.includes('tool_call'));
  for (const rule of toolRules) {
    if (rule.sourceScope !== 'matched') continue;
    if (!matchesToolRule(failure, rule)) continue;
    const match = failure.matches.find((candidate) => {
      const sourceCategories = rule.sourceCategories ?? [];
      return sourceCategories.length === 0 || sourceCategories.includes(candidate.category);
    });
    if (match) return { rule, match };
  }

  const matchedCategories = new Set<SourceCategory>();
  for (const rule of toolRules) {
    if (rule.sourceScope !== 'matched') continue;
    for (const category of rule.sourceCategories ?? []) matchedCategories.add(category);
  }
  const hasConfiguredBusinessSource = failure.matches.some((match) => matchedCategories.has(match.category));
  if (hasConfiguredBusinessSource || !interactionContext.has(failure.interactionId)) return null;

  const unmatchedRule = toolRules.find((rule) => (
    rule.sourceScope === 'unmatched'
    && matchesToolRule(failure, rule)
  ));
  return unmatchedRule ? { rule: unmatchedRule, match: null } : null;
}

function classifySddError(
  error: SddErrorRow,
  rules: ProfileErrorRule[],
  context: InteractionContext | null,
): ProfileErrorRule | null {
  if (!context) return null;
  return rules.find((rule) => (
    rule.sourceScope === 'profile_interaction'
    && rule.failureSources.includes('sdd_error')
    && matchesErrorType(error.error_type, rule)
  )) ?? null;
}

async function loadSddErrors(pool: Pool): Promise<SddErrorRow[]> {
  const [rows] = await pool.query<SddErrorRow[]>(
    `SELECT id AS sdd_error_id, error_key, user_id, event_id, interaction_id, usage_id, work_item_id,
            error_type, severity, source, retryable, error_message_hash, error_message,
            stack_hash, stack_trace, event_time
     FROM sdd_errors
     WHERE interaction_id IS NOT NULL
     ORDER BY id ASC`,
  );
  return rows;
}

async function insertToolErrorEvent(
  ctx: ProjectionContext,
  failure: ToolFailureGroup,
  classified: ClassifiedToolFailure,
  context: InteractionContext | null,
): Promise<void> {
  const match = classified.match;
  const eventTime = match?.eventTime ?? failure.eventTime;
  const userId = match?.userId ?? failure.userId;
  const sessionId = match?.sessionId ?? failure.sessionId;
  const promptId = match?.promptId ?? failure.promptId;
  const locator = match ? locatorForMatch(match) : null;
  const key = sha256(`${ctx.profileId}:error:tool_call:${failure.toolCallId}:${classified.rule.category}`);
  await ctx.pool.query<ResultSetHeader>(
    `INSERT INTO profile_error_events
       (profile_id, projection_run_id, error_key, category, display_name, severity,
        source_kind, source_scope, source_category, matched_rule_id, confidence,
        user_id, session_id, prompt_id, interaction_id, delivery_unit_id, capability_usage_id,
        tool_call_id, sdd_error_id, event_id, tool_name, error_type, error_message_hash,
        message_preview, input_preview, locator, event_time, evidence_json, rule_version)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [
      ctx.profileId, ctx.projectionRunId, key, classified.rule.category,
      classified.rule.displayName, classified.rule.severity, 'tool_call',
      classified.rule.sourceScope, match?.category ?? null, match?.matchedRuleId ?? null,
      match?.confidence ?? null, userId, sessionId, promptId, failure.interactionId,
      context?.deliveryUnitId ?? null, context?.capabilityUsageId ?? null,
      failure.toolCallId, null, match?.eventId ?? null, failure.toolName, failure.errorType,
      null, toolMessagePreview(failure), truncate(failure.toolInputPreview), locator,
      eventTime, JSON.stringify(toolEvidence(failure, classified)), ERROR_RULE_VERSION,
    ],
  );
}

async function insertSddErrorEvent(
  ctx: ProjectionContext,
  error: SddErrorRow,
  rule: ProfileErrorRule,
  context: InteractionContext,
): Promise<void> {
  const key = sha256(`${ctx.profileId}:error:sdd_error:${error.sdd_error_id}:${rule.category}`);
  await ctx.pool.query<ResultSetHeader>(
    `INSERT INTO profile_error_events
       (profile_id, projection_run_id, error_key, category, display_name, severity,
        source_kind, source_scope, source_category, matched_rule_id, confidence,
        user_id, session_id, prompt_id, interaction_id, delivery_unit_id, capability_usage_id,
        tool_call_id, sdd_error_id, event_id, tool_name, error_type, error_message_hash,
        message_preview, input_preview, locator, event_time, evidence_json, rule_version)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [
      ctx.profileId, ctx.projectionRunId, key, rule.category, rule.displayName,
      rule.severity, 'sdd_error', rule.sourceScope, null, null, 'high',
      error.user_id, null, null, error.interaction_id, context.deliveryUnitId,
      context.capabilityUsageId, null, error.sdd_error_id, error.event_id, null,
      error.error_type, error.error_message_hash, truncate(error.error_message),
      null, null, error.event_time, JSON.stringify(sddErrorEvidence(error)), ERROR_RULE_VERSION,
    ],
  );
}

function matchesToolRule(failure: ToolFailureGroup, rule: ProfileErrorRule): boolean {
  return matchesPatternList(failure.toolName, rule.includeToolNames, true)
    && !matchesPatternList(failure.toolName, rule.excludeToolNames, false)
    && matchesErrorType(failure.errorType, rule);
}

function matchesErrorType(errorType: string | null, rule: ProfileErrorRule): boolean {
  return matchesPatternList(errorType, rule.includeErrorTypes, true)
    && !matchesPatternList(errorType, rule.excludeErrorTypes, false);
}

function matchesPatternList(value: string | null, patterns: string[] | undefined, emptyValue: boolean): boolean {
  if (!patterns || patterns.length === 0) return emptyValue;
  if (value == null) return false;
  return patterns.some((pattern) => matchesPattern(value, pattern));
}

function matchesPattern(value: string, pattern: string): boolean {
  if (pattern === '*') return true;
  const lowerValue = value.toLowerCase();
  const lowerPattern = pattern.toLowerCase();
  if (!lowerPattern.includes('*')) return lowerValue === lowerPattern;
  const regex = new RegExp(`^${lowerPattern.split('*').map(escapeRegExp).join('.*')}$`, 'i');
  return regex.test(value);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function locatorForMatch(match: ToolSourceMatch): string | null {
  if (match.relativeLocator && match.sourceNamespace && !match.relativeLocator.startsWith(`${match.sourceNamespace}/`)) {
    return `${match.sourceNamespace}/${match.relativeLocator}`;
  }
  return match.relativeLocator ?? match.resourceId ?? match.matchNormalizedLocator ?? match.normalizedLocator;
}

function toolMessagePreview(failure: ToolFailureGroup): string {
  if (failure.errorType) return truncate(`${failure.toolName}: ${failure.errorType}`) ?? failure.errorType;
  if (failure.success === false) return `${failure.toolName}: success=false`;
  return `${failure.toolName}: tool failed`;
}

function toolEvidence(failure: ToolFailureGroup, classified: ClassifiedToolFailure): Record<string, unknown> {
  const match = classified.match;
  return {
    source: 'sdd_interaction_tool_calls',
    toolCallId: failure.toolCallId,
    toolUseId: failure.toolUseId,
    mcpServerScope: failure.mcpServerScope,
    matchedRuleId: match?.matchedRuleId ?? null,
    sourceReferenceKey: match?.sourceReferenceKey ?? null,
    sourceReferenceId: match?.sourceReferenceId ?? null,
    sourceCategory: match?.category ?? null,
    locator: match ? locatorForMatch(match) : null,
  };
}

function sddErrorEvidence(error: SddErrorRow): Record<string, unknown> {
  return {
    source: 'sdd_errors',
    sddErrorId: error.sdd_error_id,
    sourceName: error.source,
    retryable: toNullableBoolean(error.retryable),
    stackHash: error.stack_hash,
  };
}

function parseJsonRecord(value: unknown): Record<string, unknown> {
  if (!value) return {};
  if (typeof value === 'object' && !Array.isArray(value)) return value as Record<string, unknown>;
  if (typeof value !== 'string') return {};
  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : {};
  } catch {
    return {};
  }
}

function truncate(value: string | null | undefined): string | null {
  if (!value) return null;
  return value.length > ERROR_PREVIEW_LIMIT ? value.slice(0, ERROR_PREVIEW_LIMIT) : value;
}

function nullableNumber(value: number | null): number | null {
  return value == null ? null : Number(value);
}

function toNullableBoolean(value: number | boolean | null): boolean | null {
  if (value == null) return null;
  return value === true || value === 1;
}
