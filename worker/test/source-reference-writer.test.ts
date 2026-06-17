import { describe, expect, it, vi } from 'vitest';
import { SourceReferenceWriter, type SourceReferenceWriteStats } from '../src/jobs/source-reference/writer';

// source_references INSERT 的列数（见 writer.ts upsert 列表）。每行批量写入会带这么多占位符。
const SOURCE_REFERENCE_COLUMNS = 25;

function skillUsageRow(over: Record<string, unknown> = {}) {
  return {
    id: 1,
    usage_key: 'usage-key-1',
    raw_skill_name: 'superpowers:brainstorming',
    interaction_id: 99,
    user_id: 7,
    session_id: 's1',
    prompt_id: 'p1',
    invocation_trigger: 'explicit',
    skill_source: 'user',
    status: 'observed',
    event_time: new Date('2026-06-17T10:00:00Z'),
    ...over,
  };
}

function emptyStats(): SourceReferenceWriteStats {
  return { toolCalls: 0, extracted: 0, parseFailed: 0, unknown: 0, skillUsages: 0, affectedRows: 0 };
}

/**
 * 构造一个按 SQL 内容路由的 mock pool。
 * sdd_skill_usages 的 SELECT 只在「第一次」匹配时返回行、之后返回空——
 * 这样即便被测代码还在跑老的全表分页扫（id > ?），也能在 2 次内终止，
 * 避免 RED 阶段死循环超时，让断言失败成为干净的红。
 */
function makeMockPool(skillRows: ReturnType<typeof skillUsageRow>[]) {
  let skillSelectCalls = 0;
  const query = vi.fn().mockImplementation((sql: string) => {
    if (/FROM sdd_interaction_tool_calls/.test(sql)) return Promise.resolve([[]]);
    if (/FROM sdd_skill_usages/.test(sql)) {
      skillSelectCalls += 1;
      return Promise.resolve([skillSelectCalls === 1 ? skillRows : []]);
    }
    if (/INSERT INTO source_references/.test(sql)) return Promise.resolve([{ affectedRows: skillRows.length }]);
    return Promise.resolve([[]]);
  });
  return { query };
}

describe('SourceReferenceWriter 增量 skill 引用（增量键 + 批量写）', () => {
  it('emitSkillReferencesForKeys 把多行 skill 引用合并成单条多值 INSERT', async () => {
    const pool = makeMockPool([
      skillUsageRow({ id: 1, usage_key: 'k1' }),
      skillUsageRow({ id: 2, usage_key: 'k2' }),
    ]);
    const writer = new SourceReferenceWriter();
    const stats = emptyStats();

    await writer.emitSkillReferencesForKeys(pool as never, ['k1', 'k2'], stats);

    const inserts = pool.query.mock.calls.filter((c) => /INSERT INTO source_references/.test(c[0] as string));
    expect(inserts).toHaveLength(1); // 单条 INSERT，而不是每行一条
    const placeholders = ((inserts[0]![0] as string).match(/\?/g) ?? []).length;
    expect(placeholders).toBe(SOURCE_REFERENCE_COLUMNS * 2); // 两行批进同一条语句
    expect((inserts[0]![1] as unknown[]).length).toBe(SOURCE_REFERENCE_COLUMNS * 2);
    expect(stats.skillUsages).toBe(2);
  });

  it('emitSkillReferencesForKeys 按 usage_key 取数：不全表分页扫、不按 batch 过滤', async () => {
    const pool = makeMockPool([skillUsageRow({ usage_key: 'k1' })]);
    const writer = new SourceReferenceWriter();

    await writer.emitSkillReferencesForKeys(pool as never, ['k1'], emptyStats());

    const selects = pool.query.mock.calls.filter((c) => /FROM sdd_skill_usages/.test(c[0] as string));
    expect(selects).toHaveLength(1);
    const sql = selects[0]![0] as string;
    expect(sql).toMatch(/usage_key IN/);
    expect(sql).not.toMatch(/id > \?/); // 不是老的全表分页扫
    // 关键回归护栏：不能按 batch 过滤，否则会漏掉 interaction 属于更早批次的 skill_usage（见 writer.ts 注释 66-72）
    expect(sql).not.toMatch(/batch_id/);
    expect(selects[0]![1]).toEqual(['k1']);
  });

  it('emitSkillReferencesForKeys 空 keys 时完全不访问数据库', async () => {
    const query = vi.fn();
    const writer = new SourceReferenceWriter();

    await writer.emitSkillReferencesForKeys({ query } as never, [], emptyStats());

    expect(query).not.toHaveBeenCalled();
  });

  it('updateForBatch 传入 keys 走增量（usage_key IN）', async () => {
    const pool = makeMockPool([skillUsageRow({ usage_key: 'k1' })]);
    const writer = new SourceReferenceWriter();

    await writer.updateForBatch(pool as never, 'batch-Y', ['k1']);

    const skillSelects = pool.query.mock.calls.filter((c) => /FROM sdd_skill_usages/.test(c[0] as string));
    expect(skillSelects.length).toBeGreaterThan(0);
    expect(skillSelects.every((c) => /usage_key IN/.test(c[0] as string))).toBe(true);
  });

  it('updateForBatch 传入 null 回退到全表重建（保留 reclean / skipped 重试的完整性）', async () => {
    const pool = makeMockPool([skillUsageRow({ id: 1, usage_key: 'k1' })]);
    const writer = new SourceReferenceWriter();

    await writer.updateForBatch(pool as never, 'batch-Y', null);

    const skillSelects = pool.query.mock.calls.filter((c) => /FROM sdd_skill_usages/.test(c[0] as string));
    expect(skillSelects.some((c) => /id > \?/.test(c[0] as string))).toBe(true); // 全表分页扫
  });
});
