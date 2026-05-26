import { useState } from 'react';
import {
  Activity,
  AlertTriangle,
  GitBranch,
  Layers,
  Search,
  TrendingDown,
  Trophy,
  UserPlus,
  UserRound,
  Zap,
} from 'lucide-react';
import { useSddUsers } from './useSddUsers';
import { Pagination } from '@/components/ui/Pagination';
import { useClientPagination } from '@/lib/useClientPagination';
import { useDebouncedValue } from '@/lib/useDebouncedValue';
import { formatInteger, formatRelativeTime, formatTime } from '@/lib/format';
import type { SddUserItem } from '@sdd-telemetry/api';

const PAGE_SIZE = 20;
const SEVEN_DAYS_MS = 7 * 86_400_000;
const FOURTEEN_DAYS_MS = 14 * 86_400_000;
const THIRTY_DAYS_MS = 30 * 86_400_000;

const SDD_STAGES = ['proposal', 'design', 'task', 'codereview'] as const;
type SddStage = (typeof SDD_STAGES)[number];

const STAGE_LABELS: Record<SddStage, string> = {
  proposal: '需求撰写',
  design: '系统设计',
  task: '任务拆分',
  codereview: '代码评审',
};

type UserStatus = 'active' | 'new' | 'silent';
type StatusFilter = 'all' | UserStatus;

function getSddDepth(stages: string[]): number {
  return SDD_STAGES.filter((s) => stages.includes(s)).length;
}

function getUserStatus(u: SddUserItem, now: number): UserStatus {
  if (u.firstSeenAt && now - new Date(u.firstSeenAt).getTime() < FOURTEEN_DAYS_MS) return 'new';
  if (u.lastSeenAt && now - new Date(u.lastSeenAt).getTime() <= SEVEN_DAYS_MS) return 'active';
  return 'silent';
}

// ---- Avatar ----
const AVATAR_COLORS = ['#1a2a1a', '#1a1a2a', '#2a1a1a', '#1a2a2a', '#2a2a1a', '#251a25'];

function UserAvatar({ name, size = 28 }: { name: string | null | undefined; size?: number }) {
  const idx = (name?.charCodeAt(0) ?? 0) % AVATAR_COLORS.length;
  return (
    <div
      className="flex-none rounded-full flex items-center justify-center font-semibold"
      style={{
        width: size,
        height: size,
        background: AVATAR_COLORS[idx],
        color: '#f5f5f5',
        fontSize: Math.round(size * 0.42),
        border: '1px solid rgba(255,255,255,0.08)',
        flexShrink: 0,
      }}
    >
      {name ? name.slice(0, 1) : '?'}
    </div>
  );
}

// ---- StatusBadge ----
function StatusBadge({ status }: { status: UserStatus }) {
  const map: Record<UserStatus, { cls: string; label: string }> = {
    active: { cls: 'text-[var(--color-good-text)] bg-[var(--color-good-bg)]', label: '活跃' },
    new: { cls: 'text-[#60a5fa] bg-[rgba(96,165,250,0.10)]', label: '新成员' },
    silent: { cls: 'text-[var(--color-muted)] bg-[rgba(255,255,255,0.06)]', label: '沉默' },
  };
  const { cls, label } = map[status];
  return (
    <span
      className={`inline-flex items-center h-[20px] px-2 rounded-full text-[11px] font-medium whitespace-nowrap ${cls}`}
    >
      {label}
    </span>
  );
}

// ---- DepthDots ----
function DepthDots({ stages }: { stages: string[] }) {
  const depth = getSddDepth(stages);
  return (
    <div className="flex flex-col gap-[5px]">
      <span className="text-[11px] text-[var(--color-secondary)]" style={{ fontFamily: 'var(--font-mono)' }}>
        {depth} / 4 阶段
      </span>
      <div className="flex gap-[4px]">
        {SDD_STAGES.map((s) => (
          <div
            key={s}
            title={STAGE_LABELS[s]}
            className="rounded-full"
            style={{
              width: 6,
              height: 6,
              background: stages.includes(s) ? 'var(--color-primary)' : 'rgba(255,255,255,0.12)',
            }}
          />
        ))}
      </div>
    </div>
  );
}

// ---- FilterTabs ----
function FilterTabs({
  active,
  counts,
  onChange,
}: {
  active: StatusFilter;
  counts: Record<StatusFilter, number>;
  onChange: (v: StatusFilter) => void;
}) {
  const tabs: Array<{ key: StatusFilter; label: string }> = [
    { key: 'all', label: '全部' },
    { key: 'active', label: '活跃' },
    { key: 'new', label: '新成员' },
    { key: 'silent', label: '沉默' },
  ];
  return (
    <div className="flex gap-[6px]">
      {tabs.map(({ key, label }) => {
        const on = active === key;
        return (
          <button
            key={key}
            onClick={() => onChange(key)}
            className="h-[26px] px-3 rounded-[4px] text-[12px] font-medium transition-colors whitespace-nowrap"
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
            {label}
            <span className="ml-1.5 text-[10px]" style={{ opacity: 0.65 }}>
              {counts[key]}
            </span>
          </button>
        );
      })}
    </div>
  );
}

const STATUS_BORDER: Record<UserStatus, string> = {
  active: 'var(--color-good-text)',
  new: '#60a5fa',
  silent: 'rgba(255,255,255,0.10)',
};

const CARD_STYLE = {
  border: '1px solid var(--color-border)',
  background: 'var(--color-surface)',
};

const ICON_BOX_STYLE = {
  background: '#141409',
  color: 'var(--color-primary)',
};

export default function UsersPage() {
  const { data: rawData = [], isLoading } = useSddUsers();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const debouncedSearch = useDebouncedValue(search, 300);

  const now = Date.now();

  // KPI
  const total = rawData.length;
  const active7d = rawData.filter(
    (u) => u.lastSeenAt && now - new Date(u.lastSeenAt).getTime() <= SEVEN_DAYS_MS,
  ).length;
  const totalWorkItems = rawData.reduce((s, u) => s + u.workItemCount, 0);
  const avgDepth = total > 0
    ? rawData.reduce((s, u) => s + getSddDepth(u.semanticStages), 0) / total
    : 0;
  const newThisMonth = rawData.filter(
    (u) => u.firstSeenAt && now - new Date(u.firstSeenAt).getTime() < THIRTY_DAYS_MS,
  );

  // 漏斗
  const funnelData = SDD_STAGES.map((stage) => ({
    stage,
    label: STAGE_LABELS[stage],
    count: rawData.filter((u) => u.semanticStages.includes(stage)).length,
  }));
  const funnelMax = Math.max(funnelData[0]?.count ?? 0, 1);

  // 标杆成员
  const topContributors = [...rawData]
    .sort((a, b) => {
      if (b.workItemCount !== a.workItemCount) return b.workItemCount - a.workItemCount;
      return getSddDepth(b.semanticStages) - getSddDepth(a.semanticStages);
    })
    .slice(0, 3);

  // 诊断
  const notFullyConfigured = rawData.filter((u) => !u.requirementsRootPath || !u.installId);
  const inactive14d = rawData.filter(
    (u) => !u.lastSeenAt || now - new Date(u.lastSeenAt).getTime() > FOURTEEN_DAYS_MS,
  );
  const hasDiagnostics = notFullyConfigured.length > 0 || inactive14d.length > 0;

  // filter tabs 计数
  const statusCounts = rawData.reduce(
    (acc, u) => {
      acc.all++;
      acc[getUserStatus(u, now)]++;
      return acc;
    },
    { all: 0, active: 0, new: 0, silent: 0 } as Record<StatusFilter, number>,
  );

  // 搜索 + 状态过滤
  const filtered = rawData.filter((u) => {
    if (statusFilter !== 'all' && getUserStatus(u, now) !== statusFilter) return false;
    if (!debouncedSearch) return true;
    const q = debouncedSearch.toLowerCase();
    return (
      (u.userName ?? '').toLowerCase().includes(q) ||
      (u.installId ?? '').toLowerCase().includes(q) ||
      (u.machineName ?? '').toLowerCase().includes(q)
    );
  });

  const { pageItems, pageNumber, hasNext, hasPrev, goNext, goPrev, reset } =
    useClientPagination(filtered, PAGE_SIZE);

  const handleSearch = (v: string) => { setSearch(v); reset(); };
  const handleFilter = (v: StatusFilter) => { setStatusFilter(v); reset(); };

  const RANK_COLORS = ['var(--color-primary)', 'var(--color-secondary)', 'var(--color-muted)'];

  return (
    <div className="grid gap-3">

      {/* Section 1: KPI */}
      <div className="grid grid-cols-4 gap-3">

        {/* 近7天活跃 */}
        <section className="flex gap-3 min-h-[98px] p-[14px] rounded-[6px]" style={CARD_STYLE}>
          <div className="grid w-[34px] h-[34px] flex-none place-items-center rounded-[4px]" style={ICON_BOX_STYLE}>
            <Activity size={18} />
          </div>
          <div className="flex flex-col justify-between flex-1 min-w-0">
            <span className="text-[12px] text-[var(--color-secondary)]">近7天活跃</span>
            <div>
              <div className="flex items-baseline gap-1 mb-[6px]">
                <span className="text-[24px] font-semibold text-[#f5f5f5]" style={{ fontFamily: 'var(--font-mono)' }}>
                  {isLoading ? '—' : active7d}
                </span>
                <span className="text-[15px] text-[var(--color-muted)]" style={{ fontFamily: 'var(--font-mono)' }}>
                  &nbsp;/ {total}
                </span>
              </div>
              <div className="h-[3px] w-full rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.08)' }}>
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{
                    width: total > 0 ? `${(active7d / total) * 100}%` : '0%',
                    background: 'var(--color-good-text)',
                  }}
                />
              </div>
            </div>
            <em className="text-[11px] not-italic text-[var(--color-muted)]">按最近操作时间统计</em>
          </div>
        </section>

        {/* 工作项总产出 */}
        <section className="flex gap-3 min-h-[98px] p-[14px] rounded-[6px]" style={CARD_STYLE}>
          <div className="grid w-[34px] h-[34px] flex-none place-items-center rounded-[4px]" style={ICON_BOX_STYLE}>
            <GitBranch size={18} />
          </div>
          <div className="flex flex-col justify-between">
            <span className="text-[12px] text-[var(--color-secondary)]">工作项总产出</span>
            <strong className="text-[24px] font-semibold text-[#f5f5f5]" style={{ fontFamily: 'var(--font-mono)' }}>
              {isLoading ? '—' : formatInteger(totalWorkItems)}
            </strong>
            <em className="text-[11px] not-italic text-[var(--color-muted)]">全团队累计覆盖需求目录</em>
          </div>
        </section>

        {/* 平均使用深度 */}
        <section className="flex gap-3 min-h-[98px] p-[14px] rounded-[6px]" style={CARD_STYLE}>
          <div className="grid w-[34px] h-[34px] flex-none place-items-center rounded-[4px]" style={ICON_BOX_STYLE}>
            <Layers size={18} />
          </div>
          <div className="flex flex-col justify-between">
            <span className="text-[12px] text-[var(--color-secondary)]">平均使用深度</span>
            <div>
              <div className="flex items-baseline gap-1 mb-[6px]">
                <span className="text-[24px] font-semibold" style={{ fontFamily: 'var(--font-mono)', color: 'var(--color-primary)' }}>
                  {isLoading ? '—' : avgDepth.toFixed(1)}
                </span>
                <span className="text-[13px] text-[var(--color-muted)]">&nbsp;/ 4 阶段</span>
              </div>
              <div className="flex gap-[5px]">
                {SDD_STAGES.map((_, i) => (
                  <div
                    key={i}
                    className="rounded-full"
                    style={{
                      width: 8,
                      height: 8,
                      background: i < Math.round(avgDepth) ? 'var(--color-primary)' : 'rgba(255,255,255,0.12)',
                      opacity: i === Math.floor(avgDepth) && avgDepth % 1 > 0 ? 0.5 : 1,
                    }}
                  />
                ))}
              </div>
            </div>
            <em className="text-[11px] not-italic text-[var(--color-muted)]">满分 4（完整 SDD 链路）</em>
          </div>
        </section>

        {/* 本月新增 */}
        <section className="flex gap-3 min-h-[98px] p-[14px] rounded-[6px]" style={CARD_STYLE}>
          <div className="grid w-[34px] h-[34px] flex-none place-items-center rounded-[4px]" style={ICON_BOX_STYLE}>
            <UserPlus size={18} />
          </div>
          <div className="flex flex-col justify-between flex-1 min-w-0">
            <span className="text-[12px] text-[var(--color-secondary)]">本月新增成员</span>
            <div className="flex items-center justify-between">
              <strong className="text-[24px] font-semibold text-[#60a5fa]" style={{ fontFamily: 'var(--font-mono)' }}>
                {isLoading ? '—' : newThisMonth.length}
              </strong>
              {newThisMonth.length > 0 && (
                <div className="flex -space-x-[5px]">
                  {newThisMonth.slice(0, 4).map((u) => (
                    <UserAvatar key={u.id} name={u.userName} size={22} />
                  ))}
                </div>
              )}
            </div>
            <em className="text-[11px] not-italic text-[var(--color-muted)]">30天内首次接入</em>
          </div>
        </section>
      </div>

      {/* Section 2: 漏斗 + 接入健康 */}
      <div className="grid grid-cols-3 gap-3">

        {/* SDD 链路漏斗 */}
        <section className="col-span-2 p-[14px] rounded-[6px]" style={CARD_STYLE}>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2" style={{ color: 'var(--color-primary)' }}>
              <TrendingDown size={18} />
              <h3 className="text-[14px] font-semibold text-[#f5f5f5]">SDD 链路覆盖</h3>
            </div>
            <span className="text-[11px] text-[var(--color-muted)]">已使用该阶段的成员人数</span>
          </div>
          <div className="flex items-end gap-2" style={{ height: 100 }}>
            {funnelData.map((item, i) => (
              <div key={item.stage} className="flex-1 flex flex-col items-center gap-[6px]">
                <span className="text-[13px] font-semibold text-[#f5f5f5]" style={{ fontFamily: 'var(--font-mono)' }}>
                  {isLoading ? '—' : item.count}
                </span>
                <div className="w-full flex flex-col justify-end" style={{ height: 52 }}>
                  <div
                    className="w-full rounded-[3px] transition-all duration-500"
                    style={{
                      height: isLoading ? 4 : Math.max((item.count / funnelMax) * 52, 4),
                      background: `rgba(250,255,105,${1 - i * 0.2})`,
                    }}
                  />
                </div>
                <span className="text-[11px] text-[var(--color-muted)] text-center whitespace-nowrap">
                  {item.label}
                </span>
              </div>
            ))}
          </div>
        </section>

        {/* 接入健康 */}
        {hasDiagnostics ? (
          <section
            className="rounded-[6px]"
            style={{ border: '1px solid rgba(245,158,11,0.20)', background: 'rgba(245,158,11,0.04)' }}
          >
            <div
              className="flex items-center gap-2 px-[14px] py-3"
              style={{ borderBottom: '1px solid rgba(245,158,11,0.10)' }}
            >
              <AlertTriangle size={18} style={{ color: '#f59e0b' }} />
              <h3 className="text-[14px] font-semibold" style={{ color: '#f59e0b' }}>接入健康</h3>
            </div>
            <div className="flex flex-col justify-center" style={{ minHeight: 80 }}>
              {notFullyConfigured.length > 0 && (
                <div
                  className="flex items-center gap-4 px-[14px] py-3"
                  style={{ borderBottom: '1px solid rgba(245,158,11,0.06)' }}
                >
                  <span
                    className="inline-flex items-center justify-center w-12 h-5 rounded-full text-[11px] font-medium shrink-0 text-[var(--color-warn-text)] bg-[var(--color-warn-bg)]"
                  >
                    {notFullyConfigured.length} 人
                  </span>
                  <span className="text-[12px] text-[var(--color-secondary)]">
                    尚未完成接入配置，工作项数据可能缺失
                  </span>
                </div>
              )}
              {inactive14d.length > 0 && (
                <div className="flex items-center gap-4 px-[14px] py-3">
                  <span
                    className="inline-flex items-center justify-center w-12 h-5 rounded-full text-[11px] font-medium shrink-0 text-[var(--color-secondary)] bg-[rgba(255,255,255,0.06)]"
                  >
                    {inactive14d.length} 人
                  </span>
                  <span className="text-[12px] text-[var(--color-secondary)]">近14天未使用</span>
                </div>
              )}
            </div>
          </section>
        ) : (
          <section
            className="rounded-[6px] flex items-center justify-center"
            style={CARD_STYLE}
          >
            <div className="flex items-center gap-2 text-[var(--color-good-text)]">
              <span className="text-[12px]">接入健康，无异常</span>
            </div>
          </section>
        )}
      </div>

      {/* Section 3: 标杆成员 */}
      {!isLoading && topContributors.length > 0 && (
        <section className="p-[14px] rounded-[6px]" style={CARD_STYLE}>
          <div className="flex items-center gap-2 mb-3">
            <Trophy size={18} style={{ color: 'var(--color-primary)' }} />
            <h3 className="text-[14px] font-semibold text-[#f5f5f5]">标杆成员</h3>
            <span
              className="text-[10px] px-[6px] py-[2px] rounded-full font-medium"
              style={{
                color: 'var(--color-primary)',
                border: '1px solid rgba(250,255,105,0.22)',
                background: 'rgba(250,255,105,0.06)',
              }}
            >
              TOP {topContributors.length}
            </span>
          </div>
          <div className="grid grid-cols-3 gap-3">
            {topContributors.map((u, i) => {
              const status = getUserStatus(u, now);
              const depth = getSddDepth(u.semanticStages);
              return (
                <div
                  key={u.id}
                  className="flex items-center gap-3 p-3 rounded-[6px] relative overflow-hidden"
                  style={{ background: 'var(--color-hover)', border: '1px solid var(--color-border)' }}
                >
                  <div
                    className="absolute left-0 top-0 bottom-0 w-[3px]"
                    style={{ background: RANK_COLORS[i] }}
                  />
                  <div className="relative flex-none ml-[2px]">
                    <UserAvatar name={u.userName} size={40} />
                    <span
                      className="absolute -top-1 -right-1 w-[16px] h-[16px] rounded-full flex items-center justify-center text-[9px] font-bold"
                      style={{
                        background: RANK_COLORS[i],
                        color: i === 0 ? '#0a0a0a' : 'var(--color-surface)',
                      }}
                    >
                      {i + 1}
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-[5px]">
                      <span className="text-[13px] font-medium text-[#f5f5f5] truncate">
                        {u.userName ?? '未知用户'}
                      </span>
                      <StatusBadge status={status} />
                    </div>
                    <div className="flex items-center gap-[4px] mb-[7px]">
                      {SDD_STAGES.map((s) => (
                        <div
                          key={s}
                          title={STAGE_LABELS[s]}
                          className="rounded-full"
                          style={{
                            width: 6,
                            height: 6,
                            background: u.semanticStages.includes(s)
                              ? 'var(--color-primary)'
                              : 'rgba(255,255,255,0.12)',
                          }}
                        />
                      ))}
                      <span className="ml-1 text-[10px] text-[var(--color-muted)]" style={{ fontFamily: 'var(--font-mono)' }}>
                        {depth}/4
                      </span>
                    </div>
                    <div className="flex gap-[6px]">
                      <span
                        className="inline-flex items-center gap-[4px] text-[11px] text-[var(--color-secondary)] px-[6px] py-[2px] rounded-[4px]"
                        style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid var(--color-border)' }}
                      >
                        <GitBranch size={10} />
                        {u.workItemCount} 工作项
                      </span>
                      <span
                        className="inline-flex items-center gap-[4px] text-[11px] text-[var(--color-secondary)] px-[6px] py-[2px] rounded-[4px]"
                        style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid var(--color-border)' }}
                      >
                        <Zap size={10} />
                        {formatInteger(u.interactionCount)} 次
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Section 4: 用户一览 */}
      <section className="rounded-[6px]" style={CARD_STYLE}>

        {/* 标题 + 搜索 */}
        <div
          className="flex items-center justify-between gap-3 px-[14px] py-3"
          style={{ borderBottom: '1px solid var(--color-border)' }}
        >
          <div className="flex items-center gap-2" style={{ color: 'var(--color-primary)' }}>
            <UserRound size={18} />
            <h3 className="text-[14px] font-semibold text-[#f5f5f5]">用户一览</h3>
          </div>
          <div
            className="flex items-center gap-2 h-[28px] px-[10px] w-[220px] rounded-[4px]"
            style={{ border: '1px solid rgba(255,255,255,0.10)', background: 'var(--color-base)' }}
          >
            <Search size={13} className="text-[var(--color-muted)] shrink-0" />
            <input
              className="w-full bg-transparent outline-none text-[12px] text-[var(--color-text)] placeholder:text-[var(--color-muted)]"
              placeholder="搜索成员名称"
              value={search}
              onChange={(e) => handleSearch(e.target.value)}
            />
          </div>
        </div>

        {/* Filter tabs */}
        <div
          className="flex items-center px-[14px] py-[9px]"
          style={{ borderBottom: '1px solid var(--color-border)' }}
        >
          <FilterTabs active={statusFilter} counts={statusCounts} onChange={handleFilter} />
        </div>

        {/* 表格 */}
        <div className="overflow-x-auto">
          <table className="w-full" style={{ borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                {['成员', '状态', 'SDD 深度', '工作项', '累计使用', '最近活跃'].map((h) => (
                  <th
                    key={h}
                    className="px-[12px] py-[8px] text-left text-[10px] font-bold uppercase whitespace-nowrap text-[var(--color-muted)]"
                    style={{ background: '#141414', borderBottom: '1px solid var(--color-border)' }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {pageItems.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-10 text-center text-[12px] text-[var(--color-muted)]">
                    {debouncedSearch ? '无匹配成员' : '暂无数据'}
                  </td>
                </tr>
              ) : (
                pageItems.map((u) => {
                  const status = getUserStatus(u, now);
                  const daysSinceFirst = u.firstSeenAt
                    ? Math.floor((now - new Date(u.firstSeenAt).getTime()) / 86_400_000)
                    : null;
                  return (
                    <tr
                      key={u.id}
                      className="group"
                      style={{ borderBottom: '1px solid var(--color-border)' }}
                    >
                      {/* 成员 */}
                      <td className="py-[10px] group-hover:bg-[#171717] transition-colors relative" style={{ paddingLeft: 20, paddingRight: 12 }}>
                        <div
                          className="absolute left-0 top-0 bottom-0 w-[3px]"
                          style={{ background: STATUS_BORDER[status] }}
                        />
                        <div className="flex items-center gap-2">
                          <UserAvatar name={u.userName} size={26} />
                          <div className="flex flex-col gap-[2px]">
                            {u.userName ? (
                              <span className="text-[13px] font-medium text-[#f5f5f5]">{u.userName}</span>
                            ) : (
                              <span className="text-[12px] italic text-[var(--color-muted)]">未知用户</span>
                            )}
                            {daysSinceFirst !== null && (
                              <span className="text-[10px] text-[var(--color-muted)]">接入 {daysSinceFirst} 天</span>
                            )}
                          </div>
                        </div>
                      </td>
                      {/* 状态 */}
                      <td className="px-[12px] py-[10px] group-hover:bg-[#171717] transition-colors">
                        <StatusBadge status={status} />
                      </td>
                      {/* SDD 深度 */}
                      <td className="px-[12px] py-[10px] group-hover:bg-[#171717] transition-colors">
                        <DepthDots stages={u.semanticStages} />
                      </td>
                      {/* 工作项 */}
                      <td className="px-[12px] py-[10px] group-hover:bg-[#171717] transition-colors">
                        {u.workItemCount > 0 ? (
                          <div className="flex flex-col gap-[2px]">
                            <span className="text-[13px] text-[#f5f5f5]" style={{ fontFamily: 'var(--font-mono)' }}>
                              {formatInteger(u.workItemCount)}
                            </span>
                            <span className="text-[10px] text-[var(--color-muted)]">个需求</span>
                          </div>
                        ) : (
                          <span className="text-[12px] text-[var(--color-muted)]">—</span>
                        )}
                      </td>
                      {/* 累计使用 */}
                      <td className="px-[12px] py-[10px] group-hover:bg-[#171717] transition-colors">
                        <span className="text-[12px] text-[var(--color-secondary)]" style={{ fontFamily: 'var(--font-mono)' }}>
                          {formatInteger(u.interactionCount)}
                          <span className="text-[10px] text-[var(--color-muted)]"> 次</span>
                        </span>
                      </td>
                      {/* 最近活跃 */}
                      <td className="px-[12px] py-[10px] group-hover:bg-[#171717] transition-colors">
                        <div className="flex flex-col gap-[2px]">
                          <span className="text-[12px] text-[var(--color-secondary)]">
                            {formatRelativeTime(u.lastSeenAt)}
                          </span>
                          <span className="text-[11px] text-[var(--color-muted)]" style={{ fontFamily: 'var(--font-mono)' }}>
                            {formatTime(u.lastSeenAt)}
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

        {/* Footer */}
        <div
          className="flex items-center justify-between px-[14px] py-[10px]"
          style={{ borderTop: '1px solid var(--color-border)' }}
        >
          <span className="text-[11px] text-[var(--color-muted)]">共 {filtered.length} 位成员</span>
          {(hasNext || hasPrev) && (
            <Pagination
              pageNumber={pageNumber}
              pageSize={PAGE_SIZE}
              hasNext={hasNext}
              hasPrev={hasPrev}
              onNext={goNext}
              onPrev={goPrev}
            />
          )}
        </div>
      </section>
    </div>
  );
}
