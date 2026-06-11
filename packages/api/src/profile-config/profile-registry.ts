import { e2eMonorepoProfile } from './profiles/e2e-monorepo';
import { onlineDocsProfile } from './profiles/online-docs';
import { sddDefaultProfile } from './profiles/sdd-default';
import {
  E2E_MONOREPO_PROFILE_ID,
  ONLINE_DOCS_PROFILE_ID,
  SDD_DEFAULT_PROFILE_ID,
  type WorkflowProfileConfig,
} from './profile-types';

const PROFILE_REGISTRY: Record<string, WorkflowProfileConfig> = {
  [SDD_DEFAULT_PROFILE_ID]: sddDefaultProfile,
  [E2E_MONOREPO_PROFILE_ID]: e2eMonorepoProfile,
  [ONLINE_DOCS_PROFILE_ID]: onlineDocsProfile,
};

export function listProfileConfigs(): WorkflowProfileConfig[] {
  return Object.values(PROFILE_REGISTRY);
}

export function getProfileConfig(profileId: string): WorkflowProfileConfig | undefined {
  return PROFILE_REGISTRY[profileId];
}
