import { Worker } from 'bullmq';
import type IORedis from 'ioredis';
import type { Pool } from 'mysql2/promise';
import { createMysqlPool } from './infrastructure/mysql/client';
import {
  CLEAN_BATCH_QUEUE_NAME,
  createCleanBatchQueue,
  createRedisConnection,
  type CleanBatchJobData,
} from './infrastructure/queue/clean-batch-queue';
import { cleanBatch, markBatchFailed } from './jobs/cleaning-worker';
import { dispatchOutbox } from './jobs/outbox-dispatcher';
import { createLogger } from './support/logger';

const logger = createLogger('worker');

async function main(): Promise<void> {
  const workerId = `${process.pid}-${Date.now()}`;
  const pool = createMysqlPool();
  const redisConnection = createRedisConnection();
  const queue = createCleanBatchQueue(redisConnection);
  const cleaningWorker = new Worker<CleanBatchJobData>(
    CLEAN_BATCH_QUEUE_NAME,
    job =>
      cleanBatch(job.data, {
        pool,
        logger,
      }),
    {
      connection: redisConnection,
      concurrency: Number(process.env.CLEAN_BATCH_CONCURRENCY ?? 2),
    },
  );

  cleaningWorker.on('completed', (job, result) => {
    logger.info({ jobId: job.id, result }, 'clean batch job completed');
  });

  cleaningWorker.on('failed', (job, error) => {
    logger.warn({ jobId: job?.id, err: error }, 'clean batch job failed');
    if (!job || job.attemptsMade < (job.opts.attempts ?? 1)) {
      return;
    }

    void markBatchFailed(pool, job.data.batchId, error, 'failed_terminal').catch(markError => {
      logger.error({ err: markError, batchId: job.data.batchId }, 'mark terminal failure failed');
    });
  });

  await queue.waitUntilReady();
  await cleaningWorker.waitUntilReady();
  logger.info({ workerId }, 'sdd-monitor worker ready');

  if (process.env.WORKER_ONCE === 'true') {
    await runOnce({
      pool,
      redisConnection,
      queue,
      cleaningWorker,
      workerId,
    });
    return;
  }

  let dispatching = false;
  const dispatchIntervalMs = Number(process.env.OUTBOX_DISPATCH_INTERVAL_MS ?? 2000);
  const dispatchLimit = Number(process.env.OUTBOX_DISPATCH_LIMIT ?? 20);

  const tick = async () => {
    if (dispatching) {
      return;
    }

    dispatching = true;
    try {
      const dispatched = await dispatchOutbox({
        pool,
        queue,
        logger,
        limit: dispatchLimit,
        workerId,
      });
      if (dispatched > 0) {
        logger.info({ dispatched }, 'outbox dispatched');
      }
    } finally {
      dispatching = false;
    }
  };

  const interval = setInterval(() => {
    void tick().catch(error => {
      logger.error({ err: error }, 'outbox dispatch tick failed');
    });
  }, dispatchIntervalMs);

  await tick();

  const shutdown = async () => {
    clearInterval(interval);
    await closeRuntime(pool, redisConnection, cleaningWorker, queue);
    process.exit(0);
  };

  process.once('SIGTERM', () => {
    logger.info('worker received SIGTERM');
    void shutdown();
  });

  process.once('SIGINT', () => {
    logger.info('worker received SIGINT');
    void shutdown();
  });
}

async function runOnce(input: {
  pool: Pool;
  redisConnection: IORedis;
  queue: ReturnType<typeof createCleanBatchQueue>;
  cleaningWorker: Worker<CleanBatchJobData>;
  workerId: string;
}): Promise<void> {
  const dispatched = await dispatchOutbox({
    pool: input.pool,
    queue: input.queue,
    logger,
    limit: Number(process.env.OUTBOX_DISPATCH_LIMIT ?? 20),
    workerId: input.workerId,
  });

  logger.info({ dispatched }, 'worker once dispatched outbox');
  await waitUntilQueueIdle(input.queue, Number(process.env.WORKER_ONCE_TIMEOUT_MS ?? 30000));
  await closeRuntime(input.pool, input.redisConnection, input.cleaningWorker, input.queue);
}

async function waitUntilQueueIdle(
  queue: ReturnType<typeof createCleanBatchQueue>,
  timeoutMs: number,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const counts = await queue.getJobCounts('waiting', 'active', 'delayed', 'failed');
    if ((counts.failed ?? 0) > 0) {
      throw new Error(`clean batch queue has failed jobs: ${counts.failed}`);
    }

    if ((counts.waiting ?? 0) === 0 && (counts.active ?? 0) === 0 && (counts.delayed ?? 0) === 0) {
      return;
    }

    await sleep(250);
  }

  throw new Error(`clean batch queue did not become idle within ${timeoutMs}ms`);
}

async function closeRuntime(
  pool: Pool,
  redisConnection: IORedis,
  cleaningWorker: Worker<CleanBatchJobData>,
  queue: ReturnType<typeof createCleanBatchQueue>,
): Promise<void> {
  await cleaningWorker.close();
  await queue.close();
  redisConnection.disconnect();
  await pool.end();
}

async function sleep(ms: number): Promise<void> {
  await new Promise(resolve => setTimeout(resolve, ms));
}

void main();
