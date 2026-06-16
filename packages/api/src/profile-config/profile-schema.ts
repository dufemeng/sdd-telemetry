import { z } from 'zod';
import {
  ProfileCapabilityManifestSchema,
  ProfilePresentationSchema,
  ProfileStatusSchema,
} from '../contracts/profile.contract';
import { DEFAULT_PROFILE_ERROR_RULES } from './profile-types';

export const ProfileRuleConfidenceSchema = z.enum(['high', 'medium', 'low']);
export const SourceActionSchema = z.enum(['read', 'grep', 'glob', 'write', 'edit', 'update', 'delete', 'invoke']);
export const SourceCategorySchema = z.enum(['process_doc', 'knowledge', 'code', 'unknown', 'skill']);
export const UserRootKeySchema = z.enum(['wiki', 'requirements']);
export const ProjectionModeSchema = z.enum(['sdd_bridge', 'source_backed']);
export const ProfileErrorCategorySchema = z.enum([
  'knowledge_read_failed',
  'process_doc_access_failed',
  'code_operation_failed',
  'tool_execution_failed',
  'model_or_api_failed',
]);
export const ProfileErrorSeveritySchema = z.enum(['error', 'warning', 'info']);
export const ProfileErrorFailureSourceSchema = z.enum(['tool_call', 'sdd_error']);
export const ProfileErrorSourceScopeSchema = z.enum(['matched', 'unmatched', 'profile_interaction']);

const SourceRuleBaseSchema = z.object({
  ruleId: z.string().trim().min(1),
  priority: z.number().int(),
  confidence: ProfileRuleConfidenceSchema,
  enabled: z.boolean(),
  category: SourceCategorySchema,
  actions: z.array(SourceActionSchema),
  description: z.string().optional(),
});

export const LocalPathSourceRuleSchema = SourceRuleBaseSchema.extend({
  locatorType: z.literal('path'),
  rootEnv: z.string().trim().min(1).optional(),
  rootPath: z.string().trim().min(1).optional(),
  fallbackBaseEnv: z.string().trim().min(1).optional(),
  relativeRoot: z.string().optional(),
  pathContains: z.array(z.string()).optional(),
  pathRegexes: z.array(z.string()).optional(),
  includeGlobs: z.array(z.string()).optional(),
  excludeGlobs: z.array(z.string()).optional(),
  userRootKey: UserRootKeySchema.optional(),
  excludeUserRootKeys: z.array(UserRootKeySchema).optional(),
});

export const UrlSourceRuleSchema = SourceRuleBaseSchema.extend({
  locatorType: z.literal('url'),
  urlPrefixes: z.array(z.string()).optional(),
  urlRegexes: z.array(z.string()).optional(),
  resourceIdCapture: z.string().optional(),
  deny: z.object({
    urlPrefixes: z.array(z.string()).optional(),
    urlRegexes: z.array(z.string()).optional(),
    docTypes: z.array(z.string()).optional(),
  }).optional(),
});

export const McpDocSourceRuleSchema = SourceRuleBaseSchema.extend({
  locatorType: z.literal('mcp_doc'),
  mcpServers: z.array(z.string()).optional(),
  toolNames: z.array(z.string()).optional(),
  urlPrefixes: z.array(z.string()).optional(),
  docIdPatterns: z.array(z.string()).optional(),
  spaceIds: z.array(z.string()).optional(),
  collectionIds: z.array(z.string()).optional(),
  docTypes: z.array(z.string()).optional(),
  deny: z.object({
    urlPrefixes: z.array(z.string()).optional(),
    docTypes: z.array(z.string()).optional(),
    titlePatterns: z.array(z.string()).optional(),
  }).optional(),
});

export const SkillSourceRuleSchema = SourceRuleBaseSchema.extend({
  locatorType: z.literal('skill'),
  skillNames: z.array(z.string().trim().min(1)),
});

export const SourceRuleSchema = z.discriminatedUnion('locatorType', [
  LocalPathSourceRuleSchema,
  UrlSourceRuleSchema,
  McpDocSourceRuleSchema,
  SkillSourceRuleSchema,
]);

export const DeliveryUnitLocatorStrategySchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('path_segment'),
    stripExtensions: z.boolean(),
    domainSegment: z.number().int().nonnegative().optional(),
    unitSegment: z.number().int().nonnegative(),
  }),
  z.object({
    kind: z.literal('parent_dir'),
    stripExtensions: z.boolean(),
  }),
  z.object({ kind: z.literal('url_resource_id') }),
  z.object({ kind: z.literal('mcp_doc_id') }),
]);

export const DeliveryUnitRuleSchema = z.object({
  ruleId: z.string().trim().min(1),
  sourceRuleIds: z.array(z.string().trim().min(1)),
  locatorStrategy: DeliveryUnitLocatorStrategySchema,
  titleStrategy: z.enum(['unit_slug', 'file_name', 'doc_title', 'none']).optional(),
});

export const ArtifactRuleSchema = z.object({
  ruleId: z.string().trim().min(1),
  sourceRuleIds: z.array(z.string().trim().min(1)),
  typePatterns: z.array(z.object({
    artifactType: z.string().trim().min(1),
    include: z.array(z.string()),
  })),
  defaultArtifactType: z.string().trim().min(1),
});

export const CapabilityRuleSchema = z.object({
  ruleId: z.string().trim().min(1),
  sourceRuleIds: z.array(z.string().trim().min(1)).optional(),
  sourceCategories: z.array(SourceCategorySchema).optional(),
  actions: z.array(SourceActionSchema),
  capabilityCode: z.string().trim().min(1),
  displayName: z.string().trim().min(1),
  triggerSource: z.string().nullable().optional(),
});

export const ProfileErrorRuleSchema = z.object({
  ruleId: z.string().trim().min(1),
  category: ProfileErrorCategorySchema,
  displayName: z.string().trim().min(1),
  enabled: z.boolean(),
  severity: ProfileErrorSeveritySchema,
  failureSources: z.array(ProfileErrorFailureSourceSchema).min(1),
  sourceCategories: z.array(SourceCategorySchema).optional(),
  sourceScope: ProfileErrorSourceScopeSchema,
  includeToolNames: z.array(z.string().trim().min(1)).optional(),
  excludeToolNames: z.array(z.string().trim().min(1)).optional(),
  includeErrorTypes: z.array(z.string().trim().min(1)).optional(),
  excludeErrorTypes: z.array(z.string().trim().min(1)).optional(),
  reasonGroups: z.array(z.object({
    reasonCode: z.string().trim().min(1),
    displayName: z.string().trim().min(1),
    description: z.string().trim().min(1).optional(),
    matchErrorTypes: z.array(z.string().trim().min(1)).optional(),
    matchToolNames: z.array(z.string().trim().min(1)).optional(),
    locatorIncludes: z.array(z.string().trim().min(1)).optional(),
    messageIncludes: z.array(z.string().trim().min(1)).optional(),
    inputIncludes: z.array(z.string().trim().min(1)).optional(),
    isFallback: z.boolean().optional(),
  })).optional(),
});

export const AttributionPolicySchema = z.object({
  anchorCategories: z.array(SourceCategorySchema),
  anchorActions: z.array(SourceActionSchema),
  sameInteraction: z.object({
    enabled: z.boolean(),
    preferActions: z.array(SourceActionSchema),
  }),
  sameSessionWindow: z.object({
    enabled: z.boolean(),
    minutes: z.number().nonnegative(),
    requireSameUser: z.boolean(),
    preferActions: z.array(SourceActionSchema),
  }),
});

export const WorkflowProfileConfigSchema = z.object({
  profileId: z.string().trim().min(1),
  displayName: z.string().trim().min(1),
  status: ProfileStatusSchema,
  projectionMode: ProjectionModeSchema,
  manifest: ProfileCapabilityManifestSchema,
  sourceRules: z.array(SourceRuleSchema),
  deliveryUnitRules: z.array(DeliveryUnitRuleSchema),
  artifactRules: z.array(ArtifactRuleSchema),
  capabilityRules: z.array(CapabilityRuleSchema),
  errorRules: z.array(ProfileErrorRuleSchema).default(DEFAULT_PROFILE_ERROR_RULES),
  attributionPolicy: AttributionPolicySchema,
  presentation: ProfilePresentationSchema,
});
