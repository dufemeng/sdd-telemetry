import type { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateSourceReferences1780000006000 implements MigrationInterface {
  name = 'CreateSourceReferences1780000006000';

  async up(queryRunner: QueryRunner): Promise<void> {
    if (await tableExists(queryRunner, 'source_references')) return;

    await queryRunner.query(`
      CREATE TABLE \`source_references\` (
        \`id\` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        \`reference_key\` CHAR(64) NOT NULL,
        \`interaction_id\` BIGINT UNSIGNED NULL,
        \`tool_call_id\` BIGINT UNSIGNED NULL,
        \`event_id\` CHAR(64) NULL,
        \`user_id\` BIGINT UNSIGNED NULL,
        \`session_id\` VARCHAR(191) NULL,
        \`prompt_id\` VARCHAR(191) NULL,
        \`action_type\` VARCHAR(32) NOT NULL,
        \`locator_type\` VARCHAR(32) NOT NULL,
        \`direction\` VARCHAR(16) NOT NULL,
        \`raw_locator\` VARCHAR(2048) NULL,
        \`normalized_locator\` VARCHAR(2048) NULL,
        \`normalized_locator_hash\` CHAR(64) NULL,
        \`mcp_server\` VARCHAR(191) NULL,
        \`mcp_tool_name\` VARCHAR(191) NULL,
        \`doc_id\` VARCHAR(191) NULL,
        \`url\` VARCHAR(2048) NULL,
        \`title\` VARCHAR(500) NULL,
        \`space_id\` VARCHAR(191) NULL,
        \`collection_id\` VARCHAR(191) NULL,
        \`doc_type\` VARCHAR(64) NULL,
        \`event_time\` DATETIME(3) NULL,
        \`evidence_json\` JSON NULL,
        \`rule_version\` VARCHAR(32) NOT NULL,
        \`gmt_create\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        \`gmt_modified\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`uk_source_references_reference_key\` (\`reference_key\`),
        KEY \`idx_source_references_interaction_id\` (\`interaction_id\`),
        KEY \`idx_source_references_tool_call_id\` (\`tool_call_id\`),
        KEY \`idx_source_references_event_id\` (\`event_id\`),
        KEY \`idx_source_references_user_id\` (\`user_id\`),
        KEY \`idx_source_references_session_id\` (\`session_id\`),
        KEY \`idx_source_references_prompt_id\` (\`prompt_id\`),
        KEY \`idx_source_references_action_type\` (\`action_type\`),
        KEY \`idx_source_references_locator_type\` (\`locator_type\`),
        KEY \`idx_source_references_direction\` (\`direction\`),
        KEY \`idx_source_references_normalized_locator_hash\` (\`normalized_locator_hash\`),
        KEY \`idx_source_references_doc_id\` (\`doc_id\`),
        KEY \`idx_source_references_event_time\` (\`event_time\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    if (await tableExists(queryRunner, 'source_references')) {
      await queryRunner.query(`DROP TABLE \`source_references\``);
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
