import type { ProfileCapabilityManifest, ProfileStatus } from './contracts/profile.contract';

export const SDD_DEFAULT_PROFILE_ID = 'sdd-default';
export const BOSS_A_MONOREPO_PROFILE_ID = 'boss-a-monorepo';

export type ProfileRuleConfidence = 'high' | 'medium' | 'low';
export type LocalPathSourceCategory = 'process_doc' | 'knowledge' | 'code';
export type LocalPathAction = 'read' | 'grep' | 'glob' | 'write' | 'edit' | 'update';
export type RepoKind = 'frontend' | 'backend';

export interface ProfileRuleBase {
  ruleId: string;
  priority: number;
  confidence: ProfileRuleConfidence;
  enabled: boolean;
  description?: string;
}

export interface LocalPathSourceRule extends ProfileRuleBase {
  kind: 'local_path';
  category: LocalPathSourceCategory;
  rootEnv: string;
  relativeRoot: string;
  actions: LocalPathAction[];
  repoKind?: RepoKind;
}

export interface ProfilePresentationConfig {
  workflowKind: 'sdd' | 'local_path_monorepo';
  maturityStages: string[];
  artifactStageOrder: string[];
  hiddenMetrics: string[];
  knowledgeCoverageMode: 'filesystem_scan' | 'recall_facts';
}

export interface WorkflowProfileConfig {
  profileId: string;
  displayName: string;
  status: ProfileStatus;
  manifest: ProfileCapabilityManifest;
  sourceRules: LocalPathSourceRule[];
  capabilityRules: ProfileRuleBase[];
  deliveryUnitRules: ProfileRuleBase[];
  artifactRules: ProfileRuleBase[];
  knowledgeRules: ProfileRuleBase[];
  codeSourceRules: ProfileRuleBase[];
  attributionPolicy: {
    sessionWindowMinutes?: number;
    [key: string]: unknown;
  };
  presentation: ProfilePresentationConfig;
}

export const SDD_PRESENTATION: ProfilePresentationConfig = {
  workflowKind: 'sdd',
  maturityStages: ['proposal', 'design', 'task', 'codereview'],
  artifactStageOrder: ['proposal', 'design', 'task', 'review'],
  hiddenMetrics: [],
  knowledgeCoverageMode: 'filesystem_scan',
};

export const BOSS_A_PRESENTATION: ProfilePresentationConfig = {
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

const allPathActions: LocalPathAction[] = ['read', 'grep', 'glob', 'write', 'edit', 'update'];
const readActions: LocalPathAction[] = ['read', 'grep', 'glob'];
const writeActions: LocalPathAction[] = ['write', 'edit', 'update'];

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
  presentation: SDD_PRESENTATION,
};

const bossAMonorepoProfile: WorkflowProfileConfig = {
  profileId: BOSS_A_MONOREPO_PROFILE_ID,
  displayName: 'Boss A Monorepo',
  status: 'active',
  manifest: {
    capabilityUsage: true,
    deliveryUnits: true,
    artifacts: true,
    artifactTimeline: true,
    knowledgeRecalls: true,
    codeChanges: true,
    errors: false,
    evaluation: false,
    alerts: false,
  },
  sourceRules: [
    {
      kind: 'local_path',
      ruleId: 'boss-a-plan-process-doc',
      priority: 100,
      confidence: 'high',
      enabled: true,
      category: 'process_doc',
      rootEnv: 'BOSS_A_MONOREPO_ROOT',
      relativeRoot: 'plan',
      actions: allPathActions,
      description: 'Boss A plan process documents',
    },
    {
      kind: 'local_path',
      ruleId: 'boss-a-docs-knowledge',
      priority: 90,
      confidence: 'high',
      enabled: true,
      category: 'knowledge',
      rootEnv: 'BOSS_A_MONOREPO_ROOT',
      relativeRoot: 'docs',
      actions: readActions,
      description: 'Boss A local knowledge docs',
    },
    {
      kind: 'local_path',
      ruleId: 'boss-a-frontend-code',
      priority: 80,
      confidence: 'high',
      enabled: true,
      category: 'code',
      rootEnv: 'BOSS_A_MONOREPO_ROOT',
      relativeRoot: 'frontend_repo',
      actions: allPathActions,
      repoKind: 'frontend',
      description: 'Boss A frontend code repositories',
    },
    {
      kind: 'local_path',
      ruleId: 'boss-a-backend-code',
      priority: 80,
      confidence: 'high',
      enabled: true,
      category: 'code',
      rootEnv: 'BOSS_A_MONOREPO_ROOT',
      relativeRoot: 'backend_repo',
      actions: allPathActions,
      repoKind: 'backend',
      description: 'Boss A backend code repositories',
    },
  ],
  capabilityRules: [],
  deliveryUnitRules: [],
  artifactRules: [],
  knowledgeRules: [],
  codeSourceRules: [],
  attributionPolicy: {
    sessionWindowMinutes: 120,
    processDocWriteActions: writeActions,
  },
  presentation: BOSS_A_PRESENTATION,
};

const PROFILE_REGISTRY: Record<string, WorkflowProfileConfig> = {
  [SDD_DEFAULT_PROFILE_ID]: sddDefaultProfile,
  [BOSS_A_MONOREPO_PROFILE_ID]: bossAMonorepoProfile,
};

export function listProfileConfigs(): WorkflowProfileConfig[] {
  return Object.values(PROFILE_REGISTRY);
}

export function getProfileConfig(profileId: string): WorkflowProfileConfig | undefined {
  return PROFILE_REGISTRY[profileId];
}
