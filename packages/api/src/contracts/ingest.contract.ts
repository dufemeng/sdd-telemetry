import { z } from 'zod';
import { ISODateTimeSchema, IdSchema, PaginationQuerySchema } from './common.contract';

export const BatchStatusSchema = z.enum([
  'received',
  'queued',
  'processing',
  'parsed',
  'failed_retryable',
  'failed_terminal',
]);

export const OutboxStatusSchema = z.enum([
  'pending',
  'dispatching',
  'dispatched',
  'failed_terminal',
]);

export const OtlpLogsPayloadSchema = z.record(z.string(), z.unknown());

export const IngestLogsResponseSchema = z.object({
  batchId: IdSchema,
  status: BatchStatusSchema,
  duplicate: z.boolean(),
  payloadHash: z.string().length(64),
});

export const IngestHealthQuerySchema = z.object({
  windowHours: z.coerce.number().int().min(1).max(168).default(24),
});

export const IngestHealthSchema = z.object({
  windowHours: z.number(),
  totalBatches: z.number(),
  parsedBatches: z.number(),
  processingBatches: z.number(),
  failedBatches: z.number(),
  duplicateBatches: z.number(),
  totalPayloadBytes: z.number(),
  latestReceivedAt: ISODateTimeSchema.nullable(),
  latestParsedAt: ISODateTimeSchema.nullable(),
  queue: z.object({
    pendingOutbox: z.number(),
    queuedJobs: z.number(),
    activeJobs: z.number(),
    failedJobs: z.number(),
  }),
});

export const BatchListQuerySchema = PaginationQuerySchema.extend({
  status: BatchStatusSchema.optional(),
});

export const BatchListItemSchema = z.object({
  id: IdSchema,
  status: BatchStatusSchema,
  payloadBytes: z.number(),
  rawLogCount: z.number(),
  eventCount: z.number(),
  derivedCount: z.number(),
  duplicateCount: z.number(),
  receivedAt: ISODateTimeSchema,
  parseDurationMs: z.number().nullable(),
  lastError: z.string().nullable(),
});

export const BatchListResponseSchema = z.object({
  items: z.array(BatchListItemSchema),
  nextCursor: z.string().nullable(),
});

export const BatchDetailSchema = BatchListItemSchema.extend({
  payloadHash: z.string().length(64),
  statusReason: z.string().nullable(),
  lastDuplicateAt: ISODateTimeSchema.nullable(),
  parseStartedAt: ISODateTimeSchema.nullable(),
  parseCompletedAt: ISODateTimeSchema.nullable(),
  retryCount: z.number(),
  rawAvailable: z.boolean(),
  rawExpiresAt: ISODateTimeSchema.nullable(),
  outbox: z
    .object({
      status: OutboxStatusSchema,
      attempts: z.number(),
      nextRetryAt: ISODateTimeSchema.nullable(),
      lastError: z.string().nullable(),
      dispatchedAt: ISODateTimeSchema.nullable(),
    })
    .nullable(),
});

export const ReprocessBatchResponseSchema = z.object({
  batchId: IdSchema,
  accepted: z.boolean(),
  status: BatchStatusSchema,
  outboxStatus: OutboxStatusSchema.nullable(),
});

export type BatchStatus = z.infer<typeof BatchStatusSchema>;
export type OutboxStatus = z.infer<typeof OutboxStatusSchema>;
export type IngestLogsResponse = z.infer<typeof IngestLogsResponseSchema>;
export type IngestHealth = z.infer<typeof IngestHealthSchema>;
export type BatchListQuery = z.infer<typeof BatchListQuerySchema>;
export type BatchListItem = z.infer<typeof BatchListItemSchema>;
export type BatchListResponse = z.infer<typeof BatchListResponseSchema>;
export type BatchDetail = z.infer<typeof BatchDetailSchema>;
export type ReprocessBatchResponse = z.infer<typeof ReprocessBatchResponseSchema>;
