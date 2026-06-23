import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  CreateEvalItemRequest,
  EvalItemDetailResponse,
  EvalImportFromLogsRequest,
  EvalImportFromLogsResponse,
  EvalItemListResponse,
  UpdateEvalItemRequest,
} from '@sdd-telemetry/api';
import { requestData } from '@/api/client';

function listKey(profileId: string) {
  return ['admin', 'eval-items', profileId] as const;
}

export interface EvalItemListParams {
  profileId: string;
  source?: string;
  capabilityCode?: string;
  targetSkill?: string;
  enabled?: boolean;
  keyword?: string;
  page?: number;
  pageSize?: number;
}

function buildQuery(params: EvalItemListParams): string {
  const search = new URLSearchParams({ profileId: params.profileId });
  if (params.source) search.set('source', params.source);
  if (params.capabilityCode) search.set('capabilityCode', params.capabilityCode);
  if (params.targetSkill) search.set('targetSkill', params.targetSkill);
  if (params.enabled !== undefined) search.set('enabled', String(params.enabled));
  if (params.keyword) search.set('keyword', params.keyword.slice(0, 100));
  if (params.page) search.set('page', String(params.page));
  if (params.pageSize) search.set('pageSize', String(params.pageSize));
  return `/api/eval/items?${search.toString()}`;
}

export function useEvalItemsList(params: EvalItemListParams) {
  return useQuery({
    queryKey: [...listKey(params.profileId), params],
    queryFn: () => requestData<EvalItemListResponse>(buildQuery(params)),
  });
}

export function useEvalItemDetail(profileId: string, id: string | null) {
  return useQuery({
    queryKey: [...listKey(profileId), 'detail', id],
    queryFn: () => requestData<EvalItemDetailResponse>(`/api/eval/items/${id}?profileId=${encodeURIComponent(profileId)}`),
    enabled: Boolean(id),
    gcTime: 0,
  });
}

export function useImportFromLogs(profileId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: Omit<EvalImportFromLogsRequest, 'profileId'>) =>
      requestData<EvalImportFromLogsResponse>('/api/eval/items/import-from-logs', {
        method: 'POST',
        body: JSON.stringify({ ...body, profileId }),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: listKey(profileId) });
    },
  });
}

export function useCreateEvalItem(profileId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: Omit<CreateEvalItemRequest, 'profileId'>) =>
      requestData<{ id: string }>('/api/eval/items', {
        method: 'POST',
        body: JSON.stringify({ ...body, profileId }),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: listKey(profileId) });
    },
  });
}

export function useUpdateEvalItem(profileId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: Omit<UpdateEvalItemRequest, 'profileId'> }) =>
      requestData<{ id: string }>(`/api/eval/items/${id}`, {
        method: 'PUT',
        body: JSON.stringify({ ...body, profileId }),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: listKey(profileId) });
    },
  });
}

export function useDeleteEvalItem(profileId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      requestData<{ id: string }>(`/api/eval/items/${id}?profileId=${encodeURIComponent(profileId)}`, {
        method: 'DELETE',
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: listKey(profileId) });
    },
  });
}
