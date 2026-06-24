import { createHash } from 'node:crypto';
import path from 'node:path';

/**
 * Source Reference 抽取算子（MVP-1，Task 5）
 *
 * 纯函数：把一次工具调用的事实，投影成 0..N 条 source reference。
 * - 从完整 tool input 抽取（调用方负责传完整 attributes_json.tool_input，不是 4096 preview）。
 * - 支持 double-encoded JSON（最多受控解码 3 层）。
 * - 解码失败记录 parse_failed evidence、降级为 unknown locator，不抛错。
 * - 身份与幂等基于稳定的 reference_key；stable_evidence_id 取 tool_use_id，回退 event_id。
 *
 * 注：第一期聚焦 input direction（SDD-default 的 locator 都在 tool input）。result direction
 * 抽取（在线文档创建/更新返回的 docId 常在 tool result）留待在线文档 profile 接入时扩展。
 */

export const SOURCE_REFERENCE_RULE_VERSION = 'src-ref-v1';

export type SourceLocatorType = 'path' | 'pattern' | 'url' | 'mcp_doc' | 'skill' | 'unknown';
export type SourceDirection = 'input' | 'result' | 'event';

export interface ToolCallFact {
  toolUseId: string | null;
  eventId: string | null;
  toolName: string;
  mcpServer: string | null;
  /**
   * MCP 真实工具名（如 skylark_doc_update）。Claude Code 把 tool_name 匿名成 "mcp_tool"，
   * 真名经 writer 从 tool_result.tool_parameters 解出后填这里；旧式 mcp__server__tool 命名为 null。
   */
  mcpToolName: string | null;
  /** attributes.tool_input 原值：可能是 double-encoded JSON 字符串，也可能已是对象 */
  toolInput: unknown;
  interactionId: number | null;
  toolCallId: number | null;
  userId: number | null;
  sessionId: string | null;
  promptId: string | null;
  eventTime: Date | null;
}

export interface SourceReferenceInput {
  referenceKey: string;
  interactionId: number | null;
  toolCallId: number | null;
  eventId: string | null;
  userId: number | null;
  sessionId: string | null;
  promptId: string | null;
  actionType: string;
  locatorType: SourceLocatorType;
  direction: SourceDirection;
  rawLocator: string | null;
  normalizedLocator: string | null;
  normalizedLocatorHash: string | null;
  mcpServer: string | null;
  mcpToolName: string | null;
  docId: string | null;
  url: string | null;
  title: string | null;
  spaceId: string | null;
  collectionId: string | null;
  docType: string | null;
  eventTime: Date | null;
  evidenceJson: Record<string, unknown>;
  ruleVersion: string;
}

const PATH_TOOL_ACTIONS: Record<string, string> = {
  Read: 'read',
  Grep: 'grep',
  Glob: 'glob',
  Write: 'write',
  Edit: 'edit',
  MultiEdit: 'edit',
};

/**
 * 在线文档读写动作映射。Claude Code 把 MCP tool_name 匿名成 "mcp_tool"，真名（skylark_doc_update 等）
 * 经 writer 从 tool_result.tool_parameters 解出。这里按真名语义词派生动作；否则在线文档调用恒记为 read，
 * 下游 process_doc 写入计数（isWriteAction = {write,edit,update}）永远过滤掉 read → 看板恒 0。
 * 词表是默认启发式，命中按顺序取第一档；后续应迁到 source rule 在线配置，不要在算子里继续堆词。
 */
const ONLINE_DOC_ACTION_RULES: ReadonlyArray<readonly [RegExp, string]> = [
  [/(update|modify|append|rename|move|patch)/i, 'update'],
  [/(delete|remove)/i, 'delete'],
  [/(create|write|save|submit|publish|upload|edit)/i, 'write'],
];

/** 按 MCP 真实工具名派生在线文档动作；无真名或无写语义词时回退 read。 */
export function deriveOnlineDocAction(mcpToolName: string | null): string {
  if (!mcpToolName) return 'read';
  for (const [pattern, action] of ONLINE_DOC_ACTION_RULES) {
    if (pattern.test(mcpToolName)) return action;
  }
  return 'read';
}

export function extractSourceReferences(fact: ToolCallFact): SourceReferenceInput[] {
  const stableEvidenceId = fact.toolUseId ?? fact.eventId;
  if (!stableEvidenceId) {
    // 没有稳定证据 id 无法构造幂等 key，跳过。
    return [];
  }

  const decoded = decodeMaybeDoubleEncoded(fact.toolInput);
  if (decoded.parseFailed) {
    return [
      buildReference(fact, stableEvidenceId, {
        actionType: 'unknown',
        locatorType: 'unknown',
        rawLocator: previewString(fact.toolInput),
        normalizedLocator: null,
        evidence: { parseFailed: true, reason: decoded.reason ?? 'json_parse_failed' },
      }),
    ];
  }

  const input = decoded.value;
  if (!isRecord(input)) {
    return [];
  }

  const pathAction = PATH_TOOL_ACTIONS[fact.toolName];
  if (pathAction) {
    return extractPaths(fact, stableEvidenceId, pathAction, input);
  }

  if (isMcpTool(fact)) {
    return extractOnlineDoc(fact, stableEvidenceId, input);
  }

  // 非 locator 类工具（Bash、Task 等）不产生 source reference。
  return [];
}

function extractPaths(
  fact: ToolCallFact,
  stableEvidenceId: string,
  actionType: string,
  input: Record<string, unknown>,
): SourceReferenceInput[] {
  const candidates = collectPathCandidates(fact.toolName, input);
  const refs: SourceReferenceInput[] = [];
  for (const cand of candidates) {
    // glob/grep 的 pattern（如 **/*.ts）不是真实路径，标 locator_type=pattern；
    // 下游 knowledge/code 算子只取 path，pattern 自然不进核心 KPI（进证据/下钻）。
    const isPattern = cand.kind === 'pattern';
    refs.push(
      buildReference(fact, stableEvidenceId, {
        actionType,
        locatorType: isPattern ? 'pattern' : 'path',
        rawLocator: cand.value,
        normalizedLocator: isPattern ? cand.value : normalizePath(cand.value),
        evidence: { toolName: fact.toolName, field: cand.kind },
      }),
    );
  }
  return refs;
}

interface PathCandidate {
  value: string;
  kind: 'path' | 'pattern';
}

function collectPathCandidates(toolName: string, input: Record<string, unknown>): PathCandidate[] {
  const out: PathCandidate[] = [];
  const push = (value: unknown, kind: 'path' | 'pattern') => {
    if (typeof value === 'string' && value.trim() !== '') out.push({ value, kind });
  };

  switch (toolName) {
    case 'Glob':
      // path 是搜索目录（真实路径）；只有 pattern 时才是通配模式
      if (typeof input.path === 'string') push(input.path, 'path');
      else push(input.pattern, 'pattern');
      break;
    case 'Grep':
      if (typeof input.path === 'string') push(input.path, 'path');
      else push(input.glob, 'pattern');
      break;
    default: {
      // Read / Write / Edit / MultiEdit：file_path 可能是字符串或数组
      const fp = input.file_path ?? input.path;
      if (Array.isArray(fp)) {
        for (const item of fp) push(item, 'path');
      } else {
        push(fp, 'path');
      }
    }
  }
  return out;
}

function extractOnlineDoc(
  fact: ToolCallFact,
  stableEvidenceId: string,
  input: Record<string, unknown>,
): SourceReferenceInput[] {
  const url = firstString(input, ['url', 'uri', 'link', 'href']);
  const docId = firstString(input, ['docId', 'doc_id', 'documentId', 'document_id', 'id']);
  const collectionId = firstString(input, ['collectionId', 'collection_id', 'bookId', 'book_id']);
  const spaceId = firstString(input, ['spaceId', 'space_id']);
  const docType = firstString(input, ['docType', 'doc_type', 'type']);
  const title = firstString(input, ['title', 'name']);

  // 真名优先取 fact.mcpToolName（writer 解出）；回退 fact.toolName（旧式 mcp__server__tool）。
  const actionType = deriveOnlineDocAction(fact.mcpToolName ?? fact.toolName);

  const locator = url ?? docId ?? collectionId;
  if (!locator) {
    // MCP 调用但拿不到任何在线文档 locator：记 unknown，便于排查、不进 KPI。
    return [
      buildReference(fact, stableEvidenceId, {
        actionType,
        locatorType: 'unknown',
        rawLocator: null,
        normalizedLocator: null,
        evidence: { mcpServer: fact.mcpServer, toolName: fact.toolName, reason: 'no_online_locator' },
      }),
    ];
  }

  const locatorType: SourceLocatorType = url ? 'url' : 'mcp_doc';
  const normalized = url ? normalizeUrl(url) : locator;
  return [
    buildReference(fact, stableEvidenceId, {
      actionType,
      locatorType,
      rawLocator: locator,
      normalizedLocator: normalized,
      docId,
      url,
      collectionId,
      spaceId,
      docType,
      title,
      evidence: { mcpServer: fact.mcpServer, toolName: fact.toolName },
    }),
  ];
}

interface ReferenceParts {
  actionType: string;
  locatorType: SourceLocatorType;
  rawLocator: string | null;
  normalizedLocator: string | null;
  docId?: string | null;
  url?: string | null;
  collectionId?: string | null;
  spaceId?: string | null;
  docType?: string | null;
  title?: string | null;
  evidence: Record<string, unknown>;
}

function buildReference(
  fact: ToolCallFact,
  stableEvidenceId: string,
  parts: ReferenceParts,
): SourceReferenceInput {
  const direction: SourceDirection = 'input';
  const normalizedLocatorHash = parts.normalizedLocator
    ? sha256(parts.normalizedLocator)
    : null;
  const referenceKey = sha256(
    [
      stableEvidenceId,
      direction,
      parts.actionType,
      parts.locatorType,
      normalizedLocatorHash ?? '',
    ].join(':'),
  );

  return {
    referenceKey,
    interactionId: fact.interactionId,
    toolCallId: fact.toolCallId,
    eventId: fact.eventId,
    userId: fact.userId,
    sessionId: fact.sessionId,
    promptId: fact.promptId,
    actionType: parts.actionType,
    locatorType: parts.locatorType,
    direction,
    rawLocator: parts.rawLocator,
    normalizedLocator: parts.normalizedLocator,
    normalizedLocatorHash,
    mcpServer: fact.mcpServer,
    mcpToolName: isMcpTool(fact) ? (fact.mcpToolName ?? fact.toolName) : null,
    docId: parts.docId ?? null,
    url: parts.url ?? null,
    title: parts.title ?? null,
    spaceId: parts.spaceId ?? null,
    collectionId: parts.collectionId ?? null,
    docType: parts.docType ?? null,
    eventTime: fact.eventTime,
    evidenceJson: { stableEvidenceId, ...parts.evidence },
    ruleVersion: SOURCE_REFERENCE_RULE_VERSION,
  };
}

/** sdd_skill_usages 行的稳定投影输入：把一次技能调用 emit 成 locator_type='skill' 的 source_reference。 */
export interface SkillUsageFact {
  /** sdd_skill_usages.usage_key —— 每次技能调用的稳定幂等键。 */
  usageKey: string;
  /** raw_skill_name —— 技能名，写入 normalized_locator，供 skill source rule 匹配。 */
  skillName: string;
  interactionId: number | null;
  userId: number | null;
  sessionId: string | null;
  promptId: string | null;
  /** per-usage 上下文（写进 evidence，供 flip 时 source_backed capability 复现 bridge 口径）。 */
  invocationTrigger: string | null;
  skillSource: string | null;
  status: string | null;
  eventTime: Date | null;
}

/** 技能调用的合成动作类型（技能无读写语义，统一记为 invoke）。 */
export const SKILL_SOURCE_ACTION = 'invoke';

/**
 * 把一次技能调用（sdd_skill_usages 行）映射成一条 locator_type='skill' 的 source_reference。
 * 粒度 = skill_usage（reference_key 绑 usage_key），保证一次调用一行、reclean 幂等、不按 tool_call 重复。
 */
export function extractSkillSourceReference(fact: SkillUsageFact): SourceReferenceInput | null {
  if (!fact.usageKey || !fact.skillName) return null;
  const direction: SourceDirection = 'input';
  const normalizedLocator = fact.skillName;
  const normalizedLocatorHash = sha256(normalizedLocator);
  const referenceKey = sha256(
    [fact.usageKey, direction, SKILL_SOURCE_ACTION, 'skill', normalizedLocatorHash].join(':'),
  );
  return {
    referenceKey,
    interactionId: fact.interactionId,
    toolCallId: null,
    eventId: null,
    userId: fact.userId,
    sessionId: fact.sessionId,
    promptId: fact.promptId,
    actionType: SKILL_SOURCE_ACTION,
    locatorType: 'skill',
    direction,
    rawLocator: fact.skillName,
    normalizedLocator,
    normalizedLocatorHash,
    mcpServer: null,
    mcpToolName: null,
    docId: null,
    url: null,
    title: null,
    spaceId: null,
    collectionId: null,
    docType: null,
    eventTime: fact.eventTime,
    evidenceJson: {
      skillUsageKey: fact.usageKey,
      source: 'skill_usage',
      invocationTrigger: fact.invocationTrigger,
      skillSource: fact.skillSource,
      status: fact.status,
    },
    ruleVersion: SOURCE_REFERENCE_RULE_VERSION,
  };
}

export interface DecodeResult {
  value: unknown;
  parseFailed: boolean;
  reason?: string;
}

/** 受控解码 double-encoded JSON：最多 maxDepth 层，遇非 JSON 字符串即停止。 */
export function decodeMaybeDoubleEncoded(value: unknown, maxDepth = 3): DecodeResult {
  let current = value;
  for (let depth = 0; depth < maxDepth; depth += 1) {
    if (current !== null && typeof current === 'object') {
      return { value: current, parseFailed: false };
    }
    if (typeof current !== 'string') {
      return { value: current, parseFailed: false };
    }
    const trimmed = current.trim();
    // { / [ 是对象/数组；" 是被再包了一层的 JSON 字符串（double-encoding 的中间层）。
    const looksJson =
      trimmed.startsWith('{') || trimmed.startsWith('[') || trimmed.startsWith('"');
    if (!looksJson) {
      // 普通字符串，不是被序列化的 JSON。
      return { value: current, parseFailed: false };
    }
    try {
      current = JSON.parse(trimmed);
    } catch {
      return { value: current, parseFailed: true, reason: 'json_parse_failed' };
    }
  }
  return { value: current, parseFailed: false };
}

function normalizePath(raw: string): string {
  if (raw.startsWith('/')) {
    return path.posix.normalize(raw);
  }
  return raw;
}

function normalizeUrl(raw: string): string {
  try {
    const u = new URL(raw);
    // 去掉末尾斜杠，host 小写；保留 path/hash 用于命中 source rule。
    const pathname = u.pathname.replace(/\/+$/, '');
    return `${u.protocol}//${u.host.toLowerCase()}${pathname}${u.search}${u.hash}`;
  } catch {
    return raw.replace(/\/+$/, '');
  }
}

function firstString(input: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const value = input[key];
    if (typeof value === 'string' && value.trim() !== '') return value;
    // MCP 工具（如语雀）常把 doc_id / book_id 等以 JSON number 下发，强转成字符串 locator，
    // 否则会被判 null → 落到 no_online_locator → 误写成 unknown。
    if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  }
  return null;
}

function isMcpTool(fact: ToolCallFact): boolean {
  return fact.mcpServer != null || fact.toolName.startsWith('mcp__');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function previewString(value: unknown, maxLen = 512): string | null {
  if (value === null || value === undefined) return null;
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  return text.length > maxLen ? text.slice(0, maxLen) : text;
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}
