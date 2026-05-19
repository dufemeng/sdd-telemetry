import { useQuery } from '@tanstack/react-query';
import type { BatchListResponse, BatchStatus } from '@sdd-telemetry/api';
import { requestData } from '@/api/client';

export function useBatchList(status?: BatchStatus | BatchStatus[], limit = 20, cursor?: string) {
  const statusParam = Array.isArray(status) ? status.join(',') : status;
  const params = new URLSearchParams({ limit: String(limit) });
  if (statusParam) params.set('status', statusParam);
  if (cursor) params.set('cursor', cursor);
  return useQuery({
    queryKey: ['batches', statusParam, limit, cursor],
    queryFn: () => requestData<BatchListResponse>(`/api/ingest/batches?${params}`),
    staleTime: 15_000,
  });
}
