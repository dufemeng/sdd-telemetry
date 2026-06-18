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

// Read + file_path 会被 extractSourceReferences 抽出恰好 1 条 path 类 source reference。
function toolCallRow(over: Record<string, unknown> = {}) {
  return {
    source_batch_id: 'batch-X',
    tool_call_id: 1,
    tool_use_id: 'toolu_1',
    tool_name: 'Read',
    mcp_server_scope: null,
    interaction_id: 10,
    user_id: 7,
    session_id: 's1',
    prompt_id: 'p1',
    source_event_id: 'evt-1',
    event_time: new Date('2026-06-17T10:00:00Z'),
    attributes_json: { tool_input: { file_path: '/repo/wiki/a.md' } },
    ...over,
  };
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

  it('updateForBatch 的 tool-call 路径把多个 source ref 合并成单条批量 INSERT', async () => {
    let toolSelectCalls = 0;
    const query = vi.fn().mockImplementation((sql: string) => {
      if (/FROM sdd_interaction_tool_calls/.test(sql)) {
        toolSelectCalls += 1;
        return Promise.resolve([
          toolSelectCalls === 1
            ? [
                toolCallRow({ tool_call_id: 1, tool_use_id: 't1', source_event_id: 'e1' }),
                toolCallRow({
                  tool_call_id: 2,
                  tool_use_id: 't2',
                  source_event_id: 'e2',
                  attributes_json: { tool_input: { file_path: '/repo/wiki/b.md' } },
                }),
              ]
            : [],
        ]);
      }
      if (/INSERT INTO source_references/.test(sql)) return Promise.resolve([{ affectedRows: 2 }]);
      return Promise.resolve([[]]);
    });
    const writer = new SourceReferenceWriter();

    // skillUsageKeys=[] 跳过 skill 路径,只剩 tool-call 的 INSERT
    await writer.updateForBatch({ query } as never, 'batch-X', []);

    const inserts = query.mock.calls.filter((c) => /INSERT INTO source_references/.test(c[0] as string));
    expect(inserts).toHaveLength(1); // 两个 ref 合并成一条,而不是每个 ref 一条
    const placeholders = ((inserts[0]![0] as string).match(/\?/g) ?? []).length;
    expect(placeholders).toBe(25 * 2);
  });

  it('updateForBatch 传入 toolUseIds 时按 tc.tool_use_id IN 取数,不扫全表/不按 e.batch_id 过滤', async () => {
    let toolSelectCalls = 0;
    const query = vi.fn().mockImplementation((sql: string) => {
      if (/FROM sdd_interaction_tool_calls/.test(sql)) {
        toolSelectCalls += 1;
        return Promise.resolve([toolSelectCalls === 1 ? [toolCallRow({ tool_use_id: 'tu1' })] : []]);
      }
      if (/INSERT INTO source_references/.test(sql)) return Promise.resolve([{ affectedRows: 1 }]);
      return Promise.resolve([[]]);
    });
    const writer = new SourceReferenceWriter();

    // skillUsageKeys=[] 跳过 skill;toolUseIds 提供 → tool-call 走增量(唯一索引取数)
    await writer.updateForBatch({ query } as never, 'batch-X', [], ['tu1']);

    const toolSelects = query.mock.calls.filter((c) => /FROM sdd_interaction_tool_calls/.test(c[0] as string));
    expect(toolSelects.length).toBeGreaterThan(0);
    const sql = toolSelects[0]![0] as string;
    expect(sql).toMatch(/tool_use_id IN/);
    expect(sql).not.toMatch(/tc\.id > \?/); // 不再全表分页扫
    expect(sql).not.toMatch(/e\.batch_id = \?/); // 不再按 join 后的 batch_id 过滤
    expect(toolSelects[0]![1]).toEqual(['tu1']);
  });
});
