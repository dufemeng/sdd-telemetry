import { Controller, Get, Inject, Post } from '@midwayjs/core';
import type { Context } from '@midwayjs/koa';
import {
  EvalArtifactTypeSchema,
  SaveRubricDraftRequestSchema,
} from '@sdd-telemetry/api';
import { getAuthUser } from '../../common/auth/auth.middleware';
import { ok } from '../../common/response/api-response';
import { parseWithSchema } from '../../common/validation/parse-with-schema';
import { EvalRubricService } from './eval-rubric.service';

@Controller('/api/eval/rubrics')
export class EvalRubricController {
  @Inject()
  ctx!: Context;

  @Inject('evalRubricService')
  evalRubricService!: EvalRubricService;

  @Get('/')
  async overview() {
    this.setNoStore();
    const profileId = requireProfileId(this.ctx.query.profileId);
    const artifactType = parseWithSchema(EvalArtifactTypeSchema, this.ctx.query.artifactType);
    const data = await this.evalRubricService.getOverview(profileId, artifactType);
    return ok(data);
  }

  @Post('/')
  async saveDraft() {
    this.setNoStore();
    const input = parseWithSchema(SaveRubricDraftRequestSchema, this.ctx.request.body);
    const data = await this.evalRubricService.saveDraft({
      profileId: input.profileId,
      artifactType: input.artifactType,
      rubric: input.rubric,
      actor: getAuthUser(this.ctx),
    });
    return ok(data);
  }

  @Post('/:id/publish')
  async publish() {
    this.setNoStore();
    const id = String(this.ctx.params.id);
    const body = (this.ctx.request.body ?? {}) as { profileId?: unknown };
    const profileId = requireProfileId(body.profileId ?? this.ctx.query.profileId);
    const data = await this.evalRubricService.publish(id, { profileId, actor: getAuthUser(this.ctx) });
    return ok(data);
  }

  private setNoStore(): void {
    this.ctx.set('Cache-Control', 'no-store');
  }
}

function requireProfileId(value: unknown): string {
  const profileId = typeof value === 'string' ? value.trim() : '';
  if (!profileId) throw new Error('profileId is required');
  return profileId;
}
