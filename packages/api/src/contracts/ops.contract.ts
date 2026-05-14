import { z } from 'zod';
import { ISODateTimeSchema, PaginationQuerySchema } from './common.contract';

export const OpsTableSchema = z.object({
  tableName: z.string(),
  estimatedRows: z.number(),
  updatedAt: ISODateTimeSchema.nullable(),
});

export const OpsTablesResponseSchema = z.object({
  tables: z.array(OpsTableSchema),
});

export const OpsTableRowsQuerySchema = PaginationQuerySchema.extend({
  orderBy: z.string().optional(),
  order: z.enum(['asc', 'desc']).default('desc'),
});

export const OpsTableRowsResponseSchema = z.object({
  tableName: z.string(),
  columns: z.array(z.string()),
  rows: z.array(z.record(z.string(), z.unknown())),
  nextCursor: z.string().nullable(),
});

export const OpsQueueSchema = z.object({
  pendingOutbox: z.number(),
  queuedJobs: z.number(),
  activeJobs: z.number(),
  failedJobs: z.number(),
});

export type OpsTable = z.infer<typeof OpsTableSchema>;
export type OpsTablesResponse = z.infer<typeof OpsTablesResponseSchema>;
export type OpsTableRowsQuery = z.infer<typeof OpsTableRowsQuerySchema>;
export type OpsTableRowsResponse = z.infer<typeof OpsTableRowsResponseSchema>;
export type OpsQueue = z.infer<typeof OpsQueueSchema>;
