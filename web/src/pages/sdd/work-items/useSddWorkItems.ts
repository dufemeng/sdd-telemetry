import { useQuery } from '@tanstack/react-query';
import type { SddWorkItem } from '@sdd-telemetry/api';
import { requestData } from '../../../api/client';

export function useSddWorkItems(limit = 100) {
  return useQuery({
    queryKey: ['sdd-work-items'],
    queryFn: () => requestData<SddWorkItem[]>(`/api/sdd/work-items?limit=${limit}`),
    staleTime: 30_000,
  });
}
