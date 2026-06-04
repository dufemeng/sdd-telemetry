import { Controller, Get, Inject } from '@midwayjs/core';
import type { Context } from '@midwayjs/koa';
import {
  ProfileCapabilityManifestSchema,
  ProfileDemandListSchema,
  ProfileDemandQuerySchema,
  ProfileOverviewQuerySchema,
  ProfileOverviewSchema,
  ProfileSummaryListSchema,
  type ProfileCapabilityManifest,
  type ProfileDemand,
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
}
