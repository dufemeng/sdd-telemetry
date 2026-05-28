import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddSkillUsageIdToToolCalls1780000000000 implements MigrationInterface {
  name = 'AddSkillUsageIdToToolCalls1780000000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    if (
      (await tableExists(queryRunner, 'sdd_interaction_tool_calls')) &&
      !(await columnExists(queryRunner, 'sdd_interaction_tool_calls', 'skill_usage_id'))
    ) {
      await queryRunner.query(
        `ALTER TABLE \`sdd_interaction_tool_calls\`
         ADD COLUMN \`skill_usage_id\` BIGINT UNSIGNED NULL AFTER \`interaction_id\`,
         ADD KEY \`idx_sdd_interaction_tool_calls_skill_usage_id\` (\`skill_usage_id\`)`,
      );
    }
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    if (await columnExists(queryRunner, 'sdd_interaction_tool_calls', 'skill_usage_id')) {
      await queryRunner.query(
        `ALTER TABLE \`sdd_interaction_tool_calls\`
         DROP KEY \`idx_sdd_interaction_tool_calls_skill_usage_id\`,
         DROP COLUMN \`skill_usage_id\``,
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
    `SELECT 1 FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name=? AND column_name=? LIMIT 1`,
    [t, c],
  )) as unknown[];
  return rows.length > 0;
}
