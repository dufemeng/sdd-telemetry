import type { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateArtifactWrites1780000003000 implements MigrationInterface {
  name = 'CreateArtifactWrites1780000003000';

  async up(queryRunner: QueryRunner): Promise<void> {
    if (await tableExists(queryRunner, 'sdd_work_item_artifact_writes')) return;

    await queryRunner.query(`
      CREATE TABLE \`sdd_work_item_artifact_writes\` (
        \`id\` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        \`write_key\` CHAR(64) NOT NULL,
        \`artifact_id\` BIGINT UNSIGNED NOT NULL,
        \`work_item_id\` BIGINT UNSIGNED NOT NULL,
        \`interaction_id\` BIGINT UNSIGNED NULL,
        \`skill_usage_id\` BIGINT UNSIGNED NULL,
        \`user_id\` BIGINT UNSIGNED NULL,
        \`session_id\` VARCHAR(191) NULL,
        \`prompt_id\` VARCHAR(191) NULL,
        \`event_id\` CHAR(64) NULL,
        \`write_kind\` VARCHAR(32) NOT NULL,
        \`content_preview\` TEXT NULL,
        \`event_sequence\` INT UNSIGNED NULL,
        \`event_time\` DATETIME(3) NULL,
        \`rule_version\` VARCHAR(32) NOT NULL,
        \`gmt_create\` DATETIME(3) NOT NULL,
        \`gmt_modified\` DATETIME(3) NOT NULL,
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`uk_artifact_write_key\` (\`write_key\`),
        KEY \`idx_artifact_writes_artifact_event_time\` (\`artifact_id\`, \`event_time\`),
        KEY \`idx_artifact_writes_work_item_id\` (\`work_item_id\`),
        KEY \`idx_artifact_writes_interaction_id\` (\`interaction_id\`),
        KEY \`idx_artifact_writes_skill_usage_id\` (\`skill_usage_id\`),
        KEY \`idx_artifact_writes_event_time\` (\`event_time\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    if (await tableExists(queryRunner, 'sdd_work_item_artifact_writes')) {
      await queryRunner.query(`DROP TABLE \`sdd_work_item_artifact_writes\``);
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
