import { describe, expect, it } from 'vitest';
import { classifyDoc, buildCoverage, type ScannedDoc, type RecallAgg } from '../src/modules/sdd/wiki-coverage';

const DAY = 86_400_000;
const NOW = Date.UTC(2026, 5, 1);

const emptyUsers = { domainUsers: [], repoUsers: [] };

describe('classifyDoc', () => {
  it('召回 >= 热门阈值 → hot', () => {
    expect(classifyDoc(10, NOW - 100 * DAY, NOW, 30)).toBe('hot');
  });
  it('召回 1..阈值-1 → cold', () => {
    expect(classifyDoc(3, NOW - 100 * DAY, NOW, 30)).toBe('cold');
  });
  it('零召回且加入 <= 宽限期 → new', () => {
    expect(classifyDoc(0, NOW - 5 * DAY, NOW, 30)).toBe('new');
  });
  it('零召回且加入 > 宽限期 → dead', () => {
    expect(classifyDoc(0, NOW - 40 * DAY, NOW, 30)).toBe('dead');
  });
});

describe('buildCoverage', () => {
  const scanned: ScannedDoc[] = [
    { repo: 'trade', domain: 'cashier', relativePath: 'domain-cashier/business/INDEX.md', axis: 'business', system: null, mtimeMs: NOW - 100 * DAY },
    { repo: 'trade', domain: 'cashier', relativePath: 'domain-cashier/business/cold.md', axis: 'business', system: null, mtimeMs: NOW - 100 * DAY },
    { repo: 'trade', domain: 'cashier', relativePath: 'domain-cashier/business/dead.md', axis: 'business', system: null, mtimeMs: NOW - 40 * DAY },
    { repo: 'trade', domain: 'cashier', relativePath: 'domain-cashier/business/new.md', axis: 'business', system: null, mtimeMs: NOW - 5 * DAY },
  ];
  const recalls: RecallAgg[] = [
    { repo: 'trade', relativePath: 'domain-cashier/business/INDEX.md', recallCount: 20, distinctUsers: 5, lastRecallAt: '2026-05-30T00:00:00.000Z', lastToolCallId: '111' },
    { repo: 'trade', relativePath: 'domain-cashier/business/cold.md', recallCount: 2, distinctUsers: 1, lastRecallAt: '2026-05-20T00:00:00.000Z', lastToolCallId: '222' },
    { repo: 'trade', relativePath: 'domain-cashier/business/gone.md', recallCount: 9, distinctUsers: 3, lastRecallAt: '2026-04-01T00:00:00.000Z', lastToolCallId: '333' },
  ];

  it('利用率 = 被召回 ∩ 库内 / 库内总数', () => {
    const c = buildCoverage(scanned, recalls, emptyUsers.domainUsers, emptyUsers.repoUsers, NOW, 30);
    expect(c.totals.totalDocs).toBe(4);
    expect(c.totals.recalledDocs).toBe(2);
    expect(c.totals.coverageRate).toBeCloseTo(0.5);
    expect(c.totals.deadDocs).toBe(1);
    expect(c.totals.newUnreadDocs).toBe(1);
    expect(c.totals.coldDocs).toBe(1);
    expect(c.totals.orphanPaths).toBe(1);
  });

  it('按 repo 汇总与中文 label', () => {
    const c = buildCoverage(scanned, recalls, emptyUsers.domainUsers, emptyUsers.repoUsers, NOW, 30);
    const trade = c.repos.find((r) => r.repo === 'trade')!;
    expect(trade.label).toBe('交易');
    expect(trade.totalDocs).toBe(4);
    expect(trade.recalls).toBe(22);
  });

  it('按 domain 汇总', () => {
    const c = buildCoverage(scanned, recalls, emptyUsers.domainUsers, emptyUsers.repoUsers, NOW, 30);
    const d = c.domains.find((x) => x.domain === 'cashier')!;
    expect(d.deadDocs).toBe(1);
    expect(d.recalledDocs).toBe(2);
  });

  it('domain distinctUsers 来自 lookup 而非逐文档累加', () => {
    const domainUsers = [{ domain: 'cashier', repo: 'trade', distinctUsers: 7 }];
    const repoUsers = [{ repo: 'trade', distinctUsers: 12 }];
    const c = buildCoverage(scanned, recalls, domainUsers, repoUsers, NOW, 30);
    const d = c.domains.find((x) => x.domain === 'cashier')!;
    expect(d.distinctUsers).toBe(7);
    const trade = c.repos.find((r) => r.repo === 'trade')!;
    expect(trade.distinctUsers).toBe(12);
  });
});
