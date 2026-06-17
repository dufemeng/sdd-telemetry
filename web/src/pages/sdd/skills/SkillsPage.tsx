import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowRight,
  GitBranch,
  Layers3,
  Search,
  UserRound,
  Zap,
  type LucideIcon,
} from 'lucide-react';
import type { ProfileCapabilityUsageSummaryItem } from '@sdd-telemetry/api';
import { useShellContext } from '@/components/layout/useShellContext';
import { EmptyState } from '@/components/ui/EmptyState';
import { Pagination } from '@/components/ui/Pagination';
import { StatusBadge } from '@/components/ui/StatusBadge';
import {
  formatInteger,
  formatRelativeTime,
  formatTime,
} from '@/lib/format';
import { useDebouncedValue } from '@/lib/useDebouncedValue';
import { timeRangeToFromIso } from '@/lib/timeRange';
import {
  useProfileCapabilityAnalytics,
  useProfileCapabilityUsageSummary,
  useProfilePresentationModel,
} from '@/pages/profiles/useProfiles';

const PAGE_SIZE = 18;
const CONFIG_GAP_PAGE_SIZE = 8;
const PANEL_STYLE = {
  border: '1px solid var(--color-border)',
  background: 'var(--color-surface)',
};
const MUTED_PANEL_STYLE = {
  border: '1px solid var(--color-border)',
  background: '#0d0d0d',
};

type MetricTone = 'neutral' | 'good' | 'warn';

export default function SkillsPage() {
  const navigate = useNavigate();
  const { timeRange, profileId } = useShellContext();
  const fromIso = useMemo(() => timeRangeToFromIso(timeRange), [timeRange]);
  const presentation = useProfilePresentationModel(profileId);
  const capabilityLabel = presentation.labels.capabilitySingular;
  const deliveryUnitLabel = presentation.labels.deliveryUnitSingular;
  const [keyword, setKeyword] = useState('');
  const [page, setPage] = useState(1);
  const debouncedKeyword = useDebouncedValue(keyword, 300);

  const analyticsQuery = useProfileCapabilityAnalytics(profileId, fromIso);
  const semanticQuery = useProfileCapabilityUsageSummary(profileId, {
    fromIso,
    matched: 'matched',
    groupBy: 'capability',
    keyword: debouncedKeyword,
    page,
    pageSize: PAGE_SIZE,
  });
  const unclassifiedQuery = useProfileCapabilityUsageSummary(profileId, {
    fromIso,
    matched: 'unmatched',
    groupBy: 'raw',
    page: 1,
    pageSize: CONFIG_GAP_PAGE_SIZE,
  });

  useEffect(() => {
    setPage(1);
  }, [debouncedKeyword, fromIso, profileId]);

  const analytics = analyticsQuery.data;
  const kpis = analytics?.kpis;
  const matchHealth = analytics?.matchHealth;
  const semanticItems = semanticQuery.data?.items ?? [];
  const configGapItems = unclassifiedQuery.data?.items ?? [];
  const semanticTotal = semanticQuery.data?.total ?? 0;
  const hasPrev = page > 1;
  const hasNext = page * PAGE_SIZE < semanticTotal;
  const configGapCount = matchHealth?.unmatchedCount ?? 0;
  const usageCount = kpis?.capabilityUsageCount.current ?? 0;
  const activeUserCount = kpis?.activeUserCount.current ?? 0;
  const coveredDeliveryUnitCount = kpis?.coveredDeliveryUnitCount.current ?? 0;
  const userTriggeredCount = kpis?.userTriggeredCount.current ?? 0;
  const autoTriggeredCount = kpis?.autoTriggeredCount.current ?? 0;

  const openCapability = (item: ProfileCapabilityUsageSummaryItem) => {
    const params = new URLSearchParams();
    if (item.capabilityCode && item.surfaceRole !== 'fallback') {
      params.set('capabilityCode', item.capabilityCode);
    } else {
      params.set('rawCapabilityName', item.rawCapabilityName);
    }
    navigate(`/sdd/skills/detail?${params.toString()}`);
  };

  if (analytics?.readMode === 'legacy') {
    return (
      <main className="grid gap-4">
        <section
          className="grid min-h-[360px] place-items-center rounded-[6px] p-[14px] text-center"
          style={PANEL_STYLE}
        >
          <div className="grid gap-3">
            <div className="mx-auto grid h-11 w-11 place-items-center rounded-[6px] bg-[#202016] text-[var(--color-primary)]">
              <Layers3 size={22} />
            </div>
            <h2 className="text-[16px] font-semibold text-[#f5f5f5]">该视图需投影数据</h2>
            <p className="mx-auto max-w-[440px] text-[12px] leading-5 text-[var(--color-muted)]">
              当前 profile 走 sdd_bridge 读取模式，{capabilityLabel}语义聚合、触发结构与配置缺口依赖投影结果；完成投影后即可查看完整{capabilityLabel}分析。
            </p>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="grid gap-4">
      <header className="rounded-[6px] p-[14px]" style={PANEL_STYLE}>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <div className="grid h-9 w-9 place-items-center rounded-[5px] bg-[#202016] text-[var(--color-primary)]">
                <Layers3 size={18} />
              </div>
              <div>
                <h2 className="text-[20px] font-semibold leading-7 text-[#f5f5f5]">
                  {presentation.labels.capabilityPlural}分析
                </h2>
                <p className="mt-[2px] text-[12px] text-[var(--color-secondary)]">
                  近 {timeRange}，判断技能是否被使用、是否覆盖{deliveryUnitLabel}、体系配置是否有缺口。
                </p>
              </div>
            </div>
            <p className="mt-4 max-w-[900px] text-[13px] leading-6 text-[var(--color-text)]">
              {capabilityLabel}调用 {formatInteger(usageCount)} 次，{formatInteger(activeUserCount)} 人使用，关联 {formatInteger(coveredDeliveryUnitCount)} 个{deliveryUnitLabel}，{formatInteger(configGapCount)} 次调用待纳入体系。
            </p>
          </div>
          <TriggerSummary
            userCount={userTriggeredCount}
            autoCount={autoTriggeredCount}
            label={capabilityLabel}
          />
        </div>
      </header>

      <section className="grid gap-3" style={{ gridTemplateColumns: 'repeat(4, minmax(0, 1fr))' }}>
        <MetricTile
          icon={Zap}
          label={`${capabilityLabel}调用量`}
          value={usageCount}
          hint="时间范围内的技能调用事实"
          loading={analyticsQuery.isLoading}
        />
        <MetricTile
          icon={UserRound}
          label={`使用${capabilityLabel}人数`}
          value={activeUserCount}
          hint="至少调用过一次技能的用户"
          loading={analyticsQuery.isLoading}
        />
        <MetricTile
          icon={GitBranch}
          label={`关联${deliveryUnitLabel}`}
          value={coveredDeliveryUnitCount}
          hint="只表达关联，不表达贡献"
          loading={analyticsQuery.isLoading}
        />
        <MetricTile
          icon={AlertTriangle}
          label="待纳入体系"
          value={configGapCount}
          hint="需要补技能语义或 raw 别名"
          tone={configGapCount > 0 ? 'warn' : 'good'}
          loading={analyticsQuery.isLoading}
        />
      </section>

      <div className="grid grid-cols-12 gap-4">
        <section className="col-span-8 rounded-[6px]" style={PANEL_STYLE}>
          <div className="flex items-center justify-between gap-3 px-[14px] py-3" style={{ borderBottom: '1px solid var(--color-border)' }}>
            <div>
              <h3 className="text-[14px] font-semibold text-[#f5f5f5]">
                技能语义分布
              </h3>
              <p className="mt-[2px] text-[11px] text-[var(--color-muted)]">
                按当前 profile 的技能语义聚合，点击查看 raw 别名、用户和关联{deliveryUnitLabel}。
              </p>
            </div>
            <div
              className="flex h-[30px] w-[260px] items-center gap-2 rounded-[4px] px-[10px]"
              style={{ border: '1px solid rgba(255,255,255,0.10)', background: 'var(--color-base)' }}
            >
              <Search size={13} className="shrink-0 text-[var(--color-muted)]" />
              <input
                className="w-full bg-transparent text-[12px] text-[var(--color-text)] outline-none placeholder:text-[var(--color-muted)]"
                placeholder={`搜索${capabilityLabel}语义或 code`}
                value={keyword}
                onChange={(event) => setKeyword(event.target.value)}
              />
            </div>
          </div>

          {semanticQuery.error ? (
            <SectionError error={semanticQuery.error} onRetry={() => void semanticQuery.refetch()} />
          ) : (
            <SemanticTable
              items={semanticItems}
              deliveryUnitLabel={deliveryUnitLabel}
              capabilityLabel={capabilityLabel}
              loading={!semanticQuery.data}
              emptyText={debouncedKeyword ? `无匹配${capabilityLabel}` : `暂无已纳入体系的${capabilityLabel}`}
              onOpen={openCapability}
            />
          )}

          <div className="flex items-center justify-between px-[14px] py-[10px]" style={{ borderTop: '1px solid var(--color-border)' }}>
            <span className="text-[11px] text-[var(--color-muted)]">
              共 {formatInteger(semanticTotal)} 个核心{capabilityLabel}
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

        <section className="col-span-4 rounded-[6px]" style={PANEL_STYLE}>
          <div className="flex items-start justify-between gap-3 px-[14px] py-3" style={{ borderBottom: '1px solid var(--color-border)' }}>
            <div>
              <h3 className="text-[14px] font-semibold text-[#f5f5f5]">配置缺口</h3>
              <p className="mt-[2px] text-[11px] leading-4 text-[var(--color-muted)]">
                已经出现但尚未纳入技能语义的 raw skill，用于补别名或新增语义。
              </p>
            </div>
            <StatusBadge status={configGapCount > 0 ? '需配置' : '已覆盖'} variant={configGapCount > 0 ? 'warn' : 'good'} />
          </div>

          {unclassifiedQuery.error ? (
            <SectionError error={unclassifiedQuery.error} onRetry={() => void unclassifiedQuery.refetch()} compact />
          ) : !unclassifiedQuery.data ? (
            <div className="p-8"><EmptyState text="加载中..." /></div>
          ) : configGapItems.length === 0 ? (
            <div className="p-8"><EmptyState text="当前 profile 未发现配置缺口" /></div>
          ) : (
            <div className="divide-y divide-[var(--color-border)]">
              {configGapItems.map((item) => (
                <button
                  key={item.rawCapabilityName}
                  type="button"
                  onClick={() => openCapability(item)}
                  className="group flex w-full items-center justify-between gap-3 px-[14px] py-[11px] text-left hover:bg-[#171717]"
                >
                  <div className="min-w-0">
                    <div className="truncate text-[12px] font-medium text-[#f5f5f5]" title={item.rawCapabilityName}>
                      {item.rawCapabilityName}
                    </div>
                    <div className="mt-[3px] flex flex-wrap gap-2 text-[11px] text-[var(--color-muted)]">
                      <span>{formatInteger(item.usageCount)} 次</span>
                      <span>{formatInteger(item.activeUserCount)} 人</span>
                      <span>{formatRelativeTime(item.lastSeenAt)}</span>
                    </div>
                  </div>
                  <ArrowRight size={14} className="shrink-0 text-[var(--color-muted)] group-hover:text-[var(--color-primary)]" />
                </button>
              ))}
            </div>
          )}
        </section>
      </div>

    </main>
  );
}

function MetricTile({
  icon: Icon,
  label,
  value,
  hint,
  tone = 'neutral',
  loading,
}: {
  icon: LucideIcon;
  label: string;
  value: number;
  hint: string;
  tone?: MetricTone;
  loading: boolean;
}) {
  const color = tone === 'warn'
    ? 'var(--color-warn-text)'
    : tone === 'good'
      ? 'var(--color-good-text)'
      : '#f5f5f5';
  return (
    <section className="min-h-[104px] rounded-[6px] p-[14px]" style={PANEL_STYLE}>
      <div className="flex items-center justify-between gap-3">
        <div className="grid h-8 w-8 place-items-center rounded-[5px] bg-[#141409] text-[var(--color-primary)]">
          <Icon size={16} />
        </div>
        <span className="text-[11px] text-[var(--color-muted)]">{label}</span>
      </div>
      <strong className="mt-4 block text-[26px] font-semibold leading-none" style={{ color, fontFamily: 'var(--font-mono)' }}>
        {loading ? '...' : formatInteger(value)}
      </strong>
      <p className="mt-3 text-[11px] leading-4 text-[var(--color-muted)]">{hint}</p>
    </section>
  );
}

function TriggerSummary({
  userCount,
  autoCount,
  label,
}: {
  userCount: number;
  autoCount: number;
  label: string;
}) {
  const total = userCount + autoCount;
  const userPct = total > 0 ? userCount / total : 0;
  return (
    <div className="w-[300px] rounded-[6px] p-3" style={MUTED_PANEL_STYLE}>
      <div className="flex items-center justify-between text-[12px]">
        <span className="text-[var(--color-secondary)]">{label}触发结构</span>
        <span className="text-[var(--color-muted)]">{formatInteger(total)} 次</span>
      </div>
      <div className="mt-3 flex h-[8px] overflow-hidden rounded-full bg-[#202020]">
        <div style={{ width: `${userPct * 100}%`, background: 'var(--color-primary)' }} />
        <div style={{ flex: 1, background: 'rgba(255,255,255,0.16)' }} />
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 text-[11px]">
        <span className="text-[var(--color-secondary)]">用户触发 {formatInteger(userCount)}</span>
        <span className="text-right text-[var(--color-muted)]">自动触发 {formatInteger(autoCount)}</span>
      </div>
    </div>
  );
}

function SemanticTable({
  items,
  deliveryUnitLabel,
  capabilityLabel,
  loading,
  emptyText,
  onOpen,
}: {
  items: ProfileCapabilityUsageSummaryItem[];
  deliveryUnitLabel: string;
  capabilityLabel: string;
  loading: boolean;
  emptyText: string;
  onOpen: (item: ProfileCapabilityUsageSummaryItem) => void;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full" style={{ borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            {[`${capabilityLabel}语义`, '调用量', '使用人数', `关联${deliveryUnitLabel}`, '原始技能', '触发结构', '最近调用'].map((header) => (
              <th
                key={header}
                className="whitespace-nowrap px-[12px] py-[9px] text-left text-[10px] font-bold text-[var(--color-muted)]"
                style={{ background: '#141414', borderBottom: '1px solid var(--color-border)' }}
              >
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <TableMessage colSpan={7} text="加载中..." />
          ) : items.length === 0 ? (
            <TableMessage colSpan={7} text={emptyText} />
          ) : (
            items.map((item) => {
              const title = item.capabilityDisplayName ?? item.capabilityCode ?? item.rawCapabilityName;
              return (
                <tr
                  key={item.capabilityCode ?? item.rawCapabilityName}
                  className="group cursor-pointer"
                  style={{ borderBottom: '1px solid var(--color-border)' }}
                  onClick={() => onOpen(item)}
                >
                  <td className="px-[12px] py-[11px] group-hover:bg-[#171717]">
                    <div className="min-w-[220px]">
                      <div className="flex items-center gap-2">
                        <span className="truncate text-[13px] font-medium text-[#f5f5f5]" title={title}>
                          {title}
                        </span>
                        <ArrowRight size={13} className="text-[var(--color-muted)] opacity-0 transition-opacity group-hover:opacity-100" />
                      </div>
                      <div className="mt-[3px] truncate text-[10px] text-[var(--color-muted)]" style={{ fontFamily: 'var(--font-mono)' }}>
                        {item.capabilityCode ?? item.rawCapabilityName}
                      </div>
                    </div>
                  </td>
                  <NumberCell value={item.usageCount} />
                  <NumberCell value={item.activeUserCount} />
                  <NumberCell value={item.deliveryUnitCount} emptyZero />
                  <td className="px-[12px] py-[11px] group-hover:bg-[#171717]">
                    <AliasPreview names={item.rawCapabilityNames ?? [item.rawCapabilityName]} count={item.rawCapabilityCount ?? 1} />
                  </td>
                  <td className="px-[12px] py-[11px] group-hover:bg-[#171717]">
                    <MiniTrigger userCount={item.userTriggeredCount ?? 0} autoCount={item.autoTriggeredCount ?? 0} />
                  </td>
                  <td className="px-[12px] py-[11px] group-hover:bg-[#171717]">
                    <div className="flex flex-col gap-[2px]">
                      <span className="text-[12px] text-[var(--color-secondary)]">{formatRelativeTime(item.lastSeenAt)}</span>
                      <span className="text-[11px] text-[var(--color-muted)]" style={{ fontFamily: 'var(--font-mono)' }}>
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
  );
}

function AliasPreview({ names, count }: { names: string[]; count: number }) {
  const preview = names.slice(0, 2);
  return (
    <div className="flex flex-col gap-[3px]">
      <span className="text-[12px] text-[var(--color-secondary)]">{formatInteger(count)} 个</span>
      <span className="max-w-[180px] truncate text-[10px] text-[var(--color-muted)]" style={{ fontFamily: 'var(--font-mono)' }}>
        {preview.join(' / ') || 'unknown'}
      </span>
    </div>
  );
}

function MiniTrigger({ userCount, autoCount }: { userCount: number; autoCount: number }) {
  const total = userCount + autoCount;
  if (total === 0) return <span className="text-[12px] text-[var(--color-muted)]">unknown</span>;
  const pct = userCount / total;
  return (
    <div className="w-[120px]">
      <div className="flex h-[5px] overflow-hidden rounded-full bg-[#202020]">
        <div style={{ width: `${pct * 100}%`, background: 'var(--color-primary)' }} />
        <div style={{ flex: 1, background: 'rgba(255,255,255,0.16)' }} />
      </div>
      <div className="mt-[5px] flex justify-between text-[10px] text-[var(--color-muted)]">
        <span>用户 {formatInteger(userCount)}</span>
        <span>自动 {formatInteger(autoCount)}</span>
      </div>
    </div>
  );
}

function NumberCell({ value, emptyZero = false }: { value: number; emptyZero?: boolean }) {
  return (
    <td className="px-[12px] py-[11px] text-right group-hover:bg-[#171717]">
      <span className={emptyZero && value === 0 ? 'text-[12px] text-[var(--color-muted)]' : 'text-[12px] text-[var(--color-secondary)]'} style={{ fontFamily: 'var(--font-mono)' }}>
        {emptyZero && value === 0 ? '0' : formatInteger(value)}
      </span>
    </td>
  );
}

function TableMessage({ text, colSpan }: { text: string; colSpan: number }) {
  return (
    <tr>
      <td colSpan={colSpan} className="py-10 text-center text-[12px] text-[var(--color-muted)]">
        {text}
      </td>
    </tr>
  );
}

function SectionError({
  error,
  onRetry,
  compact = false,
}: {
  error: unknown;
  onRetry: () => void;
  compact?: boolean;
}) {
  return (
    <div className={compact ? 'p-3' : 'p-[14px]'}>
      <div
        className="flex min-h-20 items-center justify-between gap-3 rounded-[4px] px-3 text-[12px] text-[var(--color-bad-text)]"
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
    </div>
  );
}
