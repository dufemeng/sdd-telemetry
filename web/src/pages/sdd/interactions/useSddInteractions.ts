import { useQuery } from '@tanstack/react-query';
import type { SddInteractionItem } from '@sdd-telemetry/api';
import { requestData } from '../../../api/client';
import { timeRangeToFromIso } from '../../../lib/timeRange';
import type { TimeRange } from '../../../components/layout/TopBar';

export function useSddInteractions(timeRange: TimeRange, limit = 100) {
  const from = timeRangeToFromIso(timeRange);
  return useQuery({
    queryKey: ['sdd-interactions', timeRange],
    queryFn: () => requestData<SddInteractionItem[]>(`/api/sdd/interactions?from=${from}&limit=${limit}`),
    staleTime: 15_000,
  });
}
