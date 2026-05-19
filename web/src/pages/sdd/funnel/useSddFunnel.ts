import { useQuery } from '@tanstack/react-query';
import type { SddFunnel } from '@sdd-telemetry/api';
import { requestData } from '@/api/client';
import { timeRangeToFromIso } from '@/lib/timeRange';
import type { TimeRange } from '@/components/layout/TopBar';

export function useSddFunnel(timeRange: TimeRange) {
  const from = timeRangeToFromIso(timeRange);
  return useQuery({
    queryKey: ['sdd-funnel', timeRange],
    queryFn: () => requestData<SddFunnel>(`/api/sdd/funnel?from=${from}`),
    staleTime: 15_000,
  });
}
