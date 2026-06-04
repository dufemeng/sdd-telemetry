import { useEffect, useMemo, useState } from 'react';
import {
  GitBranch,
  Layers,
  Layers3,
  Search,
  TrendingUp,
  Trophy,
  UserRound,
  Zap,
  type LucideIcon,
} from 'lucide-react';
import type { ProfileCapabilityUsageItem, ProfileCapabilityUsageSummaryItem } from '@sdd-telemetry/api';
import { useShellContext } from '@/components/layout/useShellContext';
import { DataTable, type DataTableRow } from '@/components/ui/DataTable';
import { EmptyState } from '@/components/ui/EmptyState';
import { Pagination } from '@/components/ui/Pagination';
import { RowInspectorDrawer, type RowInspectorField } from '@/components/ui/RowInspectorDrawer';
import { StatusBadge } from '@/components/ui/StatusBadge';
import {
  formatDateTime,
  formatInteger,
  formatPercent,
  formatRelativeTime,
  formatTime,
} from '@/lib/format';
import { useDebouncedValue } from '@/lib/useDebouncedValue';
import { timeRangeToFromIso } from '@/lib/timeRange';
import { TrendChart } from './components/TrendChart';
import {
  useProfileCapabilityAnalytics,
  useProfileCapabilityTimeseries,
  useProfileCapabilityUsageSummary,
  useProfileCapabilityUsages,
} from '@/pages/profiles/useProfiles';

type UsageMatchFilter = 'all' | 'matched' | 'unmatched';

const PAGE_SIZE = 20;
const CARD_STYLE = {
  border: '1px solid var(--color-border)',
  background: 'var(--color-surface)',
};
const ICON_BOX_STYLE = {
  background: '#141409',
  color: 'var(--color-primary)',
};
const RANK_COLORS = ['var(--color-primary)', 'var(--color-secondary)', 'var(--color-muted)'];

type Metric = {
  current: number | null;
  previous: number | null;
};
type SkillFilter = Extract<UsageMatchFilter, 'all' | 'unmatched'>;

export default function SkillsPage() {
  const { timeRange, profileId } = useShellContext();
  const fromIso = timeRangeToFromIso(timeRange);
  const analyticsQuery = useProfileCapabilityAnalytics(profileId, fromIso);
  const timeseriesQuery = useProfileCapabilityTimeseries(profileId, fromIso);
  const [keyword, setKeyword] = useState('');
  const [matched, setMatched] = useState<SkillFilter>('all');
  const [page, setPage] = useState(1);
  const [selectedRawCapabilityName, setSelectedRawCapabilityName] = useState<string | null>(null);
  const debouncedKeyword = useDebouncedValue(keyword, 300);
  const summaryQuery = useProfileCapabilityUsageSummary(profileId, {
    fromIso,
    matched,
    keyword: debouncedKeyword,
    page,
    pageSize: PAGE_SIZE,
  });
  const usageQuery = useProfileCapabilityUsages(profileId, {
    fromIso,
    rawCapabilityName: selectedRawCapabilityName,
  });

  useEffect(() => {
    setPage(1);
  }, [debouncedKeyword, matched, fromIso]);

  const analytics = analyticsQuery.data;
  const callQuality = analytics?.callQuality;
  const pairingRate = callQuality?.pairingSuccessRate ?? null;
  const topCapabilities = analytics?.topCapabilities.slice(0, 3) ?? [];
  const items = summaryQuery.data?.items ?? [];
  const total = summaryQuery.data?.total ?? 0;
  const selectedItem = useMemo(
    () => items.find((item) => item.rawCapabilityName === selectedRawCapabilityName) ?? null,
    [items, selectedRawCapabilityName],
  );
  const hasPrev = page > 1;
  const hasNext = page * PAGE_SIZE < total;

  return (
    <div className="grid gap-3">
      <div className="flex items-end justify-between gap-3 pb-2" style={{ borderBottom: '1px solid var(--color-border)' }}>
        <div>
          <h2 className="text-[28px] font-semibold leading-9 text-[#f5f5f5]">技能分析</h2>
          <p className="mt-1 text-[13px] text-[var(--color-secondary)]">
            近 {timeRange} · 关键技能、调用规模与有效配对链路
          </p>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-3">
        <KpiCard
          icon={Layers3}
          label="技能调用量"
          value={analytics?.kpis.capabilityUsageCount.current}
          hint={deltaHint(analytics?.kpis.capabilityUsageCount)}
          loading={analyticsQuery.isLoading}
          progress={pairingRate}
          progressLabel={`有效配对 ${formatRate(pairingRate)}`}
        />
        <KpiCard
          icon={UserRound}
          label="活跃用户"
          value={analytics?.kpis.activeUserCount.current}
          hint={deltaHint(analytics?.kpis.activeUserCount)}
          loading={analyticsQuery.isLoading}
        />
        <KpiCard
          icon={GitBranch}
          label="覆盖需求"
          value={analytics?.kpis.coveredDeliveryUnitCount.current}
          hint={deltaHint(analytics?.kpis.coveredDeliveryUnitCount)}
          loading={analyticsQuery.isLoading}
        />
        <KpiCard
          icon={Layers}
          label="全链路需求"
          value={analytics?.kpis.multiStageDeliveryUnitCount.current}
          hint="覆盖 >=2 个阶段"
          loading={analyticsQuery.isLoading}
        />
      </div>

      <div className="grid grid-cols-12 gap-3">
        <section className="col-span-8 p-[14px] rounded-[6px]" style={CARD_STYLE}>
          <div className="flex items-center gap-2 mb-4" style={{ color: 'var(--color-primary)' }}>
            <TrendingUp size={18} />
            <h3 className="text-[14px] font-semibold text-[#f5f5f5]">调用量趋势</h3>
          </div>
          {timeseriesQuery.error ? (
            <SectionError error={timeseriesQuery.error} onRetry={() => void timeseriesQuery.refetch()} />
          ) : timeseriesQuery.data ? (
            <TrendChart points={timeseriesQuery.data.points} />
          ) : (
            <EmptyState text="加载中..." />
          )}
        </section>

        <section className="col-span-4 p-[14px] rounded-[6px]" style={CARD_STYLE}>
          <div className="flex items-center gap-2 mb-4" style={{ color: 'var(--color-primary)' }}>
            <Zap size={18} />
            <h3 className="text-[14px] font-semibold text-[#f5f5f5]">调用质量</h3>
          </div>
          {analyticsQuery.error ? (
            <SectionError error={analyticsQuery.error} onRetry={() => void analyticsQuery.refetch()} />
          ) : (
            <div className="grid gap-4">
              <div>
                <div
                  className="text-[34px] font-semibold leading-none text-[var(--color-primary)]"
                  style={{ fontFamily: 'var(--font-mono)' }}
                >
                  {analyticsQuery.isLoading ? '—' : formatRate(pairingRate)}
                </div>
                <div className="mt-2 text-[12px] text-[var(--color-secondary)]">有效配对率</div>
              </div>
              <div className="h-[6px] overflow-hidden rounded-full" style={{ background: 'rgba(255,255,255,0.08)' }}>
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{ width: percentWidth(pairingRate), background: 'var(--color-good-text)' }}
                />
              </div>
              <div className="grid gap-2 text-[12px] text-[var(--color-secondary)]">
                <QualityCount label="已配对" value={callQuality?.pairedCount} loading={analyticsQuery.isLoading} />
                <QualityCount label="总触发" value={callQuality?.triggeredCount} loading={analyticsQuery.isLoading} />
              </div>
            </div>
          )}
        </section>
      </div>

      {!analyticsQuery.isLoading && topCapabilities.length > 0 ? (
        <section className="p-[14px] rounded-[6px]" style={CARD_STYLE}>
          <div className="flex items-center gap-2 mb-3">
            <Trophy size={18} style={{ color: 'var(--color-primary)' }} />
            <h3 className="text-[14px] font-semibold text-[#f5f5f5]">标杆技能</h3>
            <span
              className="text-[10px] px-[6px] py-[2px] rounded-full font-medium"
              style={{
                color: 'var(--color-primary)',
                border: '1px solid rgba(250,255,105,0.22)',
                background: 'rgba(250,255,105,0.06)',
              }}
            >
              TOP {topCapabilities.length}
            </span>
          </div>
          <div className="grid grid-cols-3 gap-3">
            {topCapabilities.map((item, index) => (
              <div
                key={item.capabilityCode}
                className="flex flex-col gap-3 p-3 rounded-[6px] relative overflow-hidden"
                style={{ background: 'var(--color-hover)', border: '1px solid var(--color-border)' }}
              >
                <div
                  className="absolute left-0 top-0 bottom-0 w-[3px]"
                  style={{ background: RANK_COLORS[index] }}
                />
                <div
                  className="absolute top-0 right-0 text-[10px] font-bold px-2 py-[3px]"
                  style={{
                    color: index === 0 ? '#0a0a0a' : 'var(--color-surface)',
                    background: RANK_COLORS[index],
                    borderRadius: '0 6px 0 6px',
                  }}
                >
                  # {index + 1}
                </div>
                <div className="pl-[10px] pr-7 min-w-0">
                  <div className="text-[13px] font-medium text-[#f5f5f5] truncate" title={item.displayName}>
                    {item.displayName}
                  </div>
                  <div
                    className="mt-1 text-[11px] text-[var(--color-muted)] truncate"
                    style={{ fontFamily: 'var(--font-mono)' }}
                    title={item.capabilityCode}
                  >
                    {item.capabilityCode}
                  </div>
                </div>
                <div className="pl-[10px]">
                  <StatusBadge status="已匹配" variant="good" />
                </div>
                <div className="flex flex-wrap gap-[6px] pl-[10px]">
                  <SkillChip icon={Zap} value={`${formatInteger(item.usageCount)} 次`} />
                  <SkillChip icon={UserRound} value={`${formatInteger(item.userCount)} 人`} />
                  <SkillChip icon={GitBranch} value={`${formatInteger(item.deliveryUnitCount)} 需求`} />
                </div>
                {item.conversionRate !== null ? (
                  <div className="grid gap-[6px] pl-[10px]">
                    <div className="flex items-center justify-between text-[11px] text-[var(--color-muted)]">
                      <span>调用占比</span>
                      <span style={{ fontFamily: 'var(--font-mono)' }}>
                        {formatPercent(item.conversionRate)}
                      </span>
                    </div>
                    <div className="h-[4px] overflow-hidden rounded-full" style={{ background: 'rgba(255,255,255,0.08)' }}>
                      <div
                        className="h-full rounded-full"
                        style={{ width: percentWidth(item.conversionRate), background: RANK_COLORS[index] }}
                      />
                    </div>
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <section className="rounded-[6px]" style={CARD_STYLE}>
        <div
          className="flex items-center justify-between gap-3 px-[14px] py-3"
          style={{ borderBottom: '1px solid var(--color-border)' }}
        >
          <div className="flex items-center gap-2" style={{ color: 'var(--color-primary)' }}>
            <Layers3 size={18} />
            <h3 className="text-[14px] font-semibold text-[#f5f5f5]">技能一览</h3>
          </div>
          <div
            className="flex items-center gap-2 h-[28px] px-[10px] w-[260px] rounded-[4px]"
            style={{ border: '1px solid rgba(255,255,255,0.10)', background: 'var(--color-base)' }}
          >
            <Search size={13} className="text-[var(--color-muted)] shrink-0" />
            <input
              className="w-full bg-transparent outline-none text-[12px] text-[var(--color-text)] placeholder:text-[var(--color-muted)]"
              placeholder="搜索技能名称"
              value={keyword}
              onChange={(event) => setKeyword(event.target.value)}
            />
          </div>
        </div>

        <div
          className="flex items-center px-[14px] py-[9px]"
          style={{ borderBottom: '1px solid var(--color-border)' }}
        >
          <FilterTabs active={matched} onChange={setMatched} />
        </div>

        {summaryQuery.error ? (
          <div className="p-[14px]">
            <SectionError error={summaryQuery.error} onRetry={() => void summaryQuery.refetch()} />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full" style={{ borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  {['技能名称', '调用量', '用户数', '覆盖需求', '最近调用'].map((header) => (
                    <th
                      key={header}
                      className="px-[12px] py-[8px] text-left text-[10px] font-bold uppercase whitespace-nowrap text-[var(--color-muted)]"
                      style={{ background: '#141414', borderBottom: '1px solid var(--color-border)' }}
                    >
                      {header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {!summaryQuery.data ? (
                  <TableMessage text="加载中..." />
                ) : items.length === 0 ? (
                  <TableMessage text={debouncedKeyword ? '无匹配技能' : '暂无数据'} />
                ) : (
                  items.map((item) => {
                    const isMatched = Boolean(item.capabilityCode);
                    return (
                      <tr
                        key={item.rawCapabilityName}
                        className="group cursor-pointer"
                        style={{ borderBottom: '1px solid var(--color-border)' }}
                        onClick={() => setSelectedRawCapabilityName(item.rawCapabilityName)}
                      >
                        <td
                          className="py-[10px] group-hover:bg-[#171717] transition-colors relative"
                          style={{ paddingLeft: 20, paddingRight: 12 }}
                        >
                          <div
                            className="absolute left-0 top-0 bottom-0 w-[3px]"
                            style={{ background: isMatched ? 'var(--color-good-text)' : 'var(--color-bad-text)' }}
                          />
                          <div className="flex flex-col gap-[2px] min-w-[240px]">
                            <span
                              className="text-[13px] font-medium truncate max-w-[300px]"
                              style={{ color: isMatched ? '#f5f5f5' : 'var(--color-bad-text)' }}
                            >
                              {item.capabilityDisplayName ?? item.capabilityCode ?? item.rawCapabilityName}
                            </span>
                            {isMatched ? (
                              <span
                                className="text-[10px] text-[var(--color-muted)] truncate max-w-[300px]"
                                style={{ fontFamily: 'var(--font-mono)' }}
                              >
                                {item.rawCapabilityName}
                              </span>
                            ) : (
                              <span className="text-[10px] text-[var(--color-bad-text)]">未匹配</span>
                            )}
                          </div>
                        </td>
                        <MetricCell value={item.usageCount} />
                        <MetricCell value={item.activeUserCount} />
                        <MetricCell value={item.deliveryUnitCount} emptyZero />
                        <td className="px-[12px] py-[10px] group-hover:bg-[#171717] transition-colors">
                          <div className="flex flex-col gap-[2px]">
                            <span className="text-[12px] text-[var(--color-secondary)]">
                              {formatRelativeTime(item.lastSeenAt)}
                            </span>
                            <span
                              className="text-[11px] text-[var(--color-muted)]"
                              style={{ fontFamily: 'var(--font-mono)' }}
                            >
                              {formatTime(item.lastSeenAt)}
                            </span>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        )}

        <div
          className="flex items-center justify-between px-[14px] py-[10px]"
          style={{ borderTop: '1px solid var(--color-border)' }}
        >
          <span className="text-[11px] text-[var(--color-muted)]">
            共 {formatInteger(total)} 个技能
          </span>
          {hasNext || hasPrev ? (
            <Pagination
              pageNumber={page}
              pageSize={PAGE_SIZE}
              hasNext={hasNext}
              hasPrev={hasPrev}
              onNext={() => setPage((current) => current + 1)}
              onPrev={() => setPage((current) => Math.max(1, current - 1))}
            />
          ) : null}
        </div>
      </section>

      {selectedRawCapabilityName ? (
        <RowInspectorDrawer
          open={selectedRawCapabilityName !== null}
          onOpenChange={(open) => {
            if (!open) setSelectedRawCapabilityName(null);
          }}
          title={selectedItem?.capabilityDisplayName ?? selectedItem?.rawCapabilityName ?? selectedRawCapabilityName}
          subtitle={selectedItem?.capabilityCode}
          icon={<Layers3 size={18} />}
          badge={
            selectedItem ? (
              <StatusBadge
                status={selectedItem.capabilityCode ? '已匹配' : '未匹配'}
                variant={selectedItem.capabilityCode ? 'good' : 'bad'}
              />
            ) : null
          }
          row={selectedItem ?? { rawCapabilityName: selectedRawCapabilityName }}
          overview={selectedItem ? toOverviewFields(selectedItem) : []}
          fields={selectedItem ? toDetailFields(selectedItem) : []}
          rawData={{ summary: selectedItem, usages: usageQuery.data?.items ?? [] }}
          loading={usageQuery.isLoading}
          error={usageQuery.error instanceof Error ? usageQuery.error.message : null}
          size="xl"
        >
          <div className="grid gap-2">
            <h4 className="text-[12px] font-semibold text-[var(--color-secondary)]">最近调用</h4>
            <DataTable
              headers={['时间', '状态', '用户', 'sessionId', 'promptId', 'interactionId']}
              rows={(usageQuery.data?.items ?? []).map(toUsageRow)}
              emptyText="暂无调用"
            />
          </div>
        </RowInspectorDrawer>
      ) : null}
    </div>
  );
}

function KpiCard({
  icon: Icon,
  label,
  value,
  hint,
  loading,
  progress,
  progressLabel,
}: {
  icon: LucideIcon;
  label: string;
  value: number | null | undefined;
  hint: string;
  loading: boolean;
  progress?: number | null;
  progressLabel?: string;
}) {
  return (
    <section className="flex gap-3 min-h-[106px] p-[14px] rounded-[6px]" style={CARD_STYLE}>
      <div className="grid w-[34px] h-[34px] flex-none place-items-center rounded-[4px]" style={ICON_BOX_STYLE}>
        <Icon size={18} />
      </div>
      <div className="flex flex-col justify-between flex-1 min-w-0">
        <span className="text-[12px] text-[var(--color-secondary)]">{label}</span>
        <strong
          className="text-[24px] font-semibold text-[#f5f5f5]"
          style={{ fontFamily: 'var(--font-mono)' }}
        >
          {loading || value == null ? '—' : formatInteger(value)}
        </strong>
        {progressLabel ? (
          <div className="grid gap-[5px]">
            <div className="h-[3px] w-full rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.08)' }}>
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{ width: percentWidth(progress ?? null), background: 'var(--color-good-text)' }}
              />
            </div>
            <div className="flex items-center justify-between gap-2 text-[10px] text-[var(--color-muted)]">
              <em className="not-italic">{progressLabel}</em>
              <em className="not-italic whitespace-nowrap">{hint}</em>
            </div>
          </div>
        ) : (
          <em className="text-[11px] not-italic text-[var(--color-muted)]">{hint}</em>
        )}
      </div>
    </section>
  );
}

function QualityCount({
  label,
  value,
  loading,
}: {
  label: string;
  value: number | undefined;
  loading: boolean;
}) {
  return (
    <div className="flex items-center justify-between">
      <span>{label}</span>
      <span style={{ fontFamily: 'var(--font-mono)' }}>
        {loading || value == null ? '—' : `${formatInteger(value)} 次`}
      </span>
    </div>
  );
}

function SkillChip({ icon: Icon, value }: { icon: LucideIcon; value: string }) {
  return (
    <span
      className="inline-flex items-center gap-[4px] text-[11px] text-[var(--color-secondary)] px-[6px] py-[2px] rounded-[4px]"
      style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid var(--color-border)' }}
    >
      <Icon size={10} />
      {value}
    </span>
  );
}

function FilterTabs({
  active,
  onChange,
}: {
  active: SkillFilter;
  onChange: (value: SkillFilter) => void;
}) {
  const tabs: Array<{ key: SkillFilter; label: string }> = [
    { key: 'all', label: '全部' },
    { key: 'unmatched', label: '未匹配' },
  ];

  return (
    <div className="flex gap-[6px]">
      {tabs.map(({ key, label }) => {
        const isActive = key === active;
        return (
          <button
            key={key}
            type="button"
            onClick={() => onChange(key)}
            className="h-[26px] px-3 rounded-[4px] text-[12px] font-medium transition-colors whitespace-nowrap"
            style={
              isActive
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
            {label}
          </button>
        );
      })}
    </div>
  );
}

function MetricCell({ value, emptyZero = false }: { value: number; emptyZero?: boolean }) {
  return (
    <td className="px-[12px] py-[10px] group-hover:bg-[#171717] transition-colors text-right">
      <span
        className={emptyZero && value === 0 ? 'text-[12px] text-[var(--color-muted)]' : 'text-[12px] text-[var(--color-secondary)]'}
        style={{ fontFamily: 'var(--font-mono)' }}
      >
        {emptyZero && value === 0 ? '—' : formatInteger(value)}
      </span>
    </td>
  );
}

function TableMessage({ text }: { text: string }) {
  return (
    <tr>
      <td colSpan={5} className="py-10 text-center text-[12px] text-[var(--color-muted)]">
        {text}
      </td>
    </tr>
  );
}

function deltaHint(metric: Metric | undefined): string {
  if (!metric || metric.previous == null || metric.current == null) {
    return '较上周期 —';
  }
  if (metric.previous === 0 && metric.current > 0) {
    return '较上周期 新增';
  }
  if (metric.previous === 0 || metric.previous === metric.current) {
    return '较上周期 持平';
  }
  const delta = (metric.current - metric.previous) / metric.previous;
  return `较上周期 ${delta > 0 ? '↑' : '↓'} ${formatPercent(Math.abs(delta))}`;
}

function formatRate(value: number | null): string {
  return value === null ? '—' : formatPercent(value);
}

function percentWidth(value: number | null): string {
  return `${Math.max(0, Math.min(value ?? 0, 1)) * 100}%`;
}

function toUsageRow(item: ProfileCapabilityUsageItem): DataTableRow {
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

function toOverviewFields(item: ProfileCapabilityUsageSummaryItem): RowInspectorField[] {
  return [
    { label: '调用', value: formatInteger(item.usageCount), mono: true },
    { label: '用户', value: formatInteger(item.activeUserCount), mono: true },
    { label: '会话', value: formatInteger(item.sessionCount), mono: true },
    { label: '覆盖需求', value: formatInteger(item.deliveryUnitCount), mono: true },
  ];
}

function toDetailFields(item: ProfileCapabilityUsageSummaryItem): RowInspectorField[] {
  return [
    { label: '语义名称', value: item.capabilityDisplayName ?? '—' },
    { label: '语义代码', value: item.capabilityCode ?? '—', copyValue: item.capabilityCode, mono: true },
    { label: '原始技能名', value: item.rawCapabilityName, copyValue: item.rawCapabilityName, mono: true },
    { label: '最近调用', value: formatDateTime(item.lastSeenAt), mono: true },
    { label: '首次出现', value: formatDateTime(item.firstSeenAt), mono: true },
  ];
}

function SectionError({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  return (
    <div
      className="flex min-h-24 items-center justify-between gap-3 rounded-[4px] px-3 text-[12px] text-[var(--color-bad-text)]"
      style={{ background: 'var(--color-bad-bg)' }}
    >
      <span>{error instanceof Error ? error.message : '加载失败'}</span>
      <button
        type="button"
        onClick={onRetry}
        className="rounded-[4px] px-2 py-1 text-[var(--color-text)]"
        style={{ border: '1px solid var(--color-border)' }}
      >
        重试
      </button>
    </div>
  );
}
