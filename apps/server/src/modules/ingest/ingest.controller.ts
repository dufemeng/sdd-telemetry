import { Controller, Get, Inject, Post } from '@midwayjs/core';
import type { Context } from '@midwayjs/koa';
import {
  BatchDetailSchema,
  BatchListQuerySchema,
  BatchListResponseSchema,
  IngestHealthSchema,
  IngestHealthQuerySchema,
  IngestLogsResponseSchema,
  OtlpLogsPayloadSchema,
  type BatchDetail,
  type BatchListResponse,
  type IngestHealth,
  type IngestLogsResponse,
} from '@sdd-monitor/api';
import { ok } from '../../common/response/api-response';
import { parseWithSchema } from '../../common/validation/parse-with-schema';
import { IngestHealthService } from './ingest-health.service';
import { IngestReceiveService } from './ingest-receive.service';

@Controller('/api/ingest')
export class IngestController {
  @Inject()
  ctx!: Context;

  @Inject('ingestHealthService')
  ingestHealthService!: IngestHealthService;

  @Inject('ingestReceiveService')
  ingestReceiveService!: IngestReceiveService;

  @Post('/otlp-logs')
  async receiveLogs() {
    const payload = parseWithSchema(OtlpLogsPayloadSchema, this.ctx.request.body);
    const data: IngestLogsResponse = await this.ingestReceiveService.receiveLogs({
      payload,
      contentType: this.ctx.get('content-type') ?? null,
    });
    return ok(parseWithSchema(IngestLogsResponseSchema, data));
  }

  @Get('/health')
  async health() {
    const query = parseWithSchema(IngestHealthQuerySchema, this.ctx.query);
    const data: IngestHealth = await this.ingestHealthService.getHealth(query.windowHours);
    return ok(parseWithSchema(IngestHealthSchema, data));
  }

  @Get('/batches')
  async batches() {
    const query = parseWithSchema(BatchListQuerySchema, this.ctx.query);
    const data: BatchListResponse = await this.ingestHealthService.listBatches(query);
    return ok(parseWithSchema(BatchListResponseSchema, data));
  }

  @Get('/batches/:batchId')
  async batchDetail() {
    const batchId = this.ctx.params.batchId as string;
    const data: BatchDetail | null = await this.ingestHealthService.getBatchDetail(batchId);
    if (!data) {
      throw new Error(`batch not found: ${batchId}`);
    }

    return ok(parseWithSchema(BatchDetailSchema, data));
  }
}
