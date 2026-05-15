import { useQuery } from '@tanstack/react-query';
import type { BatchListResponse } from '@sdd-monitor/api';
import { requestData } from '../../api/client';

export function useBatchList(status?: string, limit = 50) {
  const params = new URLSearchParams({ limit: String(limit) });
  if (status) params.set('status', status);
  return useQuery({
    queryKey: ['batches', status, limit],
    queryFn: () => requestData<BatchListResponse>(`/api/ingest/batches?${params}`),
    staleTime: 15_000,
  });
}
