import {
  ALL_CODE_ACTIONS,
  DEFAULT_PROFILE_ERROR_RULES,
  E2E_MONOREPO_PROFILE_ID,
  IMPLEMENTATION_ACTIONS,
  READ_ACTIONS,
  SOURCE_BACKED_PRESENTATION,
  WRITE_ACTIONS,
  type WorkflowProfileConfig,
} from '../profile-types';

/**
 * 端到端 monorepo 示例，默认按 nxb-mono-repo 的真实目录结构识别。
 *
 * 多用户生产部署：
 *   不要求配置每个用户机器上的绝对路径。工具调用上报的是用户本机绝对路径，
 *   所以默认通过 /nxb-mono-repo/<relative-dir>/ 做模糊匹配。
 *
 * 单机精确验证时仍可选：
 *   E2E_MONOREPO_ROOT=/absolute/path/to/nxb-mono-repo
 *
 * 等价展开：
 *   plan -> $E2E_MONOREPO_ROOT/docs/plan
 *   wiki -> $E2E_MONOREPO_ROOT/wiki
 *   code -> $E2E_MONOREPO_ROOT/src
 *
 * 如果某一类 source 迁出 monorepo，只配置独立 env 即可，例如：
 *   E2E_KNOWLEDGE_ROOT=/absolute/path/to/online-docs-sync
 *
 * 独立 env 优先级高于 E2E_MONOREPO_ROOT。
 */
export const e2eMonorepoProfile: WorkflowProfileConfig = {
  profileId: E2E_MONOREPO_PROFILE_ID,
  displayName: '农小宝工作流',
  status: 'active',
  projectionMode: 'source_backed',
  manifest: {
    capabilityUsage: true,
    deliveryUnits: true,
    artifacts: true,
    artifactTimeline: true,
    knowledgeRecalls: true,
    codeChanges: true,
    errors: true,
    evaluation: true,
    alerts: false,
  },
  // sourceRules 只识别“这个 source 是什么”，不直接决定需求、产物或能力统计。
  sourceRules: [
    {
      locatorType: 'path',
      ruleId: 'e2e-plan-process-doc',
      category: 'process_doc',
      priority: 100,
      confidence: 'high',
      enabled: true,
      rootEnv: 'E2E_PLAN_ROOT',
      fallbackBaseEnv: 'E2E_MONOREPO_ROOT',
      relativeRoot: 'docs/plan',
      pathContains: ['/nxb-mono-repo/docs/plan/'],
      includeGlobs: ['**/*.md'],
      actions: ALL_CODE_ACTIONS,
      description: 'E2E process documents under nxb-mono-repo/docs/plan',
    },
    {
      locatorType: 'path',
      ruleId: 'e2e-knowledge-docs',
      category: 'knowledge',
      priority: 90,
      confidence: 'high',
      enabled: true,
      rootEnv: 'E2E_KNOWLEDGE_ROOT',
      fallbackBaseEnv: 'E2E_MONOREPO_ROOT',
      relativeRoot: 'wiki',
      pathContains: ['/nxb-mono-repo/wiki/'],
      includeGlobs: ['**/*.md'],
      actions: READ_ACTIONS,
      description: 'E2E local knowledge docs under nxb-mono-repo/wiki',
    },
    {
      locatorType: 'path',
      ruleId: 'e2e-implementation-code',
      category: 'code',
      priority: 70,
      confidence: 'high',
      enabled: true,
      rootEnv: 'E2E_CODE_ROOT',
      fallbackBaseEnv: 'E2E_MONOREPO_ROOT',
      relativeRoot: 'src',
      pathContains: ['/nxb-mono-repo/src/'],
      excludeGlobs: ['**/*.md', '**/*.mdx', '**/dist/**', '**/node_modules/**'],
      actions: IMPLEMENTATION_ACTIONS,
      description: 'E2E implementation code changes under nxb-mono-repo/src',
    },
  ],
  // 过程文档写入会生成需求 / 交付单元；读取过程文档只作为归因锚点，不算核心需求产出。
  deliveryUnitRules: [
    {
      ruleId: 'e2e-plan-unit',
      sourceRuleIds: ['e2e-plan-process-doc'],
      locatorStrategy: { kind: 'parent_dir', stripExtensions: true },
      titleStrategy: 'unit_slug',
    },
  ],
  // 过程文档写入会生成过程产物；artifactType 用文件名 / 路径模式识别。
  artifactRules: [
    {
      ruleId: 'e2e-plan-artifact',
      sourceRuleIds: ['e2e-plan-process-doc'],
      typePatterns: [
        { artifactType: 'plan', include: ['*plan*', '*proposal*', '*prd*'] },
        { artifactType: 'design', include: ['*design*'] },
        { artifactType: 'task', include: ['*task*', '*todo*'] },
        { artifactType: 'review', include: ['*review*'] },
      ],
      defaultArtifactType: 'process_doc',
    },
  ],
  // 能力统计来自 source + action 的组合；代码实施只统计写/改/删，不把读代码当成实施。
  capabilityRules: [
    {
      ruleId: 'cap-plan-update',
      sourceRuleIds: ['e2e-plan-process-doc'],
      actions: WRITE_ACTIONS,
      capabilityCode: 'plan-doc-update',
      displayName: '计划文档更新',
    },
    {
      ruleId: 'cap-plan-read',
      sourceRuleIds: ['e2e-plan-process-doc'],
      actions: READ_ACTIONS,
      capabilityCode: 'plan-doc-read',
      displayName: '计划文档读取',
    },
    {
      ruleId: 'cap-knowledge',
      sourceRuleIds: ['e2e-knowledge-docs'],
      actions: READ_ACTIONS,
      capabilityCode: 'knowledge-recall',
      displayName: '知识库读取',
    },
    {
      ruleId: 'cap-code-implementation',
      sourceRuleIds: ['e2e-implementation-code'],
      actions: IMPLEMENTATION_ACTIONS,
      capabilityCode: 'code-implementation',
      displayName: '代码实施',
    },
  ],
  errorRules: DEFAULT_PROFILE_ERROR_RULES,
  // 代码实施和知识库读取只归因到写/改/更新过的过程文档；读过程文档不作为核心归因锚点。
  attributionPolicy: {
    anchorCategories: ['process_doc'],
    anchorActions: WRITE_ACTIONS,
    sameInteraction: { enabled: true, preferActions: WRITE_ACTIONS },
    sameSessionWindow: {
      enabled: true,
      minutes: 120,
      requireSameUser: true,
      preferActions: WRITE_ACTIONS,
    },
  },
  presentation: SOURCE_BACKED_PRESENTATION,
};
