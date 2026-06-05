import type { Pool, ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import { BOSS_A_MONOREPO_PROFILE_ID } from '@sdd-telemetry/api';
import {
  getBossAProfileConfig,
  BOSS_A_RULE_VERSION,
  bossAStableKey,
  isBossAReadAction,
  isBossAWriteAction,
  matchBossASource,
  resolveBossARules,
  type BossASourceMatch,
} from './boss-a-matcher';
import type { ProjectionContext, ProjectionOperator } from './runner';

interface SourceRefRow extends RowDataPacket {
  source_reference_id: number;
  source_reference_key: string;
  tool_call_id: number | null;
  interaction_id: number | null;
  event_id: string | null;
  user_id: number | null;
  session_id: string | null;
  prompt_id: string | null;
  action_type: string;
  normalized_locator: string | null;
  event_time: Date | null;
}

interface OperatorStats {
  source: number;
  projected: number;
  skipped: number;
  ambiguousContext?: number;
  unmappedContext?: number;
}

export interface AttributionResult {
  deliveryUnitId: number | null;
  method: string | null;
  ambiguous: boolean;
}

export interface AttributionAnchor {
  sourceReferenceId: number;
  interactionId: number | null;
  userId: number | null;
  sessionId: string | null;
  eventTime: Date | null;
  deliveryUnitId: number;
  isWrite: boolean;
}

export interface AttributionTarget {
  sourceReferenceId: number;
  interactionId: number | null;
  userId: number | null;
  sessionId: string | null;
  eventTime: Date | null;
}

const DEFAULT_SESSION_WINDOW_MINUTES = 120;

export const bossAPlanDeliveryArtifactOperator: ProjectionOperator = {
  name: 'bossAPlanDeliveryArtifact',
  async run(ctx: ProjectionContext): Promise<OperatorStats> {
    assertBossA(ctx.profileId);
    const rules = resolveBossARules(getBossAProfileConfig());
    const rows = await loadSourceRefs(ctx.pool);
    let source = 0;
    let projected = 0;
    let skipped = 0;

    for (const row of rows) {
      const match = matchBossASource(row.normalized_locator, row.action_type, ctx.profileId, rules);
      if (!match || match.sourceCategory !== 'process_doc' || !isBossAWriteAction(row.action_type)) {
        skipped += 1;
        continue;
      }
      source += 1;
      const deliveryUnitId = await upsertDeliveryUnit(ctx, row, match);
      const artifactId = await upsertArtifact(ctx, row, match, deliveryUnitId);
      await insertArtifactWrite(ctx, row, match, deliveryUnitId, artifactId);
      projected += 1;
    }

    return { source, projected, skipped };
  },
};

export const bossACapabilityOperator: ProjectionOperator = {
  name: 'bossACapability',
  async run(ctx: ProjectionContext): Promise<OperatorStats> {
    assertBossA(ctx.profileId);
    const rules = resolveBossARules(getBossAProfileConfig());
    const rows = await loadSourceRefs(ctx.pool);
    const attributor = await createAttributor(ctx, rows, rules);
    let source = 0;
    let projected = 0;
    let skipped = 0;
    let ambiguousContext = 0;
    let unmappedContext = 0;

    for (const row of rows) {
      const match = matchBossASource(row.normalized_locator, row.action_type, ctx.profileId, rules);
      if (!match) {
        skipped += 1;
        continue;
      }
      source += 1;
      const attribution = await resolveDeliveryUnit(ctx, row, match, attributor);
      if (attribution.ambiguous) ambiguousContext += 1;
      if (!attribution.deliveryUnitId && match.sourceCategory !== 'process_doc') unmappedContext += 1;
      await insertCapabilityUsage(ctx, row, match, attribution);
      projected += 1;
    }

    return { source, projected, skipped, ambiguousContext, unmappedContext };
  },
};

export const bossAKnowledgeOperator: ProjectionOperator = {
  name: 'bossAKnowledge',
  async run(ctx: ProjectionContext): Promise<OperatorStats> {
    assertBossA(ctx.profileId);
    const rules = resolveBossARules(getBossAProfileConfig());
    const rows = await loadSourceRefs(ctx.pool);
    const attributor = await createAttributor(ctx, rows, rules);
    let source = 0;
    let projected = 0;
    let skipped = 0;
    let ambiguousContext = 0;
    let unmappedContext = 0;

    for (const row of rows) {
      const match = matchBossASource(row.normalized_locator, row.action_type, ctx.profileId, rules);
      if (!match || match.sourceCategory !== 'knowledge' || !match.knowledge || !isBossAReadAction(row.action_type)) {
        skipped += 1;
        continue;
      }
      source += 1;
      const attribution = await resolveDeliveryUnit(ctx, row, match, attributor);
      if (attribution.ambiguous) ambiguousContext += 1;
      if (!attribution.deliveryUnitId) unmappedContext += 1;
      await insertKnowledgeRecall(ctx, row, match, attribution);
      projected += 1;
    }

    return { source, projected, skipped, ambiguousContext, unmappedContext };
  },
};

export const bossACodeOperator: ProjectionOperator = {
  name: 'bossACode',
  async run(ctx: ProjectionContext): Promise<OperatorStats> {
    assertBossA(ctx.profileId);
    const rules = resolveBossARules(getBossAProfileConfig());
    const rows = await loadSourceRefs(ctx.pool);
    const attributor = await createAttributor(ctx, rows, rules);
    let source = 0;
    let projected = 0;
    let skipped = 0;
    let ambiguousContext = 0;
    let unmappedContext = 0;

    for (const row of rows) {
      const match = matchBossASource(row.normalized_locator, row.action_type, ctx.profileId, rules);
      if (!match || match.sourceCategory !== 'code' || !match.code) {
        skipped += 1;
        continue;
      }
      source += 1;
      const attribution = await resolveDeliveryUnit(ctx, row, match, attributor);
      if (attribution.ambiguous) ambiguousContext += 1;
      if (!attribution.deliveryUnitId) unmappedContext += 1;
      await insertCodeActivity(ctx, row, match, attribution);
      projected += 1;
    }

    return { source, projected, skipped, ambiguousContext, unmappedContext };
  },
};

export const BOSS_A_OPERATORS: ProjectionOperator[] = [
  bossAPlanDeliveryArtifactOperator,
  bossACapabilityOperator,
  bossAKnowledgeOperator,
  bossACodeOperator,
];

async function loadSourceRefs(pool: Pool): Promise<SourceRefRow[]> {
  const [rows] = await pool.query<SourceRefRow[]>(
    `SELECT id AS source_reference_id, reference_key AS source_reference_key,
            tool_call_id, interaction_id, event_id, user_id, session_id, prompt_id,
            action_type, normalized_locator, event_time
     FROM source_references
     WHERE locator_type = 'path' AND normalized_locator IS NOT NULL
     ORDER BY id ASC`,
  );
  return rows;
}

async function upsertDeliveryUnit(
  ctx: ProjectionContext,
  row: SourceRefRow,
  match: BossASourceMatch,
): Promise<number> {
  if (!match.deliveryUnit) throw new Error('process_doc match missing deliveryUnit');
  const du = match.deliveryUnit;
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
      ctx.profileId, ctx.projectionRunId, du.deliveryUnitKey, row.source_reference_id, row.source_reference_key,
      'plan_path', du.businessDomain, du.unitSlug, du.title, du.relativeLocator,
      row.event_time, row.event_time, match.rule.ruleId, match.rule.confidence,
      JSON.stringify(evidence(row, match, { normalizedUnitLocator: du.normalizedUnitLocator })),
      BOSS_A_RULE_VERSION,
    ],
  );
  return selectId(ctx.pool, 'profile_delivery_units', 'delivery_unit_key', ctx.projectionRunId, du.deliveryUnitKey);
}

async function upsertArtifact(
  ctx: ProjectionContext,
  row: SourceRefRow,
  match: BossASourceMatch,
  deliveryUnitId: number,
): Promise<number> {
  if (!match.artifact) throw new Error('process_doc match missing artifact');
  const artifact = match.artifact;
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
      ctx.profileId, ctx.projectionRunId, artifact.artifactKey, deliveryUnitId, row.source_reference_id,
      artifact.artifactType, artifact.artifactLocator, artifact.artifactTitle,
      row.event_time, row.event_time, match.rule.ruleId, match.rule.confidence,
      JSON.stringify(evidence(row, match)),
      BOSS_A_RULE_VERSION,
    ],
  );
  return selectId(ctx.pool, 'profile_artifacts', 'artifact_key', ctx.projectionRunId, artifact.artifactKey);
}

async function insertArtifactWrite(
  ctx: ProjectionContext,
  row: SourceRefRow,
  match: BossASourceMatch,
  deliveryUnitId: number,
  artifactId: number,
): Promise<void> {
  const writeKey = bossAStableKey(ctx.profileId, 'artifact_write', row.source_reference_key);
  await ctx.pool.query<ResultSetHeader>(
    `INSERT INTO profile_artifact_writes
       (profile_id, projection_run_id, write_key, artifact_id, delivery_unit_id, interaction_id,
        capability_usage_id, user_id, session_id, prompt_id, event_id, write_kind, content_preview,
        event_sequence, event_time, matched_rule_id, confidence, evidence_json, rule_version)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [
      ctx.profileId, ctx.projectionRunId, writeKey, artifactId, deliveryUnitId, row.interaction_id,
      null, row.user_id, row.session_id, row.prompt_id, row.event_id, row.action_type, null,
      null, row.event_time, match.rule.ruleId, match.rule.confidence,
      JSON.stringify(evidence(row, match)),
      BOSS_A_RULE_VERSION,
    ],
  );
}

async function insertCapabilityUsage(
  ctx: ProjectionContext,
  row: SourceRefRow,
  match: BossASourceMatch,
  attribution: AttributionResult,
): Promise<void> {
  const usageKey = bossAStableKey(ctx.profileId, 'capability', row.source_reference_key);
  await ctx.pool.query<ResultSetHeader>(
    `INSERT INTO profile_capability_usages
       (profile_id, projection_run_id, usage_key, delivery_unit_id, interaction_id, user_id, session_id, prompt_id,
        raw_capability_name, capability_code, display_name, capability_source, trigger_source, status, event_time,
        matched_rule_id, confidence, evidence_json, rule_version)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [
      ctx.profileId, ctx.projectionRunId, usageKey, attribution.deliveryUnitId, row.interaction_id, row.user_id,
      row.session_id, row.prompt_id, match.capabilityCode, match.capabilityCode, match.capabilityDisplayName,
      'source_reference', null, 'observed', row.event_time, match.rule.ruleId, match.rule.confidence,
      JSON.stringify(evidence(row, match, { attributionMethod: attribution.method, ambiguous: attribution.ambiguous })),
      BOSS_A_RULE_VERSION,
    ],
  );
}

async function insertKnowledgeRecall(
  ctx: ProjectionContext,
  row: SourceRefRow,
  match: BossASourceMatch,
  attribution: AttributionResult,
): Promise<void> {
  if (!match.knowledge) throw new Error('knowledge match missing knowledge data');
  const recallKey = bossAStableKey(ctx.profileId, 'knowledge', row.source_reference_key);
  const capabilityUsageId = await selectOptionalId(
    ctx.pool,
    'profile_capability_usages',
    'usage_key',
    ctx.projectionRunId,
    bossAStableKey(ctx.profileId, 'capability', row.source_reference_key),
  );
  await ctx.pool.query<ResultSetHeader>(
    `INSERT INTO profile_knowledge_recalls
       (profile_id, projection_run_id, recall_key, source_reference_key, source_reference_id,
        tool_call_id, interaction_id, capability_usage_id, delivery_unit_id, user_id, session_id, prompt_id,
        action_type, knowledge_locator, knowledge_domain, knowledge_axis, knowledge_system, event_time,
        matched_rule_id, confidence, evidence_json, rule_version)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [
      ctx.profileId, ctx.projectionRunId, recallKey, row.source_reference_key, row.source_reference_id,
      row.tool_call_id, row.interaction_id, capabilityUsageId, attribution.deliveryUnitId, row.user_id,
      row.session_id, row.prompt_id, row.action_type, match.knowledge.relativePath, match.knowledge.knowledgeDomain,
      null, null, row.event_time, match.rule.ruleId, match.rule.confidence,
      JSON.stringify(evidence(row, match, { attributionMethod: attribution.method, ambiguous: attribution.ambiguous })),
      BOSS_A_RULE_VERSION,
    ],
  );
}

async function insertCodeActivity(
  ctx: ProjectionContext,
  row: SourceRefRow,
  match: BossASourceMatch,
  attribution: AttributionResult,
): Promise<void> {
  if (!match.code) throw new Error('code match missing code data');
  const activityKey = bossAStableKey(ctx.profileId, 'code', row.source_reference_key);
  const capabilityUsageId = await selectOptionalId(
    ctx.pool,
    'profile_capability_usages',
    'usage_key',
    ctx.projectionRunId,
    bossAStableKey(ctx.profileId, 'capability', row.source_reference_key),
  );
  await ctx.pool.query<ResultSetHeader>(
    `INSERT INTO profile_code_activities
       (profile_id, projection_run_id, activity_key, source_reference_key, source_reference_id,
        tool_call_id, interaction_id, delivery_unit_id, capability_usage_id, user_id, session_id, prompt_id,
        action_type, code_locator, repo_name, module_name, repo_kind, event_time,
        matched_rule_id, confidence, evidence_json, rule_version)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [
      ctx.profileId, ctx.projectionRunId, activityKey, row.source_reference_key, row.source_reference_id,
      row.tool_call_id, row.interaction_id, attribution.deliveryUnitId, capabilityUsageId, row.user_id,
      row.session_id, row.prompt_id, row.action_type, match.normalizedRelativeLocator, match.code.repoName,
      match.code.moduleName, match.code.repoKind, row.event_time, match.rule.ruleId, match.rule.confidence,
      JSON.stringify(evidence(row, match, { attributionMethod: attribution.method, ambiguous: attribution.ambiguous })),
      BOSS_A_RULE_VERSION,
    ],
  );
}

async function createAttributor(
  ctx: ProjectionContext,
  rows: SourceRefRow[],
  rules: ReturnType<typeof resolveBossARules>,
): Promise<(row: SourceRefRow) => AttributionResult> {
  const windowRaw = getBossAProfileConfig().attributionPolicy.sessionWindowMinutes;
  const windowMinutes = typeof windowRaw === 'number' && windowRaw > 0 ? windowRaw : DEFAULT_SESSION_WINDOW_MINUTES;
  const deliveryIds = await loadDeliveryUnitIds(ctx.pool, ctx.projectionRunId);
  const anchors: AttributionAnchor[] = [];
  for (const row of rows) {
    const match = matchBossASource(row.normalized_locator, row.action_type, ctx.profileId, rules);
    if (!match?.deliveryUnit || match.sourceCategory !== 'process_doc') continue;
    const deliveryUnitId = deliveryIds.get(match.deliveryUnit.deliveryUnitKey);
    if (!deliveryUnitId) continue;
    anchors.push({
      sourceReferenceId: row.source_reference_id,
      interactionId: row.interaction_id,
      userId: row.user_id,
      sessionId: row.session_id,
      eventTime: row.event_time,
      deliveryUnitId,
      isWrite: isBossAWriteAction(row.action_type),
    });
  }
  return (row: SourceRefRow) =>
    selectAttributionAnchor(
      anchors,
      {
        sourceReferenceId: row.source_reference_id,
        interactionId: row.interaction_id,
        userId: row.user_id,
        sessionId: row.session_id,
        eventTime: row.event_time,
      },
      windowMinutes,
    );
}

/**
 * 纯函数：在已建好的 plan delivery unit anchor 集合里为目标事件选归因（§5.2 / §5.3）。
 * - 同 interaction：anchor 优先级 write/edit plan doc > read plan doc，同档取事件时间最近且不晚于目标。
 * - 同 session 窗口：先取 write 档；窗口内唯一 delivery unit 才归因，多个不同 unit 记为 ambiguous。
 */
export function selectAttributionAnchor(
  anchors: AttributionAnchor[],
  target: AttributionTarget,
  sessionWindowMinutes: number,
): AttributionResult {
  const sameInteraction = anchors.filter(
    (anchor) =>
      anchor.interactionId != null &&
      anchor.interactionId === target.interactionId &&
      anchor.sourceReferenceId <= target.sourceReferenceId,
  );
  const interactionPick = pickPreferredAnchor(sameInteraction);
  if (interactionPick) {
    return { deliveryUnitId: interactionPick.deliveryUnitId, method: 'same_interaction_anchor', ambiguous: false };
  }

  const sessionCandidates = anchors.filter((anchor) => {
    if (anchor.userId == null || target.userId == null || anchor.userId !== target.userId) return false;
    if (!anchor.sessionId || !target.sessionId || anchor.sessionId !== target.sessionId) return false;
    if (anchor.sourceReferenceId > target.sourceReferenceId) return false;
    if (!anchor.eventTime || !target.eventTime) return false;
    const diffMs = target.eventTime.getTime() - anchor.eventTime.getTime();
    return diffMs >= 0 && diffMs <= sessionWindowMinutes * 60_000;
  });
  const sessionTier = preferWrites(sessionCandidates);
  const distinct = new Set(sessionTier.map((anchor) => anchor.deliveryUnitId));
  if (distinct.size === 1) {
    const pick = [...sessionTier].sort(compareAnchorDesc)[0]!;
    return { deliveryUnitId: pick.deliveryUnitId, method: 'same_session_unique_anchor', ambiguous: false };
  }
  if (distinct.size > 1) return { deliveryUnitId: null, method: 'ambiguous_session_anchor', ambiguous: true };
  return { deliveryUnitId: null, method: null, ambiguous: false };
}

/** write/edit anchor 优先；没有 write 时才退回全部候选（read anchor）。 */
function preferWrites(candidates: AttributionAnchor[]): AttributionAnchor[] {
  const writes = candidates.filter((anchor) => anchor.isWrite);
  return writes.length > 0 ? writes : candidates;
}

function pickPreferredAnchor(candidates: AttributionAnchor[]): AttributionAnchor | null {
  const tier = preferWrites(candidates);
  if (tier.length === 0) return null;
  return [...tier].sort(compareAnchorDesc)[0] ?? null;
}

async function resolveDeliveryUnit(
  ctx: ProjectionContext,
  row: SourceRefRow,
  match: BossASourceMatch,
  attributor: (row: SourceRefRow) => AttributionResult,
): Promise<AttributionResult> {
  if (match.deliveryUnit) {
    const deliveryUnitId = await selectOptionalId(
      ctx.pool,
      'profile_delivery_units',
      'delivery_unit_key',
      ctx.projectionRunId,
      match.deliveryUnit.deliveryUnitKey,
    );
    return { deliveryUnitId, method: deliveryUnitId ? 'direct_process_doc' : null, ambiguous: false };
  }
  return attributor(row);
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

async function selectId(
  pool: Pool,
  table: string,
  keyColumn: string,
  runId: number,
  key: string,
): Promise<number> {
  const id = await selectOptionalId(pool, table, keyColumn, runId, key);
  if (id == null) throw new Error(`missing inserted row: ${table}.${keyColumn}=${key}`);
  return id;
}

async function selectOptionalId(
  pool: Pool,
  table: string,
  keyColumn: string,
  runId: number,
  key: string,
): Promise<number | null> {
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT id FROM \`${table}\` WHERE projection_run_id=? AND \`${keyColumn}\`=? LIMIT 1`,
    [runId, key],
  );
  return rows[0]?.id == null ? null : Number(rows[0].id);
}

function compareAnchorDesc(a: AttributionAnchor, b: AttributionAnchor): number {
  const at = a.eventTime?.getTime() ?? 0;
  const bt = b.eventTime?.getTime() ?? 0;
  if (bt !== at) return bt - at;
  return b.sourceReferenceId - a.sourceReferenceId;
}

function evidence(row: SourceRefRow, match: BossASourceMatch, extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    source: 'source_references',
    sourceReferenceKey: row.source_reference_key,
    sourceReferenceId: row.source_reference_id,
    sourceCategory: match.sourceCategory,
    relativeLocator: match.normalizedRelativeLocator,
    ...extra,
  };
}

function assertBossA(profileId: string): void {
  if (profileId !== BOSS_A_MONOREPO_PROFILE_ID) {
    throw new Error(`boss-a operator cannot run for profile ${profileId}`);
  }
}
