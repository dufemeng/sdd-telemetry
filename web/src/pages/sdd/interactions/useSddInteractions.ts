import { useQuery } from '@tanstack/react-query';
import type {
  SddInteractionDetail,
  SddInteractionItem,
  SddInteractionToolCallListResponse,
} from '@sdd-telemetry/api';
import { requestData } from '../../../api/client';
import { timeRangeToFromIso } from '../../../lib/timeRange';
import type { TimeRange } from '../../../components/layout/TopBar';

export function useSddInteractions(timeRange: TimeRange, limit = 100) {
  const from = timeRangeToFromIso(timeRange);
  return useQuery({
    queryKey: ['sdd-interactions', timeRange],
    queryFn: () =>
      requestData<SddInteractionItem[]>(`/api/sdd/interactions?from=${from}&limit=${limit}`),
    staleTime: 15_000,
  });
}

export function useSddInteractionDetail(interactionId: string | null) {
  return useQuery({
    queryKey: ['sdd-interaction-detail', interactionId],
    queryFn: () => requestData<SddInteractionDetail>(`/api/sdd/interactions/${interactionId}`),
    enabled: Boolean(interactionId),
    staleTime: 15_000,
  });
}

export function useSddInteractionToolCalls(interactionId: string | null) {
  return useQuery({
    queryKey: ['sdd-interaction-tool-calls', interactionId],
    queryFn: () =>
      requestData<SddInteractionToolCallListResponse>(
        `/api/sdd/interactions/${interactionId}/tool-calls`,
      ),
    enabled: Boolean(interactionId),
    staleTime: 15_000,
  });
}
