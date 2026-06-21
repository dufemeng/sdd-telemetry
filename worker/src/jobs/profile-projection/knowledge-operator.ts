import { createHash } from 'node:crypto';
import path from 'node:path';
import type { Pool, RowDataPacket } from 'mysql2/promise';
import { relativeWikiPath } from '../wiki-path';
import type { ProjectionContext, ProjectionOperator } from './runner';
import { insertProfileKnowledgeAccess } from './knowledge-access-writer';

/**
 * Knowledge recall projection（MVP-1，Task 12）—— 非自证链路。
 *
 * 从 source_references（不是 sdd_wiki_recalls 复制）投影到 profile_knowledge_recalls：
 * - 只取 read-class（read/grep/glob）的本地 path source reference。
 * - 命中 sdd-default 的 wiki source rule（per-user wiki_root_path）。
 * - 幂等 key = sha256(profile_id + ':knowledge:' + source_reference_key)，不含自增主键。
 * - source_reference_key / source_reference_id 必须写入（NOT NULL，反查证据）。
 * - capability_usage_id 经 source_reference.tool_call_id → skill_usage_id → 本 run registry 映射。
 *
 * 注：当前 source_references 只有单一 rule_version；多 rule_version 残留时需按
 * (stable evidence, locator) 取最新 rule_version 去重，避免归一化变更重复计数。
 */

const KNOWLEDGE_RULE_VERSION = 'knowledge-v1';
const READ_CLASS_ACTIONS = new Set(['read', 'grep', 'glob']);

interface SourceRefRow extends RowDataPacket {
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

export const knowledgeOperator: ProjectionOperator = {
  name: 'knowledgeRecall',
  async run(ctx: ProjectionContext): Promise<unknown> {
    const wikiRoots = await loadUserWikiRoots(ctx.pool);
    if (wikiRoots.size === 0) {
      return { source: 0, projected: 0, skippedNoWikiRoot: 0 };
    }

    let scanned = 0;
    let projected = 0;
    let skippedNoWikiRoot = 0;
    let lastId = 0;

    for (;;) {
      const [rows] = await ctx.pool.query<SourceRefRow[]>(
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
        if (!READ_CLASS_ACTIONS.has(row.action_type)) continue;
        scanned += 1;

        const wikiRoot = row.user_id != null ? wikiRoots.get(row.user_id) : undefined;
        if (!wikiRoot) {
          skippedNoWikiRoot += 1;
          continue;
        }
        const locator = row.normalized_locator as string;
        if (!isInsideRoot(locator, wikiRoot)) continue;

        const relativePath = relativeWikiPath(wikiRoot, locator);
        if (relativePath == null) continue;
        const recallKey = sha256(`${ctx.profileId}:knowledge:${row.source_reference_key}`);
        const capabilityUsageId =
          row.skill_usage_id != null
            ? (ctx.registry.capabilityUsageBySkillUsageId.get(row.skill_usage_id) ?? null)
            : null;
        const deliveryUnitId =
          row.work_item_id != null
            ? (ctx.registry.deliveryUnitByWorkItemId.get(row.work_item_id) ?? null)
            : null;

        await insertProfileKnowledgeAccess(ctx.pool, {
          profileId: ctx.profileId,
          projectionRunId: ctx.projectionRunId,
          recallKey,
          sourceReferenceKey: row.source_reference_key,
          sourceReferenceId: row.source_reference_id,
          toolCallId: row.tool_call_id,
          interactionId: row.interaction_id,
          capabilityUsageId,
          deliveryUnitId,
          userId: row.user_id,
          sessionId: row.session_id,
          promptId: row.prompt_id,
          actionType: row.action_type,
          knowledgeLocator: locator,
          sourceNamespace: path.basename(wikiRoot) || 'local',
          relativePath,
          eventTime: row.event_time,
          matchedRuleId: 'wiki-root',
          confidence: 'high',
          evidenceJson: JSON.stringify({
            wikiRoot,
            relativeLocator: relativePath,
          }),
          ruleVersion: KNOWLEDGE_RULE_VERSION,
        });
        projected += 1;
      }
    }

    return { source: scanned, projected, skippedNoWikiRoot };
  },
};

async function loadUserWikiRoots(pool: Pool): Promise<Map<number, string>> {
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT id, wiki_root_path FROM sdd_users WHERE wiki_root_path IS NOT NULL AND wiki_root_path <> ''`,
  );
  const map = new Map<number, string>();
  for (const row of rows) {
    map.set(Number(row.id), String(row.wiki_root_path).replace(/\/+$/, ''));
  }
  return map;
}

function isInsideRoot(locator: string, root: string): boolean {
  return locator === root || locator.startsWith(`${root}/`);
}
