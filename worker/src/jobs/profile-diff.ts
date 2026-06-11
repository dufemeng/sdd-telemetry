import type { Pool, RowDataPacket } from 'mysql2/promise';
import {
  getProfileConfig,
  resolveRuntimeProfileConfig,
  type CapabilityRule,
  type WorkflowProfileConfig,
} from '@sdd-telemetry/api';
import { createMysqlPool } from '../infrastructure/mysql/client';
import { matchSourceReference } from './profile-projection/source-registry/matcher';
import {
  isReadAction,
  isWriteAction,
  sourceBackedStableKey,
} from './profile-projection/source-registry/projection';
import type { MatchedSource, SourceReferenceFact } from './profile-projection/source-registry/types';
import { loadSourceReferenceFacts } from './profile-projection/source-backed-operators';

/**
 * Profile projection diff gate.
 *
 * - sdd_bridge：沿用 sdd-default key-set parity + knowledge 非对称 gate。
 * - source_backed：按 profile sourceRules 重算 matcher，做内部一致性 gate。
 */

function parseProfileArg(): string {
  const idx = process.argv.indexOf('--profile');
  const value = idx >= 0 ? process.argv[idx + 1] : undefined;
  return value ?? 'sdd-default';
}

async function scalar(pool: Pool, sql: string, params: unknown[] = []): Promise<number> {
  const [rows] = await pool.query<RowDataPacket[]>(sql, params);
  return Number((rows[0] as Record<string, unknown> | undefined)?.v ?? 0);
}

async function main(): Promise<void> {
  const profileId = parseProfileArg();
  const config = getProfileConfig(profileId);
  if (!config) throw new Error(`profile config not found: ${profileId}`);

  const pool = createMysqlPool();
  try {
    const runId = await scalar(
      pool,
      'SELECT current_projection_run_id AS v FROM profile_current_projection_runs WHERE profile_id=?',
      [profileId],
    );
    if (!runId) {
      throw new Error(`no current projection run for profile ${profileId}; run profile:rebuild first`);
    }

    const report = config.projectionMode === 'source_backed'
      ? await runSourceBackedDiff(pool, config, runId)
      : await runSddBridgeDiff(pool, profileId, runId);

    console.info(JSON.stringify(report, null, 2));
    if ((report as { gate: string }).gate === 'FAIL') process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

void main();

async function runSddBridgeDiff(pool: Pool, profileId: string, runId: number): Promise<Record<string, unknown>> {
  const bridges: Array<{
    name: string;
    oldTable: string;
    oldKey: string;
    prefix: string;
    newTable: string;
    newKey: string;
  }> = [
    { name: 'capability', oldTable: 'sdd_skill_usages', oldKey: 'usage_key', prefix: 'capability', newTable: 'profile_capability_usages', newKey: 'usage_key' },
    { name: 'deliveryUnit', oldTable: 'sdd_work_items', oldKey: 'work_item_key', prefix: 'du', newTable: 'profile_delivery_units', newKey: 'delivery_unit_key' },
    { name: 'artifact', oldTable: 'sdd_work_item_artifacts', oldKey: 'artifact_key', prefix: 'artifact', newTable: 'profile_artifacts', newKey: 'artifact_key' },
    { name: 'artifactWrite', oldTable: 'sdd_work_item_artifact_writes', oldKey: 'write_key', prefix: 'artifact_write', newTable: 'profile_artifact_writes', newKey: 'write_key' },
    { name: 'artifactTurn', oldTable: 'sdd_work_item_artifact_turns', oldKey: 'turn_key', prefix: 'artifact_turn', newTable: 'profile_artifact_turns', newKey: 'turn_key' },
  ];

  const report: Record<string, unknown> = { profileId, runId, mode: 'sdd_bridge' };
  const gateFailures: string[] = [];

  for (const b of bridges) {
    const oldCount = await scalar(pool, `SELECT COUNT(*) AS v FROM \`${b.oldTable}\``);
    const newCount = await scalar(pool, `SELECT COUNT(*) AS v FROM \`${b.newTable}\` WHERE projection_run_id=?`, [runId]);
    const expectedKey = `SHA2(CONCAT(?, ':', ?, ':', o.\`${b.oldKey}\`), 256)`;
    const oldNotInNew = await scalar(
      pool,
      `SELECT COUNT(*) AS v FROM \`${b.oldTable}\` o
       WHERE ${expectedKey} NOT IN (SELECT \`${b.newKey}\` FROM \`${b.newTable}\` WHERE projection_run_id=?)`,
      [profileId, b.prefix, runId],
    );
    const newNotInOld = await scalar(
      pool,
      `SELECT COUNT(*) AS v FROM \`${b.newTable}\` n
       WHERE n.projection_run_id=? AND n.\`${b.newKey}\` NOT IN
         (SELECT ${expectedKey} FROM \`${b.oldTable}\` o)`,
      [runId, profileId, b.prefix],
    );
    report[b.name] = { old: oldCount, new: newCount, oldNotInNew, newNotInOld };
    if (oldNotInNew !== 0 || newNotInOld !== 0) {
      gateFailures.push(`${b.name} key-set 不一致 (oldNotInNew=${oldNotInNew}, newNotInOld=${newNotInOld})`);
    }
  }

  const newKnowledge = await scalar(pool, 'SELECT COUNT(*) AS v FROM profile_knowledge_recalls WHERE projection_run_id=?', [runId]);
  const orphanSourceRef = await scalar(
    pool,
    `SELECT COUNT(*) AS v FROM profile_knowledge_recalls k
     LEFT JOIN source_references s ON s.reference_key=k.source_reference_key
     WHERE k.projection_run_id=? AND s.reference_key IS NULL`,
    [runId],
  );
  const oldPipelineScope = await scalar(
    pool,
    `SELECT COUNT(DISTINCT w.tool_call_id) AS v FROM sdd_wiki_recalls w
     WHERE w.tool_call_id IN (SELECT tool_call_id FROM source_references WHERE tool_call_id IS NOT NULL)`,
  );
  const oldNotInNew = await scalar(
    pool,
    `SELECT COUNT(*) AS v FROM sdd_wiki_recalls w
     WHERE w.tool_call_id IN (SELECT tool_call_id FROM source_references WHERE tool_call_id IS NOT NULL)
       AND NOT EXISTS (
         SELECT 1 FROM profile_knowledge_recalls k
         WHERE k.projection_run_id=? AND k.tool_call_id = w.tool_call_id
           AND k.knowledge_locator = w.raw_path)`,
    [runId],
  );
  const newNotInOld = await scalar(
    pool,
    `SELECT COUNT(*) AS v FROM profile_knowledge_recalls k
     WHERE k.projection_run_id=? AND k.tool_call_id IS NOT NULL
       AND NOT EXISTS (
         SELECT 1 FROM sdd_wiki_recalls w
         WHERE w.tool_call_id = k.tool_call_id AND w.raw_path = k.knowledge_locator)`,
    [runId],
  );
  const oldSeedExcluded = await scalar(
    pool,
    `SELECT COUNT(*) AS v FROM sdd_wiki_recalls w
     WHERE w.tool_call_id NOT IN (SELECT tool_call_id FROM source_references WHERE tool_call_id IS NOT NULL)`,
  );

  report.knowledge = {
    new: newKnowledge,
    orphanSourceRef,
    oldPipelineScope,
    oldNotInNew,
    newNotInOld,
    oldSeedExcluded,
    level: '(tool_call_id, locator) 级',
    note: 'oldSeedExcluded = 无 source_references 的 seed/demo 数据，不属 pipeline，可解释排除',
  };
  if (orphanSourceRef !== 0) gateFailures.push(`knowledge orphan_source_ref=${orphanSourceRef} (必须 0)`);
  if (oldNotInNew !== 0) gateFailures.push(`knowledge old_not_in_new=${oldNotInNew} (必须 0：真实 recall 被漏掉)`);

  const capDeliveryMissing = await scalar(
    pool,
    `SELECT COUNT(*) AS v
     FROM profile_capability_usages p
     JOIN profile_current_projection_runs c ON c.profile_id = p.profile_id AND c.current_projection_run_id = p.projection_run_id
     JOIN sdd_skill_usages s ON p.usage_key = SHA2(CONCAT(p.profile_id, ':capability:', s.usage_key), 256)
     WHERE p.profile_id = ?
       AND s.work_item_id IS NOT NULL
       AND p.delivery_unit_id IS NULL`,
    [profileId],
  );
  report.capabilityDeliveryMissing = capDeliveryMissing;
  if (capDeliveryMissing !== 0) gateFailures.push(`capability delivery_unit_id missing=${capDeliveryMissing} (有旧 work_item_id 但新 delivery_unit_id 为空)`);

  const knowDeliveryMissing = await scalar(
    pool,
    `SELECT COUNT(*) AS v
     FROM profile_knowledge_recalls k
     JOIN sdd_interaction_tool_calls tc ON tc.id = k.tool_call_id
     JOIN sdd_skill_usages su ON su.id = tc.skill_usage_id
     WHERE k.projection_run_id = ?
       AND su.work_item_id IS NOT NULL
       AND k.delivery_unit_id IS NULL`,
    [runId],
  );
  report.knowledgeDeliveryMissing = knowDeliveryMissing;
  if (knowDeliveryMissing !== 0) gateFailures.push(`knowledge delivery_unit_id missing=${knowDeliveryMissing} (pipeline scope 有旧 work_item_id 但新 delivery_unit_id 为空)`);

  const codeDeliveryMissing = await scalar(
    pool,
    `SELECT COUNT(*) AS v
     FROM profile_code_activities ca
     JOIN sdd_interaction_tool_calls tc ON tc.id = ca.tool_call_id
     JOIN sdd_skill_usages su ON su.id = tc.skill_usage_id
     WHERE ca.projection_run_id = ?
       AND su.work_item_id IS NOT NULL
       AND ca.delivery_unit_id IS NULL`,
    [runId],
  );
  report.codeDeliveryMissing = codeDeliveryMissing;
  report.codeDeliveryNote = 'code delivery_unit_id mapping 只报告不阻塞';

  report.gate = gateFailures.length === 0 ? 'PASS' : 'FAIL';
  report.gateFailures = gateFailures;
  return report;
}

interface SourceBackedDiffReport {
  profileId: string;
  runId: number;
  mode: 'source_backed';
  sourceReferences: {
    matched: number;
    processDocWrites: number;
    knowledgeReads: number;
    codeActivities: number;
    capabilityUsages: number;
    unknownUnderConfiguredRoots: number;
  };
  projection: {
    deliveryUnits: number;
    artifacts: number;
    artifactWrites: number;
    capabilityUsages: number;
    knowledgeRecalls: number;
    codeActivities: number;
  };
  linkage: {
    processDocWriteMissingArtifactWrite: number;
    artifactWithoutDeliveryUnit: number;
    knowledgeOrphanSourceRef: number;
    codeOrphanSourceRef: number;
    codeMissingRequiredMetadata: number;
    ambiguousContext: number;
  };
  note: string;
  gate: 'PASS' | 'FAIL';
  gateFailures: string[];
}

async function runSourceBackedDiff(
  pool: Pool,
  config: WorkflowProfileConfig,
  runId: number,
): Promise<SourceBackedDiffReport> {
  const resolved = resolveRuntimeProfileConfig(config, process.env);
  if (resolved.unresolved.length > 0) {
    throw new Error(`unresolved source rules for ${config.profileId}: ${resolved.unresolved.map((r) => r.ruleId).join(', ')}`);
  }

  const facts = await loadSourceReferenceFacts(pool);
  const matched: Array<{ fact: SourceReferenceFact; match: MatchedSource }> = [];
  let unknownUnderConfiguredRoots = 0;

  for (const fact of facts) {
    const match = matchSourceReference(fact, resolved.rules, config.profileId);
    if (match) {
      matched.push({ fact, match });
    } else if (isUnderConfiguredLocalRoot(fact, resolved.rules)) {
      unknownUnderConfiguredRoots += 1;
    }
  }

  const expectedArtifactWriteKeys = new Set<string>();
  let processDocWrites = 0;
  let knowledgeReads = 0;
  let codeActivities = 0;
  let capabilityUsages = 0;

  for (const item of matched) {
    if (item.match.category === 'process_doc' && isWriteAction(item.match.actionType)) {
      processDocWrites += 1;
      if (hasProjectionRule(config.deliveryUnitRules, item.match.ruleId) && hasProjectionRule(config.artifactRules, item.match.ruleId)) {
        expectedArtifactWriteKeys.add(sourceBackedStableKey(config.profileId, 'artifact_write', item.fact.sourceReferenceKey));
      }
    }
    if (item.match.category === 'knowledge' && isReadAction(item.match.actionType)) knowledgeReads += 1;
    if (item.match.category === 'code') codeActivities += 1;
    if (findCapabilityRule(item.match, config)) capabilityUsages += 1;
  }

  const actualWriteKeys = await loadKeySet(pool, 'profile_artifact_writes', 'write_key', runId);
  const processDocWriteMissingArtifactWrite = Array.from(expectedArtifactWriteKeys)
    .filter((key) => !actualWriteKeys.has(key)).length;

  const projection = {
    deliveryUnits: await countRun(pool, 'profile_delivery_units', runId),
    artifacts: await countRun(pool, 'profile_artifacts', runId),
    artifactWrites: await countRun(pool, 'profile_artifact_writes', runId),
    capabilityUsages: await countRun(pool, 'profile_capability_usages', runId),
    knowledgeRecalls: await countRun(pool, 'profile_knowledge_recalls', runId),
    codeActivities: await countRun(pool, 'profile_code_activities', runId),
  };

  const linkage = {
    processDocWriteMissingArtifactWrite,
    artifactWithoutDeliveryUnit: await scalar(pool, 'SELECT COUNT(*) AS v FROM profile_artifacts WHERE projection_run_id=? AND delivery_unit_id IS NULL', [runId]),
    knowledgeOrphanSourceRef: await scalar(
      pool,
      `SELECT COUNT(*) AS v
       FROM profile_knowledge_recalls k
       LEFT JOIN source_references s ON s.reference_key = k.source_reference_key
       WHERE k.projection_run_id=? AND s.reference_key IS NULL`,
      [runId],
    ),
    codeOrphanSourceRef: await scalar(
      pool,
      `SELECT COUNT(*) AS v
       FROM profile_code_activities c
       LEFT JOIN source_references s ON s.reference_key = c.source_reference_key
       WHERE c.projection_run_id=? AND s.reference_key IS NULL`,
      [runId],
    ),
    codeMissingRequiredMetadata: await scalar(
      pool,
      `SELECT COUNT(*) AS v
       FROM profile_code_activities
       WHERE projection_run_id=? AND (repo_name IS NULL OR repo_kind IS NULL OR repo_kind='unknown')`,
      [runId],
    ),
    ambiguousContext: await scalar(
      pool,
      `SELECT SUM(v) AS v FROM (
         SELECT COUNT(*) AS v FROM profile_knowledge_recalls
         WHERE projection_run_id=? AND evidence_json->>'$.ambiguous' = 'true'
         UNION ALL
         SELECT COUNT(*) AS v FROM profile_code_activities
         WHERE projection_run_id=? AND evidence_json->>'$.ambiguous' = 'true'
       ) t`,
      [runId, runId],
    ),
  };

  const gateFailures: string[] = [];
  if (linkage.processDocWriteMissingArtifactWrite !== 0) gateFailures.push(`process_doc write missing artifact write=${linkage.processDocWriteMissingArtifactWrite}`);
  if (linkage.artifactWithoutDeliveryUnit !== 0) gateFailures.push(`artifact without delivery_unit_id=${linkage.artifactWithoutDeliveryUnit}`);
  if (linkage.knowledgeOrphanSourceRef !== 0) gateFailures.push(`knowledge orphan source ref=${linkage.knowledgeOrphanSourceRef}`);
  if (linkage.codeOrphanSourceRef !== 0) gateFailures.push(`code orphan source ref=${linkage.codeOrphanSourceRef}`);
  if (linkage.codeMissingRequiredMetadata !== 0) gateFailures.push(`code missing required metadata=${linkage.codeMissingRequiredMetadata}`);

  return {
    profileId: config.profileId,
    runId,
    mode: 'source_backed',
    sourceReferences: {
      matched: matched.length,
      processDocWrites,
      knowledgeReads,
      codeActivities,
      capabilityUsages,
      unknownUnderConfiguredRoots,
    },
    projection,
    linkage,
    note: 'Source-backed diff is an internal consistency gate, not an independent semantic truth check; manually sample real paths before demo.',
    gate: gateFailures.length === 0 ? 'PASS' : 'FAIL',
    gateFailures,
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

function hasProjectionRule<T extends { sourceRuleIds: string[] }>(rules: T[], sourceRuleId: string): boolean {
  return rules.some((rule) => rule.sourceRuleIds.includes(sourceRuleId));
}

function isUnderConfiguredLocalRoot(fact: SourceReferenceFact, rules: Array<{ resolvedRoot: string | null }>): boolean {
  if (fact.locatorType !== 'path' || !fact.normalizedLocator) return false;
  const locator = fact.normalizedLocator.replace(/\\/g, '/');
  return rules.some((rule) => {
    if (!rule.resolvedRoot) return false;
    const root = rule.resolvedRoot.replace(/\\/g, '/').replace(/\/+$/, '');
    return locator === root || locator.startsWith(`${root}/`);
  });
}

async function countRun(pool: Pool, table: string, runId: number): Promise<number> {
  return scalar(pool, `SELECT COUNT(*) AS v FROM \`${table}\` WHERE projection_run_id=?`, [runId]);
}

async function loadKeySet(pool: Pool, table: string, keyColumn: string, runId: number): Promise<Set<string>> {
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT \`${keyColumn}\` AS k FROM \`${table}\` WHERE projection_run_id=?`,
    [runId],
  );
  return new Set(rows.map((row) => String(row.k)));
}
