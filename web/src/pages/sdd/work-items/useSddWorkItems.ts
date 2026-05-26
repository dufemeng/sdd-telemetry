import { useQuery } from '@tanstack/react-query';
import type { SddWorkItem, SddWorkItemDetail } from '@sdd-telemetry/api';
import { requestData } from '@/api/client';

export function useSddWorkItems(limit = 500) {
  return useQuery({
    queryKey: ['sdd-work-items', limit],
    queryFn: () => requestData<SddWorkItem[]>(`/api/sdd/work-items?limit=${limit}`),
    staleTime: 30_000,
  });
}

export function useSddWorkItemDetail(workItemId: string | null) {
  return useQuery({
    queryKey: ['sdd-work-item-detail', workItemId],
    queryFn: () => requestData<SddWorkItemDetail>(`/api/sdd/work-items/${workItemId}`),
    enabled: workItemId !== null,
    staleTime: 30_000,
  });
}
