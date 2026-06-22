import { Controller, Get, Inject } from '@midwayjs/core';
import type { Context } from '@midwayjs/koa';
import {
  ProfileArtifactTimelineResponseSchema,
  ProfileCapabilityAnalyticsQuerySchema,
  ProfileCapabilityAnalyticsSchema,
  ProfileCapabilityManifestSchema,
  ProfileCapabilityTimeseriesQuerySchema,
  ProfileCapabilityTimeseriesSchema,
  ProfileCapabilityUsageSummaryQuerySchema,
  ProfileCapabilityUsageSummaryResponseSchema,
  ProfileCapabilityUsagesQuerySchema,
  ProfileCapabilityUsagesResponseSchema,
  ProfileDemandDetailSchema,
  ProfileDemandListSchema,
  ProfileDemandQuerySchema,
  ProfileErrorDetailSchema,
  ProfileErrorListQuerySchema,
  ProfileErrorListResponseSchema,
  ProfileErrorOverviewQuerySchema,
  ProfileErrorOverviewResponseSchema,
  ProfileExecutionSnapshotSchema,
  ProfileKnowledgeContentSchema,
  ProfileKnowledgeOverviewResponseSchema,
  ProfileKnowledgeDeliveryUnitRankingQuerySchema,
  ProfileKnowledgeDeliveryUnitRankingResponseSchema,
  ProfileKnowledgeDocDetailResponseSchema,
  ProfileKnowledgePathDimensionDocsResponseSchema,
  ProfileKnowledgeListQuerySchema,
  ProfileKnowledgeAccessListResponseSchema,
  ProfileKnowledgeTimelineQuerySchema,
  ProfileKnowledgeTimelineResponseSchema,
  ProfileOverviewQuerySchema,
  ProfileOverviewSchema,
  ProfileInspectorResponseSchema,
  ProfileSummaryListSchema,
  ProfileUserActivityQuerySchema,
  ProfileUserActivityResponseSchema,
  ProfileUserDetailSchema,
  ProfileUsersQuerySchema,
  ProfileUsersResponseSchema,
  type ProfileArtifactTimelineItem,
  type ProfileCapabilityAnalytics,
  type ProfileCapabilityManifest,
  type ProfileCapabilityTimeseries,
  type ProfileDemand,
  type ProfileDemandDetail,
  type ProfileErrorDetail,
  type ProfileErrorOverviewResponse,
  type ProfileExecutionSnapshot,
  type ProfileKnowledgeContent,
  type ProfileKnowledgeDocDetailResponse,
  type ProfileKnowledgePathDimensionDocsResponse,
  type ProfileInspectorResponse,
  type ProfileOverview,
  type ProfileSummary,
  type ProfileUserActivityItem,
  type ProfileUserDetail,
} from '@sdd-telemetry/api';
import { ok } from '../../common/response/api-response';
import { parseWithSchema } from '../../common/validation/parse-with-schema';
import { ProfilesService } from './profiles.service';

@Controller('/api/profiles')
export class ProfilesController {
  @Inject()
  ctx!: Context;

  @Inject('profilesService')
  profilesService!: ProfilesService;

  @Get('/')
  async list() {
    const data: ProfileSummary[] = await this.profilesService.listProfiles();
    return ok(parseWithSchema(ProfileSummaryListSchema, data));
  }

  @Get('/:profileId/manifest')
  async manifest() {
    const profileId = this.ctx.params.profileId as string;
    const data: ProfileCapabilityManifest = await this.profilesService.getManifest(profileId);
    return ok(parseWithSchema(ProfileCapabilityManifestSchema, data));
  }

  @Get('/:profileId/inspector')
  async inspector() {
    const profileId = this.ctx.params.profileId as string;
    const data: ProfileInspectorResponse = await this.profilesService.getInspector(profileId);
    return ok(parseWithSchema(ProfileInspectorResponseSchema, data));
  }

  @Get('/:profileId/overview')
  async overview() {
    const profileId = this.ctx.params.profileId as string;
    const query = parseWithSchema(ProfileOverviewQuerySchema, this.ctx.query);
    const data: ProfileOverview = await this.profilesService.getOverview(profileId, query);
    return ok(parseWithSchema(ProfileOverviewSchema, data));
  }

  @Get('/:profileId/demands')
  async demands() {
    const profileId = this.ctx.params.profileId as string;
    const query = parseWithSchema(ProfileDemandQuerySchema, this.ctx.query);
    const data: ProfileDemand[] = await this.profilesService.listDemands(profileId, query);
    return ok(parseWithSchema(ProfileDemandListSchema, data));
  }

  @Get('/:profileId/errors/overview')
  async errorOverview() {
    const profileId = this.ctx.params.profileId as string;
    const query = parseWithSchema(ProfileErrorOverviewQuerySchema, this.ctx.query);
    const data: ProfileErrorOverviewResponse = await this.profilesService.getErrorOverview(
      profileId,
      query,
    );
    return ok(parseWithSchema(ProfileErrorOverviewResponseSchema, data));
  }

  @Get('/:profileId/errors')
  async errors() {
    const profileId = this.ctx.params.profileId as string;
    const query = parseWithSchema(ProfileErrorListQuerySchema, this.ctx.query);
    const { items, total, page, pageSize } = await this.profilesService.listErrors(
      profileId,
      query,
    );
    return ok(
      parseWithSchema(ProfileErrorListResponseSchema, {
        items,
        total,
        page,
        pageSize,
      }),
    );
  }

  @Get('/:profileId/errors/:errorEventId')
  async errorDetail() {
    const profileId = this.ctx.params.profileId as string;
    const errorEventId = this.ctx.params.errorEventId as string;
    const data: ProfileErrorDetail = await this.profilesService.getErrorDetail(
      profileId,
      errorEventId,
    );
    return ok(parseWithSchema(ProfileErrorDetailSchema, data));
  }

  @Get('/:profileId/demands/:demandId')
  async demandDetail() {
    const profileId = this.ctx.params.profileId as string;
    const demandId = this.ctx.params.demandId as string;
    const data: ProfileDemandDetail = await this.profilesService.getDemandDetail(
      profileId,
      demandId,
    );
    return ok(parseWithSchema(ProfileDemandDetailSchema, data));
  }

  @Get('/:profileId/demands/:demandId/artifacts/:artifactId/timeline')
  async artifactTimeline() {
    const profileId = this.ctx.params.profileId as string;
    const demandId = this.ctx.params.demandId as string;
    const artifactId = this.ctx.params.artifactId as string;
    const items: ProfileArtifactTimelineItem[] = await this.profilesService.getArtifactTimeline(
      profileId,
      demandId,
      artifactId,
    );
    return ok(parseWithSchema(ProfileArtifactTimelineResponseSchema, { items }));
  }

  @Get('/:profileId/capabilities/analytics')
  async capabilityAnalytics() {
    const profileId = this.ctx.params.profileId as string;
    const query = parseWithSchema(ProfileCapabilityAnalyticsQuerySchema, this.ctx.query);
    const data: ProfileCapabilityAnalytics = await this.profilesService.getCapabilityAnalytics(
      profileId,
      query,
    );
    return ok(parseWithSchema(ProfileCapabilityAnalyticsSchema, data));
  }

  @Get('/:profileId/capabilities/timeseries')
  async capabilityTimeseries() {
    const profileId = this.ctx.params.profileId as string;
    const query = parseWithSchema(ProfileCapabilityTimeseriesQuerySchema, this.ctx.query);
    const data: ProfileCapabilityTimeseries = await this.profilesService.getCapabilityTimeseries(
      profileId,
      query,
    );
    return ok(parseWithSchema(ProfileCapabilityTimeseriesSchema, data));
  }

  @Get('/:profileId/capabilities/usages/summary')
  async capabilityUsageSummary() {
    const profileId = this.ctx.params.profileId as string;
    const query = parseWithSchema(ProfileCapabilityUsageSummaryQuerySchema, this.ctx.query);
    const data = await this.profilesService.listCapabilityUsageSummary(profileId, query);
    return ok(parseWithSchema(ProfileCapabilityUsageSummaryResponseSchema, data));
  }

  @Get('/:profileId/capabilities/usages')
  async capabilityUsages() {
    const profileId = this.ctx.params.profileId as string;
    const query = parseWithSchema(ProfileCapabilityUsagesQuerySchema, this.ctx.query);
    const data = await this.profilesService.listCapabilityUsages(profileId, query);
    return ok(parseWithSchema(ProfileCapabilityUsagesResponseSchema, data));
  }

  @Get('/:profileId/users')
  async users() {
    const profileId = this.ctx.params.profileId as string;
    const query = parseWithSchema(ProfileUsersQuerySchema, this.ctx.query);
    const { items, total, page, pageSize } = await this.profilesService.listUsers(profileId, query);
    return ok(
      parseWithSchema(ProfileUsersResponseSchema, {
        items,
        total,
        page,
        pageSize,
      }),
    );
  }

  @Get('/:profileId/users/:userId')
  async userDetail() {
    const profileId = this.ctx.params.profileId as string;
    const userId = this.ctx.params.userId as string;
    const data: ProfileUserDetail = await this.profilesService.getUserDetail(profileId, userId);
    return ok(parseWithSchema(ProfileUserDetailSchema, data));
  }

  @Get('/:profileId/users/:userId/activity')
  async userActivity() {
    const profileId = this.ctx.params.profileId as string;
    const userId = this.ctx.params.userId as string;
    const query = parseWithSchema(ProfileUserActivityQuerySchema, this.ctx.query);
    const data: { items: ProfileUserActivityItem[] } = await this.profilesService.listUserActivity(
      profileId,
      userId,
      query,
    );
    return ok(parseWithSchema(ProfileUserActivityResponseSchema, data));
  }

  @Get('/:profileId/interactions/:interactionId/snapshot')
  async executionSnapshot() {
    const profileId = this.ctx.params.profileId as string;
    const interactionId = this.ctx.params.interactionId as string;
    const data: ProfileExecutionSnapshot = await this.profilesService.getExecutionSnapshot(
      profileId,
      interactionId,
    );
    return ok(parseWithSchema(ProfileExecutionSnapshotSchema, data));
  }

  @Get('/:profileId/knowledge/overview')
  async knowledgeOverview() {
    const profileId = this.ctx.params.profileId as string;
    const data = await this.profilesService.getKnowledgeOverview(profileId);
    return ok(parseWithSchema(ProfileKnowledgeOverviewResponseSchema, data));
  }

  @Get('/:profileId/knowledge/timeline')
  async knowledgeTimeline() {
    const profileId = this.ctx.params.profileId as string;
    const query = parseWithSchema(ProfileKnowledgeTimelineQuerySchema, this.ctx.query);
    const data = await this.profilesService.getKnowledgeTimeline(profileId, query);
    return ok(parseWithSchema(ProfileKnowledgeTimelineResponseSchema, data));
  }

  @Get('/:profileId/knowledge/accesses')
  async knowledgeAccesses() {
    const profileId = this.ctx.params.profileId as string;
    const query = parseWithSchema(ProfileKnowledgeListQuerySchema, this.ctx.query);
    const data = await this.profilesService.listKnowledgeAccesses(profileId, {
      range: query.range,
      page: query.page,
      pageSize: query.pageSize,
      ...(query.deliveryUnitId ? { deliveryUnitId: query.deliveryUnitId } : {}),
      ...(query.userId ? { userId: query.userId } : {}),
      ...(query.capabilityUsageId ? { capabilityUsageId: query.capabilityUsageId } : {}),
    });
    return ok(parseWithSchema(ProfileKnowledgeAccessListResponseSchema, data));
  }

  @Get('/:profileId/knowledge/delivery-units')
  async knowledgeDeliveryUnits() {
    const profileId = this.ctx.params.profileId as string;
    const query = parseWithSchema(ProfileKnowledgeDeliveryUnitRankingQuerySchema, this.ctx.query);
    const data = await this.profilesService.getKnowledgeDeliveryUnitRanking(profileId, query);
    return ok(parseWithSchema(ProfileKnowledgeDeliveryUnitRankingResponseSchema, data));
  }

  @Get('/:profileId/knowledge/docs')
  async knowledgePathDimensionDocs() {
    const profileId = this.ctx.params.profileId as string;
    const sourceNamespace =
      firstQueryValue(this.ctx.query.sourceNamespace) ?? firstQueryValue(this.ctx.query.repo) ?? '';
    const pathSegment = firstQueryValue(this.ctx.query.pathSegment) ?? '';
    const data: ProfileKnowledgePathDimensionDocsResponse =
      await this.profilesService.getKnowledgePathDimensionDocs(
        profileId,
        sourceNamespace,
        pathSegment,
      );
    return ok(parseWithSchema(ProfileKnowledgePathDimensionDocsResponseSchema, data));
  }

  @Get('/:profileId/knowledge/doc-detail')
  async knowledgeDocDetail() {
    const profileId = this.ctx.params.profileId as string;
    const sourceNamespace =
      firstQueryValue(this.ctx.query.sourceNamespace) ?? firstQueryValue(this.ctx.query.repo) ?? '';
    const relativePath = firstQueryValue(this.ctx.query.relativePath) ?? '';
    const data: ProfileKnowledgeDocDetailResponse =
      await this.profilesService.getKnowledgeDocDetail(profileId, sourceNamespace, relativePath);
    return ok(parseWithSchema(ProfileKnowledgeDocDetailResponseSchema, data));
  }

  @Get('/:profileId/knowledge/content/by-path')
  async knowledgeContentByPath() {
    const profileId = this.ctx.params.profileId as string;
    const sourceNamespace =
      firstQueryValue(this.ctx.query.sourceNamespace) ?? firstQueryValue(this.ctx.query.repo) ?? '';
    const relativePath = firstQueryValue(this.ctx.query.relativePath) ?? '';
    const data: ProfileKnowledgeContent = await this.profilesService.getKnowledgeContentByPath(
      profileId,
      sourceNamespace,
      relativePath,
    );
    return ok(parseWithSchema(ProfileKnowledgeContentSchema, data));
  }

  @Get('/:profileId/knowledge/content/:toolCallId')
  async knowledgeContent() {
    const profileId = this.ctx.params.profileId as string;
    const toolCallId = this.ctx.params.toolCallId as string;
    const data: ProfileKnowledgeContent = await this.profilesService.getKnowledgeContent(
      profileId,
      toolCallId,
    );
    return ok(parseWithSchema(ProfileKnowledgeContentSchema, data));
  }
}

function firstQueryValue(value: unknown): string | undefined {
  if (Array.isArray(value)) return firstQueryValue(value[0]);
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}
