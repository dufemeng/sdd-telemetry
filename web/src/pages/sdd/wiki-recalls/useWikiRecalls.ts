import { useQuery } from '@tanstack/react-query';
import type {
  SddWikiRecallContent,
  ProfileKnowledgeOverviewResponse,
  ProfileKnowledgeContent,
  ProfileKnowledgeTimelineResponse,
  ProfileKnowledgeDeliveryUnitRankingResponse,
  ProfileKnowledgeDocDetailResponse,
  ProfileKnowledgePathDimensionDocsResponse,
} from '@sdd-telemetry/api';
import { requestData } from '@/api/client';
import { useShellContext } from '@/components/layout/useShellContext';

type TimelineGranularity = 'day' | 'hour';
type WikiRecallRange = '24h' | '7d' | '30d' | '90d' | 'all';

export function useWikiRecallTimeline(
  range: WikiRecallRange,
  granularity: TimelineGranularity,
  filters: { sourceNamespace?: string; pathSegment?: string } = {},
) {
  const { profileId } = useShellContext();
  return useQuery({
    queryKey: ['profile-knowledge-timeline', profileId, range, granularity, filters],
    queryFn: async () => {
      const qs = new URLSearchParams();
      if (range) qs.set('range', range);
      if (granularity) qs.set('granularity', granularity);
      if (filters.sourceNamespace) qs.set('sourceNamespace', filters.sourceNamespace);
      if (filters.pathSegment) qs.set('pathSegment', filters.pathSegment);
      const r = await requestData<ProfileKnowledgeTimelineResponse>(
        `/api/profiles/${profileId}/knowledge/timeline?${qs}`,
      );
      return r;
    },
    staleTime: 30_000,
    enabled: Boolean(profileId),
  });
}

export function useWikiRecallWorkItemRanking(
  range: WikiRecallRange,
  filters: { sourceNamespace?: string; pathSegment?: string; userId?: string },
) {
  const { profileId } = useShellContext();
  return useQuery({
    queryKey: ['profile-knowledge-delivery-units', profileId, range, filters],
    queryFn: async () => {
      const qs = new URLSearchParams();
      if (range) qs.set('range', range);
      if (filters.sourceNamespace) qs.set('sourceNamespace', filters.sourceNamespace);
      if (filters.pathSegment) qs.set('pathSegment', filters.pathSegment);
      const r = await requestData<ProfileKnowledgeDeliveryUnitRankingResponse>(
        `/api/profiles/${profileId}/knowledge/delivery-units${qs.toString() ? `?${qs}` : ''}`,
      );
      return {
        items: r.items.map((i) => ({
          workItemId: i.deliveryUnitId,
          workItemSlug: i.unitSlug ?? '',
          businessDomain: i.businessDomain,
          accessCount: i.accessCount,
          userCount: i.userCount,
        })),
        total: r.total,
      };
    },
    staleTime: 30_000,
    enabled: Boolean(profileId),
  });
}

export function useKnowledgeOverview() {
  const { profileId } = useShellContext();
  return useQuery({
    queryKey: ['profile-knowledge-overview', profileId],
    queryFn: async () => {
      const r = await requestData<ProfileKnowledgeOverviewResponse>(
        `/api/profiles/${profileId}/knowledge/overview`,
      );
      return r;
    },
    staleTime: 30_000,
    enabled: Boolean(profileId),
  });
}

export function useWikiRecallPathDimensionDocs(
  sourceNamespace: string | null,
  pathSegment: string | null,
) {
  const { profileId } = useShellContext();
  return useQuery({
    queryKey: ['profile-knowledge-docs', profileId, sourceNamespace, pathSegment],
    enabled: !!profileId && !!sourceNamespace && !!pathSegment,
    queryFn: async () => {
      return requestData<ProfileKnowledgePathDimensionDocsResponse>(
        `/api/profiles/${profileId}/knowledge/docs?${toQueryString({ sourceNamespace: sourceNamespace!, pathSegment: pathSegment! })}`,
      );
    },
  });
}

export function useWikiRecallDocDetail(
  sourceNamespace: string | null,
  relativePath: string | null,
) {
  const { profileId } = useShellContext();
  return useQuery({
    queryKey: ['profile-knowledge-doc-detail', profileId, sourceNamespace, relativePath],
    enabled: !!profileId && !!sourceNamespace && !!relativePath,
    queryFn: async () => {
      return requestData<ProfileKnowledgeDocDetailResponse>(
        `/api/profiles/${profileId}/knowledge/doc-detail?${toQueryString({ sourceNamespace: sourceNamespace!, relativePath: relativePath! })}`,
      );
    },
  });
}

export function useWikiRecallDocContentByPath(repo: string | null, relativePath: string | null) {
  const { profileId } = useShellContext();
  return useQuery({
    queryKey: ['profile-knowledge-content-by-path', profileId, repo, relativePath],
    enabled: !!profileId && !!repo && !!relativePath,
    staleTime: 60_000,
    queryFn: async () =>
      mapKnowledgeContent(
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
