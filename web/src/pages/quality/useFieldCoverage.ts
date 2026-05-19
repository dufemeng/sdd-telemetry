import { useQuery } from '@tanstack/react-query';
import type { FieldCoverage } from '@sdd-telemetry/api';
import { requestData } from '@/api/client';

export function useFieldCoverage() {
  return useQuery({
    queryKey: ['field-coverage'],
    queryFn: () => requestData<FieldCoverage>('/api/events/field-coverage'),
    staleTime: 30_000,
  });
}
