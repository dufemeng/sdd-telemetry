import type { Pool, RowDataPacket } from 'mysql2/promise';
import { createMysqlPool } from '../infrastructure/mysql/client';

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

    // 桥接域：old(sdd_*) vs new(profile_*, 当前 run)。
    const bridges: Array<{ name: string; oldSql: string; newTable: string }> = [
      { name: 'capability', oldSql: 'sdd_skill_usages', newTable: 'profile_capability_usages' },
      { name: 'deliveryUnit', oldSql: 'sdd_work_items', newTable: 'profile_delivery_units' },
      { name: 'artifact', oldSql: 'sdd_work_item_artifacts', newTable: 'profile_artifacts' },
      { name: 'artifactWrite', oldSql: 'sdd_work_item_artifact_writes', newTable: 'profile_artifact_writes' },
      { name: 'artifactTurn', oldSql: 'sdd_work_item_artifact_turns', newTable: 'profile_artifact_turns' },
    ];

    const report: Record<string, unknown> = { profileId, runId };
    const gateFailures: string[] = [];

    for (const b of bridges) {
      const oldCount = await scalar(pool, `SELECT COUNT(*) AS v FROM \`${b.oldSql}\``);
      const newCount = await scalar(
        pool,
        `SELECT COUNT(*) AS v FROM \`${b.newTable}\` WHERE projection_run_id=?`,
        [runId],
      );
      const diff = newCount - oldCount;
      report[b.name] = { old: oldCount, new: newCount, diff };
      if (diff !== 0) gateFailures.push(`${b.name} diff=${diff} (桥接域必须 0 差异)`);
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
    const oldNotInNew = await scalar(
      pool,
      `SELECT COUNT(*) AS v FROM (
         SELECT DISTINCT w.tool_call_id FROM sdd_wiki_recalls w
         WHERE w.tool_call_id IN (SELECT tool_call_id FROM source_references WHERE tool_call_id IS NOT NULL)
           AND w.tool_call_id NOT IN (
             SELECT tool_call_id FROM profile_knowledge_recalls
             WHERE projection_run_id=? AND tool_call_id IS NOT NULL)
       ) t`,
      [runId],
    );
    const newNotInOld = await scalar(
      pool,
      `SELECT COUNT(*) AS v FROM (
         SELECT DISTINCT k.tool_call_id FROM profile_knowledge_recalls k
         WHERE k.projection_run_id=? AND k.tool_call_id IS NOT NULL
           AND k.tool_call_id NOT IN (SELECT tool_call_id FROM sdd_wiki_recalls WHERE tool_call_id IS NOT NULL)
       ) t`,
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
      note: 'oldSeedExcluded = 无 source_references 的 seed/demo 数据，不属 pipeline，可解释排除',
    };
    if (orphanSourceRef !== 0) gateFailures.push(`knowledge orphan_source_ref=${orphanSourceRef} (必须 0)`);
    if (oldNotInNew !== 0) gateFailures.push(`knowledge old_not_in_new=${oldNotInNew} (必须 0：真实 recall 被漏掉)`);

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
