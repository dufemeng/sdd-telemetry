import type { MigrationInterface, QueryRunner } from 'typeorm';

const TABLE = 'profile_knowledge_recalls';
const COLUMNS = ['knowledge_domain', 'knowledge_axis', 'knowledge_system'] as const;

export class DropProfileKnowledgeDimensions1780000016000 implements MigrationInterface {
  name = 'DropProfileKnowledgeDimensions1780000016000';

  async up(queryRunner: QueryRunner): Promise<void> {
    if (!(await tableExists(queryRunner, TABLE))) return;
    if (await indexExists(queryRunner, TABLE, 'idx_pkr_run_domain')) {
      await queryRunner.query(`ALTER TABLE \`${TABLE}\` DROP INDEX \`idx_pkr_run_domain\``);
    }
    for (const column of COLUMNS) {
      if (await columnExists(queryRunner, TABLE, column)) {
        await queryRunner.query(`ALTER TABLE \`${TABLE}\` DROP COLUMN \`${column}\``);
      }
    }
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    if (!(await tableExists(queryRunner, TABLE))) return;
    if (!(await columnExists(queryRunner, TABLE, 'knowledge_domain'))) {
      await queryRunner.query(
        `ALTER TABLE \`${TABLE}\` ADD COLUMN \`knowledge_domain\` VARCHAR(191) NULL AFTER \`knowledge_locator\``,
      );
    }
    if (!(await columnExists(queryRunner, TABLE, 'knowledge_axis'))) {
      await queryRunner.query(
        `ALTER TABLE \`${TABLE}\` ADD COLUMN \`knowledge_axis\` VARCHAR(64) NULL AFTER \`knowledge_domain\``,
      );
    }
    if (!(await columnExists(queryRunner, TABLE, 'knowledge_system'))) {
      await queryRunner.query(
        `ALTER TABLE \`${TABLE}\` ADD COLUMN \`knowledge_system\` VARCHAR(191) NULL AFTER \`knowledge_axis\``,
      );
    }
    if (!(await indexExists(queryRunner, TABLE, 'idx_pkr_run_domain'))) {
      await queryRunner.query(
        `ALTER TABLE \`${TABLE}\` ADD INDEX \`idx_pkr_run_domain\` (\`profile_id\`, \`projection_run_id\`, \`knowledge_domain\`)`,
      );
    }
  }
}

async function tableExists(queryRunner: QueryRunner, table: string): Promise<boolean> {
  const rows = (await queryRunner.query(
    'SELECT 1 FROM information_schema.tables WHERE table_schema=DATABASE() AND table_name=? LIMIT 1',
    [table],
  )) as unknown[];
  return rows.length > 0;
}

async function columnExists(
  queryRunner: QueryRunner,
  table: string,
  column: string,
): Promise<boolean> {
  const rows = (await queryRunner.query(
    'SELECT 1 FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name=? AND column_name=? LIMIT 1',
    [table, column],
  )) as unknown[];
  return rows.length > 0;
}

async function indexExists(
  queryRunner: QueryRunner,
  table: string,
  index: string,
): Promise<boolean> {
  const rows = (await queryRunner.query(
    'SELECT 1 FROM information_schema.statistics WHERE table_schema=DATABASE() AND table_name=? AND index_name=? LIMIT 1',
    [table, index],
  )) as unknown[];
  return rows.length > 0;
}
