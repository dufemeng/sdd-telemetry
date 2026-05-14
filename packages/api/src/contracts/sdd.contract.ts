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
export type SddErrorItem = z.infer<typeof SddErrorItemSchema>;
export type ReportUserSettingsRequest = z.infer<typeof ReportUserSettingsRequestSchema>;
