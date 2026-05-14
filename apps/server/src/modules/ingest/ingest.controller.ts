import { Controller, Get, Inject, Query } from '@midwayjs/core';
import { IngestHealthQuerySchema, type IngestHealth } from '@sdd-monitor/api';
import { ok } from '../../common/response/api-response';
import { parseWithSchema } from '../../common/validation/parse-with-schema';
import { IngestHealthService } from './ingest-health.service';

@Controller('/api/ingest')
export class IngestController {
  @Inject('ingestHealthService')
  ingestHealthService!: IngestHealthService;

  @Get('/health')
  async health(@Query('windowHours') rawWindowHours?: string) {
    const query = parseWithSchema(IngestHealthQuerySchema, {
      windowHours: rawWindowHours,
    });
    const data: IngestHealth = await this.ingestHealthService.getHealth(query.windowHours);
    return ok(data);
  }
}
