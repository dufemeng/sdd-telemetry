import { useMemo, useState } from 'react';
import {
  FileText,
  GitBranch,
  Search,
  Sparkles,
  TrendingDown,
  Trophy,
  Zap,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useShellContext } from '@/components/layout/useShellContext';
import { useProfileDemands, useProfileHiddenMetrics } from '@/pages/profiles/useProfiles';
import { BarList } from '@/components/ui/BarList';
import { Pagination } from '@/components/ui/Pagination';
import { useClientPagination } from '@/lib/useClientPagination';
import { formatInteger, formatRelativeTime, formatTime } from '@/lib/format';
import type { ProfileDemand } from '@sdd-telemetry/api';

// ─── 常量 ────────────────────────────────────────────────────────────────────

const PAGE_SIZE = 20;
const SILENT_MS = 14 * 86_400_000;
const THIRTY_DAYS_MS = 30 * 86_400_000;

const SDD_STAGES = ['proposal', 'design', 'task', 'review'] as const;
type SddStage = (typeof SDD_STAGES)[number];

const STAGE_LABELS: Record<SddStage, string> = {
  proposal: '需求撰写',
  design: '系统设计',
  task: '任务拆分',
  review: '代码评审',
};

const STAGE_DOT_COLORS: Record<SddStage, string> = {
  proposal: '#60a5fa',
  design: 'var(--color-good-text)',
  task: 'var(--color-primary)',
  review: '#a78bfa',
};

const RANK_COLORS = ['var(--color-primary)', 'var(--color-secondary)', 'var(--color-muted)'];

const CARD_STYLE = { border: '1px solid var(--color-border)', background: 'var(--color-surface)' };
const ICON_BOX = { background: '#141409', color: 'var(--color-primary)' };

type WorkItemStatus = 'active' | 'silent' | 'error';
type StatusFilter = 'all' | WorkItemStatus;

// ─── 辅助函数 ─────────────────────────────────────────────────────────────────

function getStatus(item: ProfileDemand, now: number): WorkItemStatus {
  if (item.errorCount > 0) return 'error';
  if (item.lastSeenAt && now - new Date(item.lastSeenAt).getTime() <= SILENT_MS) return 'active';
  return 'silent';
}

function getCoreStages(coverageStages: string[]): SddStage[] {
  return SDD_STAGES.filter((s) => coverageStages.includes(s));
}

// ─── 子组件 ──────────────────────────────────────────────────────────────────

function StageDots({ coverageStages }: { coverageStages: string[] }) {
  const core = getCoreStages(coverageStages);
  return (
    <div className="flex flex-col gap-[5px]">
      <span
        className="text-[11px] text-[var(--color-secondary)]"
        style={{ fontFamily: 'var(--font-mono)' }}
      >
        {core.length} / 4 阶段
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
              background: coverageStages.includes(s)
                ? STAGE_DOT_COLORS[s]
                : 'rgba(255,255,255,0.12)',
            }}
          />
        ))}
      </div>
    </div>
  );
}

function ArtifactStageChips({ coverageStages }: { coverageStages: string[] }) {
  if (coverageStages.length === 0) {
    return <span className="text-[12px] text-[var(--color-muted)]">—</span>;
  }
  return (
    <div className="flex flex-wrap gap-[4px]">
      {coverageStages.slice(0, 4).map((stage) => (
        <span
          key={stage}
          className="text-[10px] px-[6px] py-[1px] rounded-[3px] text-[var(--color-secondary)]"
          style={{ border: '1px solid var(--color-border)', background: 'rgba(255,255,255,0.04)' }}
        >
          {stage}
        </span>
      ))}
      {coverageStages.length > 4 ? (
        <span className="text-[10px] text-[var(--color-muted)]">+{coverageStages.length - 4}</span>
      ) : null}
    </div>
  );
}

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
    { key: 'all',    label: '全部' },
    { key: 'active', label: '活跃' },
    { key: 'silent', label: '沉默' },
    { key: 'error',  label: '有错误' },
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
                ? { background: 'rgba(250,255,105,0.08)', border: '1px solid rgba(250,255,105,0.22)', color: 'var(--color-primary)' }
                : { background: 'transparent', border: '1px solid var(--color-border)', color: 'var(--color-muted)' }
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

const STATUS_BORDER: Record<WorkItemStatus, string> = {
  active: 'var(--color-good-text)',
  error:  'var(--color-bad-text)',
  silent: 'rgba(255,255,255,0.10)',
};

// ─── 主页面 ───────────────────────────────────────────────────────────────────

export default function WorkItemsPage() {
  const { profileId } = useShellContext();
  const hiddenMetrics = useProfileHiddenMetrics(profileId);
  const showSddStages = !hiddenMetrics.has('sddStageDots');
  const { data = [], isLoading } = useProfileDemands(profileId);
  const navigate = useNavigate();
  const [search, setSearch]           = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');

  const now = Date.now();

  // ── Section 1: Hero KPI ──────────────────────────────────────────────────

  const total        = data.length;
  const activeItems  = useMemo(() => data.filter((i) => getStatus(i, now) === 'active'), [data, now]);
  const totalDocs    = useMemo(() => data.reduce((s, i) => s + i.artifactCount, 0), [data]);
  const newThisMonth = useMemo(
    () => [...data]
      .filter((i) => i.firstSeenAt && now - new Date(i.firstSeenAt).getTime() < THIRTY_DAYS_MS)
      .sort((a, b) => new Date(b.firstSeenAt!).getTime() - new Date(a.firstSeenAt!).getTime()),
    [data, now],
  );

  // ── Section 2: 需求健康度 ─────────────────────────────────────────────────

  const funnelData = SDD_STAGES.map((s) => ({
    stage: s,
    label: STAGE_LABELS[s],
    count: data.filter((i) => i.coverageStages.includes(s)).length,
  }));
  const funnelMax = Math.max(funnelData[0]?.count ?? 0, 1);

  const domainData = useMemo(() => {
    const map = new Map<string, number>();
    for (const i of data) {
      const key = i.businessDomain ?? '未分类';
      map.set(key, (map.get(key) ?? 0) + 1);
    }
    const sorted = [...map.entries()].sort((a, b) => b[1] - a[1]);
    const top8 = sorted.slice(0, 8);
    const rest = sorted.slice(8).reduce((s, [, v]) => s + v, 0);
    if (rest > 0) top8.push(['其他', rest]);
    const maxVal = Math.max(...top8.map(([, v]) => v), 1);
    return top8.map(([label, value]) => ({ label, value, ratio: value / maxVal }));
  }, [data]);

  // ── Section 3: 标杆需求 ───────────────────────────────────────────────────

  const topItems = useMemo(
    () => [...data].sort((a, b) => b.artifactCount - a.artifactCount).slice(0, 3),
    [data],
  );

  // ── Section 4: 需求一览 ───────────────────────────────────────────────────

  const statusCounts = useMemo(
    () =>
      data.reduce(
        (acc, i) => { acc.all++; acc[getStatus(i, now)]++; return acc; },
        { all: 0, active: 0, silent: 0, error: 0 } as Record<StatusFilter, number>,
      ),
    [data, now],
  );

  const filtered = useMemo(() => {
    return data.filter((item) => {
      if (statusFilter !== 'all' && getStatus(item, now) !== statusFilter) return false;
      if (!search) return true;
      const q = search.toLowerCase();
      return (
        (item.title ?? '').toLowerCase().includes(q) ||
        (item.unitSlug ?? '').toLowerCase().includes(q) ||
        (item.businessDomain ?? '').toLowerCase().includes(q)
      );
    });
  }, [data, statusFilter, search, now]);

  const { pageItems, pageNumber, hasNext, hasPrev, goNext, goPrev, reset } =
    useClientPagination(filtered, PAGE_SIZE);
  const demandTableHeaders = showSddStages
    ? ['需求标题', '业务域', '阶段覆盖', '文档数', '调用次数', '最近更新']
    : ['需求标题', '业务域', '产物类型', '文档数', '调用次数', '最近更新'];
  const demandTableColumnCount = demandTableHeaders.length;

  const handleFilter = (v: StatusFilter) => { setStatusFilter(v); reset(); };
  const handleSearch = (v: string)       => { setSearch(v);       reset(); };

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="grid gap-3">

      {/* ── Section 1: Hero KPI ── */}
      <div className="grid grid-cols-4 gap-3">

        {/* 需求总数 */}
        <section className="flex gap-3 min-h-[98px] p-[14px] rounded-[6px]" style={CARD_STYLE}>
          <div className="grid w-[34px] h-[34px] flex-none place-items-center rounded-[4px]" style={ICON_BOX}>
            <GitBranch size={18} />
          </div>
          <div className="flex flex-col justify-between">
            <span className="text-[12px] text-[var(--color-secondary)]">需求总数</span>
            <strong className="text-[24px] font-semibold text-[#f5f5f5]" style={{ fontFamily: 'var(--font-mono)' }}>
              {isLoading ? '—' : formatInteger(total)}
            </strong>
            <em className="text-[11px] not-italic text-[var(--color-muted)]">全团队累计覆盖需求目录</em>
          </div>
        </section>

        {/* 活跃需求 */}
        <section className="flex gap-3 min-h-[98px] p-[14px] rounded-[6px]" style={CARD_STYLE}>
          <div className="grid w-[34px] h-[34px] flex-none place-items-center rounded-[4px]" style={ICON_BOX}>
            <TrendingDown size={18} />
          </div>
          <div className="flex flex-col justify-between flex-1 min-w-0">
            <span className="text-[12px] text-[var(--color-secondary)]">活跃需求</span>
            <div>
              <div className="flex items-baseline gap-1 mb-[6px]">
                <span className="text-[24px] font-semibold text-[#f5f5f5]" style={{ fontFamily: 'var(--font-mono)' }}>
                  {isLoading ? '—' : activeItems.length}
                </span>
                <span className="text-[15px] text-[var(--color-muted)]" style={{ fontFamily: 'var(--font-mono)' }}>
                  &nbsp;/ {total}
                </span>
              </div>
              <div className="h-[3px] w-full rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.08)' }}>
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{
                    width: total > 0 ? `${(activeItems.length / total) * 100}%` : '0%',
                    background: 'var(--color-good-text)',
                  }}
                />
              </div>
            </div>
            <em className="text-[11px] not-italic text-[var(--color-muted)]">近 14 天有文档更新</em>
          </div>
        </section>

        {/* 文档总产出 */}
        <section className="flex gap-3 min-h-[98px] p-[14px] rounded-[6px]" style={CARD_STYLE}>
          <div className="grid w-[34px] h-[34px] flex-none place-items-center rounded-[4px]" style={ICON_BOX}>
            <FileText size={18} />
          </div>
          <div className="flex flex-col justify-between">
            <span className="text-[12px] text-[var(--color-secondary)]">文档总产出</span>
            <strong
              className="text-[24px] font-semibold"
              style={{ fontFamily: 'var(--font-mono)', color: 'var(--color-primary)' }}
            >
              {isLoading ? '—' : formatInteger(totalDocs)}
            </strong>
            <em className="text-[11px] not-italic text-[var(--color-muted)]">全团队 artifact 累计</em>
          </div>
        </section>

        {/* 本月新增 */}
        <section className="flex gap-3 min-h-[98px] p-[14px] rounded-[6px]" style={CARD_STYLE}>
          <div className="grid w-[34px] h-[34px] flex-none place-items-center rounded-[4px]" style={ICON_BOX}>
            <Sparkles size={18} />
          </div>
          <div className="flex flex-col justify-between flex-1 min-w-0">
            <span className="text-[12px] text-[var(--color-secondary)]">本月新增需求</span>
            <strong className="text-[24px] font-semibold text-[#60a5fa]" style={{ fontFamily: 'var(--font-mono)' }}>
              {isLoading ? '—' : newThisMonth.length}
            </strong>
            <em className="text-[11px] not-italic text-[var(--color-muted)]">30 天内首次出现</em>
          </div>
        </section>
      </div>

      {/* ── Section 2: 需求健康度 ── */}
      <div className="grid grid-cols-3 gap-3">

        {/* 阶段覆盖漏斗 */}
        {showSddStages ? (
        <section className="col-span-2 p-[14px] rounded-[6px]" style={CARD_STYLE}>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2" style={{ color: 'var(--color-primary)' }}>
              <TrendingDown size={18} />
              <h3 className="text-[14px] font-semibold text-[#f5f5f5]">阶段覆盖漏斗</h3>
            </div>
            <span className="text-[11px] text-[var(--color-muted)]">包含该阶段 artifact 的需求数</span>
          </div>
          <div className="flex items-end gap-2" style={{ height: 100 }}>
            {funnelData.map((item, i) => (
              <div key={item.stage} className="flex-1 flex flex-col items-center gap-[6px]">
                <span
                  className="text-[13px] font-semibold text-[#f5f5f5]"
                  style={{ fontFamily: 'var(--font-mono)' }}
                >
                  {isLoading ? '—' : item.count}
                </span>
                <div className="w-full flex flex-col justify-end" style={{ height: 52 }}>
                  <div
                    className="w-full rounded-[3px] transition-all duration-500"
                    style={{
                      height: isLoading ? 4 : Math.max((item.count / funnelMax) * 52, 4),
                      background: `rgba(250,255,105,${1 - i * 0.22})`,
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
        ) : null}

        {/* 业务域分布 */}
        <section className={`${showSddStages ? '' : 'col-span-3'} p-[14px] rounded-[6px]`} style={CARD_STYLE}>
          <div className="flex items-center gap-2 mb-3" style={{ color: 'var(--color-primary)' }}>
            <GitBranch size={18} />
            <h3 className="text-[14px] font-semibold text-[#f5f5f5]">业务域分布</h3>
          </div>
          <BarList items={domainData} emptyText="暂无数据" />
        </section>
      </div>

      {/* ── Section 3: 标杆需求 Top 3 ── */}
      {!isLoading && topItems.length > 0 && (
        <section className="p-[14px] rounded-[6px]" style={CARD_STYLE}>
          <div className="flex items-center gap-2 mb-3">
            <Trophy size={18} style={{ color: 'var(--color-primary)' }} />
            <h3 className="text-[14px] font-semibold text-[#f5f5f5]">标杆需求</h3>
            <span
              className="text-[10px] px-[6px] py-[2px] rounded-full font-medium"
              style={{ color: 'var(--color-primary)', border: '1px solid rgba(250,255,105,0.22)', background: 'rgba(250,255,105,0.06)' }}
            >
              TOP {topItems.length}
            </span>
          </div>
          <div className="grid grid-cols-3 gap-3">
            {topItems.map((item, i) => {
              const coreStages = getCoreStages(item.coverageStages);
              return (
                <div
                  key={item.id}
                  className="flex flex-col gap-2 p-3 rounded-[6px] relative overflow-hidden"
                  style={{ background: 'var(--color-hover)', border: '1px solid var(--color-border)' }}
                >
                  <div className="absolute left-0 top-0 bottom-0 w-[3px]" style={{ background: RANK_COLORS[i] }} />
                  <div
                    className="absolute top-0 right-0 text-[10px] font-bold px-2 py-[3px]"
                    style={{
                      color: i === 0 ? '#0a0a0a' : 'var(--color-surface)',
                      background: RANK_COLORS[i],
                      borderRadius: '0 6px 0 6px',
                    }}
                  >
                    # {i + 1}
                  </div>
                  <div className="pl-[10px] pr-6">
                    <div className="text-[13px] font-medium text-[#f5f5f5] truncate" title={item.title ?? item.unitSlug ?? undefined}>
                      {item.title ?? item.unitSlug}
                    </div>
                    {item.businessDomain && (
                      <span
                        className="inline-block mt-1 text-[10px] px-[6px] py-[1px] rounded-[3px]"
                        style={{ color: '#60a5fa', background: 'rgba(96,165,250,0.08)', border: '1px solid rgba(96,165,250,0.15)' }}
                      >
                        {item.businessDomain}
                      </span>
                    )}
                  </div>
                  {showSddStages ? (
                    <div className="flex items-center gap-[4px] pl-[10px]">
                      {SDD_STAGES.map((s) => (
                        <div
                          key={s}
                          title={STAGE_LABELS[s]}
                          className="rounded-full"
                          style={{
                            width: 7,
                            height: 7,
                            background: item.coverageStages.includes(s)
                              ? STAGE_DOT_COLORS[s]
                              : 'rgba(255,255,255,0.12)',
                          }}
                        />
                      ))}
                      <span className="ml-1 text-[10px] text-[var(--color-muted)]" style={{ fontFamily: 'var(--font-mono)' }}>
                        {coreStages.length}/4
                      </span>
                    </div>
                  ) : (
                    <div className="pl-[10px]"><ArtifactStageChips coverageStages={item.coverageStages} /></div>
                  )}
                  <div className="flex gap-[6px] pl-[10px]">
                    <span
                      className="inline-flex items-center gap-[4px] text-[11px] text-[var(--color-secondary)] px-[6px] py-[2px] rounded-[4px]"
                      style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid var(--color-border)' }}
                    >
                      <FileText size={10} />
                      {item.artifactCount} 篇
                    </span>
                    <span
                      className="inline-flex items-center gap-[4px] text-[11px] text-[var(--color-secondary)] px-[6px] py-[2px] rounded-[4px]"
                      style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid var(--color-border)' }}
                    >
                      <Zap size={10} />
                      {formatInteger(item.capabilityUsageCount)} 次
                    </span>
                  </div>
                  <div className="pl-[10px] text-[11px] text-[var(--color-muted)]">
                    最近 {formatRelativeTime(item.lastSeenAt)}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* ── Section 4: 需求一览 ── */}
      <section className="rounded-[6px]" style={CARD_STYLE}>

        {/* 标题 + 搜索 */}
        <div
          className="flex items-center justify-between gap-3 px-[14px] py-3"
          style={{ borderBottom: '1px solid var(--color-border)' }}
        >
          <div className="flex items-center gap-2" style={{ color: 'var(--color-primary)' }}>
            <GitBranch size={18} />
            <h3 className="text-[14px] font-semibold text-[#f5f5f5]">需求一览</h3>
          </div>
          <div
            className="flex items-center gap-2 h-[28px] px-[10px] w-[260px] rounded-[4px]"
            style={{ border: '1px solid rgba(255,255,255,0.10)', background: 'var(--color-base)' }}
          >
            <Search size={13} className="text-[var(--color-muted)] shrink-0" />
            <input
              className="w-full bg-transparent outline-none text-[12px] text-[var(--color-text)] placeholder:text-[var(--color-muted)]"
              placeholder="搜索需求标题 / slug / 业务域"
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
                {demandTableHeaders.map((h) => (
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
                  <td colSpan={demandTableColumnCount} className="py-10 text-center text-[12px] text-[var(--color-muted)]">
                    {search ? '无匹配需求' : '暂无数据'}
                  </td>
                </tr>
              ) : (
                pageItems.map((item) => {
                  const status = getStatus(item, now);
                  return (
                    <tr
                      key={item.id}
                      className="group cursor-pointer"
                      style={{ borderBottom: '1px solid var(--color-border)' }}
                      onClick={() => navigate(`/sdd/work-items/${item.id}`)}
                    >
                      {/* 需求标题 */}
                      <td
                        className="py-[10px] group-hover:bg-[#171717] transition-colors relative"
                        style={{ paddingLeft: 20, paddingRight: 12 }}
                      >
                        <div
                          className="absolute left-0 top-0 bottom-0 w-[3px]"
                          style={{ background: STATUS_BORDER[status] }}
                        />
                        <div className="flex flex-col gap-[2px]">
                          <span className="text-[13px] font-medium text-[#f5f5f5] truncate max-w-[220px]">
                            {item.title ?? item.unitSlug}
                          </span>
                          {item.title && (
                            <span className="text-[10px] text-[var(--color-muted)] truncate max-w-[220px]" style={{ fontFamily: 'var(--font-mono)' }}>
                              {item.unitSlug}
                            </span>
                          )}
                        </div>
                      </td>
                      {/* 业务域 */}
                      <td className="px-[12px] py-[10px] group-hover:bg-[#171717] transition-colors">
                        {item.businessDomain ? (
                          <span
                            className="text-[10px] px-[7px] py-[2px] rounded-[3px]"
                            style={{ color: 'var(--color-secondary)', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.10)' }}
                          >
                            {item.businessDomain}
                          </span>
                        ) : (
                          <span className="text-[12px] text-[var(--color-muted)]">—</span>
                        )}
                      </td>
                      {/* 阶段覆盖 / 产物类型 */}
                      <td className="px-[12px] py-[10px] group-hover:bg-[#171717] transition-colors">
                        {showSddStages ? (
                          <StageDots coverageStages={item.coverageStages} />
                        ) : (
                          <ArtifactStageChips coverageStages={item.coverageStages} />
                        )}
                      </td>
                      {/* 文档数 */}
                      <td className="px-[12px] py-[10px] group-hover:bg-[#171717] transition-colors text-right">
                        {item.artifactCount > 0 ? (
                          <span className="text-[13px] text-[#f5f5f5]" style={{ fontFamily: 'var(--font-mono)' }}>
                            {item.artifactCount}
                          </span>
                        ) : (
                          <span className="text-[12px] text-[var(--color-muted)]">—</span>
                        )}
                      </td>
                      {/* 调用次数 */}
                      <td className="px-[12px] py-[10px] group-hover:bg-[#171717] transition-colors text-right">
                        {item.capabilityUsageCount > 0 ? (
                          <span className="text-[12px] text-[var(--color-secondary)]" style={{ fontFamily: 'var(--font-mono)' }}>
                            {formatInteger(item.capabilityUsageCount)}
                          </span>
                        ) : (
                          <span className="text-[12px] text-[var(--color-muted)]">—</span>
                        )}
                      </td>
                      {/* 最近更新 */}
                      <td className="px-[12px] py-[10px] group-hover:bg-[#171717] transition-colors">
                        <div className="flex flex-col gap-[2px]">
                          <span className="text-[12px] text-[var(--color-secondary)]">
                            {formatRelativeTime(item.lastSeenAt)}
                          </span>
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

        {/* Footer */}
        <div
          className="flex items-center justify-between px-[14px] py-[10px]"
          style={{ borderTop: '1px solid var(--color-border)' }}
        >
          <span className="text-[11px] text-[var(--color-muted)]">共 {filtered.length} 个需求</span>
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
