import { useQuery } from '@tanstack/react-query';
import type { SddInteractionItem } from '@sdd-monitor/api';
import { requestData } from '../../../api/client';

export function useSddInteractions(timeRange: '6h' | '24h' | '72h', limit = 100) {
  const hours = Number(timeRange.replace('h', ''));
  const from  = new Date(Date.now() - hours * 3_600_000).toISOString();
  return useQuery({
    queryKey: ['sdd-interactions', timeRange],
    queryFn: () => requestData<SddInteractionItem[]>(`/api/sdd/interactions?from=${from}&limit=${limit}`),
    staleTime: 15_000,
  });
}
