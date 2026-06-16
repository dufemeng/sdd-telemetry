import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, Clock3, DatabaseZap, MessageSquareWarning, Search, TriangleAlert, UsersRound, Wrench } from 'lucide-react';
import type {
  ProfileErrorCategorySummary,
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
import { ERROR_CATEGORY_ICONS, buildErrorCategoryPath, buildErrorEventPath, buildErrorReasonPath } from './errorMeta';

const PAGE_SIZE = 24;

export default function ErrorsPage() {
  const navigate = useNavigate();
  const { profileId, timeRange } = useShellContext();
  const fromIso = useMemo(() => timeRangeToFromIso(timeRange), [timeRange]);
  const [severity, setSeverity] = useState<'error' | 'warning' | 'info' | null>(null);
  const [keyword, setKeyword] = useState('');
  const [page, setPage] = useState(1);

  useEffect(() => {
    setPage(1);
  }, [severity, keyword, profileId, timeRange]);

  const overview = useProfileErrorOverview(profileId, { fromIso });
  const errors = useProfileErrors(profileId, {
    fromIso,
    severity,
    keyword,
    page,
    pageSize: PAGE_SIZE,
  });
  const kpis = overview.data?.kpis;
  const categories = overview.data?.categories ?? [];
  const knowledgeDiagnostics = overview.data?.knowledgeDiagnostics ?? [];
  const events = errors.data?.items ?? [];
  const hasNext = (errors.data?.total ?? 0) > page * PAGE_SIZE;
  const topCategory = categories.find((item) => item.count > 0) ?? null;
  const topKnowledgeReason = knowledgeDiagnostics.find((item) => item.count > 0) ?? null;
  const latestEvent = events[0] ?? null;
  const categoryMax = Math.max(1, ...categories.map((item) => item.count));
  const knowledgeMax = Math.max(1, ...knowledgeDiagnostics.map((item) => item.count));

  return (
    <FeatureGate capability="errors" fallback={<UnsupportedErrors />}>
      <main className="min-w-0 space-y-4 p-4">
        <header className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-[20px] font-semibold leading-7 text-[#f5f5f5]">异常分析</h2>
            <p className="mt-1 text-[12px] text-[var(--color-muted)]">
              当前工作流 · {timeRange} · 聚焦失败环节、影响范围和可追溯证据
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <select
              className="h-8 rounded-[4px] border border-[var(--color-border)] bg-[#141414] px-2 text-[12px] text-[var(--color-secondary)] outline-none focus:text-[#f5f5f5]"
              value={severity ?? ''}
              onChange={(event) => setSeverity((event.target.value || null) as typeof severity)}
            >
              <option value="">全部级别</option>
              <option value="error">error</option>
              <option value="warning">warning</option>
              <option value="info">info</option>
            </select>
            <label className="relative block">
              <Search size={14} className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-[var(--color-muted)]" />
              <input
                className="h-8 w-[220px] rounded-[4px] border border-[var(--color-border)] bg-[#141414] pl-7 pr-2 text-[12px] text-[#f5f5f5] outline-none placeholder:text-[var(--color-muted)]"
                value={keyword}
                onChange={(event) => setKeyword(event.target.value)}
                placeholder="错误 / 工具 / 路径"
              />
            </label>
          </div>
        </header>

        <Panel title="决策摘要" icon={<TriangleAlert size={16} />}>
          <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_460px]">
            <div className="rounded-[5px] border border-[rgba(250,255,105,0.18)] bg-[#15150d] p-4">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div>
                  <span className="text-[11px] text-[var(--color-muted)]">当前最值得追的线索</span>
                  <h3 className="mt-1 text-[16px] font-semibold text-[#f5f5f5]">
                    {topCategory?.displayName ?? '暂无异常'}
                  </h3>
                </div>
                <button
                  type="button"
                  disabled={!topCategory}
                  onClick={topCategory ? () => navigate(buildErrorCategoryPath(topCategory.category)) : undefined}
                  className="inline-flex h-8 items-center gap-1 rounded-[4px] border border-[rgba(250,255,105,0.26)] bg-[#202016] px-2 text-[12px] text-[var(--color-primary)] disabled:cursor-default disabled:opacity-40"
                >
                  查看分类 <ArrowRight size={14} />
                </button>
              </div>
              <div className="grid gap-2 md:grid-cols-3">
                <FocusRow
                  label="影响范围"
                  value={topCategory ? `${formatInteger(topCategory.count)} 次异常` : '暂无异常'}
                  meta={topCategory ? `${formatInteger(topCategory.affectedUserCount)} 用户 · ${formatInteger(topCategory.affectedInteractionCount)} 交互` : '当前筛选范围正常'}
                  onClick={topCategory ? () => navigate(buildErrorCategoryPath(topCategory.category)) : undefined}
                />
                <FocusRow
                  label="知识库原因"
                  value={topKnowledgeReason?.displayName ?? '暂无知识库异常'}
                  meta={topKnowledgeReason ? `${formatInteger(topKnowledgeReason.count)} 次 · ${topKnowledgeReason.sampleLocator ? lastTwoPathSegments(topKnowledgeReason.sampleLocator) : '无示例路径'}` : '原因来自 profile 配置'}
                  onClick={topKnowledgeReason ? () => navigate(buildErrorReasonPath(topKnowledgeReason.reasonCode)) : undefined}
                />
                <FocusRow
                  label="最新证据"
                  value={latestEvent?.errorType ?? latestEvent?.displayName ?? '暂无事件'}
                  meta={latestEvent ? `${formatDateTime(latestEvent.eventTime)} · ${latestEvent.toolName ?? 'unknown tool'}` : '等待事件加载'}
                  onClick={latestEvent ? () => navigate(buildErrorEventPath(latestEvent.id)) : undefined}
                />
              </div>
            </div>
            <div className="grid gap-px overflow-hidden rounded-[5px] border border-[var(--color-border)] bg-[var(--color-border)] sm:grid-cols-2">
              <SummaryMetric icon={<TriangleAlert size={15} />} label="异常事件" value={overview.isLoading ? '—' : formatInteger(kpis?.totalCount)} />
              <SummaryMetric icon={<UsersRound size={15} />} label="影响用户" value={overview.isLoading ? '—' : formatInteger(kpis?.affectedUserCount)} />
              <SummaryMetric icon={<MessageSquareWarning size={15} />} label="影响交互" value={overview.isLoading ? '—' : formatInteger(kpis?.affectedInteractionCount)} />
              <SummaryMetric icon={<DatabaseZap size={15} />} label="知识库读取失败" value={overview.isLoading ? '—' : formatInteger(kpis?.knowledgeReadFailedCount)} />
              <SummaryMetric icon={<Wrench size={15} />} label="工具调用失败" value={overview.isLoading ? '—' : formatInteger(kpis?.toolExecutionFailedCount)} />
              <SummaryMetric icon={<Clock3 size={15} />} label="最新异常" value={overview.isLoading ? '—' : formatRelativeTime(kpis?.latestAt)} />
            </div>
          </div>
        </Panel>

        <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_520px]">
          <Panel title="异常分类总览" icon={<TriangleAlert size={16} />}>
            <DataTable
              headers={['分类', '异常数', '影响用户', '影响交互', '关联需求', '最新发生']}
              rows={categories.map((item) => categoryRow(item, categoryMax))}
              onRowSelect={(rowKey) => navigate(buildErrorCategoryPath(String(rowKey) as ProfileErrorCategorySummary['category']))}
              emptyText={overview.isLoading ? '加载中...' : '暂无异常分类'}
            />
          </Panel>

          <Panel title="知识库异常诊断" icon={<DatabaseZap size={16} />}>
            <DataTable
              headers={['原因', '次数', '用户', '需求', '示例']}
              rows={knowledgeDiagnostics.map((item) => knowledgeDiagnosticRow(item, knowledgeMax))}
              onRowSelect={(rowKey) => navigate(buildErrorReasonPath(String(rowKey)))}
              emptyText={overview.isLoading ? '加载中...' : '暂无知识库异常'}
            />
          </Panel>
        </section>

        <Panel title="最新异常事件" icon={<MessageSquareWarning size={16} />}>
          <div className="space-y-2">
            <DataTable
              headers={['时间', '分类', '级别', '原因 / 错误', '工具', '用户', '证据']}
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

function UnsupportedErrors() {
  return (
    <main className="p-4">
      <EmptyState text="当前工作流未启用异常分析" />
    </main>
  );
}

function SummaryMetric({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="flex min-h-[72px] items-center gap-3 bg-[var(--color-surface)] p-3">
      <div className="grid h-8 w-8 flex-none place-items-center rounded-[4px] bg-[#202016] text-[var(--color-primary)]">
        {icon}
      </div>
      <div className="min-w-0">
        <span className="text-[11px] text-[var(--color-muted)]">{label}</span>
        <strong className="mt-1 block truncate text-[20px] font-semibold leading-6 text-[#f5f5f5]" style={{ fontFamily: 'var(--font-mono)' }}>
          {value}
        </strong>
      </div>
    </div>
  );
}

function FocusRow({
  label,
  value,
  meta,
  onClick,
}: {
  label: string;
  value: string;
  meta: string;
  onClick?: () => void;
}) {
  const enabled = Boolean(onClick);
  return (
    <button
      type="button"
      disabled={!enabled}
      onClick={onClick}
      className={[
        'min-w-0 rounded-[4px] border border-[rgba(255,255,255,0.08)] bg-[#101010] p-3 text-left transition-colors',
        enabled ? 'hover:border-[rgba(250,255,105,0.30)] hover:bg-[#18180f]' : 'cursor-default opacity-80',
      ].join(' ')}
    >
      <span className="text-[11px] text-[var(--color-muted)]">{label}</span>
      <span className="mt-1 flex min-w-0 items-center justify-between gap-2">
        <strong className="truncate text-[13px] font-semibold text-[#f5f5f5]">{value}</strong>
        {enabled ? <ArrowRight size={13} className="flex-none text-[var(--color-primary)]" /> : null}
      </span>
      <span className="mt-1 block truncate text-[11px] text-[var(--color-secondary)]">{meta}</span>
    </button>
  );
}

function categoryRow(item: ProfileErrorCategorySummary, maxCount: number): DataTableRow {
  const Icon = ERROR_CATEGORY_ICONS[item.category];
  return {
    key: item.category,
    cells: [
      <span className="flex min-w-[180px] items-center gap-2">
        <span className="grid h-6 w-6 flex-none place-items-center rounded-[4px] bg-[#202016] text-[var(--color-primary)]">
          <Icon size={14} />
        </span>
        <span className="min-w-0">
          <strong className="block truncate text-[12px] font-semibold text-[#f5f5f5]">{item.displayName}</strong>
          <span className="text-[10px] text-[var(--color-muted)]">{item.severity}</span>
        </span>
      </span>,
      <CountMeter value={item.count} max={maxCount} />,
      formatInteger(item.affectedUserCount),
      formatInteger(item.affectedInteractionCount),
      formatInteger(item.affectedDeliveryUnitCount),
      formatRelativeTime(item.latestAt),
    ],
    ariaLabel: item.displayName,
  };
}

function knowledgeDiagnosticRow(item: ProfileErrorKnowledgeDiagnostic, maxCount: number): DataTableRow {
  return {
    key: item.reasonCode,
    cells: [
      <span title={item.description ?? item.displayName} className="block min-w-[160px]">
        <strong className="block truncate text-[12px] font-semibold text-[#f5f5f5]">{item.displayName}</strong>
        <span className="block truncate text-[10px] text-[var(--color-muted)]">{item.description ?? item.reasonCode}</span>
      </span>,
      <CountMeter value={item.count} max={maxCount} />,
      formatInteger(item.affectedUserCount),
      formatInteger(item.affectedDeliveryUnitCount),
      <span title={item.sampleLocator ?? ''}>{item.sampleLocator ? lastTwoPathSegments(item.sampleLocator) : '—'}</span>,
    ],
    ariaLabel: item.displayName,
  };
}

function eventRow(item: ProfileErrorItem): DataTableRow {
  return {
    key: item.id,
    cells: [
      formatDateTime(item.eventTime),
      item.displayName,
      <StatusBadge status={item.severity} variant={severityVariant(item.severity)} />,
      item.errorType ?? '—',
      item.toolName ?? '—',
      item.userName ?? item.userId ?? '—',
      <span title={item.messagePreview ?? item.locator ?? ''}>
        {truncate(item.messagePreview ?? item.locator ?? '—', 96)}
      </span>,
    ],
    ariaLabel: `${item.displayName} ${item.errorType ?? ''}`,
  };
}

function CountMeter({ value, max }: { value: number; max: number }) {
  const width = Math.max(4, Math.round((value / max) * 100));
  return (
    <span className="block min-w-[112px]">
      <span className="flex items-center justify-between gap-2">
        <strong className="text-[12px] font-semibold text-[#f5f5f5]" style={{ fontFamily: 'var(--font-mono)' }}>
          {formatInteger(value)}
        </strong>
      </span>
      <span className="mt-1 block h-1 overflow-hidden rounded-full bg-[rgba(255,255,255,0.08)]">
        <span className="block h-full rounded-full bg-[var(--color-primary)]" style={{ width: `${width}%` }} />
      </span>
    </span>
  );
}

function severityVariant(value: string | null | undefined): 'bad' | 'warn' | 'neutral' {
  if (value === 'error') return 'bad';
  if (value === 'warning') return 'warn';
  return 'neutral';
}
