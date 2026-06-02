import { useQuery } from '@tanstack/react-query';
import type { SddUserDetail } from '@sdd-telemetry/api';
import { requestData } from '@/api/client';

export function useUserProfile(userId: string | undefined) {
  return useQuery({
    queryKey: ['sdd-user-profile', userId],
    queryFn: () => requestData<SddUserDetail>(`/api/sdd/users/${userId}`),
    enabled: Boolean(userId),
    staleTime: 30_000,
  });
}
