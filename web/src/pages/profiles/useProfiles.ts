import { keepPreviousData, useQuery } from '@tanstack/react-query';
import type { ProfileOverview, ProfileSummary } from '@sdd-telemetry/api';
import { requestData } from '@/api/client';

export function useProfiles() {
  return useQuery({
    queryKey: ['profiles'],
    queryFn: () => requestData<ProfileSummary[]>('/api/profiles'),
    staleTime: 5 * 60_000,
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
