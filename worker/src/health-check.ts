import { createMysqlPool } from './infrastructure/mysql/client';

/**
 * worker 容器健康判据 = “队列在排空”，而不是“进程存活”。
 *
 * 事故复盘：worker 进程活着、清洗 tick 照常跑，但投影被 env（PROFILE_PROJECTION_ENABLED=false）
 * 关掉 / 某次 tick 挂死时，看板会静默冻结好几天，而“进程是否存活”的健康检查完全察觉不到。
 * 这里用端到端的“滞留且不前进”信号，把这种静默故障暴露成 unhealthy。
 *
 * 关键：判据是 “落后 AND 最近没有进展”，不是单纯 “有积压”。
 * 否则把镜像部署到一台有积压的机器上（正是恢复场景）时，worker 正在排空积压、却会被误判 unhealthy。
 *   - 清洗滞留：存在超过阈值仍是 received 的 batch，且最近一次成功 parse 也已超过阈值（说明没在排空）。
 *   - 投影滞留：存在 dirty/running 且 dirty_since 超过阈值的 job，且最近一次 projection run 也已超过阈值。
 */
const STALL_SECONDS = Number(process.env.WORKER_HEALTH_STALL_SECONDS ?? 600);

interface HealthRow {
  behind_cleaning: number;
  clean_progress_age: number | null;
  behind_projection: number;
  projection_progress_age: number | null;
}

function isStalled(behind: number, progressAgeSeconds: number | null, stallSeconds: number): boolean {
  if (behind <= 0) return false;
  // 没有任何进展记录（null）= 从未推进过；落后却从未推进，视为滞留。
  return progressAgeSeconds === null || progressAgeSeconds > stallSeconds;
}

async function main(): Promise<void> {
  const pool = createMysqlPool();
  try {
    const [rows] = await pool.query(
      `SELECT
         (SELECT COUNT(*) FROM otel_ingest_batches
            WHERE status = 'received'
              AND received_at < (CURRENT_TIMESTAMP(3) - INTERVAL ? SECOND)) AS behind_cleaning,
         (SELECT TIMESTAMPDIFF(SECOND, MAX(gmt_modified), CURRENT_TIMESTAMP(3))
            FROM otel_ingest_batches WHERE status = 'parsed') AS clean_progress_age,
         (SELECT COUNT(*) FROM profile_projection_jobs
            WHERE status IN ('dirty', 'running')
              AND dirty_since IS NOT NULL
              AND dirty_since < (CURRENT_TIMESTAMP(3) - INTERVAL ? SECOND)) AS behind_projection,
         (SELECT TIMESTAMPDIFF(SECOND, MAX(started_at), CURRENT_TIMESTAMP(3))
            FROM profile_projection_runs) AS projection_progress_age`,
      [STALL_SECONDS, STALL_SECONDS],
    );
    const row = (rows as HealthRow[])[0];
    const behindCleaning = Number(row?.behind_cleaning ?? 0);
    const behindProjection = Number(row?.behind_projection ?? 0);
    const cleanProgressAge = row?.clean_progress_age == null ? null : Number(row.clean_progress_age);
    const projectionProgressAge =
      row?.projection_progress_age == null ? null : Number(row.projection_progress_age);

    const cleaningStalled = isStalled(behindCleaning, cleanProgressAge, STALL_SECONDS);
    const projectionStalled = isStalled(behindProjection, projectionProgressAge, STALL_SECONDS);

    if (cleaningStalled || projectionStalled) {
      console.error(
        `worker unhealthy (stall > ${STALL_SECONDS}s): ` +
          `cleaning_stalled=${cleaningStalled} (behind=${behindCleaning}, progress_age=${cleanProgressAge}s) ` +
          `projection_stalled=${projectionStalled} (behind=${behindProjection}, progress_age=${projectionProgressAge}s)`,
      );
      process.exitCode = 1;
      return;
    }
    process.exitCode = 0;
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error('worker health check failed', error);
  process.exitCode = 1;
});
