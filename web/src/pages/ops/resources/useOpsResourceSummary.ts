import { useQuery } from '@tanstack/react-query';
import type { OpsResourceSummary } from '@sdd-telemetry/api';
import { requestData } from '@/api/client';

export function useOpsResourceSummary() {
  return useQuery({
    queryKey: ['ops-resource-summary'],
    queryFn: () => requestData<OpsResourceSummary>('/api/ops/resources/summary'),
    staleTime: 10_000,
    refetchInterval: 10_000,
  });
}
