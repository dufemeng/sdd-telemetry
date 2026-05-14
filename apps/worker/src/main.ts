import { createLogger } from './support/logger';

const logger = createLogger('worker');

async function main(): Promise<void> {
  logger.info('sdd-monitor worker bootstrap ready');
  logger.info('outbox dispatcher and cleaning worker will be implemented in Milestone 3/4');
}

process.on('SIGTERM', () => {
  logger.info('worker received SIGTERM');
  process.exit(0);
});

process.on('SIGINT', () => {
  logger.info('worker received SIGINT');
  process.exit(0);
});

void main();
