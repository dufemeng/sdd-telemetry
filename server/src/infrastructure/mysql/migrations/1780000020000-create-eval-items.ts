import type { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateEvalItems1780000020000 implements MigrationInterface {
  name = 'CreateEvalItems1780000020000';

  async up(queryRunner: QueryRunner): Promise<void> {
    if (await tableExists(queryRunner, 'eval_items')) return;
    await queryRunner.query(`
      CREATE TABLE \`eval_items\` (
        \`id\` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        \`item_key\` CHAR(64) NOT NULL,
        \`profile_id\` VARCHAR(191) NOT NULL,
        \`source\` VARCHAR(32) NOT NULL,
        \`origin_interaction_id\` BIGINT UNSIGNED NULL,
        \`origin_prompt_id\` VARCHAR(191) NULL,
        \`origin_projection_run_id\` BIGINT UNSIGNED NULL,
        \`origin_capability_code\` VARCHAR(64) NULL,
        \`origin_raw_capability_name\` VARCHAR(191) NULL,
        \`target_skill\` VARCHAR(191) NULL,
        \`target_artifact_type\` VARCHAR(64) NULL,
        \`prompt_text\` LONGTEXT NULL,
        \`title\` VARCHAR(500) NULL,
        \`notes\` TEXT NULL,
        \`enabled\` TINYINT(1) NOT NULL DEFAULT 1,
        \`occurrence_count\` INT UNSIGNED NOT NULL DEFAULT 0,
        \`first_observed_at\` DATETIME(3) NULL,
        \`last_observed_at\` DATETIME(3) NULL,
        \`last_imported_at\` DATETIME(3) NULL,
        \`deleted_at\` DATETIME(3) NULL,
        \`deleted_by_user_id\` BIGINT UNSIGNED NULL,
        \`gmt_create\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        \`gmt_modified\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`uk_eval_items_item_key\` (\`item_key\`),
        KEY \`idx_eval_items_profile_modified\` (\`profile_id\`, \`deleted_at\`, \`gmt_modified\`, \`id\`),
        KEY \`idx_eval_items_profile_capability\` (\`profile_id\`, \`deleted_at\`, \`origin_capability_code\`, \`enabled\`),
        KEY \`idx_eval_items_profile_skill\` (\`profile_id\`, \`deleted_at\`, \`target_skill\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    if (await tableExists(queryRunner, 'eval_items')) {
      await queryRunner.query(`DROP TABLE \`eval_items\``);
    }
  }
}

async function tableExists(queryRunner: QueryRunner, table: string): Promise<boolean> {
  const rows = (await queryRunner.query(
    `SELECT 1 FROM information_schema.tables WHERE table_schema=DATABASE() AND table_name=? LIMIT 1`,
    [table],
  )) as unknown[];
  return rows.length > 0;
}
