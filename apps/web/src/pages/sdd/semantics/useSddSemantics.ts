import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CreateSddSemanticRequest, SddSemantic } from '@sdd-monitor/api';
import { requestData } from '../../../api/client';

export function useSddSemantics() {
  return useQuery({
    queryKey: ['sdd-semantics'],
    queryFn: () => requestData<SddSemantic[]>('/api/sdd/semantics'),
    staleTime: 30_000,
  });
}

export function useCreateSddSemantic() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateSddSemanticRequest) =>
      requestData<SddSemantic>('/api/sdd/semantics', {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['sdd-semantics'] }),
  });
}
