import { useQuery } from '@tanstack/react-query';
import type { OpsTableRowsResponse } from '@sdd-telemetry/api';
import { requestData } from '../../../api/client';

interface TableRowsParams {
  tableName: string;
  filterColumn?: string;
  filterValue?: string;
  limit?: number;
}

export function useTableRows({ tableName, filterColumn, filterValue, limit = 50 }: TableRowsParams) {
  const filters =
    filterColumn && filterValue
      ? encodeURIComponent(JSON.stringify([{ column: filterColumn, operator: 'like', value: `%${filterValue}%` }]))
      : '';
  const url = `/api/ops/tables/${tableName}/rows?limit=${limit}${filters ? `&filters=${filters}` : ''}`;

  return useQuery({
    queryKey: ['table-rows', tableName, filterColumn, filterValue],
    queryFn: () => requestData<OpsTableRowsResponse>(url),
    enabled: Boolean(tableName),
    staleTime: 15_000,
  });
}
