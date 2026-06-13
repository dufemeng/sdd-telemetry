import type { MigrationInterface, QueryRunner } from 'typeorm';

export class ProfileConfigServingVersion1780000014000 implements MigrationInterface {
  name = 'ProfileConfigServingVersion1780000014000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await addColumnIfMissing(
      queryRunner,
      'profile_configs',
      'serving_version_id',
      '`serving_version_id` BIGINT UNSIGNED NULL AFTER `published_version_id`',
    );
    await addIndexIfMissing(
      queryRunner,
      'profile_configs',
      'idx_profile_configs_serving_version',
      'KEY `idx_profile_configs_serving_version` (`serving_version_id`)',
    );
    if (await tableExists(queryRunner, 'profile_configs')) {
      await queryRunner.query(`
        UPDATE profile_configs
        SET serving_version_id = published_version_id
        WHERE serving_version_id IS NULL
          AND published_version_id IS NOT NULL
      `);
    }

    await addColumnIfMissing(
      queryRunner,
      'profile_source_matches',
      'profile_config_version_id',
      '`profile_config_version_id` BIGINT UNSIGNED NULL AFTER `profile_id`',
    );
    await addIndexIfMissing(
      queryRunner,
      'profile_source_matches',
      'idx_profile_source_matches_config_version',
      'KEY `idx_profile_source_matches_config_version` (`profile_config_version_id`)',
    );
    await backfillSourceMatchVersions(queryRunner);
    await tightenSourceMatchVersioningIfReady(queryRunner);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    if (
      await tableExists(queryRunner, 'profile_source_matches')
      && await columnExists(queryRunner, 'profile_source_matches', 'profile_config_version_id')
    ) {
      await dropIndexIfExists(queryRunner, 'profile_source_matches', 'uk_profile_source_matches_ref');
      await queryRunner.query(
        'ALTER TABLE `profile_source_matches` MODIFY COLUMN `profile_config_version_id` BIGINT UNSIGNED NULL',
      );
      const duplicateLegacyKeys = await countRows(
        queryRunner,
        `SELECT COUNT(*) AS count
         FROM (
           SELECT profile_id, source_reference_key
           FROM profile_source_matches
           GROUP BY profile_id, source_reference_key
           HAVING COUNT(*) > 1
         ) duplicates`,
      );
      if (duplicateLegacyKeys === 0) {
        await addIndexIfMissing(
          queryRunner,
          'profile_source_matches',
          'uk_profile_source_matches_ref',
          'UNIQUE KEY `uk_profile_source_matches_ref` (`profile_id`, `source_reference_key`)',
        );
      }
    }
    await dropIndexIfExists(queryRunner, 'profile_configs', 'idx_profile_configs_serving_version');
    await dropColumnIfExists(queryRunner, 'profile_configs', 'serving_version_id');
  }
}

async function backfillSourceMatchVersions(queryRunner: QueryRunner): Promise<void> {
  if (!(await tableExists(queryRunner, 'profile_source_matches'))) return;
  if (!(await tableExists(queryRunner, 'profile_configs'))) return;
  await queryRunner.query(`
    UPDATE profile_source_matches m
    JOIN profile_configs c ON c.profile_id = m.profile_id
    SET m.profile_config_version_id = COALESCE(c.serving_version_id, c.published_version_id)
    WHERE m.profile_config_version_id IS NULL
      AND COALESCE(c.serving_version_id, c.published_version_id) IS NOT NULL
  `);
}

async function tightenSourceMatchVersioningIfReady(queryRunner: QueryRunner): Promise<void> {
  if (!(await tableExists(queryRunner, 'profile_source_matches'))) return;
  if (!(await columnExists(queryRunner, 'profile_source_matches', 'profile_config_version_id'))) return;
  const unresolved = await countRows(
    queryRunner,
    'SELECT COUNT(*) AS count FROM profile_source_matches WHERE profile_config_version_id IS NULL',
  );
  if (unresolved > 0) return;

  const columns = await indexColumns(queryRunner, 'profile_source_matches', 'uk_profile_source_matches_ref');
  if (columns.join(',') !== 'profile_id,profile_config_version_id,source_reference_key') {
    await dropIndexIfExists(queryRunner, 'profile_source_matches', 'uk_profile_source_matches_ref');
    await addIndexIfMissing(
      queryRunner,
      'profile_source_matches',
      'uk_profile_source_matches_ref',
      'UNIQUE KEY `uk_profile_source_matches_ref` (`profile_id`, `profile_config_version_id`, `source_reference_key`)',
    );
  }

  await queryRunner.query(
    'ALTER TABLE `profile_source_matches` MODIFY COLUMN `profile_config_version_id` BIGINT UNSIGNED NOT NULL',
  );
}

async function countRows(queryRunner: QueryRunner, sql: string): Promise<number> {
  const rows = (await queryRunner.query(sql)) as Array<{ count: number | string }>;
  return Number(rows[0]?.count ?? 0);
}

async function addColumnIfMissing(
  queryRunner: QueryRunner,
  table: string,
  column: string,
  ddl: string,
): Promise<void> {
  if (!(await tableExists(queryRunner, table))) return;
  if (await columnExists(queryRunner, table, column)) return;
  await queryRunner.query(`ALTER TABLE \`${table}\` ADD COLUMN ${ddl}`);
}

async function dropColumnIfExists(
  queryRunner: QueryRunner,
  table: string,
  column: string,
): Promise<void> {
  if (!(await tableExists(queryRunner, table))) return;
  if (!(await columnExists(queryRunner, table, column))) return;
  await queryRunner.query(`ALTER TABLE \`${table}\` DROP COLUMN \`${column}\``);
}

async function addIndexIfMissing(
  queryRunner: QueryRunner,
  table: string,
  index: string,
  ddl: string,
): Promise<void> {
  if (!(await tableExists(queryRunner, table))) return;
  if (await indexExists(queryRunner, table, index)) return;
  await queryRunner.query(`ALTER TABLE \`${table}\` ADD ${ddl}`);
}

async function dropIndexIfExists(
  queryRunner: QueryRunner,
  table: string,
  index: string,
): Promise<void> {
  if (!(await tableExists(queryRunner, table))) return;
  if (!(await indexExists(queryRunner, table, index))) return;
  await queryRunner.query(`ALTER TABLE \`${table}\` DROP INDEX \`${index}\``);
}

async function tableExists(queryRunner: QueryRunner, table: string): Promise<boolean> {
  const rows = (await queryRunner.query(
    `SELECT 1 FROM information_schema.tables WHERE table_schema=DATABASE() AND table_name=? LIMIT 1`,
    [table],
  )) as unknown[];
  return rows.length > 0;
}

async function columnExists(queryRunner: QueryRunner, table: string, column: string): Promise<boolean> {
  const rows = (await queryRunner.query(
    `SELECT 1 FROM information_schema.columns
     WHERE table_schema=DATABASE() AND table_name=? AND column_name=? LIMIT 1`,
    [table, column],
  )) as unknown[];
  return rows.length > 0;
}

async function indexExists(queryRunner: QueryRunner, table: string, index: string): Promise<boolean> {
  const rows = (await queryRunner.query(
    `SELECT 1 FROM information_schema.statistics
     WHERE table_schema=DATABASE() AND table_name=? AND index_name=? LIMIT 1`,
    [table, index],
  )) as unknown[];
  return rows.length > 0;
}

async function indexColumns(queryRunner: QueryRunner, table: string, index: string): Promise<string[]> {
  const rows = (await queryRunner.query(
    `SELECT column_name AS columnName
     FROM information_schema.statistics
     WHERE table_schema=DATABASE() AND table_name=? AND index_name=?
     ORDER BY seq_in_index ASC`,
    [table, index],
  )) as Array<{ columnName: string }>;
  return rows.map((row) => row.columnName);
}
