import path from 'node:path';
import type { Pool, ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import {
  type ArtifactRule,
  type CapabilityRule,
  type DeliveryUnitRule,
  type SourceAction,
  type WorkflowProfileConfig,
} from '@sdd-telemetry/api';
import { selectAttributionAnchor, type AttributionAnchor, type AttributionResult } from './source-registry/attribution';
import { globMatch } from './source-registry/matcher';
import {
  isReadAction,
  isWriteAction,
  SOURCE_BACKED_RULE_VERSION,
  sourceBackedStableKey,
  sha256,
} from './source-registry/projection';
import type { MatchedSource, SourceReferenceFact } from './source-registry/types';
import type { ProjectionContext, ProjectionOperator } from './runner';

interface SourceReferenceRow extends RowDataPacket {
  source_reference_id: number;
  source_reference_key: string;
  tool_call_id: number | null;
  interaction_id: number | null;
  event_id: string | null;
  user_id: number | null;
  session_id: string | null;
  prompt_id: string | null;
  action_type: string;
  locator_type: string;
  normalized_locator: string | null;
  event_time: Date | null;
  mcp_server: string | null;
  mcp_tool_name: string | null;
  doc_id: string | null;
  url: string | null;
  title: string | null;
  space_id: string | null;
  collection_id: string | null;
  doc_type: string | null;
}

interface MatchedSourceReferenceRow extends SourceReferenceRow {
  matched_rule_id: string;
  match_category: string;
  match_action_type: string;
  match_locator_type: string;
  match_normalized_locator: string | null;
  relative_locator: string | null;
  resource_id: string | null;
  source_namespace: string | null;
  confidence: string | null;
  ambiguous: number | boolean | string | null;
  metadata_json: unknown;
}

interface MatchedFact {
  fact: SourceReferenceFact;
  match: MatchedSource;
}

interface DeliveryPlan {
  rule: DeliveryUnitRule;
  deliveryUnitKey: string;
  normalizedUnitLocator: string;
  businessDomain: string | null;
  unitSlug: string | null;
  title: string | null;
  relativeLocator: string;
}

interface ArtifactPlan {
  rule: ArtifactRule;
  artifactKey: string;
  artifactType: string;
  artifactLocator: string;
  artifactTitle: string | null;
}

interface CodePlan {
  repoKind: string;
  repoName: string | null;
  moduleName: string | null;
  codeLocator: string;
}

interface OperatorStats {
  source: number;
  projected: number;
  skipped: number;
  ambiguousContext?: number;
  unmappedContext?: number;
}

export const sourceBackedDeliveryArtifactOperator: ProjectionOperator = {
  name: 'sourceBackedDeliveryArtifact',
  async run(ctx): Promise<OperatorStats> {
    const { config, matchedFacts } = await loadProjectionInput(ctx);
    let source = 0;
    let projected = 0;
    let skipped = 0;

    for (const item of matchedFacts) {
      if (item.match.category !== 'process_doc' || !isWriteAction(item.match.actionType)) {
        skipped += 1;
        continue;
      }
      const deliveryPlan = buildDeliveryPlan(ctx.profileId, item.match, config);
      const artifactPlan = deliveryPlan ? buildArtifactPlan(ctx.profileId, item.match, deliveryPlan, config) : null;
      if (!deliveryPlan || !artifactPlan) {
        skipped += 1;
        continue;
      }
      source += 1;
      const deliveryUnitId = await upsertDeliveryUnit(ctx, item, deliveryPlan);
      const artifactId = await upsertArtifact(ctx, item, artifactPlan, deliveryUnitId);
      await insertArtifactWrite(ctx, item, deliveryUnitId, artifactId);
      projected += 1;
    }

    return { source, projected, skipped };
  },
};

export const sourceBackedCapabilityOperator: ProjectionOperator = {
  name: 'sourceBackedCapability',
  async run(ctx): Promise<OperatorStats> {
    const { config, matchedFacts } = await loadProjectionInput(ctx);
    const attributor = await createAttributor(ctx, config, matchedFacts);
    let source = 0;
    let projected = 0;
    let skipped = 0;
    let ambiguousContext = 0;
    let unmappedContext = 0;

    for (const item of matchedFacts) {
      const rule = findCapabilityRule(item.match, config);
      if (!rule) {
        skipped += 1;
        continue;
      }
      source += 1;
      const attribution = await resolveDeliveryUnit(ctx, item, config, attributor);
      if (attribution.ambiguous) ambiguousContext += 1;
      if (!attribution.deliveryUnitId && item.match.category !== 'process_doc') unmappedContext += 1;
      await insertCapabilityUsage(ctx, item, rule, attribution);
      projected += 1;
    }

    return { source, projected, skipped, ambiguousContext, unmappedContext };
  },
};

export const sourceBackedKnowledgeOperator: ProjectionOperator = {
  name: 'sourceBackedKnowledge',
  async run(ctx): Promise<OperatorStats> {
    const { config, matchedFacts } = await loadProjectionInput(ctx);
    const attributor = await createAttributor(ctx, config, matchedFacts);
    let source = 0;
    let projected = 0;
    let skipped = 0;
    let ambiguousContext = 0;
    let unmappedContext = 0;

    for (const item of matchedFacts) {
      if (item.match.category !== 'knowledge' || !isReadAction(item.match.actionType)) {
        skipped += 1;
        continue;
      }
      source += 1;
      const attribution = await resolveDeliveryUnit(ctx, item, config, attributor);
      if (attribution.ambiguous) ambiguousContext += 1;
      if (!attribution.deliveryUnitId) unmappedContext += 1;
      await insertKnowledgeRecall(ctx, item, attribution);
      projected += 1;
    }

    return { source, projected, skipped, ambiguousContext, unmappedContext };
  },
};

export const sourceBackedCodeOperator: ProjectionOperator = {
  name: 'sourceBackedCode',
  async run(ctx): Promise<OperatorStats> {
    const { config, matchedFacts } = await loadProjectionInput(ctx);
    const attributor = await createAttributor(ctx, config, matchedFacts);
    let source = 0;
    let projected = 0;
    let skipped = 0;
    let ambiguousContext = 0;
    let unmappedContext = 0;

    for (const item of matchedFacts) {
      if (item.match.category !== 'code') {
        skipped += 1;
        continue;
      }
      const codePlan = buildCodePlan(item.match);
      if (!codePlan) {
        skipped += 1;
        continue;
      }
      source += 1;
      const attribution = await resolveDeliveryUnit(ctx, item, config, attributor);
      if (attribution.ambiguous) ambiguousContext += 1;
      if (!attribution.deliveryUnitId) unmappedContext += 1;
      await insertCodeActivity(ctx, item, codePlan, attribution);
      projected += 1;
    }

    return { source, projected, skipped, ambiguousContext, unmappedContext };
  },
};

export const SOURCE_BACKED_OPERATORS: ProjectionOperator[] = [
  sourceBackedDeliveryArtifactOperator,
  sourceBackedCapabilityOperator,
  sourceBackedKnowledgeOperator,
  sourceBackedCodeOperator,
];

async function loadProjectionInput(ctx: ProjectionContext): Promise<{
  config: WorkflowProfileConfig;
  matchedFacts: MatchedFact[];
}> {
  const config = ctx.profileConfig;
  const matchedFacts = await loadMatchedSourceFacts(ctx.pool, ctx.profileId, ctx.profileConfigVersionId);
  return { config, matchedFacts };
}

async function loadMatchedSourceFacts(
  pool: Pool,
  profileId: string,
  profileConfigVersionId: string | null,
): Promise<MatchedFact[]> {
  if (!profileConfigVersionId) {
    throw new Error(`source-backed projection requires a persisted config version: ${profileId}`);
  }
  const [rows] = await pool.query<MatchedSourceReferenceRow[]>(
    `SELECT s.id AS source_reference_id, s.reference_key AS source_reference_key,
            s.tool_call_id, s.interaction_id, s.event_id, s.user_id, s.session_id, s.prompt_id,
            s.action_type, s.locator_type, s.normalized_locator, s.event_time,
            s.mcp_server, s.mcp_tool_name, s.doc_id, s.url, s.title, s.space_id, s.collection_id, s.doc_type,
            m.matched_rule_id, m.category AS match_category, m.action_type AS match_action_type,
            m.locator_type AS match_locator_type, m.normalized_locator AS match_normalized_locator,
            m.relative_locator, m.resource_id, m.source_namespace, m.confidence,
            m.ambiguous, m.metadata_json
     FROM profile_source_matches m
     JOIN source_references s ON s.id = m.source_reference_id
     WHERE m.profile_id = ? AND m.profile_config_version_id = ?
     ORDER BY s.id ASC`,
    [profileId, profileConfigVersionId],
  );

  return rows.map((row) => {
    const fact = toSourceReferenceFact(row);
    return {
      fact,
      match: {
        profileId,
        sourceReferenceId: fact.sourceReferenceId,
        sourceReferenceKey: fact.sourceReferenceKey,
        ruleId: row.matched_rule_id,
        confidence: (row.confidence ?? 'medium') as MatchedSource['confidence'],
        ambiguous: toBoolean(row.ambiguous),
        category: row.match_category as MatchedSource['category'],
        actionType: row.match_action_type as MatchedSource['actionType'],
        locatorType: row.match_locator_type as MatchedSource['locatorType'],
        normalizedLocator: row.match_normalized_locator ?? fact.normalizedLocator ?? '',
        sourceNamespace: row.source_namespace,
        resourceId: row.resource_id,
        relativeLocator: row.relative_locator,
        metadata: parseJsonRecord(row.metadata_json),
      },
    };
  });
}

export async function loadSourceReferenceFacts(pool: Pool): Promise<SourceReferenceFact[]> {
  const [rows] = await pool.query<SourceReferenceRow[]>(
    `SELECT id AS source_reference_id, reference_key AS source_reference_key,
            tool_call_id, interaction_id, event_id, user_id, session_id, prompt_id,
            action_type, locator_type, normalized_locator, event_time,
            mcp_server, mcp_tool_name, doc_id, url, title, space_id, collection_id, doc_type
     FROM source_references
     ORDER BY id ASC`,
  );

  return rows.map(toSourceReferenceFact);
}

function toSourceReferenceFact(row: SourceReferenceRow): SourceReferenceFact {
  return {
    sourceReferenceId: Number(row.source_reference_id),
    sourceReferenceKey: String(row.source_reference_key),
    toolCallId: nullableNumber(row.tool_call_id),
    interactionId: nullableNumber(row.interaction_id),
    eventId: row.event_id,
    userId: nullableNumber(row.user_id),
    sessionId: row.session_id,
    promptId: row.prompt_id,
    actionType: row.action_type,
    locatorType: row.locator_type,
    normalizedLocator: row.normalized_locator,
    eventTime: row.event_time,
    mcpServer: row.mcp_server,
    mcpToolName: row.mcp_tool_name,
    docId: row.doc_id,
    url: row.url,
    title: row.title,
    spaceId: row.space_id,
    collectionId: row.collection_id,
    docType: row.doc_type,
  };
}

export function buildDeliveryPlan(
  profileId: string,
  match: MatchedSource,
  config: WorkflowProfileConfig,
): DeliveryPlan | null {
  const rule = config.deliveryUnitRules.find((candidate) => candidate.sourceRuleIds.includes(match.ruleId));
  if (!rule) return null;

  const unitLocator = parseDeliveryUnitLocator(match, rule);
  if (!unitLocator) return null;
  const namespaced = withNamespace(match, unitLocator);
  const parts = namespaced.split('/').filter(Boolean);
  const businessDomain = parts.length >= 3 ? parts[1] ?? null : null;
  const unitSlug = parts.length >= 3 ? parts[2] ?? null : parts[1] ?? parts[0] ?? null;

  return {
    rule,
    deliveryUnitKey: sha256(`${profileId}:du:${namespaced}`),
    normalizedUnitLocator: namespaced,
    businessDomain,
    unitSlug,
    title: titleForDeliveryUnit(match, rule, unitSlug),
    relativeLocator: namespaced,
  };
}

function parseDeliveryUnitLocator(match: MatchedSource, rule: DeliveryUnitRule): string | null {
  const locator = match.relativeLocator ?? match.resourceId ?? match.normalizedLocator;
  if (!locator) return null;

  if (rule.locatorStrategy.kind === 'parent_dir') {
    if (!match.relativeLocator) return stripExt(path.posix.basename(locator));
    const dir = path.posix.dirname(match.relativeLocator);
    return dir === '.' ? stripExt(path.posix.basename(match.relativeLocator)) : dir;
  }

  if (rule.locatorStrategy.kind === 'path_segment') {
    const parts = locator.split('/').filter(Boolean);
    const unit = parts[rule.locatorStrategy.unitSegment];
    if (!unit) return null;
    const normalizedUnit = rule.locatorStrategy.stripExtensions ? stripExt(unit) : unit;
    const domain = rule.locatorStrategy.domainSegment == null ? null : parts[rule.locatorStrategy.domainSegment] ?? null;
    return domain ? `${domain}/${normalizedUnit}` : normalizedUnit;
  }

  if (rule.locatorStrategy.kind === 'url_resource_id' || rule.locatorStrategy.kind === 'mcp_doc_id') {
    return stripExt(match.resourceId ?? locator);
  }

  return null;
}

function buildArtifactPlan(
  profileId: string,
  match: MatchedSource,
  deliveryPlan: DeliveryPlan,
  config: WorkflowProfileConfig,
): ArtifactPlan | null {
  const rule = config.artifactRules.find((candidate) => candidate.sourceRuleIds.includes(match.ruleId));
  if (!rule) return null;
  const artifactLocator = withNamespace(match, match.relativeLocator ?? match.resourceId ?? match.normalizedLocator);
  const artifactType = inferArtifactType(artifactLocator, rule);
  return {
    rule,
    artifactKey: sha256(`${profileId}:artifact:${deliveryPlan.deliveryUnitKey}:${artifactLocator}`),
    artifactType,
    artifactLocator,
    artifactTitle: titleFromLocator(match, artifactLocator),
  };
}

export function buildCodePlan(match: MatchedSource): CodePlan | null {
  const locator = match.relativeLocator ?? match.resourceId ?? match.normalizedLocator;
  if (!locator) return null;
  const parts = locator.split('/').filter(Boolean);
  const rootName = typeof match.metadata.rootName === 'string' ? match.metadata.rootName : match.sourceNamespace;
  return {
    repoKind: typeof match.metadata.repoKind === 'string' ? match.metadata.repoKind : 'unknown',
    repoName: parts.length > 1 ? parts[0]! : rootName,
    moduleName: parts[1] ?? null,
    codeLocator: withNamespace(match, locator),
  };
}

function findCapabilityRule(match: MatchedSource, config: WorkflowProfileConfig): CapabilityRule | null {
  return config.capabilityRules.find((rule) => {
    if (!rule.actions.includes(match.actionType)) return false;
    if (rule.sourceRuleIds?.includes(match.ruleId)) return true;
    if (rule.sourceCategories?.includes(match.category)) return true;
    return false;
  }) ?? null;
}

async function upsertDeliveryUnit(
  ctx: ProjectionContext,
  item: MatchedFact,
  plan: DeliveryPlan,
): Promise<number> {
  await ctx.pool.query<ResultSetHeader>(
    `INSERT INTO profile_delivery_units
       (profile_id, projection_run_id, delivery_unit_key, source_reference_id, source_reference_key,
        unit_type, business_domain, unit_slug, title, relative_dir_or_locator,
        first_seen_at, last_seen_at, matched_rule_id, confidence, evidence_json, rule_version)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
     ON DUPLICATE KEY UPDATE
       source_reference_id=VALUES(source_reference_id),
       source_reference_key=VALUES(source_reference_key),
       last_seen_at=COALESCE(GREATEST(last_seen_at, VALUES(last_seen_at)), last_seen_at, VALUES(last_seen_at)),
       evidence_json=VALUES(evidence_json)`,
    [
      ctx.profileId, ctx.projectionRunId, plan.deliveryUnitKey, item.fact.sourceReferenceId, item.fact.sourceReferenceKey,
      'process_doc', plan.businessDomain, plan.unitSlug, plan.title, plan.relativeLocator,
      item.fact.eventTime, item.fact.eventTime, plan.rule.ruleId, item.match.confidence,
      JSON.stringify(evidence(item, { normalizedUnitLocator: plan.normalizedUnitLocator })),
      SOURCE_BACKED_RULE_VERSION,
    ],
  );
  return selectId(ctx.pool, 'profile_delivery_units', 'delivery_unit_key', ctx.projectionRunId, plan.deliveryUnitKey);
}

async function upsertArtifact(
  ctx: ProjectionContext,
  item: MatchedFact,
  plan: ArtifactPlan,
  deliveryUnitId: number,
): Promise<number> {
  await ctx.pool.query<ResultSetHeader>(
    `INSERT INTO profile_artifacts
       (profile_id, projection_run_id, artifact_key, delivery_unit_id, source_reference_id,
        artifact_type, artifact_locator, artifact_title, first_seen_at, last_seen_at,
        matched_rule_id, confidence, evidence_json, rule_version)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)
     ON DUPLICATE KEY UPDATE
       delivery_unit_id=VALUES(delivery_unit_id),
       source_reference_id=VALUES(source_reference_id),
       last_seen_at=COALESCE(GREATEST(last_seen_at, VALUES(last_seen_at)), last_seen_at, VALUES(last_seen_at)),
       evidence_json=VALUES(evidence_json)`,
    [
      ctx.profileId, ctx.projectionRunId, plan.artifactKey, deliveryUnitId, item.fact.sourceReferenceId,
      plan.artifactType, plan.artifactLocator, plan.artifactTitle,
      item.fact.eventTime, item.fact.eventTime, plan.rule.ruleId, item.match.confidence,
      JSON.stringify(evidence(item)),
      SOURCE_BACKED_RULE_VERSION,
    ],
  );
  return selectId(ctx.pool, 'profile_artifacts', 'artifact_key', ctx.projectionRunId, plan.artifactKey);
}

async function insertArtifactWrite(
  ctx: ProjectionContext,
  item: MatchedFact,
  deliveryUnitId: number,
  artifactId: number,
): Promise<void> {
  await ctx.pool.query<ResultSetHeader>(
    `INSERT INTO profile_artifact_writes
       (profile_id, projection_run_id, write_key, artifact_id, delivery_unit_id, interaction_id,
        capability_usage_id, user_id, session_id, prompt_id, event_id, write_kind, content_preview,
        event_sequence, event_time, matched_rule_id, confidence, evidence_json, rule_version)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [
      ctx.profileId, ctx.projectionRunId, sourceBackedStableKey(ctx.profileId, 'artifact_write', item.fact.sourceReferenceKey),
      artifactId, deliveryUnitId, item.fact.interactionId, null, item.fact.userId, item.fact.sessionId,
      item.fact.promptId, item.fact.eventId, item.match.actionType, null, null, item.fact.eventTime,
      item.match.ruleId, item.match.confidence, JSON.stringify(evidence(item)), SOURCE_BACKED_RULE_VERSION,
    ],
  );
}

async function insertCapabilityUsage(
  ctx: ProjectionContext,
  item: MatchedFact,
  rule: CapabilityRule,
  attribution: AttributionResult,
): Promise<void> {
  await ctx.pool.query<ResultSetHeader>(
    `INSERT INTO profile_capability_usages
       (profile_id, projection_run_id, usage_key, delivery_unit_id, interaction_id, user_id, session_id, prompt_id,
        raw_capability_name, capability_code, display_name, capability_source, trigger_source, status, event_time,
        matched_rule_id, confidence, evidence_json, rule_version)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [
      ctx.profileId, ctx.projectionRunId, sourceBackedStableKey(ctx.profileId, 'capability', item.fact.sourceReferenceKey),
      attribution.deliveryUnitId, item.fact.interactionId, item.fact.userId, item.fact.sessionId, item.fact.promptId,
      rule.capabilityCode, rule.capabilityCode, rule.displayName, 'source_reference', rule.triggerSource ?? null,
      'observed', item.fact.eventTime, rule.ruleId, item.match.confidence,
      JSON.stringify(evidence(item, { attributionMethod: attribution.method, ambiguous: attribution.ambiguous })),
      SOURCE_BACKED_RULE_VERSION,
    ],
  );
}

async function insertKnowledgeRecall(
  ctx: ProjectionContext,
  item: MatchedFact,
  attribution: AttributionResult,
): Promise<void> {
  const recallKey = sourceBackedStableKey(ctx.profileId, 'knowledge', item.fact.sourceReferenceKey);
  const capabilityUsageId = await selectOptionalId(
    ctx.pool,
    'profile_capability_usages',
    'usage_key',
    ctx.projectionRunId,
    sourceBackedStableKey(ctx.profileId, 'capability', item.fact.sourceReferenceKey),
  );
  const locator = withNamespace(item.match, item.match.relativeLocator ?? item.match.resourceId ?? item.match.normalizedLocator);
  const domain = item.match.relativeLocator ? item.match.relativeLocator.split('/').filter(Boolean)[0] ?? null : item.fact.collectionId ?? item.fact.spaceId;

  await ctx.pool.query<ResultSetHeader>(
    `INSERT INTO profile_knowledge_recalls
       (profile_id, projection_run_id, recall_key, source_reference_key, source_reference_id,
        tool_call_id, interaction_id, capability_usage_id, delivery_unit_id, user_id, session_id, prompt_id,
        action_type, knowledge_locator, knowledge_domain, knowledge_axis, knowledge_system, event_time,
        matched_rule_id, confidence, evidence_json, rule_version)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [
      ctx.profileId, ctx.projectionRunId, recallKey, item.fact.sourceReferenceKey, item.fact.sourceReferenceId,
      item.fact.toolCallId, item.fact.interactionId, capabilityUsageId, attribution.deliveryUnitId,
      item.fact.userId, item.fact.sessionId, item.fact.promptId, item.match.actionType, locator,
      domain, null, item.fact.mcpServer, item.fact.eventTime, item.match.ruleId, item.match.confidence,
      JSON.stringify(evidence(item, { attributionMethod: attribution.method, ambiguous: attribution.ambiguous })),
      SOURCE_BACKED_RULE_VERSION,
    ],
  );
}

async function insertCodeActivity(
  ctx: ProjectionContext,
  item: MatchedFact,
  code: CodePlan,
  attribution: AttributionResult,
): Promise<void> {
  const capabilityUsageId = await selectOptionalId(
    ctx.pool,
    'profile_capability_usages',
    'usage_key',
    ctx.projectionRunId,
    sourceBackedStableKey(ctx.profileId, 'capability', item.fact.sourceReferenceKey),
  );
  await ctx.pool.query<ResultSetHeader>(
    `INSERT INTO profile_code_activities
       (profile_id, projection_run_id, activity_key, source_reference_key, source_reference_id,
        tool_call_id, interaction_id, delivery_unit_id, capability_usage_id, user_id, session_id, prompt_id,
        action_type, code_locator, repo_name, module_name, repo_kind, event_time,
        matched_rule_id, confidence, evidence_json, rule_version)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [
      ctx.profileId, ctx.projectionRunId, sourceBackedStableKey(ctx.profileId, 'code', item.fact.sourceReferenceKey),
      item.fact.sourceReferenceKey, item.fact.sourceReferenceId, item.fact.toolCallId, item.fact.interactionId,
      attribution.deliveryUnitId, capabilityUsageId, item.fact.userId, item.fact.sessionId, item.fact.promptId,
      item.match.actionType, code.codeLocator, code.repoName, code.moduleName, code.repoKind, item.fact.eventTime,
      item.match.ruleId, item.match.confidence,
      JSON.stringify(evidence(item, { attributionMethod: attribution.method, ambiguous: attribution.ambiguous })),
      SOURCE_BACKED_RULE_VERSION,
    ],
  );
}

async function createAttributor(
  ctx: ProjectionContext,
  config: WorkflowProfileConfig,
  matchedFacts: MatchedFact[],
): Promise<(item: MatchedFact) => AttributionResult> {
  const policy = config.attributionPolicy;
  const deliveryIds = await loadDeliveryUnitIds(ctx.pool, ctx.projectionRunId);
  const preferredActions = new Set<SourceAction>([
    ...policy.sameInteraction.preferActions,
    ...policy.sameSessionWindow.preferActions,
  ]);
  const anchors: AttributionAnchor[] = [];

  for (const item of matchedFacts) {
    if (!policy.anchorCategories.includes(item.match.category)) continue;
    if (!policy.anchorActions.includes(item.match.actionType)) continue;
    const deliveryPlan = buildDeliveryPlan(ctx.profileId, item.match, config);
    if (!deliveryPlan) continue;
    const deliveryUnitId = deliveryIds.get(deliveryPlan.deliveryUnitKey);
    if (!deliveryUnitId) continue;
    anchors.push({
      sourceReferenceId: item.fact.sourceReferenceId,
      interactionId: item.fact.interactionId,
      userId: item.fact.userId,
      sessionId: item.fact.sessionId,
      eventTime: item.fact.eventTime,
      deliveryUnitId,
      preferred: preferredActions.has(item.match.actionType),
    });
  }

  return (item: MatchedFact) => {
    const target = {
      sourceReferenceId: item.fact.sourceReferenceId,
      interactionId: item.fact.interactionId,
      userId: item.fact.userId,
      sessionId: item.fact.sessionId,
      eventTime: item.fact.eventTime,
    };
    return selectAttributionAnchor(
      policy.sameInteraction.enabled ? anchors : anchors.map((anchor) => ({ ...anchor, interactionId: null })),
      target,
      policy.sameSessionWindow.enabled ? policy.sameSessionWindow.minutes : 0,
      policy.sameSessionWindow.requireSameUser,
    );
  };
}

async function resolveDeliveryUnit(
  ctx: ProjectionContext,
  item: MatchedFact,
  config: WorkflowProfileConfig,
  attributor: (item: MatchedFact) => AttributionResult,
): Promise<AttributionResult> {
  const deliveryPlan = buildDeliveryPlan(ctx.profileId, item.match, config);
  if (deliveryPlan) {
    const deliveryUnitId = await selectOptionalId(
      ctx.pool,
      'profile_delivery_units',
      'delivery_unit_key',
      ctx.projectionRunId,
      deliveryPlan.deliveryUnitKey,
    );
    if (deliveryUnitId) return { deliveryUnitId, method: 'direct_process_doc', ambiguous: false };
  }
  return attributor(item);
}

async function loadDeliveryUnitIds(pool: Pool, runId: number): Promise<Map<string, number>> {
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT id, delivery_unit_key FROM profile_delivery_units WHERE projection_run_id=?`,
    [runId],
  );
  const map = new Map<string, number>();
  for (const row of rows) map.set(String(row.delivery_unit_key), Number(row.id));
  return map;
}

async function selectId(pool: Pool, table: string, keyColumn: string, runId: number, key: string): Promise<number> {
  const id = await selectOptionalId(pool, table, keyColumn, runId, key);
  if (id == null) throw new Error(`missing inserted row: ${table}.${keyColumn}=${key}`);
  return id;
}

async function selectOptionalId(pool: Pool, table: string, keyColumn: string, runId: number, key: string): Promise<number | null> {
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT id FROM \`${table}\` WHERE projection_run_id=? AND \`${keyColumn}\`=? LIMIT 1`,
    [runId, key],
  );
  return rows[0]?.id == null ? null : Number(rows[0].id);
}

function inferArtifactType(locator: string, rule: ArtifactRule): string {
  const fileName = path.posix.basename(locator);
  for (const pattern of rule.typePatterns) {
    if (pattern.include.some((include) => globMatch(fileName, include) || globMatch(locator, include))) {
      return pattern.artifactType;
    }
  }
  return rule.defaultArtifactType;
}

function titleForDeliveryUnit(match: MatchedSource, rule: DeliveryUnitRule, unitSlug: string | null): string | null {
  if (rule.titleStrategy === 'doc_title' && typeof match.metadata.title === 'string') return match.metadata.title;
  if (rule.titleStrategy === 'file_name') return titleFromLocator(match, match.relativeLocator ?? match.resourceId ?? match.normalizedLocator);
  if (rule.titleStrategy === 'none') return null;
  return unitSlug;
}

function titleFromLocator(match: MatchedSource, locator: string): string | null {
  if (typeof match.metadata.title === 'string' && match.metadata.title.length > 0) return match.metadata.title;
  return path.posix.basename(locator) || null;
}

function withNamespace(match: MatchedSource, locator: string): string {
  if (match.locatorType !== 'path') return locator;
  if (!match.sourceNamespace) return locator;
  if (locator === match.sourceNamespace || locator.startsWith(`${match.sourceNamespace}/`)) return locator;
  return `${match.sourceNamespace}/${locator}`;
}

function stripExt(value: string): string {
  const ext = path.posix.extname(value);
  return ext ? value.slice(0, -ext.length) : value;
}

function evidence(item: MatchedFact, extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    source: 'source_references',
    sourceReferenceKey: item.fact.sourceReferenceKey,
    sourceReferenceId: item.fact.sourceReferenceId,
    sourceCategory: item.match.category,
    matchedRuleId: item.match.ruleId,
    locatorType: item.match.locatorType,
    relativeLocator: item.match.relativeLocator,
    resourceId: item.match.resourceId,
    sourceNamespace: item.match.sourceNamespace,
    ambiguous: item.match.ambiguous,
    ...extra,
  };
}

function nullableNumber(value: number | null): number | null {
  return value == null ? null : Number(value);
}

function toBoolean(value: number | boolean | string | null): boolean {
  return value === true || value === 1 || value === '1';
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
