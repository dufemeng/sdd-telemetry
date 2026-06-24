import type { Pool, PoolConnection } from 'mysql2/promise';
import { describe, expect, it, vi } from 'vitest';
import { ProjectionJobStore } from '../src/jobs/profile-maintenance/projection-job-store';

describe('ProjectionJobStore scheduling fairness', () => {
  it('does not claim a profile excluded by the current maintenance tick', async () => {
    const query = vi.fn(async (sql: string, params: unknown[] = []) => {
      if (sql.includes('SELECT profile_id')) {
        const profileId = params.includes('sdd-default') ? 'online-docs' : 'sdd-default';
        return [[projectionJobRow(profileId)], []];
      }
      return [{ affectedRows: 1 }, []];
    });
    const connection = {
      query,
      beginTransaction: vi.fn(),
      commit: vi.fn(),
      rollback: vi.fn(),
      release: vi.fn(),
    } as unknown as PoolConnection;
    const pool = {
      getConnection: vi.fn(async () => connection),
    } as unknown as Pool;

    const store = new ProjectionJobStore();
    const job = await (store.claimNext as unknown as (
      pool: Pool,
      workerId: string,
      lockSeconds: number,
      excludedProfileIds: readonly string[],
    ) => ReturnType<ProjectionJobStore['claimNext']>)(pool, 'test-worker', 300, ['sdd-default']);

    expect(job?.profileId).toBe('online-docs');
    expect(query.mock.calls[0]?.[0]).toContain('profile_id NOT IN (?)');
    expect(query.mock.calls[0]?.[0]).toContain('last_completed_at ASC, dirty_since ASC');
    expect(query.mock.calls[0]?.[1]).toEqual(['sdd-default']);
  });
});

function projectionJobRow(profileId: string) {
  return {
    profile_id: profileId,
    target_config_version_id: null,
    status: 'dirty',
    dirty_seq: profileId === 'sdd-default' ? 110_000 : 75_000,
    running_dirty_seq: null,
    attempts: 0,
    max_attempts: 20,
    dirty_reason: 'source_references',
    locked_by: null,
    locked_until: null,
    last_completed_at: null,
    last_profile_config_version_id: null,
    last_resolved_config_hash: null,
  };
}
