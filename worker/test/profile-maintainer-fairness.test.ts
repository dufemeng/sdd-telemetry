import type { Pool } from 'mysql2/promise';
import type { Logger } from 'pino';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const scheduler = vi.hoisted(() => {
  const jobs = [
    {
      profileId: 'sdd-default',
      targetConfigVersionId: null,
      status: 'running' as const,
      dirtySeq: 110_000,
      runningDirtySeq: 110_000,
      attempts: 1,
      maxAttempts: 20,
      dirtyReason: 'source_references',
      lockedBy: 'test-worker',
      lastCompletedAt: null,
      lastProfileConfigVersionId: null,
      lastResolvedConfigHash: null,
    },
    {
      profileId: 'online-docs',
      targetConfigVersionId: null,
      status: 'running' as const,
      dirtySeq: 75_000,
      runningDirtySeq: 75_000,
      attempts: 1,
      maxAttempts: 20,
      dirtyReason: 'config_changed',
      lockedBy: 'test-worker',
      lastCompletedAt: null,
      lastProfileConfigVersionId: null,
      lastResolvedConfigHash: null,
    },
  ];

  return {
    claimNext: vi.fn(async (
      _pool: unknown,
      _workerId: string,
      _lockSeconds: number,
      excludedProfileIds: readonly string[] = [],
    ) => jobs.find((job) => !excludedProfileIds.includes(job.profileId)) ?? null),
    markFailed: vi.fn(async () => true),
  };
});

const projection = vi.hoisted(() => ({
  run: vi.fn(async () => ({})),
}));

vi.mock('@sdd-telemetry/api', () => ({
  resolveRuntimeProfileConfig: vi.fn(() => ({ rules: [], unresolved: [] })),
}));

vi.mock('../src/jobs/profile-maintenance/projection-job-store', () => ({
  ProjectionJobStore: class {
    get = vi.fn();
    markDirty = vi.fn();
    claimNext = scheduler.claimNext;
    markFailed = scheduler.markFailed;
  },
}));

vi.mock('../src/jobs/profile-config-catalog', () => ({
  createProfileConfigCatalog: vi.fn(() => ({
    getServing: vi.fn(async (profileId: string) => ({
      config: { profileId, status: 'active', projectionMode: 'sdd_bridge' },
      configVersionId: null,
      definitionHash: 'test-definition-hash',
    })),
  })),
  getProfileConfigVersionSnapshot: vi.fn(async () => null),
  listProjectionTargetProfileConfigs: vi.fn(async () => []),
}));

vi.mock('../src/jobs/profile-maintenance/profile-config-hash', () => ({
  resolvedProfileConfigHash: vi.fn(() => 'test-runtime-hash'),
}));

vi.mock('../src/jobs/profile-maintenance/projection-adapter-registry', () => ({
  profileProjectionAdapterRegistry: {
    get: vi.fn(() => ({
      prepare: vi.fn(async () => ({})),
      operators: [{}],
    })),
  },
}));

vi.mock('../src/jobs/profile-projection/runner', () => ({
  runProfileProjection: projection.run,
}));

import { runProfileMaintenanceOnce } from '../src/jobs/profile-maintenance/projection-maintainer';

describe('profile projection scheduling fairness', () => {
  beforeEach(() => {
    scheduler.claimNext.mockClear();
    scheduler.markFailed.mockClear();
    projection.run.mockClear();
  });

  it('serves each dirty profile at most once per maintenance tick', async () => {
    const logger = {
      error: vi.fn(),
      info: vi.fn(),
    } as unknown as Logger;

    const result = await runProfileMaintenanceOnce({
      pool: {} as Pool,
      logger,
      workerId: 'test-worker',
      maxJobs: 3,
    });

    expect(projection.run.mock.calls.map(([input]) => input.profileId)).toEqual([
      'sdd-default',
      'online-docs',
    ]);
    expect(result.claimed).toBe(2);
    expect(result.succeeded).toBe(2);
    expect(result.failed).toBe(0);
  });
});
