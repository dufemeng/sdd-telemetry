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
  knowledgeCoverage: z.enum(['filesystem_scan', 'recall_facts']),
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
  knowledgeCoverageMode: z.enum(['filesystem_scan', 'recall_facts']),
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
  runType: z.string(),
  status: z.string(),
  startedAt: ISODateTimeSchema.nullable(),
  completedAt: ISODateTimeSchema.nullable(),
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
  knowledgeRecalls: z.number(),
  codeActivities: z.number(),
});
export type ProfileInspectorFactCounts = z.infer<typeof ProfileInspectorFactCountsSchema>;

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
export type ProfileInspectorResolvedSourceRule = z.infer<typeof ProfileInspectorResolvedSourceRuleSchema>;

export const ProfileInspectorResponseSchema = z.object({
  profile: z.object({
    profileId: z.string(),
    displayName: z.string(),
    status: ProfileStatusSchema,
    projectionMode: z.enum(['sdd_bridge', 'source_backed']),
    readSource: z.enum(['legacy_sdd', 'profile_projection']),
    manifest: ProfileCapabilityManifestSchema,
    presentation: ProfilePresentationSchema,
  }),
  validation: z.object({
    valid: z.boolean(),
    issues: z.array(z.object({
      ruleId: z.string().optional(),
      message: z.string(),
    })),
  }),
  runtime: z.object({
    configured: z.boolean(),
    resolvedRuleCount: z.number(),
    unresolved: z.array(z.object({
      ruleId: z.string(),
      reason: z.string(),
    })),
    resolvedSourceRules: z.array(ProfileInspectorResolvedSourceRuleSchema),
  }),
  projection: z.object({
    readMode: z.enum(['projection', 'legacy', 'empty']),
    currentRun: ProfileInspectorProjectionRunSchema.nullable(),
    latestRun: ProfileInspectorProjectionRunSchema.nullable(),
    counts: ProfileInspectorFactCountsSchema,
  }),
  rules: z.object({
    sourceRules: z.array(ProfileInspectorRecordSchema),
    deliveryUnitRules: z.array(ProfileInspectorRecordSchema),
    artifactRules: z.array(ProfileInspectorRecordSchema),
    capabilityRules: z.array(ProfileInspectorRecordSchema),
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

// ── 能力分析（capability，产品文案叫「技能分析」）─────────────────────────────

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
  status: z.string().optional(),
  matched: z.enum(['all', 'matched', 'unmatched']).default('all'),
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
  deliveryUnitId: IdSchema.optional(),
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
});
export type ProfileUserActivityResponse = z.infer<typeof ProfileUserActivityResponseSchema>;

// ── 知识库分析（knowledge，产品文案叫「知识库」）─────────────────────────────

export const ProfileKnowledgeCoverageQuerySchema = TimeRangeQuerySchema;
export type ProfileKnowledgeCoverageQuery = z.infer<typeof ProfileKnowledgeCoverageQuerySchema>;

export const ProfileKnowledgeCoverageRepoSchema = z.object({
  sourceNamespace: z.string(),
  label: z.string(),
  totalDocs: z.number(),
  recalledDocs: z.number(),
  coverageRate: z.number(),
  recalls: z.number(),
  deadDocs: z.number(),
  newUnreadDocs: z.number(),
  distinctUsers: z.number(),
});
export type ProfileKnowledgeCoverageRepo = z.infer<typeof ProfileKnowledgeCoverageRepoSchema>;

export const ProfileKnowledgeCoverageDomainSchema = z.object({
  sourceNamespace: z.string(),
  domain: z.string(),
  totalDocs: z.number(),
  recalledDocs: z.number(),
  recalls: z.number(),
  deadDocs: z.number(),
  newUnreadDocs: z.number(),
  distinctUsers: z.number(),
  lastRecallAt: ISODateTimeSchema.nullable(),
});
export type ProfileKnowledgeCoverageDomain = z.infer<
  typeof ProfileKnowledgeCoverageDomainSchema
>;

export const ProfileKnowledgeCoverageResponseSchema = z.object({
  scan: z.object({
    configured: z.boolean(),
    repos: z.array(
      z.object({
        sourceNamespace: z.string(),
        label: z.string(),
        gitRef: z.string().nullable(),
        scannedAt: ISODateTimeSchema,
      }),
    ),
  }),
  totals: z.object({
    totalDocs: z.number(),
    recalledDocs: z.number(),
    coverageRate: z.number(),
    recalls: z.number(),
    coldDocs: z.number(),
    deadDocs: z.number(),
    newUnreadDocs: z.number(),
    orphanPaths: z.number(),
  }),
  repos: z.array(ProfileKnowledgeCoverageRepoSchema),
  domains: z.array(ProfileKnowledgeCoverageDomainSchema),
});
export type ProfileKnowledgeCoverageResponse = z.infer<
  typeof ProfileKnowledgeCoverageResponseSchema
>;

export const ProfileKnowledgeTimelineQuerySchema = TimeRangeQuerySchema.extend({
  range: z.enum(['24h', '7d', '30d', '90d', 'all']).default('7d'),
  granularity: z.enum(['day', 'hour']).optional(),
  groupBy: z.enum(['domain', 'axis']).optional(),
  wikiDomain: z.string().optional(),
});
export type ProfileKnowledgeTimelineQuery = z.infer<typeof ProfileKnowledgeTimelineQuerySchema>;

export const ProfileKnowledgeTimelinePointSchema = z.object({
  t: ISODateTimeSchema,
  group: z.string().nullable(),
  count: z.number(),
});
export type ProfileKnowledgeTimelinePoint = z.infer<typeof ProfileKnowledgeTimelinePointSchema>;

export const ProfileKnowledgeTimelineResponseSchema = z.object({
  points: z.array(ProfileKnowledgeTimelinePointSchema),
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

export const ProfileKnowledgeRecallItemSchema = z.object({
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
  knowledgeDomain: z.string().nullable(),
  knowledgeAxis: z.string().nullable(),
  knowledgeSystem: z.string().nullable(),
  eventSequence: z.number().nullable(),
  eventTime: ISODateTimeSchema.nullable(),
});
export type ProfileKnowledgeRecallItem = z.infer<typeof ProfileKnowledgeRecallItemSchema>;

export const ProfileKnowledgeRecallListResponseSchema = z.object({
  items: z.array(ProfileKnowledgeRecallItemSchema),
  total: z.number(),
});
export type ProfileKnowledgeRecallListResponse = z.infer<
  typeof ProfileKnowledgeRecallListResponseSchema
>;

export const ProfileKnowledgeDeliveryUnitRankingItemSchema = z.object({
  deliveryUnitId: IdSchema,
  unitSlug: z.string().nullable(),
  businessDomain: z.string().nullable(),
  totalRecalls: z.number(),
  distinctDomains: z.number(),
  distinctSystems: z.number(),
  userCount: z.number(),
});
export type ProfileKnowledgeDeliveryUnitRankingItem = z.infer<
  typeof ProfileKnowledgeDeliveryUnitRankingItemSchema
>;

export const ProfileKnowledgeDeliveryUnitRankingQuerySchema = TimeRangeQuerySchema.extend({
  range: z.enum(['24h', '7d', '30d', '90d', 'all']).default('7d'),
  wikiDomain: z.string().optional(),
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

export const ProfileKnowledgeDomainDocSchema = z.object({
  relativePath: z.string(),
  recallCount: z.number(),
  distinctUsers: z.number(),
  lastRecallAt: ISODateTimeSchema.nullable(),
  status: z.enum(['hot', 'cold', 'dead', 'new']),
  addedAt: ISODateTimeSchema.nullable(),
});
export type ProfileKnowledgeDomainDoc = z.infer<typeof ProfileKnowledgeDomainDocSchema>;

export const ProfileKnowledgeDomainDocsResponseSchema = z.object({
  sourceNamespace: z.string(),
  domain: z.string(),
  items: z.array(ProfileKnowledgeDomainDocSchema),
});
export type ProfileKnowledgeDomainDocsResponse = z.infer<
  typeof ProfileKnowledgeDomainDocsResponseSchema
>;

export const ProfileKnowledgeDocDetailResponseSchema = z.object({
  sourceNamespace: z.string(),
  relativePath: z.string(),
  trend: z.array(z.object({ t: ISODateTimeSchema, count: z.number() })),
  readers: z.array(
    z.object({
      userId: IdSchema,
      userName: z.string().nullable(),
      recallCount: z.number(),
      lastRecallAt: ISODateTimeSchema.nullable(),
    }),
  ),
  sourceDeliveryUnits: z.array(
    z.object({
      deliveryUnitId: IdSchema,
      unitSlug: z.string().nullable(),
      businessDomain: z.string().nullable(),
      recallCount: z.number(),
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
