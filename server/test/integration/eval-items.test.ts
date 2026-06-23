import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createConnection, type Connection } from 'mysql2/promise';
import { EvalItemService } from '../../src/modules/eval/eval-item.service';
import { EvalItemRepository } from '../../src/modules/eval/eval-item.repository';
import { ProfileConfigRepository } from '../../src/modules/profiles/profile-config.repository';
import { MysqlDataSourceManager } from '../../src/infrastructure/mysql/data-source-manager';

/**
 * 真实 MySQL 集成测试。合成 prompt (禁止真实样本入库)。
 * 需要: docker compose up -d mysql + pnpm db:migrate + pnpm db:seed
 * 运行: RUN_EVAL_INTEGRATION=1 pnpm --filter @sdd-telemetry/server test -- integration/eval-items
 */
const RUN = process.env.RUN_EVAL_INTEGRATION === '1';
const MARKER = 'eval-itest-';

describe.skipIf(!RUN)('eval items integration (real MySQL)', () => {
  let conn: Connection;
  let service: EvalItemService;
  let sddRunId: string;
  let e2eRunId: string;

  async function seedProjectionRun(profileId: string): Promise<string> {
    const [res] = await conn.query(
      `INSERT INTO profile_projection_runs
        (profile_id, run_type, status, started_at, completed_at, gmt_create, gmt_modified)
       VALUES (?, 'manual', 'completed', NOW(3), NOW(3), NOW(3), NOW(3))`,
      [profileId],
    ) as [awaited<ReturnType<typeof conn.query>>, unknown];
    const runId = String((res as { insertId: string }).insertId);
    await conn.query(
      `INSERT INTO profile_current_projection_runs (profile_id, current_projection_run_id, gmt_create, gmt_modified)
       VALUES (?, ?, NOW(3), NOW(3))
       ON DUPLICATE KEY UPDATE current_projection_run_id = VALUES(current_projection_run_id), gmt_modified = NOW(3)`,
      [profileId, runId],
    );
    return runId;
  }

  async function seedCapabilityUsage(profileId: string, runId: string, opts: {
    interactionId: number | null;
    promptText: string | null;
    capabilityCode: string;
    rawCapabilityName: string;
    usageKey: string;
    eventTime: Date | null;
  }): Promise<void> {
    let interactionId = opts.interactionId;
    if (interactionId !== null) {
      // sdd_interaction_texts 要求 interaction_id UNIQUE 且有正文 (或为这个测试单独插)
      // 用一个合成 sdd_interaction 作为载体 (id 自增), 再插 text。
      const [iRes] = await conn.query(
        `INSERT INTO sdd_interactions
          (interaction_key, status, pairing_method, model, llm_call_count, tool_call_count, gmt_create, gmt_modified)
         VALUES (?, 'completed', 'manual', 'itest', 0, 0, NOW(3), NOW(3))`,
        [`${MARKER}int-${opts.usageKey}`],
      ) as [awaited<ReturnType<typeof conn.query>>, unknown];
      interactionId = Number((iRes as { insertId: string | number }).insertId);
      await conn.query(
        `INSERT INTO sdd_interaction_texts
          (interaction_id, prompt_text, expires_at, gmt_create, gmt_modified)
         VALUES (?, ?, DATE_ADD(NOW(3), INTERVAL 30 DAY), NOW(3), NOW(3))`,
        [interactionId, opts.promptText],
      );
    }
    await conn.query(
      `INSERT INTO profile_capability_usages
        (profile_id, projection_run_id, usage_key, interaction_id, capability_code,
         raw_capability_name, display_name, event_time, rule_version, gmt_create, gmt_modified)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'itest-1', NOW(3), NOW(3))`,
      [profileId, runId, opts.usageKey, interactionId, opts.capabilityCode,
        opts.rawCapabilityName, opts.capabilityCode, opts.eventTime],
    );
  }

  async function newService(): Promise<EvalItemService> {
    const s = new EvalItemService();
    const repo = new EvalItemRepository();
    const pcr = new ProfileConfigRepository();
    const mgr = new MysqlDataSourceManager();
    (repo as unknown as { mysqlDataSourceManager: MysqlDataSourceManager }).mysqlDataSourceManager = mgr;
    (pcr as unknown as { mysqlDataSourceManager: MysqlDataSourceManager }).mysqlDataSourceManager = mgr;
    s.evalItemRepository = repo;
    s.profileConfigRepository = pcr;
    return s;
  }

  beforeAll(async () => {
    conn = await createConnection({
      host: process.env.MYSQL_HOST ?? '127.0.0.1',
      port: Number(process.env.MYSQL_PORT ?? 3306),
      user: process.env.MYSQL_USER ?? 'sdd-telemetry',
      password: process.env.MYSQL_PASSWORD ?? 'sdd-telemetry',
      database: process.env.MYSQL_DATABASE ?? 'sdd-telemetry',
    });
    // 清理 marker 数据
    await conn.query(`DELETE FROM eval_items WHERE prompt_text LIKE ? OR title LIKE ?`, [`%${MARKER}%`, `%${MARKER}%`]);
    await conn.query(`DELETE FROM eval_items WHERE deleted_at IS NOT NULL AND profile_id IN ('sdd-default', 'e2e-monorepo')`);

    // seed sdd-default: 两条相同合成 design prompt (不同 interaction) => 1 candidate, occ=2
    sddRunId = await seedProjectionRun('sdd-default');
    await seedCapabilityUsage('sdd-default', sddRunId, {
      interactionId: 1, promptText: `${MARKER}design prompt A`,
      capabilityCode: 'design', rawCapabilityName: 'bk-fe-design',
      usageKey: `${MARKER}cu-1`, eventTime: new Date('2026-06-20T00:00:00Z'),
    });
    await seedCapabilityUsage('sdd-default', sddRunId, {
      interactionId: 1, promptText: `${MARKER}design prompt A`,
      capabilityCode: 'design', rawCapabilityName: 'bk-fe-design',
      usageKey: `${MARKER}cu-2`, eventTime: new Date('2026-06-21T00:00:00Z'),
    });
    // 一条空正文 => skippedNoPrompt
    await seedCapabilityUsage('sdd-default', sddRunId, {
      interactionId: null, promptText: null,
      capabilityCode: 'design', rawCapabilityName: 'bk-fe-design',
      usageKey: `${MARKER}cu-3`, eventTime: null,
    });

    // seed e2e-monorepo: 相同 prompt 隔离 => 不同 item
    e2eRunId = await seedProjectionRun('e2e-monorepo');
    await seedCapabilityUsage('e2e-monorepo', e2eRunId, {
      interactionId: 1, promptText: `${MARKER}design prompt A`,
      capabilityCode: 'design', rawCapabilityName: 'bk-fe-design',
      usageKey: `${MARKER}cu-e2e-1`, eventTime: new Date('2026-06-20T00:00:00Z'),
    });

    service = await newService();
  });

  afterAll(async () => {
    if (conn) {
      // 清理 marker 数据 + 对应 interactions
      const [ints] = await conn.query(
        `SELECT id FROM sdd_interactions WHERE interaction_key LIKE ?`,
        [`${MARKER}%`],
      ) as [Array<{ id: string }>, unknown];
      for (const { id } of ints) {
        await conn.query(`DELETE FROM sdd_interaction_texts WHERE interaction_id = ?`, [id]);
        await conn.query(`DELETE FROM sdd_interactions WHERE id = ?`, [id]);
      }
      await conn.query(`DELETE FROM eval_items WHERE prompt_text LIKE ? OR title LIKE ?`, [`%${MARKER}%`, `%${MARKER}%`]);
    await conn.query(`DELETE FROM eval_items WHERE deleted_at IS NOT NULL AND profile_id IN ('sdd-default', 'e2e-monorepo')`);
      await conn.query(`DELETE FROM profile_capability_usages WHERE usage_key LIKE ?`, [`${MARKER}%`]);
      await conn.query(`DELETE FROM profile_projection_runs WHERE id IN (?, ?)`, [sddRunId, e2eRunId]);
      await conn.end();
    }
  });

  it('imports deduped prompts with occurrenceCount and skips empty (sdd-default)', async () => {
    const r = await service.importFromLogs({ profileId: 'sdd-default', capabilityCode: 'design' });
    expect(r.candidateCount).toBe(1);
    expect(r.insertedCount).toBe(1);
    expect(r.skippedNoPromptCount).toBe(1);
    expect(r.scannedCount).toBe(3); // 2 with prompt + 1 empty
    // target skill 解析为规范名, 不是语义代码 design
    const lst = await service.list({ profileId: 'sdd-default', page: 1, pageSize: 100, capabilityCode: 'design' });
    const ours = lst.items.filter((i) => i.promptPreview.includes(MARKER));
    expect(ours.length).toBe(1);
    expect(ours[0].targetSkill).toBe('bk-fe-design');
    expect(ours[0].targetArtifactType).toBe('design');
    expect(ours[0].occurrenceCount).toBe(2);
  });

  it('repeat import is idempotent (inserted=0, refreshed>0, total unchanged)', async () => {
    const before = await service.list({ profileId: 'sdd-default', page: 1, pageSize: 100 });
    const beforeTotal = before.total;
    const r = await service.importFromLogs({ profileId: 'sdd-default', capabilityCode: 'design' });
    expect(r.insertedCount).toBe(0);
    expect(r.refreshedCount).toBe(1);
    const after = await service.list({ profileId: 'sdd-default', page: 1, pageSize: 100 });
    expect(after.total).toBe(beforeTotal);
  });

  it('isolates profiles (e2e has its own item, invisible via sdd list by capability)', async () => {
    await service.importFromLogs({ profileId: 'e2e-monorepo', capabilityCode: 'design' });
    const e2e = await service.list({ profileId: 'e2e-monorepo', page: 1, pageSize: 100 });
    const e2eOurs = e2e.items.filter((i) => i.promptPreview.includes(MARKER));
    expect(e2eOurs.length).toBe(1);
    expect(e2eOurs[0].profileId ?? '').toBe('e2e-monorepo');
    // sdd-default list 不会出现 e2e 的 item (虽然 prompt 相同, key 因 profile 不同而不同)
    const sdd = await service.list({ profileId: 'sdd-default', page: 1, pageSize: 100 });
    const sddOurs = sdd.items.filter((i) => i.promptPreview.includes(MARKER));
    expect(sddOurs.every((i) => i.profileId === 'sdd-default')).toBe(true);
    expect(sddOurs.length).toBe(1); // 只有 sdd 自己那条
  });

  it('rejects prompt change on cleaned item (EVAL_CLEANED_IMMUTABLE)', async () => {
    const sdd = await service.list({ profileId: 'sdd-default', page: 1, pageSize: 100 });
    const ours = sdd.items.find((i) => i.promptPreview.includes(MARKER));
    expect(ours).toBeTruthy();
    await expect(
      service.update(ours!.id, { profileId: 'sdd-default', promptText: 'changed', actor: { id: '1', role: 'super_admin', username: 'a' } }),
    ).rejects.toMatchObject({ code: 'EVAL_CLEANED_IMMUTABLE' });
  });

  it('delete tombstones and prevents re-import revival', async () => {
    const sdd = await service.list({ profileId: 'sdd-default', page: 1, pageSize: 100 });
    const ours = sdd.items.find((i) => i.promptPreview.includes(MARKER));
    expect(ours).toBeTruthy();
    await service.remove(ours!.id, { profileId: 'sdd-default', actor: { id: '1', role: 'super_admin', username: 'a' } });
    // 重复 import: 该 key 计入 skippedDeleted, 不复活
    const r = await service.importFromLogs({ profileId: 'sdd-default', capabilityCode: 'design' });
    expect(r.skippedDeletedCount).toBe(1);
    expect(r.insertedCount).toBe(0);
    const after = await service.list({ profileId: 'sdd-default', page: 1, pageSize: 100 });
    expect(after.items.find((i) => i.promptPreview.includes(MARKER))).toBeUndefined();
  });
});
