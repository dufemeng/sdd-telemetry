import { describe, expect, it } from 'vitest';
import {
  buildPathDimensionSummaries,
  buildPathSegmentKnowledgeTimeline,
  extractPathSegments,
} from '../src/modules/profiles/profile-knowledge-timeline';

describe('profile knowledge timeline path dimensions', () => {
  it('keeps access totals separate from overlapping path dimensions', () => {
    const timeline = buildPathSegmentKnowledgeTimeline(
      [
        {
          eventTime: '2026-06-18T10:00:00.000Z',
          relativePath: 'domain-cashier/system/apps/transfer-h5/innerFlow/转入到活期.md',
          locator: null,
        },
        {
          eventTime: '2026-06-18T10:05:00.000Z',
          relativePath: 'domain-cashier/business/innerFlow/transfer-h5/pages/转入到活期.md',
          locator: null,
        },
        {
          eventTime: '2026-06-18T10:10:00.000Z',
          relativePath: 'domain-cashier/pageFlow/transfer-h5/转入到活期.md',
          locator: null,
        },
        {
          eventTime: '2026-06-18T10:15:00.000Z',
          relativePath: 'domain-cashier/crossFlow/modules/transfer-h5/转入到活期.md',
          locator: null,
        },
      ],
      'day',
    );

    expect(timeline.buckets).toEqual([{ t: '2026-06-18T00:00:00.000Z', accessCount: 4 }]);
    expect(timeline.dimensions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ segment: 'innerFlow', accessCount: 2 }),
        expect.objectContaining({ segment: 'pageFlow', accessCount: 1 }),
        expect.objectContaining({ segment: 'crossFlow', accessCount: 1 }),
        expect.objectContaining({ segment: 'modules', accessCount: 1 }),
      ]),
    );
    expect(timeline.dimensions.some((item) => item.segment === '其他')).toBe(false);
  });

  it('filters facts by an exact path segment before aggregating', () => {
    const timeline = buildPathSegmentKnowledgeTimeline(
      [
        {
          eventTime: '2026-06-18T10:00:00.000Z',
          relativePath: 'domain-cashier/innerFlow/a.md',
          locator: null,
        },
        {
          eventTime: '2026-06-18T10:05:00.000Z',
          relativePath: 'domain-wealth/innerFlow/b.md',
          locator: null,
        },
      ],
      'day',
      'domain-cashier',
    );

    expect(timeline.buckets).toEqual([{ t: '2026-06-18T00:00:00.000Z', accessCount: 1 }]);
    expect(timeline.dimensions.some((item) => item.segment === 'domain-wealth')).toBe(false);
  });

  it('keeps directory segments and drops the file name', () => {
    expect(
      extractPathSegments('domain-cashier/business/innerFlow/transfer-h5/pages/转入到活期.md'),
    ).toEqual(['domain-cashier', 'business', 'innerFlow', 'transfer-h5', 'pages']);
  });

  it('aggregates the same segment across arbitrary path depths', () => {
    expect(
      buildPathDimensionSummaries([
        {
          sourceNamespace: 'trade',
          relativePath: 'domain-cashier/system/apps/transfer-h5/innerFlow/转入到活期.md',
          accessCount: 4,
          userId: '1',
          lastAccessAt: '2026-06-18T10:00:00.000Z',
        },
        {
          sourceNamespace: 'trade',
          relativePath: 'domain-cashier/business/innerFlow/transfer-h5/pages/转入到活期.md',
          accessCount: 4,
          userId: '2',
          lastAccessAt: '2026-06-18T11:00:00.000Z',
        },
      ]),
    ).toContainEqual({
      sourceNamespace: 'trade',
      pathSegment: 'innerFlow',
      accessedDocs: 2,
      accessCount: 8,
      distinctUsers: 2,
      lastAccessAt: '2026-06-18T11:00:00.000Z',
    });
  });
});
