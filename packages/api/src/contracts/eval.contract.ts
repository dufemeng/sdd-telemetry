import { z } from 'zod';
import { IdSchema, ISODateTimeSchema } from './common.contract';

export const EvalItemSourceSchema = z.enum(['cleaned', 'manual']);
export type EvalItemSource = z.infer<typeof EvalItemSourceSchema>;

export const EvalArtifactTypeSchema = z.enum(['design', 'proposal', 'tasks']);
export type EvalArtifactType = z.infer<typeof EvalArtifactTypeSchema>;

const ItemKeySchema = z.string().length(64);

export const EvalItemSummarySchema = z.object({
  id: IdSchema,
  itemKey: ItemKeySchema,
  profileId: z.string(),
  source: EvalItemSourceSchema,
  promptPreview: z.string().max(240),
  targetSkill: z.string().nullable(),
  targetArtifactType: EvalArtifactTypeSchema.nullable(),
  originCapabilityCode: z.string().nullable(),
  originRawCapabilityName: z.string().nullable(),
  occurrenceCount: z.number().int().nonnegative(),
  firstObservedAt: ISODateTimeSchema.nullable(),
  lastObservedAt: ISODateTimeSchema.nullable(),
  lastImportedAt: ISODateTimeSchema.nullable(),
  enabled: z.boolean(),
  title: z.string().max(500).nullable(),
  gmtModified: ISODateTimeSchema,
}).strict();
export type EvalItemSummary = z.infer<typeof EvalItemSummarySchema>;

export const EvalItemListSummarySchema = z.object({
  total: z.number().int().nonnegative(),
  enabled: z.number().int().nonnegative(),
  cleaned: z.number().int().nonnegative(),
  manual: z.number().int().nonnegative(),
});
export type EvalItemListSummary = z.infer<typeof EvalItemListSummarySchema>;

export const EvalItemListResponseSchema = z.object({
  items: z.array(EvalItemSummarySchema),
  total: z.number().int().nonnegative(),
  page: z.number().int().positive(),
  pageSize: z.number().int().positive(),
  summary: EvalItemListSummarySchema,
});
export type EvalItemListResponse = z.infer<typeof EvalItemListResponseSchema>;

export const EvalItemDetailResponseSchema = z.object({
  id: IdSchema,
  itemKey: ItemKeySchema,
  profileId: z.string(),
  source: EvalItemSourceSchema,
  promptText: z.string(),
  targetSkill: z.string().max(191).nullable(),
  targetArtifactType: EvalArtifactTypeSchema.nullable(),
  originCapabilityCode: z.string().nullable(),
  originRawCapabilityName: z.string().nullable(),
  originInteractionId: IdSchema.nullable(),
  originProjectionRunId: IdSchema.nullable(),
  occurrenceCount: z.number().int().nonnegative(),
  firstObservedAt: ISODateTimeSchema.nullable(),
  lastObservedAt: ISODateTimeSchema.nullable(),
  lastImportedAt: ISODateTimeSchema.nullable(),
  enabled: z.boolean(),
  title: z.string().max(500).nullable(),
  notes: z.string().max(10000).nullable(),
  gmtModified: ISODateTimeSchema,
});
export type EvalItemDetailResponse = z.infer<typeof EvalItemDetailResponseSchema>;

export const CreateEvalItemRequestSchema = z.object({
  profileId: z.string().min(1).max(191),
  source: z.literal('manual'),
  promptText: z.string().min(1).max(256000).transform((s) => s).refine((s) => s.trim().length > 0, 'promptText must not be empty/whitespace'),
  targetSkill: z.string().max(191).transform((s) => s.trim()).refine((s) => s.length > 0, 'targetSkill must not be empty'),
  targetArtifactType: EvalArtifactTypeSchema,
  title: z.string().max(500).optional(),
  notes: z.string().max(10000).optional(),
});
export type CreateEvalItemRequest = z.infer<typeof CreateEvalItemRequestSchema>;

export const UpdateEvalItemRequestSchema = z.object({
  profileId: z.string().min(1).max(191),
  promptText: z.string().min(1).max(256000).optional(),
  targetSkill: z.string().max(191).optional(),
  targetArtifactType: EvalArtifactTypeSchema.optional(),
  title: z.string().max(500).nullable().optional(),
  notes: z.string().max(10000).nullable().optional(),
  enabled: z.boolean().optional(),
}).strict();
export type UpdateEvalItemRequest = z.infer<typeof UpdateEvalItemRequestSchema>;

export const EvalImportFromLogsRequestSchema = z.object({
  profileId: z.string().min(1).max(191),
  capabilityCode: z.string().max(64).optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
}).superRefine((value, ctx) => {
  if ((value.from === undefined) !== (value.to === undefined)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'from/to must appear together', path: ['from'] });
  }
  if (value.from && value.to) {
    const spanMs = new Date(value.to).getTime() - new Date(value.from).getTime();
    if (spanMs <= 0) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'to must be after from', path: ['to'] });
    }
    if (spanMs > 31 * 24 * 60 * 60 * 1000) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'range must not exceed 31 days', path: ['to'] });
    }
  }
});
export type EvalImportFromLogsRequest = z.infer<typeof EvalImportFromLogsRequestSchema>;

export const EvalImportFromLogsResponseSchema = z.object({
  projectionRunId: IdSchema,
  scannedCount: z.number().int().nonnegative(),
  candidateCount: z.number().int().nonnegative(),
  insertedCount: z.number().int().nonnegative(),
  refreshedCount: z.number().int().nonnegative(),
  upgradedCount: z.number().int().nonnegative(),
  skippedNoPromptCount: z.number().int().nonnegative(),
  skippedOversizeCount: z.number().int().nonnegative(),
  skippedNoArtifactTypeCount: z.number().int().nonnegative(),
  skippedDeletedCount: z.number().int().nonnegative(),
});
export type EvalImportFromLogsResponse = z.infer<typeof EvalImportFromLogsResponseSchema>;

// ============ 评分标准 (rubric) ============

export const RubricDimensionSchema = z.object({
  code: z.string().min(1).max(32),
  name: z.string().min(1).max(64),
  weight: z.number().positive().max(100),
  anchors: z.object({
    '0': z.string().min(1).max(500),
    '1': z.string().min(1).max(500),
    '2': z.string().min(1).max(500),
  }).strict(),
}).strict();
export type RubricDimension = z.infer<typeof RubricDimensionSchema>;

export const RubricJudgeSchema = z.object({
  temperature: z.number().min(0).max(1),
  evidenceRequired: z.boolean(),
  context: z.enum(['intrinsic', 'with_code']),
}).strict();
export type RubricJudge = z.infer<typeof RubricJudgeSchema>;

export const RubricSchema = z.object({
  judge: RubricJudgeSchema,
  dimensions: z.array(RubricDimensionSchema).min(1).max(20),
}).strict().superRefine((value, ctx) => {
  const seen = new Set<string>();
  for (const d of value.dimensions) {
    if (seen.has(d.code)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: `duplicate dimension code: ${d.code}`, path: ['dimensions'] });
    }
    seen.add(d.code);
  }
});
export type Rubric = z.infer<typeof RubricSchema>;

export const RubricVersionStatusSchema = z.enum(['draft', 'published']);
export type RubricVersionStatus = z.infer<typeof RubricVersionStatusSchema>;

export const RubricVersionSummarySchema = z.object({
  id: IdSchema,
  versionNo: z.number().int().positive(),
  versionStatus: RubricVersionStatusSchema,
  definitionHash: z.string().length(64),
  publishedAt: ISODateTimeSchema.nullable(),
  gmtModified: ISODateTimeSchema,
}).strict();
export type RubricVersionSummary = z.infer<typeof RubricVersionSummarySchema>;

export const RubricVersionSchema = RubricVersionSummarySchema.extend({
  profileId: z.string(),
  artifactType: EvalArtifactTypeSchema,
  rubric: RubricSchema,
}).strict();
export type RubricVersion = z.infer<typeof RubricVersionSchema>;

/** GET /api/eval/rubrics?profileId=&artifactType= */
export const RubricOverviewResponseSchema = z.object({
  profileId: z.string(),
  artifactType: EvalArtifactTypeSchema,
  active: RubricVersionSchema.nullable(),
  draft: RubricVersionSchema.nullable(),
  versions: z.array(RubricVersionSummarySchema),
  builtinDefault: RubricSchema,
}).strict();
export type RubricOverviewResponse = z.infer<typeof RubricOverviewResponseSchema>;

/** POST /api/eval/rubrics —— 保存/覆盖当前 draft */
export const SaveRubricDraftRequestSchema = z.object({
  profileId: z.string().min(1).max(191),
  artifactType: EvalArtifactTypeSchema,
  rubric: RubricSchema,
}).strict();
export type SaveRubricDraftRequest = z.infer<typeof SaveRubricDraftRequestSchema>;

/** POST /api/eval/rubrics/:id/publish 返回 */
export const RubricMutationResponseSchema = z.object({
  id: IdSchema,
  versionNo: z.number().int().positive(),
  versionStatus: RubricVersionStatusSchema,
}).strict();
export type RubricMutationResponse = z.infer<typeof RubricMutationResponseSchema>;
