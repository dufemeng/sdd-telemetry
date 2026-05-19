import { useQuery } from '@tanstack/react-query';
import type { SddOverview } from '@sdd-telemetry/api';
import { requestData } from '@/api/client';
import { timeRangeToFromIso } from '@/lib/timeRange';
import type { TimeRange } from '@/components/layout/TopBar';

export function useSddOverview(timeRange: TimeRange) {
  const from = timeRangeToFromIso(timeRange);
  return useQuery({
    queryKey: ['sdd-overview', timeRange],
    queryFn: () => requestData<SddOverview>(`/api/sdd/overview?from=${from}`),
    staleTime: 15_000,
  });
}
