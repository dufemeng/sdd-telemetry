import { createHash } from 'node:crypto';
import type { WorkflowProfileConfig, SkillSourceRule } from '@sdd-telemetry/api';

const PROMPT_MAX_CHARS = 256000;
const PREVIEW_MAX_CHARS = 240;

/**
 * 归一化仅用于判重 (hash)。规则固定且保守:
 * Unicode NFC + CRLF/CR 统一为 LF + 首尾 trim。保留内部空格/缩进/换行,
 * 避免误合并含代码或 YAML 的不同需求。原始快照不改写。
 */
export function normalizePromptForDedup(prompt: string): string {
  return prompt.normalize('NFC').replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();
}

/**
 * item_key = sha256(JSON.stringify([profileId, targetSkill ?? "", targetArtifactType ?? "", normalizedPrompt]))
 * 结构化序列化消除分隔符和 NULL 歧义; 相同逻辑样本不会因 manual/cleaned 来源不同而重复。
 */
export function computeItemKey(input: {
  profileId: string;
  targetSkill: string | null;
  targetArtifactType: string | null;
  normalizedPrompt: string;
}): string {
  const payload = JSON.stringify([
    input.profileId,
    input.targetSkill ?? '',
    input.targetArtifactType ?? '',
    input.normalizedPrompt,
  ]);
  return createHash('sha256').update(payload).digest('hex');
}

/**
 * 从 profile config 解析 capability 对应的规范可执行 skill。
 * 路径: capability rule.sourceRuleIds -> 找到 locatorType='skill' 的 source rule
 *       -> 取第一个非空 skillNames[0]。
 * 必须排除两类"不是可执行 skill"的情况 (KTD8: 不把 raw locator/语义代码猜成 skill):
 *   - surfaceRole === 'fallback' 的 capability
 *   - skillNames === ['*'] 的 catch-all rule
 * 解析失败返回 null (调用方据此 disabled)。
 */
export function resolveTargetSkill(
  config: WorkflowProfileConfig,
  capabilityCode: string,
): string | null {
  const rule = config.capabilityRules.find((r) => r.capabilityCode === capabilityCode);
  if (!rule) return null;
  if (rule.surfaceRole === 'fallback') return null;
  const sourceRuleIds = rule.sourceRuleIds ?? [];
  for (const id of sourceRuleIds) {
    const source = config.sourceRules.find((s) => s.ruleId === id);
    if (!source) continue;
    if (source.locatorType !== 'skill') continue;
    const skillRule = source as SkillSourceRule;
    if (skillRule.skillNames.length === 0) continue;
    if (skillRule.skillNames.length === 1 && skillRule.skillNames[0] === '*') continue;
    return skillRule.skillNames[0];
  }
  return null;
}

/** 产物类型仅显式映射 design/proposal/task; 其余返回 null。 */
export function mapArtifactType(
  capabilityCode: string | null,
): 'design' | 'proposal' | 'tasks' | null {
  switch (capabilityCode) {
    case 'design': return 'design';
    case 'proposal': return 'proposal';
    case 'task': return 'tasks';
    default: return null;
  }
}

/** 列表摘要, 超 240 字符截断 (不补省略号, 节省字节)。 */
export function previewPrompt(prompt: string): string {
  return prompt.length > PREVIEW_MAX_CHARS ? prompt.slice(0, PREVIEW_MAX_CHARS) : prompt;
}

/** 导入正文长度上限, 超过的单条跳过 (skippedOversize)。 */
export const PROMPT_MAX = PROMPT_MAX_CHARS;
