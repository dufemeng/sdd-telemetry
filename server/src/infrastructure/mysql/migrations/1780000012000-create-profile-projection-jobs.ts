import type { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateProfileProjectionJobs1780000012000 implements MigrationInterface {
  name = 'CreateProfileProjectionJobs1780000012000';

  async up(queryRunner: QueryRunner): Promise<void> {
    if (await tableExists(queryRunner, 'profile_projection_jobs')) return;

    await queryRunner.query(`
      CREATE TABLE \`profile_projection_jobs\` (
        \`profile_id\` VARCHAR(191) NOT NULL,
        \`status\` VARCHAR(32) NOT NULL,
        \`dirty_seq\` BIGINT UNSIGNED NOT NULL DEFAULT 0,
        \`running_dirty_seq\` BIGINT UNSIGNED NULL,
        \`dirty_since\` DATETIME(3) NULL,
        \`dirty_until\` DATETIME(3) NULL,
        \`dirty_reason\` VARCHAR(191) NULL,
        \`last_resolved_config_hash\` CHAR(64) NULL,
        \`attempts\` INT UNSIGNED NOT NULL DEFAULT 0,
        \`max_attempts\` INT UNSIGNED NOT NULL DEFAULT 20,
        \`next_retry_at\` DATETIME(3) NULL,
        \`locked_by\` VARCHAR(191) NULL,
        \`locked_until\` DATETIME(3) NULL,
        \`last_started_at\` DATETIME(3) NULL,
        \`last_completed_at\` DATETIME(3) NULL,
        \`last_projection_run_id\` BIGINT UNSIGNED NULL,
        \`last_error\` LONGTEXT NULL,
        \`gmt_create\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        \`gmt_modified\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
        PRIMARY KEY (\`profile_id\`),
        KEY \`idx_profile_projection_jobs_status_retry\` (\`status\`, \`next_retry_at\`),
        KEY \`idx_profile_projection_jobs_locked_until\` (\`locked_until\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    if (await tableExists(queryRunner, 'profile_projection_jobs')) {
      await queryRunner.query(`DROP TABLE \`profile_projection_jobs\``);
    }
  }
}

async function tableExists(qr: QueryRunner, t: string): Promise<boolean> {
  const rows = (await qr.query(
    `SELECT 1 FROM information_schema.tables WHERE table_schema=DATABASE() AND table_name=? LIMIT 1`,
    [t],
  )) as unknown[];
  return rows.length > 0;
}
