import { useQuery } from '@tanstack/react-query';
import type { SddUsageItem } from '@sdd-telemetry/api';
import { requestData } from '@/api/client';
import type { TimeRange } from '@/components/layout/TopBar';
import { timeRangeToFromIso } from '@/lib/timeRange';

interface UseSkillUsagesParams {
  timeRange: TimeRange;
  rawSkillName: string | null;
  limit?: number;
}

export function useSkillUsages({ timeRange, rawSkillName, limit = 10 }: UseSkillUsagesParams) {
  const from = timeRangeToFromIso(timeRange);
  const params = new URLSearchParams({ from, limit: String(limit) });
  if (rawSkillName) {
    params.set('rawSkillName', rawSkillName);
  }

  return useQuery({
    queryKey: ['sdd-skill-usages', timeRange, rawSkillName, limit],
    queryFn: () => requestData<SddUsageItem[]>(`/api/sdd/usages?${params}`),
    enabled: Boolean(rawSkillName),
    staleTime: 15_000,
  });
}
