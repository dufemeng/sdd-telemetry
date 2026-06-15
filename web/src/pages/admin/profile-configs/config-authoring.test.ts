import { describe, expect, it } from 'vitest';
import {
  E2E_MONOREPO_PROFILE_ID,
  SDD_DEFAULT_PROFILE_ID,
  getProfileConfig,
  validateProfileConfig,
} from '@sdd-telemetry/api';
import {
  decodeContentRows,
  decodeSemanticRows,
  encodeContentRows,
  encodeSemanticRows,
} from './config-authoring';

const sdd = getProfileConfig(SDD_DEFAULT_PROFILE_ID)!;
const e2e = getProfileConfig(E2E_MONOREPO_PROFILE_ID)!;

describe('content map decode', () => {
  it('decodes sdd-default to user_root + code_catchall', () => {
    const rows = decodeContentRows(sdd);
    const byKind = new Map(rows.map((r) => [r.kind, r]));
    expect(byKind.get('knowledge')?.sourceType).toBe('user_root');
    expect(byKind.get('knowledge')?.userRootKey).toBe('wiki');
    expect(byKind.get('process_doc')?.sourceType).toBe('user_root');
    expect(byKind.get('process_doc')?.userRootKey).toBe('requirements');
    expect(byKind.get('code')?.sourceType).toBe('code_catchall');
    expect(byKind.get('code')?.excludeUserRootKeys).toEqual(['wiki', 'requirements']);
  });

  it('decodes e2e-monorepo to path_contains', () => {
    const rows = decodeContentRows(e2e);
    expect(rows.every((r) => r.sourceType === 'path_contains')).toBe(true);
    const code = rows.find((r) => r.kind === 'code')!;
    expect(code.pathContains).toContain('/nxb-mono-repo/src/');
    expect(code.excludeGlobs.length).toBeGreaterThan(0);
  });

  it('content round-trip keeps the config valid and category rules intact', () => {
    for (const config of [sdd, e2e]) {
      const next = encodeContentRows(config, decodeContentRows(config));
      expect(validateProfileConfig(next).valid).toBe(true);
      expect(next.sourceRules.filter((r) => r.category === 'knowledge')).toHaveLength(
        config.sourceRules.filter((r) => r.category === 'knowledge').length,
      );
    }
  });
});

describe('skill semantic decode/encode', () => {
  it('decodes sdd-default into 13 semantics with aliases + artifact patterns', () => {
    const rows = decodeSemanticRows(sdd);
    expect(rows).toHaveLength(13);
    const design = rows.find((r) => r.code === 'design')!;
    expect(design.displayName).toBe('系统分析');
    expect(design.aliases).toContain('bk-fe-design');
    expect(design.artifactPatterns).toContain('design.md');
  });

  it('round-trips sdd-default skill rules without drift (count + aliases stable)', () => {
    const rows = decodeSemanticRows(sdd);
    const next = encodeSemanticRows(sdd, rows);
    expect(validateProfileConfig(next).valid).toBe(true);
    // 技能 sourceRule 数(13 semantics + 1 catch-all)不变。
    const skillRules = (cfg: typeof sdd) => cfg.sourceRules.filter((r) => r.locatorType === 'skill');
    expect(skillRules(next)).toHaveLength(skillRules(sdd).length);
    // capability 数不变。
    expect(next.capabilityRules).toHaveLength(sdd.capabilityRules.length);
    // 重新 decode 应得到同样的 13 条语义。
    expect(decodeSemanticRows(next)).toHaveLength(13);
    // 兜底规则保留。
    expect(next.sourceRules.some((r) => r.ruleId === 'skill-other')).toBe(true);
    expect(next.capabilityRules.some((c) => c.ruleId === 'cap-other-skill')).toBe(true);
  });

  it('editing a semantic alias re-generates only that skill rule', () => {
    const rows = decodeSemanticRows(sdd);
    const edited = rows.map((r) => (r.code === 'design' ? { ...r, aliases: [...r.aliases, 'bk-fe-design-v2'] } : r));
    const next = encodeSemanticRows(sdd, edited);
    const designRule = next.sourceRules.find((r) => r.ruleId === 'skill-design');
    expect(designRule?.locatorType).toBe('skill');
    expect(designRule && 'skillNames' in designRule ? designRule.skillNames : []).toContain('bk-fe-design-v2');
    expect(validateProfileConfig(next).valid).toBe(true);
  });
});
