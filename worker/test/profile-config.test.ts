import { describe, expect, it, vi } from 'vitest';
import {
  E2E_MONOREPO_PROFILE_ID,
  ONLINE_DOCS_PROFILE_ID,
  ProfileConfigCatalog,
  SDD_DEFAULT_PROFILE_ID,
  WorkflowProfileConfigSchema,
  getProfileConfig,
  resolveRuntimeProfileConfig,
  validateProfileConfig,
  type WorkflowProfileConfig,
} from '@sdd-telemetry/api';

const e2eMonorepo = getProfileConfig(E2E_MONOREPO_PROFILE_ID)!;
const sdd = getProfileConfig(SDD_DEFAULT_PROFILE_ID)!;
const onlineDocs = getProfileConfig(ONLINE_DOCS_PROFILE_ID)!;

describe('profile config projectionMode + shipped configs', () => {
  it('sdd-default is sdd_bridge', () => {
    expect(sdd.projectionMode).toBe('sdd_bridge');
  });

  it('e2e-monorepo is source_backed with process doc, knowledge, and implementation code rules', () => {
    expect(e2eMonorepo.projectionMode).toBe('source_backed');
    expect(e2eMonorepo.sourceRules).toHaveLength(3);
    expect(e2eMonorepo.sourceRules.every((r) => r.locatorType === 'path')).toBe(true);
  });

  it('all shipped configs validate', () => {
    expect(validateProfileConfig(sdd).valid).toBe(true);
    expect(validateProfileConfig(e2eMonorepo).valid).toBe(true);
    expect(validateProfileConfig(onlineDocs).valid).toBe(true);
  });

  it('all shipped configs parse as workflow profile config schema', () => {
    expect(WorkflowProfileConfigSchema.parse(sdd).profileId).toBe(SDD_DEFAULT_PROFILE_ID);
    expect(WorkflowProfileConfigSchema.parse(e2eMonorepo).profileId).toBe(E2E_MONOREPO_PROFILE_ID);
    expect(WorkflowProfileConfigSchema.parse(onlineDocs).profileId).toBe(ONLINE_DOCS_PROFILE_ID);
  });
});

describe('resolveRuntimeProfileConfig root resolution', () => {
  it('derives e2e roots from a single E2E_MONOREPO_ROOT via fallback', () => {
    const res = resolveRuntimeProfileConfig(e2eMonorepo, { E2E_MONOREPO_ROOT: '/repo' });
    const byRule = new Map(res.rules.map((r) => [r.rule.ruleId, r.resolvedRoot]));
    expect(byRule.get('e2e-plan-process-doc')).toBe('/repo/docs/plan');
    expect(byRule.get('e2e-knowledge-docs')).toBe('/repo/wiki');
    expect(byRule.get('e2e-implementation-code')).toBe('/repo/src');
    expect(res.unresolved).toHaveLength(0);
  });

  it('prefers an explicit per-root env over the fallback base', () => {
    const res = resolveRuntimeProfileConfig(e2eMonorepo, {
      E2E_MONOREPO_ROOT: '/repo',
      E2E_KNOWLEDGE_ROOT: '/elsewhere/knowledge',
    });
    const byRule = new Map(res.rules.map((r) => [r.rule.ruleId, r.resolvedRoot]));
    expect(byRule.get('e2e-knowledge-docs')).toBe('/elsewhere/knowledge');
    expect(byRule.get('e2e-plan-process-doc')).toBe('/repo/docs/plan');
  });

  it('prefers an explicit code root over the monorepo fallback', () => {
    const res = resolveRuntimeProfileConfig(e2eMonorepo, {
      E2E_MONOREPO_ROOT: '/repo',
      E2E_CODE_ROOT: '/elsewhere/code',
    });
    const byRule = new Map(res.rules.map((r) => [r.rule.ruleId, r.resolvedRoot]));
    expect(byRule.get('e2e-implementation-code')).toBe('/elsewhere/code');
  });

  it('uses fuzzy path rules when no root env is configured', () => {
    const res = resolveRuntimeProfileConfig(e2eMonorepo, {});
    expect(res.rules).toHaveLength(3);
    expect(res.unresolved).toHaveLength(0);
    expect(res.rules.every((rule) => rule.resolvedRoot === null)).toBe(true);
  });

  it('strips trailing slashes on the base root', () => {
    const res = resolveRuntimeProfileConfig(e2eMonorepo, { E2E_MONOREPO_ROOT: '/repo/' });
    const plan = res.rules.find((r) => r.rule.ruleId === 'e2e-plan-process-doc');
    expect(plan?.resolvedRoot).toBe('/repo/docs/plan');
  });

  it('keeps enabled url rules (no root needed) and skips disabled rules', () => {
    const res = resolveRuntimeProfileConfig(onlineDocs, {});
    expect(res.rules).toHaveLength(1);
    expect(res.rules[0]!.rule.ruleId).toBe('online-creditdoc-knowledge');
    expect(res.rules[0]!.resolvedRoot).toBeNull();
  });

  it('sorts rules by confidence then priority', () => {
    const res = resolveRuntimeProfileConfig(e2eMonorepo, { E2E_MONOREPO_ROOT: '/repo' });
    expect(res.rules[0]!.rule.priority).toBe(100);
    const priorities = res.rules.map((r) => r.rule.priority);
    expect([...priorities]).toEqual([...priorities].sort((a, b) => b - a));
  });
});

describe('ProfileConfigCatalog serving semantics', () => {
  it('loads runtime configs through serving store methods', async () => {
    const store = {
      listServingProfileConfigs: vi.fn().mockResolvedValue([]),
      getServingProfileConfig: vi.fn().mockResolvedValue(null),
    };
    const catalog = new ProfileConfigCatalog(store);

    await catalog.listServing();
    await catalog.getServing(SDD_DEFAULT_PROFILE_ID);

    expect(store.listServingProfileConfigs).toHaveBeenCalledTimes(1);
    expect(store.getServingProfileConfig).toHaveBeenCalledWith(SDD_DEFAULT_PROFILE_ID);
  });
});

function baseConfig(over: Partial<WorkflowProfileConfig>): WorkflowProfileConfig {
  return {
    profileId: 'test',
    displayName: 'Test',
    status: 'active',
    projectionMode: 'source_backed',
    manifest: {
      capabilityUsage: true, deliveryUnits: true, artifacts: true, artifactTimeline: true,
      knowledgeRecalls: true, codeChanges: true, errors: false, evaluation: false, alerts: false,
    },
    sourceRules: [],
    deliveryUnitRules: [],
    artifactRules: [],
    capabilityRules: [],
    attributionPolicy: {
      anchorCategories: [], anchorActions: [],
      sameInteraction: { enabled: false, preferActions: [] },
      sameSessionWindow: { enabled: false, minutes: 0, requireSameUser: true, preferActions: [] },
    },
    presentation: {
      workflowKind: 'local_path_monorepo', maturityStages: [], artifactStageOrder: [],
      hiddenMetrics: [], knowledgeCoverageMode: 'recall_facts',
    },
    ...over,
  };
}

describe('validateProfileConfig rejects malformed configs', () => {
  it('rejects duplicate source rule ids', () => {
    const cfg = baseConfig({
      sourceRules: [
        { locatorType: 'path', ruleId: 'dup', category: 'code', priority: 1, confidence: 'high', enabled: true, rootPath: '/a', actions: ['read'] },
        { locatorType: 'path', ruleId: 'dup', category: 'code', priority: 1, confidence: 'high', enabled: true, rootPath: '/b', actions: ['read'] },
      ],
    });
    const r = validateProfileConfig(cfg);
    expect(r.valid).toBe(false);
    expect(r.issues.some((i) => i.message.includes('duplicate'))).toBe(true);
  });

  it('rejects local_path rule with no resolvable root', () => {
    const cfg = baseConfig({
      sourceRules: [{ locatorType: 'path', ruleId: 'noroot', category: 'code', priority: 1, confidence: 'high', enabled: true, actions: ['read'] }],
    });
    expect(validateProfileConfig(cfg).valid).toBe(false);
  });

  it('returns schema issues for invalid raw config json', () => {
    const result = validateProfileConfig({ profileId: 'broken' });
    expect(result.valid).toBe(false);
    expect(result.issues.some((issue) => issue.code === 'schema_invalid')).toBe(true);
    expect(result.issues.some((issue) => issue.path === 'displayName')).toBe(true);
  });

  it('accepts path rule with fuzzy pathContains instead of root', () => {
    const cfg = baseConfig({
      sourceRules: [{ locatorType: 'path', ruleId: 'fuzzy', category: 'code', priority: 1, confidence: 'high', enabled: true, pathContains: ['/web/'], actions: ['edit'] }],
    });
    expect(validateProfileConfig(cfg).valid).toBe(true);
    const res = resolveRuntimeProfileConfig(cfg, {});
    expect(res.rules).toHaveLength(1);
    expect(res.rules[0]!.resolvedRoot).toBeNull();
  });

  it('rejects mcp_doc rule that only declares mcpServers', () => {
    const cfg = baseConfig({
      sourceRules: [{ locatorType: 'mcp_doc', ruleId: 'mcp', category: 'knowledge', priority: 1, confidence: 'high', enabled: true, mcpServers: ['x'], actions: ['read'] }],
    });
    expect(validateProfileConfig(cfg).valid).toBe(false);
  });

  it('rejects capabilityRule with neither sourceRuleIds nor sourceCategories', () => {
    const cfg = baseConfig({
      capabilityRules: [{ ruleId: 'cap', actions: ['read'], capabilityCode: 'x', displayName: 'X' }],
    });
    expect(validateProfileConfig(cfg).valid).toBe(false);
  });

  it('rejects deliveryUnitRule / artifactRule referencing unknown sourceRuleId', () => {
    const du = baseConfig({
      deliveryUnitRules: [{ ruleId: 'du', sourceRuleIds: ['missing'], locatorStrategy: { kind: 'parent_dir', stripExtensions: true } }],
    });
    expect(validateProfileConfig(du).valid).toBe(false);
    const art = baseConfig({
      artifactRules: [{ ruleId: 'art', sourceRuleIds: ['missing'], typePatterns: [], defaultArtifactType: 'process_doc' }],
    });
    expect(validateProfileConfig(art).valid).toBe(false);
  });
});
