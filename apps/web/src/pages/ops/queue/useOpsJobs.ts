import { useQuery } from '@tanstack/react-query';
import type { OpsJobsResponse } from '@sdd-monitor/api';
import { requestData } from '../../../api/client';

export function useOpsJobs(limit = 50) {
  return useQuery({
    queryKey: ['ops-jobs', limit],
    queryFn: () => requestData<OpsJobsResponse>(`/api/ops/jobs?limit=${limit}`),
    staleTime: 10_000,
  });
}
