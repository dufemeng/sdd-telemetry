import { useQuery } from '@tanstack/react-query';
import { requestData } from '@/api/client';
import type { DailyReportDetailResponse } from '@sdd-telemetry/api';

export function useDailyReport(date: string | undefined, enabled = true) {
  return useQuery({
    queryKey: ['daily-report', date],
    queryFn: () =>
      requestData<DailyReportDetailResponse | null>(
        `/api/reports/daily/${date}`,
      ),
    enabled: enabled && !!date,
    staleTime: 60_000,
  });
}

export function useLatestDailyReport(enabled = true) {
  return useQuery({
    queryKey: ['daily-report', 'latest'],
    queryFn: () =>
      requestData<DailyReportDetailResponse | null>(
        '/api/reports/daily/latest',
      ),
    enabled,
    staleTime: 60_000,
  });
}
