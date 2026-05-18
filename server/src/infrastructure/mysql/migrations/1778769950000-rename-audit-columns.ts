import type { MigrationInterface, QueryRunner } from 'typeorm';

export class RenameAuditColumns1778769950000 implements MigrationInterface {
  name = 'RenameAuditColumns1778769950000';

  async up(queryRunner: QueryRunner): Promise<void> {
    for (const tableName of auditTables) {
      if (!(await tableExists(queryRunner, tableName))) {
        continue;
      }

      if (
        (await columnExists(queryRunner, tableName, 'created_at')) &&
        !(await columnExists(queryRunner, tableName, 'gmt_create'))
      ) {
        await queryRunner.query(
          `ALTER TABLE \`${tableName}\`
           CHANGE COLUMN \`created_at\` \`gmt_create\`
           DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)`,
        );
      } else if (!(await columnExists(queryRunner, tableName, 'gmt_create'))) {
        await queryRunner.query(
          `ALTER TABLE \`${tableName}\`
           ADD COLUMN \`gmt_create\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)`,
        );
      }

      if (
        (await columnExists(queryRunner, tableName, 'updated_at')) &&
        !(await columnExists(queryRunner, tableName, 'gmt_modified'))
      ) {
        await queryRunner.query(
          `ALTER TABLE \`${tableName}\`
           CHANGE COLUMN \`updated_at\` \`gmt_modified\`
           DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)`,
        );
      } else if (!(await columnExists(queryRunner, tableName, 'gmt_modified'))) {
        await queryRunner.query(
          `ALTER TABLE \`${tableName}\`
           ADD COLUMN \`gmt_modified\`
           DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)
           AFTER \`gmt_create\``,
        );
      }
    }
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    for (const tableName of auditTables) {
      if (!(await tableExists(queryRunner, tableName))) {
        continue;
      }

      if (
        (await columnExists(queryRunner, tableName, 'gmt_create')) &&
        !(await columnExists(queryRunner, tableName, 'created_at'))
      ) {
        await queryRunner.query(
          `ALTER TABLE \`${tableName}\`
           CHANGE COLUMN \`gmt_create\` \`created_at\`
           DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)`,
        );
      }

      if (
        (await columnExists(queryRunner, tableName, 'gmt_modified')) &&
        !(await columnExists(queryRunner, tableName, 'updated_at'))
      ) {
        await queryRunner.query(
          `ALTER TABLE \`${tableName}\`
           CHANGE COLUMN \`gmt_modified\` \`updated_at\`
           DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)`,
        );
      }
    }
  }
}

const auditTables = [
  'sdd_users',
  'sdd_skill_semantics',
  'sdd_skill_aliases',
  'otel_ingest_batches',
  'otel_raw_payloads',
  'ingest_outbox',
  'otel_log_events',
  'sdd_interactions',
  'sdd_interaction_texts',
  'sdd_skill_usages',
  'sdd_work_items',
  'sdd_work_item_artifacts',
  'sdd_errors',
];

async function tableExists(queryRunner: QueryRunner, tableName: string): Promise<boolean> {
  const rows = await queryRunner.query(
    `SELECT 1
     FROM information_schema.tables
     WHERE table_schema = DATABASE()
       AND table_name = ?
     LIMIT 1`,
    [tableName],
  ) as unknown[];

  return rows.length > 0;
}

async function columnExists(
  queryRunner: QueryRunner,
  tableName: string,
  columnName: string,
): Promise<boolean> {
  const rows = await queryRunner.query(
    `SELECT 1
     FROM information_schema.columns
     WHERE table_schema = DATABASE()
       AND table_name = ?
       AND column_name = ?
     LIMIT 1`,
    [tableName, columnName],
  ) as unknown[];

  return rows.length > 0;
}
