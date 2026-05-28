import { describe, expect, it } from 'vitest';
import { parseWikiPath, extractCandidatePath } from '../src/jobs/wiki-path';

describe('parseWikiPath', () => {
  const wikiRoot = '/Users/loomis/wiki';

  it('解析完整 system 路径', () => {
    const r = parseWikiPath(wikiRoot, '/Users/loomis/wiki/domain-cashier/system/apps/bk-cashier-sdk/core.md');
    expect(r).toEqual({
      relative: 'domain-cashier/system/apps/bk-cashier-sdk/core.md',
      domain: 'cashier',
      axis: 'system',
      system: 'bk-cashier-sdk',
    });
  });

  it('解析 business/pages 路径', () => {
    const r = parseWikiPath(wikiRoot, '/Users/loomis/wiki/domain-cashier/business/pages/sign-flow.md');
    expect(r).toEqual({
      relative: 'domain-cashier/business/pages/sign-flow.md',
      domain: 'cashier',
      axis: 'business',
      system: null,
    });
  });

  it('解析根目录文件', () => {
    const r = parseWikiPath(wikiRoot, '/Users/loomis/wiki/SUMMARY.md');
    expect(r).toEqual({
      relative: 'SUMMARY.md',
      domain: null,
      axis: 'root',
      system: null,
    });
  });

  it('路径不在 wiki 下时全部 null', () => {
    expect(parseWikiPath(wikiRoot, '/elsewhere/foo.md')).toEqual({
      relative: null, domain: null, axis: null, system: null,
    });
  });

  it('domain 目录但首段不是 domain- 前缀', () => {
    const r = parseWikiPath(wikiRoot, '/Users/loomis/wiki/scratch/x.md');
    expect(r.domain).toBeNull();
    expect(r.axis).toBe('root');
  });

  it('axis=system 但无 apps/ 二级目录', () => {
    const r = parseWikiPath(wikiRoot, '/Users/loomis/wiki/domain-cashier/system/README.md');
    expect(r).toEqual({
      relative: 'domain-cashier/system/README.md',
      domain: 'cashier',
      axis: 'system',
      system: null,
    });
  });

  it('wiki_root 尾部带 /', () => {
    expect(parseWikiPath('/Users/loomis/wiki/', '/Users/loomis/wiki/domain-x/data/m.md')).toEqual({
      relative: 'domain-x/data/m.md',
      domain: 'x',
      axis: 'data',
      system: null,
    });
  });

  it('含 ../ 段（应被 normalize）', () => {
    const r = parseWikiPath(wikiRoot, '/Users/loomis/wiki/domain-cashier/../domain-cashier/data/m.md');
    expect(r.relative).toBe('domain-cashier/data/m.md');
  });
});

describe('extractCandidatePath', () => {
  it('Read 工具取 file_path', () => {
    expect(extractCandidatePath('Read', { file_path: '/x/y.md' })).toEqual({
      actionType: 'read', candidate: '/x/y.md',
    });
  });

  it('Glob 工具优先取 path 再取 pattern', () => {
    expect(extractCandidatePath('Glob', { path: '/root', pattern: '*.md' })).toEqual({
      actionType: 'glob', candidate: '/root',
    });
    expect(extractCandidatePath('Glob', { pattern: '**/*.md' })).toEqual({
      actionType: 'glob', candidate: '**/*.md',
    });
  });

  it('Grep 工具取 path 或 glob', () => {
    expect(extractCandidatePath('Grep', { path: '/root', pattern: 'foo' })).toEqual({
      actionType: 'grep', candidate: '/root',
    });
    expect(extractCandidatePath('Grep', { glob: '*.md', pattern: 'foo' })).toEqual({
      actionType: 'grep', candidate: '*.md',
    });
  });

  it('未知 tool 返回 null', () => {
    expect(extractCandidatePath('Bash', { command: 'ls' })).toBeNull();
  });

  it('Read 缺失 file_path 返回 null', () => {
    expect(extractCandidatePath('Read', {})).toBeNull();
  });

  it('Read 但是相对路径不算 candidate（spec 4.7 边界）', () => {
    expect(extractCandidatePath('Read', { file_path: 'rel/x.md' })).toBeNull();
  });
});
