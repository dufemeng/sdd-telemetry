import { useQuery } from '@tanstack/react-query';
import type { EventDistribution } from '@sdd-monitor/api';
import { requestData } from '../../api/client';

export function useEventDistribution(timeRange: '6h' | '24h' | '72h', limit = 50) {
  const hours = Number(timeRange.replace('h', ''));
  const from  = new Date(Date.now() - hours * 3_600_000).toISOString();
  return useQuery({
    queryKey: ['events-distribution', timeRange],
    queryFn: () => requestData<EventDistribution>(`/api/events/distribution?from=${from}&limit=${limit}`),
    staleTime: 15_000,
  });
}
