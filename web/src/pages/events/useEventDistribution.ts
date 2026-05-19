import { useQuery } from '@tanstack/react-query';
import type { EventDistribution } from '@sdd-telemetry/api';
import { requestData } from '@/api/client';
import { timeRangeToFromIso } from '@/lib/timeRange';
import type { TimeRange } from '@/components/layout/TopBar';

export function useEventDistribution(timeRange: TimeRange, limit = 50) {
  const from = timeRangeToFromIso(timeRange);
  return useQuery({
    queryKey: ['events-distribution', timeRange],
    queryFn: () => requestData<EventDistribution>(`/api/events/distribution?from=${from}&limit=${limit}`),
    staleTime: 15_000,
  });
}
