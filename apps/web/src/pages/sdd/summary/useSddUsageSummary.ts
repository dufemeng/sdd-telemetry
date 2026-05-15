import { useQuery } from '@tanstack/react-query';
import type { SddUsageSummaryResponse } from '@sdd-monitor/api';
import { requestData } from '../../../api/client';

export function useSddUsageSummary(timeRange: '6h' | '24h' | '72h') {
  const hours = Number(timeRange.replace('h', ''));
  const from  = new Date(Date.now() - hours * 3_600_000).toISOString();
  return useQuery({
    queryKey: ['sdd-usage-summary', timeRange],
    queryFn: () => requestData<SddUsageSummaryResponse>(`/api/sdd/usage-summary?from=${from}&limit=100`),
    staleTime: 15_000,
  });
}
