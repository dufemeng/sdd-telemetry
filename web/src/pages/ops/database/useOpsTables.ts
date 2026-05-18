import { useQuery } from '@tanstack/react-query';
import type { OpsTablesResponse } from '@sdd-telemetry/api';
import { requestData } from '../../../api/client';

export function useOpsTables() {
  return useQuery({
    queryKey: ['ops-tables'],
    queryFn: () => requestData<OpsTablesResponse>('/api/ops/tables'),
    staleTime: 60_000,
  });
}
