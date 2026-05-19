import { keepPreviousData, useQuery } from '@tanstack/react-query';
import type { SddSkillTimeseries } from '@sdd-telemetry/api';
import { requestData } from '@/api/client';
import type { TimeRange } from '@/components/layout/TopBar';
import { timeRangeToFromIso } from '@/lib/timeRange';

export function useSkillTimeseries(timeRange: TimeRange) {
  const from = timeRangeToFromIso(timeRange);
  return useQuery({
    queryKey: ['sdd-skill-timeseries', timeRange],
    queryFn: () => requestData<SddSkillTimeseries>(`/api/sdd/skill-timeseries?from=${from}`),
    staleTime: 15_000,
    placeholderData: keepPreviousData,
  });
}
