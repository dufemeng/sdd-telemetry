import { describe, expect, it } from 'vitest';
import { EvalRubricRepository } from '../src/modules/eval/eval-rubric.repository';

function createRepository(query: (sql: string, params?: unknown[]) => Promise<unknown>) {
  const repository = new EvalRubricRepository();
  repository.mysqlDataSourceManager = {
    getDataSource: async () => ({ query }),
  } as unknown as EvalRubricRepository['mysqlDataSourceManager'];
  return repository;
}

function createTxRepository(handlers: Array<(sql: string, params?: unknown[]) => Promise<unknown>>) {
  const calls: Array<{ sql: string; params?: unknown[] }> = [];
  const manager = {
    query: async (sql: string, params?: unknown[]) => {
      calls.push({ sql, params });
      return handlers.shift()?.(sql, params) ?? [];
    },
  };
  const repository = new EvalRubricRepository();
  repository.mysqlDataSourceManager = {
    getDataSource: async () => ({
      query: async () => [],
      transaction: async <T,>(work: (transactionManager: typeof manager) => Promise<T>) => work(manager),
    }),
  } as unknown as EvalRubricRepository['mysqlDataSourceManager'];
  return { repository, calls };
}

describe('EvalRubricRepository', () => {
  it('getActiveVersion returns the highest published version', async () => {
    let capturedSql = '';
    const repository = createRepository(async (sql) => {
      capturedSql = sql;
      return [{
        id: '8', profile_id: 'sdd-default', artifact_type: 'design', version_no: 4,
        version_status: 'published', rubric_json: JSON.stringify({ judge: {}, dimensions: [] }),
        definition_hash: 'a'.repeat(64), published_at: '2026-06-23 00:00:00.000',
        gmt_modified: '2026-06-23 00:00:00.000',
      }];
    });

    const result = await repository.getActiveVersion('sdd-default', 'design');

    expect(capturedSql).toContain("version_status = 'published'");
    expect(capturedSql).toContain('ORDER BY version_no DESC LIMIT 1');
    expect(result).toMatchObject({ id: '8', versionNo: 4, versionStatus: 'published' });
  });

  it('saveDraft overwrites the existing draft', async () => {
    const { repository, calls } = createTxRepository([
      async () => [{ id: '9', version_no: 3 }],
      async () => ({ affectedRows: 1 }),
    ]);

    const result = await repository.runInTransaction((manager) => repository.saveDraftInTransaction(manager, {
      profileId: 'sdd-default', artifactType: 'design', rubricJson: '{"x":1}',
      definitionHash: 'b'.repeat(64), createdBy: '7',
    }));

    expect(result).toEqual({ id: '9', versionNo: 3 });
    const update = calls.find((call) => call.sql.includes('UPDATE eval_rubric_versions'));
    expect(update?.params).toEqual(['{"x":1}', 'b'.repeat(64), '7', '9']);
    expect(calls.some((call) => call.sql.includes('INSERT INTO eval_rubric_versions'))).toBe(false);
  });

  it('saveDraft creates max version plus one when no draft exists', async () => {
    const { repository, calls } = createTxRepository([
      async () => [],
      async () => [{ nextNo: 5 }],
      async () => ({ insertId: 15 }),
    ]);

    const result = await repository.runInTransaction((manager) => repository.saveDraftInTransaction(manager, {
      profileId: 'sdd-default', artifactType: 'tasks', rubricJson: '{"x":1}',
      definitionHash: 'c'.repeat(64), createdBy: null,
    }));

    expect(result).toEqual({ id: '15', versionNo: 5 });
    const insert = calls.find((call) => call.sql.includes('INSERT INTO eval_rubric_versions'));
    expect(insert?.params).toEqual(['sdd-default', 'tasks', 5, '{"x":1}', 'c'.repeat(64), null]);
  });

  it('publish changes a draft to published', async () => {
    const { repository, calls } = createTxRepository([
      async () => [{ version_no: 5, version_status: 'draft' }],
      async () => ({ affectedRows: 1 }),
    ]);

    const result = await repository.runInTransaction((manager) => repository.publishInTransaction(manager, {
      id: '15', profileId: 'sdd-default',
    }));

    expect(result).toEqual({ status: 'published', versionNo: 5 });
    expect(calls.some((call) => call.sql.includes("SET version_status = 'published'"))).toBe(true);
  });
});
