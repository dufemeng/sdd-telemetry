import { describe, expect, it, vi } from 'vitest';
import { EvalItemRepository } from '../src/modules/eval/eval-item.repository';
import type { ImportCandidate } from '../src/modules/eval/eval-item.repository';

function createRepository(query: (sql: string, params?: unknown[]) => Promise<Array<Record<string, unknown>>>) {
  const repository = new EvalItemRepository();
  repository.mysqlDataSourceManager = {
    getDataSource: async () => ({ query }),
  } as EvalItemRepository['mysqlDataSourceManager'];
  return repository;
}

/**
 * 装配一个 repository, 其 runInTransaction 走 mock 的 dataSource.transaction(work),
 * work 会收到一个可记录调用的 manager。事务方法通过 runInTransaction 调用 (不手动传 manager)。
 */
function createTxRepo(handlers: Array<(sql: string, params?: unknown[]) => Promise<unknown>>) {
  const calls: Array<{ sql: string; params?: unknown[] }> = [];
  const manager = {
    query: async (sql: string, params?: unknown[]) => {
      calls.push({ sql, params });
      const handler = handlers.shift();
      if (!handler) return [];
      return handler(sql, params);
    },
  };
  const repository = new EvalItemRepository();
  repository.mysqlDataSourceManager = {
    getDataSource: async () => ({
      query: async () => [],
      transaction: async <T,>(work: (m: typeof manager) => Promise<T>) => work(manager),
    }),
  } as unknown as EvalItemRepository['mysqlDataSourceManager'];
  return { repository, calls };
}

describe('EvalItemRepository read-only methods', () => {
  it('getCurrentProjectionRunId returns runId', async () => {
    const repo = createRepository(async () => [{ runId: '77' }]);
    await expect(repo.getCurrentProjectionRunId('sdd-default')).resolves.toBe('77');
  });

  it('getCurrentProjectionRunId returns null when no row', async () => {
    const repo = createRepository(async () => []);
    await expect(repo.getCurrentProjectionRunId('p')).resolves.toBeNull();
  });

  it('listItems applies filters and maps rows', async () => {
    const seenSql: string[] = [];
    const repo = createRepository(async (sql) => {
      seenSql.push(sql);
      if (sql.startsWith('SELECT COUNT(*)')) return [{ cnt: 1 }];
      return [{
        id: 5, item_key: 'k', profile_id: 'sdd-default', source: 'cleaned', prompt_text: 'hi',
        target_skill: 'bk-fe-design', target_artifact_type: 'design',
        origin_interaction_id: '9', origin_prompt_id: null, origin_projection_run_id: '7',
        origin_capability_code: 'design', origin_raw_capability_name: 'bk-fe-design',
        occurrence_count: 2, first_observed_at: null, last_observed_at: '2026-06-21 00:00:00.000',
        last_imported_at: null, enabled: 1, title: null, notes: null, deleted_at: null,
      }];
    });
    const { items, total } = await repo.listItems({
      profileId: 'sdd-default', source: 'cleaned', capabilityCode: 'design',
      enabled: true, keyword: 'x', page: 1, pageSize: 20,
    });
    expect(total).toBe(1);
    expect(items[0].id).toBe('5');
    expect(items[0].source).toBe('cleaned');
    expect(items[0].occurrenceCount).toBe(2);
    // 关键 SQL 断言: deleted_at 过滤 + keyword 不碰 prompt_text
    const listSql = seenSql.find((s) => s.includes('ORDER BY gmt_modified')) ?? '';
    expect(listSql).toContain('deleted_at IS NULL');
    expect(listSql).toContain('title LIKE');
    expect(listSql).toContain('notes LIKE');
    expect(listSql).toContain('target_skill LIKE');
    expect(listSql).not.toMatch(/prompt_text\s+LIKE/);
  });

  it('listSummary aggregates counts', async () => {
    const repo = createRepository(async () => [{ total: 10, enabled: 7, cleaned: 6, manual: 4 }]);
    await expect(repo.listSummary('sdd-default')).resolves.toEqual({ total: 10, enabled: 7, cleaned: 6, manual: 4 });
  });

  it('listSummary handles null aggregates (no rows)', async () => {
    const repo = createRepository(async () => [{ total: 0, enabled: null, cleaned: null, manual: null }]);
    await expect(repo.listSummary('sdd-default')).resolves.toEqual({ total: 0, enabled: 0, cleaned: 0, manual: 0 });
  });

  it('getItem returns null when not found', async () => {
    const repo = createRepository(async () => []);
    await expect(repo.getItem('1', 'sdd-default')).resolves.toBeNull();
  });
});

describe('EvalItemRepository readCapabilityTextRows', () => {
  it('uses LEFT JOIN, cursor params order, filters NULL event_time', async () => {
    let seenSql = '';
    let seenParams: unknown[] | undefined;
    const repo = createRepository(async (sql, params) => {
      seenSql = sql; seenParams = params;
      return [{ cuId: '1', interactionId: null, promptId: null, capabilityCode: 'design', rawCapabilityName: 'bk-fe-design', eventTime: null, promptText: null }];
    });
    await repo.readCapabilityTextRows({
      profileId: 'sdd-default', projectionRunId: '7', capabilityCode: 'design',
      from: '2026-06-01', to: '2026-06-30', batchSize: 500,
    });
    expect(seenSql).toContain('LEFT JOIN sdd_interaction_texts');
    expect(seenSql).toContain('cu.event_time IS NULL OR cu.event_time >=');
    expect(seenSql).toContain('ORDER BY cu.id ASC');
    expect(seenParams).toEqual(['sdd-default', '7', 'design', '2026-06-01', '2026-06-30', 500]);
  });

  it('adds cu.id > ? when afterCuId provided (cursor pagination)', async () => {
    let seenSql = '';
    let seenParams: unknown[] | undefined;
    const repo = createRepository(async (sql, params) => {
      seenSql = sql; seenParams = params;
      return [];
    });
    await repo.readCapabilityTextRows({
      profileId: 'sdd-default', projectionRunId: '7', afterCuId: '100', batchSize: 500,
    });
    expect(seenSql).toContain('cu.id > ?');
    expect(seenParams?.[2]).toBe('100');
  });

  it('surfaces NULL interaction_id rows (LEFT JOIN keeps them)', async () => {
    const repo = createRepository(async () => [
      { cuId: '1', interactionId: null, promptId: null, capabilityCode: 'design', rawCapabilityName: null, eventTime: null, promptText: null },
    ]);
    const rows = await repo.readCapabilityTextRows({ profileId: 'p', projectionRunId: '7', batchSize: 10 });
    expect(rows.length).toBe(1);
    expect(rows[0].interactionId).toBeNull();
    expect(rows[0].promptText).toBeNull();
  });
});

describe('EvalItemRepository upsertCleanedCandidatesInTransaction', () => {
  const candidate = (itemKey: string): ImportCandidate => ({
    itemKey, profileId: 'sdd-default', promptText: 'p', targetSkill: 'bk-fe-design',
    targetArtifactType: 'design', originInteractionId: '10', originPromptId: null,
    originProjectionRunId: '7', originCapabilityCode: 'design', originRawCapabilityName: 'bk-fe-design',
    occurrenceCount: 1, firstObservedAt: null, lastObservedAt: null,
  });

  it('INSERTs when no existing row', async () => {
    const { repository, calls } = createTxRepo([
      async () => [], // SELECT existing -> none
      async () => ({ insertId: 9 }),
    ]);
    const outcome = await repository.runInTransaction((manager) =>
      repository.upsertCleanedCandidatesInTransaction(manager, [candidate('new')], '2026-06-23T00:00:00.000Z'),
    );
    expect(outcome).toEqual({ inserted: 1, refreshed: 0, upgraded: 0, skippedDeleted: 0 });
    expect(calls.some((c) => c.sql.startsWith('INSERT INTO eval_items'))).toBe(true);
  });

  it('refreshes existing cleaned row WITHOUT touching title/notes/enabled', async () => {
    const { repository, calls } = createTxRepo([
      async () => [{ id: 5, source: 'cleaned', deleted_at: null }], // SELECT existing
      async () => ({ affectedRows: 1 }), // UPDATE
    ]);
    const outcome = await repository.runInTransaction((manager) =>
      repository.upsertCleanedCandidatesInTransaction(manager, [candidate('dup')], '2026-06-23T00:00:00.000Z'),
    );
    expect(outcome).toEqual({ inserted: 0, refreshed: 1, upgraded: 0, skippedDeleted: 0 });
    const updateCall = calls.find((c) => c.sql.startsWith('UPDATE eval_items'));
    expect(updateCall).toBeTruthy();
    expect(updateCall!.sql).not.toContain('title =');
    expect(updateCall!.sql).not.toContain('notes =');
    expect(updateCall!.sql).not.toContain('enabled =');
    expect(updateCall!.sql).toContain('prompt_text =');
    expect(updateCall!.sql).toContain("source = 'cleaned'");
  });

  it('counts manual->cleaned as upgraded (not refreshed)', async () => {
    const { repository } = createTxRepo([
      async () => [{ id: 5, source: 'manual', deleted_at: null }],
    ]);
    const outcome = await repository.runInTransaction((manager) =>
      repository.upsertCleanedCandidatesInTransaction(manager, [candidate('dup')], '2026-06-23T00:00:00.000Z'),
    );
    expect(outcome).toEqual({ inserted: 0, refreshed: 0, upgraded: 1, skippedDeleted: 0 });
  });

  it('skips tombstone without revive (skippedDeleted)', async () => {
    const { repository, calls } = createTxRepo([
      async () => [{ id: 5, source: 'cleaned', deleted_at: '2026-06-20 00:00:00.000' }],
    ]);
    const outcome = await repository.runInTransaction((manager) =>
      repository.upsertCleanedCandidatesInTransaction(manager, [candidate('tomb')], '2026-06-23T00:00:00.000Z'),
    );
    expect(outcome).toEqual({ inserted: 0, refreshed: 0, upgraded: 0, skippedDeleted: 1 });
    // 只有 SELECT existing 这一次查询, 不应有 INSERT/UPDATE
    expect(calls.some((c) => /^(INSERT|UPDATE)/.test(c.sql))).toBe(false);
  });
});

describe('EvalItemRepository insertManualInTransaction', () => {
  it('returns tombstone when key matches a deleted row', async () => {
    const { repository } = createTxRepo([
      async () => [{ id: 5, deleted_at: '2026-06-20 00:00:00.000' }],
    ]);
    const result = await repository.runInTransaction((manager) =>
      repository.insertManualInTransaction(manager, {
        itemKey: 'tomb', profileId: 'sdd-default', promptText: 'p',
        targetSkill: 'bk-fe-design', targetArtifactType: 'design',
      }),
    );
    expect(result).toEqual({ status: 'tombstone' });
  });

  it('returns exists when key matches an active row', async () => {
    const { repository } = createTxRepo([
      async () => [{ id: 5, deleted_at: null }],
    ]);
    const result = await repository.runInTransaction((manager) =>
      repository.insertManualInTransaction(manager, {
        itemKey: 'dup', profileId: 'sdd-default', promptText: 'p',
        targetSkill: 'bk-fe-design', targetArtifactType: 'design',
      }),
    );
    expect(result).toEqual({ status: 'exists', existingId: '5' });
  });

  it('creates when no existing row', async () => {
    const { repository } = createTxRepo([
      async () => [],
      async () => ({ insertId: 9 }),
    ]);
    const result = await repository.runInTransaction((manager) =>
      repository.insertManualInTransaction(manager, {
        itemKey: 'fresh', profileId: 'sdd-default', promptText: 'p',
        targetSkill: 'bk-fe-design', targetArtifactType: 'design',
      }),
    );
    expect(result).toEqual({ status: 'created', id: '9' });
  });
});

describe('EvalItemRepository updateItemInTransaction', () => {
  it('rejects prompt/target/itemKey changes for cleaned source', async () => {
    const { repository, calls } = createTxRepo([
      async () => ({ affectedRows: 1 }),
    ]);
    const result = await repository.runInTransaction((manager) =>
      repository.updateItemInTransaction(manager, {
        id: '1', profileId: 'sdd-default', source: 'cleaned',
        promptText: 'should-not-write', targetSkill: 'x', itemKey: 'newkey', title: 't',
      }),
    );
    expect(result).toEqual({ status: 'updated' });
    const updateCall = calls.find((c) => c.sql.startsWith('UPDATE eval_items'));
    expect(updateCall!.sql).toContain('title =');
    expect(updateCall!.sql).not.toContain('prompt_text =');
    expect(updateCall!.sql).not.toContain('target_skill =');
    expect(updateCall!.sql).not.toContain('item_key =');
  });

  it('allows prompt/target/itemKey for manual source', async () => {
    const { repository, calls } = createTxRepo([
      async () => ({ affectedRows: 1 }),
    ]);
    await repository.runInTransaction((manager) =>
      repository.updateItemInTransaction(manager, {
        id: '1', profileId: 'sdd-default', source: 'manual',
        promptText: 'new', targetSkill: 's', targetArtifactType: 'design', itemKey: 'k2',
      }),
    );
    const updateCall = calls.find((c) => c.sql.startsWith('UPDATE eval_items'));
    expect(updateCall!.sql).toContain('prompt_text =');
    expect(updateCall!.sql).toContain('target_skill =');
    expect(updateCall!.sql).toContain('item_key =');
  });

  it('returns conflict on duplicate key (ER_DUP_ENTRY)', async () => {
    const { repository } = createTxRepo([
      async () => { throw Object.assign(new Error('dup'), { code: 'ER_DUP_ENTRY' }); },
    ]);
    const result = await repository.runInTransaction((manager) =>
      repository.updateItemInTransaction(manager, {
        id: '1', profileId: 'sdd-default', source: 'manual', title: 't',
      }),
    );
    expect(result).toEqual({ status: 'conflict' });
  });

  it('returns missing when affectedRows=0 (row deleted or not found)', async () => {
    const { repository } = createTxRepo([
      async () => ({ affectedRows: 0 }),
    ]);
    const result = await repository.runInTransaction((manager) =>
      repository.updateItemInTransaction(manager, {
        id: '1', profileId: 'sdd-default', source: 'manual', title: 't',
      }),
    );
    expect(result).toEqual({ status: 'missing' });
  });
});

describe('EvalItemRepository deleteItemInTransaction', () => {
  it('clears prompt/origin fields, sets tombstone, keeps item_key', async () => {
    let seenSql = '';
    let seenParams: unknown[] | undefined;
    const { repository } = createTxRepo([
      async (sql, params) => { seenSql = sql; seenParams = params; return { affectedRows: 1 }; },
    ]);
    const result = await repository.runInTransaction((manager) =>
      repository.deleteItemInTransaction(manager, {
        id: '1', profileId: 'sdd-default', userId: 'u1',
      }),
    );
    expect(result).toEqual({ status: 'deleted' });
    expect(seenSql).toContain('prompt_text = NULL');
    expect(seenSql).toContain('origin_interaction_id = NULL');
    expect(seenSql).toContain('deleted_at = CURRENT_TIMESTAMP(3)');
    expect(seenSql).toContain('deleted_at IS NULL'); // 幂等
    // SET 子句不含 item_key / profile_id / target_skill => 保留
    expect(seenSql).not.toMatch(/item_key\s*=/);
    expect(seenSql).not.toMatch(/target_skill\s*=/);
    expect(seenParams).toEqual(['u1', '1', 'sdd-default']);
  });

  it('returns missing when already deleted (idempotent)', async () => {
    const { repository } = createTxRepo([
      async () => ({ affectedRows: 0 }),
    ]);
    const result = await repository.runInTransaction((manager) =>
      repository.deleteItemInTransaction(manager, {
        id: '1', profileId: 'sdd-default', userId: 'u1',
      }),
    );
    expect(result).toEqual({ status: 'missing' });
  });
});
