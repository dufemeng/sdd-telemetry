import type { ProfileCapabilityManifest, ProfileStatus } from '@sdd-telemetry/api';

/**
 * Profile 配置模型（MVP-1，Task 3 / Task 4）
 *
 * 第一期使用版本化代码配置，不做配置 UI、不做多版本读数（current-态 projection）。
 * 因此 config 不包含 `version` 字段；派生数据的版本溯源放在 projection 明细的
 * `rule_version` / `projection_run_id`。
 *
 * 规则集合（sourceRules / capabilityRules / ...）在后续 PR 的 projection 任务里填充并消费。
 * PR-1 只服务 `/api/profiles` 列表与 manifest，因此 sdd-default 的规则数组先留空，
 * 由 PR-4 / knowledge projection 从现有 sdd_* 元数据转换生成。
 */

export type ProfileRuleConfidence = 'high' | 'medium' | 'low';

export interface ProfileRuleBase {
  ruleId: string;
  priority: number;
  confidence: ProfileRuleConfidence;
  enabled: boolean;
  description?: string;
}

export interface WorkflowProfileConfig {
  profileId: string;
  displayName: string;
  status: ProfileStatus;
  manifest: ProfileCapabilityManifest;
  sourceRules: ProfileRuleBase[];
  capabilityRules: ProfileRuleBase[];
  deliveryUnitRules: ProfileRuleBase[];
  artifactRules: ProfileRuleBase[];
  knowledgeRules: ProfileRuleBase[];
  codeSourceRules: ProfileRuleBase[];
  attributionPolicy: Record<string, unknown>;
}

export const SDD_DEFAULT_PROFILE_ID = 'sdd-default';

const sddDefaultProfile: WorkflowProfileConfig = {
  profileId: SDD_DEFAULT_PROFILE_ID,
  displayName: 'SDD 默认工作流',
  status: 'active',
  manifest: {
    capabilityUsage: true,
    deliveryUnits: true,
    artifacts: true,
    artifactTimeline: true,
    knowledgeRecalls: true,
    codeChanges: true,
    // errors 第一期没有 projection / legacy adapter 任务，置 false；后续监控告警 PR 再打开。
    errors: false,
    evaluation: false,
    alerts: false,
  },
  sourceRules: [],
  capabilityRules: [],
  deliveryUnitRules: [],
  artifactRules: [],
  knowledgeRules: [],
  codeSourceRules: [],
  attributionPolicy: {},
};

const PROFILE_REGISTRY: Record<string, WorkflowProfileConfig> = {
  [SDD_DEFAULT_PROFILE_ID]: sddDefaultProfile,
};

export function listProfileConfigs(): WorkflowProfileConfig[] {
  return Object.values(PROFILE_REGISTRY);
}

export function getProfileConfig(profileId: string): WorkflowProfileConfig | undefined {
  return PROFILE_REGISTRY[profileId];
}
