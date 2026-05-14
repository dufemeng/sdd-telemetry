import { Controller, Get } from '@midwayjs/core';
import type { OpsQueue, OpsTablesResponse } from '@sdd-monitor/api';
import { ok } from '../../common/response/api-response';

@Controller('/api/ops')
export class OpsController {
  @Get('/tables')
  async tables() {
    const data: OpsTablesResponse = {
      tables: [],
    };
    return ok(data);
  }

  @Get('/queue')
  async queue() {
    const data: OpsQueue = {
      pendingOutbox: 0,
      queuedJobs: 0,
      activeJobs: 0,
      failedJobs: 0,
    };
    return ok(data);
  }
}
