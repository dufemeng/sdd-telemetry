import { useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import type { WikiCoverageDomain, WikiCoverageRepo } from '@sdd-telemetry/api';
import { CARD_STYLE, REPO_LABEL, repoTagStyle, coverFillColor } from '../styles';
import { formatInteger } from '@/lib/format';

const ALL = '__all__';

export function AssetTable({
  domains,
  repos,
  degraded,
  recallFactsMode = false,
  onSelectDomain,
}: {
  domains: WikiCoverageDomain[];
  repos: WikiCoverageRepo[];
  degraded: boolean;
  recallFactsMode?: boolean;
  onSelectDomain: (repo: string, domain: string) => void;
}) {
  const [repoFilter, setRepoFilter] = useState<string>(ALL);
  const [search, setSearch] = useState('');
  const [onlyDead, setOnlyDead] = useState(false);

  const chips = useMemo(
    () => [{ value: ALL, label: '全部' }, ...repos.map((r) => ({ value: r.repo, label: r.label }))],
    [repos],
  );

  // 按当前业务线范围（用于计数与「有沉睡文档」过滤的分母）
  const scoped = useMemo(
    () => (repoFilter === ALL ? domains : domains.filter((d) => d.repo === repoFilter)),
    [domains, repoFilter],
  );
  const deadCount = useMemo(() => scoped.filter((d) => d.deadDocs > 0).length, [scoped]);

  const rows = useMemo(() => {
    let list = scoped;
    if (onlyDead && !recallFactsMode) list = list.filter((d) => d.deadDocs > 0);
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(
        (d) => d.domain.toLowerCase().includes(q) || (REPO_LABEL[d.repo] ?? d.repo).includes(q),
      );
    }
    return list;
  }, [scoped, onlyDead, recallFactsMode, search]);

  return (
    <section className="rounded-[6px]" style={CARD_STYLE}>
      <div className="flex items-center gap-3 px-[14px] py-3" style={{ borderBottom: '1px solid var(--color-border)' }}>
        <span className="text-[14px] font-semibold text-[#f5f5f5]">知识资产一览</span>
        <div className="flex gap-[6px]">
          {chips.map((c) => {
            const on = repoFilter === c.value;
            return (
              <button
                key={c.value}
                onClick={() => setRepoFilter(c.value)}
                className="h-[26px] rounded-[4px] px-3 text-[12px] font-medium"
                style={on
                  ? { background: 'rgba(250,255,105,0.08)', border: '1px solid rgba(250,255,105,0.22)', color: 'var(--color-primary)' }
                  : { background: 'transparent', border: '1px solid var(--color-border)', color: 'var(--color-muted)' }}
              >
                {c.label}
              </button>
            );
          })}
        </div>
        <div className="ml-auto flex h-[28px] w-[220px] items-center gap-2 rounded-[4px] px-[10px]" style={{ border: '1px solid rgba(255,255,255,0.10)', background: 'var(--color-base)' }}>
          <Search size={13} className="shrink-0 text-[var(--color-muted)]" />
          <input
            className="w-full bg-transparent text-[12px] text-[var(--color-text)] outline-none placeholder:text-[var(--color-muted)]"
            placeholder="搜索业务域"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>
      <div className="flex gap-[6px] px-[14px] py-[9px]" style={{ borderBottom: '1px solid var(--color-border)' }}>
        <FilterBtn on={!onlyDead} onClick={() => setOnlyDead(false)} label="全部" count={scoped.length} />
        {recallFactsMode ? null : (
          <FilterBtn on={onlyDead} onClick={() => setOnlyDead(true)} label="有沉睡文档" count={deadCount} />
        )}
      </div>
      <table className="w-full" style={{ borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            {['业务域', degraded ? '召回文档' : '覆盖（已读/库内）', '召回', '文档', '参与人', '沉睡文档', '最近召回'].map((h, i) => (
              <th
                key={h}
                className={`px-[12px] py-[8px] text-[10px] font-bold uppercase whitespace-nowrap text-[var(--color-muted)] ${i === 0 ? 'text-left' : 'text-right'}`}
                style={{ background: '#141414', borderBottom: '1px solid var(--color-border)' }}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr><td colSpan={7} className="py-10 text-center text-[12px] text-[var(--color-muted)]">暂无数据</td></tr>
          ) : rows.map((d) => {
            const rate = d.totalDocs > 0 ? d.recalledDocs / d.totalDocs : 0;
            return (
              <tr
                key={`${d.repo}-${d.domain}`}
                className={`group ${degraded ? '' : 'cursor-pointer'}`}
                style={{ borderBottom: '1px solid var(--color-border)' }}
                onClick={degraded ? undefined : () => onSelectDomain(d.repo, d.domain)}
              >
                <td className="group-hover:bg-[#171717] px-[12px] py-[10px]">
                  <div className="flex items-center gap-[9px]">
                    {d.repo ? (
                      <span className="rounded-[3px] px-[7px] py-[2px] text-[10px]" style={repoTagStyle(d.repo)}>{REPO_LABEL[d.repo] ?? d.repo}</span>
                    ) : null}
                    <span className="text-[13px] font-medium text-[#f5f5f5]">{d.domain}</span>
                  </div>
                </td>
                <td className="group-hover:bg-[#171717] px-[12px] py-[10px] text-right">
                  {degraded ? (
                    <span className="text-[12px] text-[var(--color-secondary)]" style={{ fontFamily: 'var(--font-mono)' }}>{formatInteger(d.recalledDocs)}</span>
                  ) : (
                    <div className="flex items-center justify-end gap-2">
                      <span className="h-[5px] w-[54px] overflow-hidden rounded-full" style={{ background: '#202016' }}>
                        <span className="block h-full rounded-full" style={{ width: `${rate * 100}%`, background: coverFillColor(rate) }} />
                      </span>
                      <span className="text-[12px] text-[var(--color-secondary)]" style={{ fontFamily: 'var(--font-mono)' }}>{d.recalledDocs}/{d.totalDocs}</span>
                    </div>
                  )}
                </td>
                <td className="group-hover:bg-[#171717] px-[12px] py-[10px] text-right text-[13px] text-[#f5f5f5]" style={{ fontFamily: 'var(--font-mono)' }}>{formatInteger(d.recalls)}</td>
                <td className="group-hover:bg-[#171717] px-[12px] py-[10px] text-right text-[13px] text-[var(--color-secondary)]" style={{ fontFamily: 'var(--font-mono)' }}>{degraded ? '—' : d.totalDocs}</td>
                <td className="group-hover:bg-[#171717] px-[12px] py-[10px] text-right text-[13px] text-[var(--color-secondary)]" style={{ fontFamily: 'var(--font-mono)' }}>{d.distinctUsers}</td>
                <td className="group-hover:bg-[#171717] px-[12px] py-[10px] text-right text-[13px]" style={{ fontFamily: 'var(--font-mono)', color: d.deadDocs > 0 ? 'var(--color-bad-text)' : 'var(--color-muted)' }}>{d.deadDocs}</td>
                <td className="group-hover:bg-[#171717] px-[12px] py-[10px] text-[12px] text-[var(--color-secondary)]">{d.lastRecallAt ? new Date(d.lastRecallAt).toLocaleString() : '—'}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div className="flex items-center justify-between px-[14px] py-[10px] text-[11px] text-[var(--color-muted)]" style={{ borderTop: '1px solid var(--color-border)' }}>
        <span>共 {rows.length} 个业务域{repoFilter === ALL ? ` · 跨 ${repos.length} 个知识库` : ''}</span>
        <span>{recallFactsMode ? '累计口径 · 召回事实' : degraded ? '累计口径 · 未配置知识库扫描' : '累计口径 · 分母取快照'}</span>
      </div>
    </section>
  );
}

function FilterBtn({ on, onClick, label, count }: { on: boolean; onClick: () => void; label: string; count: number }) {
  return (
    <button
      onClick={onClick}
      className="h-[26px] rounded-[4px] px-3 text-[12px] font-medium"
      style={on
        ? { background: 'rgba(250,255,105,0.08)', border: '1px solid rgba(250,255,105,0.22)', color: 'var(--color-primary)' }
        : { background: 'transparent', border: '1px solid var(--color-border)', color: 'var(--color-muted)' }}
    >
      {label}<span className="ml-1.5 text-[10px]" style={{ opacity: 0.65 }}>{count}</span>
    </button>
  );
}
