import { useQuery } from '@tanstack/react-query';
import type { OpsResourceHistory, OpsResourceHistoryQuery } from '@sdd-telemetry/api';
import { requestData } from '@/api/client';

export function useOpsResourceHistory(query: OpsResourceHistoryQuery) {
  return useQuery({
    queryKey: ['ops-resource-history', query],
    queryFn: () => {
      const params = new URLSearchParams({
        range: query.range,
        serviceName: query.serviceName,
        metric: query.metric,
      });
      return requestData<OpsResourceHistory>(`/api/ops/resources/history?${params.toString()}`);
    },
    staleTime: 30_000,
    refetchInterval: 30_000,
  });
}
