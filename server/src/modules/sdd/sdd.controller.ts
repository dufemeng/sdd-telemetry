import { Controller, Del, Get, Inject, Post, Put } from '@midwayjs/core';
import type { Context } from '@midwayjs/koa';
import {
  CreateSddSemanticRequestSchema,
  UpdateSddSemanticRequestSchema,
  ReportUserSettingsRequestSchema,
  SddErrorItemSchema,
  SddFunnelQuerySchema,
  SddFunnelSchema,
  SddInteractionDetailSchema,
  SddInteractionItemSchema,
  SddInteractionToolCallListResponseSchema,
  SddListQuerySchema,
  SddOverviewQuerySchema,
  SddOverviewSchema,
  SddSemanticSchema,
  SddUsageSummaryQuerySchema,
  SddUsageSummaryResponseSchema,
  SddUsageItemSchema,
  SddUserItemSchema,
  SddVersionItemSchema,
  SddWorkItemDetailSchema,
  SddWorkItemSchema,
  type SddErrorItem,
  type SddFunnel,
  type SddInteractionDetail,
  type SddInteractionItem,
  type SddInteractionToolCallListResponse,
  type SddOverview,
  type SddSemantic,
  type SddUsageSummaryResponse,
  type SddUsageItem,
  type SddUserItem,
  type SddVersionItem,
  type SddWorkItem,
  type SddWorkItemDetail,
} from '@sdd-telemetry/api';
import { ok } from '../../common/response/api-response';
import { parseWithSchema } from '../../common/validation/parse-with-schema';
import { SddQueryService } from './sdd-query.service';

@Controller('/api/sdd')
export class SddController {
  @Inject()
  ctx!: Context;

  @Inject('sddQueryService')
  sddQueryService!: SddQueryService;

  @Get('/semantics')
  async semantics() {
    const data: SddSemantic[] = await this.sddQueryService.listSemantics();
    return ok(parseWithSchema(SddSemanticSchema.array(), data));
  }

  @Post('/semantics')
  async createSemantic() {
    const input = parseWithSchema(CreateSddSemanticRequestSchema, this.ctx.request.body);
    const data: SddSemantic = await this.sddQueryService.createSemantic(input);
    return ok(parseWithSchema(SddSemanticSchema, data));
  }

  @Put('/semantics/:id')
  async updateSemantic() {
    const id = this.ctx.params.id as string;
    const input = parseWithSchema(UpdateSddSemanticRequestSchema, this.ctx.request.body);
    const data: SddSemantic = await this.sddQueryService.updateSemantic(id, input);
    return ok(parseWithSchema(SddSemanticSchema, data));
  }

  @Del('/semantics/:id')
  async deleteSemantic() {
    const id = this.ctx.params.id as string;
    await this.sddQueryService.deleteSemantic(id);
    return ok({ deleted: true });
  }

  @Get('/overview')
  async overview() {
    const query = parseWithSchema(SddOverviewQuerySchema, this.ctx.query);
    const data: SddOverview = await this.sddQueryService.getOverview(query);
    return ok(parseWithSchema(SddOverviewSchema, data));
  }

  @Get('/funnel')
  async funnel() {
    const query = parseWithSchema(SddFunnelQuerySchema, this.ctx.query);
    const data: SddFunnel = await this.sddQueryService.getFunnel(query);
    return ok(parseWithSchema(SddFunnelSchema, data));
  }

  @Get('/usage-summary')
  async usageSummary() {
    const query = parseWithSchema(SddUsageSummaryQuerySchema, this.ctx.query);
    const data: SddUsageSummaryResponse = await this.sddQueryService.getUsageSummary(query);
    return ok(parseWithSchema(SddUsageSummaryResponseSchema, data));
  }

  @Get('/usages')
  async usages() {
    const query = parseWithSchema(SddListQuerySchema, this.ctx.query);
    const data: SddUsageItem[] = await this.sddQueryService.listUsages(query);
    return ok(parseWithSchema(SddUsageItemSchema.array(), data));
  }

  @Get('/interactions')
  async interactions() {
    const query = parseWithSchema(SddListQuerySchema, this.ctx.query);
    const data: SddInteractionItem[] = await this.sddQueryService.listInteractions(query);
    return ok(parseWithSchema(SddInteractionItemSchema.array(), data));
  }

  @Get('/interactions/:interactionId')
  async interactionDetail() {
    const interactionId = this.ctx.params.interactionId as string;
    const data: SddInteractionDetail | null =
      await this.sddQueryService.getInteractionDetail(interactionId);
    if (!data) {
      throw new Error(`interaction not found: ${interactionId}`);
    }

    return ok(parseWithSchema(SddInteractionDetailSchema, data));
  }

  @Get('/interactions/:interactionId/tool-calls')
  async interactionToolCalls() {
    const interactionId = this.ctx.params.interactionId as string;
    const data: SddInteractionToolCallListResponse =
      await this.sddQueryService.listInteractionToolCalls(interactionId);
    return ok(parseWithSchema(SddInteractionToolCallListResponseSchema, data));
  }

  @Get('/errors')
  async errors() {
    const query = parseWithSchema(SddListQuerySchema, this.ctx.query);
    const data: SddErrorItem[] = await this.sddQueryService.listErrors(query);
    return ok(parseWithSchema(SddErrorItemSchema.array(), data));
  }

  @Get('/users')
  async users() {
    const data: SddUserItem[] = await this.sddQueryService.listUsers();
    return ok(parseWithSchema(SddUserItemSchema.array(), data));
  }

  @Get('/versions')
  async versions() {
    const data: SddVersionItem[] = await this.sddQueryService.listVersions();
    return ok(parseWithSchema(SddVersionItemSchema.array(), data));
  }

  @Get('/work-items')
  async workItems() {
    const query = parseWithSchema(SddListQuerySchema, this.ctx.query);
    const data: SddWorkItem[] = await this.sddQueryService.listWorkItems(query);
    return ok(parseWithSchema(SddWorkItemSchema.array(), data));
  }

  @Get('/work-items/:workItemId')
  async workItemDetail() {
    const workItemId = this.ctx.params.workItemId as string;
    const data: SddWorkItemDetail | null = await this.sddQueryService.getWorkItemDetail(workItemId);
    if (!data) {
      throw new Error(`work item not found: ${workItemId}`);
    }

    return ok(parseWithSchema(SddWorkItemDetailSchema, data));
  }

  @Post('/user-settings')
  async reportUserSettings() {
    const input = parseWithSchema(ReportUserSettingsRequestSchema, this.ctx.request.body);
    const data: SddUserItem = await this.sddQueryService.reportUserSettings(input);
    return ok(parseWithSchema(SddUserItemSchema, data));
  }
}
