import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  ProfileConfigAdminDetail,
  ProfileConfigAdminListResponse,
  ProfileConfigPreviewRequest,
  ProfileConfigPreviewResponse,
  PublishProfileConfigRequest,
  SaveProfileConfigDraftRequest,
} from '@sdd-telemetry/api';
import { requestData } from '@/api/client';

const LIST_QUERY_KEY = ['admin', 'profile-configs'] as const;

export function useProfileConfigAdminList() {
  return useQuery({
    queryKey: LIST_QUERY_KEY,
    queryFn: () => requestData<ProfileConfigAdminListResponse>('/api/admin/profile-configs'),
  });
}

export function useProfileConfigAdminDetail(profileId: string | null) {
  return useQuery({
    queryKey: [...LIST_QUERY_KEY, profileId],
    queryFn: () => requestData<ProfileConfigAdminDetail>(`/api/admin/profile-configs/${profileId}`),
    enabled: Boolean(profileId),
  });
}

export function useProfileConfigPreview() {
  return useMutation({
    mutationFn: (body: ProfileConfigPreviewRequest) =>
      requestData<ProfileConfigPreviewResponse>('/api/admin/profile-configs/preview', {
        method: 'POST',
        body: JSON.stringify(body),
      }),
  });
}

export function useCreateProfileConfigDraft() {
  return useProfileConfigMutation((body: SaveProfileConfigDraftRequest) =>
    requestData<ProfileConfigAdminDetail>('/api/admin/profile-configs', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  );
}

export function useSaveProfileConfigDraft() {
  return useProfileConfigMutation(({ profileId, body }: { profileId: string; body: SaveProfileConfigDraftRequest }) =>
    requestData<ProfileConfigAdminDetail>(`/api/admin/profile-configs/${profileId}/draft`, {
      method: 'PUT',
      body: JSON.stringify(body),
    }),
  );
}

export function usePublishProfileConfig() {
  return useProfileConfigMutation(({ profileId, body }: { profileId: string; body: PublishProfileConfigRequest }) =>
    requestData<ProfileConfigAdminDetail>(`/api/admin/profile-configs/${profileId}/publish`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  );
}

export function useDisableProfileConfig() {
  return useProfileConfigMutation((profileId: string) =>
    requestData<ProfileConfigAdminDetail>(`/api/admin/profile-configs/${profileId}/disable`, {
      method: 'POST',
    }),
  );
}

function useProfileConfigMutation<TInput>(
  mutationFn: (input: TInput) => Promise<ProfileConfigAdminDetail>,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: (detail) => {
      void queryClient.invalidateQueries({ queryKey: LIST_QUERY_KEY });
      void queryClient.invalidateQueries({ queryKey: ['profiles'] });
      void queryClient.invalidateQueries({ queryKey: [...LIST_QUERY_KEY, detail.summary.profileId] });
    },
  });
}
