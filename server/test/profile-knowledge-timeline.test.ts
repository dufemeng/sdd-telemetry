import { describe, expect, it } from 'vitest';
import {
  buildPathSegmentKnowledgeTimeline,
  extractPathSegments,
} from '../src/modules/profiles/profile-knowledge-timeline';

describe('profile knowledge timeline path dimensions', () => {
  it('aggregates the same path segment across different depths', () => {
    const points = buildPathSegmentKnowledgeTimeline([
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
    ], 'day');

    expect(points).toContainEqual({
      t: '2026-06-18T00:00:00.000Z',
      group: 'innerFlow',
      count: 2,
    });
  });

  it('keeps directory segments and drops the file name', () => {
    expect(extractPathSegments('domain-cashier/business/innerFlow/transfer-h5/pages/转入到活期.md'))
      .toEqual(['domain-cashier', 'business', 'innerFlow', 'transfer-h5', 'pages']);
  });
});
