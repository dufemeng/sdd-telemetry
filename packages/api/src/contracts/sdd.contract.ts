import { z } from 'zod';
import { IdSchema, ISODateTimeSchema, PaginationQuerySchema } from './common.contract';
import { TimeRangeQuerySchema } from './events.contract';

export const SddSemanticSchema = z.object({
  id: IdSchema,
  semanticCode: z.string(),
  displayName: z.string(),
  description: z.string().nullable(),
  aliases: z.array(
    z.object({
      id: IdSchema,
      skillName: z.string(),
    }),
  ),
});

export const CreateSddSemanticRequestSchema = z.object({
  semanticCode: z.string().min(1).max(64),
  displayName: z.string().min(1).max(191),
  description: z.string().max(1000).optional(),
  aliases: z.array(z.string().min(1).max(191)).min(1),
});

export const SddFunnelQuerySchema = TimeRangeQuerySchema.extend({
  groupBy: z.enum(['semantic', 'user', 'work_item']).default('semantic'),
});

export const SddFunnelSchema = z.object({
  totalInteractions: z.number(),
  totalSkillUsages: z.number(),
  callQuality: z.object({
    triggeredCount: z.number(),
    withPromptCount: z.number(),
    withResponseCount: z.number(),
    pairedCount: z.number(),
    promptCoverageRate: z.number().nullable(),
    responseCoverageRate: z.number().nullable(),
    pairingSuccessRate: z.number().nullable(),
  }),
  stages: z.array(
    z.object({
      semanticCode: z.string(),
      displayName: z.string(),
      usageCount: z.number(),
      userCount: z.number(),
      workItemCount: z.number(),
      conversionRate: z.number().nullable(),
    }),
  ),
});

export const SddListQuerySchema = PaginationQuerySchema.merge(TimeRangeQuerySchema).extend({
  semanticCode: z.string().optional(),
  userId: IdSchema.optional(),
  workItemId: IdSchema.optional(),
  sessionId: z.string().optional(),
  promptId: z.string().optional(),
  status: z.string().optional(),
});

export const SddUsageSummaryQuerySchema = TimeRangeQuerySchema.extend({
  semanticCode: z.string().optional(),
  status: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(100),
});

export const SddUsageSummaryItemSchema = z.object({
  semanticCode: z.string().nullable(),
  semanticDisplayName: z.string().nullable(),
  rawSkillName: z.string(),
  usageCount: z.number(),
  activeUserCount: z.number(),
  sessionCount: z.number(),
  workItemCount: z.number(),
  versions: z.array(
    z.object({
      version: z.string(),
      count: z.number(),
    }),
  ),
  firstSeenAt: ISODateTimeSchema.nullable(),
  lastSeenAt: ISODateTimeSchema.nullable(),
});

export const SddUsageSummaryResponseSchema = z.object({
  items: z.array(SddUsageSummaryItemSchema),
});

export const SddUsageItemSchema = z.object({
  id: IdSchema,
  usageKey: z.string(),
  semanticCode: z.string().nullable(),
  semanticDisplayName: z.string().nullable(),
  rawSkillName: z.string(),
  status: z.string(),
  userId: IdSchema.nullable(),
  interactionId: IdSchema.nullable(),
  workItemId: IdSchema.nullable(),
  sessionId: z.string().nullable(),
  promptId: z.string().nullable(),
  observedVersion: z.string().nullable(),
  eventTime: ISODateTimeSchema.nullable(),
});

export const SddInteractionItemSchema = z.object({
  id: IdSchema,
  interactionKey: z.string(),
  status: z.string(),
  userId: IdSchema.nullable(),
  sessionId: z.string().nullable(),
  promptId: z.string().nullable(),
  commandName: z.string().nullable(),
  model: z.string().nullable(),
  startedAt: ISODateTimeSchema.nullable(),
  completedAt: ISODateTimeSchema.nullable(),
  durationMs: z.number().nullable(),
  promptPreview: z.string().nullable(),
  responsePreview: z.string().nullable(),
});

export const SddErrorItemSchema = z.object({
  id: IdSchema,
  errorType: z.string(),
  severity: z.string(),
  source: z.string().nullable(),
  message: z.string().nullable(),
  count: z.number().optional(),
  latestAt: ISODateTimeSchema.nullable(),
  userId: IdSchema.nullable(),
  sessionId: z.string().nullable(),
  semanticCode: z.string().nullable(),
  workItemId: IdSchema.nullable(),
});

export const SddUserItemSchema = z.object({
  id: IdSchema,
  userKey: z.string(),
  installId: z.string().nullable(),
  userName: z.string().nullable(),
  machineId: z.string().nullable(),
  machineName: z.string().nullable(),
  lastSeenAt: ISODateTimeSchema.nullable(),
  skillUsageCount: z.number(),
  interactionCount: z.number(),
});

export const SddVersionItemSchema = z.object({
  version: z.string(),
  usageCount: z.number(),
  userCount: z.number(),
  latestAt: ISODateTimeSchema.nullable(),
});

export const SddWorkItemSchema = z.object({
  id: IdSchema,
  workItemKey: z.string(),
  requirementsRepoName: z.string().nullable(),
  businessDomain: z.string().nullable(),
  workItemSlug: z.string(),
  workItemTitle: z.string().nullable(),
  relativeDir: z.string(),
  firstSeenAt: ISODateTimeSchema.nullable(),
  lastSeenAt: ISODateTimeSchema.nullable(),
});

export const SddWorkItemDetailSchema = SddWorkItemSchema.extend({
  artifacts: z.array(
    z.object({
      id: IdSchema,
      artifactType: z.string(),
      artifactRelativePath: z.string(),
      systemModule: z.string().nullable(),
      lastSeenAt: ISODateTimeSchema.nullable(),
    }),
  ),
  usageCount: z.number(),
  errorCount: z.number(),
});

export const ReportUserSettingsRequestSchema = z.object({
  installId: z.string().optional(),
  userName: z.string().optional(),
  machineId: z.string().optional(),
  machineName: z.string().optional(),
  requirementsRootPath: z.string().min(1),
  wikiRootPath: z.string().optional(),
  settings: z.record(z.string(), z.unknown()).optional(),
});

export type SddSemantic = z.infer<typeof SddSemanticSchema>;
export type CreateSddSemanticRequest = z.infer<typeof CreateSddSemanticRequestSchema>;
export type SddFunnelQuery = z.infer<typeof SddFunnelQuerySchema>;
export type SddFunnel = z.infer<typeof SddFunnelSchema>;
export type SddListQuery = z.infer<typeof SddListQuerySchema>;
export type SddUsageSummaryQuery = z.infer<typeof SddUsageSummaryQuerySchema>;
export type SddUsageSummaryItem = z.infer<typeof SddUsageSummaryItemSchema>;
export type SddUsageSummaryResponse = z.infer<typeof SddUsageSummaryResponseSchema>;
export type SddUsageItem = z.infer<typeof SddUsageItemSchema>;
export type SddInteractionItem = z.infer<typeof SddInteractionItemSchema>;
export type SddErrorItem = z.infer<typeof SddErrorItemSchema>;
export type SddUserItem = z.infer<typeof SddUserItemSchema>;
export type SddVersionItem = z.infer<typeof SddVersionItemSchema>;
export type SddWorkItem = z.infer<typeof SddWorkItemSchema>;
export type SddWorkItemDetail = z.infer<typeof SddWorkItemDetailSchema>;
export type ReportUserSettingsRequest = z.infer<typeof ReportUserSettingsRequestSchema>;
