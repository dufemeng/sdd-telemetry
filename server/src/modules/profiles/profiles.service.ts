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
  ProfileOverview,
  ProfileOverviewQuery,
  ProfileSummary,
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
