import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Profile projection 查询索引补齐（第二阶段-1，Task 1.4）。
 *
 * 四大看板切到 profile_projection 读源后，需要按 user / capability / delivery_unit /
 * time 聚合。原表只有主键和唯一约束上的索引，缺少复合查询索引。
 */

const INDEXES: Array<[string, string, string]> = [
  ['profile_capability_usages', 'idx_pcu_run_user', '(profile_id, projection_run_id, user_id)'],
  ['profile_capability_usages', 'idx_pcu_run_code_time', '(profile_id, projection_run_id, capability_code, event_time)'],
  ['profile_capability_usages', 'idx_pcu_run_du', '(profile_id, projection_run_id, delivery_unit_id)'],

  ['profile_delivery_units', 'idx_pdu_run_last', '(profile_id, projection_run_id, last_seen_at)'],

  ['profile_knowledge_recalls', 'idx_pkr_run_user_time', '(profile_id, projection_run_id, user_id, event_time)'],
  ['profile_knowledge_recalls', 'idx_pkr_run_du', '(profile_id, projection_run_id, delivery_unit_id)'],
  ['profile_knowledge_recalls', 'idx_pkr_run_domain', '(profile_id, projection_run_id, knowledge_domain)'],

  ['profile_code_activities', 'idx_pca_run_user_time', '(profile_id, projection_run_id, user_id, event_time)'],
  ['profile_code_activities', 'idx_pca_run_du', '(profile_id, projection_run_id, delivery_unit_id)'],

  ['profile_artifact_writes', 'idx_paw_run_du_time', '(profile_id, projection_run_id, delivery_unit_id, event_time)'],
  ['profile_artifact_turns', 'idx_pat_run_du_time', '(profile_id, projection_run_id, delivery_unit_id, event_time)'],
];

export class AddProfileQueryIndexes1780000008000 implements MigrationInterface {
  name = 'AddProfileQueryIndexes1780000008000';

  async up(queryRunner: QueryRunner): Promise<void> {
    for (const [table, indexName, columns] of INDEXES) {
      await queryRunner.query(
        `ALTER TABLE \`${table}\` ADD INDEX \`${indexName}\` ${columns}`,
      );
    }
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    for (const [table, indexName] of INDEXES) {
      await queryRunner.query(
        `ALTER TABLE \`${table}\` DROP INDEX \`${indexName}\``,
      );
    }
  }
}
