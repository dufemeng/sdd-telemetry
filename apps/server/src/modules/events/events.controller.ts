import { Controller, Get } from '@midwayjs/core';
import type { EventDistribution, FieldCoverage } from '@sdd-monitor/api';
import { ok } from '../../common/response/api-response';

@Controller('/api/events')
export class EventsController {
  @Get('/distribution')
  async distribution() {
    const data: EventDistribution = {
      totalEvents: 0,
      distinctEventNames: 0,
      items: [],
    };
    return ok(data);
  }

  @Get('/field-coverage')
  async fieldCoverage() {
    const data: FieldCoverage = {
      totalEvents: 0,
      fields: [],
    };
    return ok(data);
  }
}
