import { z } from 'zod';
import { ISODateTimeSchema } from './common.contract';

export const TimeRangeQuerySchema = z.object({
  from: ISODateTimeSchema.optional(),
  to: ISODateTimeSchema.optional(),
});

export const EventDistributionQuerySchema = TimeRangeQuerySchema.extend({
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const EventDistributionItemSchema = z.object({
  eventName: z.string(),
  description: z.string().nullable(),
  count: z.number(),
  percentage: z.number(),
  latestAt: ISODateTimeSchema.nullable(),
});

export const EventDistributionSchema = z.object({
  totalEvents: z.number(),
  distinctEventNames: z.number(),
  items: z.array(EventDistributionItemSchema),
});

export const FieldCoverageSchema = z.object({
  totalEvents: z.number(),
  fields: z.array(
    z.object({
      fieldPath: z.string(),
      presentCount: z.number(),
      coverageRate: z.number(),
      examples: z.array(z.string()).max(5),
    }),
  ),
});

export const FieldValuesQuerySchema = TimeRangeQuerySchema.extend({
  fieldPath: z.string().min(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const FieldValuesSchema = z.object({
  fieldPath: z.string(),
  totalEvents: z.number(),
  values: z.array(
    z.object({
      value: z.string(),
      count: z.number(),
      percentage: z.number(),
    }),
  ),
});

export const EventTimelineQuerySchema = TimeRangeQuerySchema.extend({
  bucket: z.enum(['hour', 'day']).default('hour'),
});

export const EventTimelineSchema = z.object({
  bucket: z.enum(['hour', 'day']),
  buckets: z.array(
    z.object({
      bucketStart: ISODateTimeSchema,
      bucketEnd: ISODateTimeSchema,
      eventCount: z.number(),
      distinctEventNames: z.number(),
    }),
  ),
});

export type TimeRangeQuery = z.infer<typeof TimeRangeQuerySchema>;
export type EventDistributionQuery = z.infer<typeof EventDistributionQuerySchema>;
export type EventDistributionItem = z.infer<typeof EventDistributionItemSchema>;
export type EventDistribution = z.infer<typeof EventDistributionSchema>;
export type FieldCoverage = z.infer<typeof FieldCoverageSchema>;
export type FieldValuesQuery = z.infer<typeof FieldValuesQuerySchema>;
export type FieldValues = z.infer<typeof FieldValuesSchema>;
export type EventTimelineQuery = z.infer<typeof EventTimelineQuerySchema>;
export type EventTimeline = z.infer<typeof EventTimelineSchema>;
