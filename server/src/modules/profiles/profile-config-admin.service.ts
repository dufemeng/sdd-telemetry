import { Inject, Provide } from '@midwayjs/core';
import { createHash } from 'node:crypto';
import {
  ProfileConfigCatalog,
  canonicalProfileConfigJson,
  resolveRuntimeProfileConfig,
  validateProfileConfig,
  type AuthSessionUser,
  type ProfileConfigAdminDetail,
  type ProfileConfigAdminSummary,
  type ProfileConfigPreviewResponse,
  type ProfileConfigSnapshot,
  type WorkflowProfileConfig,
} from '@sdd-telemetry/api';
import { ApiHttpError } from '../../common/auth/api-http-error';
import { ProfileConfigRepository } from './profile-config.repository';

@Provide('profileConfigAdminService')
export class ProfileConfigAdminService {
  @Inject('profileConfigRepository')
  profileConfigRepository!: ProfileConfigRepository;

  async list(): Promise<{ items: ProfileConfigAdminSummary[] }> {
    const [database, published] = await Promise.all([
      this.profileConfigRepository.listAdminSummaries(),
      this.catalog().listPublished(),
    ]);
    return { items: mergeSummaries(database, published) };
  }

  async getDetail(profileId: string): Promise<ProfileConfigAdminDetail> {
    const [draft, published, versions, list] = await Promise.all([
      this.profileConfigRepository.getDraftProfileConfig(profileId),
      this.catalog().getPublished(profileId),
      this.profileConfigRepository.listVersions(profileId),
      this.list(),
    ]);
    const snapshot = draft ?? published;
    if (!snapshot) {
      throw new ApiHttpError(404, 'PROFILE_NOT_FOUND', `profile not found: ${profileId}`);
    }
    const summary = list.items.find((item) => item.profileId === profileId) ?? summaryFromSnapshot(snapshot);
    return {
      summary,
      config: snapshot.config,
      validation: validateProfileConfig(snapshot.config),
      versions,
    };
  }

  preview(config: WorkflowProfileConfig): ProfileConfigPreviewResponse {
    const validation = validateProfileConfig(config);
    const runtime = resolveRuntimeProfileConfig(config, process.env);
    return {
      definitionHash: sha256(canonicalProfileConfigJson(config)),
      validation,
      runtime: {
        configured: isRuntimeConfigured(config, runtime.unresolved.length),
        resolvedRuleCount: runtime.rules.length,
        unresolved: runtime.unresolved,
      },
    };
  }

  async createDraft(input: {
    config: WorkflowProfileConfig;
    notes?: string;
    actor: AuthSessionUser;
  }): Promise<ProfileConfigAdminDetail> {
    await this.profileConfigRepository.saveDraftProfileConfig({
      config: input.config,
      actorUserId: input.actor.id,
      ...(input.notes !== undefined ? { notes: input.notes } : {}),
    });
    return this.getDetail(input.config.profileId);
  }

  async saveDraft(profileId: string, input: {
    config: WorkflowProfileConfig;
    notes?: string;
    actor: AuthSessionUser;
  }): Promise<ProfileConfigAdminDetail> {
    assertProfileIdImmutable(profileId, input.config.profileId);
    await this.profileConfigRepository.saveDraftProfileConfig({
      config: input.config,
      actorUserId: input.actor.id,
      ...(input.notes !== undefined ? { notes: input.notes } : {}),
    });
    return this.getDetail(profileId);
  }

  async publish(profileId: string, input: {
    config?: WorkflowProfileConfig;
    notes?: string;
    force?: boolean;
    actor: AuthSessionUser;
  }): Promise<ProfileConfigAdminDetail> {
    const config = input.config ?? await this.loadDraftOrPublishedConfig(profileId);
    assertProfileIdImmutable(profileId, config.profileId);
    this.assertPublishable(config, Boolean(input.force));
    await this.profileConfigRepository.publishProfileConfig({
      config,
      actorUserId: input.actor.id,
      ...(input.notes !== undefined ? { notes: input.notes } : {}),
    });
    return this.getDetail(profileId);
  }

  async disable(profileId: string, actor: AuthSessionUser): Promise<ProfileConfigAdminDetail> {
    const config = await this.loadDraftOrPublishedConfig(profileId);
    await this.profileConfigRepository.publishProfileConfig({
      config: { ...config, status: 'disabled' },
      actorUserId: actor.id,
      notes: 'disabled by admin',
    });
    return this.getDetail(profileId);
  }

  private async loadDraftOrPublishedConfig(profileId: string): Promise<WorkflowProfileConfig> {
    const snapshot = await this.profileConfigRepository.getDraftProfileConfig(profileId)
      ?? await this.catalog().getPublished(profileId);
    if (!snapshot) {
      throw new ApiHttpError(404, 'PROFILE_NOT_FOUND', `profile not found: ${profileId}`);
    }
    return snapshot.config;
  }

  private assertPublishable(config: WorkflowProfileConfig, force: boolean): void {
    const validation = validateProfileConfig(config);
    if (!validation.valid) {
      throw new ApiHttpError(400, 'PROFILE_CONFIG_INVALID', validation.issues.map((i) => i.message).join('; '));
    }

    const runtime = resolveRuntimeProfileConfig(config, process.env);
    if (!force && !isRuntimeConfigured(config, runtime.unresolved.length)) {
      throw new ApiHttpError(
        400,
        'PROFILE_CONFIG_RUNTIME_UNRESOLVED',
        `profile runtime is not configured: ${runtime.unresolved.map((item) => item.ruleId).join(', ') || 'no enabled source rules'}`,
      );
    }
  }

  private catalog(): ProfileConfigCatalog {
    return new ProfileConfigCatalog(this.profileConfigRepository);
  }
}

function mergeSummaries(
  database: ProfileConfigAdminSummary[],
  published: ProfileConfigSnapshot[],
): ProfileConfigAdminSummary[] {
  const byId = new Map(database.map((item) => [item.profileId, item]));
  for (const snapshot of published) {
    if (!byId.has(snapshot.profileId)) {
      byId.set(snapshot.profileId, summaryFromSnapshot(snapshot));
    }
  }
  const order = new Map(published.map((snapshot, index) => [snapshot.profileId, index]));
  return [...byId.values()].sort((a, b) => {
    const ao = order.get(a.profileId);
    const bo = order.get(b.profileId);
    if (ao != null && bo != null) return ao - bo;
    if (ao != null) return -1;
    if (bo != null) return 1;
    return a.displayName.localeCompare(b.displayName);
  });
}

function summaryFromSnapshot(snapshot: ProfileConfigSnapshot): ProfileConfigAdminSummary {
  return {
    profileId: snapshot.profileId,
    displayName: snapshot.config.displayName,
    status: snapshot.config.status,
    projectionMode: snapshot.config.projectionMode,
    origin: snapshot.origin,
    source: snapshot.source,
    publishedVersionId: snapshot.configVersionId,
    publishedVersionNo: snapshot.versionNo,
    draftVersionId: null,
    definitionHash: snapshot.definitionHash,
    publishedAt: snapshot.publishedAt,
    updatedAt: snapshot.publishedAt,
  };
}

function assertProfileIdImmutable(expected: string, actual: string): void {
  if (expected !== actual) {
    throw new ApiHttpError(400, 'PROFILE_ID_IMMUTABLE', 'profileId cannot be changed after creation');
  }
}

function isRuntimeConfigured(config: WorkflowProfileConfig, unresolvedCount: number): boolean {
  if (config.status !== 'active') return true;
  if (config.projectionMode === 'sdd_bridge') return true;
  const enabledCount = config.sourceRules.filter((rule) => rule.enabled).length;
  return enabledCount > 0 && unresolvedCount === 0;
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}
