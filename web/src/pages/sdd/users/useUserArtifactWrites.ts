import { useQuery } from '@tanstack/react-query';
import type { SddArtifactWrite, SddArtifactWriteListResponse, SddWorkItemDetail } from '@sdd-telemetry/api';
import { requestData } from '@/api/client';

export type UserArtifactWrite = SddArtifactWrite & { artifactId: string };

export function useUserArtifactWrites(workItemId: string | null) {
  return useQuery({
    queryKey: ['user-artifact-writes', workItemId],
    queryFn: async (): Promise<UserArtifactWrite[]> => {
      if (!workItemId) return [];
      const detail = await requestData<SddWorkItemDetail>(`/api/sdd/work-items/${workItemId}`);
      const merged: UserArtifactWrite[] = [];
      await Promise.all(
        detail.artifacts.map(async (art) => {
          const res = await requestData<SddArtifactWriteListResponse>(
            `/api/sdd/work-items/${workItemId}/artifacts/${art.id}/writes`,
          );
          for (const w of res.items) {
            merged.push({ ...w, artifactId: art.id });
          }
        }),
      );
      merged.sort((a, b) => {
        if (!a.eventTime && !b.eventTime) return 0;
        if (!a.eventTime) return 1;
        if (!b.eventTime) return -1;
        return new Date(b.eventTime).getTime() - new Date(a.eventTime).getTime();
      });
      return merged;
    },
    enabled: workItemId !== null,
    staleTime: 30_000,
  });
}
