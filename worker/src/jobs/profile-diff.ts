import type { Pool, RowDataPacket } from 'mysql2/promise';
import path from 'node:path';
import { BOSS_A_MONOREPO_PROFILE_ID, getProfileConfig } from '@sdd-telemetry/api';
import { createMysqlPool } from '../infrastructure/mysql/client';
import {
  bossAStableKey,
  isBossAReadAction,
  isBossAWriteAction,
  matchBossASource,
  resolveBossARules,
} from './profile-projection/boss-a-matcher';

/**
 * sdd-default 新旧对账（MVP-1，Task 14）。
 * 用法：pnpm profile:diff -- --profile sdd-default
 *
 * - 桥接域（capability/delivery/artifact/writes/turns）：要求 0 差异。
 * - knowledge：非对称门槛 —— pipeline scope 内 old_not_in_new=0 必须满足；
 *   new_not_in_old 允许（完整 raw/event 抽取修复旧截断）；orphan_source_ref=0。
 *   seed 数据（无 source_references）不属于 pipeline，可解释地排除。
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
    if (profileId === BOSS_A_MONOREPO_PROFILE_ID) {
      const report = await diffBossA(pool, profileId, runId);
      console.info(JSON.stringify(report, null, 2));
      if (report.gate === 'FAIL') process.exitCode = 1;
      return;
    }

    // 桥接域：key-set 级对账。桥接 key = sha256(profileId:prefix:上游稳定 key)，
    // 用 SHA2 在 SQL 里现算上游 key 与 profile_* 做集合差，count 相同但映射串行也能抓到。
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

    const report: Record<string, unknown> = { profileId, runId };
    const gateFailures: string[] = [];

    for (const b of bridges) {
      const oldCount = await scalar(pool, `SELECT COUNT(*) AS v FROM \`${b.oldTable}\``);
      const newCount = await scalar(pool, `SELECT COUNT(*) AS v FROM \`${b.newTable}\` WHERE projection_run_id=?`, [runId]);
      // 上游每行的期望 profile key 是否在 new key-set 中。
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

    // knowledge：非自证、非对称门槛。
    const newKnowledge = await scalar(
      pool,
      'SELECT COUNT(*) AS v FROM profile_knowledge_recalls WHERE projection_run_id=?',
      [runId],
    );
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
    // (tool_call_id, locator) 级：比 tool_call 级更强，能抓「同 tool call 但 locator 不同」。
    // old=sdd_wiki_recalls.raw_path，new=profile_knowledge_recalls.knowledge_locator。
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

    // ── linkage gate（Task 1.5）─────────────────────────────────────────────
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
    console.info(JSON.stringify(report, null, 2));

    if (gateFailures.length > 0) {
      process.exitCode = 1;
    }
  } finally {
    await pool.end();
  }
}

void main();

interface BossASourceRow extends RowDataPacket {
  reference_key: string;
  action_type: string;
  normalized_locator: string | null;
}

interface BossADiffReport {
  profileId: string;
  runId: number;
  sourceReferences: {
    planWrites: number;
    knowledgeReads: number;
    frontendCode: number;
    backendCode: number;
    unknownInMonorepo: number;
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
    planWriteMissingArtifactWrite: number;
    artifactWithoutDeliveryUnit: number;
    knowledgeOrphanSourceRef: number;
    codeOrphanSourceRef: number;
    unknownCodeRepoKind: number;
    ambiguousContext: number;
  };
  note: string;
  gate: 'PASS' | 'FAIL';
  gateFailures: string[];
}

async function diffBossA(
  pool: Pool,
  profileId: string,
  runId: number,
): Promise<BossADiffReport> {
  const config = getProfileConfig(profileId);
  if (!config) throw new Error(`profile config not found: ${profileId}`);
  const rules = resolveBossARules(config);
  const root = process.env.BOSS_A_MONOREPO_ROOT;
  if (!root) throw new Error('BOSS_A_MONOREPO_ROOT is required for boss-a diff');
  const normalizedRoot = normalizePath(root).replace(/\/+$/, '');

  const [sourceRows] = await pool.query<BossASourceRow[]>(
    `SELECT reference_key, action_type, normalized_locator
     FROM source_references
     WHERE locator_type='path' AND normalized_locator IS NOT NULL`,
  );

  const expectedArtifactWriteKeys = new Set<string>();
  const sourceReferences = {
    planWrites: 0,
    knowledgeReads: 0,
    frontendCode: 0,
    backendCode: 0,
    unknownInMonorepo: 0,
  };

  for (const row of sourceRows) {
    const match = matchBossASource(row.normalized_locator, row.action_type, profileId, rules);
    if (!match) {
      if (row.normalized_locator && isInside(normalizePath(row.normalized_locator), normalizedRoot)) {
        sourceReferences.unknownInMonorepo += 1;
      }
      continue;
    }
    if (match.sourceCategory === 'process_doc' && isBossAWriteAction(row.action_type)) {
      sourceReferences.planWrites += 1;
      expectedArtifactWriteKeys.add(bossAStableKey(profileId, 'artifact_write', row.reference_key));
    } else if (match.sourceCategory === 'knowledge' && isBossAReadAction(row.action_type)) {
      sourceReferences.knowledgeReads += 1;
    } else if (match.sourceCategory === 'code' && match.code?.repoKind === 'frontend') {
      sourceReferences.frontendCode += 1;
    } else if (match.sourceCategory === 'code' && match.code?.repoKind === 'backend') {
      sourceReferences.backendCode += 1;
    }
  }

  const actualWriteKeys = await loadKeySet(pool, 'profile_artifact_writes', 'write_key', runId);
  const planWriteMissingArtifactWrite = Array.from(expectedArtifactWriteKeys)
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
    planWriteMissingArtifactWrite,
    artifactWithoutDeliveryUnit: await scalar(
      pool,
      `SELECT COUNT(*) AS v FROM profile_artifacts WHERE projection_run_id=? AND delivery_unit_id IS NULL`,
      [runId],
    ),
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
    unknownCodeRepoKind: await scalar(
      pool,
      `SELECT COUNT(*) AS v
       FROM profile_code_activities
       WHERE projection_run_id=? AND (repo_kind IS NULL OR repo_kind='unknown')`,
      [runId],
    ),
    ambiguousContext: await scalar(
      pool,
      `SELECT SUM(v) AS v FROM (
         SELECT COUNT(*) AS v FROM profile_knowledge_recalls
         WHERE projection_run_id=? AND JSON_EXTRACT(evidence_json, '$.ambiguous') = true
         UNION ALL
         SELECT COUNT(*) AS v FROM profile_code_activities
         WHERE projection_run_id=? AND JSON_EXTRACT(evidence_json, '$.ambiguous') = true
       ) t`,
      [runId, runId],
    ),
  };

  const gateFailures: string[] = [];
  if (linkage.planWriteMissingArtifactWrite !== 0) gateFailures.push(`plan write missing artifact write=${linkage.planWriteMissingArtifactWrite}`);
  if (linkage.artifactWithoutDeliveryUnit !== 0) gateFailures.push(`artifact without delivery_unit_id=${linkage.artifactWithoutDeliveryUnit}`);
  if (linkage.knowledgeOrphanSourceRef !== 0) gateFailures.push(`knowledge orphan source ref=${linkage.knowledgeOrphanSourceRef}`);
  if (linkage.codeOrphanSourceRef !== 0) gateFailures.push(`code orphan source ref=${linkage.codeOrphanSourceRef}`);
  if (linkage.unknownCodeRepoKind !== 0) gateFailures.push(`unknown code repo kind=${linkage.unknownCodeRepoKind}`);

  return {
    profileId,
    runId,
    sourceReferences,
    projection,
    linkage,
    note: 'Boss A diff is an internal consistency gate, not an independent legacy parity check; manually sample real paths before demo.',
    gate: gateFailures.length === 0 ? 'PASS' : 'FAIL',
    gateFailures,
  };
}

async function countRun(pool: Pool, table: string, runId: number): Promise<number> {
  return scalar(pool, `SELECT COUNT(*) AS v FROM \`${table}\` WHERE projection_run_id=?`, [runId]);
}

async function loadKeySet(
  pool: Pool,
  table: string,
  keyColumn: string,
  runId: number,
): Promise<Set<string>> {
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT \`${keyColumn}\` AS k FROM \`${table}\` WHERE projection_run_id=?`,
    [runId],
  );
  return new Set(rows.map((row) => String(row.k)));
}

function normalizePath(value: string): string {
  return path.posix.normalize(value.replace(/\\/g, '/'));
}

function isInside(locator: string, root: string): boolean {
  return locator === root || locator.startsWith(`${root}/`);
}
