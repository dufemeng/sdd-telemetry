import { z } from 'zod';
import { IdSchema, ISODateTimeSchema } from './common.contract';
import { TimeRangeQuerySchema } from './events.contract';

/**
 * Profile Observability Contract
 *
 * 命名分层：
 * - URL 路径和面向产品的外部类型名可使用产品侧命名（如 /demands、ProfileDemand）。
 * - Contract 内部字段、聚合字段和服务端查询语义使用架构侧命名
 *   （如 deliveryUnitKey、capabilityUsageCount）。
 * - 不引入 Sdd* 命名。
 */

// ── Manifest & Profile 列表 ──────────────────────────────────────────────────

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

export const ProfilePresentationLabelsSchema = z.object({
  dashboardTitle: z.string(),
  deliveryUnitSingular: z.string(),
  deliveryUnitPlural: z.string(),
  artifactSingular: z.string(),
  artifactPlural: z.string(),
  capabilitySingular: z.string(),
  capabilityPlural: z.string(),
  knowledgeSingular: z.string(),
  knowledgePlural: z.string(),
});
export type ProfilePresentationLabels = z.infer<typeof ProfilePresentationLabelsSchema>;

export const ProfileStageDescriptorSchema = z.object({
  code: z.string(),
  label: z.string(),
  order: z.number(),
  colorToken: z.string().optional(),
});
export type ProfileStageDescriptor = z.infer<typeof ProfileStageDescriptorSchema>;

export const ProfilePresentationStagesSchema = z.object({
  artifactStages: z.array(ProfileStageDescriptorSchema),
  maturityStages: z.array(ProfileStageDescriptorSchema),
});
export type ProfilePresentationStages = z.infer<typeof ProfilePresentationStagesSchema>;

export const ProfilePresentationWidgetsSchema = z.object({
  artifactCoverageFunnel: z.enum(['sdd_stage', 'artifact_type', 'none']),
  userMaturity: z.enum(['sdd_maturity', 'none']),
  callQuality: z.boolean(),
  matchHealth: z.boolean(),
  triggerSourceBreakdown: z.boolean(),
  multiStageDeliveryUnit: z.boolean(),
});
export type ProfilePresentationWidgets = z.infer<typeof ProfilePresentationWidgetsSchema>;

export const ProfilePresentationSchema = z.object({
  workflowKind: z.enum(['sdd', 'local_path_monorepo', 'online_docs']),
  maturityStages: z.array(z.string()),
  artifactStageOrder: z.array(z.string()),
  hiddenMetrics: z.array(z.string()),
  labels: ProfilePresentationLabelsSchema.optional(),
  stages: ProfilePresentationStagesSchema.optional(),
  widgets: ProfilePresentationWidgetsSchema.optional(),
  legacyOnlySurfaces: z.array(z.string()).optional(),
});
export type ProfilePresentation = z.infer<typeof ProfilePresentationSchema>;

export const ProfileSummarySchema = z.object({
  profileId: z.string(),
  displayName: z.string(),
  status: ProfileStatusSchema,
  manifest: ProfileCapabilityManifestSchema,
  presentation: ProfilePresentationSchema,
});
export type ProfileSummary = z.infer<typeof ProfileSummarySchema>;

export const ProfileSummaryListSchema = z.array(ProfileSummarySchema);

// ── Profile Inspector（只读配置与运行态检查）─────────────────────────────────

const ProfileInspectorRecordSchema = z.record(z.string(), z.unknown());

export const ProfileInspectorProjectionRunSchema = z.object({
  id: IdSchema,
  profileConfigVersionId: IdSchema.nullable().optional(),
  runType: z.string(),
  status: z.string(),
  startedAt: ISODateTimeSchema.nullable(),
  completedAt: ISODateTimeSchema.nullable(),
  projectionDefinitionHash: z.string().nullable().optional(),
  resolvedConfigHash: z.string().nullable().optional(),
  stats: ProfileInspectorRecordSchema,
  errorMessage: z.string().nullable(),
});
export type ProfileInspectorProjectionRun = z.infer<typeof ProfileInspectorProjectionRunSchema>;

export const ProfileInspectorFactCountsSchema = z.object({
  deliveryUnits: z.number(),
  artifacts: z.number(),
  artifactWrites: z.number(),
  artifactTurns: z.number(),
  capabilityUsages: z.number(),
  knowledgeAccesses: z.number(),
  codeActivities: z.number(),
  errorEvents: z.number(),
});
export type ProfileInspectorFactCounts = z.infer<typeof ProfileInspectorFactCountsSchema>;

export const ProfileInspectorProjectionJobSchema = z.object({
  targetConfigVersionId: IdSchema.nullable().optional(),
  status: z.string(),
  dirtySeq: z.number(),
  dirtyReason: z.string().nullable(),
  attempts: z.number(),
  maxAttempts: z.number(),
  lockedBy: z.string().nullable(),
  lockedUntil: ISODateTimeSchema.nullable(),
  lastStartedAt: ISODateTimeSchema.nullable(),
  lastCompletedAt: ISODateTimeSchema.nullable(),
  lastProjectionRunId: IdSchema.nullable(),
  lastProfileConfigVersionId: IdSchema.nullable().optional(),
  lastResolvedConfigHash: z.string().nullable(),
  lastError: z.string().nullable(),
});
export type ProfileInspectorProjectionJob = z.infer<typeof ProfileInspectorProjectionJobSchema>;

export const ProfileInspectorMatchCountsSchema = z.object({
  sourceMatches: z.number(),
});
export type ProfileInspectorMatchCounts = z.infer<typeof ProfileInspectorMatchCountsSchema>;

export const ProfileInspectorResolvedSourceRuleSchema = z.object({
  ruleId: z.string(),
  locatorType: z.string(),
  category: z.string(),
  confidence: z.string(),
  priority: z.number(),
  actions: z.array(z.string()),
  resolvedRoot: z.string().nullable(),
  description: z.string().nullable(),
});
export type ProfileInspectorResolvedSourceRule = z.infer<
  typeof ProfileInspectorResolvedSourceRuleSchema
>;

export const ProfileInspectorResponseSchema = z.object({
  profile: z.object({
    profileId: z.string(),
    displayName: z.string(),
    status: ProfileStatusSchema,
    projectionMode: z.enum(['sdd_bridge', 'source_backed']),
    manifest: ProfileCapabilityManifestSchema,
    presentation: ProfilePresentationSchema,
  }),
  validation: z.object({
    valid: z.boolean(),
    issues: z.array(
      z.object({
        ruleId: z.string().optional(),
        code: z.string().optional(),
        severity: z.enum(['error', 'warning']).optional(),
        path: z.string().optional(),
        message: z.string(),
      }),
    ),
  }),
  runtime: z.object({
    configured: z.boolean(),
    resolvedRuleCount: z.number(),
    unresolved: z.array(
      z.object({
        ruleId: z.string(),
        reason: z.string(),
      }),
    ),
    resolvedSourceRules: z.array(ProfileInspectorResolvedSourceRuleSchema),
  }),
  projection: z.object({
    readMode: z.enum(['projection', 'empty']),
    currentRun: ProfileInspectorProjectionRunSchema.nullable(),
    latestRun: ProfileInspectorProjectionRunSchema.nullable(),
    counts: ProfileInspectorFactCountsSchema,
    job: ProfileInspectorProjectionJobSchema.nullable(),
    matchCounts: ProfileInspectorMatchCountsSchema,
  }),
  rules: z.object({
    sourceRules: z.array(ProfileInspectorRecordSchema),
    deliveryUnitRules: z.array(ProfileInspectorRecordSchema),
    artifactRules: z.array(ProfileInspectorRecordSchema),
    capabilityRules: z.array(ProfileInspectorRecordSchema),
    errorRules: z.array(ProfileInspectorRecordSchema),
    attributionPolicy: ProfileInspectorRecordSchema,
  }),
});
export type ProfileInspectorResponse = z.infer<typeof ProfileInspectorResponseSchema>;

// ── 总览 ─────────────────────────────────────────────────────────────────────

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

// ── 异常分析 ─────────────────────────────────────────────────────────────────

export const ProfileErrorCategoryContractSchema = z.enum([
  'knowledge_read_failed',
  'process_doc_access_failed',
  'code_operation_failed',
  'tool_execution_failed',
  'model_or_api_failed',
]);
export type ProfileErrorCategoryContract = z.infer<typeof ProfileErrorCategoryContractSchema>;

export const ProfileErrorSeverityContractSchema = z.enum(['error', 'warning', 'info']);
export type ProfileErrorSeverityContract = z.infer<typeof ProfileErrorSeverityContractSchema>;

export const ProfileErrorOverviewQuerySchema = TimeRangeQuerySchema.extend({
  category: ProfileErrorCategoryContractSchema.optional(),
  reasonCode: z.string().trim().max(128).optional(),
});
export type ProfileErrorOverviewQuery = z.infer<typeof ProfileErrorOverviewQuerySchema>;

export const ProfileErrorListQuerySchema = TimeRangeQuerySchema.extend({
  category: ProfileErrorCategoryContractSchema.optional(),
  severity: ProfileErrorSeverityContractSchema.optional(),
  reasonCode: z.string().trim().max(128).optional(),
  toolName: z.string().trim().max(128).optional(),
  errorType: z.string().trim().max(128).optional(),
  userId: IdSchema.optional(),
  deliveryUnitId: IdSchema.optional(),
  keyword: z.string().trim().max(200).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
});
export type ProfileErrorListQuery = z.infer<typeof ProfileErrorListQuerySchema>;

export const ProfileErrorKpisSchema = z.object({
  totalCount: z.number(),
  knowledgeReadFailedCount: z.number(),
  toolExecutionFailedCount: z.number(),
  affectedUserCount: z.number(),
  affectedInteractionCount: z.number(),
  latestAt: ISODateTimeSchema.nullable(),
});
export type ProfileErrorKpis = z.infer<typeof ProfileErrorKpisSchema>;

export const ProfileErrorCategorySummarySchema = z.object({
  category: ProfileErrorCategoryContractSchema,
  displayName: z.string(),
  severity: ProfileErrorSeverityContractSchema,
  count: z.number(),
  affectedUserCount: z.number(),
  affectedInteractionCount: z.number(),
  affectedDeliveryUnitCount: z.number(),
  latestAt: ISODateTimeSchema.nullable(),
});
export type ProfileErrorCategorySummary = z.infer<typeof ProfileErrorCategorySummarySchema>;

export const ProfileErrorKnowledgeDiagnosticSchema = z.object({
  reasonCode: z.string(),
  displayName: z.string(),
  description: z.string().nullable(),
  count: z.number(),
  affectedUserCount: z.number(),
  affectedInteractionCount: z.number(),
  affectedDeliveryUnitCount: z.number(),
  latestAt: ISODateTimeSchema.nullable(),
  sampleLocator: z.string().nullable(),
});
export type ProfileErrorKnowledgeDiagnostic = z.infer<typeof ProfileErrorKnowledgeDiagnosticSchema>;

export const ProfileErrorOverviewResponseSchema = z.object({
  kpis: ProfileErrorKpisSchema,
  categories: z.array(ProfileErrorCategorySummarySchema),
  knowledgeDiagnostics: z.array(ProfileErrorKnowledgeDiagnosticSchema),
});
export type ProfileErrorOverviewResponse = z.infer<typeof ProfileErrorOverviewResponseSchema>;

export const ProfileErrorItemSchema = z.object({
  id: IdSchema,
  category: ProfileErrorCategoryContractSchema,
  displayName: z.string(),
  severity: ProfileErrorSeverityContractSchema,
  sourceKind: z.enum(['tool_call', 'sdd_error']),
  sourceScope: z.string().nullable(),
  sourceCategory: z.string().nullable(),
  userId: IdSchema.nullable(),
  userName: z.string().nullable(),
  interactionId: IdSchema.nullable(),
  deliveryUnitId: IdSchema.nullable(),
  deliveryUnitTitle: z.string().nullable(),
  capabilityUsageId: IdSchema.nullable(),
  toolCallId: IdSchema.nullable(),
  sddErrorId: IdSchema.nullable(),
  eventId: z.string().nullable(),
  toolName: z.string().nullable(),
  errorType: z.string().nullable(),
  messagePreview: z.string().nullable(),
  inputPreview: z.string().nullable(),
  locator: z.string().nullable(),
  eventTime: ISODateTimeSchema.nullable(),
  matchedRuleId: z.string().nullable(),
  confidence: z.string().nullable(),
});
export type ProfileErrorItem = z.infer<typeof ProfileErrorItemSchema>;

export const ProfileErrorListResponseSchema = z.object({
  items: z.array(ProfileErrorItemSchema),
  total: z.number(),
  page: z.number(),
  pageSize: z.number(),
});
export type ProfileErrorListResponse = z.infer<typeof ProfileErrorListResponseSchema>;

export const ProfileErrorDetailSchema = ProfileErrorItemSchema.extend({
  sessionId: z.string().nullable(),
  promptId: z.string().nullable(),
  errorMessageHash: z.string().nullable(),
  stackPreview: z.string().nullable(),
  evidence: z.record(z.string(), z.unknown()),
});
export type ProfileErrorDetail = z.infer<typeof ProfileErrorDetailSchema>;

// ── MetricWithPrevious ────────────────────────────────────────────────────────

export const ProfileMetricWithPreviousSchema = z.object({
  current: z.number().nullable(),
  previous: z.number().nullable(),
});
export type ProfileMetricWithPrevious = z.infer<typeof ProfileMetricWithPreviousSchema>;

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
  capabilityUsageCount: z.number(),
  errorCount: z.number(),
  coverageStages: z.array(z.string()),
});
export type ProfileDemand = z.infer<typeof ProfileDemandSchema>;

export const ProfileDemandListSchema = z.array(ProfileDemandSchema);

export const ProfileDemandArtifactSchema = z.object({
  id: IdSchema,
  artifactType: z.string(),
  artifactLocator: z.string().nullable(),
  systemModule: z.string().nullable(),
  lastSeenAt: ISODateTimeSchema.nullable(),
});
export type ProfileDemandArtifact = z.infer<typeof ProfileDemandArtifactSchema>;

export const ProfileDemandDetailSchema = ProfileDemandSchema.extend({
  artifacts: z.array(ProfileDemandArtifactSchema),
  turnCount: z.number(),
  sessionCount: z.number(),
  contributorCount: z.number(),
  knowledgeRecallCount: z.number(),
});
export type ProfileDemandDetail = z.infer<typeof ProfileDemandDetailSchema>;

export const ProfileArtifactTimelineItemSchema = z.object({
  id: IdSchema,
  nodeKind: z.enum(['write', 'discussion']),
  writeKind: z.string().nullable(),
  eventTime: ISODateTimeSchema.nullable(),
  eventSequence: z.number().nullable(),
  interactionId: IdSchema.nullable(),
  capabilityCode: z.string().nullable(),
  capabilityDisplayName: z.string().nullable(),
  rawCapabilityName: z.string().nullable(),
  knowledgeRecallCount: z.number(),
  promptPreview: z.string().nullable(),
  contentPreview: z.string().nullable(),
});
export type ProfileArtifactTimelineItem = z.infer<typeof ProfileArtifactTimelineItemSchema>;

export const ProfileArtifactTimelineResponseSchema = z.object({
  items: z.array(ProfileArtifactTimelineItemSchema),
});
export type ProfileArtifactTimelineResponse = z.infer<typeof ProfileArtifactTimelineResponseSchema>;

// ── 技能分析（内部模型仍为 capability；所有 profile 对老板统一展示为「技能」）──

export const ProfileCapabilityAnalyticsQuerySchema = TimeRangeQuerySchema;
export type ProfileCapabilityAnalyticsQuery = z.infer<typeof ProfileCapabilityAnalyticsQuerySchema>;

export const ProfileCapabilityAnalyticsSchema = z.object({
  kpis: z.object({
    capabilityUsageCount: ProfileMetricWithPreviousSchema,
    activeUserCount: ProfileMetricWithPreviousSchema,
    coveredDeliveryUnitCount: ProfileMetricWithPreviousSchema,
    userTriggeredCount: ProfileMetricWithPreviousSchema,
    autoTriggeredCount: ProfileMetricWithPreviousSchema,
    multiStageDeliveryUnitCount: ProfileMetricWithPreviousSchema,
  }),
  callQuality: z.object({
    triggeredCount: z.number(),
    withPromptCount: z.number(),
    withResponseCount: z.number(),
    pairedCount: z.number(),
    promptCoverageRate: z.number().nullable(),
    responseCoverageRate: z.number().nullable(),
    pairingSuccessRate: z.number().nullable(),
  }),
  topCapabilities: z
    .array(
      z.object({
        capabilityCode: z.string(),
        displayName: z.string(),
        usageCount: z.number(),
        userCount: z.number(),
        deliveryUnitCount: z.number(),
        conversionRate: z.number().nullable(),
      }),
    )
    .max(10),
  matchHealth: z.object({
    matchedCount: z.number(),
    unmatchedCount: z.number(),
    matchRate: z.number().nullable(),
    topUnmatched: z
      .array(
        z.object({
          rawCapabilityName: z.string(),
          usageCount: z.number(),
        }),
      )
      .max(5),
  }),
  /** 当前 profile 实际读取模式。 */
  readMode: z.enum(['projection', 'empty']).optional(),
});
export type ProfileCapabilityAnalytics = z.infer<typeof ProfileCapabilityAnalyticsSchema>;

export const ProfileCapabilityTimeseriesQuerySchema = TimeRangeQuerySchema.extend({
  bucket: z.enum(['15m', '1h', '3h']).optional(),
});
export type ProfileCapabilityTimeseriesQuery = z.infer<
  typeof ProfileCapabilityTimeseriesQuerySchema
>;

export const ProfileCapabilityTimeseriesSchema = z.object({
  bucket: z.enum(['15m', '1h', '3h']),
  points: z.array(
    z.object({
      timestamp: ISODateTimeSchema,
      triggeredCount: z.number(),
      pairedCount: z.number(),
    }),
  ),
});
export type ProfileCapabilityTimeseries = z.infer<typeof ProfileCapabilityTimeseriesSchema>;

export const ProfileCapabilityUsageSummaryQuerySchema = TimeRangeQuerySchema.extend({
  capabilityCode: z.string().optional(),
  rawCapabilityName: z.string().optional(),
  status: z.string().optional(),
  matched: z.enum(['all', 'matched', 'unmatched']).default('all'),
  groupBy: z.enum(['raw', 'capability']).default('raw'),
  keyword: z.string().trim().max(200).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(20),
  limit: z.coerce.number().int().min(1).max(200).optional(),
});
export type ProfileCapabilityUsageSummaryQuery = z.infer<
  typeof ProfileCapabilityUsageSummaryQuerySchema
>;

export const ProfileCapabilityUsageSummaryItemSchema = z.object({
  capabilityCode: z.string().nullable(),
  capabilityDisplayName: z.string().nullable(),
  rawCapabilityName: z.string(),
  usageCount: z.number(),
  activeUserCount: z.number(),
  sessionCount: z.number(),
  deliveryUnitCount: z.number(),
  rawCapabilityCount: z.number().optional(),
  rawCapabilityNames: z.array(z.string()).optional(),
  userTriggeredCount: z.number().optional(),
  autoTriggeredCount: z.number().optional(),
  failedCount: z.number().optional(),
  surfaceRole: z.enum(['core', 'fallback']).optional(),
  versions: z.array(
    z.object({
      version: z.string(),
      count: z.number(),
    }),
  ),
  firstSeenAt: ISODateTimeSchema.nullable(),
  lastSeenAt: ISODateTimeSchema.nullable(),
});
export type ProfileCapabilityUsageSummaryItem = z.infer<
  typeof ProfileCapabilityUsageSummaryItemSchema
>;

export const ProfileCapabilityUsageSummaryResponseSchema = z.object({
  items: z.array(ProfileCapabilityUsageSummaryItemSchema),
  total: z.number(),
  page: z.number(),
  pageSize: z.number(),
});
export type ProfileCapabilityUsageSummaryResponse = z.infer<
  typeof ProfileCapabilityUsageSummaryResponseSchema
>;

export const ProfileCapabilityUsagesQuerySchema = TimeRangeQuerySchema.extend({
  capabilityCode: z.string().optional(),
  rawCapabilityName: z.string().optional(),
  userId: IdSchema.optional(),
  deliveryUnitId: IdSchema.optional(),
  sessionId: z.string().optional(),
  promptId: z.string().optional(),
  status: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
});
export type ProfileCapabilityUsagesQuery = z.infer<typeof ProfileCapabilityUsagesQuerySchema>;

export const ProfileCapabilityUsageItemSchema = z.object({
  id: IdSchema,
  usageKey: z.string(),
  capabilityCode: z.string().nullable(),
  capabilityDisplayName: z.string().nullable(),
  rawCapabilityName: z.string(),
  capabilitySource: z.string().nullable(),
  triggerSource: z.string().nullable().optional(),
  status: z.string(),
  userId: IdSchema.nullable(),
  interactionId: IdSchema.nullable(),
  deliveryUnitId: IdSchema.nullable(),
  sessionId: z.string().nullable(),
  promptId: z.string().nullable(),
  eventTime: ISODateTimeSchema.nullable(),
  sourceReferenceKey: z.string().nullable().optional(),
  sourceActionType: z.string().nullable().optional(),
  sourceLocator: z.string().nullable().optional(),
});
export type ProfileCapabilityUsageItem = z.infer<typeof ProfileCapabilityUsageItemSchema>;

export const ProfileCapabilityUsagesResponseSchema = z.object({
  items: z.array(ProfileCapabilityUsageItemSchema),
  total: z.number(),
  page: z.number(),
  pageSize: z.number(),
});
export type ProfileCapabilityUsagesResponse = z.infer<typeof ProfileCapabilityUsagesResponseSchema>;

// ── 用户分析 ─────────────────────────────────────────────────────────────────

export const ProfileUsersQuerySchema = TimeRangeQuerySchema.extend({
  status: z.enum(['live', 'cold', 'churn']).optional(),
  keyword: z.string().trim().max(200).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
});
export type ProfileUsersQuery = z.infer<typeof ProfileUsersQuerySchema>;

export const ProfileUserItemSchema = z.object({
  id: IdSchema,
  userKey: z.string(),
  installId: z.string().nullable(),
  displayName: z.string().nullable(),
  machineId: z.string().nullable(),
  machineName: z.string().nullable(),
  firstSeenAt: ISODateTimeSchema.nullable(),
  lastSeenAt: ISODateTimeSchema.nullable(),
  capabilityUsageCount: z.number(),
  interactionCount: z.number(),
  deliveryUnitCount: z.number(),
  capabilityStages: z.array(z.string()),
  status: z.enum(['live', 'cold', 'churn']),
  isNew: z.boolean(),
  artifactCount: z.number(),
  knowledgeRecallCount: z.number(),
  codeWriteCount: z.number(),
  codeReadCount: z.number(),
  rampDays: z.number().nullable(),
});
export type ProfileUserItem = z.infer<typeof ProfileUserItemSchema>;

export const ProfileUsersResponseSchema = z.object({
  items: z.array(ProfileUserItemSchema),
  total: z.number(),
  page: z.number(),
  pageSize: z.number(),
});
export type ProfileUsersResponse = z.infer<typeof ProfileUsersResponseSchema>;

export const ProfileUserMaturityStageSchema = z.object({
  stage: z.string(),
  firstReachedAt: ISODateTimeSchema.nullable(),
});
export type ProfileUserMaturityStage = z.infer<typeof ProfileUserMaturityStageSchema>;

export const ProfileUserMaturitySchema = z.object({
  stages: z.array(ProfileUserMaturityStageSchema),
  completionRate: z.number(),
  rampDays: z.number().nullable(),
});
export type ProfileUserMaturity = z.infer<typeof ProfileUserMaturitySchema>;

export const ProfileUserDeliveryUnitSchema = z.object({
  deliveryUnitId: IdSchema,
  title: z.string().nullable(),
  stageCodes: z.array(z.string()),
  lastActivityAt: ISODateTimeSchema.nullable(),
});
export type ProfileUserDeliveryUnit = z.infer<typeof ProfileUserDeliveryUnitSchema>;

export const ProfileUserSummarySchema = z.object({
  deliveryUnitCount: z.number(),
  artifactCount: z.number(),
  turnCount: z.number(),
  sessionCount: z.number(),
  knowledgeRecallCount: z.number(),
  codeWriteCount: z.number(),
  codeReadCount: z.number(),
});
export type ProfileUserSummary = z.infer<typeof ProfileUserSummarySchema>;

export const ProfileUserDetailSchema = z.object({
  user: ProfileUserItemSchema,
  summary: ProfileUserSummarySchema,
  maturity: ProfileUserMaturitySchema,
  deliveryUnits: z.array(ProfileUserDeliveryUnitSchema),
});
export type ProfileUserDetail = z.infer<typeof ProfileUserDetailSchema>;

export const ProfileUserActivityQuerySchema = z.object({
  range: z.enum(['24h', '7d', '30d', '90d', 'all']).default('30d'),
  limit: z.coerce.number().int().min(1).max(500).default(200),
});
export type ProfileUserActivityQuery = z.infer<typeof ProfileUserActivityQuerySchema>;

export const ProfileUserActivityCountsSchema = z.object({
  total: z.number().int().nonnegative(),
  capability: z.number().int().nonnegative(),
  knowledge: z.number().int().nonnegative(),
  code: z.number().int().nonnegative(),
  artifactWrite: z.number().int().nonnegative(),
  artifactDiscussion: z.number().int().nonnegative(),
});
export type ProfileUserActivityCounts = z.infer<typeof ProfileUserActivityCountsSchema>;

export const ProfileUserActivityItemSchema = z.object({
  id: z.string(),
  kind: z.enum(['capability', 'knowledge', 'artifact_write', 'artifact_discussion', 'code']),
  eventTime: ISODateTimeSchema.nullable(),
  interactionId: IdSchema.nullable(),
  deliveryUnitId: IdSchema.nullable(),
  artifactId: IdSchema.nullable(),
  capabilityUsageId: IdSchema.nullable(),
  capabilityCode: z.string().nullable(),
  capabilityDisplayName: z.string().nullable(),
  rawCapabilityName: z.string().nullable(),
  title: z.string(),
  detail: z.string().nullable(),
  locator: z.string().nullable(),
  activityCounts: ProfileUserActivityCountsSchema.nullable().optional(),
});
export type ProfileUserActivityItem = z.infer<typeof ProfileUserActivityItemSchema>;

export const ProfileUserActivityResponseSchema = z.object({
  items: z.array(ProfileUserActivityItemSchema),
  totalInteractions: z.number().int().nonnegative(),
  truncated: z.boolean(),
});
export type ProfileUserActivityResponse = z.infer<typeof ProfileUserActivityResponseSchema>;

// ── 单次执行快照（按 interaction 串联客观证据）──────────────────────────────

export const ProfileExecutionInteractionSchema = z.object({
  id: IdSchema,
  status: z.string(),
  userId: IdSchema.nullable(),
  sessionId: z.string().nullable(),
  promptId: z.string().nullable(),
  commandName: z.string().nullable(),
  model: z.string().nullable(),
  skillName: z.string().nullable(),
  startedAt: ISODateTimeSchema.nullable(),
  completedAt: ISODateTimeSchema.nullable(),
  durationMs: z.number().nullable(),
  promptText: z.string().nullable(),
  responseText: z.string().nullable(),
});
export type ProfileExecutionInteraction = z.infer<typeof ProfileExecutionInteractionSchema>;

export const ProfileExecutionSkillSchema = z.object({
  id: IdSchema,
  rawSkillName: z.string(),
  semanticCode: z.string().nullable(),
  displayName: z.string().nullable(),
  status: z.string(),
  observedVersion: z.string().nullable(),
  eventTime: ISODateTimeSchema.nullable(),
});
export type ProfileExecutionSkill = z.infer<typeof ProfileExecutionSkillSchema>;

export const ProfileExecutionKnowledgeAccessSchema = z.object({
  id: IdSchema,
  toolCallId: IdSchema.nullable(),
  sequence: z.number().nullable(),
  actionType: z.string(),
  sourceNamespace: z.string(),
  relativePath: z.string(),
  eventTime: ISODateTimeSchema.nullable(),
});
export type ProfileExecutionKnowledgeAccess = z.infer<typeof ProfileExecutionKnowledgeAccessSchema>;

export const ProfileExecutionKnowledgeFailureSchema = z.object({
  id: IdSchema,
  toolCallId: IdSchema.nullable(),
  sequence: z.number().nullable(),
  toolName: z.string().nullable(),
  errorType: z.string().nullable(),
  reasonCode: z.string().nullable(),
  reasonLabel: z.string().nullable(),
  reasonDescription: z.string().nullable(),
  messagePreview: z.string().nullable(),
  inputPreview: z.string().nullable(),
  locator: z.string().nullable(),
  eventTime: ISODateTimeSchema.nullable(),
});
export type ProfileExecutionKnowledgeFailure = z.infer<
  typeof ProfileExecutionKnowledgeFailureSchema
>;

export const ProfileExecutionFallbackSchema = z.object({
  capabilityUsageId: IdSchema,
  capabilityCode: z.string().nullable(),
  displayName: z.string().nullable(),
  rawCapabilityName: z.string().nullable(),
  matchedRuleId: z.string(),
  eventTime: ISODateTimeSchema.nullable(),
});
export type ProfileExecutionFallback = z.infer<typeof ProfileExecutionFallbackSchema>;

export const ProfileExecutionArtifactSchema = z.object({
  writeId: IdSchema,
  artifactId: IdSchema,
  artifactType: z.string(),
  artifactLocator: z.string().nullable(),
  writeKind: z.string().nullable(),
  contentPreview: z.string().nullable(),
  eventTime: ISODateTimeSchema.nullable(),
});
export type ProfileExecutionArtifact = z.infer<typeof ProfileExecutionArtifactSchema>;

export const ProfileExecutionToolCallSchema = z.object({
  id: IdSchema,
  toolUseId: z.string(),
  skillUsageId: IdSchema.nullable(),
  toolName: z.string(),
  sequence: z.number(),
  decision: z.string().nullable(),
  success: z.boolean().nullable(),
  durationMs: z.number().nullable(),
  resultSizeBytes: z.number().nullable(),
  errorType: z.string().nullable(),
  toolInputPreview: z.string().nullable(),
  knowledgeStatus: z.enum(['accessed', 'failed']).nullable(),
});
export type ProfileExecutionToolCall = z.infer<typeof ProfileExecutionToolCallSchema>;

export const ProfileExecutionApiErrorSchema = z.object({
  id: IdSchema,
  errorType: z.string().nullable(),
  messagePreview: z.string().nullable(),
  eventTime: ISODateTimeSchema.nullable(),
});
export type ProfileExecutionApiError = z.infer<typeof ProfileExecutionApiErrorSchema>;

export const ProfileExecutionSnapshotSchema = z.object({
  interaction: ProfileExecutionInteractionSchema,
  skills: z.array(ProfileExecutionSkillSchema),
  knowledge: z.object({
    accesses: z.array(ProfileExecutionKnowledgeAccessSchema),
    failures: z.array(ProfileExecutionKnowledgeFailureSchema),
  }),
  fallbacks: z.array(ProfileExecutionFallbackSchema),
  artifacts: z.array(ProfileExecutionArtifactSchema),
  apiErrors: z.array(ProfileExecutionApiErrorSchema),
  toolCalls: z.array(ProfileExecutionToolCallSchema),
  projection: z.object({
    ready: z.boolean(),
    servingRunCompletedAt: ISODateTimeSchema.nullable(),
  }),
  summary: z.object({
    knowledgeAccessCount: z.number().int().nonnegative(),
    knowledgeFailureCount: z.number().int().nonnegative(),
    fallbackCount: z.number().int().nonnegative(),
    artifactWriteCount: z.number().int().nonnegative(),
    apiErrorCount: z.number().int().nonnegative(),
    toolCallCount: z.number().int().nonnegative(),
  }),
});
export type ProfileExecutionSnapshot = z.infer<typeof ProfileExecutionSnapshotSchema>;

// ── 知识库分析（knowledge，产品文案叫「知识库」）─────────────────────────────

export const ProfileKnowledgeSourceSummarySchema = z.object({
  sourceNamespace: z.string(),
  label: z.string(),
  accessedDocs: z.number(),
  accessCount: z.number(),
  distinctUsers: z.number(),
});
export type ProfileKnowledgeSourceSummary = z.infer<typeof ProfileKnowledgeSourceSummarySchema>;

export const ProfileKnowledgePathDimensionSummarySchema = z.object({
  sourceNamespace: z.string(),
  pathSegment: z.string(),
  accessedDocs: z.number(),
  accessCount: z.number(),
  distinctUsers: z.number(),
  lastAccessAt: ISODateTimeSchema.nullable(),
});
export type ProfileKnowledgePathDimensionSummary = z.infer<
  typeof ProfileKnowledgePathDimensionSummarySchema
>;

export const ProfileKnowledgeOverviewResponseSchema = z.object({
  totals: z.object({
    accessedDocs: z.number(),
    accessCount: z.number(),
    distinctUsers: z.number(),
  }),
  sources: z.array(ProfileKnowledgeSourceSummarySchema),
  pathDimensions: z.array(ProfileKnowledgePathDimensionSummarySchema),
});
export type ProfileKnowledgeOverviewResponse = z.infer<
  typeof ProfileKnowledgeOverviewResponseSchema
>;

export const ProfileKnowledgeTimelineQuerySchema = TimeRangeQuerySchema.extend({
  range: z.enum(['24h', '7d', '30d', '90d', 'all']).default('7d'),
  granularity: z.enum(['day', 'hour']).optional(),
  sourceNamespace: z.string().trim().min(1).max(512).optional(),
  pathSegment: z
    .string()
    .trim()
    .min(1)
    .max(512)
    .regex(/^[^/\\]+$/)
    .optional(),
});
export type ProfileKnowledgeTimelineQuery = z.infer<typeof ProfileKnowledgeTimelineQuerySchema>;

export const ProfileKnowledgeTimelineBucketSchema = z.object({
  t: ISODateTimeSchema,
  accessCount: z.number().int().nonnegative(),
});
export type ProfileKnowledgeTimelineBucket = z.infer<typeof ProfileKnowledgeTimelineBucketSchema>;

export const ProfileKnowledgeTimelineDimensionPointSchema = z.object({
  t: ISODateTimeSchema,
  accessCount: z.number().int().nonnegative(),
});
export type ProfileKnowledgeTimelineDimensionPoint = z.infer<
  typeof ProfileKnowledgeTimelineDimensionPointSchema
>;

export const ProfileKnowledgeTimelineDimensionSchema = z.object({
  segment: z.string().min(1),
  accessCount: z.number().int().nonnegative(),
  points: z.array(ProfileKnowledgeTimelineDimensionPointSchema),
});
export type ProfileKnowledgeTimelineDimension = z.infer<
  typeof ProfileKnowledgeTimelineDimensionSchema
>;

export const ProfileKnowledgeTimelineResponseSchema = z.object({
  buckets: z.array(ProfileKnowledgeTimelineBucketSchema),
  dimensions: z.array(ProfileKnowledgeTimelineDimensionSchema),
});
export type ProfileKnowledgeTimelineResponse = z.infer<
  typeof ProfileKnowledgeTimelineResponseSchema
>;

export const ProfileKnowledgeListQuerySchema = TimeRangeQuerySchema.extend({
  range: z.enum(['24h', '7d', '30d', '90d', 'all']).default('7d'),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
  deliveryUnitId: IdSchema.optional(),
  userId: IdSchema.optional(),
  capabilityUsageId: IdSchema.optional(),
});
export type ProfileKnowledgeListQuery = z.infer<typeof ProfileKnowledgeListQuerySchema>;

export const ProfileKnowledgeAccessItemSchema = z.object({
  id: IdSchema,
  toolCallId: IdSchema.nullable(),
  interactionId: IdSchema.nullable(),
  capabilityUsageId: IdSchema.nullable(),
  deliveryUnitId: IdSchema.nullable(),
  userId: IdSchema.nullable(),
  userName: z.string().nullable(),
  actionType: z.string(),
  rawLocator: z.string().nullable(),
  knowledgeRelativePath: z.string().nullable(),
  eventSequence: z.number().nullable(),
  eventTime: ISODateTimeSchema.nullable(),
});
export type ProfileKnowledgeAccessItem = z.infer<typeof ProfileKnowledgeAccessItemSchema>;

export const ProfileKnowledgeAccessListResponseSchema = z.object({
  items: z.array(ProfileKnowledgeAccessItemSchema),
  total: z.number(),
});
export type ProfileKnowledgeAccessListResponse = z.infer<
  typeof ProfileKnowledgeAccessListResponseSchema
>;

export const ProfileKnowledgeDeliveryUnitRankingItemSchema = z.object({
  deliveryUnitId: IdSchema,
  unitSlug: z.string().nullable(),
  businessDomain: z.string().nullable(),
  accessCount: z.number(),
  userCount: z.number(),
});
export type ProfileKnowledgeDeliveryUnitRankingItem = z.infer<
  typeof ProfileKnowledgeDeliveryUnitRankingItemSchema
>;

export const ProfileKnowledgeDeliveryUnitRankingQuerySchema = TimeRangeQuerySchema.extend({
  range: z.enum(['24h', '7d', '30d', '90d', 'all']).default('7d'),
  sourceNamespace: z.string().trim().min(1).max(512).optional(),
  pathSegment: z
    .string()
    .trim()
    .min(1)
    .max(512)
    .regex(/^[^/\\]+$/)
    .optional(),
  userId: IdSchema.optional(),
});
export type ProfileKnowledgeDeliveryUnitRankingQuery = z.infer<
  typeof ProfileKnowledgeDeliveryUnitRankingQuerySchema
>;

export const ProfileKnowledgeDeliveryUnitRankingResponseSchema = z.object({
  items: z.array(ProfileKnowledgeDeliveryUnitRankingItemSchema),
  total: z.number(),
});
export type ProfileKnowledgeDeliveryUnitRankingResponse = z.infer<
  typeof ProfileKnowledgeDeliveryUnitRankingResponseSchema
>;

export const ProfileKnowledgePathDimensionDocSchema = z.object({
  relativePath: z.string(),
  accessCount: z.number(),
  distinctUsers: z.number(),
  lastAccessAt: ISODateTimeSchema.nullable(),
  firstAccessAt: ISODateTimeSchema.nullable(),
});
export type ProfileKnowledgePathDimensionDoc = z.infer<
  typeof ProfileKnowledgePathDimensionDocSchema
>;

export const ProfileKnowledgePathDimensionDocsResponseSchema = z.object({
  sourceNamespace: z.string(),
  pathSegment: z.string(),
  items: z.array(ProfileKnowledgePathDimensionDocSchema),
});
export type ProfileKnowledgePathDimensionDocsResponse = z.infer<
  typeof ProfileKnowledgePathDimensionDocsResponseSchema
>;

export const ProfileKnowledgeDocDetailResponseSchema = z.object({
  sourceNamespace: z.string(),
  relativePath: z.string(),
  trend: z.array(z.object({ t: ISODateTimeSchema, accessCount: z.number() })),
  readers: z.array(
    z.object({
      userId: IdSchema,
      userName: z.string().nullable(),
      accessCount: z.number(),
      lastAccessAt: ISODateTimeSchema.nullable(),
    }),
  ),
  sourceDeliveryUnits: z.array(
    z.object({
      deliveryUnitId: IdSchema,
      unitSlug: z.string().nullable(),
      businessDomain: z.string().nullable(),
      accessCount: z.number(),
    }),
  ),
});
export type ProfileKnowledgeDocDetailResponse = z.infer<
  typeof ProfileKnowledgeDocDetailResponseSchema
>;

export const ProfileKnowledgeContentSchema = z.object({
  found: z.boolean(),
  reason: z.enum([
    'ok',
    'recall_not_found',
    'not_readable_action',
    'not_configured',
    'repo_missing',
    'file_missing',
    'not_a_file',
  ]),
  sourceNamespace: z.string().nullable(),
  relativePath: z.string().nullable(),
  rawPath: z.string().nullable(),
  isMarkdown: z.boolean(),
  content: z.string().nullable(),
  truncated: z.boolean(),
});
export type ProfileKnowledgeContent = z.infer<typeof ProfileKnowledgeContentSchema>;
