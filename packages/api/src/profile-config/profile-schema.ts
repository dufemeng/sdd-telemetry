import { z } from 'zod';
import {
  ProfileCapabilityManifestSchema,
  ProfilePresentationSchema,
  ProfileStatusSchema,
} from '../contracts/profile.contract';

export const ProfileRuleConfidenceSchema = z.enum(['high', 'medium', 'low']);
export const SourceActionSchema = z.enum(['read', 'grep', 'glob', 'write', 'edit', 'update', 'delete']);
export const SourceCategorySchema = z.enum(['process_doc', 'knowledge', 'code', 'unknown']);
export const ProjectionModeSchema = z.enum(['sdd_bridge', 'source_backed']);

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

export const SourceRuleSchema = z.discriminatedUnion('locatorType', [
  LocalPathSourceRuleSchema,
  UrlSourceRuleSchema,
  McpDocSourceRuleSchema,
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
  attributionPolicy: AttributionPolicySchema,
  presentation: ProfilePresentationSchema,
});
