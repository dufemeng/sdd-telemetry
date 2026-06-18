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
  ProfileErrorDetail,
  ProfileErrorListResponse,
  ProfileErrorOverviewResponse,
  ProfileKnowledgeCoverageResponse,
  ProfileKnowledgeDeliveryUnitRankingResponse,
  ProfileKnowledgeRecallListResponse,
  ProfileKnowledgeTimelineResponse,
  ProfileOverview,
  ProfilePresentation,
  ProfileSummary,
  ProfileUserActivityItem,
  ProfileUserDetail,
  ProfileUserItem,
} from '@sdd-telemetry/api';
import { requestData } from '@/api/client';
import { normalizeProfilePresentation, type NormalizedProfilePresentation } from './profilePresentation';

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

export function useProfilePresentation(profileId: string): ProfilePresentation | undefined {
  const { data } = useProfiles();
  return data?.find((p) => p.profileId === profileId)?.presentation;
}

export function useProfileHiddenMetrics(profileId: string): Set<string> {
  const presentation = useProfilePresentation(profileId);
  return new Set(presentation?.hiddenMetrics ?? []);
}

export function useProfilePresentationModel(profileId: string): NormalizedProfilePresentation {
  return normalizeProfilePresentation(useProfilePresentation(profileId));
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

export function useProfileErrorOverview(
  profileId: string,
  params: {
    fromIso?: string;
    toIso?: string;
    category?: string | null;
    reasonCode?: string | null;
  },
) {
  const qs = new URLSearchParams();
  if (params.fromIso) qs.set('from', params.fromIso);
  if (params.toIso) qs.set('to', params.toIso);
  if (params.category) qs.set('category', params.category);
  if (params.reasonCode) qs.set('reasonCode', params.reasonCode);
  return useQuery({
    queryKey: ['profile-error-overview', profileId, params],
    queryFn: () =>
      requestData<ProfileErrorOverviewResponse>(
        `/api/profiles/${profileId}/errors/overview${qs.toString() ? `?${qs}` : ''}`,
      ),
    staleTime: 15_000,
    placeholderData: keepPreviousData,
    enabled: Boolean(profileId),
  });
}

export function useProfileErrors(
  profileId: string,
  params: {
    fromIso?: string;
    toIso?: string;
    category?: string | null;
    severity?: string | null;
    reasonCode?: string | null;
    toolName?: string | null;
    errorType?: string | null;
    keyword?: string;
    page?: number;
    pageSize?: number;
  },
) {
  const qs = new URLSearchParams();
  if (params.fromIso) qs.set('from', params.fromIso);
  if (params.toIso) qs.set('to', params.toIso);
  if (params.category) qs.set('category', params.category);
  if (params.severity) qs.set('severity', params.severity);
  if (params.reasonCode) qs.set('reasonCode', params.reasonCode);
  if (params.toolName) qs.set('toolName', params.toolName);
  if (params.errorType) qs.set('errorType', params.errorType);
  if (params.keyword?.trim()) qs.set('keyword', params.keyword.trim());
  if (params.page) qs.set('page', String(params.page));
  if (params.pageSize) qs.set('pageSize', String(params.pageSize));
  return useQuery({
    queryKey: ['profile-errors', profileId, params],
    queryFn: () =>
      requestData<ProfileErrorListResponse>(
        `/api/profiles/${profileId}/errors${qs.toString() ? `?${qs}` : ''}`,
      ),
    staleTime: 15_000,
    placeholderData: keepPreviousData,
    enabled: Boolean(profileId),
  });
}

export function useProfileErrorDetail(profileId: string, errorEventId: string | null) {
  return useQuery({
    queryKey: ['profile-error-detail', profileId, errorEventId],
    queryFn: () =>
      requestData<ProfileErrorDetail>(`/api/profiles/${profileId}/errors/${errorEventId}`),
    staleTime: 30_000,
    enabled: Boolean(profileId) && Boolean(errorEventId),
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
    groupBy?: 'raw' | 'capability';
    keyword?: string;
    capabilityCode?: string;
    rawCapabilityName?: string;
    page: number;
    pageSize: number;
  },
) {
  const qs = new URLSearchParams();
  if (params.fromIso) qs.set('from', params.fromIso);
  if (params.matched) qs.set('matched', params.matched);
  if (params.groupBy) qs.set('groupBy', params.groupBy);
  if (params.keyword?.trim()) qs.set('keyword', params.keyword.trim());
  if (params.capabilityCode) qs.set('capabilityCode', params.capabilityCode);
  if (params.rawCapabilityName) qs.set('rawCapabilityName', params.rawCapabilityName);
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
    enabled: Boolean(profileId) && (Boolean(params.rawCapabilityName) || Boolean(params.capabilityCode)),
  });
}

export function useProfileUsers(
  profileId: string,
  params: {
    fromIso?: string;
    status?: string;
    keyword?: string;
    page?: number;
    pageSize?: number;
  },
) {
  const qs = new URLSearchParams();
  if (params.fromIso) qs.set('from', params.fromIso);
  if (params.status) qs.set('status', params.status);
  if (params.keyword?.trim()) qs.set('keyword', params.keyword.trim());
  if (params.page) qs.set('page', String(params.page));
  if (params.pageSize) qs.set('pageSize', String(params.pageSize));
  return useQuery({
    queryKey: ['profile-users', profileId, params],
    queryFn: () =>
      requestData<{ items: ProfileUserItem[]; total: number; page: number; pageSize: number }>(
        `/api/profiles/${profileId}/users?${qs}`,
      ),
    staleTime: 30_000,
    placeholderData: keepPreviousData,
    enabled: Boolean(profileId),
  });
}

export function useProfileUserDetail(profileId: string, userId: string | null) {
  return useQuery({
    queryKey: ['profile-user-detail', profileId, userId],
    queryFn: () =>
      requestData<ProfileUserDetail>(`/api/profiles/${profileId}/users/${userId}`),
    staleTime: 30_000,
    enabled: Boolean(profileId) && Boolean(userId),
  });
}

export function useProfileUserActivity(
  profileId: string,
  userId: string | null,
  params: {
    deliveryUnitId?: string | null;
    range?: string;
    limit?: number;
  },
) {
  const qs = new URLSearchParams();
  if (params.deliveryUnitId) qs.set('deliveryUnitId', params.deliveryUnitId);
  if (params.range) qs.set('range', params.range);
  if (params.limit) qs.set('limit', String(params.limit));
  return useQuery({
    queryKey: ['profile-user-activity', profileId, userId, params],
    queryFn: () =>
      requestData<{ items: ProfileUserActivityItem[] }>(
        `/api/profiles/${profileId}/users/${userId}/activity${qs.toString() ? `?${qs}` : ''}`,
      ),
    staleTime: 30_000,
    enabled: Boolean(profileId) && Boolean(userId),
  });
}

export function useProfileKnowledgeCoverage(profileId: string) {
  return useQuery({
    queryKey: ['profile-knowledge-coverage', profileId],
    queryFn: () =>
      requestData<ProfileKnowledgeCoverageResponse>(
        `/api/profiles/${profileId}/knowledge/coverage`,
      ),
    staleTime: 30_000,
    enabled: Boolean(profileId),
  });
}

export function useProfileKnowledgeTimeline(
  profileId: string,
  range: string,
  granularity?: string,
) {
  const qs = new URLSearchParams();
  if (range) qs.set('range', range);
  if (granularity) qs.set('granularity', granularity);
  return useQuery({
    queryKey: ['profile-knowledge-timeline', profileId, range, granularity],
    queryFn: () =>
      requestData<ProfileKnowledgeTimelineResponse>(
        `/api/profiles/${profileId}/knowledge/timeline?${qs}`,
      ),
    staleTime: 30_000,
    enabled: Boolean(profileId),
  });
}

export function useProfileKnowledgeDeliveryUnits(profileId: string, range?: string, wikiDomain?: string | null) {
  const qs = new URLSearchParams();
  if (range) qs.set('range', range);
  if (wikiDomain) qs.set('wikiDomain', wikiDomain);
  return useQuery({
    queryKey: ['profile-knowledge-delivery-units', profileId, range ?? null, wikiDomain ?? null],
    queryFn: () =>
      requestData<ProfileKnowledgeDeliveryUnitRankingResponse>(
        `/api/profiles/${profileId}/knowledge/delivery-units${qs.toString() ? `?${qs}` : ''}`,
      ),
    staleTime: 30_000,
    enabled: Boolean(profileId),
  });
}

export function useProfileKnowledgeRecalls(
  profileId: string,
  params: {
    range?: string;
    deliveryUnitId?: string;
    userId?: string;
    capabilityUsageId?: string;
    page?: number;
    pageSize?: number;
  },
) {
  const qs = new URLSearchParams();
  if (params.range) qs.set('range', params.range);
  if (params.deliveryUnitId) qs.set('deliveryUnitId', params.deliveryUnitId);
  if (params.userId) qs.set('userId', params.userId);
  if (params.capabilityUsageId) qs.set('capabilityUsageId', params.capabilityUsageId);
  if (params.page) qs.set('page', String(params.page));
  if (params.pageSize) qs.set('pageSize', String(params.pageSize));
  return useQuery({
    queryKey: ['profile-knowledge-recalls', profileId, params],
    queryFn: () =>
      requestData<ProfileKnowledgeRecallListResponse>(
        `/api/profiles/${profileId}/knowledge/recalls?${qs}`,
      ),
    staleTime: 30_000,
    enabled: Boolean(profileId),
  });
}
