import type {
  LocalPathSourceRule,
  ProfileRuleConfidence,
  SourceRule,
  WorkflowProfileConfig,
} from './profile-types';

export interface ResolvedSourceRule {
  rule: SourceRule;
  /** 仅 local_path rule 有绝对根；url / mcp_doc 为 null。 */
  resolvedRoot: string | null;
}

export interface RuntimeResolution {
  profileId: string;
  /** 已启用且可解析的规则，按 confidence、priority、ruleId 降序排序。 */
  rules: ResolvedSourceRule[];
  /** 启用但无法解析 root 的规则（必需 env 缺失等）。 */
  unresolved: Array<{ ruleId: string; reason: string }>;
}

const CONFIDENCE_ORDER: Record<ProfileRuleConfidence, number> = { high: 3, medium: 2, low: 1 };

/**
 * 解析 profile 的运行期 source rules：
 * - path：root = env[rootEnv] ?? rootPath ?? join(env[fallbackBaseEnv], relativeRoot)。
 * - path 无 root 但有 pathContains / pathRegexes 时，保留为 fuzzy path rule。
 * - url / mcp_doc：不需要 root。
 * 通用字段驱动，不在此写死任何 profile 后缀。
 */
export function resolveRuntimeProfileConfig(
  config: WorkflowProfileConfig,
  env: Record<string, string | undefined> = {},
): RuntimeResolution {
  const rules: ResolvedSourceRule[] = [];
  const unresolved: Array<{ ruleId: string; reason: string }> = [];

  for (const rule of config.sourceRules) {
    if (!rule.enabled) continue;
    if (rule.locatorType === 'path') {
      const root = resolveLocalPathRoot(rule, env);
      if (!root) {
        // userRootKey 的 root 取自 per-user sdd_users 列，无法在此用 env 解析；保留为待投影时解析的规则。
        if (rule.userRootKey || hasItems(rule.pathContains) || hasItems(rule.pathRegexes)) {
          rules.push({ rule, resolvedRoot: null });
          continue;
        }
        unresolved.push({ ruleId: rule.ruleId, reason: 'missing path matcher (rootEnv / rootPath / fallbackBaseEnv+relativeRoot / userRootKey / pathContains / pathRegexes)' });
        continue;
      }
      rules.push({ rule, resolvedRoot: normalizeRoot(root) });
    } else {
      rules.push({ rule, resolvedRoot: null });
    }
  }

  rules.sort((a, b) => {
    const c = CONFIDENCE_ORDER[b.rule.confidence] - CONFIDENCE_ORDER[a.rule.confidence];
    if (c !== 0) return c;
    if (b.rule.priority !== a.rule.priority) return b.rule.priority - a.rule.priority;
    return a.rule.ruleId.localeCompare(b.rule.ruleId);
  });

  return { profileId: config.profileId, rules, unresolved };
}

function resolveLocalPathRoot(rule: LocalPathSourceRule, env: Record<string, string | undefined>): string | undefined {
  if (rule.rootEnv && env[rule.rootEnv]) return env[rule.rootEnv];
  if (rule.rootPath) return rule.rootPath;
  if (rule.fallbackBaseEnv && rule.relativeRoot && env[rule.fallbackBaseEnv]) {
    return joinPosix(env[rule.fallbackBaseEnv]!, rule.relativeRoot);
  }
  return undefined;
}

function hasItems(value: unknown[] | undefined): boolean {
  return Array.isArray(value) && value.length > 0;
}

function normalizeRoot(value: string): string {
  return value.replace(/\\/g, '/').replace(/\/+$/, '');
}

function joinPosix(base: string, rel: string): string {
  if (rel === '.' || rel === '') return normalizeRoot(base);
  return `${normalizeRoot(base)}/${rel.replace(/^\/+/, '')}`;
}
