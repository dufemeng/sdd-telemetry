import { useQuery } from '@tanstack/react-query';
import type {
  WikiRecallTimelineResponse,
  WikiRecallRange,
  WikiRecallListResponse,
  WikiRecallWorkItemRankingResponse,
  WikiCoverageResponse,
  WikiCoverageRepo,
  WikiCoverageDomain,
  WikiDomainDocsResponse,
  WikiDocDetailResponse,
  SddWikiRecallContent,
} from '@sdd-telemetry/api';
import type {
  ProfileKnowledgeCoverageResponse,
  ProfileKnowledgeTimelineResponse,
  ProfileKnowledgeDeliveryUnitRankingResponse,
  ProfileKnowledgeRecallListResponse,
} from '@sdd-telemetry/api';
import { requestData } from '@/api/client';
import { useShellContext } from '@/components/layout/useShellContext';

type TimelineGranularity = 'day' | 'hour';
type TimelineGroupBy = 'domain' | 'axis';

function mapCoverageRepo(r: ProfileKnowledgeCoverageResponse): WikiCoverageResponse {
  return {
    scan: {
      configured: r.scan.configured,
      repos: r.scan.repos.map((s) => ({
        repo: s.sourceNamespace,
        label: s.label,
        gitRef: s.gitRef,
        scannedAt: s.scannedAt,
      })),
    },
    totals: r.totals,
    repos: r.repos.map((repo) => ({ ...repo, repo: repo.sourceNamespace })),
    domains: r.domains.map((d) => ({ ...d, repo: d.sourceNamespace })),
  };
}

export function useWikiRecallTimeline(
  range: WikiRecallRange,
  granularity: TimelineGranularity,
  groupBy: TimelineGroupBy,
  wikiDomain?: string | null,
) {
  const { profileId } = useShellContext();
  return useQuery({
    queryKey: ['profile-knowledge-timeline', profileId, range, granularity, groupBy, wikiDomain ?? null],
    queryFn: async () => {
      const qs = new URLSearchParams();
      if (range) qs.set('range', range);
      if (granularity) qs.set('granularity', granularity);
      if (groupBy) qs.set('groupBy', groupBy);
      if (wikiDomain) qs.set('wikiDomain', wikiDomain);
      const r = await requestData<ProfileKnowledgeTimelineResponse>(
        `/api/profiles/${profileId}/knowledge/timeline?${qs}`,
      );
      return { points: r.points };
    },
    staleTime: 30_000,
    enabled: Boolean(profileId),
  });
}

export function useWikiRecallList(
  range: WikiRecallRange,
  filters: { workItemId?: string; userId?: string; skillUsageId?: string },
) {
  const { profileId } = useShellContext();
  return useQuery({
    queryKey: ['profile-knowledge-recalls', profileId, range, filters],
    queryFn: async () => {
      const qs = new URLSearchParams();
      if (range) qs.set('range', range);
      if (filters.workItemId) qs.set('deliveryUnitId', filters.workItemId);
      if (filters.userId) qs.set('userId', filters.userId);
      if (filters.skillUsageId) qs.set('capabilityUsageId', filters.skillUsageId);
      const r = await requestData<ProfileKnowledgeRecallListResponse>(
        `/api/profiles/${profileId}/knowledge/recalls?${qs}`,
      );
      return {
        items: r.items.map((i) => ({
          id: i.id,
          toolCallId: i.toolCallId ?? '',
          interactionId: i.interactionId ?? '',
          skillUsageId: i.capabilityUsageId,
          workItemId: i.deliveryUnitId,
          userId: i.userId,
          userName: i.userName,
          actionType: i.actionType,
          rawPath: i.rawLocator ?? '',
          wikiRelativePath: i.knowledgeRelativePath,
          wikiDomain: i.knowledgeDomain,
          wikiAxis: i.knowledgeAxis,
          wikiSystem: i.knowledgeSystem,
          eventSequence: i.eventSequence,
          eventTime: i.eventTime,
        })),
        total: r.total,
      };
    },
    staleTime: 30_000,
    enabled: Boolean(profileId),
  });
}

export function useWikiRecallWorkItemRanking(
  range: WikiRecallRange,
  filters: { wikiDomain?: string; userId?: string },
) {
  const { profileId } = useShellContext();
  return useQuery({
    queryKey: ['profile-knowledge-delivery-units', profileId, range, filters],
    queryFn: async () => {
      const qs = new URLSearchParams();
      if (filters.wikiDomain) qs.set('wikiDomain', filters.wikiDomain);
      const r = await requestData<ProfileKnowledgeDeliveryUnitRankingResponse>(
        `/api/profiles/${profileId}/knowledge/delivery-units${filters.wikiDomain ? `?${qs}` : ''}`,
      );
      return {
        items: r.items.map((i) => ({
          workItemId: i.deliveryUnitId,
          workItemSlug: i.unitSlug ?? '',
          businessDomain: i.businessDomain,
          totalRecalls: i.totalRecalls,
          distinctDomains: i.distinctDomains,
          distinctSystems: i.distinctSystems,
          userCount: i.userCount,
        })),
        total: r.total,
      };
    },
    staleTime: 30_000,
    enabled: Boolean(profileId),
  });
}

export function useWikiRecallCoverage() {
  const { profileId } = useShellContext();
  return useQuery({
    queryKey: ['profile-knowledge-coverage', profileId],
    queryFn: async () => {
      const r = await requestData<ProfileKnowledgeCoverageResponse>(
        `/api/profiles/${profileId}/knowledge/coverage`,
      );
      return mapCoverageRepo(r);
    },
    staleTime: 30_000,
    enabled: Boolean(profileId),
  });
}

export function useWikiRecallDomainDocs(repo: string | null, domain: string | null) {
  return useQuery({
    queryKey: ['wiki-recalls', 'docs', repo, domain],
    enabled: !!repo && !!domain,
    queryFn: () =>
      requestData<WikiDomainDocsResponse>(
        `/api/sdd/wiki-recalls/docs?${toQueryString({ repo: repo!, domain: domain! })}`,
      ),
  });
}

export function useWikiRecallDocDetail(repo: string | null, relativePath: string | null) {
  return useQuery({
    queryKey: ['wiki-recalls', 'doc-detail', repo, relativePath],
    enabled: !!repo && !!relativePath,
    queryFn: () =>
      requestData<WikiDocDetailResponse>(
        `/api/sdd/wiki-recalls/doc-detail?${toQueryString({ repo: repo!, relativePath: relativePath! })}`,
      ),
  });
}

export function useWikiRecallDocContentByPath(repo: string | null, relativePath: string | null) {
  return useQuery({
    queryKey: ['wiki-recalls', 'content-by-path', repo, relativePath],
    enabled: !!repo && !!relativePath,
    staleTime: 60_000,
    queryFn: () =>
      requestData<SddWikiRecallContent>(
        `/api/sdd/wiki-recalls/content/by-path?${toQueryString({ repo: repo!, relativePath: relativePath! })}`,
      ),
  });
}

function toQueryString(params: Record<string, string | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value) search.set(key, value);
  }
  return search.toString();
}
