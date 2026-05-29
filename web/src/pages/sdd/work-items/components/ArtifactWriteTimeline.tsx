import type { SddArtifactWrite } from '@sdd-telemetry/api';
import { BookOpen, GitCommit } from 'lucide-react';
import { formatTime } from '@/lib/format';

const CARD_STYLE = { border: '1px solid var(--color-border)', background: 'var(--color-surface)' };

export function ArtifactWriteTimeline({
  writes,
  isLoading,
  onOpenTurn,
}: {
  writes: SddArtifactWrite[];
  isLoading: boolean;
  onOpenTurn: (interactionId: string) => void;
}) {
  return (
    <section className="rounded-[6px] overflow-hidden" style={CARD_STYLE}>
      <div className="flex items-center gap-2 px-[14px] py-3" style={{ borderBottom: '1px solid var(--color-border)', color: 'var(--color-primary)' }}>
        <GitCommit size={16} />
        <h3 className="text-[13px] font-semibold text-[#f5f5f5]">生成时间线</h3>
        <span className="text-[11px] text-[var(--color-muted)]">· {writes.length} 次写入</span>
      </div>

      {isLoading ? (
        <div className="px-[14px] py-6 text-[12px] text-[var(--color-muted)]">正在加载时间线…</div>
      ) : writes.length === 0 ? (
        <div className="px-[14px] py-6 text-[12px] text-[var(--color-muted)]">
          暂无写入记录（event 层约 30 天内的写入才会出现；更早的需求请见 summary）
        </div>
      ) : (
        <div className="grid">
          {writes.map((w) => (
            <div key={w.id} className="flex flex-col gap-[6px] px-[14px] py-[12px]" style={{ borderBottom: '1px solid var(--color-border)' }}>
              <div className="flex items-center gap-2 text-[11px]">
                <span className="text-[var(--color-muted)]" style={{ fontFamily: 'var(--font-mono)' }}>{formatTime(w.eventTime)}</span>
                <span className="px-[6px] py-[1px] rounded-[3px] text-[10px]" style={{ color: 'var(--color-secondary)', background: 'rgba(255,255,255,0.06)' }}>{w.writeKind}</span>
                <span className="text-[var(--color-secondary)]">{w.skillDisplayName ?? w.rawSkillName ?? '无 skill'}</span>
                <span className="inline-flex items-center gap-1 text-[var(--color-muted)]">
                  <BookOpen size={11} /> wiki×{w.wikiRecallCount}
                </span>
              </div>
              {w.promptPreview ? (
                <p className="text-[12px] text-[var(--color-text)] overflow-hidden" style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>{w.promptPreview}</p>
              ) : (
                <p className="text-[12px] text-[var(--color-muted)]">（无 prompt 文本）</p>
              )}
              {w.interactionId ? (
                <button
                  onClick={() => onOpenTurn(w.interactionId!)}
                  className="self-start text-[11px] px-[8px] py-[3px] rounded-[4px]"
                  style={{ color: 'var(--color-primary)', border: '1px solid rgba(250,255,105,0.22)', background: 'rgba(250,255,105,0.06)' }}
                >
                  展开全文
                </button>
              ) : (
                <span className="self-start text-[11px] text-[var(--color-muted)]">无可回溯的交互</span>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
