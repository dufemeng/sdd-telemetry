import { Controller, Get, Inject, Query } from '@midwayjs/core';
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
} from '@sdd-monitor/api';
import { ok } from '../../common/response/api-response';
import { parseWithSchema } from '../../common/validation/parse-with-schema';
import { EventsQueryService } from './events-query.service';

@Controller('/api/events')
export class EventsController {
  @Inject('eventsQueryService')
  eventsQueryService!: EventsQueryService;

  @Get('/distribution')
  async distribution(@Query() rawQuery: unknown) {
    const query = parseWithSchema(EventDistributionQuerySchema, rawQuery);
    const data: EventDistribution = await this.eventsQueryService.getDistribution(query);
    return ok(parseWithSchema(EventDistributionSchema, data));
  }

  @Get('/field-coverage')
  async fieldCoverage(@Query() rawQuery: unknown) {
    const query = parseWithSchema(TimeRangeQuerySchema, rawQuery);
    const data: FieldCoverage = await this.eventsQueryService.getFieldCoverage(query);
    return ok(parseWithSchema(FieldCoverageSchema, data));
  }

  @Get('/field-values')
  async fieldValues(@Query() rawQuery: unknown) {
    const query = parseWithSchema(FieldValuesQuerySchema, rawQuery);
    const data: FieldValues = await this.eventsQueryService.getFieldValues(query);
    return ok(parseWithSchema(FieldValuesSchema, data));
  }

  @Get('/timeline')
  async timeline(@Query() rawQuery: unknown) {
    const query = parseWithSchema(EventTimelineQuerySchema, rawQuery);
    const data: EventTimeline = await this.eventsQueryService.getTimeline(query);
    return ok(parseWithSchema(EventTimelineSchema, data));
  }
}
