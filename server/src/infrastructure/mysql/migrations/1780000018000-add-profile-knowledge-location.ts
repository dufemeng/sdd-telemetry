import type { MigrationInterface, QueryRunner } from 'typeorm';

const TABLE = 'profile_knowledge_recalls';

export class AddProfileKnowledgeLocation1780000018000 implements MigrationInterface {
  name = 'AddProfileKnowledgeLocation1780000018000';

  async up(queryRunner: QueryRunner): Promise<void> {
    if (!(await columnExists(queryRunner, 'source_namespace'))) {
      await queryRunner.query(
        `ALTER TABLE \`${TABLE}\` ADD COLUMN \`source_namespace\` VARCHAR(191) NULL AFTER \`knowledge_locator\``,
      );
    }
    if (!(await columnExists(queryRunner, 'relative_path'))) {
      await queryRunner.query(
        `ALTER TABLE \`${TABLE}\` ADD COLUMN \`relative_path\` VARCHAR(2048) NULL AFTER \`source_namespace\``,
      );
    }

    await queryRunner.query(
      `UPDATE \`${TABLE}\`
       SET source_namespace = COALESCE(
             NULLIF(JSON_UNQUOTE(JSON_EXTRACT(evidence_json, '$.sourceNamespace')), ''),
             'local'
           ),
           relative_path = COALESCE(
             NULLIF(JSON_UNQUOTE(JSON_EXTRACT(evidence_json, '$.relativeLocator')), ''),
             NULLIF(JSON_UNQUOTE(JSON_EXTRACT(evidence_json, '$.relative')), ''),
             NULLIF(JSON_UNQUOTE(JSON_EXTRACT(evidence_json, '$.resourceId')), ''),
             knowledge_locator,
             ''
           )
       WHERE source_namespace IS NULL OR relative_path IS NULL`,
    );

    await queryRunner.query(
      `ALTER TABLE \`${TABLE}\`
       MODIFY COLUMN \`source_namespace\` VARCHAR(191) NOT NULL,
       MODIFY COLUMN \`relative_path\` VARCHAR(2048) NOT NULL`,
    );
    if (!(await indexExists(queryRunner, 'idx_pkr_run_source'))) {
      await queryRunner.query(
        `ALTER TABLE \`${TABLE}\` ADD INDEX \`idx_pkr_run_source\` (\`profile_id\`, \`projection_run_id\`, \`source_namespace\`)`,
      );
    }
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    if (await indexExists(queryRunner, 'idx_pkr_run_source')) {
      await queryRunner.query(`ALTER TABLE \`${TABLE}\` DROP INDEX \`idx_pkr_run_source\``);
    }
    if (await columnExists(queryRunner, 'relative_path')) {
      await queryRunner.query(`ALTER TABLE \`${TABLE}\` DROP COLUMN \`relative_path\``);
    }
    if (await columnExists(queryRunner, 'source_namespace')) {
      await queryRunner.query(`ALTER TABLE \`${TABLE}\` DROP COLUMN \`source_namespace\``);
    }
  }
}

async function columnExists(queryRunner: QueryRunner, column: string): Promise<boolean> {
  const rows = (await queryRunner.query(
    'SELECT 1 FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name=? AND column_name=? LIMIT 1',
    [TABLE, column],
  )) as unknown[];
  return rows.length > 0;
}

async function indexExists(queryRunner: QueryRunner, index: string): Promise<boolean> {
  const rows = (await queryRunner.query(
    'SELECT 1 FROM information_schema.statistics WHERE table_schema=DATABASE() AND table_name=? AND index_name=? LIMIT 1',
    [TABLE, index],
  )) as unknown[];
  return rows.length > 0;
}
