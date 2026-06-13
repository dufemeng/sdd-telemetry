import type { Pool, PoolConnection, ResultSetHeader } from 'mysql2/promise';
import type { RuntimeResolution, WorkflowProfileConfig } from '@sdd-telemetry/api';
import { withTransaction } from '../../infrastructure/mysql/client';
import { loadSourceReferenceFacts } from '../profile-projection/source-backed-operators';
import { matchSourceReference } from '../profile-projection/source-registry/matcher';
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
  const matches: MatchedSource[] = [];
  for (const fact of facts) {
    const match = matchSourceReference(fact, runtime.rules, config.profileId);
    if (match) matches.push(match);
  }

  await withTransaction(pool, async (connection) => {
    await connection.query(
      'DELETE FROM profile_source_matches WHERE profile_id = ? AND profile_config_version_id = ?',
      [config.profileId, profileConfigVersionId],
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
