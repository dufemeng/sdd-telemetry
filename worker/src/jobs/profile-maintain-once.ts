import { createMysqlPool } from '../infrastructure/mysql/client';
import { createLogger } from '../support/logger';
import { runProfileMaintenanceOnce } from './profile-maintenance/projection-maintainer';

async function main(): Promise<void> {
  const pool = createMysqlPool();
  const logger = createLogger('profile-maintain-once');
  const workerId = `profile-maintain-once-${process.pid}-${Date.now()}`;
  try {
    const result = await runProfileMaintenanceOnce({
      pool,
      logger,
      workerId,
      maxJobs: Number(process.env.PROFILE_PROJECTION_MAX_JOBS_PER_TICK ?? 3),
    });
    console.info(JSON.stringify(result));
  } finally {
    await pool.end();
  }
}

void main();
