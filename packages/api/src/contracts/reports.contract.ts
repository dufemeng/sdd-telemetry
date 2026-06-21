import { z } from 'zod';
import { IdSchema, ISODateTimeSchema } from './common.contract';

const MetricDeltaSchema = z.object({
  current: z.number(),
  previous: z.number(),
  delta: z.number(),
  deltaRate: z.number().nullable(),
});

const EmptyCodeImpact = {
  codeWriteCount: 0,
  codeReadCount: 0,
  touchedFileCount: 0,
  contributorCount: 0,
  topRepositories: [],
  summary: '昨日未观测到 SDD 参与业务代码读写。',
};

const DailyReportCodeImpactSchema = z.object({
  codeWriteCount: z.number(),
  codeReadCount: z.number(),
  touchedFileCount: z.number(),
  contributorCount: z.number(),
  topRepositories: z.array(
    z.object({
      repository: z.string(),
      writeCount: z.number(),
      readCount: z.number(),
    }),
  ),
  summary: z.string(),
});

export const DailyReportMetricsSchema = z.object({
  reportDate: z.string(),
  timezone: z.literal('Asia/Shanghai'),
  period: z.object({
    start: z.string(),
    end: z.string(),
  }),
  generatedAt: z.string(),
  headline: z.string(),
  kpis: z.object({
    activeUsers: MetricDeltaSchema,
    skillUsages: MetricDeltaSchema,
    coveredWorkItems: MetricDeltaSchema,
    documentOutputs: MetricDeltaSchema,
    wikiRecalls: MetricDeltaSchema,
  }),
  adoption: z.object({
    activeUsers: z.number(),
    skillUsages: z.number(),
    coveredWorkItems: z.number(),
    summary: z.string(),
  }),
  chain: z.object({
    stages: z.array(
      z.object({
        code: z.enum(['proposal', 'design', 'task', 'review']),
        label: z.string(),
        workItemCount: z.number(),
        previousDelta: z.number(),
        status: z.enum(['healthy', 'growing', 'watch']),
      }),
    ),
    multiStageWorkItemCount: z.number(),
    fullChainWorkItemCount: z.number(),
    summary: z.string(),
  }),
  benchmarks: z.array(
    z.object({
      workItemId: z.string(),
      title: z.string(),
      businessDomain: z.string().nullable(),
      stageCodes: z.array(z.string()),
      documentCount: z.number(),
      documentWriteCount: z.number(),
      contributorCount: z.number(),
      wikiRecallCount: z.number(),
      label: z.string(),
      link: z.string(),
    }),
  ),
  knowledge: z.object({
    wikiRecallCount: z.number(),
    distinctFileCount: z.number(),
    distinctPathDimensionCount: z.number(),
    topPathDimensions: z.array(
      z.object({
        pathSegment: z.string(),
        count: z.number(),
      }),
    ),
    summary: z.string(),
  }),
  codeImpact: DailyReportCodeImpactSchema.default(EmptyCodeImpact),
  links: z.object({
    overview: z.string(),
    workItems: z.string(),
    wikiRecalls: z.string(),
  }),
  dataHealth: z.object({
    outboxPendingCount: z.number(),
    outboxFailedCount: z.number(),
    failedBatchCount: z.number(),
    warnings: z.array(z.string()),
  }),
  methodology: z.object({
    queryVersion: z.string(),
    templateVersion: z.string(),
    generatedBy: z.enum(['schedule', 'manual', 'regenerate']),
  }),
});

export const DailyReportDetailResponseSchema = z.object({
  id: z.string(),
  reportDate: z.string(),
  timezone: z.string(),
  periodStart: z.string(),
  periodEnd: z.string(),
  status: z.enum(['generated', 'failed', 'stale']),
  metrics: DailyReportMetricsSchema.nullable(),
  markdownText: z.string(),
  templateVersion: z.string(),
  queryVersion: z.string(),
  generatedAt: z.string(),
  generatedBy: z.enum(['schedule', 'manual', 'regenerate']),
  errorMessage: z.string().nullable(),
});

export const DailyReportListItemSchema = z.object({
  id: z.string(),
  reportDate: z.string(),
  status: z.enum(['generated', 'failed', 'stale']),
  generatedAt: z.string(),
  generatedBy: z.enum(['schedule', 'manual', 'regenerate']),
  errorMessage: z.string().nullable(),
});

export const DailyReportListResponseSchema = z.object({
  items: z.array(DailyReportListItemSchema),
  total: z.number(),
  page: z.number(),
  pageSize: z.number(),
});

export const DailyReportListQuerySchema = z.object({
  from: z.string().optional(),
  to: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(30),
});

export type DailyReportMetrics = z.infer<typeof DailyReportMetricsSchema>;
export type DailyReportDetailResponse = z.infer<typeof DailyReportDetailResponseSchema>;
export type DailyReportListItem = z.infer<typeof DailyReportListItemSchema>;
export type DailyReportListResponse = z.infer<typeof DailyReportListResponseSchema>;
export type DailyReportListQuery = z.infer<typeof DailyReportListQuerySchema>;
export type MetricDelta = z.infer<typeof MetricDeltaSchema>;
export type DailyReportCodeImpact = z.infer<typeof DailyReportCodeImpactSchema>;
