import { useQuery } from '@tanstack/react-query';
import type { BatchListResponse, BatchStatus } from '@sdd-monitor/api';
import { requestData } from '../../api/client';

export function useBatchList(status?: BatchStatus | BatchStatus[], limit = 50) {
  const statusParam = Array.isArray(status) ? status.join(',') : status;
  const params = new URLSearchParams({ limit: String(limit) });
  if (statusParam) params.set('status', statusParam);
  return useQuery({
    queryKey: ['batches', statusParam, limit],
    queryFn: () => requestData<BatchListResponse>(`/api/ingest/batches?${params}`),
    staleTime: 15_000,
  });
}
