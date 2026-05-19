import { useQuery } from '@tanstack/react-query';
import type { EventTimeline } from '@sdd-telemetry/api';
import { requestData } from '@/api/client';
import { timeRangeToFromIso } from '@/lib/timeRange';
import type { TimeRange } from '@/components/layout/TopBar';

export function useEventTimeline(timeRange: TimeRange) {
  const from = timeRangeToFromIso(timeRange);
  return useQuery({
    queryKey: ['events-timeline', timeRange],
    queryFn: () => requestData<EventTimeline>(`/api/events/timeline?from=${from}`),
    staleTime: 15_000,
  });
}
