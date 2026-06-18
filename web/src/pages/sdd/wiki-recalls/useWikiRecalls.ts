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
  ProfileKnowledgeContent,
  ProfileKnowledgeTimelineResponse,
  ProfileKnowledgeDeliveryUnitRankingResponse,
  ProfileKnowledgeDocDetailResponse,
  ProfileKnowledgeDomainDocsResponse,
  ProfileKnowledgeRecallListResponse,
} from '@sdd-telemetry/api';
import { requestData } from '@/api/client';
import { useShellContext } from '@/components/layout/useShellContext';

type TimelineGranularity = 'day' | 'hour';

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
) {
  const { profileId } = useShellContext();
  return useQuery({
    queryKey: ['profile-knowledge-timeline', profileId, range, granularity],
    queryFn: async () => {
      const qs = new URLSearchParams();
      if (range) qs.set('range', range);
      if (granularity) qs.set('granularity', granularity);
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
      if (range) qs.set('range', range);
      if (filters.wikiDomain) qs.set('wikiDomain', filters.wikiDomain);
      const r = await requestData<ProfileKnowledgeDeliveryUnitRankingResponse>(
        `/api/profiles/${profileId}/knowledge/delivery-units${qs.toString() ? `?${qs}` : ''}`,
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

export function useWikiRecallDomainDocs(repo: string | null, domain: string | null, enabled = true) {
  const { profileId } = useShellContext();
  return useQuery({
    queryKey: ['profile-knowledge-docs', profileId, repo, domain],
    enabled: enabled && !!profileId && !!repo && !!domain,
    queryFn: async () => {
      const r = await requestData<ProfileKnowledgeDomainDocsResponse>(
        `/api/profiles/${profileId}/knowledge/docs?${toQueryString({ sourceNamespace: repo!, domain: domain! })}`,
      );
      return {
        repo: r.sourceNamespace,
        domain: r.domain,
        items: r.items.map((item) => ({ ...item, lastToolCallId: null })),
      } satisfies WikiDomainDocsResponse;
    },
  });
}

export function useWikiRecallDocDetail(repo: string | null, relativePath: string | null) {
  const { profileId } = useShellContext();
  return useQuery({
    queryKey: ['profile-knowledge-doc-detail', profileId, repo, relativePath],
    enabled: !!profileId && !!repo && !!relativePath,
    queryFn: async () => {
      const r = await requestData<ProfileKnowledgeDocDetailResponse>(
        `/api/profiles/${profileId}/knowledge/doc-detail?${toQueryString({ sourceNamespace: repo!, relativePath: relativePath! })}`,
      );
      return {
        repo: r.sourceNamespace,
        relativePath: r.relativePath,
        trend: r.trend,
        readers: r.readers,
        sourceWorkItems: r.sourceDeliveryUnits.map((item) => ({
          workItemId: item.deliveryUnitId,
          workItemSlug: item.unitSlug ?? '',
          businessDomain: item.businessDomain,
          recallCount: item.recallCount,
        })),
      } satisfies WikiDocDetailResponse;
    },
  });
}

export function useWikiRecallDocContentByPath(repo: string | null, relativePath: string | null) {
  const { profileId } = useShellContext();
  return useQuery({
    queryKey: ['profile-knowledge-content-by-path', profileId, repo, relativePath],
    enabled: !!profileId && !!repo && !!relativePath,
    staleTime: 60_000,
    queryFn: async () => mapKnowledgeContent(
      await requestData<ProfileKnowledgeContent>(
        `/api/profiles/${profileId}/knowledge/content/by-path?${toQueryString({ sourceNamespace: repo!, relativePath: relativePath! })}`,
      ),
    ),
  });
}

function mapKnowledgeContent(content: ProfileKnowledgeContent): SddWikiRecallContent {
  return {
    found: content.found,
    reason: content.reason,
    repoName: content.sourceNamespace,
    relativePath: content.relativePath,
    rawPath: content.rawPath,
    isMarkdown: content.isMarkdown,
    content: content.content,
    truncated: content.truncated,
  };
}

function toQueryString(params: Record<string, string | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value) search.set(key, value);
  }
  return search.toString();
}
