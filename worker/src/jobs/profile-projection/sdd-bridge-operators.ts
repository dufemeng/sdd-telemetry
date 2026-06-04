import { createHash } from 'node:crypto';
import type { Pool, ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import type { ProjectionContext, ProjectionOperator } from './runner';

/**
 * sdd-default 桥接 projection 算子（MVP-1，Task 8–11）。
 *
 * 性质：桥接（bridge）。从已验证的 sdd_* 派生表映射到 profile_*，打通 contract 链路，
 * 不证明 capability/delivery/artifact 能从 raw facts 独立重建。后续再下沉到事实层。
 *
 * 幂等 key：桥接直接复用上游 sdd_* 的稳定 key（usage_key / work_item_key / artifact_key /
 * write_key / turn_key），sha256 加 profile 前缀；比 doc 里的事实层 composite key 更直接，
 * 稳定性等价。current-pointer 下每个 run 是新 projection_run_id，明细按 run 隔离。
 */

const BRIDGE_RULE_VERSION = 'sdd-bridge-v1';

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

interface OperatorStats {
  source: number;
  inserted: number;
}

// ---- capability ----

interface SkillUsageRow extends RowDataPacket {
  id: number;
  usage_key: string;
  interaction_id: number | null;
  user_id: number | null;
  session_id: string | null;
  prompt_id: string | null;
  raw_skill_name: string | null;
  skill_source: string | null;
  status: string | null;
  event_time: Date | null;
  semantic_code: string | null;
  display_name: string | null;
}

const capabilityOperator: ProjectionOperator = {
  name: 'capability',
  async run(ctx: ProjectionContext): Promise<OperatorStats> {
    const [rows] = await ctx.pool.query<SkillUsageRow[]>(
      `SELECT su.id, su.usage_key, su.interaction_id, su.user_id, su.session_id, su.prompt_id,
              su.raw_skill_name, su.skill_source, su.status, su.event_time,
              sem.semantic_code, sem.display_name
       FROM sdd_skill_usages su
       LEFT JOIN sdd_skill_semantics sem ON sem.id = su.semantic_id`,
    );
    let inserted = 0;
    for (const row of rows) {
      const usageKey = sha256(`${ctx.profileId}:capability:${row.usage_key}`);
      const id = await insertReturningId(
        ctx.pool,
        `INSERT INTO profile_capability_usages
           (profile_id, projection_run_id, usage_key, interaction_id, user_id, session_id, prompt_id,
            raw_capability_name, capability_code, display_name, capability_source, status, event_time,
            matched_rule_id, confidence, evidence_json, rule_version)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [
          ctx.profileId, ctx.projectionRunId, usageKey, row.interaction_id, row.user_id,
          row.session_id, row.prompt_id, row.raw_skill_name, row.semantic_code, row.display_name,
          row.skill_source, row.status, row.event_time, null, 'high',
          bridgeEvidence(row.id), BRIDGE_RULE_VERSION,
        ],
      );
      ctx.registry.capabilityUsageBySkillUsageId.set(row.id, id);
      inserted += 1;
    }
    return { source: rows.length, inserted };
  },
};

// ---- delivery unit ----

interface WorkItemRow extends RowDataPacket {
  id: number;
  work_item_key: string;
  business_domain: string | null;
  work_item_slug: string | null;
  work_item_title: string | null;
  relative_dir: string | null;
  first_seen_at: Date | null;
  last_seen_at: Date | null;
}

const deliveryUnitOperator: ProjectionOperator = {
  name: 'deliveryUnit',
  async run(ctx: ProjectionContext): Promise<OperatorStats> {
    const [rows] = await ctx.pool.query<WorkItemRow[]>(
      `SELECT id, work_item_key, business_domain, work_item_slug, work_item_title,
              relative_dir, first_seen_at, last_seen_at
       FROM sdd_work_items`,
    );
    let inserted = 0;
    for (const row of rows) {
      const deliveryUnitKey = sha256(`${ctx.profileId}:du:${row.work_item_key}`);
      const id = await insertReturningId(
        ctx.pool,
        `INSERT INTO profile_delivery_units
           (profile_id, projection_run_id, delivery_unit_key, unit_type, business_domain, unit_slug,
            title, relative_dir_or_locator, first_seen_at, last_seen_at,
            matched_rule_id, confidence, evidence_json, rule_version)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [
          ctx.profileId, ctx.projectionRunId, deliveryUnitKey, 'requirements_dir',
          row.business_domain, row.work_item_slug, row.work_item_title, row.relative_dir,
          row.first_seen_at, row.last_seen_at, null, 'high', bridgeEvidence(row.id), BRIDGE_RULE_VERSION,
        ],
      );
      ctx.registry.deliveryUnitByWorkItemId.set(row.id, id);
      inserted += 1;
    }
    return { source: rows.length, inserted };
  },
};

// ---- artifact ----

interface ArtifactRow extends RowDataPacket {
  id: number;
  artifact_key: string;
  work_item_id: number | null;
  artifact_type: string | null;
  artifact_full_path: string | null;
  system_module: string | null;
  first_seen_at: Date | null;
  last_seen_at: Date | null;
}

const artifactOperator: ProjectionOperator = {
  name: 'artifact',
  async run(ctx: ProjectionContext): Promise<OperatorStats> {
    const [rows] = await ctx.pool.query<ArtifactRow[]>(
      `SELECT id, artifact_key, work_item_id, artifact_type, artifact_full_path,
              system_module, first_seen_at, last_seen_at
       FROM sdd_work_item_artifacts`,
    );
    let inserted = 0;
    for (const row of rows) {
      const artifactKey = sha256(`${ctx.profileId}:artifact:${row.artifact_key}`);
      const deliveryUnitId = mapId(ctx.registry.deliveryUnitByWorkItemId, row.work_item_id);
      const id = await insertReturningId(
        ctx.pool,
        `INSERT INTO profile_artifacts
           (profile_id, projection_run_id, artifact_key, delivery_unit_id, artifact_type,
            artifact_locator, system_module, first_seen_at, last_seen_at,
            matched_rule_id, confidence, evidence_json, rule_version)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [
          ctx.profileId, ctx.projectionRunId, artifactKey, deliveryUnitId, row.artifact_type,
          row.artifact_full_path, row.system_module, row.first_seen_at, row.last_seen_at,
          null, 'high', bridgeEvidence(row.id), BRIDGE_RULE_VERSION,
        ],
      );
      ctx.registry.artifactByArtifactId.set(row.id, id);
      inserted += 1;
    }
    return { source: rows.length, inserted };
  },
};

// ---- artifact writes ----

interface WriteRow extends RowDataPacket {
  id: number;
  write_key: string;
  artifact_id: number | null;
  work_item_id: number | null;
  interaction_id: number | null;
  skill_usage_id: number | null;
  user_id: number | null;
  session_id: string | null;
  prompt_id: string | null;
  event_id: string | null;
  write_kind: string | null;
  content_preview: string | null;
  event_sequence: number | null;
  event_time: Date | null;
}

const artifactWriteOperator: ProjectionOperator = {
  name: 'artifactWrite',
  async run(ctx: ProjectionContext): Promise<OperatorStats> {
    const [rows] = await ctx.pool.query<WriteRow[]>(
      `SELECT id, write_key, artifact_id, work_item_id, interaction_id, skill_usage_id,
              user_id, session_id, prompt_id, event_id, write_kind, content_preview,
              event_sequence, event_time
       FROM sdd_work_item_artifact_writes`,
    );
    let inserted = 0;
    for (const row of rows) {
      const writeKey = sha256(`${ctx.profileId}:artifact_write:${row.write_key}`);
      await ctx.pool.query<ResultSetHeader>(
        `INSERT INTO profile_artifact_writes
           (profile_id, projection_run_id, write_key, artifact_id, delivery_unit_id, interaction_id,
            capability_usage_id, user_id, session_id, prompt_id, event_id, write_kind, content_preview,
            event_sequence, event_time, matched_rule_id, confidence, evidence_json, rule_version)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [
          ctx.profileId, ctx.projectionRunId, writeKey,
          mapId(ctx.registry.artifactByArtifactId, row.artifact_id),
          mapId(ctx.registry.deliveryUnitByWorkItemId, row.work_item_id),
          row.interaction_id,
          mapId(ctx.registry.capabilityUsageBySkillUsageId, row.skill_usage_id),
          row.user_id, row.session_id, row.prompt_id, row.event_id, row.write_kind,
          row.content_preview, row.event_sequence, row.event_time,
          null, 'high', bridgeEvidence(row.id), BRIDGE_RULE_VERSION,
        ],
      );
      inserted += 1;
    }
    return { source: rows.length, inserted };
  },
};

// ---- artifact turns ----

interface TurnRow extends RowDataPacket {
  id: number;
  turn_key: string;
  artifact_id: number | null;
  work_item_id: number | null;
  interaction_id: number | null;
  skill_usage_id: number | null;
  user_id: number | null;
  session_id: string | null;
  anchor_event_time: Date | null;
  write_event_time: Date | null;
  event_time: Date | null;
}

const artifactTurnOperator: ProjectionOperator = {
  name: 'artifactTurn',
  async run(ctx: ProjectionContext): Promise<OperatorStats> {
    const [rows] = await ctx.pool.query<TurnRow[]>(
      `SELECT id, turn_key, artifact_id, work_item_id, interaction_id, skill_usage_id,
              user_id, session_id, anchor_event_time, write_event_time, event_time
       FROM sdd_work_item_artifact_turns`,
    );
    let inserted = 0;
    for (const row of rows) {
      const turnKey = sha256(`${ctx.profileId}:artifact_turn:${row.turn_key}`);
      await ctx.pool.query<ResultSetHeader>(
        `INSERT INTO profile_artifact_turns
           (profile_id, projection_run_id, turn_key, artifact_id, delivery_unit_id, interaction_id,
            capability_usage_id, user_id, session_id, anchor_event_time, write_event_time, event_time,
            matched_rule_id, confidence, evidence_json, rule_version)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [
          ctx.profileId, ctx.projectionRunId, turnKey,
          mapId(ctx.registry.artifactByArtifactId, row.artifact_id),
          mapId(ctx.registry.deliveryUnitByWorkItemId, row.work_item_id),
          row.interaction_id,
          mapId(ctx.registry.capabilityUsageBySkillUsageId, row.skill_usage_id),
          row.user_id, row.session_id, row.anchor_event_time, row.write_event_time, row.event_time,
          null, 'high', bridgeEvidence(row.id), BRIDGE_RULE_VERSION,
        ],
      );
      inserted += 1;
    }
    return { source: rows.length, inserted };
  },
};

/** PR-4 桥接算子，按依赖顺序：capability/delivery 无依赖 → artifact 依赖 delivery → writes/turns 依赖三者。 */
export const SDD_BRIDGE_OPERATORS: ProjectionOperator[] = [
  capabilityOperator,
  deliveryUnitOperator,
  artifactOperator,
  artifactWriteOperator,
  artifactTurnOperator,
];

function bridgeEvidence(sourceId: number): string {
  return JSON.stringify({ bridge: 'sdd', sourceId });
}

function mapId(map: Map<number, number>, sourceId: number | null): number | null {
  if (sourceId == null) return null;
  return map.get(sourceId) ?? null;
}

async function insertReturningId(pool: Pool, sql: string, params: unknown[]): Promise<number> {
  const [result] = await pool.query<ResultSetHeader>(sql, params);
  return result.insertId;
}
