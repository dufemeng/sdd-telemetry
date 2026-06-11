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
  ProfileKnowledgeDeliveryUnitRankingQuery,
  ProfileKnowledgeRecallItem,
  ProfileKnowledgeTimelineQuery,
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
import { SddQueryService } from '../sdd/sdd-query.service';
import {
  getProfileConfig,
  listProfileConfigs,
  resolveRuntimeProfileConfig,
  validateProfileConfig,
  type WorkflowProfileConfig,
} from './profile-config';
import { ProfileProjectionRepository } from './profile-projection.repository';

type ReadSource = 'legacy_sdd' | 'profile_projection';
type ProfileReadMode =
  | { mode: 'projection'; runId: number }
  | { mode: 'legacy' }
  | { mode: 'empty' };

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

  async getInspector(profileId: string): Promise<ProfileInspectorResponse> {
    const config = this.requireProfile(profileId);
    const validation = validateProfileConfig(config);
    const runtime = resolveRuntimeProfileConfig(config, process.env);
    const readSource = this.resolveReadSource(config);
    const read = await this.resolveReadMode(profileId);
    const projection = await this.profileProjectionRepository.getInspector(profileId);

    return {
      profile: {
        profileId: config.profileId,
        displayName: config.displayName,
        status: isRuntimeConfiguredWithResolution(config, runtime.unresolved.length) ? config.status : 'disabled',
        projectionMode: config.projectionMode,
        readSource,
        manifest: config.manifest,
        presentation: config.presentation,
      },
      validation,
      runtime: {
        configured: isRuntimeConfiguredWithResolution(config, runtime.unresolved.length),
        resolvedRuleCount: runtime.rules.length,
        unresolved: runtime.unresolved,
        resolvedSourceRules: runtime.rules.map<ProfileInspectorResolvedSourceRule>(({ rule, resolvedRoot }) => ({
          ruleId: rule.ruleId,
          locatorType: rule.locatorType,
          category: rule.category,
          confidence: rule.confidence,
          priority: rule.priority,
          actions: rule.actions,
          resolvedRoot,
          description: rule.description ?? null,
        })),
      },
      projection: {
        readMode: read.mode,
        currentRun: projection.currentRun,
        latestRun: projection.latestRun,
        counts: projection.counts,
      },
      rules: {
        sourceRules: config.sourceRules.map((rule) => ({ ...rule })),
        deliveryUnitRules: config.deliveryUnitRules.map((rule) => ({ ...rule })),
        artifactRules: config.artifactRules.map((rule) => ({ ...rule })),
        capabilityRules: config.capabilityRules.map((rule) => ({ ...rule })),
        attributionPolicy: { ...config.attributionPolicy },
      },
    };
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
    const read = await this.resolveReadMode(profileId);

    if (read.mode === 'projection') {
      return this.profileProjectionRepository.getOverview(profileId, read.runId, query);
    }
    if (read.mode === 'empty') return emptyOverview();

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
    const read = await this.resolveReadMode(profileId);

    if (read.mode === 'projection') {
      return this.profileProjectionRepository.listDemands(profileId, read.runId, query);
    }
    if (read.mode === 'empty') return [];

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
    const read = await this.resolveReadMode(profileId);
    const manifest = getProfileConfig(profileId)!.manifest;
    if (!manifest.deliveryUnits) {
      throw new ApiHttpError(501, 'UNSUPPORTED', 'deliveryUnits not supported for this profile');
    }

    if (read.mode === 'projection') {
      const detail = await this.profileProjectionRepository.getDemandDetail(profileId, read.runId, demandId);
      if (detail) return detail;
      throw new ApiHttpError(404, 'DEMAND_NOT_FOUND', `demand not found: ${demandId}`);
    }
    if (read.mode === 'empty') {
      throw new ApiHttpError(404, 'PROFILE_DATA_NOT_READY', `profile data is not ready: ${profileId}`);
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
    const read = await this.resolveReadMode(profileId);
    const manifest = getProfileConfig(profileId)!.manifest;
    if (!manifest.artifactTimeline) {
      throw new ApiHttpError(501, 'UNSUPPORTED', 'artifactTimeline not supported for this profile');
    }

    if (read.mode === 'projection') {
      return this.profileProjectionRepository.getArtifactTimeline(profileId, read.runId, demandId, artifactId);
    }
    if (read.mode === 'empty') {
      throw new ApiHttpError(404, 'PROFILE_DATA_NOT_READY', `profile data is not ready: ${profileId}`);
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
    const read = await this.resolveReadMode(profileId);

    if (read.mode === 'projection') {
      return this.profileProjectionRepository.getCapabilityAnalytics(profileId, read.runId, query);
    }
    if (read.mode === 'empty') return emptyCapabilityAnalytics();

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
    const read = await this.resolveReadMode(profileId);

    if (read.mode === 'projection') {
      return this.profileProjectionRepository.getCapabilityTimeseries(profileId, read.runId, query);
    }
    if (read.mode === 'empty') return emptyCapabilityTimeseries(query);

    return this.sddQueryService.getSkillTimeseries(query);
  }

  async listCapabilityUsageSummary(
    profileId: string,
    query: ProfileCapabilityUsageSummaryQuery,
  ): Promise<{ items: ProfileCapabilityUsageSummaryItem[]; total: number; page: number; pageSize: number }> {
    const read = await this.resolveReadMode(profileId);

    if (read.mode === 'projection') {
      const { items, total } = await this.profileProjectionRepository.listCapabilityUsageSummary(profileId, read.runId, query);
      return { items, total, page: query.page, pageSize: query.pageSize };
    }
    if (read.mode === 'empty') return { items: [], total: 0, page: query.page, pageSize: query.pageSize };

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
    const read = await this.resolveReadMode(profileId);

    if (read.mode === 'projection') {
      const { items, total } = await this.profileProjectionRepository.listCapabilityUsages(profileId, read.runId, query);
      return { items, total, page: query.page, pageSize: query.pageSize };
    }
    if (read.mode === 'empty') return { items: [], total: 0, page: query.page, pageSize: query.pageSize };

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
    const read = await this.resolveReadMode(profileId);

    if (read.mode === 'projection') {
      const { items, total } = await this.profileProjectionRepository.listUsers(profileId, read.runId, query);
      return { items, total, page: query.page, pageSize: query.pageSize };
    }
    if (read.mode === 'empty') return { items: [], total: 0, page: query.page, pageSize: query.pageSize };

    const sddUsers = await this.sddQueryService.listUsers();
    const filteredUsers = sddUsers.filter((u) => {
      if (query.status && u.status !== query.status) return false;
      if (query.keyword) {
        const kw = query.keyword.toLowerCase();
        const text = `${u.userName ?? ''} ${u.userKey ?? ''} ${u.installId ?? ''} ${u.machineName ?? ''}`.toLowerCase();
        if (!text.includes(kw)) return false;
      }
      if (query.from && (!u.lastSeenAt || u.lastSeenAt < query.from)) return false;
      if (query.to && (!u.lastSeenAt || u.lastSeenAt > query.to)) return false;
      return true;
    });
    const offset = (query.page - 1) * query.pageSize;
    const pageUsers = filteredUsers.slice(offset, offset + query.pageSize);
    const items: ProfileUserItem[] = pageUsers.map((u) => ({
      id: u.id,
      userKey: u.userKey,
      installId: u.installId,
      displayName: u.userName,
      machineId: u.machineId,
      machineName: u.machineName,
      firstSeenAt: u.firstSeenAt,
      lastSeenAt: u.lastSeenAt,
      capabilityUsageCount: u.skillUsageCount,
      interactionCount: u.interactionCount,
      deliveryUnitCount: u.workItemCount,
      capabilityStages: u.semanticStages,
      status: u.status,
      isNew: u.isNew,
      artifactCount: u.artifactCount,
      knowledgeRecallCount: 0,
      codeWriteCount: u.codeWriteCount,
      codeReadCount: u.codeReadCount,
      rampDays: u.rampDays,
    }));
    return { items, total: filteredUsers.length, page: query.page, pageSize: query.pageSize };
  }

  async getUserDetail(
    profileId: string,
    userId: string,
  ): Promise<ProfileUserDetail> {
    const read = await this.resolveReadMode(profileId);
    const manifest = getProfileConfig(profileId)!.manifest;
    if (!manifest.capabilityUsage) {
      throw new ApiHttpError(501, 'UNSUPPORTED', 'users not supported for this profile');
    }

    if (read.mode === 'projection') {
      const detail = await this.profileProjectionRepository.getUserDetail(profileId, read.runId, userId);
      if (detail) return detail;
      throw new ApiHttpError(404, 'USER_NOT_FOUND', `user not found: ${userId}`);
    }
    if (read.mode === 'empty') {
      throw new ApiHttpError(404, 'PROFILE_DATA_NOT_READY', `profile data is not ready: ${profileId}`);
    }

    const sddDetail = await this.sddQueryService.getUserDetail(userId);
    if (!sddDetail) throw new ApiHttpError(404, 'USER_NOT_FOUND', `user not found: ${userId}`);
    const u = sddDetail.user;
    return {
      user: {
        id: u.id, userKey: u.userKey, installId: u.installId,
        displayName: u.userName, machineId: u.machineId, machineName: u.machineName,
        firstSeenAt: u.firstSeenAt, lastSeenAt: u.lastSeenAt,
        capabilityUsageCount: u.skillUsageCount, interactionCount: u.interactionCount,
        deliveryUnitCount: u.workItemCount, capabilityStages: u.semanticStages,
        status: u.status, isNew: u.isNew, artifactCount: u.artifactCount,
        knowledgeRecallCount: 0, codeWriteCount: u.codeWriteCount, codeReadCount: u.codeReadCount,
        rampDays: u.rampDays,
      },
      summary: {
        deliveryUnitCount: sddDetail.summary.workItemCount,
        artifactCount: sddDetail.summary.artifactCount,
        turnCount: sddDetail.summary.turnCount,
        sessionCount: sddDetail.summary.sessionCount,
        knowledgeRecallCount: 0,
        codeWriteCount: sddDetail.summary.codeWriteCount,
        codeReadCount: sddDetail.summary.codeReadCount,
      },
      maturity: {
        stages: sddDetail.maturity.stages,
        completionRate: sddDetail.maturity.completionRate,
        rampDays: sddDetail.maturity.rampDays,
      },
      deliveryUnits: sddDetail.workItems.map((wi) => ({
        deliveryUnitId: wi.workItemId,
        title: wi.title,
        stageCodes: wi.stageCodes,
        lastActivityAt: wi.lastActivityAt,
      })),
    };
  }

  async listUserActivity(
    profileId: string,
    userId: string,
    query: ProfileUserActivityQuery,
  ): Promise<{ items: ProfileUserActivityItem[] }> {
    const read = await this.resolveReadMode(profileId);
    const since = rangeToSinceDate(query.range);

    if (read.mode === 'projection') {
      const items = await this.profileProjectionRepository.listUserActivity(profileId, read.runId, userId, {
        deliveryUnitId: query.deliveryUnitId ?? null,
        rangeSinceDate: since,
        limit: query.limit,
      });
      return { items };
    }
    if (read.mode === 'empty') return { items: [] };

    const [usages, recalls] = await Promise.all([
      this.sddQueryService.listUsages({
        userId,
        ...(query.deliveryUnitId ? { workItemId: query.deliveryUnitId } : {}),
        ...(since ? { from: since.toISOString() } : {}),
        limit: query.limit,
      }),
      this.sddQueryService.listWikiRecalls(
        query.range,
        {
          userId,
          ...(query.deliveryUnitId ? { workItemId: query.deliveryUnitId } : {}),
        },
        1,
        query.limit,
      ),
    ]);

    const items: ProfileUserActivityItem[] = [
      ...usages.map((usage) => ({
        id: `capability-${usage.id}`,
        kind: 'capability' as const,
        eventTime: usage.eventTime,
        interactionId: usage.interactionId,
        deliveryUnitId: usage.workItemId,
        artifactId: null,
        capabilityUsageId: usage.id,
        capabilityCode: usage.semanticCode,
        capabilityDisplayName: usage.semanticDisplayName,
        rawCapabilityName: usage.rawSkillName,
        title: usage.semanticDisplayName ?? usage.rawSkillName ?? '能力调用',
        detail: usage.status,
        locator: null,
      })),
      ...recalls.items.map((recall) => ({
        id: `knowledge-${recall.id}`,
        kind: 'knowledge' as const,
        eventTime: recall.eventTime,
        interactionId: recall.interactionId,
        deliveryUnitId: recall.workItemId,
        artifactId: null,
        capabilityUsageId: recall.skillUsageId,
        capabilityCode: null,
        capabilityDisplayName: null,
        rawCapabilityName: null,
        title: recall.actionType === 'read' ? '知识读取' : `知识 ${recall.actionType}`,
        detail: recall.wikiRelativePath ?? recall.rawPath,
        locator: recall.wikiRelativePath ?? recall.rawPath,
      })),
    ];

    items.sort((a, b) => {
      if (!a.eventTime && !b.eventTime) return 0;
      if (!a.eventTime) return 1;
      if (!b.eventTime) return -1;
      return new Date(b.eventTime).getTime() - new Date(a.eventTime).getTime();
    });
    return { items: items.slice(0, query.limit) };
  }

  async getKnowledgeCoverage(
    profileId: string,
  ): Promise<ProfileKnowledgeCoverageResponse> {
    const read = await this.resolveReadMode(profileId);

    if (read.mode === 'projection') {
      return this.profileProjectionRepository.getKnowledgeCoverage(profileId, read.runId);
    }
    if (read.mode === 'empty') return emptyKnowledgeCoverage();

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
    query: ProfileKnowledgeTimelineQuery,
  ): Promise<{ points: Array<{ t: string; group: string | null; count: number }> }> {
    const read = await this.resolveReadMode(profileId);

    if (read.mode === 'projection') {
      return this.profileProjectionRepository.getKnowledgeTimeline(profileId, read.runId, {
        rangeSinceDate: rangeToSinceDate(query.range),
        granularity: query.granularity ?? (query.range === '24h' ? 'hour' : 'day'),
        groupBy: query.groupBy ?? 'domain',
        wikiDomain: query.wikiDomain ?? null,
      });
    }
    if (read.mode === 'empty') return { points: [] };

    const sdd = await this.sddQueryService.getWikiRecallTimeline(
      query.range,
      query.granularity ?? (query.range === '24h' ? 'hour' : 'day'),
      query.groupBy ?? 'domain',
      query.wikiDomain ?? null,
    );
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
    params: { range: '24h' | '7d' | '30d' | '90d' | 'all'; page: number; pageSize: number; deliveryUnitId?: string; userId?: string; capabilityUsageId?: string },
  ): Promise<{ items: ProfileKnowledgeRecallItem[]; total: number }> {
    const read = await this.resolveReadMode(profileId);

    if (read.mode === 'projection') {
      return this.profileProjectionRepository.listKnowledgeRecalls(profileId, read.runId, {
        ...params,
        rangeSinceDate: rangeToSinceDate(params.range),
      });
    }
    if (read.mode === 'empty') return { items: [], total: 0 };

    const filters: { workItemId?: string; userId?: string; skillUsageId?: string } = {};
    if (params.deliveryUnitId) filters.workItemId = params.deliveryUnitId;
    if (params.userId) filters.userId = params.userId;
    if (params.capabilityUsageId) filters.skillUsageId = params.capabilityUsageId;
    const sdd = await this.sddQueryService.listWikiRecalls(
      params.range,
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
    query: ProfileKnowledgeDeliveryUnitRankingQuery,
  ): Promise<{ items: Array<{ deliveryUnitId: string; unitSlug: string | null; businessDomain: string | null; totalRecalls: number; distinctDomains: number; distinctSystems: number; userCount: number }>; total: number }> {
    const read = await this.resolveReadMode(profileId);

    if (read.mode === 'projection') {
      return this.profileProjectionRepository.getKnowledgeDeliveryUnitRanking(profileId, read.runId, {
        rangeSinceDate: rangeToSinceDate(query.range),
        wikiDomain: query.wikiDomain ?? null,
        userId: query.userId ?? null,
      });
    }
    if (read.mode === 'empty') return { items: [], total: 0 };

    const sdd = await this.sddQueryService.getWikiRecallWorkItemRanking(
      query.range,
      query.wikiDomain ?? null,
      query.userId ?? null,
    );
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

  private async resolveReadMode(profileId: string): Promise<ProfileReadMode> {
    const config = this.requireProfile(profileId);
    if (this.resolveReadSource(config) === 'profile_projection') {
      const runId = await this.profileProjectionRepository.getCurrentRunId(profileId);
      if (runId != null) return { mode: 'projection', runId };
    }
    return config.projectionMode === 'sdd_bridge' ? { mode: 'legacy' } : { mode: 'empty' };
  }

  private resolveReadSource(config: WorkflowProfileConfig): ReadSource {
    if (config.projectionMode === 'source_backed') return 'profile_projection';
    return this.profileDashboard.readSource;
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

function isRuntimeConfiguredWithResolution(config: WorkflowProfileConfig, unresolvedCount: number): boolean {
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

function emptyKnowledgeCoverage(): ProfileKnowledgeCoverageResponse {
  return {
    scan: { configured: false, repos: [] },
    totals: {
      totalDocs: 0,
      recalledDocs: 0,
      coverageRate: 0,
      recalls: 0,
      coldDocs: 0,
      deadDocs: 0,
      newUnreadDocs: 0,
      orphanPaths: 0,
    },
    repos: [],
    domains: [],
  };
}

function rangeToSinceDate(range: '24h' | '7d' | '30d' | '90d' | 'all'): Date | null {
  if (range === 'all') return null;
  const days =
    range === '24h' ? 1 :
    range === '7d' ? 7 :
    range === '30d' ? 30 :
    90;
  return new Date(Date.now() - days * 86_400_000);
}
