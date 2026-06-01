import { useQuery } from '@tanstack/react-query';
import type {
  WikiRecallTimelineResponse,
  WikiRecallRange,
  WikiRecallListResponse,
  WikiRecallWorkItemRankingResponse,
  WikiCoverageResponse,
  WikiDomainDocsResponse,
  SddWikiRecallContent,
} from '@sdd-telemetry/api';
import { requestData } from '@/api/client';

type TimelineGranularity = 'day' | 'hour';
type TimelineGroupBy = 'domain' | 'axis';

export function useWikiRecallTimeline(
  range: WikiRecallRange,
  granularity: TimelineGranularity,
  groupBy: TimelineGroupBy,
) {
  return useQuery({
    queryKey: ['wiki-recalls', 'timeline', range, granularity, groupBy],
    queryFn: () =>
      requestData<WikiRecallTimelineResponse>(
        `/api/sdd/wiki-recalls/timeline?${toQueryString({ range, granularity, groupBy })}`,
      ),
  });
}

export function useWikiRecallList(
  range: WikiRecallRange,
  filters: { workItemId?: string; userId?: string; skillUsageId?: string },
) {
  return useQuery({
    queryKey: ['wiki-recalls', 'list', range, filters],
    queryFn: () =>
      requestData<WikiRecallListResponse>(
        `/api/sdd/wiki-recalls/list?${toQueryString({ range, ...filters })}`,
      ),
  });
}

export function useWikiRecallWorkItemRanking(
  range: WikiRecallRange,
  filters: { businessDomain?: string; userId?: string },
) {
  return useQuery({
    queryKey: ['wiki-recalls', 'work-items', range, filters],
    queryFn: () =>
      requestData<WikiRecallWorkItemRankingResponse>(
        `/api/sdd/wiki-recalls/work-items?${toQueryString({ range, ...filters })}`,
      ),
  });
}

export function useWikiRecallCoverage() {
  return useQuery({
    queryKey: ['wiki-recalls', 'coverage'],
    queryFn: () => requestData<WikiCoverageResponse>('/api/sdd/wiki-recalls/coverage'),
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
