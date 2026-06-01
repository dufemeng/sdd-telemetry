import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { deriveRepoName, resolveWikiContentPath } from '../src/modules/sdd/wiki-content';

describe('deriveRepoName', () => {
  it('rawPath 以 relativePath 结尾时，取仓库根目录名', () => {
    expect(
      deriveRepoName(
        '/Users/zhangsan/dev/bk-fe-knowledge-trade/domain-cashier/business/INDEX.md',
        'domain-cashier/business/INDEX.md',
      ),
    ).toBe('bk-fe-knowledge-trade');
  });

  it('relativePath 为空时，回退匹配 bk-fe-knowledge-* 段', () => {
    expect(
      deriveRepoName('/Users/x/bk-fe-knowledge-wealth/domain-fund/INDEX.md', null),
    ).toBe('bk-fe-knowledge-wealth');
  });

  it('两者都判不出时返回 null', () => {
    expect(deriveRepoName('/tmp/random/file.md', null)).toBeNull();
  });
});

describe('resolveWikiContentPath', () => {
  it('正常拼接得到仓库内绝对路径', () => {
    const root = '/knowledge';
    expect(resolveWikiContentPath(root, 'bk-fe-knowledge-trade', 'domain-cashier/business/INDEX.md')).toBe(
      path.resolve('/knowledge/bk-fe-knowledge-trade/domain-cashier/business/INDEX.md'),
    );
  });

  it('相对路径越权（../）返回 null', () => {
    expect(resolveWikiContentPath('/knowledge', 'bk-fe-knowledge-trade', '../../etc/passwd')).toBeNull();
  });
});
