import { describe, expect, it } from 'vitest';
import { ProfileProjectionRepository } from '../src/modules/profiles/profile-projection.repository';

describe('ProfileProjectionRepository knowledge overview', () => {
  it('returns access facts and derives path dimensions across arbitrary depths', async () => {
    const repository = new ProfileProjectionRepository();
    repository.mysqlDataSourceManager = {
      getDataSource: async () => ({
        query: async (sql: string) => {
          expect(sql).not.toMatch(/knowledge_(domain|axis|system)/);
          if (sql.includes('GROUP BY source_namespace, relative_path, kr.user_id')) {
            return [
              {
                source_namespace: 'trade',
                relative_path: 'domain-cashier/system/apps/transfer-h5/innerFlow/转入到活期.md',
                user_id: 1,
                access_count: 2,
                last_access_at: new Date('2026-06-21T09:00:00.000Z'),
              },
              {
                source_namespace: 'trade',
                relative_path: 'domain-cashier/business/innerFlow/transfer-h5/pages/转入到活期.md',
                user_id: 1,
                access_count: 2,
                last_access_at: new Date('2026-06-21T10:00:00.000Z'),
              },
            ];
          }
          if (sql.includes('GROUP BY')) {
            return [
              {
                source_namespace: 'trade',
                accessed_docs: 2,
                access_count: 4,
                distinct_users: 1,
              },
            ];
          }
          return [{ accessed_docs: 2, access_count: 4, distinct_users: 1 }];
        },
      }),
    } as ProfileProjectionRepository['mysqlDataSourceManager'];

    await expect(repository.getKnowledgeOverview('sdd-default', 1)).resolves.toEqual({
      totals: { accessedDocs: 2, accessCount: 4, distinctUsers: 1 },
      sources: [
        {
          sourceNamespace: 'trade',
          label: 'trade',
          accessedDocs: 2,
          accessCount: 4,
          distinctUsers: 1,
        },
      ],
      pathDimensions: expect.arrayContaining([
        expect.objectContaining({
          sourceNamespace: 'trade',
          pathSegment: 'innerFlow',
          accessedDocs: 2,
          accessCount: 4,
          distinctUsers: 1,
          lastAccessAt: '2026-06-21T10:00:00.000Z',
        }),
      ]),
    });
  });

  it('drills into documents by an exact segment at any path depth', async () => {
    const repository = new ProfileProjectionRepository();
    repository.mysqlDataSourceManager = {
      getDataSource: async () => ({
        query: async (sql: string, params: unknown[]) => {
          expect(sql).toContain("CONCAT('/',");
          expect(sql).not.toContain('SUBSTRING_INDEX');
          expect(params).toContain('%/innerFlow/%');
          return [];
        },
      }),
    } as ProfileProjectionRepository['mysqlDataSourceManager'];

    await expect(
      repository.getKnowledgePathDimensionDocs('sdd-default', 1, 'trade', 'innerFlow'),
    ).resolves.toEqual({
      sourceNamespace: 'trade',
      pathSegment: 'innerFlow',
      items: [],
    });
  });
});
