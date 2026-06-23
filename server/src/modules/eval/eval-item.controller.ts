import { Controller, Del, Get, Inject, Post, Put } from '@midwayjs/core';
import type { Context } from '@midwayjs/koa';
import {
  CreateEvalItemRequestSchema,
  EvalImportFromLogsRequestSchema,
  UpdateEvalItemRequestSchema,
} from '@sdd-telemetry/api';
import { getAuthUser } from '../../common/auth/auth.middleware';
import { ok } from '../../common/response/api-response';
import { parseWithSchema } from '../../common/validation/parse-with-schema';
import { EvalItemService } from './eval-item.service';

@Controller('/api/eval')
export class EvalItemController {
  @Inject()
  ctx!: Context;

  @Inject('evalItemService')
  evalItemService!: EvalItemService;

  @Get('/items')
  async list() {
    this.setNoStore();
    const profileId = requireProfileId(this.ctx.query.profileId);
    const page = toInt(this.ctx.query.page, 1, 1, Number.MAX_SAFE_INTEGER);
    const pageSize = toInt(this.ctx.query.pageSize, 20, 1, 100);
    const data = await this.evalItemService.list({
      profileId,
      ...(this.ctx.query.source ? { source: String(this.ctx.query.source) as 'cleaned' | 'manual' } : {}),
      ...(this.ctx.query.capabilityCode ? { capabilityCode: String(this.ctx.query.capabilityCode) } : {}),
      ...(this.ctx.query.targetSkill ? { targetSkill: String(this.ctx.query.targetSkill) } : {}),
      ...(this.ctx.query.enabled !== undefined ? { enabled: this.ctx.query.enabled === 'true' } : {}),
      ...(this.ctx.query.keyword ? { keyword: String(this.ctx.query.keyword).slice(0, 100) } : {}),
      page,
      pageSize,
    });
    return ok(data);
  }

  @Get('/items/:id')
  async detail() {
    this.setNoStore();
    const id = String(this.ctx.params.id);
    const profileId = requireProfileId(this.ctx.query.profileId);
    const data = await this.evalItemService.getDetail(id, profileId);
    return ok(data);
  }

  @Post('/items/import-from-logs')
  async importFromLogs() {
    this.setNoStore();
    const input = parseWithSchema(EvalImportFromLogsRequestSchema, this.ctx.request.body);
    const data = await this.evalItemService.importFromLogs({
      profileId: input.profileId,
      ...(input.capabilityCode !== undefined ? { capabilityCode: input.capabilityCode } : {}),
      ...(input.from !== undefined ? { from: input.from } : {}),
      ...(input.to !== undefined ? { to: input.to } : {}),
    });
    return ok(data);
  }

  @Post('/items')
  async create() {
    this.setNoStore();
    const input = parseWithSchema(CreateEvalItemRequestSchema, this.ctx.request.body);
    const data = await this.evalItemService.createManual({
      profileId: input.profileId,
      promptText: input.promptText,
      targetSkill: input.targetSkill,
      targetArtifactType: input.targetArtifactType,
      ...(input.title !== undefined ? { title: input.title } : {}),
      ...(input.notes !== undefined ? { notes: input.notes } : {}),
      actor: getAuthUser(this.ctx),
    });
    return ok(data);
  }

  @Put('/items/:id')
  async update() {
    this.setNoStore();
    const id = String(this.ctx.params.id);
    const input = parseWithSchema(UpdateEvalItemRequestSchema, this.ctx.request.body);
    await this.evalItemService.update(id, {
      profileId: input.profileId,
      ...(input.promptText !== undefined ? { promptText: input.promptText } : {}),
      ...(input.targetSkill !== undefined ? { targetSkill: input.targetSkill } : {}),
      ...(input.targetArtifactType !== undefined ? { targetArtifactType: input.targetArtifactType } : {}),
      ...(input.title !== undefined ? { title: input.title } : {}),
      ...(input.notes !== undefined ? { notes: input.notes } : {}),
      ...(input.enabled !== undefined ? { enabled: input.enabled } : {}),
      actor: getAuthUser(this.ctx),
    });
    return ok({ id });
  }

  @Del('/items/:id')
  async remove() {
    this.setNoStore();
    const id = String(this.ctx.params.id);
    const profileId = requireProfileId(this.ctx.query.profileId);
    await this.evalItemService.remove(id, { profileId, actor: getAuthUser(this.ctx) });
    return ok({ id });
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

function toInt(value: unknown, def: number, min: number, max: number): number {
  const n = Number(value ?? def);
  if (!Number.isFinite(n)) return def;
  return Math.min(max, Math.max(min, Math.trunc(n)));
}
