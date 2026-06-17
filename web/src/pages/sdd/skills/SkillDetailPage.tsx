import { useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  ArrowLeft,
  Clock3,
  GitBranch,
  Layers3,
  UserRound,
  Zap,
  type LucideIcon,
} from 'lucide-react';
import type { ProfileCapabilityUsageItem, ProfileCapabilityUsageSummaryItem } from '@sdd-telemetry/api';
import { useShellContext } from '@/components/layout/useShellContext';
import { DataTable, type DataTableRow } from '@/components/ui/DataTable';
import { EmptyState } from '@/components/ui/EmptyState';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { formatDateTime, formatInteger, truncateId } from '@/lib/format';
import { timeRangeToFromIso } from '@/lib/timeRange';
import {
  useProfileCapabilityUsageSummary,
  useProfileCapabilityUsages,
  useProfilePresentationModel,
} from '@/pages/profiles/useProfiles';

const PANEL_STYLE = {
  border: '1px solid var(--color-border)',
  background: 'var(--color-surface)',
};
const MUTED_PANEL_STYLE = {
  border: '1px solid var(--color-border)',
  background: '#0d0d0d',
};

export default function SkillDetailPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { profileId, timeRange } = useShellContext();
  const presentation = useProfilePresentationModel(profileId);
  const fromIso = useMemo(() => timeRangeToFromIso(timeRange), [timeRange]);
  const capabilityCode = searchParams.get('capabilityCode') || undefined;
  const rawCapabilityName = searchParams.get('rawCapabilityName') || undefined;
  const capabilityLabel = presentation.labels.capabilitySingular;
  const deliveryUnitLabel = presentation.labels.deliveryUnitSingular;

  const summaryQuery = useProfileCapabilityUsageSummary(profileId, {
    fromIso,
    matched: 'all',
    groupBy: capabilityCode ? 'capability' : 'raw',
    capabilityCode,
    rawCapabilityName,
    page: 1,
    pageSize: 1,
  });
  const usageQuery = useProfileCapabilityUsages(profileId, {
    fromIso,
    capabilityCode,
    rawCapabilityName,
    page: 1,
    pageSize: 50,
  });

  const summary = summaryQuery.data?.items[0] ?? null;
  const usages = usageQuery.data?.items ?? [];
  const firstUsage = usages[0] ?? null;
  const title = rawCapabilityName ?? resolveTitle(summary, firstUsage, capabilityCode);
  const aliasNames = summary?.rawCapabilityNames ?? (rawCapabilityName ? [rawCapabilityName] : []);
  const totalUsage = summary?.usageCount ?? usageQuery.data?.total ?? 0;
  const isConfigGap = summary?.surfaceRole === 'fallback' || Boolean(rawCapabilityName && !capabilityCode);
  const detailRows = useMemo(() => toUsageRows(usages, navigate), [navigate, usages]);
  const deliveryUnitIds = useMemo(() => {
    const ids = usages
      .map((item) => item.deliveryUnitId)
      .filter((id): id is string => Boolean(id));
    return Array.from(new Set(ids)).slice(0, 8);
  }, [usages]);

  if (!capabilityCode && !rawCapabilityName) {
    return <main className="p-4"><EmptyState text="缺少技能参数" /></main>;
  }

  return (
    <main className="grid gap-4">
      <header className="rounded-[6px] p-[14px]" style={PANEL_STYLE}>
        <button
          type="button"
          onClick={() => navigate('/sdd/skills')}
          className="mb-3 inline-flex items-center gap-1 text-[12px] text-[var(--color-muted)] hover:text-[var(--color-secondary)]"
        >
          <ArrowLeft size={14} /> {presentation.labels.capabilityPlural}分析
        </button>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-3">
              <div className="grid h-10 w-10 place-items-center rounded-[5px] bg-[#202016] text-[var(--color-primary)]">
                <Layers3 size={19} />
              </div>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="truncate text-[20px] font-semibold leading-7 text-[#f5f5f5]">
                    {title}
                  </h2>
                  <StatusBadge
                    status={isConfigGap ? '待纳入体系' : '体系内技能'}
                    variant={isConfigGap ? 'warn' : 'good'}
                  />
                </div>
                <p className="mt-[2px] text-[12px] text-[var(--color-secondary)]">
                  {capabilityCode ? `${capabilityLabel}语义代码 ${capabilityCode}` : `raw skill ${rawCapabilityName}`}
                </p>
              </div>
            </div>
          </div>
          <div className="text-right text-[11px] text-[var(--color-muted)]">
            <div>{timeRange}</div>
            <div className="mt-1">最多展示最近 50 条调用证据</div>
          </div>
        </div>
      </header>

      <section className="grid gap-3" style={{ gridTemplateColumns: 'repeat(4, minmax(0, 1fr))' }}>
        <DetailMetric icon={Zap} label="调用量" value={totalUsage} loading={summaryQuery.isLoading && usageQuery.isLoading} />
        <DetailMetric icon={UserRound} label="使用人数" value={summary?.activeUserCount ?? 0} loading={summaryQuery.isLoading} />
        <DetailMetric icon={GitBranch} label={`关联${deliveryUnitLabel}`} value={summary?.deliveryUnitCount ?? 0} loading={summaryQuery.isLoading} />
        <DetailMetric icon={Clock3} label="原始技能数" value={summary?.rawCapabilityCount ?? aliasNames.length} loading={summaryQuery.isLoading} />
      </section>

      <div className="grid grid-cols-12 gap-4">
        <section className="col-span-4 rounded-[6px] p-[14px]" style={PANEL_STYLE}>
          <h3 className="text-[14px] font-semibold text-[#f5f5f5]">raw 别名</h3>
          <p className="mt-[2px] text-[11px] text-[var(--color-muted)]">同一个技能语义下被识别到的原始 skill 名称。</p>
          <div className="mt-4 flex flex-wrap gap-2">
            {aliasNames.length === 0 ? (
              <span className="text-[12px] text-[var(--color-muted)]">暂无 raw 别名</span>
            ) : aliasNames.map((name) => (
              <span
                key={name}
                className="max-w-full truncate rounded-[4px] px-2 py-1 text-[11px] text-[var(--color-secondary)]"
                style={{ border: '1px solid var(--color-border)', background: '#141414', fontFamily: 'var(--font-mono)' }}
                title={name}
              >
                {name}
              </span>
            ))}
          </div>
        </section>

        <section className="col-span-4 rounded-[6px] p-[14px]" style={MUTED_PANEL_STYLE}>
          <h3 className="text-[14px] font-semibold text-[#f5f5f5]">触发结构</h3>
          <TriggerBreakdown
            userCount={summary?.userTriggeredCount ?? 0}
            autoCount={summary?.autoTriggeredCount ?? 0}
            failedCount={summary?.failedCount ?? 0}
          />
        </section>

        <section className="col-span-4 rounded-[6px] p-[14px]" style={PANEL_STYLE}>
          <h3 className="text-[14px] font-semibold text-[#f5f5f5]">关联{deliveryUnitLabel}</h3>
          <p className="mt-[2px] text-[11px] text-[var(--color-muted)]">来自最近调用中可见的{deliveryUnitLabel}锚点，完整数量见指标。</p>
          <DeliveryUnitList
            ids={deliveryUnitIds}
            label={deliveryUnitLabel}
            onOpen={(id) => navigate(`/sdd/work-items/${id}`)}
          />
        </section>
      </div>

      <section className="rounded-[6px]" style={PANEL_STYLE}>
        <SectionHeader title="最近调用证据" description="按调用时间倒序，保留用户、关联需求和调用链路 ID。" />
        {usageQuery.error ? (
          <SectionError error={usageQuery.error} onRetry={() => void usageQuery.refetch()} />
        ) : (
          <DataTable
            headers={['时间', '状态', '原始技能', '用户', deliveryUnitLabel, '触发来源', 'promptId', 'interactionId']}
            rows={detailRows}
            emptyText={usageQuery.isLoading ? '加载中...' : '暂无调用'}
          />
        )}
      </section>
    </main>
  );
}

function DetailMetric({
  icon: Icon,
  label,
  value,
  loading,
}: {
  icon: LucideIcon;
  label: string;
  value: number;
  loading: boolean;
}) {
  return (
    <section className="rounded-[6px] p-[14px]" style={PANEL_STYLE}>
      <div className="flex items-center justify-between gap-3">
        <div className="grid h-8 w-8 place-items-center rounded-[5px] bg-[#141409] text-[var(--color-primary)]">
          <Icon size={16} />
        </div>
        <span className="text-[11px] text-[var(--color-muted)]">{label}</span>
      </div>
      <strong className="mt-4 block text-[25px] font-semibold leading-none text-[#f5f5f5]" style={{ fontFamily: 'var(--font-mono)' }}>
        {loading ? '...' : formatInteger(value)}
      </strong>
    </section>
  );
}

function TriggerBreakdown({
  userCount,
  autoCount,
  failedCount,
}: {
  userCount: number;
  autoCount: number;
  failedCount: number;
}) {
  const total = userCount + autoCount;
  const userPct = total > 0 ? userCount / total : 0;
  return (
    <div className="mt-4 grid gap-3">
      <div className="flex h-[8px] overflow-hidden rounded-full bg-[#202020]">
        <div style={{ width: `${userPct * 100}%`, background: 'var(--color-primary)' }} />
        <div style={{ flex: 1, background: 'rgba(255,255,255,0.16)' }} />
      </div>
      <div className="grid grid-cols-3 gap-3 text-[12px]">
        <BreakdownItem label="用户触发" value={userCount} />
        <BreakdownItem label="自动触发" value={autoCount} />
        <BreakdownItem label="失败状态" value={failedCount} tone={failedCount > 0 ? 'warn' : 'neutral'} />
      </div>
    </div>
  );
}

function BreakdownItem({ label, value, tone = 'neutral' }: { label: string; value: number; tone?: 'neutral' | 'warn' }) {
  return (
    <div className="rounded-[4px] px-3 py-2" style={{ background: '#101010', border: '1px solid var(--color-border)' }}>
      <div className="text-[11px] text-[var(--color-muted)]">{label}</div>
      <div
        className="mt-1 text-[16px] font-semibold"
        style={{ color: tone === 'warn' ? 'var(--color-warn-text)' : '#f5f5f5', fontFamily: 'var(--font-mono)' }}
      >
        {formatInteger(value)}
      </div>
    </div>
  );
}

function DeliveryUnitList({
  ids,
  label,
  onOpen,
}: {
  ids: string[];
  label: string;
  onOpen: (id: string) => void;
}) {
  if (ids.length === 0) {
    return (
      <div className="mt-4 rounded-[4px] px-3 py-6 text-center text-[12px] text-[var(--color-muted)]" style={{ background: '#0d0d0d' }}>
        最近调用暂无关联{label}
      </div>
    );
  }

  return (
    <div className="mt-4 grid gap-2">
      {ids.map((id) => (
        <button
          key={id}
          type="button"
          onClick={() => onOpen(id)}
          className="flex items-center justify-between gap-3 rounded-[4px] px-3 py-2 text-left hover:bg-[#171717]"
          style={{ border: '1px solid var(--color-border)', background: '#0d0d0d' }}
        >
          <span className="min-w-0 truncate text-[12px] text-[var(--color-secondary)]" style={{ fontFamily: 'var(--font-mono)' }}>
            {id}
          </span>
          <span className="shrink-0 text-[11px] text-[var(--color-primary)]">查看</span>
        </button>
      ))}
    </div>
  );
}

function SectionHeader({ title, description }: { title: string; description: string }) {
  return (
    <div className="px-[14px] py-3" style={{ borderBottom: '1px solid var(--color-border)' }}>
      <h3 className="text-[14px] font-semibold text-[#f5f5f5]">{title}</h3>
      <p className="mt-[2px] text-[11px] text-[var(--color-muted)]">{description}</p>
    </div>
  );
}

function toUsageRows(items: ProfileCapabilityUsageItem[], navigate: (to: string) => void): DataTableRow[] {
  return items.map((item) => ({
    key: item.id,
    cells: [
      formatDateTime(item.eventTime),
      <StatusBadge key="status" status={item.status} />,
      <span key="raw" title={item.rawCapabilityName} style={{ fontFamily: 'var(--font-mono)' }}>
        {item.rawCapabilityName}
      </span>,
      item.userId ?? 'unknown',
      item.deliveryUnitId ? (
        <button
          key="delivery"
          type="button"
          onClick={() => navigate(`/sdd/work-items/${item.deliveryUnitId}`)}
          className="text-[var(--color-primary)] hover:underline"
        >
          {item.deliveryUnitId}
        </button>
      ) : 'unknown',
      formatTriggerSource(item.triggerSource),
      truncateId(item.promptId),
      truncateId(item.interactionId),
    ],
  }));
}

function resolveTitle(
  summary: ProfileCapabilityUsageSummaryItem | null,
  firstUsage: ProfileCapabilityUsageItem | null,
  capabilityCode: string | undefined,
): string {
  return summary?.capabilityDisplayName
    ?? firstUsage?.capabilityDisplayName
    ?? capabilityCode
    ?? 'unknown';
}

function formatTriggerSource(value: string | null | undefined): string {
  if (value === 'user-slash') return '用户触发';
  if (value === 'claude-proactive') return '自动触发';
  if (value === 'nested-skill') return '嵌套触发';
  return value ?? 'unknown';
}

function SectionError({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  return (
    <div className="p-[14px]">
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
