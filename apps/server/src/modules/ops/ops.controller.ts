import { Controller, Get, Inject, Param, Query } from '@midwayjs/core';
import {
  OpsJobsResponseSchema,
  OpsQueueSchema,
  OpsTableRowsQuerySchema,
  OpsTableRowsResponseSchema,
  OpsTablesResponseSchema,
  PaginationQuerySchema,
  type OpsJobsResponse,
  type OpsQueue,
  type OpsTableRowsResponse,
  type OpsTablesResponse,
} from '@sdd-monitor/api';
import { ok } from '../../common/response/api-response';
import { parseWithSchema } from '../../common/validation/parse-with-schema';
import { OpsQueryService } from './ops-query.service';

@Controller('/api/ops')
export class OpsController {
  @Inject('opsQueryService')
  opsQueryService!: OpsQueryService;

  @Get('/tables')
  async tables() {
    const data: OpsTablesResponse = await this.opsQueryService.listTables();
    return ok(parseWithSchema(OpsTablesResponseSchema, data));
  }

  @Get('/tables/:tableName/rows')
  async tableRows(@Param('tableName') tableName: string, @Query() rawQuery: unknown) {
    const query = parseWithSchema(OpsTableRowsQuerySchema, rawQuery);
    const data: OpsTableRowsResponse = await this.opsQueryService.listTableRows(tableName, query);
    return ok(parseWithSchema(OpsTableRowsResponseSchema, data));
  }

  @Get('/jobs')
  async jobs(@Query() rawQuery: unknown) {
    const query = parseWithSchema(PaginationQuerySchema, rawQuery);
    const data: OpsJobsResponse = await this.opsQueryService.listJobs(query.limit, query.cursor);
    return ok(parseWithSchema(OpsJobsResponseSchema, data));
  }

  @Get('/queue')
  async queue() {
    const data: OpsQueue = await this.opsQueryService.getQueue();
    return ok(parseWithSchema(OpsQueueSchema, data));
  }
}
