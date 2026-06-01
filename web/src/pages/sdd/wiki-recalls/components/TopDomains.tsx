import { Trophy } from 'lucide-react';
import type { WikiCoverageDomain } from '@sdd-telemetry/api';
import { CARD_STYLE, REPO_LABEL, repoTagStyle } from '../styles';
import { formatInteger } from '@/lib/format';

const RANK_COLORS = ['var(--color-primary)', 'var(--color-secondary)', 'var(--color-muted)'];

export function TopDomains({ domains, onSelectDomain }: { domains: WikiCoverageDomain[]; onSelectDomain: (repo: string, domain: string) => void }) {
  const top = [...domains].sort((a, b) => b.recalls - a.recalls).slice(0, 3);
  return (
    <section className="p-[14px] rounded-[6px]" style={CARD_STYLE}>
      <div className="mb-3 flex items-center gap-2" style={{ color: 'var(--color-primary)' }}>
        <Trophy size={18} />
        <span className="text-[14px] font-semibold text-[#f5f5f5]">标杆领域</span>
        <span className="ml-auto inline-flex h-[20px] items-center rounded-[4px] px-2 text-[11px] font-medium" style={{ border: '1px solid rgba(250,255,105,0.22)', color: 'var(--color-primary)', background: 'rgba(250,255,105,0.06)' }}>TOP 3</span>
      </div>
      <div className="grid gap-2">
        {top.map((d, i) => (
          <div
            key={`${d.repo}-${d.domain}`}
            className="relative cursor-pointer overflow-hidden rounded-[6px] p-[10px] pl-[14px]"
            style={{ background: 'var(--color-hover)', border: '1px solid var(--color-border)' }}
            onClick={() => onSelectDomain(d.repo, d.domain)}
          >
            <span className="absolute bottom-0 left-0 top-0 w-[3px]" style={{ background: RANK_COLORS[i] }} />
            <span className="absolute right-0 top-0 px-2 py-[3px] text-[10px] font-bold" style={{ background: RANK_COLORS[i], color: i === 0 ? '#0a0a0a' : 'var(--color-surface)', borderRadius: '0 6px 0 6px' }}>#{i + 1}</span>
            <div className="flex items-center gap-[6px] text-[13px] font-medium text-[#f5f5f5]">
              <span className="rounded-[3px] px-[6px] py-[1px] text-[10px]" style={repoTagStyle(d.repo)}>{REPO_LABEL[d.repo] ?? d.repo}</span>
              {d.domain}
            </div>
            <div className="mt-[6px] flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-[var(--color-secondary)]" style={{ fontFamily: 'var(--font-mono)' }}>
              <span>召回 {formatInteger(d.recalls)}</span>
              <span>覆盖 {d.recalledDocs}/{d.totalDocs}</span>
              <span>{d.distinctUsers} 人</span>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
