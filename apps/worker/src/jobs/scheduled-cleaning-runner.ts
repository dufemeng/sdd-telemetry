import type { Pool, RowDataPacket } from 'mysql2/promise';
import type { Logger } from 'pino';
import { withTransaction } from '../infrastructure/mysql/client';
import { cleanBatch, TerminalCleaningError } from './cleaning-worker';

export interface ScheduledCleaningOptions {
  pool: Pool;
  logger: Logger;
  workerId: string;
  budgetMs?: number;
  lockSeconds?: number;
}

export interface ScheduledCleaningResult {
  claimed: number;
  succeeded: number;
  failed: number;
  terminalFailed: number;
  deadlineReached: boolean;
}

interface OutboxRow extends RowDataPacket {
  id: string;
  aggregate_id: string;
  attempts: number;
  max_attempts: number;
}

interface ClaimedOutbox {
  id: string;
  batchId: string;
  attempts: number;
  maxAttempts: number;
}

export async function runScheduledCleaning(
  options: ScheduledCleaningOptions,
): Promise<ScheduledCleaningResult> {
  const budgetMs = options.budgetMs ?? Number(process.env.SCHEDULE_CLEANING_BUDGET_MS ?? 45000);
  const deadline = Date.now() + budgetMs;
  const result: ScheduledCleaningResult = {
    claimed: 0,
    succeeded: 0,
    failed: 0,
    terminalFailed: 0,
    deadlineReached: false,
  };

  while (Date.now() < deadline) {
    const remainingMs = deadline - Date.now();
    if (remainingMs <= 1000) {
      result.deadlineReached = true;
      break;
    }

    const claimed = await claimOneOutbox(options);
    if (!claimed) {
      return result;
    }

    result.claimed += 1;

    try {
      await cleanBatch({ batchId: claimed.batchId }, {
        pool: options.pool,
        logger: options.logger,
      });
      await markOutboxSucceeded(options.pool, claimed);
      result.succeeded += 1;
    } catch (error) {
      const terminal = await markOutboxFailed(options.pool, claimed, error);
      result.failed += 1;
      if (terminal) {
        result.terminalFailed += 1;
      }

      options.logger.warn(
        { err: error, outboxId: claimed.id, batchId: claimed.batchId, terminal },
        'scheduled clean batch failed',
      );
    }
  }

  result.deadlineReached = true;
  return result;
}

async function claimOneOutbox(options: ScheduledCleaningOptions): Promise<ClaimedOutbox | null> {
  const lockSeconds = options.lockSeconds ?? Number(process.env.SCHEDULE_CLEANING_LOCK_SECONDS ?? 120);

  return withTransaction(options.pool, async connection => {
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
    const row = rows[0];
    if (!row) {
      return null;
    }

    await connection.query(
      `UPDATE ingest_outbox
       SET status = 'dispatching',
           attempts = attempts + 1,
           locked_by = ?,
           locked_until = DATE_ADD(CURRENT_TIMESTAMP(3), INTERVAL ? SECOND),
           gmt_modified = CURRENT_TIMESTAMP(3)
       WHERE id = ?`,
      [options.workerId, lockSeconds, row.id],
    );

    await connection.query(
      `UPDATE otel_ingest_batches
       SET status = 'queued',
           status_reason = 'claimed by scheduled cleaner',
           gmt_modified = CURRENT_TIMESTAMP(3)
       WHERE id = ?
         AND status IN ('received', 'failed_retryable')`,
      [row.aggregate_id],
    );

    return {
      id: String(row.id),
      batchId: String(row.aggregate_id),
      attempts: Number(row.attempts) + 1,
      maxAttempts: Number(row.max_attempts),
    };
  });
}

async function markOutboxSucceeded(pool: Pool, row: ClaimedOutbox): Promise<void> {
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
    [row.id],
  );
}

async function markOutboxFailed(
  pool: Pool,
  row: ClaimedOutbox,
  error: unknown,
): Promise<boolean> {
  const terminal = error instanceof TerminalCleaningError || row.attempts >= row.maxAttempts;
  const retrySeconds = Math.min(300, 2 ** Math.min(row.attempts, 8));

  await pool.query(
    `UPDATE ingest_outbox
     SET status = ?,
         locked_by = NULL,
         locked_until = NULL,
         next_retry_at = IF(?, NULL, DATE_ADD(CURRENT_TIMESTAMP(3), INTERVAL ? SECOND)),
         last_error = ?,
         gmt_modified = CURRENT_TIMESTAMP(3)
     WHERE id = ?`,
    [
      terminal ? 'failed_terminal' : 'pending',
      terminal,
      retrySeconds,
      stringifyError(error),
      row.id,
    ],
  );

  return terminal;
}

function stringifyError(error: unknown): string {
  if (error instanceof Error) {
    return `${error.name}: ${error.message}\n${error.stack ?? ''}`.trim();
  }

  return String(error);
}
