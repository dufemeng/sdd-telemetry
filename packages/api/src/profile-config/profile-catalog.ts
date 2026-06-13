import { listProfileConfigs } from './profile-registry';
import { WorkflowProfileConfigSchema } from './profile-schema';
import type { WorkflowProfileConfig } from './profile-types';

export type ProfileConfigOrigin = 'builtin' | 'custom';
export type ProfileConfigVersionStatus = 'draft' | 'published' | 'archived';

export interface ProfileConfigSnapshot {
  profileId: string;
  config: WorkflowProfileConfig;
  source: 'database' | 'builtin';
  origin: ProfileConfigOrigin;
  configVersionId: string | null;
  versionNo: number | null;
  definitionHash: string | null;
  publishedAt: string | null;
}

export interface ProfileConfigStore {
  listServingProfileConfigs(): Promise<ProfileConfigSnapshot[]>;
  getServingProfileConfig(profileId: string): Promise<ProfileConfigSnapshot | null>;
}

export class ProfileConfigCatalog {
  constructor(private readonly store?: ProfileConfigStore) {}

  async listServing(): Promise<ProfileConfigSnapshot[]> {
    const database = this.store ? await this.store.listServingProfileConfigs() : [];
    return mergeWithBuiltinFallback(database);
  }

  async getServing(profileId: string): Promise<ProfileConfigSnapshot | null> {
    const database = this.store ? await this.store.getServingProfileConfig(profileId) : null;
    if (database) return database;
    return builtinProfileConfigSnapshot(profileId);
  }

  async listPublished(): Promise<ProfileConfigSnapshot[]> {
    return this.listServing();
  }

  async getPublished(profileId: string): Promise<ProfileConfigSnapshot | null> {
    return this.getServing(profileId);
  }
}

export function builtinProfileConfigSnapshots(): ProfileConfigSnapshot[] {
  return listProfileConfigs().map((config) => ({
    profileId: config.profileId,
    config,
    source: 'builtin',
    origin: 'builtin',
    configVersionId: null,
    versionNo: null,
    definitionHash: null,
    publishedAt: null,
  }));
}

export function builtinProfileConfigSnapshot(profileId: string): ProfileConfigSnapshot | null {
  return builtinProfileConfigSnapshots().find((snapshot) => snapshot.profileId === profileId) ?? null;
}

export function parseWorkflowProfileConfig(value: unknown): WorkflowProfileConfig {
  const parsed = WorkflowProfileConfigSchema.parse(parseJsonValue(value));
  return parsed as WorkflowProfileConfig;
}

export function canonicalProfileConfigJson(config: WorkflowProfileConfig): string {
  return stableStringify(WorkflowProfileConfigSchema.parse(config));
}

export function stableStringify(value: unknown): string {
  return JSON.stringify(sortForStableStringify(value));
}

function mergeWithBuiltinFallback(database: ProfileConfigSnapshot[]): ProfileConfigSnapshot[] {
  const byId = new Map<string, ProfileConfigSnapshot>();
  for (const snapshot of database) {
    byId.set(snapshot.profileId, snapshot);
  }
  for (const snapshot of builtinProfileConfigSnapshots()) {
    if (!byId.has(snapshot.profileId)) {
      byId.set(snapshot.profileId, snapshot);
    }
  }

  const builtinOrder = new Map(listProfileConfigs().map((config, index) => [config.profileId, index]));
  return [...byId.values()].sort((a, b) => {
    const ao = builtinOrder.get(a.profileId);
    const bo = builtinOrder.get(b.profileId);
    if (ao != null && bo != null) return ao - bo;
    if (ao != null) return -1;
    if (bo != null) return 1;
    return a.config.displayName.localeCompare(b.config.displayName);
  });
}

function parseJsonValue(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  return JSON.parse(value) as unknown;
}

function sortForStableStringify(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortForStableStringify);
  if (!value || typeof value !== 'object') return value;

  const input = value as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(input).sort()) {
    out[key] = sortForStableStringify(input[key]);
  }
  return out;
}
