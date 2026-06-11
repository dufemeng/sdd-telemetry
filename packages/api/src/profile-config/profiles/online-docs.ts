import {
  ONLINE_DOCS_PROFILE_ID,
  SOURCE_BACKED_PRESENTATION,
  type WorkflowProfileConfig,
} from '../profile-types';

// URL / MCP schema 在真实在线文档 source reference 验证前不冻结，允许调整字段名和匹配条件。
// 这份配置用于证明同一套 source rule 能表达在线文档，不代表已经达到部署条件。
export const onlineDocsProfile: WorkflowProfileConfig = {
  profileId: ONLINE_DOCS_PROFILE_ID,
  displayName: '在线文档工作流（待验证）',
  status: 'disabled',
  projectionMode: 'source_backed',
  manifest: {
    capabilityUsage: true,
    deliveryUnits: true,
    artifacts: true,
    artifactTimeline: false,
    knowledgeRecalls: true,
    codeChanges: false,
    errors: false,
    evaluation: false,
    alerts: false,
  },
  sourceRules: [
    {
      locatorType: 'url',
      ruleId: 'online-creditdoc-knowledge',
      category: 'knowledge',
      priority: 100,
      confidence: 'high',
      enabled: true,
      urlPrefixes: ['https://<host>/creditdoc/frontedndoc/'],
      actions: ['read'],
      description: 'Online knowledge docs (provisional)',
    },
    {
      locatorType: 'mcp_doc',
      ruleId: 'online-requirements-process-doc',
      category: 'process_doc',
      priority: 100,
      confidence: 'high',
      enabled: false,
      mcpServers: ['<server-name>'],
      collectionIds: ['<requirements-collection-id>'],
      docTypes: ['requirement', 'process_doc'],
      actions: ['write', 'update'],
      description: 'Requirements process docs via MCP (provisional, disabled)',
    },
  ],
  deliveryUnitRules: [
    {
      ruleId: 'online-requirements-unit',
      sourceRuleIds: ['online-requirements-process-doc'],
      locatorStrategy: { kind: 'mcp_doc_id' },
      titleStrategy: 'doc_title',
    },
  ],
  artifactRules: [
    {
      ruleId: 'online-requirements-artifact',
      sourceRuleIds: ['online-requirements-process-doc'],
      typePatterns: [{ artifactType: 'requirement', include: ['*'] }],
      defaultArtifactType: 'process_doc',
    },
  ],
  capabilityRules: [
    { ruleId: 'cap-online-knowledge', sourceRuleIds: ['online-creditdoc-knowledge'], actions: ['read'], capabilityCode: 'knowledge-recall', displayName: '在线知识库读取' },
    { ruleId: 'cap-online-process-doc', sourceRuleIds: ['online-requirements-process-doc'], actions: ['write', 'update'], capabilityCode: 'process-doc-update', displayName: '在线过程文档更新' },
  ],
  attributionPolicy: {
    anchorCategories: ['process_doc'],
    anchorActions: ['write', 'update'],
    sameInteraction: { enabled: true, preferActions: ['write', 'update'] },
    sameSessionWindow: { enabled: true, minutes: 120, requireSameUser: true, preferActions: ['write', 'update'] },
  },
  presentation: { ...SOURCE_BACKED_PRESENTATION, workflowKind: 'online_docs' },
};
