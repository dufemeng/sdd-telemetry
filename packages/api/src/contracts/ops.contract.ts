import { z } from 'zod';
import { ISODateTimeSchema, PaginationQuerySchema } from './common.contract';

export const OpsColumnSchema = z.object({
  columnName: z.string(),
  dataType: z.string(),
  nullable: z.boolean(),
  key: z.string().nullable(),
  defaultValue: z.string().nullable(),
  extra: z.string().nullable(),
  estimatedMaxSize: z.number().nullable(),
  sizeBasis: z.string(),
});

export const OpsTableSchema = z.object({
  tableName: z.string(),
  estimatedRows: z.number(),
  updatedAt: ISODateTimeSchema.nullable(),
  columns: z.array(OpsColumnSchema),
});

export const OpsTablesResponseSchema = z.object({
  tables: z.array(OpsTableSchema),
});

export const OpsFilterOperatorSchema = z.enum([
  'eq',
  'ne',
  'like',
  'not_like',
  'in',
  'not_in',
  'gt',
  'gte',
  'lt',
  'lte',
  'is_null',
  'is_not_null',
]);

export const OpsTableFilterSchema = z.object({
  column: z.string().min(1),
  operator: OpsFilterOperatorSchema,
  value: z.union([z.string(), z.array(z.string())]).optional(),
});

/** A group of conditions OR'd together. Groups themselves are AND'd in the WHERE clause. */
export const OpsTableFilterGroupSchema = z.object({
  conditions: z.array(OpsTableFilterSchema).min(1),
});

export const OpsTableRowsQuerySchema = PaginationQuerySchema.extend({
  orderBy: z.string().optional(),
  order: z.enum(['asc', 'desc']).default('desc'),
  filters: z
    .preprocess((value) => {
      if (value === undefined || value === null || value === '') {
        return [];
      }

      if (typeof value === 'string') {
        try {
          return JSON.parse(value) as unknown;
        } catch {
          return value;
        }
      }

      return value;
    }, z.array(OpsTableFilterGroupSchema))
    .default([]),
});

export const OpsTableRowsResponseSchema = z.object({
  tableName: z.string(),
  columns: z.array(OpsColumnSchema),
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
export type OpsColumn = z.infer<typeof OpsColumnSchema>;
export type OpsTableFilter = z.infer<typeof OpsTableFilterSchema>;
export type OpsTableFilterGroup = z.infer<typeof OpsTableFilterGroupSchema>;
export type OpsFilterOperator = z.infer<typeof OpsFilterOperatorSchema>;
export type OpsTablesResponse = z.infer<typeof OpsTablesResponseSchema>;
export type OpsTableRowsQuery = z.infer<typeof OpsTableRowsQuerySchema>;
export type OpsTableRowsResponse = z.infer<typeof OpsTableRowsResponseSchema>;
export type OpsQueue = z.infer<typeof OpsQueueSchema>;
export type OpsJob = z.infer<typeof OpsJobSchema>;
export type OpsJobsResponse = z.infer<typeof OpsJobsResponseSchema>;
