import type { Pool, PoolConnection, ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import type { Logger } from 'pino';
import { withTransaction } from '../../infrastructure/mysql/client';

/**
 * Profile projection 运行框架（MVP-1，Task 7）。
 *
 * current-pointer 模型：
 * 1. 取 profile 级锁（GET_LOCK），保证同 profile 同时只有一个 running run。
 * 2. 新建 profile_projection_runs（running），各算子把明细写入这个 projection_run_id。
 * 3. 全部算子成功后，在同一事务里标 completed + 切换 current pointer。
 * 4. 任一算子抛错 → 标 failed，current pointer 不动，看板继续读旧 run。
 *
 * 算子集合在 PR-4/PR-5 注册；PR-3 是空框架（可注入算子用于测试）。
 */

/**
 * 运行内共享的 id 映射：把上游（sdd_* 或 source_references）的 id 映射到本 run 新插入的
 * profile_* 行 id，供后续算子做跨表 linkage。算子按依赖顺序执行，前序算子填充、后序消费。
 */
export interface ProjectionIdRegistry {
  capabilityUsageBySkillUsageId: Map<number, number>;
  deliveryUnitByWorkItemId: Map<number, number>;
  artifactByArtifactId: Map<number, number>;
}

export function createIdRegistry(): ProjectionIdRegistry {
  return {
    capabilityUsageBySkillUsageId: new Map(),
    deliveryUnitByWorkItemId: new Map(),
    artifactByArtifactId: new Map(),
  };
}

export interface ProjectionContext {
  pool: Pool;
  profileId: string;
  projectionRunId: number;
  logger: Logger;
  registry: ProjectionIdRegistry;
}

export interface ProjectionOperator {
  name: string;
  /** 返回算子自定义的统计对象，框架原样收进 stats_json，不解释其结构。 */
  run(ctx: ProjectionContext): Promise<unknown>;
}

/** PR-3 空算子集；后续 PR 注册 capability / delivery / artifact / knowledge / code 算子。 */
export const PROFILE_PROJECTION_OPERATORS: ProjectionOperator[] = [];

export interface ProjectionRunResult {
  runId: number;
  status: 'completed' | 'failed';
  stats: Record<string, unknown>;
}

export async function runProfileProjection(opts: {
  pool: Pool;
  logger: Logger;
  profileId: string;
  operators?: ProjectionOperator[];
}): Promise<ProjectionRunResult> {
  const { pool, logger, profileId } = opts;
  const operators = opts.operators ?? PROFILE_PROJECTION_OPERATORS;
  const lockName = `profile_projection:${profileId}`;

  const lockConn = await pool.getConnection();
  try {
    if (!(await acquireLock(lockConn, lockName))) {
      throw new Error(`profile projection already running for ${profileId}`);
    }

    const runId = await insertRun(pool, profileId);
    try {
      const stats: Record<string, unknown> = {};
      const registry = createIdRegistry();
      for (const operator of operators) {
        stats[operator.name] = await operator.run({
          pool,
          profileId,
          projectionRunId: runId,
          logger,
          registry,
        });
      }

      // 成功：在同一事务里标 completed + 切 pointer，保证看板不会读到半切状态。
      await withTransaction(pool, async (connection) => {
        await markRunCompleted(connection, runId, stats);
        await upsertCurrentPointer(connection, profileId, runId);
      });

      logger.info({ profileId, runId, stats }, 'profile projection completed; pointer switched');
      return { runId, status: 'completed', stats };
    } catch (error) {
      await markRunFailed(pool, runId, error);
      logger.error({ profileId, runId, err: error }, 'profile projection failed; pointer unchanged');
      throw error;
    }
  } finally {
    await releaseLock(lockConn, lockName);
    lockConn.release();
  }
}

async function acquireLock(connection: PoolConnection, name: string): Promise<boolean> {
  const [rows] = await connection.query<RowDataPacket[]>('SELECT GET_LOCK(?, 0) AS got', [name]);
  return Number(rows[0]?.got) === 1;
}

async function releaseLock(connection: PoolConnection, name: string): Promise<void> {
  await connection.query('SELECT RELEASE_LOCK(?)', [name]);
}

async function insertRun(pool: Pool, profileId: string): Promise<number> {
  const [result] = await pool.query<ResultSetHeader>(
    `INSERT INTO profile_projection_runs (profile_id, run_type, status, started_at)
     VALUES (?, 'full', 'running', NOW(3))`,
    [profileId],
  );
  return result.insertId;
}

async function markRunCompleted(
  connection: PoolConnection,
  runId: number,
  stats: Record<string, unknown>,
): Promise<void> {
  await connection.query(
    `UPDATE profile_projection_runs
     SET status='completed', completed_at=NOW(3), stats_json=? WHERE id=?`,
    [JSON.stringify(stats), runId],
  );
}

async function upsertCurrentPointer(
  connection: PoolConnection,
  profileId: string,
  runId: number,
): Promise<void> {
  await connection.query(
    `INSERT INTO profile_current_projection_runs (profile_id, current_projection_run_id)
     VALUES (?, ?)
     ON DUPLICATE KEY UPDATE current_projection_run_id=VALUES(current_projection_run_id)`,
    [profileId, runId],
  );
}

async function markRunFailed(pool: Pool, runId: number, error: unknown): Promise<void> {
  const message = (error instanceof Error ? error.message : String(error)).slice(0, 1000);
  await pool.query(
    `UPDATE profile_projection_runs
     SET status='failed', completed_at=NOW(3), error_message=? WHERE id=?`,
    [message, runId],
  );
}
