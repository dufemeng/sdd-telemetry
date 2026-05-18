import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddWorkItemDetectionFields1778769960000 implements MigrationInterface {
  name = 'AddWorkItemDetectionFields1778769960000';

  async up(queryRunner: QueryRunner): Promise<void> {
    if (
      (await tableExists(queryRunner, 'sdd_users')) &&
      !(await columnExists(queryRunner, 'sdd_users', 'requirements_root_path'))
    ) {
      await queryRunner.query(
        `ALTER TABLE \`sdd_users\`
         ADD COLUMN \`requirements_root_path\` VARCHAR(1024) NULL
         AFTER \`client_version\``,
      );
    }

    if (
      (await tableExists(queryRunner, 'sdd_skill_semantics')) &&
      !(await columnExists(queryRunner, 'sdd_skill_semantics', 'artifact_filename_patterns'))
    ) {
      await queryRunner.query(
        `ALTER TABLE \`sdd_skill_semantics\`
         ADD COLUMN \`artifact_filename_patterns\` JSON NULL
         AFTER \`description\``,
      );
    }
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    if (
      (await tableExists(queryRunner, 'sdd_skill_semantics')) &&
      (await columnExists(queryRunner, 'sdd_skill_semantics', 'artifact_filename_patterns'))
    ) {
      await queryRunner.query(
        `ALTER TABLE \`sdd_skill_semantics\`
         DROP COLUMN \`artifact_filename_patterns\``,
      );
    }
  }
}

async function tableExists(queryRunner: QueryRunner, tableName: string): Promise<boolean> {
  const rows = (await queryRunner.query(
    `SELECT 1
     FROM information_schema.tables
     WHERE table_schema = DATABASE()
       AND table_name = ?
     LIMIT 1`,
    [tableName],
  )) as unknown[];

  return rows.length > 0;
}

async function columnExists(
  queryRunner: QueryRunner,
  tableName: string,
  columnName: string,
): Promise<boolean> {
  const rows = (await queryRunner.query(
    `SELECT 1
     FROM information_schema.columns
     WHERE table_schema = DATABASE()
       AND table_name = ?
       AND column_name = ?
     LIMIT 1`,
    [tableName, columnName],
  )) as unknown[];

  return rows.length > 0;
}
