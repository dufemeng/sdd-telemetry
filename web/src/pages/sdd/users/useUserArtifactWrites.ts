import { useQuery } from '@tanstack/react-query';
import type { SddArtifactWrite, SddArtifactWriteListResponse, SddWorkItemDetail } from '@sdd-telemetry/api';
import { requestData } from '@/api/client';

export type UserArtifactWrite = SddArtifactWrite & { artifactId: string };

export function useUserArtifactWrites(workItemId: string | null, userId: string | undefined, enabled = true) {
  return useQuery({
    queryKey: ['user-artifact-writes', workItemId, userId],
    queryFn: async (): Promise<UserArtifactWrite[]> => {
      if (!workItemId) return [];
      const detail = await requestData<SddWorkItemDetail>(`/api/sdd/work-items/${workItemId}`);
      const results = await Promise.allSettled(
        detail.artifacts.map((art) =>
          requestData<SddArtifactWriteListResponse>(
            `/api/sdd/work-items/${workItemId}/artifacts/${art.id}/writes${userId ? `?userId=${encodeURIComponent(userId)}` : ''}`,
          ).then((res) => ({ artifactId: art.id, items: res.items })),
        ),
      );
      const merged: UserArtifactWrite[] = [];
      for (const result of results) {
        if (result.status === 'fulfilled') {
          for (const w of result.value.items) {
            merged.push({ ...w, artifactId: result.value.artifactId });
          }
        }
      }
      merged.sort((a, b) => {
        if (!a.eventTime && !b.eventTime) return 0;
        if (!a.eventTime) return 1;
        if (!b.eventTime) return -1;
        return new Date(b.eventTime).getTime() - new Date(a.eventTime).getTime();
      });
      return merged;
    },
    enabled: enabled && workItemId !== null,
    staleTime: 30_000,
  });
}
