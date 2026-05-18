import type { Pool } from 'mysql2/promise';
import { createMysqlPool } from './infrastructure/mysql/client';
import { runScheduledCleaning } from './jobs/scheduled-cleaning-runner';
import { createLogger } from './support/logger';

const logger = createLogger('scheduled-cleaner');

async function main(): Promise<void> {
  const workerId = `${process.pid}-${Date.now()}`;
  const pool = createMysqlPool();

  logger.info({ workerId }, 'sdd-telemetry scheduled cleaner ready');

  if (process.env.WORKER_ONCE === 'true') {
    await runOnce(pool, workerId);
    return;
  }

  let running = false;
  const intervalMs = Number(process.env.SCHEDULE_CLEANING_INTERVAL_MS ?? 30000);

  const tick = async () => {
    if (running) {
      logger.warn({ workerId }, 'scheduled cleaner tick skipped because previous tick is still running');
      return;
    }

    running = true;
    try {
      const result = await runScheduledCleaning({
        pool,
        logger,
        workerId,
      });
      if (result.claimed > 0 || result.deadlineReached) {
        logger.info({ result }, 'scheduled cleaner tick completed');
      }
    } finally {
      running = false;
    }
  };

  const interval = setInterval(() => {
    void tick().catch(error => {
      logger.error({ err: error }, 'scheduled cleaner tick failed');
    });
  }, intervalMs);

  await tick();

  const shutdown = async () => {
    clearInterval(interval);
    await pool.end();
    process.exit(0);
  };

  process.once('SIGTERM', () => {
    logger.info('scheduled cleaner received SIGTERM');
    void shutdown();
  });

  process.once('SIGINT', () => {
    logger.info('scheduled cleaner received SIGINT');
    void shutdown();
  });
}

async function runOnce(pool: Pool, workerId: string): Promise<void> {
  const result = await runScheduledCleaning({
    pool,
    logger,
    workerId,
  });

  logger.info({ result }, 'scheduled cleaner once completed');
  await pool.end();
}

void main();
