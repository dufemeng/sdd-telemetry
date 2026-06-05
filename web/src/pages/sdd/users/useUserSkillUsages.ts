import { useQuery } from '@tanstack/react-query';
import type { SddUsageItem } from '@sdd-telemetry/api';
import { requestData } from '@/api/client';

export function useUserSkillUsages(userId: string | undefined, limit = 200, enabled = true) {
  const params = new URLSearchParams({ userId: userId ?? '', limit: String(limit) });
  return useQuery({
    queryKey: ['sdd-user-skill-usages', userId, limit],
    queryFn: () => requestData<SddUsageItem[]>(`/api/sdd/usages?${params}`),
    enabled: enabled && Boolean(userId),
    staleTime: 30_000,
  });
}
