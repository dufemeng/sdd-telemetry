import type { Pool } from 'mysql2/promise';
import type { Logger } from 'pino';
import { withTransaction } from '../infrastructure/mysql/client';
import { cleanBatch, TerminalCleaningError } from './cleaning-worker';
import { OutboxRepository } from './outbox.repository';
import { maintainProfilesAfterCleanBatch } from './profile-maintenance/projection-maintainer';

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

interface ClaimedOutbox {
  id: string;
  batchId: string;
  attempts: number;
  maxAttempts: number;
}

const outboxRepository = new OutboxRepository();

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
      const cleanResult = await cleanBatch({ batchId: claimed.batchId }, {
        pool: options.pool,
        logger: options.logger,
      });
      await maintainProfilesAfterCleanBatch(
        { pool: options.pool, logger: options.logger },
        {
          batchId: claimed.batchId,
          // 如果上次 clean 已经成功但 maintenance 失败，outbox 重试时 batch 会是 parsed/skipped。
          // 这时仍要标记 profile dirty，避免“清洗成功、投影维护丢失”的真空。
          derivedCount: cleanResult.skipped ? 1 : cleanResult.derivedCount,
          // skipped 重试拿不到本批写出的 keys/ids，传 null 回退全量以保证完整；
          // 正常清洗只增量重建本批写出的 skill 引用和 tool-call 引用。
          skillUsageKeys: cleanResult.skipped ? null : cleanResult.skillUsageKeys,
          toolUseIds: cleanResult.skipped ? null : cleanResult.toolUseIds,
        },
      );
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
    const rows = await outboxRepository.lockAndLoadNextOutbox(connection);
    const row = rows[0];
    if (!row) {
      return null;
    }

    await outboxRepository.markOutboxDispatching(
      connection,
      row.id,
      options.workerId,
      lockSeconds,
    );
    await outboxRepository.markBatchQueued(connection, row.aggregate_id);

    return {
      id: String(row.id),
      batchId: String(row.aggregate_id),
      attempts: Number(row.attempts) + 1,
      maxAttempts: Number(row.max_attempts),
    };
  });
}

async function markOutboxSucceeded(pool: Pool, row: ClaimedOutbox): Promise<void> {
  await outboxRepository.markOutboxSucceeded(pool, row.id);
}

async function markOutboxFailed(
  pool: Pool,
  row: ClaimedOutbox,
  error: unknown,
): Promise<boolean> {
  const terminal = error instanceof TerminalCleaningError || row.attempts >= row.maxAttempts;
  const retrySeconds = Math.min(300, 2 ** Math.min(row.attempts, 8));

  await outboxRepository.markOutboxFailed(
    pool,
    row.id,
    terminal ? 'failed_terminal' : 'pending',
    terminal,
    retrySeconds,
    stringifyError(error),
  );

  return terminal;
}

function stringifyError(error: unknown): string {
  if (error instanceof Error) {
    return `${error.name}: ${error.message}\n${error.stack ?? ''}`.trim();
  }

  return String(error);
}
