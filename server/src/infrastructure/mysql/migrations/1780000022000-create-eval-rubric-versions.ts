import type { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateEvalRubricVersions1780000022000 implements MigrationInterface {
  name = 'CreateEvalRubricVersions1780000022000';

  async up(queryRunner: QueryRunner): Promise<void> {
    if (await tableExists(queryRunner, 'eval_rubric_versions')) return;

    await queryRunner.query(`
      CREATE TABLE \`eval_rubric_versions\` (
        \`id\` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        \`profile_id\` VARCHAR(191) NOT NULL,
        \`artifact_type\` VARCHAR(64) NOT NULL,
        \`version_no\` INT UNSIGNED NOT NULL,
        \`version_status\` VARCHAR(32) NOT NULL,
        \`rubric_json\` JSON NOT NULL,
        \`definition_hash\` CHAR(64) NOT NULL,
        \`created_by\` BIGINT UNSIGNED NULL,
        \`published_at\` DATETIME(3) NULL,
        \`gmt_create\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        \`gmt_modified\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`uk_eval_rubric_versions_no\` (\`profile_id\`, \`artifact_type\`, \`version_no\`),
        KEY \`idx_eval_rubric_versions_active\` (\`profile_id\`, \`artifact_type\`, \`version_status\`, \`version_no\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    if (await tableExists(queryRunner, 'eval_rubric_versions')) {
      await queryRunner.query('DROP TABLE `eval_rubric_versions`');
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
