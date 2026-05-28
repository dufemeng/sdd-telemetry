import { useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Clock3, Database, FileText, Globe2, Trophy } from 'lucide-react';
import type { WikiRecallRange } from '@sdd-telemetry/api';
import { DataTable, type DataTableRow } from '@/components/ui/DataTable';
import { Panel } from '@/components/ui/Panel';
import { formatInteger, formatRelativeTime, formatTime } from '@/lib/format';
import { useWikiRecallUserRanking } from '../useWikiRecalls';
import {
  QueryNotice,
  RangeControl,
  SegmentedControl,
  SoftBadge,
} from '../components/WikiRecallControls';

type UserRankingSortBy = 'total' | 'distinct_files' | 'recent';

const SORT_OPTIONS: Array<{ value: UserRankingSortBy; label: string }> = [
  { value: 'total', label: '召回次数' },
  { value: 'distinct_files', label: '文件数' },
  { value: 'recent', label: '最近活跃' },
];

export function UserRankingTab() {
  const [range, setRange] = useState<WikiRecallRange>('30d');
  const [sortBy, setSortBy] = useState<UserRankingSortBy>('total');
  const { data, isLoading, error } = useWikiRecallUserRanking(range, sortBy);

  const rows: DataTableRow[] =
    data?.items.map((row, index) => ({
      key: row.userId,
      ariaLabel: `查看用户 ${row.userName ?? row.userId} 的 wiki 召回`,
      cells: [
        <div className="flex min-w-[180px] items-center gap-2" key="user">
          <span
            className="grid h-6 w-6 flex-none place-items-center rounded-[4px] text-[11px] font-semibold"
            style={{
              background: index < 3 ? 'rgba(250,255,105,0.10)' : 'rgba(255,255,255,0.05)',
              color: index < 3 ? 'var(--color-primary)' : 'var(--color-muted)',
              border: '1px solid var(--color-border)',
            }}
          >
            {index + 1}
          </span>
          <div className="min-w-0">
            <Link
              to={`/sdd/users?userId=${encodeURIComponent(row.userId)}`}
              className="block truncate text-[13px] font-medium text-[#f5f5f5] hover:text-[var(--color-primary)]"
            >
              {row.userName ?? '未知用户'}
            </Link>
            <span className="block truncate text-[10px] text-[var(--color-muted)]">
              {row.userId}
            </span>
          </div>
        </div>,
        <MetricCell key="total" value={row.totalRecalls} icon={<Trophy size={13} />} />,
        <MetricCell key="files" value={row.distinctFiles} icon={<FileText size={13} />} />,
        <MetricCell key="domains" value={row.distinctDomains} icon={<Globe2 size={13} />} />,
        <MetricCell key="systems" value={row.distinctSystems} icon={<Database size={13} />} />,
        <div className="flex min-w-[116px] flex-col gap-[2px]" key="last">
          <span className="text-[12px] text-[var(--color-secondary)]">
            {formatRelativeTime(row.lastRecallAt)}
          </span>
          <span className="text-[11px] text-[var(--color-muted)]">
            {formatTime(row.lastRecallAt)}
          </span>
        </div>,
        row.hasWikiRootPath ? (
          <SoftBadge key="wiki-root" tone="good">已配置</SoftBadge>
        ) : (
          <SoftBadge key="wiki-root" tone="warn">未配置</SoftBadge>
        ),
      ],
    })) ?? [];

  return (
    <Panel
      title="用户使用排行"
      icon={<Trophy size={18} />}
      headerRight={
        <div className="flex flex-wrap items-center justify-end gap-2">
          <RangeControl value={range} onChange={setRange} />
          <SegmentedControl
            label="排序"
            value={sortBy}
            options={SORT_OPTIONS}
            onChange={setSortBy}
          />
        </div>
      }
    >
      <div className="grid gap-3">
        <QueryNotice loading={isLoading} error={error} loadingText="正在加载用户排行..." />
        <DataTable
          headers={['用户', '召回', '文件', 'domains', 'systems', '最近召回', 'wiki 配置']}
          rows={rows}
          emptyText="暂无 wiki 召回用户数据"
        />
        {data ? (
          <div className="flex items-center gap-2 text-[11px] text-[var(--color-muted)]">
            <Clock3 size={12} />
            <span>当前条件共 {formatInteger(data.total)} 位用户</span>
          </div>
        ) : null}
      </div>
    </Panel>
  );
}

function MetricCell({ value, icon }: { value: number; icon: ReactNode }) {
  return (
    <div className="flex min-w-[72px] items-center justify-end gap-1 text-[13px] text-[#f5f5f5]">
      <span className="text-[var(--color-muted)]">{icon}</span>
      <span>{formatInteger(value)}</span>
    </div>
  );
}
