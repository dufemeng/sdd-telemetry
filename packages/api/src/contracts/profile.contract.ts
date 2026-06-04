import { z } from 'zod';
import { IdSchema, ISODateTimeSchema } from './common.contract';
import { TimeRangeQuerySchema } from './events.contract';

/**
 * Profile Observability Contract（MVP-1）
 *
 * 命名约定：contract 内部统一用通用模型名（deliveryUnit / artifact / capability /
 * knowledgeRecall），不出现 sdd / demand。页面文案可继续显示「需求 / 文档 / 能力 / 知识库」。
 */

export const ProfileCapabilityManifestSchema = z.object({
  capabilityUsage: z.boolean(),
  deliveryUnits: z.boolean(),
  artifacts: z.boolean(),
  artifactTimeline: z.boolean(),
  knowledgeRecalls: z.boolean(),
  codeChanges: z.boolean(),
  errors: z.boolean(),
  evaluation: z.boolean(),
  alerts: z.boolean(),
});
export type ProfileCapabilityManifest = z.infer<typeof ProfileCapabilityManifestSchema>;

export const ProfileStatusSchema = z.enum(['active', 'disabled']);
export type ProfileStatus = z.infer<typeof ProfileStatusSchema>;

export const ProfileSummarySchema = z.object({
  profileId: z.string(),
  displayName: z.string(),
  status: ProfileStatusSchema,
  manifest: ProfileCapabilityManifestSchema,
});
export type ProfileSummary = z.infer<typeof ProfileSummarySchema>;

export const ProfileSummaryListSchema = z.array(ProfileSummarySchema);

export const ProfileOverviewQuerySchema = TimeRangeQuerySchema;
export type ProfileOverviewQuery = z.infer<typeof ProfileOverviewQuerySchema>;

export const ProfileOverviewSchema = z.object({
  activeUserCount: z.number(),
  capabilityUsageCount: z.number(),
  deliveryUnitCount: z.number(),
  artifactCount: z.number(),
  knowledgeRecallCount: z.number(),
  codeWriteCount: z.number(),
  codeReadCount: z.number(),
});
export type ProfileOverview = z.infer<typeof ProfileOverviewSchema>;

// ── 产出分析（delivery unit，产品文案叫「需求」）──────────────────────────────

export const ProfileDemandQuerySchema = TimeRangeQuerySchema;
export type ProfileDemandQuery = z.infer<typeof ProfileDemandQuerySchema>;

export const ProfileDemandSchema = z.object({
  id: IdSchema,
  deliveryUnitKey: z.string(),
  businessDomain: z.string().nullable(),
  unitSlug: z.string().nullable(),
  title: z.string().nullable(),
  locator: z.string().nullable(),
  firstSeenAt: ISODateTimeSchema.nullable(),
  lastSeenAt: ISODateTimeSchema.nullable(),
  artifactCount: z.number(),
  coverageStages: z.array(z.string()),
});
export type ProfileDemand = z.infer<typeof ProfileDemandSchema>;

export const ProfileDemandListSchema = z.array(ProfileDemandSchema);
