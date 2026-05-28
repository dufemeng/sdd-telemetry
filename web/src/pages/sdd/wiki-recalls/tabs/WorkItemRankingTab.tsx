import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { FileStack, GitBranch, Search, UsersRound } from 'lucide-react';
import type { WikiRecallRange } from '@sdd-telemetry/api';
import { DataTable, type DataTableRow } from '@/components/ui/DataTable';
import { Panel } from '@/components/ui/Panel';
import { formatInteger } from '@/lib/format';
import { useDebouncedValue } from '@/lib/useDebouncedValue';
import { useWikiRecallWorkItemRanking } from '../useWikiRecalls';
import { QueryNotice, RangeControl, SoftBadge } from '../components/WikiRecallControls';

export function WorkItemRankingTab() {
  const [range, setRange] = useState<WikiRecallRange>('30d');
  const [businessDomain, setBusinessDomain] = useState('');
  const debouncedDomain = useDebouncedValue(businessDomain.trim(), 300);
  const filters = useMemo(
    () => (debouncedDomain ? { businessDomain: debouncedDomain } : {}),
    [debouncedDomain],
  );
  const { data, isLoading, error } = useWikiRecallWorkItemRanking(range, filters);

  const rows: DataTableRow[] =
    data?.items.map((row) => ({
      key: row.workItemId,
      ariaLabel: `查看需求 ${row.workItemSlug} 的 wiki 召回`,
      cells: [
        <div className="min-w-[220px]" key="item">
          <Link
            to={`/sdd/work-items?workItemId=${encodeURIComponent(row.workItemId)}`}
            className="block truncate text-[13px] font-medium text-[#f5f5f5] hover:text-[var(--color-primary)]"
          >
            {row.workItemSlug}
          </Link>
          <span className="block truncate text-[10px] text-[var(--color-muted)]">
            {row.workItemId}
          </span>
        </div>,
        row.businessDomain ? (
          <SoftBadge key="domain">{row.businessDomain}</SoftBadge>
        ) : (
          <span key="domain" className="text-[var(--color-muted)]">—</span>
        ),
        <NumberCell key="total" value={row.totalRecalls} />,
        <NumberCell key="domains" value={row.distinctDomains} />,
        <NumberCell key="systems" value={row.distinctSystems} />,
        <div className="flex min-w-[70px] items-center justify-end gap-1" key="users">
          <UsersRound size={13} className="text-[var(--color-muted)]" />
          <span className="text-[13px] text-[#f5f5f5]">{formatInteger(row.userCount)}</span>
        </div>,
      ],
    })) ?? [];

  return (
    <Panel
      title="需求 × wiki 下钻"
      icon={<FileStack size={18} />}
      headerRight={<RangeControl value={range} onChange={setRange} />}
    >
      <div className="grid gap-3">
        <div
          className="flex h-[30px] w-full max-w-[260px] items-center gap-2 rounded-[4px] px-[10px]"
          style={{ border: '1px solid rgba(255,255,255,0.10)', background: 'var(--color-base)' }}
        >
          <Search size={13} className="shrink-0 text-[var(--color-muted)]" />
          <input
            value={businessDomain}
            onChange={(event) => setBusinessDomain(event.target.value)}
            placeholder="筛选业务域，如 cashier"
            className="w-full bg-transparent text-[12px] text-[var(--color-text)] outline-none placeholder:text-[var(--color-muted)]"
          />
        </div>

        <QueryNotice loading={isLoading} error={error} loadingText="正在加载需求排行..." />
        <DataTable
          headers={['需求 slug', '业务域', '召回', 'domains', 'systems', '参与人']}
          rows={rows}
          emptyText="暂无需求 wiki 召回数据"
        />
        {data ? (
          <div className="flex items-center gap-2 text-[11px] text-[var(--color-muted)]">
            <GitBranch size={12} />
            <span>当前条件共 {formatInteger(data.total)} 个需求</span>
          </div>
        ) : null}
      </div>
    </Panel>
  );
}

function NumberCell({ value }: { value: number }) {
  return (
    <div className="min-w-[72px] text-right text-[13px] text-[#f5f5f5]">
      {formatInteger(value)}
    </div>
  );
}
