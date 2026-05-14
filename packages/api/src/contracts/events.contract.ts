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

export type TimeRangeQuery = z.infer<typeof TimeRangeQuerySchema>;
export type EventDistributionQuery = z.infer<typeof EventDistributionQuerySchema>;
export type EventDistributionItem = z.infer<typeof EventDistributionItemSchema>;
export type EventDistribution = z.infer<typeof EventDistributionSchema>;
export type FieldCoverage = z.infer<typeof FieldCoverageSchema>;
