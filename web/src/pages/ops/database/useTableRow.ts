import { useQuery } from '@tanstack/react-query';
import type { OpsTableRowResponse } from '@sdd-telemetry/api';
import { requestData } from '../../../api/client';

interface TableRowParams {
  tableName: string;
  id: string | null;
}

export function useTableRow({ tableName, id }: TableRowParams) {
  return useQuery({
    queryKey: ['table-row', tableName, id],
    queryFn: () => requestData<OpsTableRowResponse>(`/api/ops/tables/${tableName}/rows/${id}`),
    enabled: Boolean(tableName && id),
    staleTime: 30_000,
  });
}
