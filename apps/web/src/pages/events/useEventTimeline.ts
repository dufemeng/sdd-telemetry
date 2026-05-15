import { useQuery } from '@tanstack/react-query';
import type { EventTimeline } from '@sdd-monitor/api';
import { requestData } from '../../api/client';

export function useEventTimeline(timeRange: '6h' | '24h' | '72h') {
  const hours = Number(timeRange.replace('h', ''));
  const from  = new Date(Date.now() - hours * 3_600_000).toISOString();
  return useQuery({
    queryKey: ['events-timeline', timeRange],
    queryFn: () => requestData<EventTimeline>(`/api/events/timeline?from=${from}`),
    staleTime: 15_000,
  });
}
