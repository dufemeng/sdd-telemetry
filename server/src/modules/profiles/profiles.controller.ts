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
  ProfileOverviewQuerySchema,
  ProfileOverviewSchema,
  ProfileSummaryListSchema,
  type ProfileArtifactTimelineItem,
  type ProfileCapabilityAnalytics,
  type ProfileCapabilityManifest,
  type ProfileCapabilityTimeseries,
  type ProfileDemand,
  type ProfileDemandDetail,
  type ProfileOverview,
  type ProfileSummary,
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
    const data: ProfileSummary[] = this.profilesService.listProfiles();
    return ok(parseWithSchema(ProfileSummaryListSchema, data));
  }

  @Get('/:profileId/manifest')
  async manifest() {
    const profileId = this.ctx.params.profileId as string;
    const data: ProfileCapabilityManifest = this.profilesService.getManifest(profileId);
    return ok(parseWithSchema(ProfileCapabilityManifestSchema, data));
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

  @Get('/:profileId/demands/:demandId')
  async demandDetail() {
    const profileId = this.ctx.params.profileId as string;
    const demandId = this.ctx.params.demandId as string;
    const data: ProfileDemandDetail = await this.profilesService.getDemandDetail(profileId, demandId);
    return ok(parseWithSchema(ProfileDemandDetailSchema, data));
  }

  @Get('/:profileId/demands/:demandId/artifacts/:artifactId/timeline')
  async artifactTimeline() {
    const profileId = this.ctx.params.profileId as string;
    const demandId = this.ctx.params.demandId as string;
    const artifactId = this.ctx.params.artifactId as string;
    const items: ProfileArtifactTimelineItem[] = await this.profilesService.getArtifactTimeline(
      profileId, demandId, artifactId,
    );
    return ok(parseWithSchema(ProfileArtifactTimelineResponseSchema, { items }));
  }

  @Get('/:profileId/capabilities/analytics')
  async capabilityAnalytics() {
    const profileId = this.ctx.params.profileId as string;
    const query = parseWithSchema(ProfileCapabilityAnalyticsQuerySchema, this.ctx.query);
    const data: ProfileCapabilityAnalytics = await this.profilesService.getCapabilityAnalytics(profileId, query);
    return ok(parseWithSchema(ProfileCapabilityAnalyticsSchema, data));
  }

  @Get('/:profileId/capabilities/timeseries')
  async capabilityTimeseries() {
    const profileId = this.ctx.params.profileId as string;
    const query = parseWithSchema(ProfileCapabilityTimeseriesQuerySchema, this.ctx.query);
    const data: ProfileCapabilityTimeseries = await this.profilesService.getCapabilityTimeseries(profileId, query);
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
}
