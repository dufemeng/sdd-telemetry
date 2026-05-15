import type { Queue } from 'bullmq';
import type { Pool, PoolConnection, RowDataPacket } from 'mysql2/promise';
import type { Logger } from 'pino';
import { defaultCleanBatchJobOptions, type CleanBatchJobData } from '../infrastructure/queue/clean-batch-queue';
import { withTransaction } from '../infrastructure/mysql/client';

export interface DispatchOutboxOptions {
  pool: Pool;
  queue: Queue<CleanBatchJobData>;
  logger: Logger;
  limit: number;
  workerId: string;
  lockSeconds?: number;
}

interface OutboxRow extends RowDataPacket {
  id: string;
  aggregate_id: string;
  attempts: number;
  max_attempts: number;
}

export async function dispatchOutbox(options: DispatchOutboxOptions): Promise<number> {
  const claimedRows = await claimOutboxRows(options);
  let dispatched = 0;

  for (const row of claimedRows) {
    const batchId = String(row.aggregate_id);

    try {
      await options.queue.add('clean-batch', { batchId }, {
        ...defaultCleanBatchJobOptions(),
        jobId: `clean-batch-${batchId}-${row.attempts + 1}`,
      });
      await markOutboxDispatched(options.pool, row.id, batchId);
      dispatched += 1;
    } catch (error) {
      await markOutboxDispatchFailed(options.pool, row, error);
      options.logger.warn({ err: error, outboxId: row.id, batchId }, 'dispatch outbox failed');
    }
  }

  return dispatched;
}

async function claimOutboxRows(options: DispatchOutboxOptions): Promise<OutboxRow[]> {
  const lockSeconds = options.lockSeconds ?? 60;

  return withTransaction(options.pool, async connection => {
    const [rows] = await connection.query<OutboxRow[]>(
      `SELECT id, aggregate_id, attempts, max_attempts
       FROM ingest_outbox
       WHERE event_type = 'clean_batch'
         AND status IN ('pending', 'dispatching')
         AND (next_retry_at IS NULL OR next_retry_at <= CURRENT_TIMESTAMP(3))
         AND (locked_until IS NULL OR locked_until < CURRENT_TIMESTAMP(3))
       ORDER BY id ASC
       LIMIT ?
       FOR UPDATE`,
      [options.limit],
    );

    const claimableRows = rows.filter(row => row.attempts < row.max_attempts);

    if (claimableRows.length > 0) {
      const ids = claimableRows.map(row => row.id);
      await connection.query(
        `UPDATE ingest_outbox
         SET status = 'dispatching',
             attempts = attempts + 1,
             locked_by = ?,
             locked_until = DATE_ADD(CURRENT_TIMESTAMP(3), INTERVAL ? SECOND),
             updated_at = CURRENT_TIMESTAMP(3)
         WHERE id IN (${ids.map(() => '?').join(',')})`,
        [options.workerId, lockSeconds, ...ids],
      );
    }

    const exhaustedRows = rows.filter(row => row.attempts >= row.max_attempts);
    for (const row of exhaustedRows) {
      await markTerminalInTransaction(connection, row, 'outbox max attempts exhausted');
    }

    return claimableRows;
  });
}

async function markOutboxDispatched(pool: Pool, outboxId: string, batchId: string): Promise<void> {
  await withTransaction(pool, async connection => {
    await connection.query(
      `UPDATE ingest_outbox
       SET status = 'dispatched',
           locked_by = NULL,
           locked_until = NULL,
           last_error = NULL,
           dispatched_at = CURRENT_TIMESTAMP(3),
           updated_at = CURRENT_TIMESTAMP(3)
       WHERE id = ?`,
      [outboxId],
    );

    await connection.query(
      `UPDATE otel_ingest_batches
       SET status = 'queued',
           status_reason = 'queued by outbox dispatcher',
           updated_at = CURRENT_TIMESTAMP(3)
       WHERE id = ?
         AND status IN ('received', 'failed_retryable')`,
      [batchId],
    );
  });
}

async function markOutboxDispatchFailed(
  pool: Pool,
  row: OutboxRow,
  error: unknown,
): Promise<void> {
  await withTransaction(pool, async connection => {
    const attempts = row.attempts + 1;
    const terminal = attempts >= row.max_attempts;
    const retrySeconds = Math.min(300, 2 ** Math.min(attempts, 8));

    await connection.query(
      `UPDATE ingest_outbox
       SET status = ?,
           locked_by = NULL,
           locked_until = NULL,
           next_retry_at = IF(?, NULL, DATE_ADD(CURRENT_TIMESTAMP(3), INTERVAL ? SECOND)),
           last_error = ?,
           updated_at = CURRENT_TIMESTAMP(3)
       WHERE id = ?`,
      [
        terminal ? 'failed_terminal' : 'pending',
        terminal,
        retrySeconds,
        stringifyError(error),
        row.id,
      ],
    );
  });
}

async function markTerminalInTransaction(
  connection: PoolConnection,
  row: OutboxRow,
  reason: string,
): Promise<void> {
  await connection.query(
    `UPDATE ingest_outbox
     SET status = 'failed_terminal',
         locked_by = NULL,
         locked_until = NULL,
         next_retry_at = NULL,
         last_error = ?,
         updated_at = CURRENT_TIMESTAMP(3)
     WHERE id = ?`,
    [reason, row.id],
  );
}

function stringifyError(error: unknown): string {
  if (error instanceof Error) {
    return `${error.name}: ${error.message}\n${error.stack ?? ''}`.trim();
  }

  return String(error);
}
