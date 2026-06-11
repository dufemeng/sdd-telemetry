import { useQuery } from '@tanstack/react-query';
import { requestData } from '@/api/client';
import type { DailyReportListResponse } from '@sdd-telemetry/api';

export function useDailyReportList(
  from?: string,
  to?: string,
  page = 1,
  pageSize = 30,
  enabled = true,
) {
  return useQuery({
    queryKey: ['daily-report-list', from, to, page, pageSize],
    queryFn: () => {
      const params = new URLSearchParams();
      if (from) params.set('from', from);
      if (to) params.set('to', to);
      params.set('page', String(page));
      params.set('pageSize', String(pageSize));
      return requestData<DailyReportListResponse>(
        `/api/reports/daily?${params.toString()}`,
      );
    },
    enabled,
    staleTime: 60_000,
  });
}
