import { useQuery } from '@tanstack/react-query';
import type { ProfileKnowledgeContent, SddWikiRecallContent } from '@sdd-telemetry/api';
import { requestData } from '@/api/client';
import { useShellContext } from '@/components/layout/useShellContext';

export function useWikiRecallContent(toolCallId: string | null) {
  const { profileId } = useShellContext();
  return useQuery({
    queryKey: ['profile-knowledge-content', profileId, toolCallId],
    queryFn: async () => mapKnowledgeContent(
      await requestData<ProfileKnowledgeContent>(
        `/api/profiles/${profileId}/knowledge/content/${toolCallId}`,
      ),
    ),
    enabled: Boolean(profileId) && Boolean(toolCallId),
    staleTime: 60_000,
  });
}

function mapKnowledgeContent(content: ProfileKnowledgeContent): SddWikiRecallContent {
  return {
    found: content.found,
    reason: content.reason,
    repoName: content.sourceNamespace,
    relativePath: content.relativePath,
    rawPath: content.rawPath,
    isMarkdown: content.isMarkdown,
    content: content.content,
    truncated: content.truncated,
  };
}
