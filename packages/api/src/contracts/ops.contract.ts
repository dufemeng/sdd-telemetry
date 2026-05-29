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
  totalBytes: z.number().nullable().optional(),
  dataBytes: z.number().nullable().optional(),
  indexBytes: z.number().nullable().optional(),
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

export const OpsTableRowResponseSchema = z.object({
  tableName: z.string(),
  row: z.record(z.string(), z.unknown()).nullable(),
});

export const OpsResourceServiceNameSchema = z.enum(['mysql', 'server', 'worker', 'web']);

export const OpsResourceProjectSchema = z.object({
  name: z.string(),
  deployVersion: z.string().nullable(),
  appImage: z.string().nullable(),
  webImage: z.string().nullable(),
});

export const OpsResourceTotalsSchema = z.object({
  cpuPercent: z.number().nullable(),
  memoryUsageBytes: z.number().nullable(),
  memoryLimitBytes: z.number().nullable(),
  imageSizeBytes: z.number().nullable(),
  containerWritableBytes: z.number().nullable(),
  databaseBytes: z.number().nullable(),
  deployDirectoryBytes: z.number().nullable(),
});

export const OpsResourceServiceSchema = z.object({
  serviceName: OpsResourceServiceNameSchema,
  containerName: z.string(),
  state: z.string(),
  health: z.string().nullable(),
  restartCount: z.number(),
  cpuPercent: z.number().nullable(),
  memoryUsageBytes: z.number().nullable(),
  memoryLimitBytes: z.number().nullable(),
  memoryPercent: z.number().nullable(),
  networkRxBytes: z.number().nullable(),
  networkTxBytes: z.number().nullable(),
  blockReadBytes: z.number().nullable(),
  blockWriteBytes: z.number().nullable(),
  writableLayerBytes: z.number().nullable(),
  imageRef: z.string().nullable(),
  imageSizeBytes: z.number().nullable(),
});

export const OpsResourceTableSizeSchema = z.object({
  tableName: z.string(),
  estimatedRows: z.number(),
  totalBytes: z.number(),
  dataBytes: z.number(),
  indexBytes: z.number(),
  updatedAt: ISODateTimeSchema.nullable(),
});

export const OpsResourceDatabaseSchema = z.object({
  totalBytes: z.number(),
  dataBytes: z.number(),
  indexBytes: z.number(),
  tables: z.array(OpsResourceTableSizeSchema),
});

export const OpsResourceAlertSchema = z.object({
  level: z.enum(['warn', 'bad']),
  code: z.string(),
  message: z.string(),
  target: z.string(),
});

export const OpsResourceSummarySchema = z.object({
  capturedAt: ISODateTimeSchema,
  project: OpsResourceProjectSchema,
  totals: OpsResourceTotalsSchema,
  services: z.array(OpsResourceServiceSchema),
  database: OpsResourceDatabaseSchema,
  alerts: z.array(OpsResourceAlertSchema),
});

export const OpsResourceHistoryQuerySchema = z.object({
  range: z.enum(['1h', '6h', '24h', '7d']).default('6h'),
  serviceName: z
    .union([OpsResourceServiceNameSchema, z.literal('total')])
    .default('total'),
  metric: z.enum(['cpu', 'memory', 'database', 'writableLayer']).default('memory'),
});

export const OpsResourceHistoryPointSchema = z.object({
  timestamp: ISODateTimeSchema,
  value: z.number().nullable(),
});

export const OpsResourceHistorySchema = z.object({
  metric: z.string(),
  serviceName: z.string(),
  points: z.array(OpsResourceHistoryPointSchema),
});

export type OpsTable = z.infer<typeof OpsTableSchema>;
export type OpsColumn = z.infer<typeof OpsColumnSchema>;
export type OpsTableFilter = z.infer<typeof OpsTableFilterSchema>;
export type OpsTableFilterGroup = z.infer<typeof OpsTableFilterGroupSchema>;
export type OpsFilterOperator = z.infer<typeof OpsFilterOperatorSchema>;
export type OpsTablesResponse = z.infer<typeof OpsTablesResponseSchema>;
export type OpsTableRowsQuery = z.infer<typeof OpsTableRowsQuerySchema>;
export type OpsTableRowsResponse = z.infer<typeof OpsTableRowsResponseSchema>;
export type OpsTableRowResponse = z.infer<typeof OpsTableRowResponseSchema>;
export type OpsQueue = z.infer<typeof OpsQueueSchema>;
export type OpsJob = z.infer<typeof OpsJobSchema>;
export type OpsJobsResponse = z.infer<typeof OpsJobsResponseSchema>;
export type OpsResourceServiceName = z.infer<typeof OpsResourceServiceNameSchema>;
export type OpsResourceProject = z.infer<typeof OpsResourceProjectSchema>;
export type OpsResourceTotals = z.infer<typeof OpsResourceTotalsSchema>;
export type OpsResourceService = z.infer<typeof OpsResourceServiceSchema>;
export type OpsResourceTableSize = z.infer<typeof OpsResourceTableSizeSchema>;
export type OpsResourceDatabase = z.infer<typeof OpsResourceDatabaseSchema>;
export type OpsResourceAlert = z.infer<typeof OpsResourceAlertSchema>;
export type OpsResourceSummary = z.infer<typeof OpsResourceSummarySchema>;
export type OpsResourceHistoryQuery = z.infer<typeof OpsResourceHistoryQuerySchema>;
export type OpsResourceHistory = z.infer<typeof OpsResourceHistorySchema>;
