import { Controller, Get, Inject, Post } from '@midwayjs/core';
import type { Context } from '@midwayjs/koa';
import {
  DailyReportDetailResponseSchema,
  DailyReportListQuerySchema,
  DailyReportListResponseSchema,
  type DailyReportDetailResponse,
  type DailyReportListResponse,
} from '@sdd-telemetry/api';
import { ok } from '../../common/response/api-response';
import { parseWithSchema } from '../../common/validation/parse-with-schema';
import { DailyReportService } from './daily-report.service';

@Controller('/api/reports/daily')
export class DailyReportController {
  @Inject()
  ctx!: Context;

  @Inject('dailyReportService')
  dailyReportService!: DailyReportService;

  @Get('/latest')
  async latest() {
    const data: DailyReportDetailResponse | null = await this.dailyReportService.getLatest();
    if (!data) {
      return ok(null);
    }
    return ok(parseWithSchema(DailyReportDetailResponseSchema, data));
  }

  @Get('/')
  async list() {
    const query = parseWithSchema(DailyReportListQuerySchema, this.ctx.query);
    const data: DailyReportListResponse = await this.dailyReportService.listReports(
      query.from,
      query.to,
      query.page,
      query.pageSize,
    );
    return ok(parseWithSchema(DailyReportListResponseSchema, data));
  }

  @Get('/:date')
  async getByDate() {
    const date = this.ctx.params.date as string;
    const data: DailyReportDetailResponse | null = await this.dailyReportService.getByDate(date);
    if (!data) {
      return ok(null);
    }
    return ok(parseWithSchema(DailyReportDetailResponseSchema, data));
  }

  @Post('/:date/regenerate')
  async regenerate() {
    const date = this.ctx.params.date as string;
    await this.dailyReportService.generateDailyReport(date, 'regenerate');
    const data: DailyReportDetailResponse | null = await this.dailyReportService.getByDate(date);
    return ok(data ? parseWithSchema(DailyReportDetailResponseSchema, data) : null);
  }

  @Get('/:date/export')
  async exportMarkdown() {
    const date = this.ctx.params.date as string;
    const format = firstQueryValue(this.ctx.query.format) ?? 'markdown';
    const data = await this.dailyReportService.getByDate(date);
    if (!data) {
      this.ctx.status = 404;
      this.ctx.body = { success: false, error: { code: 'NOT_FOUND', message: 'Report not found' } };
      return;
    }
    if (format === 'markdown') {
      this.ctx.set('Content-Type', 'text/markdown; charset=utf-8');
      this.ctx.set('Content-Disposition', `inline; filename="sdd-daily-report-${date}.md"`);
      this.ctx.body = data.markdownText;
      return;
    }
    return ok(data);
  }
}

function firstQueryValue(value: unknown): string | undefined {
  if (Array.isArray(value)) return firstQueryValue(value[0]);
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}
