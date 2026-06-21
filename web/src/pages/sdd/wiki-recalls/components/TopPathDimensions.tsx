import { Trophy } from 'lucide-react';
import type { ProfileKnowledgePathDimensionSummary } from '@sdd-telemetry/api';
import { CARD_STYLE, REPO_LABEL, repoTagStyle } from '../styles';
import { formatInteger } from '@/lib/format';

const RANK_COLORS = ['var(--color-primary)', 'var(--color-secondary)', 'var(--color-muted)'];

export function TopPathDimensions({
  pathDimensions,
  onSelectPathDimension,
}: {
  pathDimensions: ProfileKnowledgePathDimensionSummary[];
  onSelectPathDimension: (sourceNamespace: string, pathSegment: string) => void;
}) {
  const top = [...pathDimensions].sort((a, b) => b.accessCount - a.accessCount).slice(0, 3);
  return (
    <section className="p-[14px] rounded-[6px]" style={CARD_STYLE}>
      <div className="mb-3 flex items-center gap-2" style={{ color: 'var(--color-primary)' }}>
        <Trophy size={18} />
        <span className="text-[14px] font-semibold text-[#f5f5f5]">热门路径维度</span>
        <span
          className="ml-auto inline-flex h-[20px] items-center rounded-[4px] px-2 text-[11px] font-medium"
          style={{
            border: '1px solid rgba(250,255,105,0.22)',
            color: 'var(--color-primary)',
            background: 'rgba(250,255,105,0.06)',
          }}
        >
          TOP 3
        </span>
      </div>
      <div className="grid gap-2">
        {top.map((d, i) => (
          <div
            key={`${d.sourceNamespace}-${d.pathSegment}`}
            className="relative cursor-pointer overflow-hidden rounded-[6px] p-[10px] pl-[14px]"
            style={{
              background: 'var(--color-hover)',
              border: '1px solid var(--color-border)',
            }}
            onClick={() => onSelectPathDimension(d.sourceNamespace, d.pathSegment)}
          >
            <span
              className="absolute bottom-0 left-0 top-0 w-[3px]"
              style={{ background: RANK_COLORS[i] }}
            />
            <span
              className="absolute right-0 top-0 px-2 py-[3px] text-[10px] font-bold"
              style={{
                background: RANK_COLORS[i],
                color: i === 0 ? '#0a0a0a' : 'var(--color-surface)',
                borderRadius: '0 6px 0 6px',
              }}
            >
              #{i + 1}
            </span>
            <div className="flex items-center gap-[6px] text-[13px] font-medium text-[#f5f5f5]">
              {d.sourceNamespace ? (
                <span
                  className="rounded-[3px] px-[6px] py-[1px] text-[10px]"
                  style={repoTagStyle(d.sourceNamespace)}
                >
                  {REPO_LABEL[d.sourceNamespace] ?? d.sourceNamespace}
                </span>
              ) : null}
              {d.pathSegment}
            </div>
            <div
              className="mt-[6px] flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-[var(--color-secondary)]"
              style={{ fontFamily: 'var(--font-mono)' }}
            >
              <span>访问 {formatInteger(d.accessCount)}</span>
              <span>访问文档 {d.accessedDocs}</span>
              <span>{d.distinctUsers} 人</span>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
