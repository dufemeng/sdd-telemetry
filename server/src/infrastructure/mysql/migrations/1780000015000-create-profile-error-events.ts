import type { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateProfileErrorEvents1780000015000 implements MigrationInterface {
  name = 'CreateProfileErrorEvents1780000015000';

  async up(queryRunner: QueryRunner): Promise<void> {
    if (await tableExists(queryRunner, 'profile_error_events')) return;

    await queryRunner.query(`
      CREATE TABLE \`profile_error_events\` (
        \`id\` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        \`profile_id\` VARCHAR(191) NOT NULL,
        \`projection_run_id\` BIGINT UNSIGNED NOT NULL,
        \`error_key\` CHAR(64) NOT NULL,
        \`category\` VARCHAR(64) NOT NULL,
        \`display_name\` VARCHAR(191) NOT NULL,
        \`severity\` VARCHAR(32) NOT NULL,
        \`source_kind\` VARCHAR(32) NOT NULL,
        \`source_scope\` VARCHAR(32) NULL,
        \`source_category\` VARCHAR(32) NULL,
        \`matched_rule_id\` VARCHAR(191) NULL,
        \`confidence\` VARCHAR(16) NULL,
        \`user_id\` BIGINT UNSIGNED NULL,
        \`session_id\` VARCHAR(191) NULL,
        \`prompt_id\` VARCHAR(191) NULL,
        \`interaction_id\` BIGINT UNSIGNED NULL,
        \`delivery_unit_id\` BIGINT UNSIGNED NULL,
        \`capability_usage_id\` BIGINT UNSIGNED NULL,
        \`tool_call_id\` BIGINT UNSIGNED NULL,
        \`sdd_error_id\` BIGINT UNSIGNED NULL,
        \`event_id\` CHAR(64) NULL,
        \`tool_name\` VARCHAR(128) NULL,
        \`error_type\` VARCHAR(128) NULL,
        \`error_message_hash\` CHAR(64) NULL,
        \`message_preview\` TEXT NULL,
        \`input_preview\` TEXT NULL,
        \`locator\` VARCHAR(2048) NULL,
        \`event_time\` DATETIME(3) NULL,
        \`evidence_json\` JSON NULL,
        \`rule_version\` VARCHAR(32) NOT NULL,
        \`gmt_create\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        \`gmt_modified\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`uk_profile_error_events_run_key\` (\`projection_run_id\`, \`error_key\`),
        KEY \`idx_profile_error_events_profile_run_time\` (\`profile_id\`, \`projection_run_id\`, \`event_time\`),
        KEY \`idx_profile_error_events_category_time\` (\`profile_id\`, \`projection_run_id\`, \`category\`, \`event_time\`),
        KEY \`idx_profile_error_events_delivery_unit\` (\`profile_id\`, \`projection_run_id\`, \`delivery_unit_id\`),
        KEY \`idx_profile_error_events_tool_name\` (\`profile_id\`, \`projection_run_id\`, \`tool_name\`),
        KEY \`idx_profile_error_events_tool_call\` (\`tool_call_id\`),
        KEY \`idx_profile_error_events_sdd_error\` (\`sdd_error_id\`),
        KEY \`idx_profile_error_events_interaction\` (\`interaction_id\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    if (await tableExists(queryRunner, 'profile_error_events')) {
      await queryRunner.query('DROP TABLE `profile_error_events`');
    }
  }
}

async function tableExists(qr: QueryRunner, table: string): Promise<boolean> {
  const rows = (await qr.query(
    `SELECT 1 FROM information_schema.tables WHERE table_schema=DATABASE() AND table_name=? LIMIT 1`,
    [table],
  )) as unknown[];
  return rows.length > 0;
}
