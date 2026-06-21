import { useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import type {
  ProfileKnowledgePathDimensionSummary,
  ProfileKnowledgeSourceSummary,
} from '@sdd-telemetry/api';
import { CARD_STYLE, REPO_LABEL, repoTagStyle } from '../styles';
import { formatInteger } from '@/lib/format';

const ALL = '__all__';

export function AssetTable({
  pathDimensions,
  sources,
  onSelectPathDimension,
}: {
  pathDimensions: ProfileKnowledgePathDimensionSummary[];
  sources: ProfileKnowledgeSourceSummary[];
  onSelectPathDimension: (sourceNamespace: string, pathSegment: string) => void;
}) {
  const [repoFilter, setRepoFilter] = useState<string>(ALL);
  const [search, setSearch] = useState('');

  const chips = useMemo(
    () => [
      { value: ALL, label: '全部' },
      ...sources.map((r) => ({ value: r.sourceNamespace, label: r.label })),
    ],
    [sources],
  );

  const scoped = useMemo(
    () =>
      repoFilter === ALL
        ? pathDimensions
        : pathDimensions.filter((d) => d.sourceNamespace === repoFilter),
    [pathDimensions, repoFilter],
  );

  const rows = useMemo(() => {
    let list = scoped;
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(
        (d) =>
          d.pathSegment.toLowerCase().includes(q) ||
          (REPO_LABEL[d.sourceNamespace] ?? d.sourceNamespace).toLowerCase().includes(q),
      );
    }
    return list;
  }, [scoped, search]);

  return (
    <section className="rounded-[6px]" style={CARD_STYLE}>
      <div
        className="flex flex-wrap items-center gap-3 px-[14px] py-3"
        style={{ borderBottom: '1px solid var(--color-border)' }}
      >
        <span className="text-[14px] font-semibold text-[#f5f5f5]">知识资产一览</span>
        <div className="flex gap-[6px]">
          {chips.map((c) => {
            const on = repoFilter === c.value;
            return (
              <button
                key={c.value}
                onClick={() => setRepoFilter(c.value)}
                className="h-[26px] rounded-[4px] px-3 text-[12px] font-medium"
                style={
                  on
                    ? {
                        background: 'rgba(250,255,105,0.08)',
                        border: '1px solid rgba(250,255,105,0.22)',
                        color: 'var(--color-primary)',
                      }
                    : {
                        background: 'transparent',
                        border: '1px solid var(--color-border)',
                        color: 'var(--color-muted)',
                      }
                }
              >
                {c.label}
              </button>
            );
          })}
        </div>
        <div
          className="flex h-[28px] w-full items-center gap-2 rounded-[4px] px-[10px] sm:ml-auto sm:w-[220px]"
          style={{
            border: '1px solid rgba(255,255,255,0.10)',
            background: 'var(--color-base)',
          }}
        >
          <Search size={13} className="shrink-0 text-[var(--color-muted)]" />
          <input
            className="w-full bg-transparent text-[12px] text-[var(--color-text)] outline-none placeholder:text-[var(--color-muted)]"
            placeholder="搜索路径维度"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px]" style={{ borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              {['路径维度', '访问文档', '访问', '参与人', '最近访问'].map((h, i) => (
                <th
                  key={h}
                  className={`px-[12px] py-[8px] text-[10px] font-bold uppercase whitespace-nowrap text-[var(--color-muted)] ${i === 0 ? 'text-left' : 'text-right'}`}
                  style={{
                    background: '#141414',
                    borderBottom: '1px solid var(--color-border)',
                  }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={5} className="py-10 text-center text-[12px] text-[var(--color-muted)]">
                  暂无数据
                </td>
              </tr>
            ) : (
              rows.map((d) => {
                return (
                  <tr
                    key={`${d.sourceNamespace}-${d.pathSegment}`}
                    className="group cursor-pointer"
                    style={{ borderBottom: '1px solid var(--color-border)' }}
                    onClick={() => onSelectPathDimension(d.sourceNamespace, d.pathSegment)}
                  >
                    <td className="group-hover:bg-[#171717] px-[12px] py-[10px]">
                      <div className="flex items-center gap-[9px]">
                        {d.sourceNamespace ? (
                          <span
                            className="rounded-[3px] px-[7px] py-[2px] text-[10px]"
                            style={repoTagStyle(d.sourceNamespace)}
                          >
                            {REPO_LABEL[d.sourceNamespace] ?? d.sourceNamespace}
                          </span>
                        ) : null}
                        <span className="text-[13px] font-medium text-[#f5f5f5]">
                          {d.pathSegment}
                        </span>
                      </div>
                    </td>
                    <td className="group-hover:bg-[#171717] px-[12px] py-[10px] text-right">
                      <span
                        className="text-[12px] text-[var(--color-secondary)]"
                        style={{ fontFamily: 'var(--font-mono)' }}
                      >
                        {formatInteger(d.accessedDocs)}
                      </span>
                    </td>
                    <td
                      className="group-hover:bg-[#171717] px-[12px] py-[10px] text-right text-[13px] text-[#f5f5f5]"
                      style={{ fontFamily: 'var(--font-mono)' }}
                    >
                      {formatInteger(d.accessCount)}
                    </td>
                    <td
                      className="group-hover:bg-[#171717] px-[12px] py-[10px] text-right text-[13px] text-[var(--color-secondary)]"
                      style={{ fontFamily: 'var(--font-mono)' }}
                    >
                      {d.distinctUsers}
                    </td>
                    <td className="group-hover:bg-[#171717] px-[12px] py-[10px] text-[12px] text-[var(--color-secondary)]">
                      {d.lastAccessAt ? new Date(d.lastAccessAt).toLocaleString() : '—'}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
      <div
        className="flex items-center justify-between px-[14px] py-[10px] text-[11px] text-[var(--color-muted)]"
        style={{ borderTop: '1px solid var(--color-border)' }}
      >
        <span>
          共 {rows.length} 个路径维度
          {repoFilter === ALL ? ` · 跨 ${sources.length} 个知识库` : ''}
        </span>
        <span>累计口径 · 知识访问事实</span>
      </div>
    </section>
  );
}
