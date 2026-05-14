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

export const OpsJobSchema = z.object({
  id: z.string(),
  kind: z.enum(['outbox', 'bullmq']),
  status: z.string(),
  aggregateId: z.string().nullable(),
  attempts: z.number(),
  lastError: z.string().nullable(),
  createdAt: ISODateTimeSchema.nullable(),
  updatedAt: ISODateTimeSchema.nullable(),
});

export const OpsJobsResponseSchema = z.object({
  items: z.array(OpsJobSchema),
  nextCursor: z.string().nullable(),
});

export type OpsTable = z.infer<typeof OpsTableSchema>;
export type OpsTablesResponse = z.infer<typeof OpsTablesResponseSchema>;
export type OpsTableRowsQuery = z.infer<typeof OpsTableRowsQuerySchema>;
export type OpsTableRowsResponse = z.infer<typeof OpsTableRowsResponseSchema>;
export type OpsQueue = z.infer<typeof OpsQueueSchema>;
export type OpsJob = z.infer<typeof OpsJobSchema>;
export type OpsJobsResponse = z.infer<typeof OpsJobsResponseSchema>;
