import { keepPreviousData, useQuery } from '@tanstack/react-query';
import type {
  ProfileArtifactTimelineItem,
  ProfileCapabilityManifest,
  ProfileDemand,
  ProfileDemandDetail,
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

export function useProfileManifest(profileId: string): ProfileCapabilityManifest | undefined {
  const { data } = useProfiles();
  return data?.find((p) => p.profileId === profileId)?.manifest;
}

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

export function useProfileDemandDetail(profileId: string, demandId: string | null) {
  return useQuery({
    queryKey: ['profile-demand-detail', profileId, demandId],
    queryFn: () =>
      requestData<ProfileDemandDetail>(`/api/profiles/${profileId}/demands/${demandId}`),
    staleTime: 30_000,
    enabled: Boolean(profileId) && Boolean(demandId),
  });
}

export function useProfileArtifactTimeline(
  profileId: string,
  demandId: string | null,
  artifactId: string | null,
) {
  return useQuery({
    queryKey: ['profile-artifact-timeline', profileId, demandId, artifactId],
    queryFn: () =>
      requestData<{ items: ProfileArtifactTimelineItem[] }>(
        `/api/profiles/${profileId}/demands/${demandId}/artifacts/${artifactId}/timeline`,
      ),
    staleTime: 30_000,
    enabled: Boolean(profileId) && Boolean(demandId) && Boolean(artifactId),
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
