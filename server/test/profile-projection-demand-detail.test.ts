import { describe, expect, it } from 'vitest';
import { ProfileProjectionRepository } from '../src/modules/profiles/profile-projection.repository';

function createRepository(query: (sql: string, params?: unknown[]) => Promise<Array<Record<string, unknown>>>) {
  const repository = new ProfileProjectionRepository();
  repository.mysqlDataSourceManager = {
    getDataSource: async () => ({ query }),
  } as ProfileProjectionRepository['mysqlDataSourceManager'];
  return repository;
}

describe('ProfileProjectionRepository demand detail', () => {
  it('reads demand detail from TypeORM query rows without mysql2 tuple destructuring', async () => {
    const repository = createRepository(async (sql) => {
      if (sql.includes('FROM profile_delivery_units du')) {
        return [{
          id: 228,
          delivery_unit_key: 'checkout-observability-key',
          business_domain: null,
          unit_slug: 'checkout-observability',
          title: 'checkout-observability',
          locator: 'plan/checkout-observability',
          first_seen_at: new Date('2026-06-11T02:13:49.751Z'),
          last_seen_at: new Date('2026-06-11T02:13:49.751Z'),
          artifact_count: 3,
          stages: 'plan,review,task',
          capability_usage_count: 10,
          error_count: 0,
        }];
      }
      if (sql.includes('FROM profile_artifacts a')) {
        return [{
          id: 33,
          artifact_type: 'plan',
          artifact_locator: 'plan/checkout-observability/plan.md',
          system_module: null,
          last_seen_at: new Date('2026-06-11T02:13:49.751Z'),
        }];
      }
      return [{
        turn_count: 0,
        session_count: 1,
        contributor_count: 1,
        knowledge_recall_count: 0,
      }];
    });

    await expect(repository.getDemandDetail('e2e-monorepo', 1, '228')).resolves.toMatchObject({
      id: '228',
      deliveryUnitKey: 'checkout-observability-key',
      title: 'checkout-observability',
      locator: 'plan/checkout-observability',
      artifactCount: 3,
      capabilityUsageCount: 10,
      coverageStages: ['plan', 'review', 'task'],
      artifacts: [{
        id: '33',
        artifactType: 'plan',
        artifactLocator: 'plan/checkout-observability/plan.md',
      }],
      sessionCount: 1,
      contributorCount: 1,
    });
  });

  it('returns null when the delivery unit does not exist', async () => {
    const repository = createRepository(async () => []);

    await expect(repository.getDemandDetail('e2e-monorepo', 1, 'missing')).resolves.toBeNull();
  });
});
