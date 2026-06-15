import type {
  CapabilityRule,
  SourceRule,
  UserRootKey,
  WorkflowProfileConfig,
} from '@sdd-telemetry/api';

/**
 * buildSddSkillConfig 的本地镜像(§10 skill→config 映射)。
 *
 * 不从 @sdd-telemetry/api 运行时 import:该包以 CommonJS dist 被消费,Vite 对 link 的
 * workspace 包走 /@fs/ 原样 serve,深层 __exportStar 的具名导出在浏览器里取不到。
 * 这里只内联这一段纯逻辑(类型仍从 api import,编译期擦除)。与 packages/api 的
 * buildSddSkillConfig 保持一致——config-authoring.test 的 round-trip 用内置 profile
 * (由 api 端生成)做基准,一旦漂移测试即红。
 */
function buildSkillRules(
  semantics: Array<{ semanticCode: string; displayName: string; artifactFilenamePatterns: string[]; skillNames: string[] }>,
): { sourceRules: SourceRule[]; capabilityRules: CapabilityRule[]; artifactTypePatterns: Array<{ artifactType: string; include: string[] }> } {
  const sourceRules: SourceRule[] = [];
  const capabilityRules: CapabilityRule[] = [];
  const artifactTypePatterns: Array<{ artifactType: string; include: string[] }> = [];
  let priority = 100;
  for (const sem of semantics) {
    if (sem.skillNames.length === 0) continue;
    const ruleId = `skill-${sem.semanticCode}`;
    sourceRules.push({
      locatorType: 'skill', ruleId, category: 'skill', priority,
      confidence: 'high', enabled: true, skillNames: sem.skillNames, actions: ['invoke'],
    });
    capabilityRules.push({
      ruleId: `cap-${sem.semanticCode}`, sourceRuleIds: [ruleId], actions: ['invoke'],
      capabilityCode: sem.semanticCode, displayName: sem.displayName,
    });
    if (sem.artifactFilenamePatterns.length > 0) {
      artifactTypePatterns.push({ artifactType: sem.semanticCode, include: sem.artifactFilenamePatterns });
    }
    priority -= 1;
  }
  return { sourceRules, capabilityRules, artifactTypePatterns };
}

/**
 * 简单视图的「内容地图 + 技能映射」编解码层。
 *
 * 不引入新的 schema/authoring 字段:config 仍是唯一事实源。简单视图只 decode 出
 * 「每类内容的关键来源字段」和「技能语义」,编辑后 encode 回 config;技能规则用
 * 已有的 buildSddSkillConfig 重新生成。无法 decode 的手写配置自动退化到高级视图。
 */

export type ContentKind = 'knowledge' | 'process_doc' | 'code';
/** 来源类型:路径包含(模糊) / 按用户根 / 代码兜底(非 doc) / URL / MCP。 */
export type ContentSourceType = 'path_contains' | 'user_root' | 'code_catchall' | 'url' | 'mcp';

export interface ContentRow {
  kind: ContentKind;
  /** 背后的 sourceRule id;空串表示该类内容当前未配置。 */
  ruleId: string;
  present: boolean;
  sourceType: ContentSourceType;
  pathContains: string[];
  userRootKey: UserRootKey | null;
  excludeGlobs: string[];
  excludeUserRootKeys: UserRootKey[];
  urlPrefixes: string[];
}

export interface SemanticRow {
  code: string;
  displayName: string;
  description: string;
  aliases: string[];
  artifactPatterns: string[];
}

export const CONTENT_KINDS: ContentKind[] = ['knowledge', 'process_doc', 'code'];

export const CONTENT_KIND_META: Record<ContentKind, { label: string; hint: string; icon: string }> = {
  knowledge: { label: '知识库', hint: '工程师读的知识库文档', icon: '📚' },
  process_doc: { label: '过程文档', hint: '需求 / 设计 / 任务等过程文档', icon: '📝' },
  code: { label: '代码', hint: '实现代码的读写', icon: '💻' },
};

// 来源类型按「意图」措辞:用户回答"这类内容在哪种情况",机制由答案推导。
export const CONTENT_SOURCE_TYPE_LABEL: Record<ContentSourceType, string> = {
  path_contains: '在一个大家共用的仓库里',
  user_root: '每个人在自己电脑上',
  code_catchall: '除知识 / 文档外的其余路径',
  url: '是在线文档(网址)',
  mcp: '是在线文档(MCP)',
};

/** 来源类型的一句话解释,显示在下拉下面。 */
export const CONTENT_SOURCE_TYPE_DESC: Record<ContentSourceType, string> = {
  path_contains: '路径里包含你填的一段就算。适合所有人共用同一个仓库(路径结构一致)。',
  user_root: '每个用户的客户端上报自己电脑上的目录,你不用填路径。适合每个人的仓库散落在各自机器上。',
  code_catchall: '凡是不在知识库 / 需求目录里的路径,都当作代码。',
  url: '网址以你填的前缀开头就算。',
  mcp: '通过 MCP 工具读到的在线文档。',
};

/** 每类内容合理的「在哪」选项:代码不会在线,只有知识/文档有"每个人自己的目录"。 */
export function availableSourceTypes(kind: ContentKind): ContentSourceType[] {
  if (kind === 'code') return ['path_contains', 'code_catchall'];
  return ['path_contains', 'user_root', 'url'];
}

/** 选了"每个人自己电脑上"时,用哪个上报根:知识库→wiki,过程文档→requirements。 */
function userRootForKind(kind: ContentKind): UserRootKey {
  return kind === 'knowledge' ? 'wiki' : 'requirements';
}

function asLines(value: string[] | undefined): string[] {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function findCategoryRule(config: WorkflowProfileConfig, kind: ContentKind): SourceRule | undefined {
  return config.sourceRules.find((rule) => rule.category === kind);
}

function decodeContentRow(config: WorkflowProfileConfig, kind: ContentKind): ContentRow {
  const empty: ContentRow = {
    kind,
    ruleId: '',
    present: false,
    sourceType: 'path_contains',
    pathContains: [],
    userRootKey: null,
    excludeGlobs: [],
    excludeUserRootKeys: [],
    urlPrefixes: [],
  };
  const rule = findCategoryRule(config, kind);
  if (!rule) return empty;

  const base: ContentRow = { ...empty, ruleId: rule.ruleId, present: true };
  if (rule.locatorType === 'url') {
    return { ...base, sourceType: 'url', urlPrefixes: asLines(rule.urlPrefixes) };
  }
  if (rule.locatorType === 'mcp_doc') {
    return { ...base, sourceType: 'mcp', urlPrefixes: asLines(rule.urlPrefixes) };
  }
  if (rule.locatorType === 'path') {
    if (rule.userRootKey) {
      return { ...base, sourceType: 'user_root', userRootKey: rule.userRootKey, excludeGlobs: asLines(rule.excludeGlobs) };
    }
    if ((rule.excludeUserRootKeys?.length ?? 0) > 0) {
      return {
        ...base,
        sourceType: 'code_catchall',
        excludeUserRootKeys: rule.excludeUserRootKeys ?? [],
        excludeGlobs: asLines(rule.excludeGlobs),
      };
    }
    return { ...base, sourceType: 'path_contains', pathContains: asLines(rule.pathContains), excludeGlobs: asLines(rule.excludeGlobs) };
  }
  return base;
}

export function decodeContentRows(config: WorkflowProfileConfig): ContentRow[] {
  return CONTENT_KINDS.map((kind) => decodeContentRow(config, kind));
}

/** 内容地图能否被简单视图覆盖:每条已配置的内容类规则都是可识别的来源形态。 */
export function isContentDecodable(config: WorkflowProfileConfig): boolean {
  return config.sourceRules
    .filter((rule) => rule.category === 'knowledge' || rule.category === 'process_doc' || rule.category === 'code')
    .every((rule) => rule.locatorType !== 'skill');
}

function locatorTypeFor(sourceType: ContentSourceType): SourceRule['locatorType'] {
  if (sourceType === 'url') return 'url';
  if (sourceType === 'mcp') return 'mcp_doc';
  return 'path';
}

/**
 * 把一条内容行写回对应类别的规则。
 * - 来源类型不改 locatorType 时:保留现有规则其它字段(includeGlobs / rootEnv 等),只动相关字段。
 * - 改了 locatorType 时(本地 ↔ 在线):只带过公共字段重建,丢掉不再适用的字段。
 * 输出由 encodeContentRows → validateProfileConfig 的 round-trip 测试兜底,故此处用 as 断言。
 */
function applyContentRow(rule: SourceRule, row: ContentRow): SourceRule {
  const target = locatorTypeFor(row.sourceType);
  const base = {
    ruleId: rule.ruleId, priority: rule.priority, confidence: rule.confidence,
    enabled: rule.enabled, category: rule.category, actions: rule.actions,
    ...(rule.description ? { description: rule.description } : {}),
  };
  const start = rule.locatorType === target ? rule : base;
  const excludeGlobs = row.excludeGlobs.length ? row.excludeGlobs : undefined;

  switch (row.sourceType) {
    case 'path_contains':
      return { ...start, locatorType: 'path', pathContains: row.pathContains, userRootKey: undefined, excludeUserRootKeys: undefined, pathRegexes: undefined, excludeGlobs } as SourceRule;
    case 'user_root':
      return { ...start, locatorType: 'path', userRootKey: userRootForKind(row.kind), pathContains: undefined, excludeUserRootKeys: undefined, pathRegexes: undefined } as SourceRule;
    case 'code_catchall':
      return { ...start, locatorType: 'path', pathRegexes: ['.+'], excludeUserRootKeys: ['wiki', 'requirements'], pathContains: undefined, userRootKey: undefined, excludeGlobs } as SourceRule;
    case 'url':
      return { ...start, locatorType: 'url', urlPrefixes: row.urlPrefixes } as SourceRule;
    case 'mcp':
      return { ...start, locatorType: 'mcp_doc', urlPrefixes: row.urlPrefixes } as SourceRule;
    default:
      return rule;
  }
}

export function encodeContentRows(config: WorkflowProfileConfig, rows: ContentRow[]): WorkflowProfileConfig {
  let sourceRules = [...config.sourceRules];
  for (const row of rows) {
    if (!row.present) continue;
    const index = sourceRules.findIndex((rule) => rule.category === row.kind);
    if (index >= 0) {
      sourceRules[index] = applyContentRow(sourceRules[index]!, row);
    }
  }
  return { ...config, sourceRules };
}

// ---- 技能映射 ----

const SKILL_CATCHALL_RULE_ID = 'skill-other';

function isSkillRule(rule: SourceRule): boolean {
  return rule.locatorType === 'skill';
}

export function decodeSemanticRows(config: WorkflowProfileConfig): SemanticRow[] {
  const skillRulesById = new Map<string, SourceRule>();
  for (const rule of config.sourceRules) {
    if (isSkillRule(rule)) skillRulesById.set(rule.ruleId, rule);
  }
  const artifactPatternsByType = new Map<string, string[]>();
  for (const artifactRule of config.artifactRules) {
    for (const pattern of artifactRule.typePatterns) {
      if (!artifactPatternsByType.has(pattern.artifactType)) {
        artifactPatternsByType.set(pattern.artifactType, pattern.include);
      }
    }
  }

  const rows: SemanticRow[] = [];
  for (const cap of config.capabilityRules) {
    const skillRuleId = (cap.sourceRuleIds ?? []).find((id) => skillRulesById.has(id));
    if (!skillRuleId || skillRuleId === SKILL_CATCHALL_RULE_ID) continue;
    const skillRule = skillRulesById.get(skillRuleId)!;
    if (skillRule.locatorType !== 'skill') continue;
    if (skillRule.skillNames.includes('*')) continue; // catch-all 不算语义
    rows.push({
      code: cap.capabilityCode,
      displayName: cap.displayName,
      description: skillRule.description ?? '',
      aliases: skillRule.skillNames,
      artifactPatterns: artifactPatternsByType.get(cap.capabilityCode) ?? [],
    });
  }
  return rows;
}

/** 技能映射是否可被简单视图覆盖(存在按技能匹配的能力,且非纯路径 profile)。 */
export function hasSkillMapping(config: WorkflowProfileConfig): boolean {
  return config.sourceRules.some(isSkillRule);
}

/**
 * 用 buildSddSkillConfig 从语义行重新生成技能规则,拼回 config:
 * 保留所有非技能 sourceRule + 技能兜底(skill-other),替换 per-semantic 技能/能力规则,
 * 并把产物文件名模式刷进 process_doc 的 artifactRule.typePatterns。
 */
const SKILL_CATCHALL_CAP_ID = 'cap-other-skill';

/** 把 inserts 插在 list 中 markerId 之前;没有 marker 则追加到末尾。 */
function spliceBeforeId<T>(list: T[], markerId: string, inserts: T[], idOf: (item: T) => string): T[] {
  const index = list.findIndex((item) => idOf(item) === markerId);
  return index >= 0 ? [...list.slice(0, index), ...inserts, ...list.slice(index)] : [...list, ...inserts];
}

export function encodeSemanticRows(config: WorkflowProfileConfig, rows: SemanticRow[]): WorkflowProfileConfig {
  const generated = buildSkillRules(
    rows.map((row) => ({
      semanticCode: row.code,
      displayName: row.displayName,
      artifactFilenamePatterns: row.artifactPatterns,
      skillNames: row.aliases,
    })),
  );
  const description = new Map(rows.map((row) => [row.code, row.description.trim()]));
  const generatedSkillRules: SourceRule[] = generated.sourceRules.map((rule) => {
    const desc = description.get(rule.ruleId.replace(/^skill-/, ''));
    return desc ? { ...rule, description: desc } : rule;
  });

  // per-semantic 技能规则 = 除兜底外的全部 skill 规则;删除后用 generated 替换(插在兜底前)。
  const perSemanticSkillIds = new Set(
    config.sourceRules.filter((rule) => isSkillRule(rule) && rule.ruleId !== SKILL_CATCHALL_RULE_ID).map((rule) => rule.ruleId),
  );
  const keptSourceRules = config.sourceRules.filter((rule) => !perSemanticSkillIds.has(rule.ruleId));
  const sourceRules = spliceBeforeId(keptSourceRules, SKILL_CATCHALL_RULE_ID, generatedSkillRules, (rule) => rule.ruleId);

  // 引用了 per-semantic 技能规则的能力删掉,用 generated 替换(插在 cap 兜底前);非技能能力保留。
  const keptCaps = config.capabilityRules.filter(
    (cap) => !(cap.sourceRuleIds ?? []).some((id) => perSemanticSkillIds.has(id)),
  );
  const capabilityRules = spliceBeforeId(keptCaps, SKILL_CATCHALL_CAP_ID, generated.capabilityRules, (cap) => cap.ruleId);

  // 产物文件名模式刷回引用 process_doc 的 artifactRule。
  const artifactRules = config.artifactRules.map((artifactRule) => {
    const usesProcessDoc = artifactRule.sourceRuleIds.some((id) => {
      const rule = config.sourceRules.find((r) => r.ruleId === id);
      return rule?.category === 'process_doc';
    });
    return usesProcessDoc ? { ...artifactRule, typePatterns: generated.artifactTypePatterns } : artifactRule;
  });

  return { ...config, sourceRules, capabilityRules, artifactRules };
}

export function emptySemanticRow(): SemanticRow {
  return { code: '', displayName: '', description: '', aliases: [], artifactPatterns: [] };
}
