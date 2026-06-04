import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Profile projection 表（MVP-1，Task 2）。
 *
 * current-pointer 模型：每次 full rebuild 写入独立 projection_run_id 的明细行，
 * 完成后切换 profile_current_projection_runs 指针。因此明细表的唯一约束是
 * (projection_run_id, <业务 key>)——业务 key 值稳定，但行按 run 隔离，多 run 可并存。
 * 读路径只读当前指针指向的 run。
 */

const COMMON_TAIL = `
        \`matched_rule_id\` VARCHAR(191) NULL,
        \`confidence\` VARCHAR(16) NULL,
        \`evidence_json\` JSON NULL,
        \`rule_version\` VARCHAR(32) NOT NULL,
        \`gmt_create\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        \`gmt_modified\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),`;

export class CreateProfileProjection1780000007000 implements MigrationInterface {
  name = 'CreateProfileProjection1780000007000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await this.create(queryRunner, 'profile_projection_runs', `
        \`id\` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        \`profile_id\` VARCHAR(191) NOT NULL,
        \`run_type\` VARCHAR(16) NOT NULL,
        \`status\` VARCHAR(16) NOT NULL,
        \`started_at\` DATETIME(3) NULL,
        \`completed_at\` DATETIME(3) NULL,
        \`source_range_json\` JSON NULL,
        \`stats_json\` JSON NULL,
        \`error_message\` TEXT NULL,
        \`gmt_create\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        \`gmt_modified\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
        PRIMARY KEY (\`id\`),
        KEY \`idx_profile_projection_runs_profile_status\` (\`profile_id\`, \`status\`)`);

    await this.create(queryRunner, 'profile_current_projection_runs', `
        \`profile_id\` VARCHAR(191) NOT NULL,
        \`current_projection_run_id\` BIGINT UNSIGNED NOT NULL,
        \`gmt_create\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        \`gmt_modified\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
        PRIMARY KEY (\`profile_id\`),
        KEY \`idx_profile_current_run_id\` (\`current_projection_run_id\`)`);

    await this.create(queryRunner, 'profile_capability_usages', `
        \`id\` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        \`profile_id\` VARCHAR(191) NOT NULL,
        \`projection_run_id\` BIGINT UNSIGNED NOT NULL,
        \`usage_key\` CHAR(64) NOT NULL,
        \`interaction_id\` BIGINT UNSIGNED NULL,
        \`delivery_unit_id\` BIGINT UNSIGNED NULL,
        \`user_id\` BIGINT UNSIGNED NULL,
        \`session_id\` VARCHAR(191) NULL,
        \`prompt_id\` VARCHAR(191) NULL,
        \`raw_capability_name\` VARCHAR(191) NULL,
        \`capability_code\` VARCHAR(64) NULL,
        \`display_name\` VARCHAR(191) NULL,
        \`capability_source\` VARCHAR(32) NULL,
        \`status\` VARCHAR(32) NULL,
        \`event_time\` DATETIME(3) NULL,${COMMON_TAIL}
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`uk_profile_capability_usages_run_key\` (\`projection_run_id\`, \`usage_key\`),
        KEY \`idx_profile_capability_usages_profile_run\` (\`profile_id\`, \`projection_run_id\`),
        KEY \`idx_profile_capability_usages_interaction\` (\`interaction_id\`),
        KEY \`idx_profile_capability_usages_event_time\` (\`event_time\`)`);

    await this.create(queryRunner, 'profile_delivery_units', `
        \`id\` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        \`profile_id\` VARCHAR(191) NOT NULL,
        \`projection_run_id\` BIGINT UNSIGNED NOT NULL,
        \`delivery_unit_key\` CHAR(64) NOT NULL,
        \`source_reference_id\` BIGINT UNSIGNED NULL,
        \`source_reference_key\` CHAR(64) NULL,
        \`unit_type\` VARCHAR(32) NULL,
        \`business_domain\` VARCHAR(191) NULL,
        \`unit_slug\` VARCHAR(191) NULL,
        \`title\` VARCHAR(500) NULL,
        \`relative_dir_or_locator\` VARCHAR(2048) NULL,
        \`first_seen_at\` DATETIME(3) NULL,
        \`last_seen_at\` DATETIME(3) NULL,${COMMON_TAIL}
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`uk_profile_delivery_units_run_key\` (\`projection_run_id\`, \`delivery_unit_key\`),
        KEY \`idx_profile_delivery_units_profile_run\` (\`profile_id\`, \`projection_run_id\`)`);

    await this.create(queryRunner, 'profile_artifacts', `
        \`id\` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        \`profile_id\` VARCHAR(191) NOT NULL,
        \`projection_run_id\` BIGINT UNSIGNED NOT NULL,
        \`artifact_key\` CHAR(64) NOT NULL,
        \`delivery_unit_id\` BIGINT UNSIGNED NULL,
        \`source_reference_id\` BIGINT UNSIGNED NULL,
        \`artifact_type\` VARCHAR(64) NULL,
        \`artifact_locator\` VARCHAR(2048) NULL,
        \`artifact_title\` VARCHAR(500) NULL,
        \`system_module\` VARCHAR(191) NULL,
        \`first_seen_at\` DATETIME(3) NULL,
        \`last_seen_at\` DATETIME(3) NULL,${COMMON_TAIL}
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`uk_profile_artifacts_run_key\` (\`projection_run_id\`, \`artifact_key\`),
        KEY \`idx_profile_artifacts_profile_run\` (\`profile_id\`, \`projection_run_id\`),
        KEY \`idx_profile_artifacts_delivery_unit\` (\`delivery_unit_id\`)`);

    await this.create(queryRunner, 'profile_artifact_writes', `
        \`id\` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        \`profile_id\` VARCHAR(191) NOT NULL,
        \`projection_run_id\` BIGINT UNSIGNED NOT NULL,
        \`write_key\` CHAR(64) NOT NULL,
        \`artifact_id\` BIGINT UNSIGNED NULL,
        \`delivery_unit_id\` BIGINT UNSIGNED NULL,
        \`interaction_id\` BIGINT UNSIGNED NULL,
        \`capability_usage_id\` BIGINT UNSIGNED NULL,
        \`user_id\` BIGINT UNSIGNED NULL,
        \`session_id\` VARCHAR(191) NULL,
        \`prompt_id\` VARCHAR(191) NULL,
        \`event_id\` CHAR(64) NULL,
        \`write_kind\` VARCHAR(32) NULL,
        \`content_preview\` TEXT NULL,
        \`event_sequence\` INT UNSIGNED NULL,
        \`event_time\` DATETIME(3) NULL,${COMMON_TAIL}
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`uk_profile_artifact_writes_run_key\` (\`projection_run_id\`, \`write_key\`),
        KEY \`idx_profile_artifact_writes_profile_run\` (\`profile_id\`, \`projection_run_id\`),
        KEY \`idx_profile_artifact_writes_artifact_time\` (\`artifact_id\`, \`event_time\`)`);

    await this.create(queryRunner, 'profile_artifact_turns', `
        \`id\` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        \`profile_id\` VARCHAR(191) NOT NULL,
        \`projection_run_id\` BIGINT UNSIGNED NOT NULL,
        \`turn_key\` CHAR(64) NOT NULL,
        \`artifact_id\` BIGINT UNSIGNED NULL,
        \`delivery_unit_id\` BIGINT UNSIGNED NULL,
        \`interaction_id\` BIGINT UNSIGNED NULL,
        \`capability_usage_id\` BIGINT UNSIGNED NULL,
        \`user_id\` BIGINT UNSIGNED NULL,
        \`session_id\` VARCHAR(191) NULL,
        \`anchor_event_time\` DATETIME(3) NULL,
        \`write_event_time\` DATETIME(3) NULL,
        \`event_time\` DATETIME(3) NULL,${COMMON_TAIL}
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`uk_profile_artifact_turns_run_key\` (\`projection_run_id\`, \`turn_key\`),
        KEY \`idx_profile_artifact_turns_profile_run\` (\`profile_id\`, \`projection_run_id\`),
        KEY \`idx_profile_artifact_turns_artifact_time\` (\`artifact_id\`, \`event_time\`)`);

    await this.create(queryRunner, 'profile_knowledge_recalls', `
        \`id\` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        \`profile_id\` VARCHAR(191) NOT NULL,
        \`projection_run_id\` BIGINT UNSIGNED NOT NULL,
        \`recall_key\` CHAR(64) NOT NULL,
        \`source_reference_key\` CHAR(64) NOT NULL,
        \`source_reference_id\` BIGINT UNSIGNED NOT NULL,
        \`tool_call_id\` BIGINT UNSIGNED NULL,
        \`interaction_id\` BIGINT UNSIGNED NULL,
        \`capability_usage_id\` BIGINT UNSIGNED NULL,
        \`delivery_unit_id\` BIGINT UNSIGNED NULL,
        \`user_id\` BIGINT UNSIGNED NULL,
        \`session_id\` VARCHAR(191) NULL,
        \`prompt_id\` VARCHAR(191) NULL,
        \`action_type\` VARCHAR(32) NULL,
        \`knowledge_locator\` VARCHAR(2048) NULL,
        \`knowledge_domain\` VARCHAR(191) NULL,
        \`knowledge_axis\` VARCHAR(64) NULL,
        \`knowledge_system\` VARCHAR(191) NULL,
        \`event_time\` DATETIME(3) NULL,${COMMON_TAIL}
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`uk_profile_knowledge_recalls_run_key\` (\`projection_run_id\`, \`recall_key\`),
        KEY \`idx_profile_knowledge_recalls_profile_run\` (\`profile_id\`, \`projection_run_id\`),
        KEY \`idx_profile_knowledge_recalls_source_ref_key\` (\`source_reference_key\`),
        KEY \`idx_profile_knowledge_recalls_interaction\` (\`interaction_id\`)`);

    await this.create(queryRunner, 'profile_code_activities', `
        \`id\` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        \`profile_id\` VARCHAR(191) NOT NULL,
        \`projection_run_id\` BIGINT UNSIGNED NOT NULL,
        \`activity_key\` CHAR(64) NOT NULL,
        \`source_reference_key\` CHAR(64) NOT NULL,
        \`source_reference_id\` BIGINT UNSIGNED NOT NULL,
        \`tool_call_id\` BIGINT UNSIGNED NULL,
        \`interaction_id\` BIGINT UNSIGNED NULL,
        \`capability_usage_id\` BIGINT UNSIGNED NULL,
        \`delivery_unit_id\` BIGINT UNSIGNED NULL,
        \`user_id\` BIGINT UNSIGNED NULL,
        \`session_id\` VARCHAR(191) NULL,
        \`prompt_id\` VARCHAR(191) NULL,
        \`action_type\` VARCHAR(32) NULL,
        \`code_locator\` VARCHAR(2048) NULL,
        \`repo_name\` VARCHAR(191) NULL,
        \`module_name\` VARCHAR(191) NULL,
        \`repo_kind\` VARCHAR(32) NULL,
        \`event_time\` DATETIME(3) NULL,${COMMON_TAIL}
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`uk_profile_code_activities_run_key\` (\`projection_run_id\`, \`activity_key\`),
        KEY \`idx_profile_code_activities_profile_run\` (\`profile_id\`, \`projection_run_id\`),
        KEY \`idx_profile_code_activities_source_ref_key\` (\`source_reference_key\`)`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    for (const table of [
      'profile_code_activities',
      'profile_knowledge_recalls',
      'profile_artifact_turns',
      'profile_artifact_writes',
      'profile_artifacts',
      'profile_delivery_units',
      'profile_capability_usages',
      'profile_current_projection_runs',
      'profile_projection_runs',
    ]) {
      if (await tableExists(queryRunner, table)) {
        await queryRunner.query(`DROP TABLE \`${table}\``);
      }
    }
  }

  private async create(queryRunner: QueryRunner, table: string, body: string): Promise<void> {
    if (await tableExists(queryRunner, table)) return;
    await queryRunner.query(
      `CREATE TABLE \`${table}\` (${body}\n      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci`,
    );
  }
}

async function tableExists(qr: QueryRunner, t: string): Promise<boolean> {
  const rows = (await qr.query(
    `SELECT 1 FROM information_schema.tables WHERE table_schema=DATABASE() AND table_name=? LIMIT 1`,
    [t],
  )) as unknown[];
  return rows.length > 0;
}
