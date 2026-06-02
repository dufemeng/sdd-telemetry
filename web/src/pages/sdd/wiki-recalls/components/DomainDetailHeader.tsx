import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, BookOpen, Clock3, FileText, Gauge, TriangleAlert, Users } from 'lucide-react';
import type { WikiCoverageDomain } from '@sdd-telemetry/api';
import {
  useWikiRecallCoverage,
  useWikiRecallTimeline,
  useWikiRecallWorkItemRanking,
} from '../useWikiRecalls';
import { CARD_STYLE, ICON_BOX, coverFillColor, REPO_LABEL } from '../styles';
import { formatInteger } from '@/lib/format';

export function DomainDetailHeader({ repo, domain }: { repo: string; domain: string }) {
  const navigate = useNavigate();
  const coverageQuery = useWikiRecallCoverage();
  const reqQuery = useWikiRecallWorkItemRanking('all', { wikiDomain: domain });
  const timelineQuery = useWikiRecallTimeline('30d', 'day', 'domain', domain);

  const domainRow = useMemo<WikiCoverageDomain | undefined>(
    () => coverageQuery.data?.domains.find((d) => d.repo === repo && d.domain === domain),
    [coverageQuery.data, repo, domain],
  );

  const reqItems = reqQuery.data?.items.slice(0, 5) ?? [];
  const d = domainRow;
  const coverageRate = d ? d.recalledDocs / Math.max(d.totalDocs, 1) : 0;

  return (
    <section className="grid gap-3 rounded-[6px] p-[14px]" style={CARD_STYLE}>
      <div className="flex flex-wrap items-center gap-x-6 gap-y-1 text-[12px] text-[var(--color-secondary)]">
        <KpiItem icon={<FileText size={14} />} label="文档" value={formatInteger(d?.totalDocs ?? 0)} />
        <KpiItem
          icon={<Gauge size={14} />}
          label="覆盖"
          value={d ? `${Math.round(coverageRate * 100)}%(${d.recalledDocs}/${d.totalDocs})` : '—'}
          color={coverFillColor(coverageRate)}
        />
        <KpiItem icon={<BookOpen size={14} />} label="累计召回" value={formatInteger(d?.recalls ?? 0)} />
        <KpiItem icon={<TriangleAlert size={14} />} label="沉睡" value={String(d?.deadDocs ?? 0)} color="var(--color-bad-text)" />
        <KpiItem icon={<Users size={14} />} label="读者" value={formatInteger(d?.distinctUsers ?? 0)} />
      </div>

      <div className="grid gap-3" style={{ gridTemplateColumns: '1fr 240px' }}>
        <div>
          <div className="mb-2 flex items-center gap-2 text-[12px] font-semibold text-[#f5f5f5]">
            <Clock3 size={13} style={{ color: 'var(--color-primary)' }} />
            召回本域文档的需求 Top
            <span className="text-[11px] font-normal text-[var(--color-muted)]">· {reqQuery.data?.total ?? reqItems.length} 个</span>
          </div>
          {reqQuery.isLoading ? (
            <div className="text-[12px] text-[var(--color-muted)]">加载中…</div>
          ) : reqItems.length === 0 ? (
            <div className="text-[12px] text-[var(--color-muted)]">暂无需求召回过本域文档</div>
          ) : (
            <div className="grid gap-[2px]">
              {reqItems.map((w) => (
                <button
                  key={w.workItemId}
                  className="group flex items-center justify-between gap-2 rounded-[4px] px-2 py-[5px] text-left hover:bg-[#171717]"
                  onClick={() => navigate(`/sdd/work-items/${w.workItemId}`)}
                >
                  <div className="flex min-w-0 flex-col">
                    <span className="truncate text-[12px] text-[var(--color-secondary)]" style={{ fontFamily: 'var(--font-mono)' }} title={w.workItemSlug}>
                      {w.workItemSlug}
                    </span>
                    {w.businessDomain && (
                      <span className="truncate text-[10px] text-[var(--color-muted)]">{w.businessDomain}</span>
                    )}
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="text-[11px] text-[var(--color-muted)]" style={{ fontFamily: 'var(--font-mono)' }}>{w.totalRecalls} 次</span>
                    <ArrowRight size={12} className="text-[var(--color-muted)] opacity-0 transition-opacity group-hover:opacity-100" />
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        <div>
          <div className="mb-2 text-[12px] font-semibold text-[#f5f5f5]">
            域级召回趋势(近30天)
          </div>
          <Sparkline points={timelineQuery.data?.points ?? []} />
        </div>
      </div>
    </section>
  );
}

function KpiItem({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: string; color?: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <span style={{ color: 'var(--color-muted)' }}>{icon}</span>
      <span className="text-[var(--color-muted)]">{label}</span>
      <span className="font-semibold" style={{ color: color ?? '#f5f5f5', fontFamily: 'var(--font-mono)' }}>{value}</span>
    </div>
  );
}

function Sparkline({ points }: { points: Array<{ t: string; count: number }> }) {
  const totals = useMemo(() => {
    const map = new Map<string, number>();
    for (const p of points) {
      map.set(p.t, (map.get(p.t) ?? 0) + p.count);
    }
    const entries = [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
    const values = entries.map(([, v]) => v);
    const max = Math.max(...values, 1);
    return { values, max, total: values.reduce((s, v) => s + v, 0) };
  }, [points]);

  if (totals.values.length === 0) {
    return <div className="text-[11px] text-[var(--color-muted)]">暂无趋势数据</div>;
  }

  return (
    <div className="flex items-end gap-[2px]" style={{ height: 48 }}>
      {totals.values.map((v, i) => (
        <div
          key={i}
          className="flex-1 min-w-[3px] rounded-t-[2px]"
          style={{
            height: `${Math.max((v / totals.max) * 100, 6)}%`,
            background: v > 0 ? 'var(--color-primary)' : 'rgba(255,255,255,0.06)',
            opacity: v > 0 ? 0.8 : 0.3,
          }}
          title={`${v} 次`}
        />
      ))}
      <span className="ml-2 flex-none text-[11px] text-[var(--color-muted)]" style={{ fontFamily: 'var(--font-mono)' }}>
        {formatInteger(totals.total)}
      </span>
    </div>
  );
}
