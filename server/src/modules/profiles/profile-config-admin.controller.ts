import { Controller, Get, Inject, Post, Put } from '@midwayjs/core';
import type { Context } from '@midwayjs/koa';
import {
  ProfileConfigAdminDetailSchema,
  ProfileConfigAdminListResponseSchema,
  ProfileConfigPreviewRequestSchema,
  ProfileConfigPreviewResponseSchema,
  PublishProfileConfigRequestSchema,
  SaveProfileConfigDraftRequestSchema,
  parseWorkflowProfileConfig,
} from '@sdd-telemetry/api';
import { getAuthUser } from '../../common/auth/auth.middleware';
import { ok } from '../../common/response/api-response';
import { parseWithSchema } from '../../common/validation/parse-with-schema';
import { ProfileConfigAdminService } from './profile-config-admin.service';

@Controller('/api/admin/profile-configs')
export class ProfileConfigAdminController {
  @Inject()
  ctx!: Context;

  @Inject('profileConfigAdminService')
  profileConfigAdminService!: ProfileConfigAdminService;

  @Get('/')
  async list() {
    const data = await this.profileConfigAdminService.list();
    return ok(parseWithSchema(ProfileConfigAdminListResponseSchema, data));
  }

  @Get('/:profileId')
  async detail() {
    const profileId = this.ctx.params.profileId as string;
    const data = await this.profileConfigAdminService.getDetail(profileId);
    return ok(parseWithSchema(ProfileConfigAdminDetailSchema, data));
  }

  @Post('/preview')
  async preview() {
    const input = parseWithSchema(ProfileConfigPreviewRequestSchema, this.ctx.request.body);
    const data = this.profileConfigAdminService.preview(parseWorkflowProfileConfig(input.config));
    return ok(parseWithSchema(ProfileConfigPreviewResponseSchema, data));
  }

  @Post('/')
  async createDraft() {
    const input = parseWithSchema(SaveProfileConfigDraftRequestSchema, this.ctx.request.body);
    const data = await this.profileConfigAdminService.createDraft({
      actor: getAuthUser(this.ctx),
      config: parseWorkflowProfileConfig(input.config),
      ...(input.notes !== undefined ? { notes: input.notes } : {}),
    });
    return ok(parseWithSchema(ProfileConfigAdminDetailSchema, data));
  }

  @Put('/:profileId/draft')
  async saveDraft() {
    const profileId = this.ctx.params.profileId as string;
    const input = parseWithSchema(SaveProfileConfigDraftRequestSchema, this.ctx.request.body);
    const data = await this.profileConfigAdminService.saveDraft(profileId, {
      actor: getAuthUser(this.ctx),
      config: parseWorkflowProfileConfig(input.config),
      ...(input.notes !== undefined ? { notes: input.notes } : {}),
    });
    return ok(parseWithSchema(ProfileConfigAdminDetailSchema, data));
  }

  @Post('/:profileId/publish')
  async publish() {
    const profileId = this.ctx.params.profileId as string;
    const input = parseWithSchema(PublishProfileConfigRequestSchema, this.ctx.request.body ?? {});
    const data = await this.profileConfigAdminService.publish(profileId, {
      actor: getAuthUser(this.ctx),
      ...(input.config ? { config: parseWorkflowProfileConfig(input.config) } : {}),
      ...(input.notes !== undefined ? { notes: input.notes } : {}),
      ...(input.force !== undefined ? { force: input.force } : {}),
    });
    return ok(parseWithSchema(ProfileConfigAdminDetailSchema, data));
  }

  @Post('/:profileId/disable')
  async disable() {
    const profileId = this.ctx.params.profileId as string;
    const data = await this.profileConfigAdminService.disable(profileId, getAuthUser(this.ctx));
    return ok(parseWithSchema(ProfileConfigAdminDetailSchema, data));
  }
}
