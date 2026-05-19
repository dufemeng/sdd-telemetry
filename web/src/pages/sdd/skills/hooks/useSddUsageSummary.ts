import { keepPreviousData, useQuery } from '@tanstack/react-query';
import type { SddUsageSummaryResponse } from '@sdd-telemetry/api';
import { requestData } from '@/api/client';
import type { TimeRange } from '@/components/layout/TopBar';
import { timeRangeToFromIso } from '@/lib/timeRange';

export type UsageMatchFilter = 'all' | 'matched' | 'unmatched';

interface UseSddUsageSummaryParams {
  timeRange: TimeRange;
  matched: UsageMatchFilter;
  keyword: string;
  page: number;
  pageSize: number;
}

export function useSddUsageSummary({
  timeRange,
  matched,
  keyword,
  page,
  pageSize,
}: UseSddUsageSummaryParams) {
  const from = timeRangeToFromIso(timeRange);
  const params = new URLSearchParams({
    from,
    matched,
    page: String(page),
    pageSize: String(pageSize),
  });

  if (keyword.trim()) {
    params.set('keyword', keyword.trim());
  }

  return useQuery({
    queryKey: ['sdd-usage-summary', timeRange, matched, keyword, page, pageSize],
    queryFn: () => requestData<SddUsageSummaryResponse>(`/api/sdd/usage-summary?${params}`),
    staleTime: 15_000,
    placeholderData: keepPreviousData,
  });
}
