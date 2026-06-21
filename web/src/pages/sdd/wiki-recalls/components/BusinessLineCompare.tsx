import type { ProfileKnowledgeSourceSummary } from '@sdd-telemetry/api';
import { CARD_STYLE, REPO_COLOR } from '../styles';
import { formatInteger } from '@/lib/format';

export function BusinessLineCompare({ sources }: { sources: ProfileKnowledgeSourceSummary[] }) {
  return (
    <section className="p-[14px] rounded-[6px]" style={CARD_STYLE}>
      <div className="mb-3 flex items-center gap-2">
        <span className="text-[14px] font-semibold text-[#f5f5f5]">来源空间知识访问</span>
        <span className="text-[11px] text-[var(--color-muted)]">
          按 source rule 命中的知识来源聚合，不解释其内部目录结构
        </span>
      </div>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
        {sources.map((r) => {
          return (
            <div
              key={r.sourceNamespace}
              className="grid gap-[10px] rounded-[6px] p-3"
              style={{
                background: 'var(--color-hover)',
                border: '1px solid var(--color-border)',
              }}
            >
              <div className="flex items-center justify-between">
                <span className="inline-flex items-center gap-[7px] text-[13px] font-semibold text-[#f5f5f5]">
                  <span
                    className="h-2 w-2 rounded-[2px]"
                    style={{ background: REPO_COLOR[r.sourceNamespace] }}
                  />
                  {r.label}
                </span>
                <span
                  className="text-[11px] text-[var(--color-muted)]"
                  style={{ fontFamily: 'var(--font-mono)' }}
                >
                  {r.distinctUsers} 人
                </span>
              </div>
                  <div className="flex items-baseline gap-[6px]">
                <b
                  className="text-[20px] font-semibold text-[#f5f5f5]"
                  style={{ fontFamily: 'var(--font-mono)' }}
                >
                  {formatInteger(r.accessCount)}
                </b>
                <span className="text-[12px] text-[var(--color-muted)]">次访问</span>
                  </div>
              <div className="flex gap-[14px] text-[11px] text-[var(--color-secondary)]">
                <span>
                  访问文档{' '}
                  <span
                    style={{
                      fontFamily: 'var(--font-mono)',
                      color: 'var(--color-text)',
                    }}
                  >
                    {formatInteger(r.accessedDocs)}
                  </span>
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
