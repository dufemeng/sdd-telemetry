import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  AuthUser,
  CreateAuthUserRequest,
  ResetAuthPasswordRequest,
  UpdateAuthUserRequest,
} from '@sdd-telemetry/api';
import { requestData } from '@/api/client';

const QUERY_KEY = ['auth', 'users'] as const;

export function useAuthUsers() {
  return useQuery({
    queryKey: QUERY_KEY,
    queryFn: () => requestData<AuthUser[]>('/api/auth/users'),
  });
}

export function useCreateAuthUser() {
  return useUserMutation((body: CreateAuthUserRequest) =>
    requestData<AuthUser>('/api/auth/users', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  );
}

export function useUpdateAuthUser() {
  return useUserMutation(({ id, body }: { id: string; body: UpdateAuthUserRequest }) =>
    requestData<AuthUser>(`/api/auth/users/${id}`, {
      method: 'PUT',
      body: JSON.stringify(body),
    }),
  );
}

export function useResetAuthPassword() {
  return useUserMutation(({ id, body }: { id: string; body: ResetAuthPasswordRequest }) =>
    requestData<AuthUser>(`/api/auth/users/${id}/reset-password`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  );
}

export function useSetAuthUserStatus() {
  return useUserMutation(({ id, action }: { id: string; action: 'enable' | 'disable' }) =>
    requestData<AuthUser>(`/api/auth/users/${id}/${action}`, { method: 'POST' }),
  );
}

function useUserMutation<TInput>(mutationFn: (input: TInput) => Promise<AuthUser>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: QUERY_KEY }),
  });
}
