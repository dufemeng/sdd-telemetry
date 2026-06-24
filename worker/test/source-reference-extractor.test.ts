import { describe, expect, it } from 'vitest';
import {
  decodeMaybeDoubleEncoded,
  deriveOnlineDocAction,
  extractSkillSourceReference,
  extractSourceReferences,
  SKILL_SOURCE_ACTION,
  type ToolCallFact,
} from '../src/jobs/source-reference-extractor';

function baseFact(overrides: Partial<ToolCallFact>): ToolCallFact {
  return {
    toolUseId: 'toolu_1',
    eventId: 'evt_1',
    toolName: 'Read',
    mcpServer: null,
    mcpToolName: null,
    toolInput: {},
    interactionId: 1,
    toolCallId: 10,
    userId: 100,
    sessionId: 'sess_1',
    promptId: 'prompt_1',
    eventTime: new Date('2026-06-04T00:00:00.000Z'),
    ...overrides,
  };
}

describe('extractSkillSourceReference', () => {
  const skillFact = {
    usageKey: 'usage_abc',
    skillName: 'bk-fe-design',
    interactionId: 1,
    userId: 100,
    sessionId: 'sess_1',
    promptId: 'prompt_1',
    invocationTrigger: 'user',
    skillSource: 'slash_command',
    status: 'observed',
    eventTime: new Date('2026-06-04T00:00:00.000Z'),
  };

  it('emits one skill source_reference per skill_usage', () => {
    const ref = extractSkillSourceReference(skillFact);
    expect(ref).not.toBeNull();
    expect(ref!.locatorType).toBe('skill');
    expect(ref!.actionType).toBe(SKILL_SOURCE_ACTION);
    expect(ref!.normalizedLocator).toBe('bk-fe-design');
    expect(ref!.toolCallId).toBeNull();
    expect(ref!.evidenceJson).toMatchObject({
      skillUsageKey: 'usage_abc',
      invocationTrigger: 'user',
      skillSource: 'slash_command',
      status: 'observed',
    });
  });

  it('is idempotent on usageKey (other fields do not change referenceKey)', () => {
    const a = extractSkillSourceReference(skillFact);
    const b = extractSkillSourceReference({ ...skillFact, interactionId: 999, eventTime: new Date(), invocationTrigger: 'auto', status: 'x' });
    expect(a!.referenceKey).toBe(b!.referenceKey);
  });

  it('different skill_usage -> different referenceKey', () => {
    const a = extractSkillSourceReference(skillFact);
    const b = extractSkillSourceReference({ ...skillFact, usageKey: 'usage_xyz' });
    expect(a!.referenceKey).not.toBe(b!.referenceKey);
  });

  it('returns null when usageKey or skillName missing', () => {
    expect(extractSkillSourceReference({ ...skillFact, usageKey: '' })).toBeNull();
    expect(extractSkillSourceReference({ ...skillFact, skillName: '' })).toBeNull();
  });
});

describe('decodeMaybeDoubleEncoded', () => {
  it('passes through a plain object', () => {
    const res = decodeMaybeDoubleEncoded({ file_path: '/a' });
    expect(res.parseFailed).toBe(false);
    expect(res.value).toEqual({ file_path: '/a' });
  });

  it('decodes a single-encoded JSON string', () => {
    const res = decodeMaybeDoubleEncoded('{"url":"https://x/y"}');
    expect(res.parseFailed).toBe(false);
    expect(res.value).toEqual({ url: 'https://x/y' });
  });

  it('decodes a double-encoded JSON string', () => {
    const inner = JSON.stringify({ docId: 'd1' });
    const outer = JSON.stringify(inner); // 字符串里再包一层
    const res = decodeMaybeDoubleEncoded(outer);
    expect(res.parseFailed).toBe(false);
    expect(res.value).toEqual({ docId: 'd1' });
  });

  it('flags invalid JSON as parseFailed', () => {
    const res = decodeMaybeDoubleEncoded('{not valid json');
    expect(res.parseFailed).toBe(true);
  });
});

describe('extractSourceReferences', () => {
  it('extracts a Read file path (object input)', () => {
    const refs = extractSourceReferences(
      baseFact({ toolName: 'Read', toolInput: { file_path: '/repo/wiki/a.md' } }),
    );
    expect(refs).toHaveLength(1);
    expect(refs[0]).toMatchObject({
      actionType: 'read',
      locatorType: 'path',
      direction: 'input',
      normalizedLocator: '/repo/wiki/a.md',
    });
    expect(refs[0].normalizedLocatorHash).toMatch(/^[a-f0-9]{64}$/);
    expect(refs[0].referenceKey).toMatch(/^[a-f0-9]{64}$/);
  });

  it('extracts a Write/Edit path with update-class action', () => {
    const refs = extractSourceReferences(
      baseFact({ toolName: 'Edit', toolInput: { file_path: '/repo/plan/x.md' } }),
    );
    expect(refs[0]).toMatchObject({ actionType: 'edit', locatorType: 'path' });
  });

  it('extracts Grep/Glob paths', () => {
    const grep = extractSourceReferences(
      baseFact({ toolName: 'Grep', toolInput: { path: '/repo/wiki' } }),
    );
    expect(grep[0]).toMatchObject({ actionType: 'grep', locatorType: 'path' });
    const glob = extractSourceReferences(
      baseFact({ toolName: 'Glob', toolInput: { path: '/repo/wiki', pattern: '**/*.md' } }),
    );
    expect(glob[0]).toMatchObject({ actionType: 'glob', locatorType: 'path' });
  });

  it('tags a glob/grep wildcard pattern as locator_type=pattern (not path)', () => {
    const glob = extractSourceReferences(
      baseFact({ toolName: 'Glob', toolInput: { pattern: '**/*.ts' } }),
    );
    expect(glob[0]).toMatchObject({ actionType: 'glob', locatorType: 'pattern' });
    const grep = extractSourceReferences(
      baseFact({ toolName: 'Grep', toolInput: { glob: '**/*.md' } }),
    );
    expect(grep[0]).toMatchObject({ actionType: 'grep', locatorType: 'pattern' });
    // 有真实 path 时仍是 path
    const globPath = extractSourceReferences(
      baseFact({ toolName: 'Glob', toolInput: { path: '/repo/wiki', pattern: '**/*.md' } }),
    );
    expect(globPath[0]).toMatchObject({ locatorType: 'path' });
  });

  it('extracts an MCP online-doc URL from a double-encoded string input', () => {
    const refs = extractSourceReferences(
      baseFact({
        toolName: 'mcp__docs__read',
        mcpServer: 'docs',
        toolInput: JSON.stringify({ url: 'https://host/creditdoc/frontedndoc/abc123' }),
      }),
    );
    expect(refs).toHaveLength(1);
    expect(refs[0]).toMatchObject({
      actionType: 'read',
      locatorType: 'url',
      url: 'https://host/creditdoc/frontedndoc/abc123',
      mcpToolName: 'mcp__docs__read',
    });
  });

  it('extracts a numeric MCP doc_id as locator_type=mcp_doc (not unknown)', () => {
    // 语雀 MCP 的 doc_id 是 JSON number（如 549492727），不是字符串。
    const refs = extractSourceReferences(
      baseFact({
        toolName: 'mcp__user__get_doc',
        mcpServer: 'user',
        toolInput: { doc_id: 549492727 },
      }),
    );
    expect(refs).toHaveLength(1);
    expect(refs[0]).toMatchObject({
      actionType: 'read',
      locatorType: 'mcp_doc',
      docId: '549492727',
      normalizedLocator: '549492727',
    });
  });

  it('maps a numeric Yuque book_id to the collection locator', () => {
    const refs = extractSourceReferences(
      baseFact({
        toolName: 'mcp__user__list_docs',
        mcpServer: 'user',
        toolInput: { book_id: 12345 },
      }),
    );
    expect(refs).toHaveLength(1);
    expect(refs[0]).toMatchObject({
      locatorType: 'mcp_doc',
      collectionId: '12345',
    });
  });

  // 生产真实形态：Claude Code 把 tool_name 匿名成 "mcp_tool"，真名/真服务器名经 writer 解出后填 mcpToolName/mcpServer。
  it('derives an UPDATE action from the real mcp tool name (anonymized tool_name=mcp_tool)', () => {
    const refs = extractSourceReferences(
      baseFact({
        toolName: 'mcp_tool',
        mcpServer: 'skylarkmcpserver',
        mcpToolName: 'skylark_doc_update',
        toolInput: { doc_id: 509472326 },
      }),
    );
    expect(refs).toHaveLength(1);
    expect(refs[0]).toMatchObject({
      actionType: 'update',
      locatorType: 'mcp_doc',
      docId: '509472326',
      mcpServer: 'skylarkmcpserver',
      mcpToolName: 'skylark_doc_update', // 存真名，不是 "mcp_tool"
    });
  });

  it('derives a WRITE action for a create-type mcp tool', () => {
    const refs = extractSourceReferences(
      baseFact({
        toolName: 'mcp_tool',
        mcpServer: 'skylarkmcpserver',
        mcpToolName: 'skylark_doc_create',
        toolInput: { book_id: 12345, title: 'm-loan 需求' },
      }),
    );
    expect(refs[0]).toMatchObject({ actionType: 'write', mcpToolName: 'skylark_doc_create' });
  });

  it('keeps READ for detail/resolve mcp tools', () => {
    const detail = extractSourceReferences(
      baseFact({
        toolName: 'mcp_tool',
        mcpServer: 'skylarkmcpserver',
        mcpToolName: 'skylark_doc_detail',
        toolInput: { doc_id: 509472326 },
      }),
    );
    expect(detail[0]).toMatchObject({ actionType: 'read', mcpToolName: 'skylark_doc_detail' });

    const resolve = extractSourceReferences(
      baseFact({
        toolName: 'mcp_tool',
        mcpServer: 'skylarkmcpserver',
        mcpToolName: 'skylark_resolve_url',
        toolInput: { url: 'https://yuque.antfin.com/x/y/z' },
      }),
    );
    expect(resolve[0]).toMatchObject({ actionType: 'read', locatorType: 'url' });
  });

  it('deriveOnlineDocAction maps tool-name semantics to read/write/update/delete', () => {
    expect(deriveOnlineDocAction('skylark_doc_update')).toBe('update');
    expect(deriveOnlineDocAction('skylark_doc_create')).toBe('write');
    expect(deriveOnlineDocAction('doc_save')).toBe('write');
    expect(deriveOnlineDocAction('skylark_doc_delete')).toBe('delete');
    expect(deriveOnlineDocAction('skylark_doc_detail')).toBe('read');
    expect(deriveOnlineDocAction('skylark_resolve_url')).toBe('read');
    expect(deriveOnlineDocAction('mcp_tool')).toBe('read'); // 匿名名无语义 → read
    expect(deriveOnlineDocAction(null)).toBe('read');
  });

  it('records parse_failed as an unknown locator without throwing', () => {
    const refs = extractSourceReferences(
      baseFact({ toolName: 'Read', toolInput: '{broken json' }),
    );
    expect(refs).toHaveLength(1);
    expect(refs[0]).toMatchObject({ locatorType: 'unknown', actionType: 'unknown' });
    expect(refs[0].evidenceJson).toMatchObject({ parseFailed: true });
  });

  it('produces multiple locators from one tool call', () => {
    const refs = extractSourceReferences(
      baseFact({ toolName: 'Read', toolInput: { file_path: ['/repo/a.md', '/repo/b.md'] } }),
    );
    expect(refs).toHaveLength(2);
    const keys = new Set(refs.map((r) => r.referenceKey));
    expect(keys.size).toBe(2); // 不同 locator → 不同 reference_key
  });

  it('returns nothing for non-locator tools', () => {
    expect(extractSourceReferences(baseFact({ toolName: 'Bash', toolInput: { command: 'ls' } }))).toEqual([]);
  });

  it('skips when no stable evidence id is available', () => {
    expect(
      extractSourceReferences(
        baseFact({ toolUseId: null, eventId: null, toolInput: { file_path: '/a' } }),
      ),
    ).toEqual([]);
  });
});
