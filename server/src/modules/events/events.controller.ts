import { Controller, Get, Inject } from '@midwayjs/core';
import type { Context } from '@midwayjs/koa';
import {
  EventDistributionQuerySchema,
  EventDistributionSchema,
  EventTimelineQuerySchema,
  EventTimelineSchema,
  FieldCoverageSchema,
  FieldValuesQuerySchema,
  FieldValuesSchema,
  TimeRangeQuerySchema,
  type EventDistribution,
  type EventTimeline,
  type FieldCoverage,
  type FieldValues,
} from '@sdd-telemetry/api';
import { ok } from '../../common/response/api-response';
import { parseWithSchema } from '../../common/validation/parse-with-schema';
import { EventsQueryService } from './events-query.service';

@Controller('/api/events')
export class EventsController {
  @Inject()
  ctx!: Context;

  @Inject('eventsQueryService')
  eventsQueryService!: EventsQueryService;

  @Get('/distribution')
  async distribution() {
    const query = parseWithSchema(EventDistributionQuerySchema, this.ctx.query);
    const data: EventDistribution = await this.eventsQueryService.getDistribution(query);
    return ok(parseWithSchema(EventDistributionSchema, data));
  }

  @Get('/field-coverage')
  async fieldCoverage() {
    const query = parseWithSchema(TimeRangeQuerySchema, this.ctx.query);
    const data: FieldCoverage = await this.eventsQueryService.getFieldCoverage(query);
    return ok(parseWithSchema(FieldCoverageSchema, data));
  }

  @Get('/field-values')
  async fieldValues() {
    const query = parseWithSchema(FieldValuesQuerySchema, this.ctx.query);
    const data: FieldValues = await this.eventsQueryService.getFieldValues(query);
    return ok(parseWithSchema(FieldValuesSchema, data));
  }

  @Get('/timeline')
  async timeline() {
    const query = parseWithSchema(EventTimelineQuerySchema, this.ctx.query);
    const data: EventTimeline = await this.eventsQueryService.getTimeline(query);
    return ok(parseWithSchema(EventTimelineSchema, data));
  }
}
