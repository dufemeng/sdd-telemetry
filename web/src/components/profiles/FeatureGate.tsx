import type { ReactNode } from 'react';
import type { ProfileCapabilityManifest } from '@sdd-telemetry/api';
import { useShellContext } from '@/components/layout/useShellContext';
import { useProfileManifest } from '@/pages/profiles/useProfiles';

type Capability = keyof ProfileCapabilityManifest;

interface FeatureGateProps {
  capability: Capability;
  children: ReactNode;
  /** 能力不可用时的占位（默认隐藏）。 */
  fallback?: ReactNode;
}

/**
 * 按当前 profile 的 manifest 能力降级（Task 20）。
 * manifest 未加载时乐观渲染 children（避免闪烁）；显式 false 才降级。
 * sdd-default 全部能力为 true，因此当前不隐藏任何东西，但降级逻辑就位，
 * 后续接入 A/B（某能力缺省）时无需改页面。
 */
export function FeatureGate({ capability, children, fallback = null }: FeatureGateProps) {
  const { profileId } = useShellContext();
  const manifest = useProfileManifest(profileId);
  if (manifest && manifest[capability] === false) {
    return <>{fallback}</>;
  }
  return <>{children}</>;
}
