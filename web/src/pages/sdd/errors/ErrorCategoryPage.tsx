import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Clock3, DatabaseZap, MessageSquareWarning, Search, TriangleAlert, UsersRound } from 'lucide-react';
import type {
  ProfileErrorCategoryContract,
  ProfileErrorItem,
  ProfileErrorKnowledgeDiagnostic,
} from '@sdd-telemetry/api';
import { FeatureGate } from '@/components/profiles/FeatureGate';
import { useShellContext } from '@/components/layout/useShellContext';
import { DataTable, type DataTableRow } from '@/components/ui/DataTable';
import { EmptyState } from '@/components/ui/EmptyState';
import { Pagination } from '@/components/ui/Pagination';
import { Panel } from '@/components/ui/Panel';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { useProfileErrorOverview, useProfileErrors } from '@/pages/profiles/useProfiles';
import { formatDateTime, formatInteger, formatRelativeTime, lastTwoPathSegments, truncate } from '@/lib/format';
import { timeRangeToFromIso } from '@/lib/timeRange';
import { useBackNavigate } from '@/lib/useBackNavigate';
import {
  ERROR_CATEGORY_DESCRIPTIONS,
  ERROR_CATEGORY_ICONS,
  buildErrorEventPath,
  errorCategoryLabel,
} from './errorMeta';

const PAGE_SIZE = 30;
const CATEGORIES = new Set<ProfileErrorCategoryContract>([
  'knowledge_read_failed',
  'process_doc_access_failed',
  'code_operation_failed',
  'tool_execution_failed',
  'model_or_api_failed',
]);

export default function ErrorCategoryPage() {
  const { category: rawCategory = '' } = useParams();
  const category = parseCategory(rawCategory);
  if (!category) {
    return <main className="p-4"><EmptyState text="未知异常分类" /></main>;
  }
  return <ErrorCategoryContent category={category} />;
}

function ErrorCategoryContent({ category }: { category: ProfileErrorCategoryContract }) {
  const navigate = useNavigate();
  const goBack = useBackNavigate('/sdd/errors');
  const [searchParams, setSearchParams] = useSearchParams();
  const { profileId, timeRange } = useShellContext();
  const fromIso = useMemo(() => timeRangeToFromIso(timeRange), [timeRange]);
  const reasonCode = category === 'knowledge_read_failed' ? searchParams.get('reasonCode') : null;
  const [severity, setSeverity] = useState<'error' | 'warning' | 'info' | null>(null);
  const [keyword, setKeyword] = useState('');
  const [page, setPage] = useState(1);

  useEffect(() => {
    setPage(1);
  }, [category, reasonCode, severity, keyword, profileId, timeRange]);

  const overview = useProfileErrorOverview(profileId, { fromIso, category, reasonCode });
  const categoryOverview = useProfileErrorOverview(profileId, { fromIso, category });
  const errors = useProfileErrors(profileId, {
    fromIso,
    category,
    reasonCode,
    severity,
    keyword,
    page,
    pageSize: PAGE_SIZE,
  });
  const kpis = overview.data?.kpis;
  const categorySummary = categoryOverview.data?.categories[0];
  const reasonGroups = categoryOverview.data?.knowledgeDiagnostics ?? [];
  const activeReason = reasonGroups.find((item) => item.reasonCode === reasonCode) ?? null;
  const events = errors.data?.items ?? [];
  const hasNext = (errors.data?.total ?? 0) > page * PAGE_SIZE;
  const Icon = ERROR_CATEGORY_ICONS[category];
  const title = categorySummary?.displayName ?? errorCategoryLabel(category);
  const reasonMax = Math.max(1, ...reasonGroups.map((item) => item.count));

  const setReasonCode = (nextReasonCode: string | null) => {
    const next = new URLSearchParams(searchParams);
    if (nextReasonCode) next.set('reasonCode', nextReasonCode);
    else next.delete('reasonCode');
    setSearchParams(next);
  };

  return (
    <FeatureGate capability="errors" fallback={<main className="p-4"><EmptyState text="当前工作流未启用异常分析" /></main>}>
      <main className="min-w-0 space-y-4 p-4">
        <header className="rounded-[6px] border border-[var(--color-border)] bg-[var(--color-surface)] p-[14px]">
          <div className="mb-3 flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={goBack}
              className="inline-flex items-center gap-1 text-[12px] text-[var(--color-muted)] hover:text-[var(--color-secondary)]"
            >
              <ArrowLeft size={14} /> 返回
            </button>
            <span className="text-[11px] text-[var(--color-muted)]">{timeRange}</span>
          </div>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex min-w-0 gap-3">
              <div className="grid h-11 w-11 flex-none place-items-center rounded-[5px] border border-[rgba(250,255,105,0.18)] bg-[#202016] text-[var(--color-primary)]">
                <Icon size={20} />
              </div>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-[18px] font-semibold leading-7 text-[#f5f5f5]">
                    {activeReason ? `${title} / ${activeReason.displayName}` : title}
                  </h2>
                  {activeReason ? (
                    <span
                      title={activeReason.reasonCode}
                      className="rounded-full bg-[#202016] px-2 py-[2px] text-[11px] text-[var(--color-primary)]"
                    >
                      已筛选原因
                    </span>
                  ) : null}
                </div>
                <p className="mt-1 max-w-[820px] text-[12px] leading-5 text-[var(--color-secondary)]">
                  {activeReason?.description ?? ERROR_CATEGORY_DESCRIPTIONS[category]}
                </p>
              </div>
            </div>
            {activeReason ? (
              <button
                type="button"
                onClick={() => setReasonCode(null)}
                className="rounded-[4px] border border-[rgba(250,255,105,0.28)] bg-[#202016] px-2 py-1 text-[11px] text-[var(--color-primary)] hover:bg-[#282817]"
              >
                清除原因筛选
              </button>
            ) : null}
          </div>
        </header>

        <section className="grid gap-px overflow-hidden rounded-[6px] border border-[var(--color-border)] bg-[var(--color-border)] md:grid-cols-2 xl:grid-cols-5">
          <CategoryMetric icon={<TriangleAlert size={15} />} label="异常事件" value={overview.isLoading ? '—' : formatInteger(kpis?.totalCount)} />
          <CategoryMetric icon={<UsersRound size={15} />} label="影响用户" value={overview.isLoading ? '—' : formatInteger(kpis?.affectedUserCount)} />
          <CategoryMetric icon={<MessageSquareWarning size={15} />} label="影响交互" value={overview.isLoading ? '—' : formatInteger(kpis?.affectedInteractionCount)} />
          <CategoryMetric icon={<Clock3 size={15} />} label="最新异常" value={overview.isLoading ? '—' : formatRelativeTime(kpis?.latestAt)} />
          <CategoryMetric icon={<DatabaseZap size={15} />} label="分类总量" value={categoryOverview.isLoading ? '—' : formatInteger(categoryOverview.data?.kpis.totalCount)} />
        </section>

        {category === 'knowledge_read_failed' ? (
          <Panel title="知识库异常原因" icon={<DatabaseZap size={16} />}>
            <DataTable
              headers={['原因', '次数', '用户', '交互', '需求', '示例']}
              rows={reasonGroups.map((item) => reasonRow(item, reasonCode, reasonMax))}
              selectedRowKey={reasonCode}
              onRowSelect={(rowKey) => setReasonCode(String(rowKey))}
              emptyText={categoryOverview.isLoading ? '加载中...' : '暂无知识库异常原因'}
            />
          </Panel>
        ) : null}

        <Panel
          title="异常事件"
          icon={<MessageSquareWarning size={16} />}
          headerRight={
            <div className="flex items-center gap-2">
              <select
                className="h-7 rounded-[4px] border border-[var(--color-border)] bg-[#141414] px-2 text-[11px] text-[var(--color-secondary)] outline-none"
                value={severity ?? ''}
                onChange={(event) => setSeverity((event.target.value || null) as typeof severity)}
              >
                <option value="">全部级别</option>
                <option value="error">error</option>
                <option value="warning">warning</option>
                <option value="info">info</option>
              </select>
              <label className="relative block">
                <Search size={13} className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-[var(--color-muted)]" />
                <input
                  className="h-7 w-[180px] rounded-[4px] border border-[var(--color-border)] bg-[#141414] pl-7 pr-2 text-[11px] text-[#f5f5f5] outline-none placeholder:text-[var(--color-muted)]"
                  value={keyword}
                  onChange={(event) => setKeyword(event.target.value)}
                  placeholder="搜索事件"
                />
              </label>
            </div>
          }
        >
          <div className="space-y-2">
            <DataTable
              headers={['时间', '级别', '错误', '工具', '用户', '需求', '证据']}
              rows={events.map(eventRow)}
              onRowSelect={(rowKey) => navigate(buildErrorEventPath(String(rowKey)))}
              emptyText={errors.isLoading ? '加载中...' : '暂无异常事件'}
            />
            <Pagination
              pageNumber={page}
              pageSize={PAGE_SIZE}
              hasPrev={page > 1}
              hasNext={hasNext}
              onPrev={() => setPage((value) => Math.max(value - 1, 1))}
              onNext={() => setPage((value) => value + 1)}
            />
          </div>
        </Panel>
      </main>
    </FeatureGate>
  );
}

function parseCategory(value: string): ProfileErrorCategoryContract | null {
  return CATEGORIES.has(value as ProfileErrorCategoryContract) ? value as ProfileErrorCategoryContract : null;
}

function CategoryMetric({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="flex min-h-[72px] items-center gap-3 bg-[var(--color-surface)] p-3">
      <div className="grid h-8 w-8 flex-none place-items-center rounded-[4px] bg-[#202016] text-[var(--color-primary)]">
        {icon}
      </div>
      <div className="min-w-0">
        <span className="text-[11px] text-[var(--color-muted)]">{label}</span>
        <strong className="mt-1 block truncate text-[19px] font-semibold leading-6 text-[#f5f5f5]" style={{ fontFamily: 'var(--font-mono)' }}>
          {value}
        </strong>
      </div>
    </div>
  );
}

function reasonRow(item: ProfileErrorKnowledgeDiagnostic, activeReasonCode: string | null, maxCount: number): DataTableRow {
  const active = activeReasonCode === item.reasonCode;
  return {
    key: item.reasonCode,
    cells: [
      <span className={active ? 'text-[var(--color-primary)]' : undefined} title={item.description ?? item.displayName}>
        <strong className="block truncate text-[12px] font-semibold text-[#f5f5f5]">{item.displayName}</strong>
        <span className="block max-w-[260px] truncate text-[10px] text-[var(--color-muted)]">{item.description ?? item.reasonCode}</span>
      </span>,
      <CountMeter value={item.count} max={maxCount} />,
      formatInteger(item.affectedUserCount),
      formatInteger(item.affectedInteractionCount),
      formatInteger(item.affectedDeliveryUnitCount),
      <span title={item.sampleLocator ?? ''}>{item.sampleLocator ? lastTwoPathSegments(item.sampleLocator) : '—'}</span>,
    ],
    ariaLabel: item.displayName,
  };
}

function CountMeter({ value, max }: { value: number; max: number }) {
  const width = Math.max(4, Math.round((value / max) * 100));
  return (
    <span className="block min-w-[112px]">
      <strong className="text-[12px] font-semibold text-[#f5f5f5]" style={{ fontFamily: 'var(--font-mono)' }}>
        {formatInteger(value)}
      </strong>
      <span className="mt-1 block h-1 overflow-hidden rounded-full bg-[rgba(255,255,255,0.08)]">
        <span className="block h-full rounded-full bg-[var(--color-primary)]" style={{ width: `${width}%` }} />
      </span>
    </span>
  );
}

function eventRow(item: ProfileErrorItem): DataTableRow {
  return {
    key: item.id,
    cells: [
      formatDateTime(item.eventTime),
      <StatusBadge status={item.severity} variant={severityVariant(item.severity)} />,
      item.errorType ?? '—',
      item.toolName ?? '—',
      item.userName ?? item.userId ?? '—',
      item.deliveryUnitTitle ?? item.deliveryUnitId ?? '—',
      <span title={item.messagePreview ?? item.locator ?? ''}>
        {truncate(item.messagePreview ?? item.locator ?? '—', 96)}
      </span>,
    ],
    ariaLabel: `${item.displayName} ${item.errorType ?? ''}`,
  };
}

function severityVariant(value: string | null | undefined): 'bad' | 'warn' | 'neutral' {
  if (value === 'error') return 'bad';
  if (value === 'warning') return 'warn';
  return 'neutral';
}
