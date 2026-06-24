import { z } from 'zod';
import { WorkflowProfileConfigSchema } from '../profile-config/profile-schema';
import { ISODateTimeSchema } from './common.contract';

export const ProfileConfigOriginSchema = z.enum(['builtin', 'custom']);
export type ProfileConfigOriginContract = z.infer<typeof ProfileConfigOriginSchema>;

export const ProfileConfigVersionStatusSchema = z.enum(['draft', 'published', 'archived']);
export type ProfileConfigVersionStatusContract = z.infer<typeof ProfileConfigVersionStatusSchema>;

export const ProfileConfigValidationIssueSchema = z.object({
  ruleId: z.string().optional(),
  code: z.string().optional(),
  severity: z.enum(['error', 'warning']).optional(),
  path: z.string().optional(),
  message: z.string(),
});

export const ProfileConfigValidationResultSchema = z.object({
  valid: z.boolean(),
  issues: z.array(ProfileConfigValidationIssueSchema),
});

export const ProfileConfigAdminSummarySchema = z.object({
  profileId: z.string(),
  displayName: z.string(),
  status: z.enum(['active', 'disabled']),
  projectionMode: z.enum(['sdd_bridge', 'source_backed']),
  origin: ProfileConfigOriginSchema,
  source: z.enum(['database', 'builtin']),
  publishedVersionId: z.string().nullable(),
  publishedVersionNo: z.number().nullable(),
  servingVersionId: z.string().nullable(),
  servingVersionNo: z.number().nullable(),
  draftVersionId: z.string().nullable(),
  definitionHash: z.string().nullable(),
  servingDefinitionHash: z.string().nullable(),
  publishedAt: ISODateTimeSchema.nullable(),
  servingAt: ISODateTimeSchema.nullable(),
  updatedAt: ISODateTimeSchema.nullable(),
});
export type ProfileConfigAdminSummary = z.infer<typeof ProfileConfigAdminSummarySchema>;

export const ProfileConfigAdminListResponseSchema = z.object({
  items: z.array(ProfileConfigAdminSummarySchema),
});
export type ProfileConfigAdminListResponse = z.infer<typeof ProfileConfigAdminListResponseSchema>;

export const ProfileConfigVersionSummarySchema = z.object({
  id: z.string(),
  versionNo: z.number(),
  status: ProfileConfigVersionStatusSchema,
  definitionHash: z.string(),
  notes: z.string().nullable(),
  publishedAt: ISODateTimeSchema.nullable(),
  createdAt: ISODateTimeSchema.nullable(),
});
export type ProfileConfigVersionSummary = z.infer<typeof ProfileConfigVersionSummarySchema>;

export const ProfileConfigAdminDetailSchema = z.object({
  summary: ProfileConfigAdminSummarySchema,
  config: WorkflowProfileConfigSchema,
  validation: ProfileConfigValidationResultSchema,
  versions: z.array(ProfileConfigVersionSummarySchema),
});
export type ProfileConfigAdminDetail = z.infer<typeof ProfileConfigAdminDetailSchema>;

export const SaveProfileConfigDraftRequestSchema = z.object({
  config: WorkflowProfileConfigSchema,
  notes: z.string().optional(),
});
export type SaveProfileConfigDraftRequest = z.infer<typeof SaveProfileConfigDraftRequestSchema>;

export const PublishProfileConfigRequestSchema = z.object({
  config: WorkflowProfileConfigSchema.optional(),
  notes: z.string().optional(),
  force: z.boolean().optional(),
  // 新建工作流时由前端置 true：服务端据此拒绝覆盖已存在的 profileId（防止"新增"被静默当成更新）。
  expectNew: z.boolean().optional(),
});
export type PublishProfileConfigRequest = z.infer<typeof PublishProfileConfigRequestSchema>;

export const ProfileConfigPreviewRequestSchema = z.object({
  config: WorkflowProfileConfigSchema,
});
export type ProfileConfigPreviewRequest = z.infer<typeof ProfileConfigPreviewRequestSchema>;

export const ProfileConfigPreviewResponseSchema = z.object({
  definitionHash: z.string(),
  validation: ProfileConfigValidationResultSchema,
  runtime: z.object({
    configured: z.boolean(),
    resolvedRuleCount: z.number(),
    unresolved: z.array(z.object({
      ruleId: z.string(),
      reason: z.string(),
    })),
  }),
});
export type ProfileConfigPreviewResponse = z.infer<typeof ProfileConfigPreviewResponseSchema>;
