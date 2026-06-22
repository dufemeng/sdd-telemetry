import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { ArrowLeft, GitBranch } from 'lucide-react';
import { useShellContext } from '@/components/layout/useShellContext';
import { useProfileDemandDetail, useProfileArtifactTimeline } from '@/pages/profiles/useProfiles';
import { ArtifactList } from './components/ArtifactList';
import { ArtifactWriteTimeline } from './components/ArtifactWriteTimeline';
import { InteractionDetailDrawer } from '@/components/sdd/InteractionDetailDrawer';
import { formatInteger } from '@/lib/format';
import { useBackNavigate } from '@/lib/useBackNavigate';

const CARD_STYLE = { border: '1px solid var(--color-border)', background: 'var(--color-surface)' };

export default function WorkItemDetailPage() {
  const { id = '' } = useParams();
  const { profileId } = useShellContext();
  const goBack = useBackNavigate('/sdd/work-items');
  const detailQuery = useProfileDemandDetail(profileId, id || null);
  const detail = detailQuery.data;

  const [selectedArtifactId, setSelectedArtifactId] = useState<string | null>(null);
  const [turnInteractionId, setTurnInteractionId] = useState<string | null>(null);

  useEffect(() => {
    if (!selectedArtifactId && detail && detail.artifacts.length > 0) {
      setSelectedArtifactId(detail.artifacts[0]?.id ?? null);
    }
  }, [detail, selectedArtifactId]);

  const writesQuery = useProfileArtifactTimeline(profileId, id || null, selectedArtifactId);

  if (detailQuery.isLoading) {
    return <div className="p-4 text-[13px] text-[var(--color-muted)]">加载中…</div>;
  }
  if (!detail) {
    return <div className="p-4 text-[13px] text-[var(--color-muted)]">需求不存在</div>;
  }

  return (
    <div className="grid gap-3">
      <section className="flex flex-col gap-2 p-[14px] rounded-[6px]" style={CARD_STYLE}>
        <button
          onClick={goBack}
          className="self-start inline-flex items-center gap-1 text-[12px] text-[var(--color-muted)] hover:text-[var(--color-secondary)]"
        >
          <ArrowLeft size={14} /> 返回
        </button>
        <div className="flex items-center gap-2">
          <GitBranch size={18} style={{ color: 'var(--color-primary)' }} />
          <h2 className="text-[16px] font-semibold text-[#f5f5f5]">
            {detail.businessDomain ? `${detail.businessDomain} / ` : ''}{detail.title ?? detail.unitSlug}
          </h2>
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-[var(--color-secondary)]" style={{ fontFamily: 'var(--font-mono)' }}>
          <span>文档 {detail.artifacts.length}</span>
          <span>参与 {formatInteger(detail.contributorCount)} 人</span>
          <span>{formatInteger(detail.turnCount)} turns</span>
          <span>跨 {formatInteger(detail.sessionCount)} session</span>
          <span>wiki 读取 {formatInteger(detail.knowledgeRecallCount)} 次</span>
        </div>
      </section>

      <div className="grid gap-3" style={{ gridTemplateColumns: '280px 1fr' }}>
        <ArtifactList
          artifacts={detail.artifacts}
          selectedId={selectedArtifactId}
          onSelect={setSelectedArtifactId}
        />
        <ArtifactWriteTimeline
          writes={writesQuery.data?.items ?? []}
          isLoading={writesQuery.isLoading}
          onOpenTurn={setTurnInteractionId}
        />
      </div>

      <InteractionDetailDrawer
        interactionId={turnInteractionId}
        open={Boolean(turnInteractionId)}
        onOpenChange={(open) => { if (!open) setTurnInteractionId(null); }}
      />
    </div>
  );
}
