import {
  EMPTY_ATTRIBUTION_POLICY,
  SDD_DEFAULT_PROFILE_ID,
  SDD_PRESENTATION,
  type WorkflowProfileConfig,
} from '../profile-types';

export const sddDefaultProfile: WorkflowProfileConfig = {
  profileId: SDD_DEFAULT_PROFILE_ID,
  displayName: 'SDD 默认工作流',
  status: 'active',
  projectionMode: 'sdd_bridge',
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
  deliveryUnitRules: [],
  artifactRules: [],
  capabilityRules: [],
  attributionPolicy: EMPTY_ATTRIBUTION_POLICY,
  presentation: SDD_PRESENTATION,
};
