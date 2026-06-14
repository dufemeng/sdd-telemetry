import type { WorkflowProfileConfig } from './profile-types';
import { WorkflowProfileConfigSchema } from './profile-schema';

export type ValidationIssueSeverity = 'error' | 'warning';

export type ValidationIssueCode =
  | 'schema_invalid'
  | 'duplicate_source_rule_id'
  | 'path_rule_missing_matcher'
  | 'url_rule_missing_matcher'
  | 'mcp_doc_rule_missing_matcher'
  | 'skill_rule_missing_matcher'
  | 'unknown_source_rule_id'
  | 'capability_rule_missing_source';

export interface ValidationIssue {
  ruleId?: string;
  code?: ValidationIssueCode;
  severity?: ValidationIssueSeverity;
  path?: string;
  message: string;
}

export interface ValidationResult {
  valid: boolean;
  issues: ValidationIssue[];
}

export function validateProfileConfig(config: unknown): ValidationResult {
  const parsed = WorkflowProfileConfigSchema.safeParse(config);
  if (!parsed.success) {
    return {
      valid: false,
      issues: parsed.error.issues.map((issue) => ({
        code: 'schema_invalid',
        severity: 'error',
        path: issue.path.join('.'),
        message: issue.message,
      })),
    };
  }

  const profile = parsed.data as WorkflowProfileConfig;
  const issues: ValidationIssue[] = [];
  const sourceRuleIds = new Set<string>();

  for (const rule of profile.sourceRules) {
    if (sourceRuleIds.has(rule.ruleId)) {
      issues.push({
        ruleId: rule.ruleId,
        code: 'duplicate_source_rule_id',
        severity: 'error',
        path: 'sourceRules',
        message: 'duplicate sourceRule ruleId',
      });
    }
    sourceRuleIds.add(rule.ruleId);

    if (!rule.enabled) continue;
    if (rule.locatorType === 'path') {
      const hasRoot = Boolean(rule.rootEnv) || Boolean(rule.rootPath) || (Boolean(rule.fallbackBaseEnv) && Boolean(rule.relativeRoot)) || Boolean(rule.userRootKey);
      const hasFuzzyMatcher = hasItems(rule.pathContains) || hasItems(rule.pathRegexes);
      if (!hasRoot && !hasFuzzyMatcher) {
        issues.push({
          ruleId: rule.ruleId,
          code: 'path_rule_missing_matcher',
          severity: 'error',
          path: `sourceRules.${rule.ruleId}`,
          message: 'path rule needs rootEnv, rootPath, fallbackBaseEnv + relativeRoot, userRootKey, pathContains, or pathRegexes',
        });
      }
    } else if (rule.locatorType === 'url') {
      if (!hasItems(rule.urlPrefixes) && !hasItems(rule.urlRegexes)) {
        issues.push({
          ruleId: rule.ruleId,
          code: 'url_rule_missing_matcher',
          severity: 'error',
          path: `sourceRules.${rule.ruleId}`,
          message: 'url rule needs urlPrefixes or urlRegexes',
        });
      }
    } else if (rule.locatorType === 'mcp_doc') {
      if (!hasItems(rule.docIdPatterns) && !hasItems(rule.collectionIds) && !hasItems(rule.urlPrefixes) && !hasItems(rule.docTypes)) {
        issues.push({
          ruleId: rule.ruleId,
          code: 'mcp_doc_rule_missing_matcher',
          severity: 'error',
          path: `sourceRules.${rule.ruleId}`,
          message: 'mcp_doc rule needs at least one of docIdPatterns / collectionIds / urlPrefixes / docTypes (mcpServer alone is not enough)',
        });
      }
    } else if (rule.locatorType === 'skill') {
      if (!hasItems(rule.skillNames)) {
        issues.push({
          ruleId: rule.ruleId,
          code: 'skill_rule_missing_matcher',
          severity: 'error',
          path: `sourceRules.${rule.ruleId}`,
          message: 'skill rule needs at least one skillNames entry',
        });
      }
    }
  }

  for (const rule of profile.deliveryUnitRules) {
    for (const id of rule.sourceRuleIds) {
      if (!sourceRuleIds.has(id)) {
        issues.push({
          ruleId: rule.ruleId,
          code: 'unknown_source_rule_id',
          severity: 'error',
          path: `deliveryUnitRules.${rule.ruleId}.sourceRuleIds`,
          message: `deliveryUnitRule references unknown sourceRuleId: ${id}`,
        });
      }
    }
  }
  for (const rule of profile.artifactRules) {
    for (const id of rule.sourceRuleIds) {
      if (!sourceRuleIds.has(id)) {
        issues.push({
          ruleId: rule.ruleId,
          code: 'unknown_source_rule_id',
          severity: 'error',
          path: `artifactRules.${rule.ruleId}.sourceRuleIds`,
          message: `artifactRule references unknown sourceRuleId: ${id}`,
        });
      }
    }
  }
  for (const rule of profile.capabilityRules) {
    if (!hasItems(rule.sourceRuleIds) && !hasItems(rule.sourceCategories)) {
      issues.push({
        ruleId: rule.ruleId,
        code: 'capability_rule_missing_source',
        severity: 'error',
        path: `capabilityRules.${rule.ruleId}`,
        message: 'capabilityRule needs sourceRuleIds or sourceCategories',
      });
    }
    for (const id of rule.sourceRuleIds ?? []) {
      if (!sourceRuleIds.has(id)) {
        issues.push({
          ruleId: rule.ruleId,
          code: 'unknown_source_rule_id',
          severity: 'error',
          path: `capabilityRules.${rule.ruleId}.sourceRuleIds`,
          message: `capabilityRule references unknown sourceRuleId: ${id}`,
        });
      }
    }
  }

  return { valid: issues.length === 0, issues };
}

function hasItems(value: unknown[] | undefined): boolean {
  return Array.isArray(value) && value.length > 0;
}
