import type { Pool, PoolConnection, ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import { withTransaction } from '../../infrastructure/mysql/client';

export type ProjectionJobStatus = 'idle' | 'dirty' | 'running' | 'failed';

export interface ProjectionJob {
  profileId: string;
  targetConfigVersionId: string | null;
  status: ProjectionJobStatus;
  dirtySeq: number;
  runningDirtySeq: number;
  attempts: number;
  maxAttempts: number;
  dirtyReason: string | null;
  lockedBy: string | null;
  lastCompletedAt: Date | null;
  lastProfileConfigVersionId: string | null;
  lastResolvedConfigHash: string | null;
}

interface ProjectionJobRow extends RowDataPacket {
  profile_id: string;
  target_config_version_id: number | string | null;
  status: ProjectionJobStatus;
  dirty_seq: number | string;
  running_dirty_seq: number | string | null;
  attempts: number;
  max_attempts: number;
  dirty_reason: string | null;
  locked_by: string | null;
  last_completed_at: Date | null;
  last_profile_config_version_id: number | string | null;
  last_resolved_config_hash: string | null;
  locked_until: Date | null;
}

export interface MarkDirtyInput {
  profileId: string;
  reason: string;
  targetConfigVersionId?: string | null;
  maxAttempts?: number;
}

export class ProjectionJobStore {
  async get(pool: Pool, profileId: string): Promise<ProjectionJob | null> {
    const [rows] = await pool.query<ProjectionJobRow[]>(
      `SELECT profile_id, target_config_version_id, status, dirty_seq, running_dirty_seq, attempts, max_attempts,
              dirty_reason, locked_by, locked_until, last_completed_at,
              last_profile_config_version_id, last_resolved_config_hash
       FROM profile_projection_jobs
       WHERE profile_id = ?`,
      [profileId],
    );
    return rows[0] ? toJob(rows[0]) : null;
  }

  async markDirty(pool: Pool, input: MarkDirtyInput): Promise<void> {
    const maxAttempts = input.maxAttempts ?? Number(process.env.PROFILE_PROJECTION_MAX_ATTEMPTS ?? 20);
    await pool.query(
      `INSERT INTO profile_projection_jobs
         (profile_id, target_config_version_id, status, dirty_seq, dirty_since, dirty_until,
          dirty_reason, max_attempts, next_retry_at)
       VALUES (?, ?, 'dirty', 1, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3), ?, ?, NULL)
       ON DUPLICATE KEY UPDATE
         target_config_version_id = VALUES(target_config_version_id),
         dirty_seq = dirty_seq + 1,
         status = CASE WHEN status = 'running' THEN status ELSE 'dirty' END,
         dirty_since = COALESCE(dirty_since, CURRENT_TIMESTAMP(3)),
         dirty_until = CURRENT_TIMESTAMP(3),
         dirty_reason = VALUES(dirty_reason),
         max_attempts = VALUES(max_attempts),
         attempts = 0,
         next_retry_at = NULL,
         last_error = NULL,
         gmt_modified = CURRENT_TIMESTAMP(3)`,
      [input.profileId, input.targetConfigVersionId ?? null, input.reason, maxAttempts],
    );
  }

  async claimNext(pool: Pool, workerId: string, lockSeconds: number): Promise<ProjectionJob | null> {
    return withTransaction(pool, async (connection) => {
      const [rows] = await connection.query<ProjectionJobRow[]>(
        `SELECT profile_id, target_config_version_id, status, dirty_seq, running_dirty_seq, attempts, max_attempts,
                dirty_reason, locked_by, locked_until, last_completed_at,
                last_profile_config_version_id, last_resolved_config_hash
         FROM profile_projection_jobs
         WHERE (
             status IN ('dirty', 'failed')
             AND attempts < max_attempts
             AND (next_retry_at IS NULL OR next_retry_at <= CURRENT_TIMESTAMP(3))
             AND (locked_until IS NULL OR locked_until < CURRENT_TIMESTAMP(3))
           )
           OR (
             status = 'running'
             AND locked_until IS NOT NULL
             AND locked_until < CURRENT_TIMESTAMP(3)
           )
         ORDER BY FIELD(status, 'dirty', 'running', 'failed'), dirty_since ASC, profile_id ASC
         LIMIT 1
         FOR UPDATE`,
      );
      const row = rows[0];
      if (!row) return null;
      await this.markClaimed(connection, row.profile_id, workerId, lockSeconds);
      return toClaimedJob(row, workerId);
    });
  }

  async claimProfile(
    pool: Pool,
    profileId: string,
    workerId: string,
    lockSeconds: number,
  ): Promise<ProjectionJob | null> {
    return withTransaction(pool, async (connection) => {
      const [rows] = await connection.query<ProjectionJobRow[]>(
        `SELECT profile_id, target_config_version_id, status, dirty_seq, running_dirty_seq, attempts, max_attempts,
                dirty_reason, locked_by, locked_until, last_completed_at,
                last_profile_config_version_id, last_resolved_config_hash
         FROM profile_projection_jobs
         WHERE profile_id = ?
         FOR UPDATE`,
        [profileId],
      );
      const row = rows[0];
      if (!row) return null;
      if (row.status === 'running' && row.locked_until && row.locked_until.getTime() > Date.now()) {
        return null;
      }
      await this.markClaimed(connection, row.profile_id, workerId, lockSeconds);
      return toClaimedJob(row, workerId);
    });
  }

  async markSucceeded(
    connection: PoolConnection,
    input: {
      profileId: string;
      workerId: string;
      runningDirtySeq: number;
      projectionRunId: number;
      profileConfigVersionId: string | null;
      resolvedConfigHash: string;
    },
  ): Promise<void> {
    const [result] = await connection.query<ResultSetHeader>(
      `UPDATE profile_projection_jobs
       SET status = CASE WHEN dirty_seq <= ? THEN 'idle' ELSE 'dirty' END,
           dirty_since = CASE WHEN dirty_seq <= ? THEN NULL ELSE dirty_since END,
           dirty_until = CASE WHEN dirty_seq <= ? THEN NULL ELSE dirty_until END,
           dirty_reason = CASE WHEN dirty_seq <= ? THEN NULL ELSE dirty_reason END,
           running_dirty_seq = NULL,
           attempts = 0,
           next_retry_at = NULL,
           locked_by = NULL,
           locked_until = NULL,
           last_started_at = last_started_at,
           last_completed_at = CURRENT_TIMESTAMP(3),
           last_projection_run_id = ?,
           last_profile_config_version_id = ?,
           last_resolved_config_hash = ?,
           last_error = NULL,
           gmt_modified = CURRENT_TIMESTAMP(3)
       WHERE profile_id = ?
         AND status = 'running'
         AND locked_by = ?
         AND running_dirty_seq = ?`,
      [
        input.runningDirtySeq,
        input.runningDirtySeq,
        input.runningDirtySeq,
        input.runningDirtySeq,
        input.projectionRunId,
        input.profileConfigVersionId,
        input.resolvedConfigHash,
        input.profileId,
        input.workerId,
        input.runningDirtySeq,
      ],
    );
    if (result.affectedRows !== 1) {
      throw new Error(`profile projection job lock lost before publish: ${input.profileId}`);
    }
  }

  async markFailed(
    pool: Pool,
    input: {
      profileId: string;
      workerId: string;
      runningDirtySeq: number;
      error: unknown;
      retrySeconds: number;
    },
  ): Promise<boolean> {
    const [result] = await pool.query<ResultSetHeader>(
      `UPDATE profile_projection_jobs
       SET status = 'failed',
           running_dirty_seq = NULL,
           locked_by = NULL,
           locked_until = NULL,
           next_retry_at = DATE_ADD(CURRENT_TIMESTAMP(3), INTERVAL ? SECOND),
           last_error = ?,
           gmt_modified = CURRENT_TIMESTAMP(3)
       WHERE profile_id = ?
         AND status = 'running'
         AND locked_by = ?
         AND running_dirty_seq = ?`,
      [
        input.retrySeconds,
        stringifyError(input.error),
        input.profileId,
        input.workerId,
        input.runningDirtySeq,
      ],
    );
    return result.affectedRows === 1;
  }

  private async markClaimed(
    connection: PoolConnection,
    profileId: string,
    workerId: string,
    lockSeconds: number,
  ): Promise<void> {
    await connection.query(
      `UPDATE profile_projection_jobs
       SET status = 'running',
           running_dirty_seq = dirty_seq,
           attempts = attempts + 1,
           locked_by = ?,
           locked_until = DATE_ADD(CURRENT_TIMESTAMP(3), INTERVAL ? SECOND),
           last_started_at = CURRENT_TIMESTAMP(3),
           gmt_modified = CURRENT_TIMESTAMP(3)
       WHERE profile_id = ?`,
      [workerId, lockSeconds, profileId],
    );
  }
}

function toClaimedJob(row: ProjectionJobRow, workerId: string): ProjectionJob {
  const dirtySeq = Number(row.dirty_seq);
  return {
    ...toJob(row),
    status: 'running',
    runningDirtySeq: dirtySeq,
    attempts: Number(row.attempts) + 1,
    lockedBy: workerId,
  };
}

function toJob(row: ProjectionJobRow): ProjectionJob {
  const dirtySeq = Number(row.dirty_seq);
  return {
    profileId: String(row.profile_id),
    targetConfigVersionId: row.target_config_version_id == null ? null : String(row.target_config_version_id),
    status: row.status,
    dirtySeq,
    runningDirtySeq: row.running_dirty_seq == null ? dirtySeq : Number(row.running_dirty_seq),
    attempts: Number(row.attempts),
    maxAttempts: Number(row.max_attempts),
    dirtyReason: row.dirty_reason,
    lockedBy: row.locked_by,
    lastCompletedAt: row.last_completed_at,
    lastProfileConfigVersionId: row.last_profile_config_version_id == null ? null : String(row.last_profile_config_version_id),
    lastResolvedConfigHash: row.last_resolved_config_hash,
  };
}

function stringifyError(error: unknown): string {
  if (error instanceof Error) {
    return `${error.name}: ${error.message}\n${error.stack ?? ''}`.slice(0, 4000);
  }
  return String(error).slice(0, 4000);
}
