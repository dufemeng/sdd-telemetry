import type { Pool, PoolConnection, ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import type { RuntimeResolution, WorkflowProfileConfig } from '@sdd-telemetry/api';
import { withTransaction } from '../../infrastructure/mysql/client';
import { loadSourceReferenceFacts } from '../profile-projection/source-backed-operators';
import { matchSourceReference, type UserRootMap } from '../profile-projection/source-registry/matcher';
import { SOURCE_BACKED_RULE_VERSION } from '../profile-projection/source-registry/projection';
import type { MatchedSource } from '../profile-projection/source-registry/types';

export interface ProfileSourceRematchStats {
  sourceReferences: number;
  matched: number;
}

export async function rematchProfileSourceReferences(
  pool: Pool,
  config: WorkflowProfileConfig,
  runtime: RuntimeResolution,
  profileConfigVersionId: string | null,
): Promise<ProfileSourceRematchStats> {
  if (config.projectionMode !== 'source_backed') {
    return { sourceReferences: 0, matched: 0 };
  }
  if (runtime.unresolved.length > 0) {
    throw new Error(`unresolved source rules for ${config.profileId}: ${runtime.unresolved.map((r) => r.ruleId).join(', ')}`);
  }
  if (!profileConfigVersionId) {
    throw new Error(`source-backed profile requires a persisted config version: ${config.profileId}`);
  }

  const facts = await loadSourceReferenceFacts(pool);
  const userRoots = await loadUserRoots(pool);
  const matches: MatchedSource[] = [];
  for (const fact of facts) {
    const match = matchSourceReference(fact, runtime.rules, config.profileId, userRoots);
    if (match) matches.push(match);
  }

  await withTransaction(pool, async (connection) => {
    // 唯一键 uk_profile_source_matches_ref 只含 (profile_id, source_reference_key)，与版本无关；
    // 任意时刻只有一个版本在 serving，rematch 即「整表按 profile 全删 + 重插当前版本」。
    // 若按 (profile_id, version) 删，新版本 INSERT 会撞上历史版本遗留的同 source_reference_key 行，
    // 触发 ER_DUP_ENTRY 让投影失败，serving_version_id 永远晋升不上去。
    await connection.query(
      'DELETE FROM profile_source_matches WHERE profile_id = ?',
      [config.profileId],
    );
    for (const match of matches) {
      await insertMatch(connection, match, profileConfigVersionId);
    }
  });

  return { sourceReferences: facts.length, matched: matches.length };
}

async function insertMatch(
  connection: PoolConnection,
  match: MatchedSource,
  profileConfigVersionId: string | null,
): Promise<void> {
  await connection.query<ResultSetHeader>(
    `INSERT INTO profile_source_matches
       (profile_id, profile_config_version_id, source_reference_id, source_reference_key,
        matched_rule_id, category, action_type,
        locator_type, normalized_locator, relative_locator, resource_id, source_namespace, confidence,
        ambiguous, metadata_json, rule_version, source_event_time)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,(
       SELECT event_time FROM source_references WHERE id = ?
     ))`,
    [
      match.profileId,
      profileConfigVersionId,
      match.sourceReferenceId,
      match.sourceReferenceKey,
      match.ruleId,
      match.category,
      match.actionType,
      match.locatorType,
      match.normalizedLocator,
      match.relativeLocator,
      match.resourceId,
      match.sourceNamespace,
      match.confidence,
      match.ambiguous ? 1 : 0,
      JSON.stringify(match.metadata),
      SOURCE_BACKED_RULE_VERSION,
      match.sourceReferenceId,
    ],
  );
}

async function loadUserRoots(pool: Pool): Promise<UserRootMap> {
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT id, wiki_root_path, requirements_root_path FROM sdd_users
     WHERE wiki_root_path IS NOT NULL OR requirements_root_path IS NOT NULL`,
  );
  const map: UserRootMap = new Map();
  for (const row of rows) {
    map.set(Number(row.id), {
      wiki: normalizeRoot(row.wiki_root_path as string | null),
      requirements: normalizeRoot(row.requirements_root_path as string | null),
    });
  }
  return map;
}

function normalizeRoot(value: string | null): string | null {
  if (!value) return null;
  return value.replace(/\/+$/, '');
}
