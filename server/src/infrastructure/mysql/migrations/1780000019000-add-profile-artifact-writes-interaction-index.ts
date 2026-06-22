import type { MigrationInterface, QueryRunner } from 'typeorm';

const TABLE = 'profile_artifact_writes';
const INDEX = 'idx_profile_artifact_writes_interaction';

/**
 * 单次执行快照按 interaction_id 取产物写入（WHERE profile_id+projection_run_id+interaction_id）。
 * 同链路的 profile_error_events / profile_capability_usages / profile_knowledge_recalls 都有
 * interaction_id 单列索引，唯独 profile_artifact_writes 缺，补齐以免随表增长全扫。
 */
export class AddProfileArtifactWritesInteractionIndex1780000019000 implements MigrationInterface {
  name = 'AddProfileArtifactWritesInteractionIndex1780000019000';

  async up(queryRunner: QueryRunner): Promise<void> {
    if (!(await indexExists(queryRunner, INDEX))) {
      await queryRunner.query(
        `ALTER TABLE \`${TABLE}\` ADD INDEX \`${INDEX}\` (\`interaction_id\`)`,
      );
    }
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    if (await indexExists(queryRunner, INDEX)) {
      await queryRunner.query(`ALTER TABLE \`${TABLE}\` DROP INDEX \`${INDEX}\``);
    }
  }
}

async function indexExists(queryRunner: QueryRunner, index: string): Promise<boolean> {
  const rows = (await queryRunner.query(
    'SELECT 1 FROM information_schema.statistics WHERE table_schema=DATABASE() AND table_name=? AND index_name=? LIMIT 1',
    [TABLE, index],
  )) as unknown[];
  return rows.length > 0;
}
