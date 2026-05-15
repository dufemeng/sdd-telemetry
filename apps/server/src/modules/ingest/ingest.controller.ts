import { Body, Controller, Get, Headers, Inject, Post, Query } from '@midwayjs/core';
import {
  IngestHealthQuerySchema,
  OtlpLogsPayloadSchema,
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
    return ok(data);
  }

  @Get('/health')
  async health(@Query('windowHours') rawWindowHours?: string) {
    const query = parseWithSchema(IngestHealthQuerySchema, {
      windowHours: rawWindowHours,
    });
    const data: IngestHealth = await this.ingestHealthService.getHealth(query.windowHours);
    return ok(data);
  }
}
