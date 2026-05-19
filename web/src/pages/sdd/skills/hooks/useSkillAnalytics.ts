import { keepPreviousData, useQuery } from '@tanstack/react-query';
import type { SddSkillAnalytics } from '@sdd-telemetry/api';
import { requestData } from '@/api/client';
import type { TimeRange } from '@/components/layout/TopBar';
import { timeRangeToFromIso } from '@/lib/timeRange';

export function useSkillAnalytics(timeRange: TimeRange) {
  const from = timeRangeToFromIso(timeRange);
  return useQuery({
    queryKey: ['sdd-skill-analytics', timeRange],
    queryFn: () => requestData<SddSkillAnalytics>(`/api/sdd/skill-analytics?from=${from}`),
    staleTime: 15_000,
    placeholderData: keepPreviousData,
  });
}
