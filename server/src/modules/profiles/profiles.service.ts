import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { Inject, Provide } from '@midwayjs/core';
import type {
  ProfileArtifactTimelineItem,
  ProfileCapabilityAnalytics,
  ProfileCapabilityManifest,
  ProfileCapabilityTimeseries,
  ProfileCapabilityTimeseriesQuery,
  ProfileCapabilityUsageItem,
  ProfileCapabilityUsageSummaryItem,
  ProfileCapabilityUsagesQuery,
  ProfileCapabilityUsageSummaryQuery,
  ProfileDemand,
  ProfileDemandDetail,
  ProfileErrorDetail,
  ProfileErrorListQuery,
  ProfileErrorItem,
  ProfileErrorOverviewQuery,
  ProfileErrorOverviewResponse,
  ProfileKnowledgeOverviewResponse,
  ProfileKnowledgeContent,
  ProfileKnowledgeDeliveryUnitRankingQuery,
  ProfileKnowledgeDocDetailResponse,
  ProfileKnowledgePathDimensionDocsResponse,
  ProfileKnowledgeAccessItem,
  ProfileKnowledgeTimelineQuery,
  ProfileKnowledgeTimelineResponse,
  ProfileOverview,
  ProfileOverviewQuery,
  ProfileInspectorResponse,
  ProfileInspectorResolvedSourceRule,
  ProfileSummary,
  ProfileUserActivityItem,
  ProfileUserActivityQuery,
  ProfileUserDetail,
  ProfileUserItem,
  ProfileUsersQuery,
} from '@sdd-telemetry/api';
import { ApiHttpError } from '../../common/auth/api-http-error';
import {
  ProfileConfigCatalog,
  resolveRuntimeProfileConfig,
  validateProfileConfig,
  type WorkflowProfileConfig,
} from './profile-config';
import { ProfileConfigRepository } from './profile-config.repository';
import {
  ProfileProjectionRepository,
  type ProfileKnowledgeContentSource,
} from './profile-projection.repository';

type ProfileReadMode = { mode: 'projection'; runId: number } | { mode: 'empty' };

@Provide('profilesService')
export class ProfilesService {
  @Inject('profileProjectionRepository')
  profileProjectionRepository!: ProfileProjectionRepository;

  @Inject('profileConfigRepository')
  profileConfigRepository!: ProfileConfigRepository;

  async listProfiles(): Promise<ProfileSummary[]> {
    const snapshots = await this.profileConfigCatalog().listServing();
    return snapshots.map((snapshot) => toSummary(snapshot.config));
  }

  async getManifest(profileId: string): Promise<ProfileCapabilityManifest> {
    return (await this.requireProfile(profileId)).manifest;
  }

  async getInspector(profileId: string): Promise<ProfileInspectorResponse> {
    const config = await this.requireProfile(profileId);
    const validation = validateProfileConfig(config);
    const runtime = resolveRuntimeProfileConfig(config, process.env);
    const read = await this.resolveReadMode(profileId);
    const projection = await this.profileProjectionRepository.getInspector(profileId);

    return {
      profile: {
        profileId: config.profileId,
        displayName: config.displayName,
        status: isRuntimeConfiguredWithResolution(config, runtime.unresolved.length)
          ? config.status
          : 'disabled',
        projectionMode: config.projectionMode,
        manifest: config.manifest,
        presentation: config.presentation,
      },
      validation,
      runtime: {
        configured: isRuntimeConfiguredWithResolution(config, runtime.unresolved.length),
        resolvedRuleCount: runtime.rules.length,
        unresolved: runtime.unresolved,
        resolvedSourceRules: runtime.rules.map<ProfileInspectorResolvedSourceRule>(
          ({ rule, resolvedRoot }) => ({
            ruleId: rule.ruleId,
            locatorType: rule.locatorType,
            category: rule.category,
            confidence: rule.confidence,
            priority: rule.priority,
            actions: rule.actions,
            resolvedRoot,
            description: rule.description ?? null,
          }),
        ),
      },
      projection: {
        readMode: read.mode,
        currentRun: projection.currentRun,
        latestRun: projection.latestRun,
        counts: projection.counts,
        job: projection.job,
        matchCounts: projection.matchCounts,
      },
      rules: {
        sourceRules: config.sourceRules.map((rule) => ({ ...rule })),
        deliveryUnitRules: config.deliveryUnitRules.map((rule) => ({
          ...rule,
        })),
        artifactRules: config.artifactRules.map((rule) => ({ ...rule })),
        capabilityRules: config.capabilityRules.map((rule) => ({ ...rule })),
        errorRules: config.errorRules.map((rule) => ({ ...rule })),
        attributionPolicy: { ...config.attributionPolicy },
      },
    };
  }

  async getOverview(profileId: string, query: ProfileOverviewQuery): Promise<ProfileOverview> {
    const read = await this.resolveReadMode(profileId);

    if (read.mode === 'projection') {
      return this.profileProjectionRepository.getOverview(profileId, read.runId, query);
    }
    return emptyOverview();
  }

  async listDemands(profileId: string, query: ProfileOverviewQuery): Promise<ProfileDemand[]> {
    const read = await this.resolveReadMode(profileId);

    if (read.mode === 'projection') {
      return this.profileProjectionRepository.listDemands(profileId, read.runId, query);
    }
    return [];
  }

  async getErrorOverview(
    profileId: string,
    query: ProfileErrorOverviewQuery,
  ): Promise<ProfileErrorOverviewResponse> {
    const config = await this.requireProfile(profileId);
    if (!config.manifest.errors) {
      throw new ApiHttpError(501, 'UNSUPPORTED', 'errors not supported for this profile');
    }
    const read = await this.resolveReadMode(profileId);
    if (read.mode === 'projection') {
      return this.profileProjectionRepository.getErrorOverview(
        profileId,
        read.runId,
        query,
        config.errorRules,
      );
    }
    return {
      kpis: {
        totalCount: 0,
        knowledgeReadFailedCount: 0,
        toolExecutionFailedCount: 0,
        affectedUserCount: 0,
        affectedInteractionCount: 0,
        latestAt: null,
      },
      categories: config.errorRules
        .filter((rule) => rule.enabled)
        .map((rule) => ({
          category: rule.category,
          displayName: rule.displayName,
          severity: rule.severity,
          count: 0,
          affectedUserCount: 0,
          affectedInteractionCount: 0,
          affectedDeliveryUnitCount: 0,
          latestAt: null,
        })),
      knowledgeDiagnostics:
        config.errorRules
          .find((rule) => rule.enabled && rule.category === 'knowledge_read_failed')
          ?.reasonGroups?.map((reason) => ({
            reasonCode: reason.reasonCode,
            displayName: reason.displayName,
            description: reason.description ?? null,
            count: 0,
            affectedUserCount: 0,
            affectedInteractionCount: 0,
            affectedDeliveryUnitCount: 0,
            latestAt: null,
            sampleLocator: null,
          })) ?? [],
    };
  }

  async listErrors(
    profileId: string,
    query: ProfileErrorListQuery,
  ): Promise<{
    items: ProfileErrorItem[];
    total: number;
    page: number;
    pageSize: number;
  }> {
    const config = await this.requireProfile(profileId);
    if (!config.manifest.errors) {
      throw new ApiHttpError(501, 'UNSUPPORTED', 'errors not supported for this profile');
    }
    const read = await this.resolveReadMode(profileId);
    if (read.mode === 'projection') {
      const { items, total } = await this.profileProjectionRepository.listErrors(
        profileId,
        read.runId,
        query,
        config.errorRules,
      );
      return { items, total, page: query.page, pageSize: query.pageSize };
    }
    return { items: [], total: 0, page: query.page, pageSize: query.pageSize };
  }

  async getErrorDetail(profileId: string, errorEventId: string): Promise<ProfileErrorDetail> {
    const config = await this.requireProfile(profileId);
    if (!config.manifest.errors) {
      throw new ApiHttpError(501, 'UNSUPPORTED', 'errors not supported for this profile');
    }
    const read = await this.resolveReadMode(profileId);
    if (read.mode !== 'projection') {
      throw new ApiHttpError(
        404,
        'PROFILE_DATA_NOT_READY',
        `profile data is not ready: ${profileId}`,
      );
    }
    const detail = await this.profileProjectionRepository.getErrorDetail(
      profileId,
      read.runId,
      errorEventId,
    );
    if (detail) return detail;
    throw new ApiHttpError(404, 'ERROR_EVENT_NOT_FOUND', `error event not found: ${errorEventId}`);
  }

  async getDemandDetail(profileId: string, demandId: string): Promise<ProfileDemandDetail> {
    const read = await this.resolveReadMode(profileId);
    const manifest = (await this.requireProfile(profileId)).manifest;
    if (!manifest.deliveryUnits) {
      throw new ApiHttpError(501, 'UNSUPPORTED', 'deliveryUnits not supported for this profile');
    }

    if (read.mode === 'projection') {
      const detail = await this.profileProjectionRepository.getDemandDetail(
        profileId,
        read.runId,
        demandId,
      );
      if (detail) return detail;
      throw new ApiHttpError(404, 'DEMAND_NOT_FOUND', `demand not found: ${demandId}`);
    }
    throw new ApiHttpError(
      404,
      'PROFILE_DATA_NOT_READY',
      `profile data is not ready: ${profileId}`,
    );
  }

  async getArtifactTimeline(
    profileId: string,
    demandId: string,
    artifactId: string,
  ): Promise<ProfileArtifactTimelineItem[]> {
    const read = await this.resolveReadMode(profileId);
    const manifest = (await this.requireProfile(profileId)).manifest;
    if (!manifest.artifactTimeline) {
      throw new ApiHttpError(501, 'UNSUPPORTED', 'artifactTimeline not supported for this profile');
    }

    if (read.mode === 'projection') {
      return this.profileProjectionRepository.getArtifactTimeline(
        profileId,
        read.runId,
        demandId,
        artifactId,
      );
    }
    throw new ApiHttpError(
      404,
      'PROFILE_DATA_NOT_READY',
      `profile data is not ready: ${profileId}`,
    );
  }

  async getCapabilityAnalytics(
    profileId: string,
    query: ProfileOverviewQuery,
  ): Promise<ProfileCapabilityAnalytics> {
    const config = await this.requireProfile(profileId);
    const read = await this.resolveReadMode(profileId);

    if (read.mode === 'projection') {
      const analytics = await this.profileProjectionRepository.getCapabilityAnalytics(
        profileId,
        read.runId,
        query,
        config,
      );
      return { ...analytics, readMode: 'projection' };
    }
    return { ...emptyCapabilityAnalytics(), readMode: 'empty' };
  }

  async getCapabilityTimeseries(
    profileId: string,
    query: ProfileCapabilityTimeseriesQuery,
  ): Promise<ProfileCapabilityTimeseries> {
    const read = await this.resolveReadMode(profileId);

    if (read.mode === 'projection') {
      return this.profileProjectionRepository.getCapabilityTimeseries(profileId, read.runId, query);
    }
    return emptyCapabilityTimeseries(query);
  }

  async listCapabilityUsageSummary(
    profileId: string,
    query: ProfileCapabilityUsageSummaryQuery,
  ): Promise<{
    items: ProfileCapabilityUsageSummaryItem[];
    total: number;
    page: number;
    pageSize: number;
  }> {
    const config = await this.requireProfile(profileId);
    const read = await this.resolveReadMode(profileId);

    if (read.mode === 'projection') {
      const { items, total } = await this.profileProjectionRepository.listCapabilityUsageSummary(
        profileId,
        read.runId,
        query,
        config,
      );
      return { items, total, page: query.page, pageSize: query.pageSize };
    }
    return { items: [], total: 0, page: query.page, pageSize: query.pageSize };
  }

  async listCapabilityUsages(
    profileId: string,
    query: ProfileCapabilityUsagesQuery,
  ): Promise<{
    items: ProfileCapabilityUsageItem[];
    total: number;
    page: number;
    pageSize: number;
  }> {
    const read = await this.resolveReadMode(profileId);

    if (read.mode === 'projection') {
      const { items, total } = await this.profileProjectionRepository.listCapabilityUsages(
        profileId,
        read.runId,
        query,
      );
      return { items, total, page: query.page, pageSize: query.pageSize };
    }
    return { items: [], total: 0, page: query.page, pageSize: query.pageSize };
  }

  async listUsers(
    profileId: string,
    query: ProfileUsersQuery,
  ): Promise<{
    items: ProfileUserItem[];
    total: number;
    page: number;
    pageSize: number;
  }> {
    const config = await this.requireProfile(profileId);
    const read = await this.resolveReadMode(profileId);

    if (read.mode === 'projection') {
      const { items, total } = await this.profileProjectionRepository.listUsers(
        profileId,
        read.runId,
        query,
        config.presentation,
      );
      return { items, total, page: query.page, pageSize: query.pageSize };
    }
    return { items: [], total: 0, page: query.page, pageSize: query.pageSize };
  }

  async getUserDetail(profileId: string, userId: string): Promise<ProfileUserDetail> {
    const config = await this.requireProfile(profileId);
    const read = await this.resolveReadMode(profileId);
    const manifest = config.manifest;
    if (!manifest.capabilityUsage) {
      throw new ApiHttpError(501, 'UNSUPPORTED', 'users not supported for this profile');
    }

    if (read.mode === 'projection') {
      const detail = await this.profileProjectionRepository.getUserDetail(
        profileId,
        read.runId,
        userId,
        config.presentation,
      );
      if (detail) return detail;
      throw new ApiHttpError(404, 'USER_NOT_FOUND', `user not found: ${userId}`);
    }
    throw new ApiHttpError(
      404,
      'PROFILE_DATA_NOT_READY',
      `profile data is not ready: ${profileId}`,
    );
  }

  async listUserActivity(
    profileId: string,
    userId: string,
    query: ProfileUserActivityQuery,
  ): Promise<{ items: ProfileUserActivityItem[] }> {
    const read = await this.resolveReadMode(profileId);
    const since = rangeToSinceDate(query.range);

    if (read.mode === 'projection') {
      const items = await this.profileProjectionRepository.listUserActivity(
        profileId,
        read.runId,
        userId,
        {
          deliveryUnitId: query.deliveryUnitId ?? null,
          rangeSinceDate: since,
          limit: query.limit,
        },
      );
      return { items };
    }
    return { items: [] };
  }

  async getKnowledgeOverview(profileId: string): Promise<ProfileKnowledgeOverviewResponse> {
    const read = await this.resolveReadMode(profileId);

    if (read.mode === 'projection') {
      return this.profileProjectionRepository.getKnowledgeOverview(profileId, read.runId);
    }
    return emptyKnowledgeOverview();
  }

  async getKnowledgeTimeline(
    profileId: string,
    query: ProfileKnowledgeTimelineQuery,
  ): Promise<ProfileKnowledgeTimelineResponse> {
    const read = await this.resolveReadMode(profileId);

    if (read.mode === 'projection') {
      return this.profileProjectionRepository.getKnowledgeTimeline(profileId, read.runId, {
        rangeSinceDate: rangeToSinceDate(query.range),
        granularity: query.granularity ?? (query.range === '24h' ? 'hour' : 'day'),
        sourceNamespace: query.sourceNamespace ?? null,
        pathSegment: query.pathSegment ?? null,
      });
    }
    return { buckets: [], dimensions: [] };
  }

  async listKnowledgeAccesses(
    profileId: string,
    params: {
      range: '24h' | '7d' | '30d' | '90d' | 'all';
      page: number;
      pageSize: number;
      deliveryUnitId?: string;
      userId?: string;
      capabilityUsageId?: string;
    },
  ): Promise<{ items: ProfileKnowledgeAccessItem[]; total: number }> {
    const read = await this.resolveReadMode(profileId);

    if (read.mode === 'projection') {
      return this.profileProjectionRepository.listKnowledgeAccesses(profileId, read.runId, {
        ...params,
        rangeSinceDate: rangeToSinceDate(params.range),
      });
    }
    return { items: [], total: 0 };
  }

  async getKnowledgeDeliveryUnitRanking(
    profileId: string,
    query: ProfileKnowledgeDeliveryUnitRankingQuery,
  ): Promise<{
    items: Array<{
      deliveryUnitId: string;
      unitSlug: string | null;
      businessDomain: string | null;
      accessCount: number;
      userCount: number;
    }>;
    total: number;
  }> {
    const read = await this.resolveReadMode(profileId);

    if (read.mode === 'projection') {
      return this.profileProjectionRepository.getKnowledgeDeliveryUnitRanking(
        profileId,
        read.runId,
        {
          rangeSinceDate: rangeToSinceDate(query.range),
          sourceNamespace: query.sourceNamespace ?? null,
          pathSegment: query.pathSegment ?? null,
          userId: query.userId ?? null,
        },
      );
    }
    return { items: [], total: 0 };
  }

  async getKnowledgePathDimensionDocs(
    profileId: string,
    sourceNamespace: string,
    pathSegment: string,
  ): Promise<ProfileKnowledgePathDimensionDocsResponse> {
    const read = await this.resolveReadMode(profileId);
    if (read.mode === 'projection') {
      return this.profileProjectionRepository.getKnowledgePathDimensionDocs(
        profileId,
        read.runId,
        sourceNamespace,
        pathSegment,
      );
    }
    return { sourceNamespace, pathSegment, items: [] };
  }

  async getKnowledgeDocDetail(
    profileId: string,
    sourceNamespace: string,
    relativePath: string,
  ): Promise<ProfileKnowledgeDocDetailResponse> {
    const read = await this.resolveReadMode(profileId);
    if (read.mode === 'projection') {
      return this.profileProjectionRepository.getKnowledgeDocDetail(
        profileId,
        read.runId,
        sourceNamespace,
        relativePath,
      );
    }
    return {
      sourceNamespace,
      relativePath,
      trend: [],
      readers: [],
      sourceDeliveryUnits: [],
    };
  }

  async getKnowledgeContentByPath(
    profileId: string,
    sourceNamespace: string,
    relativePath: string,
  ): Promise<ProfileKnowledgeContent> {
    const read = await this.resolveReadMode(profileId);
    if (read.mode === 'projection') {
      const source = await this.profileProjectionRepository.findKnowledgeContentSourceByPath(
        profileId,
        read.runId,
        sourceNamespace,
        relativePath,
      );
      return readProfileKnowledgeContent(source, {
        sourceNamespace,
        relativePath,
      });
    }
    return emptyProfileKnowledgeContent('file_missing', sourceNamespace, relativePath, null);
  }

  async getKnowledgeContent(
    profileId: string,
    toolCallId: string,
  ): Promise<ProfileKnowledgeContent> {
    const read = await this.resolveReadMode(profileId);
    if (read.mode === 'projection') {
      const source = await this.profileProjectionRepository.findKnowledgeContentSourceByToolCall(
        profileId,
        read.runId,
        toolCallId,
      );
      return readProfileKnowledgeContent(source, {});
    }
    return emptyProfileKnowledgeContent('recall_not_found', null, null, null);
  }

  private async resolveReadMode(profileId: string): Promise<ProfileReadMode> {
    const config = await this.requireProfile(profileId);
    if (config.status !== 'active') return { mode: 'empty' };
    const runId = await this.profileProjectionRepository.getCurrentRunId(profileId);
    return runId == null ? { mode: 'empty' } : { mode: 'projection', runId };
  }

  private async requireProfile(profileId: string): Promise<WorkflowProfileConfig> {
    const snapshot = await this.profileConfigCatalog().getServing(profileId);
    if (!snapshot) {
      throw new ApiHttpError(404, 'PROFILE_NOT_FOUND', `profile not found: ${profileId}`);
    }
    return snapshot.config;
  }

  private profileConfigCatalog(): ProfileConfigCatalog {
    return new ProfileConfigCatalog(this.profileConfigRepository);
  }
}

async function readProfileKnowledgeContent(
  source: ProfileKnowledgeContentSource | null,
  fallback: { sourceNamespace?: string | null; relativePath?: string | null },
): Promise<ProfileKnowledgeContent> {
  if (!source) {
    return emptyProfileKnowledgeContent(
      fallback.sourceNamespace || fallback.relativePath ? 'file_missing' : 'recall_not_found',
      fallback.sourceNamespace ?? null,
      fallback.relativePath ?? null,
      null,
    );
  }

  const sourceNamespace = source.sourceNamespace ?? fallback.sourceNamespace ?? null;
  const relativePath = source.relativePath ?? fallback.relativePath ?? null;
  const rawPath = source.rawPath ?? source.normalizedPath ?? null;

  if (source.actionType && source.actionType !== 'read') {
    return emptyProfileKnowledgeContent(
      'not_readable_action',
      sourceNamespace,
      relativePath,
      rawPath,
    );
  }
  if (!source.normalizedPath || !path.isAbsolute(source.normalizedPath)) {
    return emptyProfileKnowledgeContent('file_missing', sourceNamespace, relativePath, rawPath);
  }

  const fileStat = await stat(source.normalizedPath).catch(() => null);
  if (!fileStat)
    return emptyProfileKnowledgeContent('file_missing', sourceNamespace, relativePath, rawPath);
  if (!fileStat.isFile())
    return emptyProfileKnowledgeContent('not_a_file', sourceNamespace, relativePath, rawPath);

  const maxBytes = 512 * 1024;
  const buffer = await readFile(source.normalizedPath);
  const truncated = buffer.byteLength > maxBytes;
  const content = buffer.subarray(0, maxBytes).toString('utf8');
  return {
    found: true,
    reason: 'ok',
    sourceNamespace,
    relativePath,
    rawPath,
    isMarkdown: /\.(md|mdx)$/i.test(source.normalizedPath),
    content,
    truncated,
  };
}

function emptyProfileKnowledgeContent(
  reason: ProfileKnowledgeContent['reason'],
  sourceNamespace: string | null,
  relativePath: string | null,
  rawPath: string | null,
): ProfileKnowledgeContent {
  return {
    found: false,
    reason,
    sourceNamespace,
    relativePath,
    rawPath,
    isMarkdown: false,
    content: null,
    truncated: false,
  };
}

function toSummary(config: WorkflowProfileConfig): ProfileSummary {
  return {
    profileId: config.profileId,
    displayName: config.displayName,
    status: isRuntimeConfigured(config) ? config.status : 'disabled',
    manifest: config.manifest,
    presentation: config.presentation,
  };
}

function isRuntimeConfigured(config: WorkflowProfileConfig): boolean {
  // sdd_bridge 不依赖 source root；source_backed 需所有启用规则可解析（无 unresolved）。
  if (config.projectionMode === 'sdd_bridge') return true;
  const enabledCount = config.sourceRules.filter((rule) => rule.enabled).length;
  if (enabledCount === 0) return false;
  return resolveRuntimeProfileConfig(config, process.env).unresolved.length === 0;
}

function isRuntimeConfiguredWithResolution(
  config: WorkflowProfileConfig,
  unresolvedCount: number,
): boolean {
  if (config.projectionMode === 'sdd_bridge') return true;
  const enabledCount = config.sourceRules.filter((rule) => rule.enabled).length;
  return enabledCount > 0 && unresolvedCount === 0;
}

function emptyOverview(): ProfileOverview {
  return {
    activeUserCount: 0,
    capabilityUsageCount: 0,
    deliveryUnitCount: 0,
    artifactCount: 0,
    knowledgeRecallCount: 0,
    codeWriteCount: 0,
    codeReadCount: 0,
  };
}

function emptyCapabilityAnalytics(): ProfileCapabilityAnalytics {
  const metric = { current: 0, previous: null };
  return {
    kpis: {
      capabilityUsageCount: metric,
      activeUserCount: metric,
      coveredDeliveryUnitCount: metric,
      userTriggeredCount: metric,
      autoTriggeredCount: metric,
      multiStageDeliveryUnitCount: metric,
    },
    callQuality: {
      triggeredCount: 0,
      withPromptCount: 0,
      withResponseCount: 0,
      pairedCount: 0,
      promptCoverageRate: null,
      responseCoverageRate: null,
      pairingSuccessRate: null,
    },
    topCapabilities: [],
    matchHealth: {
      matchedCount: 0,
      unmatchedCount: 0,
      matchRate: null,
      topUnmatched: [],
    },
  };
}

function emptyCapabilityTimeseries(
  query: ProfileCapabilityTimeseriesQuery,
): ProfileCapabilityTimeseries {
  return {
    bucket: query.bucket ?? '1h',
    points: [],
  };
}

function emptyKnowledgeOverview(): ProfileKnowledgeOverviewResponse {
  return {
    totals: {
      accessedDocs: 0,
      accessCount: 0,
      distinctUsers: 0,
    },
    sources: [],
    pathDimensions: [],
  };
}

function rangeToSinceDate(range: '24h' | '7d' | '30d' | '90d' | 'all'): Date | null {
  if (range === 'all') return null;
  const days = range === '24h' ? 1 : range === '7d' ? 7 : range === '30d' ? 30 : 90;
  return new Date(Date.now() - days * 86_400_000);
}
