import { describe, expect, it } from 'vitest';
import { summarizePathDimensions } from '../src/modules/reports/daily-report.service';

describe('daily report path dimensions', () => {
  it('aggregates the same directory segment across arbitrary depths', () => {
    expect(
      summarizePathDimensions(
        [
          {
            relativePath: 'domain-cashier/system/apps/transfer-h5/innerFlow/转入到活期.md',
            count: 4,
          },
          {
            relativePath: 'domain-cashier/business/innerFlow/transfer-h5/pages/转入到活期.md',
            count: 4,
          },
        ],
        20,
      ).top,
    ).toContainEqual({ pathSegment: 'innerFlow', count: 8 });
  });
});
