import { keepPreviousData, useQuery } from '@tanstack/react-query';
import type {
  ProfileArtifactTimelineItem,
  ProfileCapabilityAnalytics,
  ProfileCapabilityManifest,
  ProfileCapabilityTimeseries,
  ProfileCapabilityUsageItem,
  ProfileCapabilityUsageSummaryItem,
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

export function useProfileCapabilityAnalytics(profileId: string, fromIso?: string) {
  const query = fromIso ? `?from=${fromIso}` : '';
  return useQuery({
    queryKey: ['profile-capability-analytics', profileId, fromIso],
    queryFn: () =>
      requestData<ProfileCapabilityAnalytics>(`/api/profiles/${profileId}/capabilities/analytics${query}`),
    staleTime: 15_000,
    placeholderData: keepPreviousData,
    enabled: Boolean(profileId),
  });
}

export function useProfileCapabilityTimeseries(profileId: string, fromIso?: string, bucket?: string) {
  const params = new URLSearchParams();
  if (fromIso) params.set('from', fromIso);
  if (bucket) params.set('bucket', bucket);
  const qs = params.toString();
  return useQuery({
    queryKey: ['profile-capability-timeseries', profileId, fromIso, bucket],
    queryFn: () =>
      requestData<ProfileCapabilityTimeseries>(`/api/profiles/${profileId}/capabilities/timeseries${qs ? `?${qs}` : ''}`),
    staleTime: 15_000,
    placeholderData: keepPreviousData,
    enabled: Boolean(profileId),
  });
}

export function useProfileCapabilityUsageSummary(
  profileId: string,
  params: {
    fromIso?: string;
    matched?: 'all' | 'matched' | 'unmatched';
    keyword?: string;
    capabilityCode?: string;
    page: number;
    pageSize: number;
  },
) {
  const qs = new URLSearchParams();
  if (params.fromIso) qs.set('from', params.fromIso);
  if (params.matched) qs.set('matched', params.matched);
  if (params.keyword?.trim()) qs.set('keyword', params.keyword.trim());
  if (params.capabilityCode) qs.set('capabilityCode', params.capabilityCode);
  qs.set('page', String(params.page));
  qs.set('pageSize', String(params.pageSize));
  return useQuery({
    queryKey: ['profile-capability-usage-summary', profileId, params],
    queryFn: () =>
      requestData<{ items: ProfileCapabilityUsageSummaryItem[]; total: number; page: number; pageSize: number }>(
        `/api/profiles/${profileId}/capabilities/usages/summary?${qs}`,
      ),
    staleTime: 15_000,
    placeholderData: keepPreviousData,
    enabled: Boolean(profileId),
  });
}

export function useProfileCapabilityUsages(
  profileId: string,
  params: {
    fromIso?: string;
    rawCapabilityName?: string | null;
    capabilityCode?: string;
    page?: number;
    pageSize?: number;
  },
) {
  const qs = new URLSearchParams();
  if (params.fromIso) qs.set('from', params.fromIso);
  if (params.rawCapabilityName) qs.set('rawCapabilityName', params.rawCapabilityName);
  if (params.capabilityCode) qs.set('capabilityCode', params.capabilityCode);
  if (params.page) qs.set('page', String(params.page));
  if (params.pageSize) qs.set('pageSize', String(params.pageSize));
  return useQuery({
    queryKey: ['profile-capability-usages', profileId, params],
    queryFn: () =>
      requestData<{ items: ProfileCapabilityUsageItem[]; total: number }>(
        `/api/profiles/${profileId}/capabilities/usages?${qs}`,
      ),
    staleTime: 15_000,
    enabled: Boolean(profileId) && Boolean(params.rawCapabilityName),
  });
}
