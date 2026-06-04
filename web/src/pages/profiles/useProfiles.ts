import { keepPreviousData, useQuery } from '@tanstack/react-query';
import type {
  ProfileCapabilityManifest,
  ProfileDemand,
  ProfileOverview,
  ProfileSummary,
} from '@sdd-telemetry/api';
import { requestData } from '@/api/client';

export function useProfiles() {
  return useQuery({
    queryKey: ['profiles'],
    queryFn: () => requestData<ProfileSummary[]>('/api/profiles'),
    staleTime: 5 * 60_000,
  });
}

/** 当前 profile 的能力 manifest，用于看板按能力降级（Task 20）。 */
export function useProfileManifest(profileId: string): ProfileCapabilityManifest | undefined {
  const { data } = useProfiles();
  return data?.find((p) => p.profileId === profileId)?.manifest;
}

/** 产出分析列表（delivery unit / 需求，Task 20）。 */
export function useProfileDemands(profileId: string, fromIso?: string) {
  const query = fromIso ? `?from=${fromIso}` : '';
  return useQuery({
    queryKey: ['profile-demands', profileId, fromIso],
    queryFn: () =>
      requestData<ProfileDemand[]>(`/api/profiles/${profileId}/demands${query}`),
    staleTime: 30_000,
    placeholderData: keepPreviousData,
    enabled: Boolean(profileId),
  });
}

export function useProfileOverview(profileId: string, fromIso?: string) {
  const query = fromIso ? `?from=${fromIso}` : '';
  return useQuery({
    queryKey: ['profile-overview', profileId, fromIso],
    queryFn: () =>
      requestData<ProfileOverview>(`/api/profiles/${profileId}/overview${query}`),
    staleTime: 15_000,
    placeholderData: keepPreviousData,
    enabled: Boolean(profileId),
  });
}
