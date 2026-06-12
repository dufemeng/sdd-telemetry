import type { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateProfileConfigs1780000013000 implements MigrationInterface {
  name = 'CreateProfileConfigs1780000013000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await this.createProfileConfigs(queryRunner);
    await this.createProfileConfigVersions(queryRunner);
    await this.createProfileConfigEvents(queryRunner);
    await this.addProjectionVersionColumns(queryRunner);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await dropIndexIfExists(queryRunner, 'profile_source_matches', 'idx_profile_source_matches_config_version');
    await dropIndexIfExists(queryRunner, 'profile_projection_jobs', 'idx_profile_projection_jobs_target_version');
    await dropIndexIfExists(queryRunner, 'profile_projection_runs', 'idx_profile_projection_runs_config_version');

    await dropColumnIfExists(queryRunner, 'profile_source_matches', 'profile_config_version_id');
    await dropColumnIfExists(queryRunner, 'profile_projection_jobs', 'target_config_version_id');
    await dropColumnIfExists(queryRunner, 'profile_projection_jobs', 'last_profile_config_version_id');
    await dropColumnIfExists(queryRunner, 'profile_projection_runs', 'profile_config_version_id');
    await dropColumnIfExists(queryRunner, 'profile_projection_runs', 'projection_definition_hash');
    await dropColumnIfExists(queryRunner, 'profile_projection_runs', 'resolved_config_hash');

    for (const table of ['profile_config_events', 'profile_config_versions', 'profile_configs']) {
      if (await tableExists(queryRunner, table)) {
        await queryRunner.query(`DROP TABLE \`${table}\``);
      }
    }
  }

  private async createProfileConfigs(queryRunner: QueryRunner): Promise<void> {
    if (await tableExists(queryRunner, 'profile_configs')) return;

    await queryRunner.query(`
      CREATE TABLE \`profile_configs\` (
        \`profile_id\` VARCHAR(191) NOT NULL,
        \`display_name\` VARCHAR(191) NOT NULL,
        \`status\` VARCHAR(32) NOT NULL,
        \`projection_mode\` VARCHAR(32) NOT NULL,
        \`origin\` VARCHAR(32) NOT NULL,
        \`published_version_id\` BIGINT UNSIGNED NULL,
        \`draft_version_id\` BIGINT UNSIGNED NULL,
        \`archived_at\` DATETIME(3) NULL,
        \`gmt_create\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        \`gmt_modified\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
        PRIMARY KEY (\`profile_id\`),
        KEY \`idx_profile_configs_status\` (\`status\`),
        KEY \`idx_profile_configs_origin\` (\`origin\`),
        KEY \`idx_profile_configs_published_version\` (\`published_version_id\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
    `);
  }

  private async createProfileConfigVersions(queryRunner: QueryRunner): Promise<void> {
    if (await tableExists(queryRunner, 'profile_config_versions')) return;

    await queryRunner.query(`
      CREATE TABLE \`profile_config_versions\` (
        \`id\` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        \`profile_id\` VARCHAR(191) NOT NULL,
        \`version_no\` INT UNSIGNED NOT NULL,
        \`version_status\` VARCHAR(32) NOT NULL,
        \`config_json\` JSON NOT NULL,
        \`definition_hash\` CHAR(64) NOT NULL,
        \`created_by_user_id\` BIGINT UNSIGNED NULL,
        \`created_reason\` VARCHAR(191) NULL,
        \`published_at\` DATETIME(3) NULL,
        \`published_by_user_id\` BIGINT UNSIGNED NULL,
        \`notes\` TEXT NULL,
        \`gmt_create\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        \`gmt_modified\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`uk_profile_config_versions_no\` (\`profile_id\`, \`version_no\`),
        KEY \`idx_profile_config_versions_profile_status\` (\`profile_id\`, \`version_status\`),
        KEY \`idx_profile_config_versions_hash\` (\`definition_hash\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
    `);
  }

  private async createProfileConfigEvents(queryRunner: QueryRunner): Promise<void> {
    if (await tableExists(queryRunner, 'profile_config_events')) return;

    await queryRunner.query(`
      CREATE TABLE \`profile_config_events\` (
        \`id\` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        \`profile_id\` VARCHAR(191) NOT NULL,
        \`profile_config_version_id\` BIGINT UNSIGNED NULL,
        \`event_type\` VARCHAR(64) NOT NULL,
        \`actor_user_id\` BIGINT UNSIGNED NULL,
        \`event_json\` JSON NULL,
        \`gmt_create\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        PRIMARY KEY (\`id\`),
        KEY \`idx_profile_config_events_profile_time\` (\`profile_id\`, \`gmt_create\`),
        KEY \`idx_profile_config_events_version\` (\`profile_config_version_id\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
    `);
  }

  private async addProjectionVersionColumns(queryRunner: QueryRunner): Promise<void> {
    await addColumnIfMissing(
      queryRunner,
      'profile_projection_runs',
      'profile_config_version_id',
      '`profile_config_version_id` BIGINT UNSIGNED NULL AFTER `profile_id`',
    );
    await addColumnIfMissing(
      queryRunner,
      'profile_projection_runs',
      'projection_definition_hash',
      '`projection_definition_hash` CHAR(64) NULL AFTER `source_range_json`',
    );
    await addColumnIfMissing(
      queryRunner,
      'profile_projection_runs',
      'resolved_config_hash',
      '`resolved_config_hash` CHAR(64) NULL AFTER `projection_definition_hash`',
    );
    await addIndexIfMissing(
      queryRunner,
      'profile_projection_runs',
      'idx_profile_projection_runs_config_version',
      'KEY `idx_profile_projection_runs_config_version` (`profile_config_version_id`)',
    );

    await addColumnIfMissing(
      queryRunner,
      'profile_projection_jobs',
      'target_config_version_id',
      '`target_config_version_id` BIGINT UNSIGNED NULL AFTER `profile_id`',
    );
    await addColumnIfMissing(
      queryRunner,
      'profile_projection_jobs',
      'last_profile_config_version_id',
      '`last_profile_config_version_id` BIGINT UNSIGNED NULL AFTER `last_projection_run_id`',
    );
    await addIndexIfMissing(
      queryRunner,
      'profile_projection_jobs',
      'idx_profile_projection_jobs_target_version',
      'KEY `idx_profile_projection_jobs_target_version` (`target_config_version_id`)',
    );

    await addColumnIfMissing(
      queryRunner,
      'profile_source_matches',
      'profile_config_version_id',
      '`profile_config_version_id` BIGINT UNSIGNED NULL AFTER `profile_id`',
    );
    await addIndexIfMissing(
      queryRunner,
      'profile_source_matches',
      'idx_profile_source_matches_config_version',
      'KEY `idx_profile_source_matches_config_version` (`profile_config_version_id`)',
    );
  }
}

async function addColumnIfMissing(
  queryRunner: QueryRunner,
  table: string,
  column: string,
  ddl: string,
): Promise<void> {
  if (!(await tableExists(queryRunner, table))) return;
  if (await columnExists(queryRunner, table, column)) return;
  await queryRunner.query(`ALTER TABLE \`${table}\` ADD COLUMN ${ddl}`);
}

async function dropColumnIfExists(
  queryRunner: QueryRunner,
  table: string,
  column: string,
): Promise<void> {
  if (!(await tableExists(queryRunner, table))) return;
  if (!(await columnExists(queryRunner, table, column))) return;
  await queryRunner.query(`ALTER TABLE \`${table}\` DROP COLUMN \`${column}\``);
}

async function addIndexIfMissing(
  queryRunner: QueryRunner,
  table: string,
  index: string,
  ddl: string,
): Promise<void> {
  if (!(await tableExists(queryRunner, table))) return;
  if (await indexExists(queryRunner, table, index)) return;
  await queryRunner.query(`ALTER TABLE \`${table}\` ADD ${ddl}`);
}

async function dropIndexIfExists(
  queryRunner: QueryRunner,
  table: string,
  index: string,
): Promise<void> {
  if (!(await tableExists(queryRunner, table))) return;
  if (!(await indexExists(queryRunner, table, index))) return;
  await queryRunner.query(`ALTER TABLE \`${table}\` DROP INDEX \`${index}\``);
}

async function tableExists(queryRunner: QueryRunner, table: string): Promise<boolean> {
  const rows = (await queryRunner.query(
    `SELECT 1 FROM information_schema.tables WHERE table_schema=DATABASE() AND table_name=? LIMIT 1`,
    [table],
  )) as unknown[];
  return rows.length > 0;
}

async function columnExists(queryRunner: QueryRunner, table: string, column: string): Promise<boolean> {
  const rows = (await queryRunner.query(
    `SELECT 1 FROM information_schema.columns
     WHERE table_schema=DATABASE() AND table_name=? AND column_name=? LIMIT 1`,
    [table, column],
  )) as unknown[];
  return rows.length > 0;
}

async function indexExists(queryRunner: QueryRunner, table: string, index: string): Promise<boolean> {
  const rows = (await queryRunner.query(
    `SELECT 1 FROM information_schema.statistics
     WHERE table_schema=DATABASE() AND table_name=? AND index_name=? LIMIT 1`,
    [table, index],
  )) as unknown[];
  return rows.length > 0;
}
