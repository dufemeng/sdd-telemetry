import { z } from 'zod';
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
