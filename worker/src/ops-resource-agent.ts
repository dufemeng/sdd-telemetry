import { createMysqlPool } from './infrastructure/mysql/client';
import { collectOpsResourceSnapshot } from './jobs/ops-resource-collector';
import { createLogger } from './support/logger';

const logger = createLogger('ops-resource-agent');

async function main(): Promise<void> {
  const pool = createMysqlPool();
  const intervalMs = Number(process.env.OPS_RESOURCE_POLL_INTERVAL_SECONDS ?? 30) * 1000;
  let running = false;

  logger.info({ intervalMs }, 'ops resource agent ready');

  const tick = async () => {
    if (running) {
      logger.warn('ops resource agent tick skipped because previous tick is still running');
      return;
    }

    running = true;
    try {
      const inserted = await collectOpsResourceSnapshot(pool, logger);
      logger.info({ inserted }, 'ops resource snapshot collected');
    } finally {
      running = false;
    }
  };

  const interval = setInterval(() => {
    void tick().catch(error => {
      logger.error({ err: error }, 'ops resource agent tick failed');
    });
  }, intervalMs);

  await tick();

  const shutdown = async () => {
    clearInterval(interval);
    await pool.end();
    process.exit(0);
  };

  process.once('SIGTERM', () => {
    logger.info('ops resource agent received SIGTERM');
    void shutdown();
  });

  process.once('SIGINT', () => {
    logger.info('ops resource agent received SIGINT');
    void shutdown();
  });
}

void main();
