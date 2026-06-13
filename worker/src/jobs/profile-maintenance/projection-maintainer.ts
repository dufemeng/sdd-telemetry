import type { Pool, PoolConnection, RowDataPacket } from 'mysql2/promise';
import type { Logger } from 'pino';
import {
  resolveRuntimeProfileConfig,
  type ProfileConfigSnapshot,
  type WorkflowProfileConfig,
} from '@sdd-telemetry/api';
import { runProfileProjection, type ProjectionRunResult } from '../profile-projection/runner';
import { SourceReferenceWriter, type SourceReferenceWriteStats } from '../source-reference/writer';
import {
  createProfileConfigCatalog,
  getProfileConfigVersionSnapshot,
  listProjectionTargetProfileConfigs,
} from '../profile-config-catalog';
import { profileProjectionAdapterRegistry } from './projection-adapter-registry';
import { resolvedProfileConfigHash } from './profile-config-hash';
import { ProjectionJobStore, type ProjectionJob } from './projection-job-store';

export interface ProfileMaintenanceOptions {
  pool: Pool;
  logger: Logger;
  workerId: string;
  maxJobs?: number;
  lockSeconds?: number;
}

export interface ProfileMaintenanceResult {
  claimed: number;
  succeeded: number;
  failed: number;
  configDirty: number;
  staleDirty: number;
}

export interface CleanBatchMaintenanceResult {
  sourceReferences: SourceReferenceWriteStats;
  dirtyProfiles: string[];
}

export interface CleanBatchMaintenanceInput {
  batchId: string;
  derivedCount: number;
}

const jobStore = new ProjectionJobStore();
const sourceReferenceWriter = new SourceReferenceWriter();

export async function maintainProfilesAfterCleanBatch(
  options: {
    pool: Pool;
    logger: Logger;
  },
  input: CleanBatchMaintenanceInput,
): Promise<CleanBatchMaintenanceResult> {
  const sourceReferences = await sourceReferenceWriter.updateForBatch(options.pool, input.batchId);
  const dirtyProfiles = new Set<string>();

  if (input.derivedCount > 0) {
    for (const snapshot of await activeProjectionTargetsByMode(options.pool, 'sdd_bridge')) {
      await jobStore.markDirty(options.pool, {
        profileId: snapshot.config.profileId,
        reason: `clean_batch:${input.batchId}:sdd_facts`,
        targetConfigVersionId: snapshot.configVersionId,
      });
      dirtyProfiles.add(snapshot.config.profileId);
    }
  }

  if (sourceReferences.extracted > 0 || sourceReferences.affectedRows > 0) {
    for (const snapshot of await activeProjectionTargetsByMode(options.pool, 'source_backed')) {
      await jobStore.markDirty(options.pool, {
        profileId: snapshot.config.profileId,
        reason: `clean_batch:${input.batchId}:source_references`,
        targetConfigVersionId: snapshot.configVersionId,
      });
      dirtyProfiles.add(snapshot.config.profileId);
    }
  }

  const result = { sourceReferences, dirtyProfiles: [...dirtyProfiles] };
  options.logger.info({ batchId: input.batchId, result }, 'profile maintenance marked dirty after clean batch');
  return result;
}

export async function runProfileMaintenanceOnce(
  options: ProfileMaintenanceOptions,
): Promise<ProfileMaintenanceResult> {
  const lockSeconds = options.lockSeconds ?? Number(process.env.PROFILE_PROJECTION_LOCK_SECONDS ?? 300);
  const maxJobs = options.maxJobs ?? Number(process.env.PROFILE_PROJECTION_MAX_JOBS_PER_TICK ?? 3);
  const result: ProfileMaintenanceResult = {
    claimed: 0,
    succeeded: 0,
    failed: 0,
    configDirty: 0,
    staleDirty: 0,
  };

  result.configDirty = await markConfigChangedProfilesDirty(options.pool);
  result.staleDirty = await markStaleFactProfilesDirty(options.pool);

  for (let i = 0; i < maxJobs; i += 1) {
    const job = await jobStore.claimNext(options.pool, options.workerId, lockSeconds);
    if (!job) break;
    result.claimed += 1;
    try {
      await projectClaimedJob(options.pool, options.logger, job);
      result.succeeded += 1;
    } catch (error) {
      result.failed += 1;
      await jobStore.markFailed(options.pool, {
        profileId: job.profileId,
        workerId: job.lockedBy ?? options.workerId,
        runningDirtySeq: job.runningDirtySeq,
        error,
        retrySeconds: retrySeconds(job.attempts),
      });
      options.logger.error({ err: error, profileId: job.profileId }, 'profile projection job failed');
    }
  }

  return result;
}

export async function rebuildProfileThroughMaintainer(options: {
  pool: Pool;
  logger: Logger;
  workerId: string;
  profileId: string;
  lockSeconds?: number;
}): Promise<ProjectionRunResult> {
  const lockSeconds = options.lockSeconds ?? Number(process.env.PROFILE_PROJECTION_LOCK_SECONDS ?? 300);
  const snapshot = await createProfileConfigCatalog(options.pool).getServing(options.profileId);
  await jobStore.markDirty(options.pool, {
    profileId: options.profileId,
    reason: 'manual_rebuild',
    targetConfigVersionId: snapshot?.configVersionId ?? null,
  });

  const job = await jobStore.claimProfile(options.pool, options.profileId, options.workerId, lockSeconds);
  if (!job) {
    throw new Error(`profile projection already running for ${options.profileId}`);
  }

  try {
    return await projectClaimedJob(options.pool, options.logger, job);
  } catch (error) {
    await jobStore.markFailed(options.pool, {
      profileId: job.profileId,
      workerId: job.lockedBy ?? options.workerId,
      runningDirtySeq: job.runningDirtySeq,
      error,
      retrySeconds: retrySeconds(job.attempts),
    });
    throw error;
  }
}

async function markConfigChangedProfilesDirty(pool: Pool): Promise<number> {
  let count = 0;
  for (const snapshot of await activeProjectionTargets(pool)) {
    const profile = snapshot.config;
    const runtime = resolveRuntimeProfileConfig(profile, process.env);
    const hash = resolvedProfileConfigHash(profile, runtime);
    const job = await jobStore.get(pool, profile.profileId);
    const versionKey = snapshot.configVersionId ?? 'builtin';
    const reason = `${job ? 'config_changed' : 'initial_projection'}:${versionKey}:${hash}`;
    const alreadyTargetingSnapshot = job
      && job.status !== 'idle'
      && job.targetConfigVersionId === snapshot.configVersionId;
    if (
      !alreadyTargetingSnapshot
      && (
        !job
        || job.lastResolvedConfigHash !== hash
        || job.lastProfileConfigVersionId !== snapshot.configVersionId
      )
    ) {
      await jobStore.markDirty(pool, {
        profileId: profile.profileId,
        reason,
        targetConfigVersionId: snapshot.configVersionId,
      });
      count += 1;
    }
  }
  return count;
}

async function markStaleFactProfilesDirty(pool: Pool): Promise<number> {
  let count = 0;
  for (const snapshot of await activeProjectionTargets(pool)) {
    const profile = snapshot.config;
    const job = await jobStore.get(pool, profile.profileId);
    if (!job || job.status !== 'idle') continue;
    if (!job.lastCompletedAt) {
      await jobStore.markDirty(pool, {
        profileId: profile.profileId,
        reason: 'stale_facts:no_completed_at',
        targetConfigVersionId: snapshot.configVersionId,
      });
      count += 1;
      continue;
    }

    const latestModified = await latestFactModifiedAt(pool, profile.projectionMode);
    if (latestModified && latestModified.getTime() > job.lastCompletedAt.getTime()) {
      await jobStore.markDirty(pool, {
        profileId: profile.profileId,
        reason: `stale_facts:${profile.projectionMode}`,
        targetConfigVersionId: snapshot.configVersionId,
      });
      count += 1;
    }
  }
  return count;
}

async function projectClaimedJob(
  pool: Pool,
  logger: Logger,
  job: ProjectionJob,
): Promise<ProjectionRunResult> {
  const snapshot = job.targetConfigVersionId
    ? await getProfileConfigVersionSnapshot(pool, job.profileId, job.targetConfigVersionId)
    : await createProfileConfigCatalog(pool).getServing(job.profileId);
  const config = snapshot?.config;
  if (!config || config.status !== 'active') {
    throw new Error(`unknown or inactive profile: ${job.profileId}`);
  }

  const runtime = resolveRuntimeProfileConfig(config, process.env);
  const resolvedConfigHash = resolvedProfileConfigHash(config, runtime);
  const adapter = profileProjectionAdapterRegistry.get(config.projectionMode);
  const prepared = await adapter.prepare({
    pool,
    config,
    runtime,
    profileConfigVersionId: snapshot.configVersionId,
  });
  const sourceRematch = prepared.stats?.sourceRematch as { matched?: number } | undefined;
  if (config.projectionMode === 'source_backed' && Number(sourceRematch?.matched ?? 0) === 0) {
    throw new Error(`source-backed profile matched zero source references: ${config.profileId}`);
  }
  if (adapter.operators.length === 0) throw new Error(`unconfigured projection mode: ${config.projectionMode}`);

  const projectionInput = {
    pool,
    logger,
    profileId: job.profileId,
    profileConfig: config,
    profileConfigVersionId: snapshot.configVersionId,
    projectionDefinitionHash: snapshot.definitionHash,
    resolvedConfigHash,
    operators: adapter.operators,
    ...(prepared.stats ? { extraStats: prepared.stats } : {}),
    publishGuard: async (connection: PoolConnection, runId: number) => {
      await jobStore.markSucceeded(connection, {
        profileId: job.profileId,
        workerId: job.lockedBy ?? '',
        runningDirtySeq: job.runningDirtySeq,
        projectionRunId: runId,
        profileConfigVersionId: snapshot.configVersionId,
        resolvedConfigHash,
      });
      if (snapshot.configVersionId) {
        await jobStore.markServingVersion(connection, {
          profileId: job.profileId,
          profileConfigVersionId: snapshot.configVersionId,
        });
      }
    },
  };
  const result = await runProfileProjection(projectionInput);

  return result;
}

async function activeProjectionTargets(pool: Pool): Promise<ProfileConfigSnapshot[]> {
  return (await listProjectionTargetProfileConfigs(pool))
    .filter((snapshot) => snapshot.config.status === 'active');
}

async function activeProjectionTargetsByMode(
  pool: Pool,
  mode: WorkflowProfileConfig['projectionMode'],
): Promise<ProfileConfigSnapshot[]> {
  return (await activeProjectionTargets(pool)).filter((snapshot) => snapshot.config.projectionMode === mode);
}

function retrySeconds(attempts: number): number {
  return Math.min(300, 2 ** Math.min(Math.max(1, attempts), 8));
}

async function latestFactModifiedAt(
  pool: Pool,
  mode: WorkflowProfileConfig['projectionMode'],
): Promise<Date | null> {
  if (mode === 'source_backed') {
    return maxModifiedAt(pool, ['source_references']);
  }
  return maxModifiedAt(pool, [
    'sdd_interactions',
    'sdd_interaction_tool_calls',
    'sdd_interaction_texts',
    'sdd_skill_usages',
    'sdd_work_items',
    'sdd_work_item_artifacts',
    'sdd_work_item_artifact_writes',
    'sdd_work_item_artifact_turns',
    'sdd_wiki_recalls',
  ]);
}

async function maxModifiedAt(pool: Pool, tables: string[]): Promise<Date | null> {
  const selects = tables.map((table) => `SELECT MAX(gmt_modified) AS v FROM \`${table}\``).join(' UNION ALL ');
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT MAX(v) AS v FROM (${selects}) latest_facts`,
  );
  const value = rows[0]?.v;
  return value == null ? null : new Date(value as Date | string);
}
