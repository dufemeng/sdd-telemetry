import { describe, expect, it } from 'vitest';
import {
  buildSddSkillConfig,
  DEFAULT_PROFILE_ERROR_RULES,
  validateProfileConfig,
  type SddSemanticInput,
  type WorkflowProfileConfig,
} from '@sdd-telemetry/api';

const semantics: SddSemanticInput[] = [
  { semanticCode: 'design', displayName: '设计', artifactFilenamePatterns: ['design.md', 'design-*.md'], skillNames: ['bk-fe-design', 'bk-fe:design'] },
  { semanticCode: 'help', displayName: '帮助', artifactFilenamePatterns: [], skillNames: ['bk-fe-help'] },
  { semanticCode: 'no-alias', displayName: 'x', artifactFilenamePatterns: [], skillNames: [] },
];

describe('buildSddSkillConfig (§10 skill→config)', () => {
  const cfg = buildSddSkillConfig(semantics);

  it('emits one SkillSourceRule + one capabilityRule per semantic with aliases', () => {
    expect(cfg.sourceRules).toHaveLength(2);
    expect(cfg.capabilityRules).toHaveLength(2);
    const design = cfg.sourceRules.find((r) => r.ruleId === 'skill-design');
    expect(design?.locatorType).toBe('skill');
    expect(design?.skillNames).toEqual(['bk-fe-design', 'bk-fe:design']);
    expect(design?.actions).toEqual(['invoke']);
  });

  it('collects artifact typePatterns only when patterns exist', () => {
    expect(cfg.artifactTypePatterns).toEqual([{ artifactType: 'design', include: ['design.md', 'design-*.md'] }]);
  });

  it('skips semantics with no skill aliases', () => {
    expect(cfg.sourceRules.some((r) => r.ruleId === 'skill-no-alias')).toBe(false);
  });

  it('produces rules that pass validateProfileConfig', () => {
    const config: WorkflowProfileConfig = {
      profileId: 'sdd-default', displayName: 'x', status: 'active', projectionMode: 'source_backed',
      manifest: { capabilityUsage: true, deliveryUnits: true, artifacts: true, artifactTimeline: true, knowledgeRecalls: true, codeChanges: false, errors: false, evaluation: false, alerts: false },
      sourceRules: cfg.sourceRules, deliveryUnitRules: [], artifactRules: [], capabilityRules: cfg.capabilityRules,
      errorRules: DEFAULT_PROFILE_ERROR_RULES,
      attributionPolicy: { anchorCategories: [], anchorActions: [], sameInteraction: { enabled: false, preferActions: [] }, sameSessionWindow: { enabled: false, minutes: 0, requireSameUser: true, preferActions: [] } },
      presentation: { workflowKind: 'sdd', maturityStages: [], artifactStageOrder: [], hiddenMetrics: [], knowledgeCoverageMode: 'filesystem_scan' },
    };
    expect(validateProfileConfig(config).valid).toBe(true);
  });
});
