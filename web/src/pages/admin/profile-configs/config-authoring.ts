import {
  buildSddSkillConfig,
  type CapabilityRule,
  type LocalPathSourceRule,
  type SourceRule,
  type UserRootKey,
  type WorkflowProfileConfig,
} from '@sdd-telemetry/api';

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
  knowledge: { label: '知识库读取', hint: '工程师读了哪些知识库文档', icon: '📚' },
  process_doc: { label: '过程文档', hint: '需求 / 设计 / 任务等过程文档写在哪', icon: '📝' },
  code: { label: '代码读写', hint: '实现代码读写发生在哪', icon: '💻' },
};

export const CONTENT_SOURCE_TYPE_LABEL: Record<ContentSourceType, string> = {
  path_contains: '路径包含',
  user_root: '按用户根',
  code_catchall: '非文档的所有路径',
  url: 'URL 前缀',
  mcp: 'MCP 文档',
};

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

/** 把一条内容行写回(或新建)对应类别的 path/url 规则字段。 */
function applyContentRow(rule: LocalPathSourceRule | SourceRule, row: ContentRow): SourceRule {
  if (row.sourceType === 'url' && rule.locatorType === 'url') {
    return { ...rule, urlPrefixes: row.urlPrefixes };
  }
  if (row.sourceType === 'mcp' && rule.locatorType === 'mcp_doc') {
    return { ...rule, urlPrefixes: row.urlPrefixes };
  }
  if (rule.locatorType !== 'path') return rule;
  if (row.sourceType === 'user_root') {
    return { ...rule, userRootKey: row.userRootKey ?? undefined, pathContains: undefined, excludeGlobs: row.excludeGlobs.length ? row.excludeGlobs : undefined };
  }
  if (row.sourceType === 'code_catchall') {
    return { ...rule, pathRegexes: ['.+'], excludeUserRootKeys: row.excludeUserRootKeys, excludeGlobs: row.excludeGlobs.length ? row.excludeGlobs : undefined };
  }
  return {
    ...rule,
    pathContains: row.pathContains,
    userRootKey: undefined,
    excludeGlobs: row.excludeGlobs.length ? row.excludeGlobs : undefined,
  };
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
  const generated = buildSddSkillConfig(
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
