import { describe, expect, it } from 'vitest';
import {
  normalizePromptForDedup,
  computeItemKey,
  resolveTargetSkill,
  mapArtifactType,
  previewPrompt,
} from '../src/modules/eval/eval-item-domain';
import type { WorkflowProfileConfig } from '@sdd-telemetry/api';

function configFixture(): WorkflowProfileConfig {
  // 只填 resolveTargetSkill 需要的字段;完整 fixture 由 integration test 覆盖。
  return {
    profileId: 'sdd-default',
    displayName: 'SDD',
    status: 'active',
    projectionMode: 'source_backed',
    manifest: { capabilityUsage: true, deliveryUnits: true, artifacts: true, artifactTimeline: true, knowledgeRecalls: true, codeChanges: true, errors: true, evaluation: true, alerts: false },
    sourceRules: [
      { ruleId: 'skill-design', priority: 100, confidence: 'high', enabled: true, category: 'skill', actions: ['invoke'], locatorType: 'skill', skillNames: ['bk-fe-design', 'bk-fe:design'] },
      { ruleId: 'skill-other', priority: 1, confidence: 'low', enabled: true, category: 'skill', actions: ['invoke'], locatorType: 'skill', skillNames: ['*'] },
    ],
    capabilityRules: [
      { ruleId: 'cap-design', sourceRuleIds: ['skill-design'], actions: ['invoke'], capabilityCode: 'design', displayName: '设计', surfaceRole: 'core' },
      { ruleId: 'cap-other', sourceRuleIds: ['skill-other'], actions: ['invoke'], capabilityCode: 'other-skill', displayName: '其他', surfaceRole: 'fallback' },
    ],
    deliveryUnitRules: [],
    artifactRules: [],
    errorRules: [],
    attributionPolicy: { anchorCategories: ['process_doc'], anchorActions: ['read'], sameInteraction: { enabled: false, preferActions: [] }, sameSessionWindow: { enabled: false, minutes: 0, requireSameUser: false, preferActions: [] } },
    presentation: { workflowKind: 'sdd', maturityStages: [], artifactStageOrder: [], hiddenMetrics: [] },
  };
}

describe('normalizePromptForDedup', () => {
  it('does NFC + CRLF/CR->LF + edge trim, keeps internal whitespace/indent', () => {
    expect(normalizePromptForDedup('  hello\r\n  world\r')).toBe('hello\n  world');
  });
  it('keeps internal blank lines and code indentation', () => {
    const p = 'line1\n\n  indented\nline3';
    expect(normalizePromptForDedup(p)).toBe(p);
  });
});

describe('computeItemKey', () => {
  it('is stable sha256 of structured JSON array', () => {
    const k = computeItemKey({ profileId: 'sdd-default', targetSkill: 'bk-fe-design', targetArtifactType: 'design', normalizedPrompt: 'hi' });
    expect(k).toMatch(/^[0-9a-f]{64}$/);
    // same logical sample => same key regardless of source
    expect(computeItemKey({ profileId: 'sdd-default', targetSkill: 'bk-fe-design', targetArtifactType: 'design', normalizedPrompt: 'hi' })).toBe(k);
  });
  it('null target skill / artifact type normalize to empty string in key', () => {
    const a = computeItemKey({ profileId: 'p', targetSkill: null, targetArtifactType: null, normalizedPrompt: 'x' });
    const b = computeItemKey({ profileId: 'p', targetSkill: '', targetArtifactType: '', normalizedPrompt: 'x' });
    expect(a).toBe(b);
  });
  it('different profile => different key', () => {
    expect(computeItemKey({ profileId: 'p1', targetSkill: 's', targetArtifactType: 'design', normalizedPrompt: 'x' }))
      .not.toBe(computeItemKey({ profileId: 'p2', targetSkill: 's', targetArtifactType: 'design', normalizedPrompt: 'x' }));
  });
});

describe('resolveTargetSkill', () => {
  it('returns first skillName of skill source rule referenced by capability rule', () => {
    expect(resolveTargetSkill(configFixture(), 'design')).toBe('bk-fe-design');
  });
  it('returns null for fallback capability (surfaceRole=fallback)', () => {
    expect(resolveTargetSkill(configFixture(), 'other-skill')).toBeNull();
  });
  it('returns null when referenced skill rule uses ["*"] catch-all', () => {
    const cfg = configFixture();
    cfg.capabilityRules[1] = { ...cfg.capabilityRules[1], surfaceRole: 'core' };
    expect(resolveTargetSkill(cfg, 'other-skill')).toBeNull();
  });
  it('returns null when capability code not found', () => {
    expect(resolveTargetSkill(configFixture(), 'nope')).toBeNull();
  });
  it('returns null when referenced rule is not a skill locator', () => {
    const cfg = configFixture();
    cfg.sourceRules[0] = { ...cfg.sourceRules[0], locatorType: 'path' } as typeof cfg.sourceRules[number];
    expect(resolveTargetSkill(cfg, 'design')).toBeNull();
  });
});

describe('mapArtifactType', () => {
  it('maps design/proposal/task; null otherwise', () => {
    expect(mapArtifactType('design')).toBe('design');
    expect(mapArtifactType('proposal')).toBe('proposal');
    expect(mapArtifactType('task')).toBe('tasks');
    expect(mapArtifactType('code')).toBeNull();
  });
});

describe('previewPrompt', () => {
  it('truncates to 240 chars', () => {
    expect(previewPrompt('x'.repeat(300)).length).toBe(240);
    expect(previewPrompt('short')).toBe('short');
  });
});
