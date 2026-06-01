import { useQuery } from '@tanstack/react-query';
import type { SddWikiRecallContent } from '@sdd-telemetry/api';
import { requestData } from '@/api/client';

export function useWikiRecallContent(toolCallId: string | null) {
  return useQuery({
    queryKey: ['sdd-wiki-recall-content', toolCallId],
    queryFn: () =>
      requestData<SddWikiRecallContent>(`/api/sdd/wiki-recalls/content/${toolCallId}`),
    enabled: Boolean(toolCallId),
    staleTime: 60_000,
  });
}
