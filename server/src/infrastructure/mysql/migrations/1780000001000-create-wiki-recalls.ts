import type { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateWikiRecalls1780000001000 implements MigrationInterface {
  name = 'CreateWikiRecalls1780000001000';

  async up(queryRunner: QueryRunner): Promise<void> {
    if (await tableExists(queryRunner, 'sdd_wiki_recalls')) return;

    await queryRunner.query(`
      CREATE TABLE \`sdd_wiki_recalls\` (
        \`id\` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        \`recall_key\` CHAR(64) NOT NULL,
        \`tool_call_id\` BIGINT UNSIGNED NOT NULL,
        \`interaction_id\` BIGINT UNSIGNED NOT NULL,
        \`skill_usage_id\` BIGINT UNSIGNED NULL,
        \`work_item_id\` BIGINT UNSIGNED NULL,
        \`user_id\` BIGINT UNSIGNED NULL,
        \`action_type\` VARCHAR(32) NOT NULL,
        \`raw_path\` VARCHAR(2048) NOT NULL,
        \`wiki_relative_path\` VARCHAR(1024) NULL,
        \`wiki_domain\` VARCHAR(191) NULL,
        \`wiki_axis\` VARCHAR(64) NULL,
        \`wiki_system\` VARCHAR(191) NULL,
        \`event_id\` CHAR(64) NULL,
        \`event_sequence\` INT UNSIGNED NULL,
        \`event_time\` DATETIME(3) NULL,
        \`rule_version\` VARCHAR(32) NOT NULL,
        \`gmt_create\` DATETIME(3) NOT NULL,
        \`gmt_modified\` DATETIME(3) NOT NULL,
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`uk_recall_key\` (\`recall_key\`),
        KEY \`idx_recalls_tool_call_id\` (\`tool_call_id\`),
        KEY \`idx_recalls_interaction_id\` (\`interaction_id\`),
        KEY \`idx_recalls_skill_usage_id\` (\`skill_usage_id\`),
        KEY \`idx_recalls_work_item_id\` (\`work_item_id\`),
        KEY \`idx_recalls_user_event_time\` (\`user_id\`, \`event_time\` DESC),
        KEY \`idx_recalls_relative_path\` (\`wiki_relative_path\`(255)),
        KEY \`idx_recalls_domain\` (\`wiki_domain\`),
        KEY \`idx_recalls_axis\` (\`wiki_axis\`),
        KEY \`idx_recalls_system\` (\`wiki_system\`),
        KEY \`idx_recalls_action_type\` (\`action_type\`),
        KEY \`idx_recalls_event_time\` (\`event_time\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    if (await tableExists(queryRunner, 'sdd_wiki_recalls')) {
      await queryRunner.query(`DROP TABLE \`sdd_wiki_recalls\``);
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
