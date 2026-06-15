import type { CapabilityRule, SkillSourceRule } from './profile-types';

/** sdd_skill_semantics + 别名的输入形态(§10 skill→config 映射的源数据)。 */
export interface SddSemanticInput {
  semanticCode: string;
  displayName: string;
  /** 该 semantic 的 artifact 文件名模式(可空)。 */
  artifactFilenamePatterns: string[];
  /** 该 semantic 的全部 skill 别名。 */
  skillNames: string[];
}

export interface SddSkillConfig {
  sourceRules: SkillSourceRule[];
  capabilityRules: CapabilityRule[];
  /** 汇总进 process_doc artifactRule.typePatterns 的产物类型模式。 */
  artifactTypePatterns: Array<{ artifactType: string; include: string[] }>;
}

/**
 * §10 映射:把 sdd_skill_semantics + 别名转成统一 config 的 skill 规则。
 *
 * 每 semantic → 1 SkillSourceRule(skillNames=别名)+ 1 capabilityRule
 * (capabilityCode=semantic_code,displayName,stage=lifecycle 或 null);
 * artifactFilenamePatterns 汇总成 process_doc 用的 typePatterns(artifactType=semantic_code)。
 * 无别名的 semantic 跳过(匹配不到任何技能)。
 */
export function buildSddSkillConfig(semantics: SddSemanticInput[]): SddSkillConfig {
  const sourceRules: SkillSourceRule[] = [];
  const capabilityRules: CapabilityRule[] = [];
  const artifactTypePatterns: Array<{ artifactType: string; include: string[] }> = [];

  let priority = 100;
  for (const sem of semantics) {
    if (sem.skillNames.length === 0) continue;
    const ruleId = `skill-${sem.semanticCode}`;
    sourceRules.push({
      locatorType: 'skill',
      ruleId,
      category: 'skill',
      priority,
      confidence: 'high',
      enabled: true,
      skillNames: sem.skillNames,
      actions: ['invoke'],
    });
    capabilityRules.push({
      ruleId: `cap-${sem.semanticCode}`,
      sourceRuleIds: [ruleId],
      actions: ['invoke'],
      capabilityCode: sem.semanticCode,
      displayName: sem.displayName,
    });
    if (sem.artifactFilenamePatterns.length > 0) {
      artifactTypePatterns.push({ artifactType: sem.semanticCode, include: sem.artifactFilenamePatterns });
    }
    priority -= 1;
  }

  return { sourceRules, capabilityRules, artifactTypePatterns };
}
