import { describe, expect, it } from 'vitest';
import type { ProfileKnowledgeTimelineResponse } from '@sdd-telemetry/api';
import { buildTimelineChart } from './RecallTrendChart';

describe('RecallTrendChart path dimensions', () => {
  it('keeps every path dimension visible without inflating the access total', () => {
    const data: ProfileKnowledgeTimelineResponse = {
      buckets: [{ t: '2026-06-18T00:00:00.000Z', accessCount: 2 }],
      dimensions: [
        'domain-cashier',
        'system',
        'apps',
        'transfer-h5',
        'innerFlow',
        'business',
        'pages',
        'pageFlow',
        'crossFlow',
        'modules',
      ].map((segment) => ({
        segment,
        accessCount: segment === 'innerFlow' ? 2 : 1,
        points: [
          {
            t: '2026-06-18T00:00:00.000Z',
            accessCount: segment === 'innerFlow' ? 2 : 1,
          },
        ],
      })),
    };

    const chart = buildTimelineChart(data);

    expect(chart.totalAccesses).toBe(2);
    expect(chart.dimensions.map((item) => item.segment)).toContain('innerFlow');
    expect(chart.dimensions.map((item) => item.segment)).toContain('pageFlow');
    expect(chart.dimensions.map((item) => item.segment)).toContain('crossFlow');
    expect(chart.dimensions.map((item) => item.segment)).toContain('modules');
    expect(chart.dimensions.map((item) => item.segment)).not.toContain('其他');
  });
});
