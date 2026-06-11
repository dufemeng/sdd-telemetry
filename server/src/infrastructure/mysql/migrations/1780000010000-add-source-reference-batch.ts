import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddSourceReferenceBatch1780000010000 implements MigrationInterface {
  name = 'AddSourceReferenceBatch1780000010000';

  async up(queryRunner: QueryRunner): Promise<void> {
    if (!(await tableExists(queryRunner, 'source_references'))) return;

    if (!(await columnExists(queryRunner, 'source_references', 'source_batch_id'))) {
      await queryRunner.query(
        `ALTER TABLE \`source_references\`
         ADD COLUMN \`source_batch_id\` BIGINT UNSIGNED NULL AFTER \`event_id\``,
      );
    }

    if (!(await indexExists(queryRunner, 'source_references', 'idx_source_references_source_batch_id'))) {
      await queryRunner.query(
        `ALTER TABLE \`source_references\`
         ADD KEY \`idx_source_references_source_batch_id\` (\`source_batch_id\`)`,
      );
    }
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    if (!(await tableExists(queryRunner, 'source_references'))) return;

    if (await indexExists(queryRunner, 'source_references', 'idx_source_references_source_batch_id')) {
      await queryRunner.query(
        `ALTER TABLE \`source_references\`
         DROP KEY \`idx_source_references_source_batch_id\``,
      );
    }

    if (await columnExists(queryRunner, 'source_references', 'source_batch_id')) {
      await queryRunner.query(
        `ALTER TABLE \`source_references\`
         DROP COLUMN \`source_batch_id\``,
      );
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

async function columnExists(qr: QueryRunner, t: string, c: string): Promise<boolean> {
  const rows = (await qr.query(
    `SELECT 1 FROM information_schema.columns
     WHERE table_schema=DATABASE() AND table_name=? AND column_name=? LIMIT 1`,
    [t, c],
  )) as unknown[];
  return rows.length > 0;
}

async function indexExists(qr: QueryRunner, t: string, i: string): Promise<boolean> {
  const rows = (await qr.query(
    `SELECT 1 FROM information_schema.statistics
     WHERE table_schema=DATABASE() AND table_name=? AND index_name=? LIMIT 1`,
    [t, i],
  )) as unknown[];
  return rows.length > 0;
}
