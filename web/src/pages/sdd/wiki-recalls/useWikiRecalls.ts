import { useQuery } from '@tanstack/react-query';
import type {
  WikiRecallHeatmapResponse,
  WikiRecallListResponse,
  WikiRecallRange,
  WikiRecallTimelineResponse,
  WikiRecallUserRankingResponse,
  WikiRecallWorkItemRankingResponse,
} from '@sdd-telemetry/api';
import { requestData } from '@/api/client';

type UserRankingSortBy = 'total' | 'distinct_files' | 'recent';
type HeatmapGroupBy = 'domain' | 'axis' | 'system';
type TimelineGranularity = 'day' | 'hour';
type TimelineGroupBy = 'domain' | 'axis';

export function useWikiRecallUserRanking(range: WikiRecallRange, sortBy: UserRankingSortBy) {
  return useQuery({
    queryKey: ['wiki-recalls', 'users', range, sortBy],
    queryFn: () =>
      requestData<WikiRecallUserRankingResponse>(
        `/api/sdd/wiki-recalls/users?${toQueryString({ range, sortBy })}`,
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

export function useWikiRecallHeatmap(range: WikiRecallRange, groupBy: HeatmapGroupBy) {
  return useQuery({
    queryKey: ['wiki-recalls', 'heatmap', range, groupBy],
    queryFn: () =>
      requestData<WikiRecallHeatmapResponse>(
        `/api/sdd/wiki-recalls/heatmap?${toQueryString({ range, groupBy })}`,
      ),
  });
}

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

function toQueryString(params: Record<string, string | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value) search.set(key, value);
  }
  return search.toString();
}
