import { useEffect, useMemo, useState } from 'react';
import { Layers3, Workflow } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import type { SddUsageItem, SddUsageSummaryItem } from '@sdd-telemetry/api';
import type { TimeRange } from '@/components/layout/TopBar';
import { DataTable, type DataTableRow } from '@/components/ui/DataTable';
import { EmptyState } from '@/components/ui/EmptyState';
import { Pagination } from '@/components/ui/Pagination';
import { Panel } from '@/components/ui/Panel';
import {
  RowInspectorDrawer,
  type RowInspectorField,
} from '@/components/ui/RowInspectorDrawer';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { formatDateTime, formatInteger, formatTime } from '@/lib/format';
import { DetailTableToolbar } from './components/DetailTableToolbar';
import { VersionMiniBar } from './components/VersionMiniBar';
import {
  useSddUsageSummary,
  type UsageMatchFilter,
} from './hooks/useSddUsageSummary';
import { useSkillUsages } from './hooks/useSkillUsages';

const PAGE_SIZE = 20;

interface DetailTableSectionProps {
  timeRange: TimeRange;
}

export function DetailTableSection({ timeRange }: DetailTableSectionProps) {
  const navigate = useNavigate();
  const [keyword, setKeyword] = useState('');
  const debouncedKeyword = useDebouncedValue(keyword, 300);
  const [matched, setMatched] = useState<UsageMatchFilter>('all');
  const [page, setPage] = useState(1);
  const [selectedRawSkillName, setSelectedRawSkillName] = useState<string | null>(null);
  const summaryQuery = useSddUsageSummary({
    timeRange,
    matched,
    keyword: debouncedKeyword,
    page,
    pageSize: PAGE_SIZE,
  });
  const usageQuery = useSkillUsages({ timeRange, rawSkillName: selectedRawSkillName });
  const items = summaryQuery.data?.items ?? [];
  const total = summaryQuery.data?.total ?? 0;
  const hasPrev = page > 1;
  const hasNext = page * PAGE_SIZE < total;
  const selectedItem = useMemo(
    () => items.find((item) => item.rawSkillName === selectedRawSkillName) ?? null,
    [items, selectedRawSkillName],
  );

  useEffect(() => {
    setPage(1);
  }, [debouncedKeyword, matched, timeRange]);

  return (
    <>
      <Panel title="技能 × 语义明细" icon={<Layers3 size={18} />}>
        <div className="grid gap-3">
          <DetailTableToolbar
            keyword={keyword}
            matched={matched}
            onKeywordChange={setKeyword}
            onMatchedChange={setMatched}
          />
          {summaryQuery.error ? (
            <SectionError error={summaryQuery.error} onRetry={() => void summaryQuery.refetch()} />
          ) : summaryQuery.data ? (
            <>
              <DataTable
                headers={['技能 / 语义', '调用', '用户', '会话', '工作项', '版本分布', '首次出现', '最近调用']}
                rows={items.map(toTableRow)}
                selectedRowKey={selectedRawSkillName}
                onRowSelect={(rowKey) => setSelectedRawSkillName(String(rowKey))}
              />
              <Pagination
                pageNumber={page}
                pageSize={PAGE_SIZE}
                hasNext={hasNext}
                hasPrev={hasPrev}
                onNext={() => setPage((current) => current + 1)}
                onPrev={() => setPage((current) => Math.max(current - 1, 1))}
              />
            </>
          ) : (
            <EmptyState text="加载中..." />
          )}
        </div>
      </Panel>

      {selectedRawSkillName ? (
        <RowInspectorDrawer
          open={selectedRawSkillName !== null}
          onOpenChange={(open) => {
            if (!open) setSelectedRawSkillName(null);
          }}
          title={selectedItem?.rawSkillName ?? selectedRawSkillName}
          subtitle={selectedItem ? selectedItem.semanticDisplayName ?? selectedItem.semanticCode ?? '未匹配' : null}
          icon={<Layers3 size={18} />}
          badge={selectedItem ? <StatusBadge status={selectedItem.semanticCode ? 'matched' : 'unmatched'} variant={selectedItem.semanticCode ? 'good' : 'bad'} /> : null}
          row={selectedItem ?? { rawSkillName: selectedRawSkillName }}
          overview={selectedItem ? toOverviewFields(selectedItem) : []}
          fields={selectedItem ? toDetailFields(selectedItem) : []}
          rawData={{ summary: selectedItem, usages: usageQuery.data ?? [] }}
          loading={usageQuery.isLoading}
          error={usageQuery.error instanceof Error ? usageQuery.error.message : null}
          actions={[
            {
              label: '交互明细',
              icon: <Workflow size={14} />,
              onClick: () => navigate('/sdd/interactions'),
              variant: 'secondary',
            },
          ]}
          size="xl"
        >
          <div className="grid gap-2">
            <h4 className="text-[12px] font-semibold text-[var(--color-secondary)]">最近调用</h4>
            <DataTable
              headers={['时间', '状态', '用户', 'sessionId', 'promptId', 'interactionId']}
              rows={(usageQuery.data ?? []).map(toUsageRow)}
              emptyText="暂无调用"
            />
          </div>
        </RowInspectorDrawer>
      ) : null}
    </>
  );
}

function toTableRow(item: SddUsageSummaryItem): DataTableRow {
  const isMatched = Boolean(item.semanticCode);
  return {
    key: item.rawSkillName,
    cells: [
      <div key="name" className="grid gap-1">
        <strong className={isMatched ? 'text-[#f5f5f5]' : 'text-[var(--color-bad-text)]'}>
          {item.semanticDisplayName ?? item.semanticCode ?? '未匹配'}
        </strong>
        <span className="text-[11px] text-[var(--color-muted)]">{item.rawSkillName}</span>
      </div>,
      formatInteger(item.usageCount),
      formatInteger(item.activeUserCount),
      formatInteger(item.sessionCount),
      formatInteger(item.workItemCount),
      <VersionMiniBar key="versions" versions={item.versions} tone={isMatched ? 'normal' : 'bad'} />,
      formatDateTime(item.firstSeenAt),
      formatTime(item.lastSeenAt),
    ],
  };
}

function toUsageRow(item: SddUsageItem): DataTableRow {
  return {
    key: item.id,
    cells: [
      formatDateTime(item.eventTime),
      <StatusBadge key="status" status={item.status} />,
      item.userId ?? '—',
      item.sessionId ?? '—',
      item.promptId ?? '—',
      item.interactionId ?? '—',
    ],
  };
}

function toOverviewFields(item: SddUsageSummaryItem): RowInspectorField[] {
  return [
    { label: '调用', value: formatInteger(item.usageCount), mono: true },
    { label: '用户', value: formatInteger(item.activeUserCount), mono: true },
    { label: '会话', value: formatInteger(item.sessionCount), mono: true },
    { label: '工作项', value: formatInteger(item.workItemCount), mono: true },
  ];
}

function toDetailFields(item: SddUsageSummaryItem): RowInspectorField[] {
  return [
    { label: 'rawSkillName', value: item.rawSkillName, copyValue: item.rawSkillName, mono: true },
    { label: 'semanticCode', value: item.semanticCode ?? '—', copyValue: item.semanticCode, mono: true },
    { label: 'semanticDisplayName', value: item.semanticDisplayName ?? '—' },
    { label: 'firstSeenAt', value: formatDateTime(item.firstSeenAt), mono: true },
    { label: 'lastSeenAt', value: formatDateTime(item.lastSeenAt), mono: true },
  ];
}

function SectionError({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  return (
    <div className="flex min-h-24 items-center justify-between gap-3 rounded-[4px] px-3 text-[12px] text-[var(--color-bad-text)]" style={{ background: 'var(--color-bad-bg)' }}>
      <span>{error instanceof Error ? error.message : '加载失败'}</span>
      <button type="button" onClick={onRetry} className="rounded-[4px] px-2 py-1 text-[var(--color-text)]" style={{ border: '1px solid var(--color-border)' }}>
        重试
      </button>
    </div>
  );
}

function useDebouncedValue(value: string, delayMs: number) {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delayMs);
    return () => window.clearTimeout(timer);
  }, [delayMs, value]);

  return debounced;
}
