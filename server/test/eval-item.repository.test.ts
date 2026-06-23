import { describe, expect, it } from 'vitest';
import { EvalItemRepository } from '../src/modules/eval/eval-item.repository';

function createRepository(query: (sql: string, params?: unknown[]) => Promise<Array<Record<string, unknown>>>) {
  const repository = new EvalItemRepository();
  repository.mysqlDataSourceManager = {
    getDataSource: async () => ({ query }),
  } as EvalItemRepository['mysqlDataSourceManager'];
  return repository;
}

describe('EvalItemRepository', () => {
  it('getCurrentProjectionRunId returns runId', async () => {
    const repo = createRepository(async () => [{ runId: '77' }]);
    await expect(repo.getCurrentProjectionRunId('sdd-default')).resolves.toBe('77');
  });

  it('getCurrentProjectionRunId returns null when no row', async () => {
    const repo = createRepository(async () => []);
    await expect(repo.getCurrentProjectionRunId('p')).resolves.toBeNull();
  });

  it('listItems applies filters and maps rows', async () => {
    const repo = createRepository(async (sql) => {
      if (sql.startsWith('SELECT COUNT(*)')) return [{ cnt: 1 }];
      return [{
        id: 5, item_key: 'k', profile_id: 'sdd-default', source: 'cleaned', prompt_text: 'hi',
        target_skill: 'bk-fe-design', target_artifact_type: 'design',
        origin_interaction_id: '9', origin_prompt_id: null, origin_projection_run_id: '7',
        origin_capability_code: 'design', origin_raw_capability_name: 'bk-fe-design',
        occurrence_count: 2, first_observed_at: null, last_observed_at: '2026-06-21 00:00:00.000',
        last_imported_at: null, enabled: 1, title: null, notes: null, deleted_at: null,
      }];
    });
    const { items, total } = await repo.listItems({
      profileId: 'sdd-default', source: 'cleaned', capabilityCode: 'design',
      enabled: true, keyword: 'x', page: 1, pageSize: 20,
    });
    expect(total).toBe(1);
    expect(items[0].id).toBe('5');
    expect(items[0].source).toBe('cleaned');
    expect(items[0].occurrenceCount).toBe(2);
  });

  it('listSummary aggregates counts', async () => {
    const repo = createRepository(async () => [{ total: 10, enabled: 7, cleaned: 6, manual: 4 }]);
    await expect(repo.listSummary('sdd-default')).resolves.toEqual({ total: 10, enabled: 7, cleaned: 6, manual: 4 });
  });

  it('listSummary handles null aggregates (no rows)', async () => {
    const repo = createRepository(async () => [{ total: 0, enabled: null, cleaned: null, manual: null }]);
    await expect(repo.listSummary('sdd-default')).resolves.toEqual({ total: 0, enabled: 0, cleaned: 0, manual: 0 });
  });

  it('getItem returns null when not found', async () => {
    const repo = createRepository(async () => []);
    await expect(repo.getItem('1', 'sdd-default')).resolves.toBeNull();
  });

  it('getItemByKey returns mapped row', async () => {
    const repo = createRepository(async () => [{
      id: 3, item_key: 'kk', profile_id: 'sdd-default', source: 'manual', prompt_text: 'p',
      target_skill: 'bk-fe-design', target_artifact_type: 'design',
      origin_interaction_id: null, origin_prompt_id: null, origin_projection_run_id: null,
      origin_capability_code: null, origin_raw_capability_name: null,
      occurrence_count: 0, first_observed_at: null, last_observed_at: null, last_imported_at: null,
      enabled: 1, title: null, notes: null, deleted_at: null,
    }]);
    const item = await repo.getItemByKey('kk');
    expect(item?.id).toBe('3');
    expect(item?.source).toBe('manual');
  });
});
