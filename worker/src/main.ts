import type { Pool } from 'mysql2/promise';
import { createMysqlPool } from './infrastructure/mysql/client';
import { runProfileMaintenanceOnce } from './jobs/profile-maintenance/projection-maintainer';
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

  let cleaningRunning = false;
  let projectionRunning = false;
  const intervalMs = Number(process.env.SCHEDULE_CLEANING_INTERVAL_MS ?? 30000);
  const projectionEnabled = process.env.PROFILE_PROJECTION_ENABLED !== 'false';
  const projectionIntervalMs = Number(process.env.PROFILE_PROJECTION_INTERVAL_MS ?? 30000);

  const cleaningTick = async () => {
    if (cleaningRunning) {
      logger.warn({ workerId }, 'scheduled cleaner tick skipped because previous tick is still running');
      return;
    }

    cleaningRunning = true;
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
      cleaningRunning = false;
    }
  };

  const projectionTick = async () => {
    if (!projectionEnabled) return;
    if (projectionRunning) {
      logger.warn({ workerId }, 'profile projection tick skipped because previous tick is still running');
      return;
    }

    projectionRunning = true;
    try {
      const result = await runProfileMaintenanceOnce({
        pool,
        logger,
        workerId,
      });
      if (result.claimed > 0 || result.configDirty > 0) {
        logger.info({ result }, 'profile projection tick completed');
      }
    } finally {
      projectionRunning = false;
    }
  };

  const cleaningInterval = setInterval(() => {
    void cleaningTick().catch(error => {
      logger.error({ err: error }, 'scheduled cleaner tick failed');
    });
  }, intervalMs);
  const projectionInterval = setInterval(() => {
    void projectionTick().catch(error => {
      logger.error({ err: error }, 'profile projection tick failed');
    });
  }, projectionIntervalMs);

  await cleaningTick();
  await projectionTick();

  const shutdown = async () => {
    clearInterval(cleaningInterval);
    clearInterval(projectionInterval);
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
  const cleanResult = await runScheduledCleaning({
    pool,
    logger,
    workerId,
  });
  const projectionResult = await runProfileMaintenanceOnce({
    pool,
    logger,
    workerId,
    maxJobs: Number(process.env.PROFILE_PROJECTION_MAX_JOBS_PER_TICK ?? 3),
  });

  logger.info({ cleanResult, projectionResult }, 'scheduled cleaner once completed');
  await pool.end();
}

void main();
