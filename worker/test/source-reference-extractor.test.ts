import { describe, expect, it } from 'vitest';
import {
  decodeMaybeDoubleEncoded,
  extractSourceReferences,
  type ToolCallFact,
} from '../src/jobs/source-reference-extractor';

function baseFact(overrides: Partial<ToolCallFact>): ToolCallFact {
  return {
    toolUseId: 'toolu_1',
    eventId: 'evt_1',
    toolName: 'Read',
    mcpServer: null,
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
