import { useQuery } from '@tanstack/react-query';
import type { SddFunnel } from '@sdd-monitor/api';
import { requestData } from '../../../api/client';

export function useSddFunnel(timeRange: '6h' | '24h' | '72h') {
  const hours = Number(timeRange.replace('h', ''));
  const from  = new Date(Date.now() - hours * 3_600_000).toISOString();
  return useQuery({
    queryKey: ['sdd-funnel', timeRange],
    queryFn: () => requestData<SddFunnel>(`/api/sdd/funnel?from=${from}`),
    staleTime: 15_000,
  });
}
