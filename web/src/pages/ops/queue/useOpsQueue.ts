import { useQuery } from '@tanstack/react-query';
import type { OpsQueue } from '@sdd-telemetry/api';
import { requestData } from '../../../api/client';

export function useOpsQueue() {
  return useQuery({
    queryKey: ['ops-queue'],
    queryFn: () => requestData<OpsQueue>('/api/ops/queue'),
    staleTime: 10_000,
  });
}
