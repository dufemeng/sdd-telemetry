import { useMemo } from 'react';
import type { SddUsageItem, WikiRecallRow } from '@sdd-telemetry/api';
import { useUserSkillUsages } from './useUserSkillUsages';
import { useWikiRecallList } from '@/pages/sdd/wiki-recalls/useWikiRecalls';
import { useUserArtifactWrites, type UserArtifactWrite } from './useUserArtifactWrites';

export type ActivityNodeKind = 'skill' | 'wiki' | 'write' | 'discussion';

export interface ActivityNode {
  id: string;
  kind: ActivityNodeKind;
  eventTime: string | null;
  interactionId: string | null;
  semanticCode: string | null;
  semanticDisplayName: string | null;
  rawSkillName: string | null;
  title: string;
  detail: string | null;
  wikiRelativePath?: string | null;
  artifactId?: string;
}

export function useUserActivity(
  userId: string | undefined,
  selectedWorkItemId: string | null,
) {
  const skillsQuery = useUserSkillUsages(userId);
  const wikiQuery = useWikiRecallList('30d', { userId });
  const writesQuery = useUserArtifactWrites(selectedWorkItemId);

  return useMemo(() => {
    const skillNodes: ActivityNode[] = (skillsQuery.data ?? [])
      .filter((s) => !selectedWorkItemId || String(s.workItemId) === String(selectedWorkItemId))
      .map((s: SddUsageItem) => ({
        id: `skill-${s.id}`,
        kind: 'skill' as const,
        eventTime: s.eventTime,
        interactionId: s.interactionId,
        semanticCode: s.semanticCode,
        semanticDisplayName: s.semanticDisplayName,
        rawSkillName: s.rawSkillName,
        title: s.semanticDisplayName ?? s.rawSkillName ?? 'skill call',
        detail: s.status,
      }));
    const wikiNodes: ActivityNode[] = (wikiQuery.data?.items ?? [])
      .filter((w) => !selectedWorkItemId || String(w.workItemId) === String(selectedWorkItemId))
      .map((w: WikiRecallRow) => ({
        id: `wiki-${w.id}`,
        kind: 'wiki' as const,
        eventTime: w.eventTime,
        interactionId: w.interactionId,
        semanticCode: null,
        semanticDisplayName: null,
        rawSkillName: null,
        title: w.actionType === 'read' ? 'wiki 召回' : `wiki ${w.actionType}`,
        detail: w.wikiRelativePath ?? w.rawPath,
        wikiRelativePath: w.wikiRelativePath ?? w.rawPath,
      }));
    const writeNodes: ActivityNode[] = (writesQuery.data ?? []).map((w: UserArtifactWrite) => ({
      id: `write-${w.artifactId}-${w.id}`,
      kind: w.nodeKind === 'discussion' ? 'discussion' : 'write',
      eventTime: w.eventTime,
      interactionId: w.interactionId,
      semanticCode: w.skillSemanticCode,
      semanticDisplayName: w.skillDisplayName,
      rawSkillName: w.rawSkillName,
      title: w.nodeKind === 'discussion' ? '讨论' : (w.writeKind ?? '写入'),
      detail: w.contentPreview ?? w.promptPreview,
      artifactId: w.artifactId,
    }));

    const all = [...skillNodes, ...wikiNodes, ...writeNodes];
    all.sort((a, b) => {
      if (!a.eventTime && !b.eventTime) return 0;
      if (!a.eventTime) return 1;
      if (!b.eventTime) return -1;
      return new Date(b.eventTime).getTime() - new Date(a.eventTime).getTime();
    });
    return all.slice(0, 200);
  }, [skillsQuery.data, wikiQuery.data, writesQuery.data, selectedWorkItemId]);
}
