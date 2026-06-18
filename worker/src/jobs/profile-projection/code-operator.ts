import { createHash } from 'node:crypto';
import type { Pool, ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import type { ProjectionContext, ProjectionOperator } from './runner';

/**
 * Code activity projection（MVP-1，Task 13）—— 轻量，不参与强一致对账。
 *
 * Legacy code activity projection：按"非 wiki / requirements 路径"推断代码活动。
 * 当前 sdd-default 不再启用这个兜底口径;明确代码源的 source-backed Profile 使用 sourceBackedCodeOperator。
 * 仅在能拿到 source_reference_key 时写表（Task 13 约束），不造缺 source_ref 的伪行。
 */

const CODE_RULE_VERSION = 'code-v1';
const CODE_ACTIONS = new Set(['read', 'grep', 'glob', 'write', 'edit', 'update']);

interface UserRoots {
  wikiRoot: string | null;
  reqRoot: string | null;
}

interface CodeRefRow extends RowDataPacket {
  source_reference_id: number;
  source_reference_key: string;
  tool_call_id: number | null;
  interaction_id: number | null;
  user_id: number | null;
  session_id: string | null;
  prompt_id: string | null;
  action_type: string;
  normalized_locator: string | null;
  event_time: Date | null;
  skill_usage_id: number | null;
  work_item_id: number | null;
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

export const codeOperator: ProjectionOperator = {
  name: 'codeActivity',
  async run(ctx: ProjectionContext): Promise<unknown> {
    const roots = await loadUserRoots(ctx.pool);
    let scanned = 0;
    let projected = 0;
    let lastId = 0;

    for (;;) {
      const [rows] = await ctx.pool.query<CodeRefRow[]>(
        `SELECT sr.id AS source_reference_id, sr.reference_key AS source_reference_key,
                sr.tool_call_id, sr.interaction_id, sr.user_id, sr.session_id, sr.prompt_id,
                sr.action_type, sr.normalized_locator, sr.event_time, tc.skill_usage_id,
                su.work_item_id
         FROM source_references sr
         LEFT JOIN sdd_interaction_tool_calls tc ON tc.id = sr.tool_call_id
         LEFT JOIN sdd_skill_usages su ON su.id = tc.skill_usage_id
         WHERE sr.id > ? AND sr.locator_type = 'path' AND sr.normalized_locator IS NOT NULL
         ORDER BY sr.id ASC LIMIT 1000`,
        [lastId],
      );
      if (rows.length === 0) break;

      for (const row of rows) {
        lastId = row.source_reference_id;
        if (!CODE_ACTIONS.has(row.action_type)) continue;

        const userRoots = row.user_id != null ? roots.get(row.user_id) : undefined;
        const locator = row.normalized_locator as string;
        // 排除知识库 / 过程文档路径后才算代码。无 roots 信息时保守跳过。
        if (!userRoots) continue;
        if (isInside(locator, userRoots.wikiRoot) || isInside(locator, userRoots.reqRoot)) continue;
        scanned += 1;

        const activityKey = sha256(`${ctx.profileId}:code:${row.source_reference_key}`);
        const capabilityUsageId =
          row.skill_usage_id != null
            ? ctx.registry.capabilityUsageBySkillUsageId.get(row.skill_usage_id) ?? null
            : null;
        const deliveryUnitId = row.work_item_id != null
          ? ctx.registry.deliveryUnitByWorkItemId.get(row.work_item_id) ?? null
          : null;

        await ctx.pool.query<ResultSetHeader>(
          `INSERT INTO profile_code_activities
             (profile_id, projection_run_id, activity_key, source_reference_key, source_reference_id,
              tool_call_id, interaction_id, delivery_unit_id, capability_usage_id, user_id, session_id, prompt_id,
              action_type, code_locator, repo_name, module_name, repo_kind, event_time,
              matched_rule_id, confidence, evidence_json, rule_version)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
          [
            ctx.profileId, ctx.projectionRunId, activityKey, row.source_reference_key,
            row.source_reference_id, row.tool_call_id, row.interaction_id, deliveryUnitId,
            capabilityUsageId,
            row.user_id, row.session_id, row.prompt_id, row.action_type, locator,
            null, null, null, row.event_time, 'code-exclude-doc-roots', 'high',
            JSON.stringify({ source: 'source_references' }), CODE_RULE_VERSION,
          ],
        );
        projected += 1;
      }
    }

    return { source: scanned, projected };
  },
};

async function loadUserRoots(pool: Pool): Promise<Map<number, UserRoots>> {
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT id, wiki_root_path, requirements_root_path FROM sdd_users
     WHERE wiki_root_path IS NOT NULL OR requirements_root_path IS NOT NULL`,
  );
  const map = new Map<number, UserRoots>();
  for (const row of rows) {
    map.set(Number(row.id), {
      wikiRoot: normalizeRoot(row.wiki_root_path as string | null),
      reqRoot: normalizeRoot(row.requirements_root_path as string | null),
    });
  }
  return map;
}

function normalizeRoot(value: string | null): string | null {
  if (!value) return null;
  return value.replace(/\/+$/, '');
}

function isInside(locator: string, root: string | null): boolean {
  if (!root) return false;
  return locator === root || locator.startsWith(`${root}/`);
}
