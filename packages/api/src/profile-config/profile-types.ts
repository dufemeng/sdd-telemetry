import type {
  ProfileCapabilityManifest,
  ProfilePresentationLabels,
  ProfilePresentationStages,
  ProfilePresentationWidgets,
  ProfileStatus,
} from '../contracts/profile.contract';

/** SDD 历史默认工作流：通过 sdd_* 派生表桥接到 profile contract。 */
export const SDD_DEFAULT_PROFILE_ID = 'sdd-default';
/** 端到端 monorepo 示例：本地 plan/docs/frontend_repo/backend_repo 多 root 工作流。 */
export const E2E_MONOREPO_PROFILE_ID = 'e2e-monorepo';
/** 在线文档示例：URL / MCP 文档工作流，目前只作为 disabled 样例和 schema 验证。 */
export const ONLINE_DOCS_PROFILE_ID = 'online-docs';

/** 匹配置信度。只有 high + 非冲突事实会进入核心 KPI。 */
export type ProfileRuleConfidence = 'high' | 'medium' | 'low';
/** 标准化后的工具动作。来源于 source_references.action_type，而不是具体工具名。 */
export type SourceAction = 'read' | 'grep' | 'glob' | 'write' | 'edit' | 'update' | 'delete' | 'invoke';

/**
 * source 的业务类别。
 * - process_doc：过程文档，通常会产生需求 / 交付单元和过程产物。
 * - knowledge：知识库召回，只统计读取和覆盖。
 * - code：代码读写，回答“是否进入代码实施”。
 * - unknown：兜底，不进入核心看板。
 */
export type SourceCategory = 'process_doc' | 'knowledge' | 'code' | 'unknown' | 'skill';
/** 本地 path locator 的"按用户上报根解析"键：root 取自 sdd_users 的 wiki/requirements 列。 */
export type UserRootKey = 'wiki' | 'requirements';
/** 投影分发模式：sdd_bridge 走旧 sdd_* 桥接算子；source_backed 走通用 source registry executor。 */
export type ProjectionMode = 'sdd_bridge' | 'source_backed';

/**
 * 所有 source rule 的公共字段。
 *
 * rule 只负责“识别来源是什么”，不直接写看板表。后续 delivery/artifact/capability
 * 规则会引用 ruleId，把匹配到的 source 转成 profile projection facts。
 */
export interface SourceRuleBase {
  /** 稳定机器 ID，会写入 evidence_json；重命名会影响可追溯性，谨慎修改。 */
  ruleId: string;
  /** 多条规则同时命中时的排序权重；数字越大优先级越高。 */
  priority: number;
  /** 是否足够可信。第一期核心 KPI 只消费 high confidence 的非冲突事实。 */
  confidence: ProfileRuleConfidence;
  /** false 表示配置保留但不参与解析；适合在线文档真实样本未验证前占位。 */
  enabled: boolean;
  /** 该 source 在观测模型中的语义类别。 */
  category: SourceCategory;
  /** 允许哪些工具动作命中此规则。 */
  actions: SourceAction[];
  /** 给配置维护者看的说明，不进入看板。 */
  description?: string;
}

/**
 * 本地路径类 source rule。
 *
 * 精确 root 解析优先级：
 * 1. env[rootEnv]
 * 2. rootPath
 * 3. join(env[fallbackBaseEnv], relativeRoot)
 *
 * 如果不配置 root，也可以用 pathContains / pathRegexes 做模糊匹配。平台只提供能力，
 * 命中噪音由配置者通过 include/exclude/priority 自行控制。
 */
export interface LocalPathSourceRule extends SourceRuleBase {
  locatorType: 'path';
  /** 优先使用的绝对根环境变量，例如 E2E_PLAN_ROOT。 */
  rootEnv?: string;
  /** 直接写死的绝对根（测试 / 固定部署）。 */
  rootPath?: string;
  /** rootEnv 未配置时的兜底基准 env，与 relativeRoot 拼出绝对根（通用兼容展开，不写死 profile 后缀）。 */
  fallbackBaseEnv?: string;
  /** 与 fallbackBaseEnv 拼接的相对子目录，例如 plan / docs；填 "." 表示直接使用 fallbackBaseEnv 根。 */
  relativeRoot?: string;
  /** 无 root 时的路径包含匹配；例如 "/plan/"、"/web/"。大小写敏感度由 matcher 统一处理。 */
  pathContains?: string[];
  /** 无 root 时的路径正则匹配；适合路径结构不固定但有可表达模式的场景。 */
  pathRegexes?: string[];
  /** 在该 root 下允许命中的相对路径 glob。 */
  includeGlobs?: string[];
  /** 显式排除的相对路径 glob；deny 规则只是辅助，能不用就不用。 */
  excludeGlobs?: string[];
  /** 按用户上报根解析：root 取自 sdd_users 的 wiki/requirements 列(每用户不同),投影时解析。 */
  userRootKey?: UserRootKey;
}

/** URL 类 source rule，适合在线知识库通过固定 URL 前缀 / 正则识别。 */
export interface UrlSourceRule extends SourceRuleBase {
  locatorType: 'url';
  /** 允许命中的 URL 前缀；例如 https://host/creditdoc/frontedndoc/。 */
  urlPrefixes?: string[];
  /** 允许命中的 URL 正则。仅在 prefix 不够表达时使用。 */
  urlRegexes?: string[];
  /** 可选：从 URL 正则中提取稳定 resource id。未配置时用 normalizedLocator。 */
  resourceIdCapture?: string;
  /** 辅助排除条件；不要依赖 denylist 作为主要分类边界。 */
  deny?: {
    urlPrefixes?: string[];
    urlRegexes?: string[];
    docTypes?: string[];
  };
}

/**
 * MCP 在线文档类 source rule。
 *
 * mcpServer / toolName 只能说明“通过哪个工具读到”，不能单独证明它是知识库或需求库。
 * 高置信分类应优先依赖 docId、collectionId、docType、URL 前缀等稳定 locator。
 */
export interface McpDocSourceRule extends SourceRuleBase {
  locatorType: 'mcp_doc';
  mcpServers?: string[];
  toolNames?: string[];
  urlPrefixes?: string[];
  docIdPatterns?: string[];
  spaceIds?: string[];
  collectionIds?: string[];
  docTypes?: string[];
  deny?: {
    urlPrefixes?: string[];
    docTypes?: string[];
    titlePatterns?: string[];
  };
}

/** 技能调用类 source rule：按技能名(含别名)匹配 locator_type='skill' 的 source_reference。 */
export interface SkillSourceRule extends SourceRuleBase {
  locatorType: 'skill';
  /** 匹配的技能名(含别名);对应 source_reference.normalized_locator = skill_name。 */
  skillNames: string[];
}

export type SourceRule = LocalPathSourceRule | UrlSourceRule | McpDocSourceRule | SkillSourceRule;
export type SourceLocatorType = SourceRule['locatorType'];

/** 从 locator 解析“需求 / 交付单元”的策略。 */
export type DeliveryUnitLocatorStrategy =
  | { kind: 'path_segment'; stripExtensions: boolean; domainSegment?: number; unitSegment: number }
  | { kind: 'parent_dir'; stripExtensions: boolean }
  | { kind: 'url_resource_id' }
  | { kind: 'mcp_doc_id' };

/** 把 process_doc source 转成 profile_delivery_units 的规则。 */
export interface DeliveryUnitRule {
  ruleId: string;
  /** 只消费这些 source rule 命中的 source。 */
  sourceRuleIds: string[];
  /** 需求 key / title / domain 从路径、URL 还是 MCP doc id 中解析。 */
  locatorStrategy: DeliveryUnitLocatorStrategy;
  /** 页面标题的来源。 */
  titleStrategy?: 'unit_slug' | 'file_name' | 'doc_title' | 'none';
}

/** 把 process_doc source 转成 profile_artifact_writes 的规则。 */
export interface ArtifactRule {
  ruleId: string;
  sourceRuleIds: string[];
  /** 按相对 locator / 文件名匹配 artifact type。顺序即优先级。 */
  typePatterns: Array<{ artifactType: string; include: string[] }>;
  /** 没有命中 typePatterns 时的默认产物类型。 */
  defaultArtifactType: string;
}

/** 把 source/action 转成 profile_capability_usages 的规则。 */
export interface CapabilityRule {
  ruleId: string;
  /** 精确引用 source rule；适合 profile 明确目录 / URL 边界的情况。 */
  sourceRuleIds?: string[];
  /** 按 source category 引用；适合想把所有 code read 合并成同一能力的情况。 */
  sourceCategories?: SourceCategory[];
  actions: SourceAction[];
  /** 稳定能力编码；看板按它聚合。 */
  capabilityCode: string;
  /** 页面展示名称。 */
  displayName: string;
  /** 可选触发来源。source-backed profile 没有 SDD invocation 时通常为 null。 */
  triggerSource?: string | null;
  /** 生命周期阶段(用于 funnel/maturity);非阶段能力为 null。 */
  stage?: string | null;
}

/**
 * 知识库 / 代码事实归因到需求的策略。
 *
 * 设计取舍：
 * - 同 interaction 优先，其次同 session 时间窗。
 * - preferActions 用于避免“先写 A、后读 B、再改代码”时被最近的读操作抢走归因。
 */
export interface AttributionPolicy {
  /** 哪些类别能作为归因锚点，通常是 process_doc。 */
  anchorCategories: SourceCategory[];
  /** 哪些动作能作为归因锚点。 */
  anchorActions: SourceAction[];
  sameInteraction: {
    enabled: boolean;
    preferActions: SourceAction[];
  };
  sameSessionWindow: {
    enabled: boolean;
    minutes: number;
    requireSameUser: boolean;
    preferActions: SourceAction[];
  };
}

/** 前端展示降级配置。它不改变投影事实，只决定哪些 SDD 专属指标应隐藏或降级。 */
export interface ProfilePresentationConfig {
  /** 前端选择不同文案 / 空状态的粗粒度工作流类型。 */
  workflowKind: 'sdd' | 'local_path_monorepo' | 'online_docs';
  /** 用户成熟度阶段。source-backed profile 若没有统一阶段，应留空并隐藏成熟度。 */
  maturityStages: string[];
  /** 产物时间线阶段顺序。 */
  artifactStageOrder: string[];
  /** 当前 profile 下无意义的指标 id。 */
  hiddenMetrics: string[];
  /** 知识库覆盖率口径：文件系统扫描或仅基于 recall facts。 */
  knowledgeCoverageMode: 'filesystem_scan' | 'recall_facts';
  /** 页面通用名词。旧配置可省略，由 presentation helper 派生。 */
  labels?: ProfilePresentationLabels;
  /** 展示阶段描述。旧配置可省略，由 artifactStageOrder/maturityStages 派生。 */
  stages?: ProfilePresentationStages;
  /** widget 可见性 / 展示模式。旧配置可省略，由 hiddenMetrics 派生。 */
  widgets?: ProfilePresentationWidgets;
  /** 明确只适用于 legacy SDD 的页面或 surface。 */
  legacyOnlySurfaces?: string[];
}

/** 一个 profile 的完整观测契约。 */
export interface WorkflowProfileConfig {
  /** API / URL 使用的稳定 ID，必须中性可见。 */
  profileId: string;
  /** 页面展示名称。 */
  displayName: string;
  /** disabled profile 不作为正式入口；可用于保留未验证样例。 */
  status: ProfileStatus;
  /** worker / diff 的唯一分发键。禁止在执行层按具体 profileId 特判。 */
  projectionMode: ProjectionMode;
  /** 看板能力开关；前端和 API 用它决定是否降级。 */
  manifest: ProfileCapabilityManifest;
  /** source 识别规则。 */
  sourceRules: SourceRule[];
  /** process_doc -> delivery unit。 */
  deliveryUnitRules: DeliveryUnitRule[];
  /** process_doc -> artifact write。 */
  artifactRules: ArtifactRule[];
  /** matched source -> capability usage。 */
  capabilityRules: CapabilityRule[];
  /** knowledge/code -> delivery unit 归因策略。 */
  attributionPolicy: AttributionPolicy;
  /** 展示层降级和阶段顺序。 */
  presentation: ProfilePresentationConfig;
}

export const SDD_PRESENTATION: ProfilePresentationConfig = {
  workflowKind: 'sdd',
  maturityStages: ['proposal', 'design', 'task', 'codereview'],
  artifactStageOrder: ['proposal', 'design', 'task', 'review'],
  hiddenMetrics: [],
  knowledgeCoverageMode: 'filesystem_scan',
};

/** source-backed 工作流默认隐藏 SDD 专属指标，避免页面展示一排没有语义的 0。 */
export const SOURCE_BACKED_PRESENTATION: ProfilePresentationConfig = {
  workflowKind: 'local_path_monorepo',
  maturityStages: [],
  artifactStageOrder: ['plan', 'design', 'task', 'review', 'process_doc'],
  hiddenMetrics: [
    'userTriggeredCount',
    'autoTriggeredCount',
    'callQuality',
    'matchHealth',
    'multiStageDeliveryUnitCount',
    'maturity',
    'sddStageDots',
    'knowledgeCoverageRate',
  ],
  knowledgeCoverageMode: 'recall_facts',
};

export const READ_ACTIONS: SourceAction[] = ['read', 'grep', 'glob'];
export const WRITE_ACTIONS: SourceAction[] = ['write', 'edit', 'update'];
export const IMPLEMENTATION_ACTIONS: SourceAction[] = ['write', 'edit', 'update', 'delete'];
export const ALL_CODE_ACTIONS: SourceAction[] = ['read', 'grep', 'glob', 'write', 'edit', 'update'];

export const EMPTY_ATTRIBUTION_POLICY: AttributionPolicy = {
  anchorCategories: [],
  anchorActions: [],
  sameInteraction: { enabled: false, preferActions: [] },
  sameSessionWindow: { enabled: false, minutes: 0, requireSameUser: true, preferActions: [] },
};
