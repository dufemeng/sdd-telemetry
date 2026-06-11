import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CreateSddSemanticRequest, UpdateSddSemanticRequest, SddSemantic } from '@sdd-telemetry/api';
import { requestData } from '@/api/client';

export function useSddSemantics(enabled = true) {
  return useQuery({
    queryKey: ['sdd-semantics'],
    queryFn: () => requestData<SddSemantic[]>('/api/sdd/semantics'),
    staleTime: 30_000,
    enabled,
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

export function useUpdateSddSemantic() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: UpdateSddSemanticRequest }) =>
      requestData<SddSemantic>(`/api/sdd/semantics/${id}`, {
        method: 'PUT',
        body: JSON.stringify(body),
      }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['sdd-semantics'] }),
  });
}

export function useDeleteSddSemantic() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      requestData<{ deleted: boolean }>(`/api/sdd/semantics/${id}`, { method: 'DELETE' }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['sdd-semantics'] }),
  });
}
