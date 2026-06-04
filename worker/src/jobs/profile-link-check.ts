import type { Pool, RowDataPacket } from 'mysql2/promise';
import { createMysqlPool } from '../infrastructure/mysql/client';

/**
 * 抽样链路对账（MVP-1，Task 15）。
 * 用法：pnpm profile:link-check -- --profile sdd-default [--samples 5]
 *
 * 对 N 个 delivery unit，沿 需求→artifact→timeline(writes/turns) 链路核对新旧计数。
 * 经 bridge 的 evidence_json.sourceId 把 profile_delivery_units 映射回 sdd_work_items。
 */

function argValue(flag: string): string | undefined {
  const idx = process.argv.indexOf(flag);
  return idx >= 0 ? process.argv[idx + 1] : undefined;
}

async function scalar(pool: Pool, sql: string, params: unknown[] = []): Promise<number> {
  const [rows] = await pool.query<RowDataPacket[]>(sql, params);
  return Number((rows[0] as Record<string, unknown> | undefined)?.v ?? 0);
}

interface SampleRow extends RowDataPacket {
  du_id: number;
  title: string | null;
  sdd_work_item_id: string | null;
}

async function main(): Promise<void> {
  const profileId = argValue('--profile') ?? 'sdd-default';
  const samples = Number(argValue('--samples') ?? 5);
  const pool = createMysqlPool();
  try {
    const runId = await scalar(
      pool,
      'SELECT current_projection_run_id AS v FROM profile_current_projection_runs WHERE profile_id=?',
      [profileId],
    );
    if (!runId) throw new Error(`no current projection run for ${profileId}`);

    // 优先抽有 artifact 的 delivery unit，链路更有料。
    const [rows] = await pool.query<SampleRow[]>(
      `SELECT du.id AS du_id, du.title,
              JSON_UNQUOTE(JSON_EXTRACT(du.evidence_json,'$.sourceId')) AS sdd_work_item_id,
              (SELECT COUNT(*) FROM profile_artifacts a
               WHERE a.projection_run_id=du.projection_run_id AND a.delivery_unit_id=du.id) AS artifact_cnt
       FROM profile_delivery_units du
       WHERE du.projection_run_id=?
       ORDER BY artifact_cnt DESC, du.id ASC
       LIMIT ?`,
      [runId, samples],
    );

    const results: Array<Record<string, unknown>> = [];
    const failures: string[] = [];

    for (const row of rows) {
      const sddId = row.sdd_work_item_id;
      const checks = {
        artifacts: {
          old: await scalar(pool, 'SELECT COUNT(*) AS v FROM sdd_work_item_artifacts WHERE work_item_id=?', [sddId]),
          new: await scalar(pool, 'SELECT COUNT(*) AS v FROM profile_artifacts WHERE projection_run_id=? AND delivery_unit_id=?', [runId, row.du_id]),
        },
        writes: {
          old: await scalar(pool, 'SELECT COUNT(*) AS v FROM sdd_work_item_artifact_writes WHERE work_item_id=?', [sddId]),
          new: await scalar(pool, 'SELECT COUNT(*) AS v FROM profile_artifact_writes WHERE projection_run_id=? AND delivery_unit_id=?', [runId, row.du_id]),
        },
        turns: {
          old: await scalar(pool, 'SELECT COUNT(*) AS v FROM sdd_work_item_artifact_turns WHERE work_item_id=?', [sddId]),
          new: await scalar(pool, 'SELECT COUNT(*) AS v FROM profile_artifact_turns WHERE projection_run_id=? AND delivery_unit_id=?', [runId, row.du_id]),
        },
      };

      const ok =
        checks.artifacts.old === checks.artifacts.new &&
        checks.writes.old === checks.writes.new &&
        checks.turns.old === checks.turns.new;
      if (!ok) failures.push(`deliveryUnit ${row.du_id} (sdd work_item ${sddId}) 链路计数不一致`);

      results.push({ deliveryUnitId: row.du_id, title: row.title, sddWorkItemId: sddId, ok, checks });
    }

    const report = {
      profileId,
      runId,
      sampled: results.length,
      gate: failures.length === 0 ? 'PASS' : 'FAIL',
      failures,
      results,
    };
    console.info(JSON.stringify(report, null, 2));
    if (failures.length > 0) process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

void main();
