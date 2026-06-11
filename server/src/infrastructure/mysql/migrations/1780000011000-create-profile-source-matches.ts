import type { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateProfileSourceMatches1780000011000 implements MigrationInterface {
  name = 'CreateProfileSourceMatches1780000011000';

  async up(queryRunner: QueryRunner): Promise<void> {
    if (await tableExists(queryRunner, 'profile_source_matches')) return;

    await queryRunner.query(`
      CREATE TABLE \`profile_source_matches\` (
        \`id\` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        \`profile_id\` VARCHAR(191) NOT NULL,
        \`source_reference_id\` BIGINT UNSIGNED NOT NULL,
        \`source_reference_key\` CHAR(64) NOT NULL,
        \`matched_rule_id\` VARCHAR(191) NOT NULL,
        \`category\` VARCHAR(32) NOT NULL,
        \`action_type\` VARCHAR(32) NOT NULL,
        \`locator_type\` VARCHAR(32) NOT NULL,
        \`normalized_locator\` VARCHAR(2048) NULL,
        \`relative_locator\` VARCHAR(2048) NULL,
        \`resource_id\` VARCHAR(2048) NULL,
        \`source_namespace\` VARCHAR(191) NULL,
        \`confidence\` VARCHAR(16) NULL,
        \`ambiguous\` TINYINT(1) NOT NULL DEFAULT 0,
        \`metadata_json\` JSON NULL,
        \`rule_version\` VARCHAR(32) NOT NULL,
        \`source_event_time\` DATETIME(3) NULL,
        \`gmt_create\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        \`gmt_modified\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`uk_profile_source_matches_ref\` (\`profile_id\`, \`source_reference_key\`),
        KEY \`idx_profile_source_matches_profile_id\` (\`profile_id\`),
        KEY \`idx_profile_source_matches_source_ref_id\` (\`source_reference_id\`),
        KEY \`idx_profile_source_matches_rule\` (\`profile_id\`, \`matched_rule_id\`),
        KEY \`idx_profile_source_matches_event_time\` (\`source_event_time\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    if (await tableExists(queryRunner, 'profile_source_matches')) {
      await queryRunner.query(`DROP TABLE \`profile_source_matches\``);
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
