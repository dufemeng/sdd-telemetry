import { createHash } from 'node:crypto';
import path from 'node:path';
import {
  BOSS_A_MONOREPO_PROFILE_ID,
  getProfileConfig,
  type LocalPathSourceRule,
  type WorkflowProfileConfig,
} from '@sdd-telemetry/api';

export const BOSS_A_RULE_VERSION = 'boss-a-local-path-v1';

const READ_ACTIONS = new Set(['read', 'grep', 'glob']);
const WRITE_ACTIONS = new Set(['write', 'edit', 'update']);

export interface BossASourceMatch {
  rule: LocalPathSourceRule;
  sourceCategory: 'process_doc' | 'knowledge' | 'code';
  actionType: string;
  normalizedLocator: string;
  relativeLocator: string;
  normalizedRelativeLocator: string;
  deliveryUnit?: BossADeliveryUnit;
  artifact?: BossAArtifact;
  knowledge?: BossAKnowledge;
  code?: BossACode;
  capabilityCode: string;
  capabilityDisplayName: string;
}

export interface BossADeliveryUnit {
  deliveryUnitKey: string;
  normalizedUnitLocator: string;
  businessDomain: string | null;
  unitSlug: string | null;
  title: string | null;
  relativeLocator: string;
}

export interface BossAArtifact {
  artifactKey: string;
  artifactType: string;
  artifactLocator: string;
  artifactTitle: string | null;
}

export interface BossAKnowledge {
  knowledgeDomain: string | null;
  relativePath: string;
}

export interface BossACode {
  repoKind: 'frontend' | 'backend';
  repoName: string;
  moduleName: string | null;
}

export interface ResolvedRule {
  rule: LocalPathSourceRule;
  absoluteRoot: string;
  profileRoot: string;
}

export function getBossAProfileConfig(): WorkflowProfileConfig {
  const config = getProfileConfig(BOSS_A_MONOREPO_PROFILE_ID);
  if (!config) throw new Error(`missing profile config: ${BOSS_A_MONOREPO_PROFILE_ID}`);
  return config;
}

export function resolveBossARules(
  config = getBossAProfileConfig(),
  env: Record<string, string | undefined> = process.env,
): ResolvedRule[] {
  return config.sourceRules
    .filter((rule): rule is LocalPathSourceRule => rule.kind === 'local_path' && rule.enabled)
    .map((rule) => {
      const root = env[rule.rootEnv];
      if (!root) {
        throw new Error(`${rule.rootEnv} is required for ${config.profileId}`);
      }
      const profileRoot = normalizeRoot(root);
      return {
        rule,
        profileRoot,
        absoluteRoot: normalizePath(path.posix.join(profileRoot, rule.relativeRoot)),
      };
    })
    .sort((a, b) => b.rule.priority - a.rule.priority);
}

export function matchBossASource(
  locator: string | null,
  actionType: string,
  profileId = BOSS_A_MONOREPO_PROFILE_ID,
  rules?: ResolvedRule[],
): BossASourceMatch | null {
  if (profileId !== BOSS_A_MONOREPO_PROFILE_ID || !locator) return null;
  const resolvedRules = rules ?? resolveBossARules();
  const normalizedLocator = normalizePath(locator);
  for (const resolved of resolvedRules) {
    if (!(resolved.rule.actions as string[]).includes(actionType)) continue;
    if (!isInside(normalizedLocator, resolved.absoluteRoot)) continue;
    const relativeLocator = stripRoot(normalizedLocator, resolved.absoluteRoot);
    // 裸根目录本身（locator === root）不是文件级事实，跳过，避免造出 unknown 需求/伪召回。
    if (relativeLocator === '') continue;
    const normalizedRelativeLocator = `${resolved.rule.relativeRoot}/${relativeLocator}`;
    const base = {
      rule: resolved.rule,
      sourceCategory: resolved.rule.category,
      actionType,
      normalizedLocator,
      relativeLocator,
      normalizedRelativeLocator,
    };
    if (resolved.rule.category === 'process_doc') {
      const deliveryUnit = parseBossADeliveryUnit(profileId, normalizedRelativeLocator);
      const artifact = parseBossAArtifact(profileId, deliveryUnit, normalizedRelativeLocator);
      return {
        ...base,
        deliveryUnit,
        artifact,
        capabilityCode: WRITE_ACTIONS.has(actionType) ? 'plan-doc-update' : 'plan-doc-read',
        capabilityDisplayName: WRITE_ACTIONS.has(actionType) ? '计划文档更新' : '计划文档读取',
      };
    }
    if (resolved.rule.category === 'knowledge') {
      return {
        ...base,
        knowledge: parseBossAKnowledge(relativeLocator),
        capabilityCode: 'knowledge-recall',
        capabilityDisplayName: '知识库读取',
      };
    }
    if (resolved.rule.category === 'code' && resolved.rule.repoKind) {
      const code = parseBossACode(resolved.rule.relativeRoot, relativeLocator, resolved.rule.repoKind);
      const isWrite = WRITE_ACTIONS.has(actionType);
      return {
        ...base,
        code,
        capabilityCode: `${resolved.rule.repoKind}-code-${isWrite ? 'change' : 'read'}`,
        capabilityDisplayName: `${resolved.rule.repoKind === 'frontend' ? '前端' : '后端'}代码${isWrite ? '变更' : '读取'}`,
      };
    }
  }
  return null;
}

export function parseBossADeliveryUnit(
  profileId: string,
  normalizedRelativeLocator: string,
): BossADeliveryUnit {
  const parts = normalizedRelativeLocator.split('/').filter(Boolean);
  const underPlan = parts[0] === 'plan' ? parts.slice(1) : parts;
  const first = underPlan[0] ?? 'unknown';
  let businessDomain: string | null = null;
  let unitSlug: string | null = null;
  let normalizedUnitLocator: string;

  if (underPlan.length === 1) {
    unitSlug = stripExt(first);
    normalizedUnitLocator = `plan/${unitSlug}`;
  } else if (underPlan.length >= 3) {
    businessDomain = first;
    unitSlug = underPlan[1] ?? null;
    normalizedUnitLocator = `plan/${businessDomain}/${unitSlug}`;
  } else {
    unitSlug = first;
    normalizedUnitLocator = `plan/${unitSlug}`;
  }

  return {
    deliveryUnitKey: sha256(`${profileId}:du:${normalizedUnitLocator}`),
    normalizedUnitLocator,
    businessDomain,
    unitSlug,
    title: unitSlug,
    relativeLocator: normalizedUnitLocator,
  };
}

export function parseBossAArtifact(
  profileId: string,
  deliveryUnit: BossADeliveryUnit,
  normalizedRelativeLocator: string,
): BossAArtifact {
  const artifactLocator = normalizedRelativeLocator;
  const name = path.posix.basename(artifactLocator);
  const artifactType = stripExt(artifactLocator) === deliveryUnit.normalizedUnitLocator
    ? 'plan'
    : inferArtifactType(name);
  return {
    artifactKey: sha256(`${profileId}:artifact:${deliveryUnit.deliveryUnitKey}:${artifactLocator}`),
    artifactType,
    artifactLocator,
    artifactTitle: name,
  };
}

export function parseBossAKnowledge(relativeLocator: string): BossAKnowledge {
  const parts = relativeLocator.split('/').filter(Boolean);
  return {
    relativePath: `docs/${relativeLocator}`,
    knowledgeDomain: parts.length > 1 ? parts[0] ?? null : null,
  };
}

export function parseBossACode(
  rootName: string,
  relativeLocator: string,
  repoKind: 'frontend' | 'backend',
): BossACode {
  const parts = relativeLocator.split('/').filter(Boolean);
  // 文件直接在 repo 根下（无子目录）时 repoName 回退为根名（frontend_repo / backend_repo），
  // 不能把文件名当成 repoName。
  return {
    repoKind,
    repoName: parts.length > 1 ? parts[0]! : rootName,
    moduleName: parts[1] ?? null,
  };
}

export function bossAStableKey(profileId: string, kind: string, sourceReferenceKey: string): string {
  return sha256(`${profileId}:${kind}:${sourceReferenceKey}`);
}

export function isBossAReadAction(actionType: string): boolean {
  return READ_ACTIONS.has(actionType);
}

export function isBossAWriteAction(actionType: string): boolean {
  return WRITE_ACTIONS.has(actionType);
}

function inferArtifactType(name: string): string {
  const lower = name.toLowerCase();
  if (lower.includes('plan') || lower.includes('proposal') || lower.includes('prd')) return 'plan';
  if (lower.includes('design')) return 'design';
  if (lower.includes('task') || lower.includes('todo')) return 'task';
  if (lower.includes('review')) return 'review';
  return 'process_doc';
}

function stripRoot(locator: string, root: string): string {
  return locator === root ? '' : locator.slice(root.length + 1);
}

function isInside(locator: string, root: string): boolean {
  return locator === root || locator.startsWith(`${root}/`);
}

function stripExt(value: string): string {
  const ext = path.posix.extname(value);
  return ext ? value.slice(0, -ext.length) : value;
}

function normalizeRoot(value: string): string {
  return normalizePath(value).replace(/\/+$/, '');
}

function normalizePath(value: string): string {
  return path.posix.normalize(value.replace(/\\/g, '/'));
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}
