import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * 把 evaluation 目标 profile(sdd-default / e2e-monorepo)现有 serving version 的
 * config_json.manifest.evaluation 置 true。
 *
 * 为什么用 migration 而不是靠 db:seed 或人工重新发布:
 * - 公司服务器常规部署 RUN_SEED=0,只跑 migration。builtin 的 evaluation:true 不会自动落到那台 serving config。
 * - RUN_SEED=1 会按 builtin 重快照并切 serving,覆盖人工定制——不可接受。
 * - 本 migration 只 JSON_SET 单字段,不动 config 其余内容、不动 version 指针、幂等。
 *
 * 只改 serving version(profile_configs.serving_version_id 指向的行),因为 requireEvaluationProfile
 * 读的就是 serving config。同时改 published_version_id 指向的行(若与 serving 不同),
 * 保持两个指针一致,避免 published 有 evaluation=false 而 serving=true 的不一致。
 */
const EVALUATION_PROFILES = ['sdd-default', 'e2e-monorepo'];

export class EnableEvaluationManifest1780000021000 implements MigrationInterface {
  name = 'EnableEvaluationManifest1780000021000';

  async up(queryRunner: QueryRunner): Promise<void> {
    if (!(await tableExists(queryRunner, 'profile_configs'))) return;
    if (!(await tableExists(queryRunner, 'profile_config_versions'))) return;

    for (const profileId of EVALUATION_PROFILES) {
      await queryRunner.query(
        `UPDATE profile_config_versions v
           JOIN profile_configs c ON c.profile_id = v.profile_id
         SET v.config_json = JSON_SET(v.config_json, '$.manifest.evaluation', true),
             v.gmt_modified = CURRENT_TIMESTAMP(3)
         WHERE c.profile_id = ?
           AND v.id IN (c.serving_version_id, c.published_version_id)`,
        [profileId],
      );
    }
  }

  async down(): Promise<void> {
    // 不可逆: 回滚 evaluation 状态没有业务意义,且无法判断原本是否为 false。
  }
}

async function tableExists(queryRunner: QueryRunner, table: string): Promise<boolean> {
  const rows = (await queryRunner.query(
    `SELECT 1 FROM information_schema.tables WHERE table_schema=DATABASE() AND table_name=? LIMIT 1`,
    [table],
  )) as unknown[];
  return rows.length > 0;
}
