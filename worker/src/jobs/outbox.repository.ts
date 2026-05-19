import type { Pool, PoolConnection, RowDataPacket } from 'mysql2/promise';

export interface OutboxRow extends RowDataPacket {
  id: string;
  aggregate_id: string;
  attempts: number;
  max_attempts: number;
}

export class OutboxRepository {
  async lockAndLoadNextOutbox(connection: PoolConnection): Promise<OutboxRow[]> {
    const [rows] = await connection.query<OutboxRow[]>(
      `SELECT id, aggregate_id, attempts, max_attempts
       FROM ingest_outbox
       WHERE event_type = 'clean_batch'
         AND status IN ('pending', 'dispatching')
         AND attempts < max_attempts
         AND (next_retry_at IS NULL OR next_retry_at <= CURRENT_TIMESTAMP(3))
         AND (locked_until IS NULL OR locked_until < CURRENT_TIMESTAMP(3))
       ORDER BY id ASC
       LIMIT 1
       FOR UPDATE`,
    );
    return rows;
  }

  async markOutboxDispatching(
    connection: PoolConnection,
    outboxId: string,
    workerId: string,
    lockSeconds: number,
  ): Promise<void> {
    await connection.query(
      `UPDATE ingest_outbox
       SET status = 'dispatching',
           attempts = attempts + 1,
           locked_by = ?,
           locked_until = DATE_ADD(CURRENT_TIMESTAMP(3), INTERVAL ? SECOND),
           gmt_modified = CURRENT_TIMESTAMP(3)
       WHERE id = ?`,
      [workerId, lockSeconds, outboxId],
    );
  }

  async markBatchQueued(connection: PoolConnection, batchId: string): Promise<void> {
    await connection.query(
      `UPDATE otel_ingest_batches
       SET status = 'queued',
           status_reason = 'claimed by scheduled cleaner',
           gmt_modified = CURRENT_TIMESTAMP(3)
       WHERE id = ?
         AND status IN ('received', 'failed_retryable')`,
      [batchId],
    );
  }

  async markOutboxSucceeded(pool: Pool, outboxId: string): Promise<void> {
    await pool.query(
      `UPDATE ingest_outbox
       SET status = 'dispatched',
           locked_by = NULL,
           locked_until = NULL,
           next_retry_at = NULL,
           last_error = NULL,
           dispatched_at = CURRENT_TIMESTAMP(3),
           gmt_modified = CURRENT_TIMESTAMP(3)
       WHERE id = ?`,
      [outboxId],
    );
  }

  async markOutboxFailed(
    pool: Pool,
    outboxId: string,
    status: 'failed_terminal' | 'pending',
    terminal: boolean,
    retrySeconds: number,
    lastError: string,
  ): Promise<void> {
    await pool.query(
      `UPDATE ingest_outbox
       SET status = ?,
           locked_by = NULL,
           locked_until = NULL,
           next_retry_at = IF(?, NULL, DATE_ADD(CURRENT_TIMESTAMP(3), INTERVAL ? SECOND)),
           last_error = ?,
           gmt_modified = CURRENT_TIMESTAMP(3)
       WHERE id = ?`,
      [status, terminal, retrySeconds, lastError, outboxId],
    );
  }
}
