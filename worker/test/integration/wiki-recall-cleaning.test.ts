import { describe, expect, it } from 'vitest';
import { extractCandidatePath, parseWikiPath } from '../../src/jobs/wiki-path';

describe('wiki-recall 端到端字段映射', () => {
  it('从 Read tool_input 到 wiki_recall 行的完整解析', () => {
    const wikiRoot = '/Users/u/wiki';
    const input = {
      file_path: '/Users/u/wiki/domain-cashier/system/apps/bk-cashier-sdk/core.md',
    };
    const candidate = extractCandidatePath('Read', input);
    expect(candidate).not.toBeNull();
    const parsed = parseWikiPath(wikiRoot, candidate!.candidate);
    expect(parsed).toEqual({
      relative: 'domain-cashier/system/apps/bk-cashier-sdk/core.md',
      domain: 'cashier',
      axis: 'system',
      system: 'bk-cashier-sdk',
    });
  });
});
