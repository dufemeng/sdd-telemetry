import { describe, expect, it } from 'vitest';
import { summarizeCodeImpactRows } from '../src/modules/reports/daily-report-code-impact';

describe('summarizeCodeImpactRows', () => {
  it('counts SDD code activity while excluding requirements and wiki roots', () => {
    const impact = summarizeCodeImpactRows([
      {
        toolName: 'Edit',
        toolInputPreview: JSON.stringify({
          file_path: '/Users/alice/work/bk-strategy-fe/src/pages/CaseList/index.tsx',
        }),
        userId: '1',
        requirementsRootPath: '/Users/alice/work/bk-fe-requirements-trade',
        wikiRootPath: '/Users/alice/work/bk-fe-knowledge-trade',
      },
      {
        toolName: 'Read',
        toolInputPreview: JSON.stringify({
          file_path: '/Users/alice/work/bk-strategy-fe/src/pages/CaseList/index.tsx',
        }),
        userId: '1',
        requirementsRootPath: '/Users/alice/work/bk-fe-requirements-trade',
        wikiRootPath: '/Users/alice/work/bk-fe-knowledge-trade',
      },
      {
        toolName: 'Write',
        toolInputPreview: JSON.stringify({
          file_path: '/Users/alice/work/bk-fe-requirements-trade/domain-trade/foo/design.md',
        }),
        userId: '1',
        requirementsRootPath: '/Users/alice/work/bk-fe-requirements-trade',
        wikiRootPath: '/Users/alice/work/bk-fe-knowledge-trade',
      },
      {
        toolName: 'Read',
        toolInputPreview: JSON.stringify({
          file_path: '/Users/alice/work/bk-fe-knowledge-trade/domain-trade/payments.md',
        }),
        userId: '1',
        requirementsRootPath: '/Users/alice/work/bk-fe-requirements-trade',
        wikiRootPath: '/Users/alice/work/bk-fe-knowledge-trade',
      },
      {
        toolName: 'Glob',
        toolInputPreview: JSON.stringify({
          path: '/Users/bob/repo/bk-loan-fe/src',
        }),
        userId: '2',
        requirementsRootPath: '/Users/bob/repo/bk-fe-requirements-loan',
        wikiRootPath: '/Users/bob/repo/bk-fe-knowledge-loan',
      },
    ]);

    expect(impact.codeWriteCount).toBe(1);
    expect(impact.codeReadCount).toBe(2);
    expect(impact.touchedFileCount).toBe(1);
    expect(impact.contributorCount).toBe(2);
    expect(impact.topRepositories).toEqual([
      { repository: 'bk-strategy-fe', writeCount: 1, readCount: 1 },
      { repository: 'bk-loan-fe', writeCount: 0, readCount: 1 },
    ]);
    expect(impact.summary).toBe(
      '昨日 SDD 参与代码改动 1 次，配套读取 2 次，涉及 1 个代码文件、2 位用户。',
    );
  });

  it('extracts file_path from truncated JSON previews', () => {
    const impact = summarizeCodeImpactRows([
      {
        toolName: 'Edit',
        toolInputPreview:
          '{"file_path":"/Users/alice/work/bk-strategy-fe/src/App.tsx","old_string":"unterminated',
        userId: '1',
        requirementsRootPath: '/Users/alice/work/bk-fe-requirements-trade',
        wikiRootPath: '/Users/alice/work/bk-fe-knowledge-trade',
      },
    ]);

    expect(impact.codeWriteCount).toBe(1);
    expect(impact.touchedFileCount).toBe(1);
    expect(impact.topRepositories[0]?.repository).toBe('bk-strategy-fe');
  });
});
