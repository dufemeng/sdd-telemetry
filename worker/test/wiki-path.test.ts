import { describe, expect, it } from 'vitest';
import { relativeWikiPath, extractCandidatePath } from '../src/jobs/wiki-path';

describe('relativeWikiPath', () => {
  const wikiRoot = '/Users/loomis/wiki';

  it('只剥离知识库根，不解释路径结构', () => {
    expect(
      relativeWikiPath(
        wikiRoot,
        '/Users/loomis/wiki/domain-cashier/system/apps/transfer-h5/innerFlow/转入到活期.md',
      ),
    ).toBe('domain-cashier/system/apps/transfer-h5/innerFlow/转入到活期.md');
    expect(
      relativeWikiPath(
        wikiRoot,
        '/Users/loomis/wiki/domain-cashier/business/innerFlow/transfer-h5/pages/转入到活期.md',
      ),
    ).toBe('domain-cashier/business/innerFlow/transfer-h5/pages/转入到活期.md');
  });

  it('保留根目录文件', () => {
    expect(relativeWikiPath(wikiRoot, '/Users/loomis/wiki/SUMMARY.md')).toBe('SUMMARY.md');
  });

  it('路径不在知识库下时返回 null', () => {
    expect(relativeWikiPath(wikiRoot, '/elsewhere/foo.md')).toBeNull();
  });

  it('wiki_root 尾部带 /', () => {
    expect(relativeWikiPath('/Users/loomis/wiki/', '/Users/loomis/wiki/domain-x/data/m.md')).toBe(
      'domain-x/data/m.md',
    );
  });

  it('含 ../ 段（应被 normalize）', () => {
    expect(
      relativeWikiPath(wikiRoot, '/Users/loomis/wiki/domain-cashier/../domain-cashier/data/m.md'),
    ).toBe('domain-cashier/data/m.md');
  });
});

describe('extractCandidatePath', () => {
  it('Read 工具取 file_path', () => {
    expect(extractCandidatePath('Read', { file_path: '/x/y.md' })).toEqual({
      actionType: 'read',
      candidate: '/x/y.md',
    });
  });

  it('Glob 工具优先取 path 再取 pattern', () => {
    expect(extractCandidatePath('Glob', { path: '/root', pattern: '*.md' })).toEqual({
      actionType: 'glob',
      candidate: '/root',
    });
    expect(extractCandidatePath('Glob', { pattern: '**/*.md' })).toEqual({
      actionType: 'glob',
      candidate: '**/*.md',
    });
  });

  it('Grep 工具取 path 或 glob', () => {
    expect(extractCandidatePath('Grep', { path: '/root', pattern: 'foo' })).toEqual({
      actionType: 'grep',
      candidate: '/root',
    });
    expect(extractCandidatePath('Grep', { glob: '*.md', pattern: 'foo' })).toEqual({
      actionType: 'grep',
      candidate: '*.md',
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
