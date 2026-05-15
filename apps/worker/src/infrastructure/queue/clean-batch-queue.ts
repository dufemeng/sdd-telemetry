import { Queue, type JobsOptions } from 'bullmq';
import IORedis from 'ioredis';

export const CLEAN_BATCH_QUEUE_NAME = 'sdd-monitor.clean-batch';

export interface CleanBatchJobData {
  batchId: string;
}

export function createRedisConnection(): IORedis {
  return new IORedis({
    host: process.env.REDIS_HOST ?? '127.0.0.1',
    port: Number(process.env.REDIS_PORT ?? 46379),
    password: process.env.REDIS_PASSWORD || undefined,
    db: Number(process.env.REDIS_DB ?? 0),
    connectTimeout: Number(process.env.REDIS_CONNECT_TIMEOUT_MS ?? 5000),
    retryStrategy: times => {
      if (process.env.WORKER_ONCE === 'true' && times > 3) {
        return null;
      }

      return Math.min(times * 500, 5000);
    },
    maxRetriesPerRequest: null,
  });
}

export function createCleanBatchQueue(connection: IORedis): Queue<CleanBatchJobData> {
  return new Queue<CleanBatchJobData>(CLEAN_BATCH_QUEUE_NAME, {
    connection,
    defaultJobOptions: defaultCleanBatchJobOptions(),
  });
}

export function defaultCleanBatchJobOptions(): JobsOptions {
  return {
    attempts: Number(process.env.CLEAN_BATCH_JOB_ATTEMPTS ?? 5),
    backoff: {
      type: 'exponential',
      delay: Number(process.env.CLEAN_BATCH_JOB_BACKOFF_MS ?? 1000),
    },
    removeOnComplete: {
      count: Number(process.env.CLEAN_BATCH_REMOVE_ON_COMPLETE ?? 1000),
    },
    removeOnFail: {
      count: Number(process.env.CLEAN_BATCH_REMOVE_ON_FAIL ?? 1000),
    },
  };
}
