import { useQuery } from '@tanstack/react-query';
import type { SddUserItem } from '@sdd-telemetry/api';
import { requestData } from '../../../api/client';

export function useSddUsers() {
  return useQuery({
    queryKey: ['sdd-users'],
    queryFn: () => requestData<SddUserItem[]>('/api/sdd/users'),
    staleTime: 30_000,
  });
}
