import { useQuery } from '@tanstack/react-query';
import type { OpsTableFilter, OpsTableRowsResponse } from '@sdd-telemetry/api';
import { requestData } from '../../../api/client';

interface TableRowsParams {
  tableName: string;
  filters?: OpsTableFilter[];
  cursor?: string;
  limit?: number;
}

export function useTableRows({ tableName, filters = [], cursor, limit = 50 }: TableRowsParams) {
  const params = new URLSearchParams({ limit: String(limit) });
  if (filters.length > 0) params.set('filters', JSON.stringify(filters));
  if (cursor) params.set('cursor', cursor);
  const url = `/api/ops/tables/${tableName}/rows?${params}`;

  return useQuery({
    queryKey: ['table-rows', tableName, filters, cursor, limit],
    queryFn: () => requestData<OpsTableRowsResponse>(url),
    enabled: Boolean(tableName),
    staleTime: 15_000,
  });
}
