import { describe, expect, it } from 'vitest';
import { ProfileProjectionRepository } from '../src/modules/profiles/profile-projection.repository';

function createRepository(
  query: (sql: string, params?: unknown[]) => Promise<Array<Record<string, unknown>>>,
) {
  const repository = new ProfileProjectionRepository();
  repository.mysqlDataSourceManager = {
    getDataSource: async () => ({ query }),
  } as ProfileProjectionRepository['mysqlDataSourceManager'];
  return repository;
}

describe('ProfileProjectionRepository knowledge timeline', () => {
  it('aggregates relative path facts and filters an exact segment without materialized dimensions', async () => {
    const repository = createRepository(async (sql, params) => {
      expect(sql).not.toContain('knowledge_axis');
      expect(sql).not.toContain('knowledge_domain');
      expect(sql).not.toContain('knowledge_system');
      expect(sql).toContain('LIKE ?');
      expect(params).toContain('trade');
      expect(params).toContain('%/innerFlow/%');
      return [
        {
          event_time: new Date('2026-06-18T10:00:00.000Z'),
          relative_path: 'domain-cashier/system/apps/transfer-h5/innerFlow/转入到活期.md',
          knowledge_locator: '/wiki/domain-cashier/system/apps/transfer-h5/innerFlow/转入到活期.md',
        },
        {
          event_time: new Date('2026-06-18T10:05:00.000Z'),
          relative_path: 'domain-cashier/business/innerFlow/transfer-h5/pages/转入到活期.md',
          knowledge_locator:
            '/wiki/domain-cashier/business/innerFlow/transfer-h5/pages/转入到活期.md',
        },
      ];
    });

    await expect(
      repository.getKnowledgeTimeline('sdd-default', 1, {
        rangeSinceDate: null,
        granularity: 'day',
        sourceNamespace: 'trade',
        pathSegment: 'innerFlow',
      }),
    ).resolves.toMatchObject({
      buckets: [{ t: '2026-06-18T00:00:00.000Z', accessCount: 2 }],
      dimensions: expect.arrayContaining([
        expect.objectContaining({ segment: 'innerFlow', accessCount: 2 }),
      ]),
    });
  });
});
