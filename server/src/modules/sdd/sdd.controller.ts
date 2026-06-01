import { Controller, Del, Get, Inject, Post, Put } from '@midwayjs/core';
import type { Context } from '@midwayjs/koa';
import {
  CreateSddSemanticRequestSchema,
  UpdateSddSemanticRequestSchema,
  ReportUserSettingsRequestSchema,
  SddArtifactWriteListResponseSchema,
  SddErrorItemSchema,
  SddFunnelQuerySchema,
  SddFunnelSchema,
  SddInteractionDetailSchema,
  SddInteractionItemSchema,
  SddInteractionToolCallListResponseSchema,
  SddWikiRecallContentSchema,
  SddListQuerySchema,
  SddWorkItemListQuerySchema,
  SddOverviewQuerySchema,
  SddOverviewSchema,
  SddSemanticSchema,
  SddSkillAnalyticsQuerySchema,
  SddSkillAnalyticsSchema,
  SddSkillTimeseriesQuerySchema,
  SddSkillTimeseriesSchema,
  SddUsageSummaryQuerySchema,
  SddUsageSummaryResponseSchema,
  SddUsageItemSchema,
  SddUserItemSchema,
  SddVersionItemSchema,
  SddWorkItemDetailSchema,
  SddWorkItemSchema,
  WikiRecallHeatmapResponseSchema,
  WikiRecallListResponseSchema,
  WikiRecallRangeSchema,
  WikiRecallTimelineResponseSchema,
  WikiRecallUserRankingResponseSchema,
  WikiRecallWorkItemRankingResponseSchema,
  type SddArtifactWriteListResponse,
  type SddErrorItem,
  type SddFunnel,
  type SddInteractionDetail,
  type SddInteractionItem,
  type SddInteractionToolCallListResponse,
  type SddWikiRecallContent,
  type SddOverview,
  type SddSemantic,
  type SddSkillAnalytics,
  type SddSkillTimeseries,
  type SddUsageSummaryResponse,
  type SddUsageItem,
  type SddUserItem,
  type SddVersionItem,
  type SddWorkItem,
  type SddWorkItemDetail,
  type WikiRecallHeatmapResponse,
  type WikiRecallListResponse,
  type WikiRecallRange,
  type WikiRecallTimelineResponse,
  type WikiRecallUserRankingResponse,
  type WikiRecallWorkItemRankingResponse,
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

  @Get('/skill-analytics')
  async skillAnalytics() {
    const query = parseWithSchema(SddSkillAnalyticsQuerySchema, this.ctx.query);
    const data: SddSkillAnalytics = await this.sddQueryService.getSkillAnalytics(query);
    return ok(parseWithSchema(SddSkillAnalyticsSchema, data));
  }

  @Get('/skill-timeseries')
  async skillTimeseries() {
    const query = parseWithSchema(SddSkillTimeseriesQuerySchema, this.ctx.query);
    const data: SddSkillTimeseries = await this.sddQueryService.getSkillTimeseries(query);
    return ok(parseWithSchema(SddSkillTimeseriesSchema, data));
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

  @Get('/wiki-recalls/users')
  async wikiRecallUserRanking() {
    const range = this.parseWikiRecallRange();
    const sortBy = parseWikiRecallUserSortBy(firstQueryValue(this.ctx.query.sortBy));
    const data: WikiRecallUserRankingResponse =
      await this.sddQueryService.getWikiRecallUserRanking(
        range,
        sortBy,
        parsePage(firstQueryValue(this.ctx.query.page), 1, 10_000),
        parsePage(firstQueryValue(this.ctx.query.pageSize), 50, 200),
      );
    return ok(parseWithSchema(WikiRecallUserRankingResponseSchema, data));
  }

  @Get('/wiki-recalls/work-items')
  async wikiRecallWorkItemRanking() {
    const data: WikiRecallWorkItemRankingResponse =
      await this.sddQueryService.getWikiRecallWorkItemRanking(
        this.parseWikiRecallRange(),
        firstQueryValue(this.ctx.query.businessDomain) ?? null,
        firstQueryValue(this.ctx.query.userId) ?? null,
        parsePage(firstQueryValue(this.ctx.query.page), 1, 10_000),
        parsePage(firstQueryValue(this.ctx.query.pageSize), 50, 200),
      );
    return ok(parseWithSchema(WikiRecallWorkItemRankingResponseSchema, data));
  }

  @Get('/wiki-recalls/heatmap')
  async wikiRecallHeatmap() {
    const data: WikiRecallHeatmapResponse = await this.sddQueryService.getWikiRecallHeatmap(
      this.parseWikiRecallRange(),
      parseWikiRecallHeatmapGroupBy(firstQueryValue(this.ctx.query.groupBy)),
    );
    return ok(parseWithSchema(WikiRecallHeatmapResponseSchema, data));
  }

  @Get('/wiki-recalls/timeline')
  async wikiRecallTimeline() {
    const data: WikiRecallTimelineResponse = await this.sddQueryService.getWikiRecallTimeline(
      this.parseWikiRecallRange(),
      firstQueryValue(this.ctx.query.granularity) === 'hour' ? 'hour' : 'day',
      firstQueryValue(this.ctx.query.groupBy) === 'axis' ? 'axis' : 'domain',
    );
    return ok(parseWithSchema(WikiRecallTimelineResponseSchema, data));
  }

  @Get('/wiki-recalls/list')
  async listWikiRecalls() {
    const filters: { workItemId?: string; userId?: string; skillUsageId?: string } = {};
    const workItemId = firstQueryValue(this.ctx.query.workItemId);
    const userId = firstQueryValue(this.ctx.query.userId);
    const skillUsageId = firstQueryValue(this.ctx.query.skillUsageId);
    if (workItemId) filters.workItemId = workItemId;
    if (userId) filters.userId = userId;
    if (skillUsageId) filters.skillUsageId = skillUsageId;

    const data: WikiRecallListResponse = await this.sddQueryService.listWikiRecalls(
      this.parseWikiRecallRange(),
      filters,
      parsePage(firstQueryValue(this.ctx.query.page), 1, 10_000),
      parsePage(firstQueryValue(this.ctx.query.pageSize), 50, 500),
    );
    return ok(parseWithSchema(WikiRecallListResponseSchema, data));
  }

  @Get('/wiki-recalls/content/:toolCallId')
  async wikiRecallContent() {
    const toolCallId = this.ctx.params.toolCallId as string;
    const data: SddWikiRecallContent =
      await this.sddQueryService.getWikiRecallContent(toolCallId);
    return ok(parseWithSchema(SddWikiRecallContentSchema, data));
  }

  @Get('/work-items')
  async workItems() {
    const query = parseWithSchema(SddWorkItemListQuerySchema, this.ctx.query);
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

  @Get('/work-items/:workItemId/artifacts/:artifactId/writes')
  async artifactWrites() {
    const workItemId = this.ctx.params.workItemId as string;
    const artifactId = this.ctx.params.artifactId as string;
    const data: SddArtifactWriteListResponse =
      await this.sddQueryService.listArtifactWrites(workItemId, artifactId);
    return ok(parseWithSchema(SddArtifactWriteListResponseSchema, data));
  }

  @Post('/user-settings')
  async reportUserSettings() {
    const input = parseWithSchema(ReportUserSettingsRequestSchema, this.ctx.request.body);
    const data: SddUserItem = await this.sddQueryService.reportUserSettings(input);
    return ok(parseWithSchema(SddUserItemSchema, data));
  }

  private parseWikiRecallRange(): WikiRecallRange {
    return parseWithSchema(
      WikiRecallRangeSchema,
      firstQueryValue(this.ctx.query.range) ?? '30d',
    );
  }
}

function firstQueryValue(value: unknown): string | undefined {
  if (Array.isArray(value)) {
    return firstQueryValue(value[0]);
  }
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function parsePage(value: string | undefined, fallback: number, max: number): number {
  const parsed = value ? Number(value) : fallback;
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(1, Math.floor(parsed)));
}

function parseWikiRecallUserSortBy(
  value: string | undefined,
): 'total' | 'distinct_files' | 'recent' {
  return value === 'distinct_files' || value === 'recent' ? value : 'total';
}

function parseWikiRecallHeatmapGroupBy(
  value: string | undefined,
): 'domain' | 'axis' | 'system' {
  if (value === 'axis' || value === 'system') return value;
  return 'domain';
}
