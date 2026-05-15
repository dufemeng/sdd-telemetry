import { useQuery } from '@tanstack/react-query';
import type { IngestHealth } from '@sdd-monitor/api';
import { requestData } from '../../api/client';

export function useIngestHealth(windowHours = 24) {
  return useQuery({
    queryKey: ['ingest-health', windowHours],
    queryFn: () => requestData<IngestHealth>(`/api/ingest/health?windowHours=${windowHours}`),
    staleTime: 15_000,
  });
}
