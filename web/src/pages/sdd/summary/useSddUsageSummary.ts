import { useQuery } from '@tanstack/react-query';
import type { SddUsageSummaryResponse } from '@sdd-telemetry/api';
import { requestData } from '@/api/client';
import { timeRangeToFromIso } from '@/lib/timeRange';
import type { TimeRange } from '@/components/layout/TopBar';

export function useSddUsageSummary(timeRange: TimeRange) {
  const from = timeRangeToFromIso(timeRange);
  return useQuery({
    queryKey: ['sdd-usage-summary', timeRange],
    queryFn: () => requestData<SddUsageSummaryResponse>(`/api/sdd/usage-summary?from=${from}&limit=100`),
    staleTime: 15_000,
  });
}
