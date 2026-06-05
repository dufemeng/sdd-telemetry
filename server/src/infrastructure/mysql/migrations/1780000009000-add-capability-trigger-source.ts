import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * profile_capability_usages.trigger_source（第二阶段-1 修复）。
 *
 * capability_source 语义是「能力种类」（skill / command / mcp_tool / subagent），
 * 不能用来区分「用户触发 / 自动触发」。旧技能分析的 userTriggered / autoTriggered KPI
 * 来自 sdd_skill_usages.invocation_trigger，投影表此前没有对应列，导致该 KPI 无法口径一致。
 * 这里补一列 trigger_source 承载 invocation_trigger 原值，bridge 写入、analytics 据此聚合。
 */
export class AddCapabilityTriggerSource1780000009000 implements MigrationInterface {
  name = 'AddCapabilityTriggerSource1780000009000';

  async up(queryRunner: QueryRunner): Promise<void> {
    if (!(await tableExists(queryRunner, 'profile_capability_usages'))) return;

    const triggerSource = await getColumn(queryRunner, 'profile_capability_usages', 'trigger_source');
    if (!triggerSource) {
      await queryRunner.query(
        `ALTER TABLE \`profile_capability_usages\`
         ADD COLUMN \`trigger_source\` VARCHAR(191) NULL AFTER \`capability_source\``,
      );
      return;
    }

    const maxLength = Number(triggerSource.CHARACTER_MAXIMUM_LENGTH ?? 0);
    if (maxLength > 0 && maxLength < 191) {
      await queryRunner.query(
        `ALTER TABLE \`profile_capability_usages\`
         MODIFY COLUMN \`trigger_source\` VARCHAR(191) NULL`,
      );
    }
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    if (await columnExists(queryRunner, 'profile_capability_usages', 'trigger_source')) {
      await queryRunner.query(
        `ALTER TABLE \`profile_capability_usages\` DROP COLUMN \`trigger_source\``,
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
  return (await getColumn(qr, t, c)) !== null;
}

async function getColumn(
  qr: QueryRunner,
  t: string,
  c: string,
): Promise<{ CHARACTER_MAXIMUM_LENGTH: number | string | null } | null> {
  const rows = (await qr.query(
    `SELECT CHARACTER_MAXIMUM_LENGTH
     FROM information_schema.columns
     WHERE table_schema=DATABASE() AND table_name=? AND column_name=?
     LIMIT 1`,
    [t, c],
  )) as Array<{ CHARACTER_MAXIMUM_LENGTH: number | string | null }>;
  return rows[0] ?? null;
}
