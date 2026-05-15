import { Controller, Get, Inject, Post } from '@midwayjs/core';
import type { Context } from '@midwayjs/koa';
import {
  CreateSddSemanticRequestSchema,
  ReportUserSettingsRequestSchema,
  SddErrorItemSchema,
  SddFunnelQuerySchema,
  SddFunnelSchema,
  SddInteractionItemSchema,
  SddListQuerySchema,
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
  type SddInteractionItem,
  type SddSemantic,
  type SddUsageSummaryResponse,
  type SddUsageItem,
  type SddUserItem,
  type SddVersionItem,
  type SddWorkItem,
  type SddWorkItemDetail,
} from '@sdd-monitor/api';
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
