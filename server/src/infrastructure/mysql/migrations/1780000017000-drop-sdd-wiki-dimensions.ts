import type { MigrationInterface, QueryRunner } from 'typeorm';

const TABLE = 'sdd_wiki_recalls';
const COLUMNS = ['wiki_domain', 'wiki_axis', 'wiki_system'] as const;
const INDEXES = ['idx_recalls_domain', 'idx_recalls_axis', 'idx_recalls_system'] as const;

export class DropSddWikiDimensions1780000017000 implements MigrationInterface {
  name = 'DropSddWikiDimensions1780000017000';

  async up(queryRunner: QueryRunner): Promise<void> {
    if (!(await tableExists(queryRunner))) return;
    for (const index of INDEXES) {
      if (await indexExists(queryRunner, index)) {
        await queryRunner.query(`ALTER TABLE \`${TABLE}\` DROP INDEX \`${index}\``);
      }
    }
    for (const column of COLUMNS) {
      if (await columnExists(queryRunner, column)) {
        await queryRunner.query(`ALTER TABLE \`${TABLE}\` DROP COLUMN \`${column}\``);
      }
    }
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    if (!(await tableExists(queryRunner))) return;
    if (!(await columnExists(queryRunner, 'wiki_domain'))) {
      await queryRunner.query(
        `ALTER TABLE \`${TABLE}\` ADD COLUMN \`wiki_domain\` VARCHAR(191) NULL AFTER \`wiki_relative_path\``,
      );
    }
    if (!(await columnExists(queryRunner, 'wiki_axis'))) {
      await queryRunner.query(
        `ALTER TABLE \`${TABLE}\` ADD COLUMN \`wiki_axis\` VARCHAR(64) NULL AFTER \`wiki_domain\``,
      );
    }
    if (!(await columnExists(queryRunner, 'wiki_system'))) {
      await queryRunner.query(
        `ALTER TABLE \`${TABLE}\` ADD COLUMN \`wiki_system\` VARCHAR(191) NULL AFTER \`wiki_axis\``,
      );
    }
    if (!(await indexExists(queryRunner, 'idx_recalls_domain'))) {
      await queryRunner.query(
        `ALTER TABLE \`${TABLE}\` ADD INDEX \`idx_recalls_domain\` (\`wiki_domain\`)`,
      );
    }
    if (!(await indexExists(queryRunner, 'idx_recalls_axis'))) {
      await queryRunner.query(
        `ALTER TABLE \`${TABLE}\` ADD INDEX \`idx_recalls_axis\` (\`wiki_axis\`)`,
      );
    }
    if (!(await indexExists(queryRunner, 'idx_recalls_system'))) {
      await queryRunner.query(
        `ALTER TABLE \`${TABLE}\` ADD INDEX \`idx_recalls_system\` (\`wiki_system\`)`,
      );
    }
  }
}

async function tableExists(queryRunner: QueryRunner): Promise<boolean> {
  const rows = (await queryRunner.query(
    'SELECT 1 FROM information_schema.tables WHERE table_schema=DATABASE() AND table_name=? LIMIT 1',
    [TABLE],
  )) as unknown[];
  return rows.length > 0;
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
