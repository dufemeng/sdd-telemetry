import { Body, Controller, Get, Headers, Inject, Param, Post, Query } from '@midwayjs/core';
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
  @Inject('ingestHealthService')
  ingestHealthService!: IngestHealthService;

  @Inject('ingestReceiveService')
  ingestReceiveService!: IngestReceiveService;

  @Post('/otlp-logs')
  async receiveLogs(@Body() rawBody: unknown, @Headers('content-type') contentType?: string) {
    const payload = parseWithSchema(OtlpLogsPayloadSchema, rawBody);
    const data: IngestLogsResponse = await this.ingestReceiveService.receiveLogs({
      payload,
      contentType: contentType ?? null,
    });
    return ok(parseWithSchema(IngestLogsResponseSchema, data));
  }

  @Get('/health')
  async health(@Query('windowHours') rawWindowHours?: string) {
    const query = parseWithSchema(IngestHealthQuerySchema, {
      windowHours: rawWindowHours,
    });
    const data: IngestHealth = await this.ingestHealthService.getHealth(query.windowHours);
    return ok(parseWithSchema(IngestHealthSchema, data));
  }

  @Get('/batches')
  async batches(@Query() rawQuery: unknown) {
    const query = parseWithSchema(BatchListQuerySchema, rawQuery);
    const data: BatchListResponse = await this.ingestHealthService.listBatches(query);
    return ok(parseWithSchema(BatchListResponseSchema, data));
  }

  @Get('/batches/:batchId')
  async batchDetail(@Param('batchId') batchId: string) {
    const data: BatchDetail | null = await this.ingestHealthService.getBatchDetail(batchId);
    if (!data) {
      throw new Error(`batch not found: ${batchId}`);
    }

    return ok(parseWithSchema(BatchDetailSchema, data));
  }
}
