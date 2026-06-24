import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  EvalArtifactType,
  Rubric,
  RubricMutationResponse,
  RubricOverviewResponse,
} from '@sdd-telemetry/api';
import { requestData } from '@/api/client';

function rubricKey(profileId: string, artifactType: string) {
  return ['admin', 'eval-rubrics', profileId, artifactType] as const;
}

export function useRubricOverview(profileId: string, artifactType: EvalArtifactType) {
  return useQuery({
    queryKey: rubricKey(profileId, artifactType),
    queryFn: () =>
      requestData<RubricOverviewResponse>(
        `/api/eval/rubrics?profileId=${encodeURIComponent(profileId)}&artifactType=${artifactType}`,
      ),
  });
}

export function useSaveRubricDraft(profileId: string, artifactType: EvalArtifactType) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (rubric: Rubric) =>
      requestData<RubricMutationResponse>('/api/eval/rubrics', {
        method: 'POST',
        body: JSON.stringify({ profileId, artifactType, rubric }),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: rubricKey(profileId, artifactType) });
    },
  });
}

export function usePublishRubric(profileId: string, artifactType: EvalArtifactType) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      requestData<RubricMutationResponse>(`/api/eval/rubrics/${id}/publish`, {
        method: 'POST',
        body: JSON.stringify({ profileId }),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: rubricKey(profileId, artifactType) });
    },
  });
}
