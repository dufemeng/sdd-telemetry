import { useQuery } from '@tanstack/react-query';
import type { SddArtifactWriteListResponse } from '@sdd-telemetry/api';
import { requestData } from '@/api/client';

export function useArtifactWrites(workItemId: string | null, artifactId: string | null) {
  return useQuery({
    queryKey: ['sdd-artifact-writes', workItemId, artifactId],
    queryFn: () =>
      requestData<SddArtifactWriteListResponse>(
        `/api/sdd/work-items/${workItemId}/artifacts/${artifactId}/writes`,
      ),
    enabled: Boolean(workItemId) && Boolean(artifactId),
    staleTime: 30_000,
  });
}
