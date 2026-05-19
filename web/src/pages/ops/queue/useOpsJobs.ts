import { useQuery } from '@tanstack/react-query';
import type { OpsJobsResponse } from '@sdd-telemetry/api';
import { requestData } from '@/api/client';

export function useOpsJobs(limit = 20, cursor?: string) {
  const params = new URLSearchParams({ limit: String(limit) });
  if (cursor) params.set('cursor', cursor);
  return useQuery({
    queryKey: ['ops-jobs', limit, cursor],
    queryFn: () => requestData<OpsJobsResponse>(`/api/ops/jobs?${params}`),
    staleTime: 10_000,
  });
}
