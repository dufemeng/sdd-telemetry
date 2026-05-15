import { Body, Controller, Get, Inject, Param, Post, Query } from '@midwayjs/core';
import {
  CreateSddSemanticRequestSchema,
  ReportUserSettingsRequestSchema,
  SddErrorItemSchema,
  SddFunnelQuerySchema,
  SddFunnelSchema,
  SddInteractionItemSchema,
  SddListQuerySchema,
  SddSemanticSchema,
  SddUsageItemSchema,
  SddUserItemSchema,
  SddVersionItemSchema,
  SddWorkItemDetailSchema,
  SddWorkItemSchema,
  type SddErrorItem,
  type SddFunnel,
  type SddInteractionItem,
  type SddSemantic,
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
  @Inject('sddQueryService')
  sddQueryService!: SddQueryService;

  @Get('/semantics')
  async semantics() {
    const data: SddSemantic[] = await this.sddQueryService.listSemantics();
    return ok(parseWithSchema(SddSemanticSchema.array(), data));
  }

  @Post('/semantics')
  async createSemantic(@Body() rawBody: unknown) {
    const input = parseWithSchema(CreateSddSemanticRequestSchema, rawBody);
    const data: SddSemantic = await this.sddQueryService.createSemantic(input);
    return ok(parseWithSchema(SddSemanticSchema, data));
  }

  @Get('/funnel')
  async funnel(@Query() rawQuery: unknown) {
    const query = parseWithSchema(SddFunnelQuerySchema, rawQuery);
    const data: SddFunnel = await this.sddQueryService.getFunnel(query);
    return ok(parseWithSchema(SddFunnelSchema, data));
  }

  @Get('/usages')
  async usages(@Query() rawQuery: unknown) {
    const query = parseWithSchema(SddListQuerySchema, rawQuery);
    const data: SddUsageItem[] = await this.sddQueryService.listUsages(query);
    return ok(parseWithSchema(SddUsageItemSchema.array(), data));
  }

  @Get('/interactions')
  async interactions(@Query() rawQuery: unknown) {
    const query = parseWithSchema(SddListQuerySchema, rawQuery);
    const data: SddInteractionItem[] = await this.sddQueryService.listInteractions(query);
    return ok(parseWithSchema(SddInteractionItemSchema.array(), data));
  }

  @Get('/errors')
  async errors(@Query() rawQuery: unknown) {
    const query = parseWithSchema(SddListQuerySchema, rawQuery);
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
  async workItems(@Query() rawQuery: unknown) {
    const query = parseWithSchema(SddListQuerySchema, rawQuery);
    const data: SddWorkItem[] = await this.sddQueryService.listWorkItems(query);
    return ok(parseWithSchema(SddWorkItemSchema.array(), data));
  }

  @Get('/work-items/:workItemId')
  async workItemDetail(@Param('workItemId') workItemId: string) {
    const data: SddWorkItemDetail | null = await this.sddQueryService.getWorkItemDetail(workItemId);
    if (!data) {
      throw new Error(`work item not found: ${workItemId}`);
    }

    return ok(parseWithSchema(SddWorkItemDetailSchema, data));
  }

  @Post('/user-settings')
  async reportUserSettings(@Body() rawBody: unknown) {
    const input = parseWithSchema(ReportUserSettingsRequestSchema, rawBody);
    const data: SddUserItem = await this.sddQueryService.reportUserSettings(input);
    return ok(parseWithSchema(SddUserItemSchema, data));
  }
}
