import type { WikiCoverageRepo } from '@sdd-telemetry/api';
import { CARD_STYLE, REPO_COLOR, coverFillColor } from '../styles';
import { formatInteger } from '@/lib/format';

export function BusinessLineCompare({ repos, degraded }: { repos: WikiCoverageRepo[]; degraded: boolean }) {
  return (
    <section className="p-[14px] rounded-[6px]" style={CARD_STYLE}>
      <div className="mb-3 flex items-center gap-2">
        <span className="text-[14px] font-semibold text-[#f5f5f5]">三业务线知识资产对比</span>
        <span className="text-[11px] text-[var(--color-muted)]">每条线一个知识库 git 仓库，利用率 = 被读 ∩ 库内现存 / 库内总数</span>
      </div>
      <div className="grid grid-cols-3 gap-3">
        {repos.map((r) => {
          const rate = r.coverageRate;
          return (
            <div key={r.repo} className="grid gap-[10px] rounded-[6px] p-3" style={{ background: 'var(--color-hover)', border: '1px solid var(--color-border)' }}>
              <div className="flex items-center justify-between">
                <span className="inline-flex items-center gap-[7px] text-[13px] font-semibold text-[#f5f5f5]">
                  <span className="h-2 w-2 rounded-[2px]" style={{ background: REPO_COLOR[r.repo] }} />
                  {r.label}
                </span>
                <span className="text-[11px] text-[var(--color-muted)]" style={{ fontFamily: 'var(--font-mono)' }}>规模 {r.totalDocs}</span>
              </div>
              {degraded ? (
                <div className="text-[11px] text-[var(--color-warn-text)]">需服务器挂载知识库</div>
              ) : (
                <>
                  <div className="flex items-baseline gap-[6px]">
                    <b className="text-[20px] font-semibold text-[#f5f5f5]" style={{ fontFamily: 'var(--font-mono)' }}>{Math.round(rate * 100)}%</b>
                    <span className="text-[12px] text-[var(--color-muted)]" style={{ fontFamily: 'var(--font-mono)' }}>{r.recalledDocs} / {r.totalDocs}</span>
                  </div>
                  <div className="h-[3px] w-full overflow-hidden rounded-full" style={{ background: 'rgba(255,255,255,0.08)' }}>
                    <div className="h-full rounded-full" style={{ width: `${rate * 100}%`, background: coverFillColor(rate) }} />
                  </div>
                </>
              )}
              <div className="flex gap-[14px] text-[11px] text-[var(--color-secondary)]">
                <span>召回 <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--color-text)' }}>{formatInteger(r.recalls)}</span></span>
                <span style={{ color: 'var(--color-bad-text)' }}>沉睡 {r.deadDocs}</span>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
