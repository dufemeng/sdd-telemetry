import type { SddWorkItemDetail } from '@sdd-telemetry/api';
import { FileText } from 'lucide-react';

type Artifact = SddWorkItemDetail['artifacts'][number];

const CARD_STYLE = { border: '1px solid var(--color-border)', background: 'var(--color-surface)' };

export function ArtifactList({
  artifacts,
  selectedId,
  onSelect,
}: {
  artifacts: Artifact[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  return (
    <section className="rounded-[6px] overflow-hidden" style={CARD_STYLE}>
      <div className="flex items-center gap-2 px-[14px] py-3" style={{ borderBottom: '1px solid var(--color-border)', color: 'var(--color-primary)' }}>
        <FileText size={16} />
        <h3 className="text-[13px] font-semibold text-[#f5f5f5]">文档 · {artifacts.length}</h3>
      </div>
      <div className="grid">
        {artifacts.length === 0 ? (
          <div className="px-[14px] py-6 text-[12px] text-[var(--color-muted)]">该需求暂无文档</div>
        ) : (
          artifacts.map((a) => {
            const on = a.id === selectedId;
            return (
              <button
                key={a.id}
                onClick={() => onSelect(a.id)}
                className="flex flex-col gap-[2px] px-[14px] py-[10px] text-left transition-colors"
                style={{
                  borderBottom: '1px solid var(--color-border)',
                  background: on ? 'rgba(250,255,105,0.06)' : 'transparent',
                  borderLeft: on ? '3px solid var(--color-primary)' : '3px solid transparent',
                }}
              >
                <span className="text-[10px]" style={{ color: 'var(--color-primary)' }}>{a.artifactType}</span>
                <span className="text-[12px] text-[var(--color-secondary)] truncate" style={{ fontFamily: 'var(--font-mono)' }} title={a.artifactRelativePath}>
                  {a.artifactRelativePath}
                </span>
              </button>
            );
          })
        )}
      </div>
    </section>
  );
}
