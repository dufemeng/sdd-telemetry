import { Config, Inject, Provide } from '@midwayjs/core';
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
  ProfileKnowledgeCoverageResponse,
  ProfileKnowledgeRecallItem,
  ProfileOverview,
  ProfileOverviewQuery,
  ProfileSummary,
  ProfileUserDetail,
  ProfileUserItem,
  ProfileUsersQuery,
} from '@sdd-telemetry/api';
import { ApiHttpError } from '../../common/auth/api-http-error';
import { SddQueryService } from '../sdd/sdd-query.service';
import {
  getProfileConfig,
  listProfileConfigs,
  type WorkflowProfileConfig,
} from './profile-config';
import { ProfileProjectionRepository } from './profile-projection.repository';

type ReadSource = 'legacy_sdd' | 'profile_projection';

@Provide('profilesService')
export class ProfilesService {
  @Inject('sddQueryService')
  sddQueryService!: SddQueryService;

  @Inject('profileProjectionRepository')
  profileProjectionRepository!: ProfileProjectionRepository;

  @Config('profileDashboard')
  profileDashboard!: { readSource: ReadSource };

  listProfiles(): ProfileSummary[] {
    return listProfileConfigs().map(toSummary);
  }

  getManifest(profileId: string): ProfileCapabilityManifest {
    return this.requireProfile(profileId).manifest;
  }

  /**
   * 读源策略（Task 17）：
   * - profile_projection：从 profile_* current run 读（含真实 knowledgeRecallCount）。
   *   无 current pointer 时自动回退 legacy，保证不破。
   * - legacy_sdd：复用 SddQueryService.getOverview，把 SDD 口径映射到通用 contract。
   */
  async getOverview(
    profileId: string,
    query: ProfileOverviewQuery,
  ): Promise<ProfileOverview> {
    this.requireProfile(profileId);

    if (this.profileDashboard.readSource === 'profile_projection') {
      const runId = await this.profileProjectionRepository.getCurrentRunId(profileId);
      if (runId != null) {
        return this.profileProjectionRepository.getOverview(profileId, runId, query);
      }
      // 无 current pointer：回退 legacy。
    }

    const sdd = await this.sddQueryService.getOverview(query);
    return {
      activeUserCount: sdd.activeUserCount,
      capabilityUsageCount: sdd.skillUsageCount,
      deliveryUnitCount: sdd.coveredWorkItemCount,
      artifactCount: sdd.generatedDocumentCount,
      knowledgeRecallCount: 0,
      codeWriteCount: 0,
      codeReadCount: 0,
    };
  }

  /**
   * 产出分析列表（Task 20）。profile_projection 有 current pointer 时读 projection，
   * 否则回退 legacy（sdd work items 映射成 delivery unit）。
   */
  async listDemands(
    profileId: string,
    query: ProfileOverviewQuery,
  ): Promise<ProfileDemand[]> {
    this.requireProfile(profileId);

    if (this.profileDashboard.readSource === 'profile_projection') {
      const runId = await this.profileProjectionRepository.getCurrentRunId(profileId);
      if (runId != null) {
        return this.profileProjectionRepository.listDemands(profileId, runId, query);
      }
    }

    const workItems = await this.sddQueryService.listWorkItems({ ...query, limit: 500 });
    return workItems.map((w) => ({
      id: w.id,
      deliveryUnitKey: w.workItemKey,
      businessDomain: w.businessDomain,
      unitSlug: w.workItemSlug,
      title: w.workItemTitle,
      locator: w.relativeDir,
      firstSeenAt: w.firstSeenAt,
      lastSeenAt: w.lastSeenAt,
      artifactCount: w.artifactCount,
      capabilityUsageCount: w.usageCount,
      errorCount: w.errorCount,
      coverageStages: w.coverageStages,
    }));
  }

  async getDemandDetail(
    profileId: string,
    demandId: string,
  ): Promise<ProfileDemandDetail> {
    this.requireProfile(profileId);
    const manifest = getProfileConfig(profileId)!.manifest;
    if (!manifest.deliveryUnits) {
      throw new ApiHttpError(501, 'UNSUPPORTED', 'deliveryUnits not supported for this profile');
    }

    if (this.profileDashboard.readSource === 'profile_projection') {
      const runId = await this.profileProjectionRepository.getCurrentRunId(profileId);
      if (runId != null) {
        const detail = await this.profileProjectionRepository.getDemandDetail(profileId, runId, demandId);
        if (detail) return detail;
      }
    }

    const sdd = await this.sddQueryService.getWorkItemDetail(demandId);
    if (!sdd) throw new ApiHttpError(404, 'DEMAND_NOT_FOUND', `demand not found: ${demandId}`);
    return {
      id: sdd.id,
      deliveryUnitKey: sdd.workItemKey,
      businessDomain: sdd.businessDomain,
      unitSlug: sdd.workItemSlug,
      title: sdd.workItemTitle,
      locator: sdd.relativeDir,
      firstSeenAt: sdd.firstSeenAt,
      lastSeenAt: sdd.lastSeenAt,
      artifactCount: sdd.artifactCount,
      capabilityUsageCount: sdd.usageCount,
      errorCount: sdd.errorCount,
      coverageStages: sdd.coverageStages,
      artifacts: sdd.artifacts.map((a) => ({
        id: a.id,
        artifactType: a.artifactType,
        artifactLocator: a.artifactRelativePath,
        systemModule: a.systemModule,
        lastSeenAt: a.lastSeenAt,
      })),
      turnCount: sdd.turnCount,
      sessionCount: sdd.sessionCount,
      contributorCount: sdd.contributorCount,
      knowledgeRecallCount: sdd.wikiRecallCount,
    };
  }

  async getArtifactTimeline(
    profileId: string,
    demandId: string,
    artifactId: string,
  ): Promise<ProfileArtifactTimelineItem[]> {
    this.requireProfile(profileId);
    const manifest = getProfileConfig(profileId)!.manifest;
    if (!manifest.artifactTimeline) {
      throw new ApiHttpError(501, 'UNSUPPORTED', 'artifactTimeline not supported for this profile');
    }

    if (this.profileDashboard.readSource === 'profile_projection') {
      const runId = await this.profileProjectionRepository.getCurrentRunId(profileId);
      if (runId != null) {
        return this.profileProjectionRepository.getArtifactTimeline(profileId, runId, demandId, artifactId);
      }
    }

    const sdd = await this.sddQueryService.listArtifactWrites(demandId, artifactId);
    return sdd.items.map((w) => ({
      id: w.id,
      nodeKind: w.nodeKind,
      writeKind: w.writeKind,
      eventTime: w.eventTime,
      eventSequence: w.eventSequence,
      interactionId: w.interactionId,
      capabilityCode: w.skillSemanticCode,
      capabilityDisplayName: w.skillDisplayName,
      rawCapabilityName: w.rawSkillName,
      knowledgeRecallCount: w.wikiRecallCount,
      promptPreview: w.promptPreview,
      contentPreview: w.contentPreview,
    }));
  }

  async getCapabilityAnalytics(
    profileId: string,
    query: ProfileOverviewQuery,
  ): Promise<ProfileCapabilityAnalytics> {
    this.requireProfile(profileId);

    if (this.profileDashboard.readSource === 'profile_projection') {
      const runId = await this.profileProjectionRepository.getCurrentRunId(profileId);
      if (runId != null) {
        return this.profileProjectionRepository.getCapabilityAnalytics(profileId, runId, query);
      }
    }

    const sdd = await this.sddQueryService.getSkillAnalytics(query);
    return {
      kpis: {
        capabilityUsageCount: sdd.kpis.skillUsageCount,
        activeUserCount: sdd.kpis.activeUserCount,
        coveredDeliveryUnitCount: sdd.kpis.coveredWorkItemCount,
        userTriggeredCount: sdd.kpis.userTriggeredCount,
        autoTriggeredCount: sdd.kpis.autoTriggeredCount,
        multiStageDeliveryUnitCount: sdd.kpis.multiStageWorkItemCount,
      },
      callQuality: sdd.callQuality,
      topCapabilities: sdd.topSemantics.map((s) => ({
        capabilityCode: s.semanticCode,
        displayName: s.displayName,
        usageCount: s.usageCount,
        userCount: s.userCount,
        deliveryUnitCount: s.workItemCount,
        conversionRate: s.conversionRate,
      })),
      matchHealth: {
        matchedCount: sdd.matchHealth.matchedCount,
        unmatchedCount: sdd.matchHealth.unmatchedCount,
        matchRate: sdd.matchHealth.matchRate,
        topUnmatched: sdd.matchHealth.topUnmatched.map((u) => ({
          rawCapabilityName: u.rawSkillName,
          usageCount: u.usageCount,
        })),
      },
    };
  }

  async getCapabilityTimeseries(
    profileId: string,
    query: ProfileCapabilityTimeseriesQuery,
  ): Promise<ProfileCapabilityTimeseries> {
    this.requireProfile(profileId);

    if (this.profileDashboard.readSource === 'profile_projection') {
      const runId = await this.profileProjectionRepository.getCurrentRunId(profileId);
      if (runId != null) {
        return this.profileProjectionRepository.getCapabilityTimeseries(profileId, runId, query);
      }
    }

    return this.sddQueryService.getSkillTimeseries(query);
  }

  async listCapabilityUsageSummary(
    profileId: string,
    query: ProfileCapabilityUsageSummaryQuery,
  ): Promise<{ items: ProfileCapabilityUsageSummaryItem[]; total: number; page: number; pageSize: number }> {
    this.requireProfile(profileId);

    if (this.profileDashboard.readSource === 'profile_projection') {
      const runId = await this.profileProjectionRepository.getCurrentRunId(profileId);
      if (runId != null) {
        const { items, total } = await this.profileProjectionRepository.listCapabilityUsageSummary(profileId, runId, query);
        return { items, total, page: query.page, pageSize: query.pageSize };
      }
    }

    const sddQuery = {
      ...query,
      semanticCode: query.capabilityCode,
    };
    const sdd = await this.sddQueryService.getUsageSummary(sddQuery);
    return {
      items: sdd.items.map((s) => ({
        capabilityCode: s.semanticCode,
        capabilityDisplayName: s.semanticDisplayName,
        rawCapabilityName: s.rawSkillName,
        usageCount: s.usageCount,
        activeUserCount: s.activeUserCount,
        sessionCount: s.sessionCount,
        deliveryUnitCount: s.workItemCount,
        versions: s.versions,
        firstSeenAt: s.firstSeenAt,
        lastSeenAt: s.lastSeenAt,
      })),
      total: sdd.total,
      page: sdd.page,
      pageSize: sdd.pageSize,
    };
  }

  async listCapabilityUsages(
    profileId: string,
    query: ProfileCapabilityUsagesQuery,
  ): Promise<{ items: ProfileCapabilityUsageItem[]; total: number; page: number; pageSize: number }> {
    this.requireProfile(profileId);

    if (this.profileDashboard.readSource === 'profile_projection') {
      const runId = await this.profileProjectionRepository.getCurrentRunId(profileId);
      if (runId != null) {
        const { items, total } = await this.profileProjectionRepository.listCapabilityUsages(profileId, runId, query);
        return { items, total, page: query.page, pageSize: query.pageSize };
      }
    }

    const sddQuery = {
      ...query,
      semanticCode: query.capabilityCode,
      workItemId: query.deliveryUnitId,
      limit: query.pageSize,
    };
    const sddItems = await this.sddQueryService.listUsages(sddQuery);
    const items: ProfileCapabilityUsageItem[] = sddItems.map((s) => ({
      id: s.id,
      usageKey: s.usageKey,
      capabilityCode: s.semanticCode,
      capabilityDisplayName: s.semanticDisplayName,
      rawCapabilityName: s.rawSkillName,
      capabilitySource: null,
      status: s.status,
      userId: s.userId,
      interactionId: s.interactionId,
      deliveryUnitId: s.workItemId,
      sessionId: s.sessionId,
      promptId: s.promptId,
      eventTime: s.eventTime,
    }));
    return { items, total: items.length, page: query.page, pageSize: query.pageSize };
  }

  async listUsers(
    profileId: string,
    query: ProfileUsersQuery,
  ): Promise<{ items: ProfileUserItem[]; total: number; page: number; pageSize: number }> {
    this.requireProfile(profileId);

    if (this.profileDashboard.readSource === 'profile_projection') {
      const runId = await this.profileProjectionRepository.getCurrentRunId(profileId);
      if (runId != null) {
        const { items, total } = await this.profileProjectionRepository.listUsers(profileId, runId, query);
        return { items, total, page: query.page, pageSize: query.pageSize };
      }
    }

    throw new ApiHttpError(501, 'UNSUPPORTED', 'users not available via legacy source');
  }

  async getUserDetail(
    profileId: string,
    userId: string,
  ): Promise<ProfileUserDetail> {
    this.requireProfile(profileId);
    const manifest = getProfileConfig(profileId)!.manifest;
    if (!manifest.capabilityUsage) {
      throw new ApiHttpError(501, 'UNSUPPORTED', 'users not supported for this profile');
    }

    if (this.profileDashboard.readSource === 'profile_projection') {
      const runId = await this.profileProjectionRepository.getCurrentRunId(profileId);
      if (runId != null) {
        const detail = await this.profileProjectionRepository.getUserDetail(profileId, runId, userId);
        if (detail) return detail;
      }
    }

    throw new ApiHttpError(404, 'USER_NOT_FOUND', `user not found: ${userId}`);
  }

  async getKnowledgeCoverage(
    profileId: string,
  ): Promise<ProfileKnowledgeCoverageResponse> {
    this.requireProfile(profileId);

    if (this.profileDashboard.readSource === 'profile_projection') {
      const runId = await this.profileProjectionRepository.getCurrentRunId(profileId);
      if (runId != null) {
        return this.profileProjectionRepository.getKnowledgeCoverage(profileId, runId);
      }
    }

    const sdd = await this.sddQueryService.getWikiRecallCoverage();
    return {
      scan: { configured: sdd.scan.configured, repos: sdd.scan.repos.map((r) => ({ sourceNamespace: r.repo, label: r.label, gitRef: r.gitRef, scannedAt: r.scannedAt })) },
      totals: sdd.totals,
      repos: sdd.repos.map((r) => ({
        sourceNamespace: r.repo,
        label: r.label,
        totalDocs: r.totalDocs,
        recalledDocs: r.recalledDocs,
        coverageRate: r.coverageRate,
        recalls: r.recalls,
        deadDocs: r.deadDocs,
        newUnreadDocs: r.newUnreadDocs,
        distinctUsers: r.distinctUsers,
      })),
      domains: sdd.domains.map((d) => ({
        sourceNamespace: d.repo,
        domain: d.domain,
        totalDocs: d.totalDocs,
        recalledDocs: d.recalledDocs,
        recalls: d.recalls,
        deadDocs: d.deadDocs,
        newUnreadDocs: d.newUnreadDocs,
        distinctUsers: d.distinctUsers,
        lastRecallAt: d.lastRecallAt,
      })),
    };
  }

  async getKnowledgeTimeline(
    profileId: string,
    range: string,
  ): Promise<{ points: Array<{ t: string; group: string | null; count: number }> }> {
    this.requireProfile(profileId);

    if (this.profileDashboard.readSource === 'profile_projection') {
      const runId = await this.profileProjectionRepository.getCurrentRunId(profileId);
      if (runId != null) {
        const bucketSeconds = range === '24h' ? 3600 : range === '90d' ? 86400 : range === '30d' ? 3600 * 3 : 86400;
        return this.profileProjectionRepository.getKnowledgeTimeline(profileId, runId, bucketSeconds);
      }
    }

    const sdd = await this.sddQueryService.getWikiRecallTimeline(range as '24h' | '7d' | '30d' | '90d' | 'all', 'day', 'domain');
    return {
      points: sdd.points.map((p) => ({
        t: p.t,
        group: p.group,
        count: p.count,
      })),
    };
  }

  async listKnowledgeRecalls(
    profileId: string,
    params: { page: number; pageSize: number; deliveryUnitId?: string; userId?: string },
  ): Promise<{ items: ProfileKnowledgeRecallItem[]; total: number }> {
    this.requireProfile(profileId);

    if (this.profileDashboard.readSource === 'profile_projection') {
      const runId = await this.profileProjectionRepository.getCurrentRunId(profileId);
      if (runId != null) {
        return this.profileProjectionRepository.listKnowledgeRecalls(profileId, runId, params);
      }
    }

    const filters: { workItemId?: string; userId?: string; skillUsageId?: string } = {};
    if (params.deliveryUnitId) filters.workItemId = params.deliveryUnitId;
    if (params.userId) filters.userId = params.userId;
    const sdd = await this.sddQueryService.listWikiRecalls(
      '7d',
      filters,
      params.page,
      params.pageSize,
    );
    return {
      items: sdd.items.map((w) => ({
        id: String(w.id),
        toolCallId: w.toolCallId,
        interactionId: w.interactionId,
        capabilityUsageId: w.skillUsageId,
        deliveryUnitId: w.workItemId,
        userId: w.userId,
        userName: w.userName,
        actionType: w.actionType,
        rawLocator: w.rawPath,
        knowledgeRelativePath: w.wikiRelativePath,
        knowledgeDomain: w.wikiDomain,
        knowledgeAxis: w.wikiAxis,
        knowledgeSystem: w.wikiSystem,
        eventSequence: w.eventSequence,
        eventTime: w.eventTime,
      })),
      total: sdd.total,
    };
  }

  async getKnowledgeDeliveryUnitRanking(
    profileId: string,
  ): Promise<{ items: Array<{ deliveryUnitId: string; unitSlug: string | null; businessDomain: string | null; totalRecalls: number; distinctDomains: number; distinctSystems: number; userCount: number }>; total: number }> {
    this.requireProfile(profileId);

    if (this.profileDashboard.readSource === 'profile_projection') {
      const runId = await this.profileProjectionRepository.getCurrentRunId(profileId);
      if (runId != null) {
        return this.profileProjectionRepository.getKnowledgeDeliveryUnitRanking(profileId, runId);
      }
    }

    const sdd = await this.sddQueryService.getWikiRecallWorkItemRanking('7d', null, null);
    return {
      items: sdd.items.map((w) => ({
        deliveryUnitId: String(w.workItemId),
        unitSlug: w.workItemSlug,
        businessDomain: w.businessDomain,
        totalRecalls: w.totalRecalls,
        distinctDomains: w.distinctDomains,
        distinctSystems: w.distinctSystems,
        userCount: w.userCount,
      })),
      total: sdd.total,
    };
  }

  private requireProfile(profileId: string): WorkflowProfileConfig {
    const config = getProfileConfig(profileId);
    if (!config) {
      throw new ApiHttpError(404, 'PROFILE_NOT_FOUND', `profile not found: ${profileId}`);
    }
    return config;
  }
}

function toSummary(config: WorkflowProfileConfig): ProfileSummary {
  return {
    profileId: config.profileId,
    displayName: config.displayName,
    status: config.status,
    manifest: config.manifest,
  };
}
