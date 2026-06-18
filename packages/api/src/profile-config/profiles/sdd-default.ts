import {
  ALL_CODE_ACTIONS,
  DEFAULT_PROFILE_ERROR_RULES,
  READ_ACTIONS,
  SDD_DEFAULT_PROFILE_ID,
  SDD_PRESENTATION,
  WRITE_ACTIONS,
  type WorkflowProfileConfig,
} from '../profile-types';
import { buildSddSkillConfig, type SddSemanticInput } from '../sdd-skill-config';

/**
 * SDD 默认工作流（source_backed,从 sdd_bridge flip 而来）。
 *
 * skill / capability 由 SDD_SEMANTICS（原 sdd_skill_semantics + 别名,§10 映射）+ catch-all 生成;
 * knowledge/process_doc 走 per-user 根(wiki/requirements)。
 * sdd-default 不配置代码兜底来源:用户可能有多个无关本地仓库，"非 doc 路径"不是清晰的业务口径。
 * flip 后 /sdd/semantics 退役,语义以此 config 为准。
 */
const SDD_SEMANTICS: SddSemanticInput[] = [
  { semanticCode: 'proposal', displayName: '技术提案', artifactFilenamePatterns: ['proposal.md', 'proposal-*.md'], skillNames: ['bk-fe-proposal', 'bk-fe:proposal'] },
  { semanticCode: 'design', displayName: '系统分析', artifactFilenamePatterns: ['design.md', 'design-*.md'], skillNames: ['bk-fe-design', 'bk-fe:design', 'bk-fe-desin'] },
  { semanticCode: 'task', displayName: '需求拆分', artifactFilenamePatterns: ['tasks.md', 'tasks-*.md', 'task.md', 'task-*.md'], skillNames: ['bk-fe-task', 'bk-fe:task'] },
  { semanticCode: 'code', displayName: '编码实现', artifactFilenamePatterns: ['implementation.md', 'implementation-*.md', 'code.md', 'code-*.md'], skillNames: ['bk-fe-code', 'bk-fe:code'] },
  { semanticCode: 'codereview', displayName: 'Code Review', artifactFilenamePatterns: ['codereview.md', 'codereview-*.md', 'code-review.md', 'code-review-*.md', 'review.md', 'review-*.md'], skillNames: ['bk-fe-codereview', 'bk-fe:codereview', 'bk-fe-code-review', 'bk-fe:code_review'] },
  { semanticCode: 'designreview', displayName: '设计审查', artifactFilenamePatterns: ['design-review.md', 'design-review-*.md', 'designreview.md', 'designreview-*.md', 'design_review.md', 'design_review-*.md'], skillNames: ['bk-fe-designreview', 'bk-fe:designreview', 'bk-fe-design-review', 'bk-fe:design-review', 'bk-fe:design_review'] },
  { semanticCode: 'test', displayName: '测试验证', artifactFilenamePatterns: ['test.md', 'test-*.md'], skillNames: ['bk-fe-test', 'bk-fe:test'] },
  { semanticCode: 'risk-learn', displayName: '事故复盘', artifactFilenamePatterns: ['risk-learn.md', 'risk-learn-*.md', 'risk_learn.md', 'risk_learn-*.md'], skillNames: ['bk-fe-risk-learn', 'bk-fe:risk-learn', 'bk-fe-risk_learn', 'bk-fe:risk_learn'] },
  { semanticCode: 'legilimency', displayName: '知识回补', artifactFilenamePatterns: ['legilimency.md', 'legilimency-*.md', 'legilimeny.md', 'legilimeny-*.md'], skillNames: ['bk-fe-legilimency', 'bk-fe:legilimency', 'bk-fe-legilimeny', 'bk-fe:legilimeny'] },
  { semanticCode: 'code-domain-wiki', displayName: 'Domain Wiki', artifactFilenamePatterns: ['code-domain-wiki.md', 'code-domain-wiki-*.md', 'code_domain_wiki.md', 'code_domain_wiki-*.md'], skillNames: ['bk-fe-code-domain-wiki', 'bk-fe:code-domain-wiki', 'bk-fe-code_domain_wiki', 'bk-fe:code_domain_wiki'] },
  { semanticCode: 'code-system-wiki', displayName: '系统 Wiki', artifactFilenamePatterns: ['code-system-wiki.md', 'code-system-wiki-*.md', 'code_system_wiki.md', 'code_system_wiki-*.md', 'deepwiki.md', 'deepwiki-*.md'], skillNames: ['bk-fe-code-system-wiki', 'bk-fe:code-system-wiki', 'bk-fe-code_system_wiki', 'bk-fe:code_system_wiki'] },
  { semanticCode: 'doctor', displayName: '诊断', artifactFilenamePatterns: [], skillNames: ['bk-fe-doctor', 'bk-fe:doctor'] },
  { semanticCode: 'help', displayName: '帮助', artifactFilenamePatterns: [], skillNames: ['bk-fe-help', 'bk-fe:help'] },
];

const skillCfg = buildSddSkillConfig(SDD_SEMANTICS);

export const sddDefaultProfile: WorkflowProfileConfig = {
  profileId: SDD_DEFAULT_PROFILE_ID,
  displayName: 'SDD 默认工作流',
  status: 'active',
  projectionMode: 'source_backed',
  manifest: {
    capabilityUsage: true,
    deliveryUnits: true,
    artifacts: true,
    artifactTimeline: true,
    knowledgeRecalls: true,
    codeChanges: false,
    errors: true,
    evaluation: false,
    alerts: false,
  },
  sourceRules: [
    // 知识库:用户上报 wiki 根。
    {
      locatorType: 'path', ruleId: 'sdd-wiki-knowledge', category: 'knowledge', priority: 90,
      confidence: 'high', enabled: true, userRootKey: 'wiki', actions: READ_ACTIONS,
      description: 'SDD wiki knowledge under per-user wiki_root_path',
    },
    // 需求过程文档:用户上报 requirements 根。
    {
      locatorType: 'path', ruleId: 'sdd-requirements-process-doc', category: 'process_doc', priority: 85,
      confidence: 'high', enabled: true, userRootKey: 'requirements', actions: ALL_CODE_ACTIONS,
      description: 'SDD requirements/process docs under per-user requirements_root_path',
    },
    // 技能(13 semantic）。
    ...skillCfg.sourceRules,
    // catch-all:收口非-SDD 技能,保 capability count 口径。
    {
      locatorType: 'skill', ruleId: 'skill-other', category: 'skill', priority: 1,
      confidence: 'high', enabled: true, skillNames: ['*'], actions: ['invoke'],
      description: 'catch-all for non-SDD skills (bridge semantic=NULL)',
    },
  ],
  deliveryUnitRules: [
    {
      ruleId: 'sdd-requirements-unit', sourceRuleIds: ['sdd-requirements-process-doc'],
      locatorStrategy: { kind: 'parent_dir', stripExtensions: true }, titleStrategy: 'unit_slug',
    },
  ],
  artifactRules: [
    {
      ruleId: 'sdd-artifact', sourceRuleIds: ['sdd-requirements-process-doc'],
      typePatterns: skillCfg.artifactTypePatterns, defaultArtifactType: 'process_doc',
    },
  ],
  capabilityRules: [
    ...skillCfg.capabilityRules,
    { ruleId: 'cap-other-skill', sourceRuleIds: ['skill-other'], actions: ['invoke'], capabilityCode: 'other-skill', displayName: '未纳入体系', surfaceRole: 'fallback' },
  ],
  errorRules: DEFAULT_PROFILE_ERROR_RULES,
  attributionPolicy: {
    anchorCategories: ['process_doc'],
    anchorActions: WRITE_ACTIONS,
    sameInteraction: { enabled: true, preferActions: WRITE_ACTIONS },
    sameSessionWindow: { enabled: true, minutes: 120, requireSameUser: true, preferActions: WRITE_ACTIONS },
  },
  presentation: SDD_PRESENTATION,
};
