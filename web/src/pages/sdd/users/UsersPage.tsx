import { useMemo, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  GitBranch,
  Layers,
  Radar,
  Search,
  TrendingDown,
  Trophy,
  UserRound,
  Users,
} from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { useSddUsers } from './useSddUsers';
import { Pagination } from '@/components/ui/Pagination';
import { useClientPagination } from '@/lib/useClientPagination';
import { useDebouncedValue } from '@/lib/useDebouncedValue';
import { formatInteger, formatRelativeTime, formatTime } from '@/lib/format';
import type { SddUserItem } from '@sdd-telemetry/api';

const PAGE_SIZE = 20;
const DAY_MS = 86_400_000;

const SDD_STAGES = ['proposal', 'design', 'task', 'codereview'] as const;
type SddStage = (typeof SDD_STAGES)[number];

const STAGE_LABELS: Record<SddStage, string> = {
  proposal: '需求撰写',
  design: '系统设计',
  task: '任务拆分',
  codereview: '代码评审',
};

const STAGE_COLORS: Record<SddStage, string> = {
  proposal: 'var(--color-primary)',
  design: '#a78bfa',
  task: '#60a5fa',
  codereview: '#34d399',
};

type UserStatus = 'live' | 'cold' | 'churn';
type StatusFilter = 'all' | UserStatus | 'new';

const BUS_FACTOR_THRESHOLD = 2;

function getSddDepth(stages: string[]): number {
  return SDD_STAGES.filter((s) => stages.includes(s)).length;
}

function maturityReached(u: SddUserItem): number {
  return SDD_STAGES.filter((s) => u.semanticStages.includes(s)).length;
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

// ---- StatusBadge (live/cold/churn + optional new overlay) ----
function StatusBadge({ status, isNew }: { status: UserStatus; isNew?: boolean }) {
  const map: Record<UserStatus, { cls: string; label: string }> = {
    live: { cls: 'text-[var(--color-good-text)] bg-[var(--color-good-bg)]', label: '活跃' },
    cold: { cls: 'text-[var(--color-secondary)] bg-[rgba(255,255,255,0.06)]', label: '转冷' },
    churn: { cls: 'text-[#f87171] bg-[rgba(248,113,113,0.10)]', label: '流失' },
  };
  const { cls, label } = map[status];
  return (
    <span className="inline-flex items-center gap-1">
      <span
        className={`inline-flex items-center h-[20px] px-2 rounded-full text-[11px] font-medium whitespace-nowrap ${cls}`}
      >
        {label}
      </span>
      {isNew ? (
        <span className="inline-flex items-center h-[20px] px-2 rounded-full text-[11px] font-medium whitespace-nowrap text-[#60a5fa] bg-[rgba(96,165,250,0.10)]">
          新成员
        </span>
      ) : null}
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
              background: stages.includes(s) ? STAGE_COLORS[s] : 'rgba(255,255,255,0.12)',
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
    { key: 'live', label: '活' },
    { key: 'cold', label: '冷' },
    { key: 'churn', label: '流失' },
    { key: 'new', label: '新成员' },
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

const CARD_STYLE = {
  border: '1px solid var(--color-border)',
  background: 'var(--color-surface)',
};

const ICON_BOX_STYLE = {
  background: '#141409',
  color: 'var(--color-primary)',
};

const STAGE_DROP_THRESHOLD = 0.5;

function daysSince(ts: string | null, now: number): number | null {
  if (!ts) return null;
  return Math.floor((now - new Date(ts).getTime()) / DAY_MS);
}

export default function UsersPage() {
  const { data: rawData = [], isLoading } = useSddUsers();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const debouncedSearch = useDebouncedValue(search, 300);
  const navigate = useNavigate();

  const now = Date.now();

  // 三态分桶
  const liveCount = rawData.filter((u) => u.status === 'live').length;
  const coldCount = rawData.filter((u) => u.status === 'cold').length;
  const churnCount = rawData.filter((u) => u.status === 'churn').length;
  const newCount = rawData.filter((u) => u.isNew).length;

  const total = rawData.length;
  const active7d = liveCount;
  const avgMaturity = total > 0
    ? rawData.reduce((s, u) => s + maturityReached(u), 0) / total
    : 0;

  // 漏斗（每阶段命中人数）
  const funnelData = SDD_STAGES.map((stage) => ({
    stage,
    label: STAGE_LABELS[stage],
    count: rawData.filter((u) => u.semanticStages.includes(stage)).length,
  }));
  const funnelMax = Math.max(funnelData[0]?.count ?? 0, 1);

  // 断崖检测：相邻阶段接续率，最小值即断崖点
  const funnelTransitions = funnelData.map((item, i) => {
    if (i === 0) return null;
    const prev = funnelData[i - 1]!.count;
    const rate = prev > 0 ? item.count / prev : 0;
    return { from: funnelData[i - 1]!.stage, to: item.stage, rate };
  }).filter((x): x is { from: SddStage; to: SddStage; rate: number } => x !== null);
  const cliff = funnelTransitions.length > 0
    ? funnelTransitions.reduce((min, t) => (t.rate < min.rate ? t : min), funnelTransitions[0]!)
    : null;

  // 能力矩阵：每阶段 distinct 人数 + bus-factor
  const capability = SDD_STAGES.map((stage) => ({
    stage,
    label: STAGE_LABELS[stage],
    count: rawData.filter((u) => u.semanticStages.includes(stage)).length,
  }));
  const capabilityMax = Math.max(capability[0]?.count ?? 0, 1);

  // 掉队雷达：churn 且曾有活动
  const dropoffs = rawData
    .filter((u) => u.status === 'churn' && (u.skillUsageCount > 0 || u.interactionCount > 0))
    .sort((a, b) => {
      const aDays = daysSince(a.lastSeenAt, now) ?? -1;
      const bDays = daysSince(b.lastSeenAt, now) ?? -1;
      return bDays - aDays;
    });

  // 标杆：按 (artifactCount + workItemCount) 排序
  const topContributors = useMemo(() => (
    [...rawData]
      .sort((a, b) => {
        const aScore = b.artifactCount * 2 + b.workItemCount + (b.codeWriteCount > 0 ? 1 : 0);
        const bScore = a.artifactCount * 2 + a.workItemCount + (a.codeWriteCount > 0 ? 1 : 0);
        return aScore - bScore;
      })
      .slice(0, 3)
  ), [rawData]);

  // filter tabs 计数
  const statusCounts = useMemo(() => {
    const c: Record<StatusFilter, number> = { all: total, live: liveCount, cold: coldCount, churn: churnCount, new: newCount };
    return c;
  }, [total, liveCount, coldCount, churnCount, newCount]);

  // 搜索 + 状态过滤
  const filtered = rawData.filter((u) => {
    if (statusFilter === 'new') {
      if (!u.isNew) return false;
    } else if (statusFilter !== 'all') {
      if (u.status !== statusFilter) return false;
    }
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

  const goProfile = (userId: string) => navigate(`/sdd/users/${userId}`);

  // 三态堆叠条宽度
  const triWidth = (count: number) => (total > 0 ? (count / total) * 100 : 0);
  const triSegments = [
    { key: 'live', count: liveCount, color: 'var(--color-good-text)' },
    { key: 'cold', count: coldCount, color: 'var(--color-muted)' },
    { key: 'churn', count: churnCount, color: '#f87171' },
  ];

  const RANK_COLORS = ['var(--color-primary)', 'var(--color-secondary)', 'var(--color-muted)'];

  return (
    <div className="grid gap-3">

      {/* Section 1: KPI (4) */}
      <div className="grid grid-cols-4 gap-3">

        {/* 团队规模 + 三态 */}
        <section className="flex gap-3 min-h-[98px] p-[14px] rounded-[6px]" style={CARD_STYLE}>
          <div className="grid w-[34px] h-[34px] flex-none place-items-center rounded-[4px]" style={ICON_BOX_STYLE}>
            <Users size={18} />
          </div>
          <div className="flex flex-col justify-between flex-1 min-w-0">
            <span className="text-[12px] text-[var(--color-secondary)]">团队规模</span>
            <strong className="text-[24px] font-semibold text-[#f5f5f5]" style={{ fontFamily: 'var(--font-mono)' }}>
              {isLoading ? '—' : total}
            </strong>
            <div>
              <div className="h-[4px] w-full rounded-full overflow-hidden flex" style={{ background: 'rgba(255,255,255,0.08)' }}>
                {triSegments.map((seg) => (
                  <div
                    key={seg.key}
                    className="h-full transition-all duration-500"
                    style={{ width: `${triWidth(seg.count)}%`, background: seg.color }}
                  />
                ))}
              </div>
              <div className="flex gap-3 mt-[4px] text-[10px]">
                {triSegments.map((seg) => (
                  <span key={seg.key} className="inline-flex items-center gap-1 text-[var(--color-muted)]">
                    <span className="w-[6px] h-[6px] rounded-full" style={{ background: seg.color }} />
                    {seg.key === 'live' ? '活' : seg.key === 'cold' ? '冷' : '流失'} {seg.count}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* 近7天活跃 */}
        <section className="flex gap-3 min-h-[98px] p-[14px] rounded-[6px]" style={CARD_STYLE}>
          <div className="grid w-[34px] h-[34px] flex-none place-items-center rounded-[4px]" style={ICON_BOX_STYLE}>
            <Activity size={18} />
          </div>
          <div className="flex flex-col justify-between flex-1 min-w-0">
            <span className="text-[12px] text-[var(--color-secondary)]">近 7 天活跃</span>
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
            <em className="text-[11px] not-italic text-[var(--color-muted)]">按最近操作时间</em>
          </div>
        </section>

        {/* 平均采用成熟度 */}
        <section className="flex gap-3 min-h-[98px] p-[14px] rounded-[6px]" style={CARD_STYLE}>
          <div className="grid w-[34px] h-[34px] flex-none place-items-center rounded-[4px]" style={ICON_BOX_STYLE}>
            <Layers size={18} />
          </div>
          <div className="flex flex-col justify-between">
            <span className="text-[12px] text-[var(--color-secondary)]">平均采用成熟度</span>
            <div>
              <div className="flex items-baseline gap-1 mb-[6px]">
                <span className="text-[24px] font-semibold" style={{ fontFamily: 'var(--font-mono)', color: 'var(--color-primary)' }}>
                  {isLoading ? '—' : avgMaturity.toFixed(1)}
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
                      background: i < Math.round(avgMaturity) ? 'var(--color-primary)' : 'rgba(255,255,255,0.12)',
                      opacity: i === Math.floor(avgMaturity) && avgMaturity % 1 > 0 ? 0.5 : 1,
                    }}
                  />
                ))}
              </div>
            </div>
            <em className="text-[11px] not-italic text-[var(--color-muted)]">满分 4（完整 SDD 链路）</em>
          </div>
        </section>

        {/* 流失成员 */}
        <section className="flex gap-3 min-h-[98px] p-[14px] rounded-[6px]" style={CARD_STYLE}>
          <div
            className="grid w-[34px] h-[34px] flex-none place-items-center rounded-[4px]"
            style={{ background: 'rgba(248,113,113,0.10)', color: '#f87171' }}
          >
            <AlertTriangle size={18} />
          </div>
          <div className="flex flex-col justify-between flex-1 min-w-0">
            <span className="text-[12px] text-[var(--color-secondary)]">流失成员</span>
            <strong className="text-[24px] font-semibold" style={{ fontFamily: 'var(--font-mono)', color: churnCount > 0 ? '#f87171' : 'var(--color-muted)' }}>
              {isLoading ? '—' : `${churnCount}${churnCount > 0 ? ' ⚠' : ''}`}
            </strong>
            <em className="text-[11px] not-italic text-[var(--color-muted)]">曾活跃 · 近 30 天掉零</em>
          </div>
        </section>
      </div>

      {/* Section 2: 采用漏斗 + 掉队雷达 */}
      <div className="grid grid-cols-3 gap-3">

        {/* SDD 采用漏斗 */}
        <section className="col-span-2 p-[14px] rounded-[6px]" style={CARD_STYLE}>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2" style={{ color: 'var(--color-primary)' }}>
              <TrendingDown size={18} />
              <h3 className="text-[14px] font-semibold text-[#f5f5f5]">SDD 采用漏斗</h3>
            </div>
            <span className="text-[11px] text-[var(--color-muted)]">走到各阶段的成员人数</span>
          </div>
          <div className="flex flex-col gap-[6px]">
            {funnelData.map((item, i) => {
              const prev = i > 0 ? funnelData[i - 1]!.count : null;
              const rate = prev !== null && prev > 0 ? item.count / prev : null;
              const isCliff = cliff !== null && cliff.to === item.stage && cliff.rate < STAGE_DROP_THRESHOLD;
              return (
                <div key={item.stage} className="flex flex-col gap-[3px]">
                  <div className="flex items-center justify-between text-[12px]">
                    <span className="inline-flex items-center gap-2 text-[var(--color-secondary)]">
                      <span className="w-[6px] h-[6px] rounded-full" style={{ background: STAGE_COLORS[item.stage] }} />
                      {item.label}
                      <code className="text-[10px] text-[var(--color-muted)]" style={{ fontFamily: 'var(--font-mono)' }}>
                        {item.stage}
                      </code>
                    </span>
                    <span className="text-[#f5f5f5]" style={{ fontFamily: 'var(--font-mono)' }}>
                      <b>{item.count}</b> 人
                    </span>
                  </div>
                  <div className="w-full h-[6px] rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.06)' }}>
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{
                        width: `${Math.max((item.count / funnelMax) * 100, 2)}%`,
                        background: STAGE_COLORS[item.stage],
                      }}
                    />
                  </div>
                  {rate !== null ? (
                    <div className={`text-[10px] ${isCliff ? 'text-[#f87171]' : 'text-[var(--color-muted)]'}`}>
                      接续 {Math.round(rate * 100)}%
                      {isCliff ? (
                        <span className="ml-2 text-[#f87171]">断崖 ↓ {STAGE_LABELS[cliff.from]} → {STAGE_LABELS[cliff.to]}</span>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        </section>

        {/* 掉队雷达 */}
        <section className="rounded-[6px] overflow-hidden" style={{ ...CARD_STYLE, borderColor: dropoffs.length > 0 ? 'rgba(248,113,113,0.20)' : 'var(--color-border)' }}>
          <div
            className="flex items-center gap-2 px-[14px] py-3"
            style={{ borderBottom: `1px solid ${dropoffs.length > 0 ? 'rgba(248,113,113,0.10)' : 'var(--color-border)'}` }}
          >
            <Radar size={18} style={{ color: dropoffs.length > 0 ? '#f87171' : 'var(--color-muted)' }} />
            <h3 className="text-[14px] font-semibold" style={{ color: dropoffs.length > 0 ? '#f87171' : 'var(--color-secondary)' }}>
              掉队雷达
            </h3>
            <span className="text-[11px] text-[var(--color-muted)]">曾活跃 · 近 30 天掉零</span>
          </div>
          <div className="flex flex-col">
            {dropoffs.length === 0 ? (
              <div className="px-[14px] py-4 text-[12px] text-[var(--color-muted)]">无掉队成员</div>
            ) : (
              dropoffs.slice(0, 5).map((u) => {
                const days = daysSince(u.lastSeenAt, now);
                return (
                  <button
                    key={u.id}
                    onClick={() => goProfile(u.id)}
                    className="grid items-center gap-2 px-[14px] py-[8px] text-left hover:bg-[#171717] transition-colors"
                    style={{ gridTemplateColumns: '24px 1fr auto 14px', borderBottom: '1px solid var(--color-border)' }}
                  >
                    <UserAvatar name={u.userName} size={24} />
                    <span className="text-[12px] text-[#f5f5f5] truncate">{u.userName ?? '未知用户'}</span>
                    <span className="text-[11px] text-[var(--color-muted)] whitespace-nowrap" style={{ fontFamily: 'var(--font-mono)' }}>
                      {days !== null ? `${days} 天前` : '—'}
                    </span>
                    <span className="text-[var(--color-muted)] text-right">→</span>
                  </button>
                );
              })
            )}
            {dropoffs.length > 5 ? (
              <div className="px-[14px] py-[6px] text-[11px] text-[var(--color-muted)]">
                …另有 {dropoffs.length - 5} 人
              </div>
            ) : null}
          </div>
        </section>
      </div>

      {/* 能力矩阵 / bus-factor */}
      <section className="p-[14px] rounded-[6px]" style={CARD_STYLE}>
        <div className="flex items-center gap-2 mb-3">
          <Layers size={18} style={{ color: 'var(--color-primary)' }} />
          <h3 className="text-[14px] font-semibold text-[#f5f5f5]">团队能力矩阵</h3>
          <span className="text-[11px] text-[var(--color-muted)]">
            能做该阶段的人数 · ≤ {BUS_FACTOR_THRESHOLD} 人标单点风险（bus-factor）
          </span>
        </div>
        <div className="grid grid-cols-4 gap-3">
          {capability.map((c) => {
            const isRisk = c.count > 0 && c.count <= BUS_FACTOR_THRESHOLD;
            return (
              <div
                key={c.stage}
                className="rounded-[4px] px-3 py-[10px]"
                style={{
                  background: 'var(--color-hover)',
                  border: `1px solid ${isRisk ? 'rgba(248,113,113,0.30)' : 'var(--color-border)'}`,
                }}
              >
                <div className="flex items-center justify-between mb-[6px]">
                  <span className="inline-flex items-center gap-[6px] text-[12px] text-[var(--color-secondary)]">
                    <span className="w-[6px] h-[6px] rounded-full" style={{ background: STAGE_COLORS[c.stage] }} />
                    {c.label}
                  </span>
                  {isRisk ? (
                    <span className="text-[10px] text-[#f87171] px-[6px] py-[1px] rounded-full" style={{ border: '1px solid rgba(248,113,113,0.30)' }}>
                      单点风险
                    </span>
                  ) : null}
                </div>
                <div className="flex items-baseline gap-1 mb-[6px]">
                  <span className="text-[20px] font-semibold text-[#f5f5f5]" style={{ fontFamily: 'var(--font-mono)' }}>
                    {c.count}
                  </span>
                  <span className="text-[11px] text-[var(--color-muted)]">人</span>
                </div>
                <div className="h-[4px] w-full rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.06)' }}>
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{
                      width: `${Math.max((c.count / capabilityMax) * 100, 2)}%`,
                      background: STAGE_COLORS[c.stage],
                    }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </section>

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
              const depth = maturityReached(u);
              const days = daysSince(u.firstSeenAt, now);
              return (
                <div
                  key={u.id}
                  className="flex flex-col gap-[8px] p-3 rounded-[6px] relative overflow-hidden"
                  style={{ background: 'var(--color-hover)', border: '1px solid var(--color-border)' }}
                >
                  <div
                    className="absolute left-0 top-0 bottom-0 w-[3px]"
                    style={{ background: RANK_COLORS[i] }}
                  />
                  <div className="flex items-center gap-3 ml-[2px]">
                    <div className="relative flex-none">
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
                      <div className="flex items-center gap-2 mb-[3px]">
                        <span className="text-[13px] font-medium text-[#f5f5f5] truncate">
                          {u.userName ?? '未知用户'}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <StatusBadge status={u.status} isNew={u.isNew} />
                        <span className="text-[10px] text-[var(--color-muted)]" style={{ fontFamily: 'var(--font-mono)' }}>
                          {depth}/4
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-[6px] ml-[2px]">
                    <span className="inline-flex items-center gap-[4px] text-[11px] text-[var(--color-secondary)] px-[6px] py-[2px] rounded-[4px]" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid var(--color-border)' }}>
                      <GitBranch size={10} />
                      {u.workItemCount} 需求
                    </span>
                    <span className="inline-flex items-center gap-[4px] text-[11px] text-[var(--color-secondary)] px-[6px] py-[2px] rounded-[4px]" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid var(--color-border)' }}>
                      <Layers size={10} />
                      {u.artifactCount} artifact
                    </span>
                    {u.codeWriteCount > 0 ? (
                      <span className="inline-flex items-center gap-[4px] text-[11px] text-[var(--color-good-text)] px-[6px] py-[2px] rounded-[4px]" style={{ background: 'var(--color-good-bg)', border: '1px solid var(--color-good-text)' }}>
                        {u.codeWriteCount} 落地
                      </span>
                    ) : null}
                    {days !== null ? (
                      <span className="inline-flex items-center text-[11px] text-[var(--color-muted)] px-[6px] py-[2px] rounded-[4px]" style={{ background: 'rgba(255,255,255,0.02)' }}>
                        接入 {days} 天
                      </span>
                    ) : null}
                  </div>
                  <Link
                    to={`/sdd/users/${u.id}`}
                    className="inline-flex items-center gap-1 text-[11px] text-[var(--color-primary)] hover:underline ml-[2px]"
                  >
                    看他怎么干的 →
                  </Link>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Section 4: 成员一览 */}
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
            className="flex items-center gap-2 h-[28px] px-[10px] w-[260px] rounded-[4px]"
            style={{ border: '1px solid rgba(255,255,255,0.10)', background: 'var(--color-base)' }}
          >
            <Search size={13} className="text-[var(--color-muted)] shrink-0" />
            <input
              className="w-full bg-transparent outline-none text-[12px] text-[var(--color-text)] placeholder:text-[var(--color-muted)]"
              placeholder="搜索成员 / 安装 ID / 机器"
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
                {['成员', '状态', 'SDD 成熟度', '工作项', '产出转化（artifact / 落地）', '接入时长', '最近活跃'].map((h) => (
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
                  <td colSpan={7} className="py-10 text-center text-[12px] text-[var(--color-muted)]">
                    {debouncedSearch ? '无匹配成员' : '暂无数据'}
                  </td>
                </tr>
              ) : (
                pageItems.map((u) => {
                  const daysSinceFirst = daysSince(u.firstSeenAt, now);
                  return (
                    <tr
                      key={u.id}
                      className="group cursor-pointer"
                      style={{ borderBottom: '1px solid var(--color-border)' }}
                      onClick={() => goProfile(u.id)}
                    >
                      {/* 成员 */}
                      <td className="py-[10px] group-hover:bg-[#171717] transition-colors relative" style={{ paddingLeft: 20, paddingRight: 12 }}>
                        <div className="flex items-center gap-2">
                          <UserAvatar name={u.userName} size={26} />
                          <div className="flex flex-col gap-[2px]">
                            {u.userName ? (
                              <span className="text-[13px] font-medium text-[#f5f5f5]">{u.userName}</span>
                            ) : (
                              <span className="text-[12px] italic text-[var(--color-muted)]">未知用户</span>
                            )}
                            {u.machineName ? (
                              <span className="text-[10px] text-[var(--color-muted)]">{u.machineName}</span>
                            ) : null}
                          </div>
                        </div>
                      </td>
                      {/* 状态 */}
                      <td className="px-[12px] py-[10px] group-hover:bg-[#171717] transition-colors">
                        <StatusBadge status={u.status} isNew={u.isNew} />
                      </td>
                      {/* SDD 成熟度 */}
                      <td className="px-[12px] py-[10px] group-hover:bg-[#171717] transition-colors">
                        <DepthDots stages={u.semanticStages} />
                      </td>
                      {/* 工作项 */}
                      <td className="px-[12px] py-[10px] group-hover:bg-[#171717] transition-colors">
                        {u.workItemCount > 0 ? (
                          <span className="text-[13px] text-[#f5f5f5]" style={{ fontFamily: 'var(--font-mono)' }}>
                            {formatInteger(u.workItemCount)}
                          </span>
                        ) : (
                          <span className="text-[12px] text-[var(--color-muted)]">—</span>
                        )}
                      </td>
                      {/* 产出转化 */}
                      <td className="px-[12px] py-[10px] group-hover:bg-[#171717] transition-colors">
                        <div className="flex gap-[8px] text-[11px]" style={{ fontFamily: 'var(--font-mono)' }}>
                          <span className="text-[var(--color-secondary)]">
                            {u.artifactCount} <span className="text-[10px] text-[var(--color-muted)]">artifact</span>
                          </span>
                          <span className="text-[var(--color-good-text)]">
                            {u.codeWriteCount} <span className="text-[10px] text-[var(--color-muted)]">落地</span>
                          </span>
                        </div>
                      </td>
                      {/* 接入时长 */}
                      <td className="px-[12px] py-[10px] group-hover:bg-[#171717] transition-colors">
                        {daysSinceFirst !== null ? (
                          <span className="text-[12px] text-[var(--color-secondary)]" style={{ fontFamily: 'var(--font-mono)' }}>
                            {daysSinceFirst} 天
                          </span>
                        ) : (
                          <span className="text-[12px] text-[var(--color-muted)]">—</span>
                        )}
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
          <span className="text-[11px] text-[var(--color-muted)]">
            共 {filtered.length} 位成员 · 活 {liveCount} / 冷 {coldCount} / 流失 {churnCount}
            {newCount > 0 ? ` · 新成员 ${newCount}` : ''}
          </span>
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
