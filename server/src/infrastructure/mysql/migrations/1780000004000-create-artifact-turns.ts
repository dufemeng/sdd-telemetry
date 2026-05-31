import type { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateArtifactTurns1780000004000 implements MigrationInterface {
  name = 'CreateArtifactTurns1780000004000';

  async up(queryRunner: QueryRunner): Promise<void> {
    if (await tableExists(queryRunner, 'sdd_work_item_artifact_turns')) return;

    await queryRunner.query(`
      CREATE TABLE \`sdd_work_item_artifact_turns\` (
        \`id\` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        \`turn_key\` CHAR(64) NOT NULL,
        \`artifact_id\` BIGINT UNSIGNED NOT NULL,
        \`work_item_id\` BIGINT UNSIGNED NOT NULL,
        \`interaction_id\` BIGINT UNSIGNED NOT NULL,
        \`skill_usage_id\` BIGINT UNSIGNED NULL,
        \`user_id\` BIGINT UNSIGNED NULL,
        \`session_id\` VARCHAR(191) NULL,
        \`anchor_event_time\` DATETIME(3) NULL,
        \`write_event_time\` DATETIME(3) NULL,
        \`event_time\` DATETIME(3) NULL,
        \`rule_version\` VARCHAR(32) NOT NULL,
        \`gmt_create\` DATETIME(3) NOT NULL,
        \`gmt_modified\` DATETIME(3) NOT NULL,
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`uk_artifact_turn_key\` (\`turn_key\`),
        KEY \`idx_artifact_turns_artifact_event_time\` (\`artifact_id\`, \`event_time\`),
        KEY \`idx_artifact_turns_work_item_id\` (\`work_item_id\`),
        KEY \`idx_artifact_turns_interaction_id\` (\`interaction_id\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    if (await tableExists(queryRunner, 'sdd_work_item_artifact_turns')) {
      await queryRunner.query(`DROP TABLE \`sdd_work_item_artifact_turns\``);
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
