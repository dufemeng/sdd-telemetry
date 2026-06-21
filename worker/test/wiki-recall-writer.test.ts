import type { PoolConnection } from 'mysql2/promise';
import { describe, expect, it, vi } from 'vitest';
import { CleaningRepository } from '../src/jobs/cleaning.repository';

describe('sdd wiki access writer', () => {
  it('writes only the relative path and stable access facts', async () => {
    const query = vi.fn().mockResolvedValue([{}, []]);
    const repository = new CleaningRepository();

    await repository.upsertWikiRecall({ query } as unknown as PoolConnection, {
      recallKey: 'key',
      toolCallId: '1',
      interactionId: '2',
      skillUsageId: null,
      workItemId: null,
      userId: '3',
      actionType: 'read',
      rawPath: '/wiki/domain-cashier/system/apps/demo/innerFlow/doc.md',
      wikiRelativePath: 'domain-cashier/system/apps/demo/innerFlow/doc.md',
      eventId: null,
      eventSequence: 4,
      eventTime: new Date('2026-06-21T00:00:00.000Z'),
      ruleVersion: 'test',
    });

    const [sql, params] = query.mock.calls[0] as [string, unknown[]];
    expect(sql).not.toMatch(/wiki_(domain|axis|system)/);
    expect(sql.match(/\?/g) ?? []).toHaveLength(13);
    expect(params).toHaveLength(13);
  });
});
