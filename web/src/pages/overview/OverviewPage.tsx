import { useMemo } from 'react';
import {
  BookOpen,
  Code2,
  FilePen,
  FileText,
  GitBranch,
  Layers3,
  TrendingDown,
  UserRound,
  Zap,
} from 'lucide-react';
import { FeatureGate } from '@/components/profiles/FeatureGate';
import { useShellContext } from '@/components/layout/useShellContext';
import { timeRangeToFromIso } from '@/lib/timeRange';
import {
  useProfileOverview,
  useProfileCapabilityAnalytics,
  useProfileUsers,
  useProfileDemands,
  useProfilePresentationModel,
} from '@/pages/profiles/useProfiles';
import { formatInteger, formatPercent, formatRelativeTime } from '@/lib/format';
import type { ProfileStageDescriptor } from '@sdd-telemetry/api';

// ─── constants ────────────────────────────────────────────────────────────────

const SEVEN_DAYS_MS  = 7  * 86_400_000;
const FOURTEEN_DAYS_MS = 14 * 86_400_000;

const CARD = { border: '1px solid var(--color-border)', background: 'var(--color-surface)' };
const ICON_BOX = { background: '#141409', color: 'var(--color-primary)' };
const AVATAR_COLORS = ['#1a2a1a', '#1a1a2a', '#2a1a1a', '#1a2a2a', '#2a2a1a', '#251a25'];

// ─── helpers ──────────────────────────────────────────────────────────────────

type MetricPair = { current: number | null; previous: number | null };

function deltaLabel(m: MetricPair | undefined): string {
  if (!m || m.current == null || m.previous == null) return '较上周期 —';
  if (m.previous === 0) return m.current > 0 ? '较上周期 新增' : '较上周期 —';
  if (m.previous === m.current) return '较上周期 持平';
  const d = (m.current - m.previous) / m.previous;
  return `${d > 0 ? '↑' : '↓'} ${formatPercent(Math.abs(d))}`;
}

function deltaColor(m: MetricPair | undefined): string {
  if (!m || m.current == null || m.previous == null || m.previous === m.current) {
    return 'var(--color-muted)';
  }
  if (m.previous === 0 && m.current > 0) return 'var(--color-muted)';
  return m.current > m.previous ? 'var(--color-good-text)' : 'var(--color-bad-text)';
}

function UserAvatar({ name, size = 28 }: { name: string | null | undefined; size?: number }) {
  const idx = (name?.charCodeAt(0) ?? 0) % AVATAR_COLORS.length;
  return (
    <div
      style={{
        width: size, height: size, fontSize: Math.round(size * 0.42),
        background: AVATAR_COLORS[idx], color: '#f5f5f5', fontWeight: 600,
        border: '1px solid rgba(255,255,255,0.08)', borderRadius: '50%',
        display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
      }}
    >
      {name ? name.slice(0, 1) : '?'}
    </div>
  );
}

function getCoverageDepth(coverageStages: string[], stages: ProfileStageDescriptor[]): number {
  return stages.filter((stage) => coverageStages.includes(stage.code)).length;
}

function ArtifactStageChips({
  coverageStages,
  stages,
}: {
  coverageStages: string[];
  stages: ProfileStageDescriptor[];
}) {
  if (coverageStages.length === 0) {
    return <span className="text-[12px] text-[var(--color-muted)]">—</span>;
  }
  const known = stages.filter((stage) => coverageStages.includes(stage.code));
  const knownCodes = new Set(known.map((stage) => stage.code));
  const unknown = coverageStages.filter((stage) => !knownCodes.has(stage));
  const chips = [
    ...known.map((stage) => ({ code: stage.code, label: stage.label })),
    ...unknown.map((stage) => ({ code: stage, label: stage })),
  ];

  return (
    <div className="flex flex-wrap gap-[4px]">
      {chips.slice(0, 3).map((stage) => (
        <span
          key={stage.code}
          className="text-[10px] px-[6px] py-[1px] rounded-[3px] text-[var(--color-secondary)]"
          style={{ border: '1px solid var(--color-border)', background: 'rgba(255,255,255,0.04)' }}
        >
          {stage.label}
        </span>
      ))}
      {chips.length > 3 ? (
        <span className="text-[10px] text-[var(--color-muted)]">+{chips.length - 3}</span>
      ) : null}
    </div>
  );
}

// ─── page ─────────────────────────────────────────────────────────────────────

export default function OverviewPage() {
  const { timeRange, profileId } = useShellContext();
  const presentation = useProfilePresentationModel(profileId);
  const artifactStages = presentation.stages.artifactStages;
  const maturityStages = presentation.stages.maturityStages;
  const showCoverageFunnel = presentation.widgets.artifactCoverageFunnel !== 'none' && artifactStages.length > 0;
  const isSddStageFunnel = presentation.widgets.artifactCoverageFunnel === 'sdd_stage';
  const showUserMaturity = presentation.widgets.userMaturity !== 'none' && maturityStages.length > 0;
  const showMultiStage = presentation.widgets.multiStageDeliveryUnit;
  const fromIso = timeRangeToFromIso(timeRange);
  const analyticsQuery  = useProfileCapabilityAnalytics(profileId, fromIso);
  const usersQuery      = useProfileUsers(profileId, { fromIso, pageSize: 200 });
  const demandsQuery    = useProfileDemands(profileId, fromIso);
  const profileOverview = useProfileOverview(profileId, fromIso).data;

  const analytics   = analyticsQuery.data;
  const kpis        = analytics?.kpis;
  const topSkills   = analytics?.topCapabilities.slice(0, 8) ?? [];
  const skillsMax   = Math.max(topSkills[0]?.usageCount ?? 1, 1);

  const now = Date.now();
  const users     = usersQuery.data?.items ?? [];
  const demands   = demandsQuery.data ?? [];

  const recentUsers = useMemo(
    () =>
      [...users]
        .sort((a, b) => (b.lastSeenAt ?? '').localeCompare(a.lastSeenAt ?? ''))
        .slice(0, 8),
    [users],
  );

  const funnel = useMemo(
    () => artifactStages.map((stage) => ({
      stage: stage.code,
      label: stage.label,
      count: demands.filter((i) => i.coverageStages.includes(stage.code)).length,
    })),
    [artifactStages, demands],
  );
  const funnelMax = Math.max(funnel[0]?.count ?? 0, 1);

  const recentWorkItems = useMemo(
    () =>
      [...demands]
        .sort((a, b) => (b.lastSeenAt ?? '').localeCompare(a.lastSeenAt ?? ''))
        .slice(0, 8),
    [demands],
  );

  const totalDocs = useMemo(() => demands.reduce((s, i) => s + i.artifactCount, 0), [demands]);

  return (
    <>
      {/* ── keyframes ── */}
      <style>{`
        @keyframes ov-fade-up {
          from { opacity: 0; transform: translateY(7px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes ov-bar-h {
          from { height: 0 !important; }
        }
        @keyframes ov-bar-w {
          from { width: 0 !important; }
        }
      `}</style>

      <div className="grid gap-3">

        {/* ── Section 1: KPI 卡 ── */}
        <div className={`grid ${showMultiStage ? 'grid-cols-4' : 'grid-cols-3'} gap-3`}>
          <KpiCard
            icon={<Zap size={18} />}
            label={`${presentation.labels.capabilitySingular}调用量`}
            value={profileOverview?.capabilityUsageCount ?? kpis?.capabilityUsageCount.current ?? null}
            metric={kpis?.capabilityUsageCount}
            loading={analyticsQuery.isLoading}
          />
          <KpiCard
            icon={<UserRound size={18} />}
            label="活跃用户"
            value={profileOverview?.activeUserCount ?? kpis?.activeUserCount.current ?? null}
            metric={kpis?.activeUserCount}
            loading={analyticsQuery.isLoading}
          />
          <KpiCard
            icon={<GitBranch size={18} />}
            label={`覆盖${presentation.labels.deliveryUnitSingular}`}
            value={profileOverview?.deliveryUnitCount ?? kpis?.coveredDeliveryUnitCount.current ?? null}
            metric={kpis?.coveredDeliveryUnitCount}
            loading={analyticsQuery.isLoading}
          />
          {showMultiStage ? (
            <KpiCard
              icon={<FileText size={18} />}
              label={isSddStageFunnel ? `全链路${presentation.labels.deliveryUnitSingular}` : `多类型${presentation.labels.deliveryUnitSingular}`}
              value={kpis?.multiStageDeliveryUnitCount.current ?? null}
              metric={kpis?.multiStageDeliveryUnitCount}
              hint={`覆盖 ≥ 3 个${isSddStageFunnel ? 'SDD 阶段' : '产物类型'}`}
              loading={analyticsQuery.isLoading}
            />
          ) : null}
        </div>

        {/* ── 知识库 / 代码概况（Profile Contract 指标，按 manifest 降级）── */}
        <div className="grid grid-cols-3 gap-3">
          <FeatureGate capability="knowledgeRecalls">
            <KpiCard
              icon={<BookOpen size={18} />}
              label="知识库读取"
              value={profileOverview?.knowledgeRecallCount ?? null}
              metric={undefined}
              hint="本 profile 累计"
              loading={false}
            />
          </FeatureGate>
          <FeatureGate capability="codeChanges">
            <KpiCard
              icon={<Code2 size={18} />}
              label="代码读取"
              value={profileOverview?.codeReadCount ?? null}
              metric={undefined}
              hint="本 profile 累计"
              loading={false}
            />
          </FeatureGate>
          <FeatureGate capability="codeChanges">
            <KpiCard
              icon={<FilePen size={18} />}
              label="代码写入"
              value={profileOverview?.codeWriteCount ?? null}
              metric={undefined}
              hint="本 profile 累计"
              loading={false}
            />
          </FeatureGate>
        </div>

        {/* ── Section 2: 成员概况 + 覆盖漏斗 ── */}
        <div className="grid grid-cols-12 gap-3">

          {/* 成员概况 */}
          <section className={`${showCoverageFunnel ? 'col-span-7' : 'col-span-12'} rounded-[6px] overflow-hidden`} style={CARD}>
            <SectionHeader icon={<UserRound size={16} />} title="成员概况">
              <span
                className="text-[11px] px-[7px] py-[2px] rounded-full"
                style={{
                  color: 'var(--color-primary)',
                  background: 'rgba(250,255,105,0.07)',
                  border: '1px solid rgba(250,255,105,0.18)',
                  fontFamily: 'var(--font-mono)',
                }}
              >
                {users.length} 人
              </span>
            </SectionHeader>

            <table className="w-full" style={{ borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  {(showUserMaturity ? ['成员', '工作项', '成熟度', '最近活跃'] : ['成员', '工作项', '最近活跃']).map((h) => (
                    <th
                      key={h}
                      className="px-[12px] py-[7px] text-left text-[10px] font-bold uppercase tracking-wide text-[var(--color-muted)] whitespace-nowrap"
                      style={{ background: '#111', borderBottom: '1px solid var(--color-border)' }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {recentUsers.length === 0 ? (
                  <tr>
                    <td colSpan={showUserMaturity ? 4 : 3} className="py-8 text-center text-[12px] text-[var(--color-muted)]">
                      {usersQuery.isLoading ? '加载中…' : '暂无数据'}
                    </td>
                  </tr>
                ) : (
                  recentUsers.map((u, idx) => {
                    const active = u.lastSeenAt && now - new Date(u.lastSeenAt).getTime() <= SEVEN_DAYS_MS;
                    const isNew  = u.firstSeenAt && now - new Date(u.firstSeenAt).getTime() < FOURTEEN_DAYS_MS;
                    const borderColor = isNew ? '#60a5fa' : active ? 'var(--color-good-text)' : 'rgba(255,255,255,0.08)';
                    const depth = getCoverageDepth(u.capabilityStages, maturityStages);
                    return (
                      <tr
                        key={u.id}
                        className="group"
                        style={{
                          borderBottom: '1px solid var(--color-border)',
                          animation: `ov-fade-up 0.22s ease-out ${idx * 0.04}s both`,
                        }}
                      >
                        {/* 成员 */}
                        <td
                          className="group-hover:bg-[var(--color-hover)] transition-colors"
                          style={{ paddingLeft: 20, paddingRight: 12, paddingTop: 9, paddingBottom: 9, position: 'relative' }}
                        >
                          <div
                            style={{
                              position: 'absolute', left: 0, top: 0, bottom: 0, width: 3,
                              background: borderColor,
                            }}
                          />
                          <div className="flex items-center gap-2">
                            <UserAvatar name={u.displayName} size={26} />
                            <div className="flex flex-col gap-[1px] min-w-0">
                              <span className="text-[12px] font-medium text-[#f5f5f5] truncate max-w-[130px]">
                                {u.displayName ?? u.userKey}
                              </span>
                              {isNew && (
                                <span
                                  className="text-[9px] px-[5px] py-[1px] rounded-full w-fit"
                                  style={{ color: '#60a5fa', background: 'rgba(96,165,250,0.10)', border: '1px solid rgba(96,165,250,0.18)' }}
                                >
                                  新成员
                                </span>
                              )}
                            </div>
                          </div>
                        </td>
                        {/* 工作项 */}
                        <td
                          className="px-[12px] group-hover:bg-[var(--color-hover)] transition-colors"
                          style={{ paddingTop: 9, paddingBottom: 9, width: 80 }}
                        >
                          {u.deliveryUnitCount > 0 ? (
                            <div className="flex flex-col gap-[2px]">
                              <span className="text-[13px] font-semibold text-[#f5f5f5]" style={{ fontFamily: 'var(--font-mono)' }}>
                                {u.deliveryUnitCount}
                              </span>
                              <div
                                className="h-[2px] rounded-full overflow-hidden"
                                style={{ background: 'rgba(255,255,255,0.07)', width: 36 }}
                              >
                                <div
                                  style={{
                                    height: '100%',
                                    width: `${Math.min((u.deliveryUnitCount / Math.max(...recentUsers.map((x) => x.deliveryUnitCount), 1)) * 100, 100)}%`,
                                    background: 'var(--color-primary)',
                                    borderRadius: 2,
                                  }}
                                />
                              </div>
                            </div>
                          ) : (
                            <span className="text-[12px] text-[var(--color-muted)]">—</span>
                          )}
                        </td>
                        {showUserMaturity ? (
                          <td
                            className="px-[12px] group-hover:bg-[var(--color-hover)] transition-colors"
                            style={{ paddingTop: 9, paddingBottom: 9, width: 100 }}
                          >
                            <div className="flex items-center gap-[5px]">
                              {maturityStages.map((stage, i) => (
                                <div
                                  key={stage.code}
                                  className="rounded-full"
                                  title={stage.label}
                                  style={{
                                    width: 7, height: 7,
                                    background: i < depth ? 'var(--color-primary)' : 'rgba(255,255,255,0.10)',
                                  }}
                                />
                              ))}
                              <span
                                className="text-[10px] text-[var(--color-muted)] ml-[2px]"
                                style={{ fontFamily: 'var(--font-mono)' }}
                              >
                                {depth}/{maturityStages.length}
                              </span>
                            </div>
                          </td>
                        ) : null}
                        {/* 最近活跃 */}
                        <td
                          className="px-[12px] group-hover:bg-[var(--color-hover)] transition-colors"
                          style={{ paddingTop: 9, paddingBottom: 9 }}
                        >
                          <span className="text-[12px] text-[var(--color-secondary)] whitespace-nowrap">
                            {formatRelativeTime(u.lastSeenAt)}
                          </span>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>

            <div
              className="flex items-center justify-between px-[14px] py-[8px]"
              style={{ borderTop: '1px solid var(--color-border)' }}
            >
              <span className="text-[11px] text-[var(--color-muted)]">
                {presentation.labels.artifactSingular}总产出&ensp;
                <strong className="text-[#f5f5f5]" style={{ fontFamily: 'var(--font-mono)' }}>
                  {demandsQuery.isLoading ? '—' : formatInteger(totalDocs)}
                </strong>
                &ensp;个
              </span>
              <span className="text-[11px] text-[var(--color-muted)]">
                近7天活跃&ensp;
                <strong className="text-[#f5f5f5]" style={{ fontFamily: 'var(--font-mono)' }}>
                  {usersQuery.isLoading ? '—' : users.filter((u) => u.lastSeenAt && now - new Date(u.lastSeenAt).getTime() <= SEVEN_DAYS_MS).length}
                </strong>
                &ensp;人
              </span>
            </div>
          </section>

          {/* 链路 / 类型覆盖 */}
          {showCoverageFunnel ? (
          <section className="col-span-5 p-[14px] rounded-[6px]" style={CARD}>
            <SectionHeader icon={<TrendingDown size={16} />} title={isSddStageFunnel ? 'SDD 链路覆盖' : '产物类型覆盖'}>
              <span className="text-[11px] text-[var(--color-muted)]">
                包含该{isSddStageFunnel ? '阶段' : '类型'}的{presentation.labels.deliveryUnitSingular}数
              </span>
            </SectionHeader>

            <div className="flex items-end gap-[10px] mt-4" style={{ height: 100 }}>
              {funnel.map((item, i) => {
                const barH = demandsQuery.isLoading || item.count === 0
                  ? 3
                  : Math.max((item.count / funnelMax) * 76, 4);
                return (
                  <div key={item.stage} className="flex-1 flex flex-col items-center gap-[5px]">
                    <span
                      className="text-[13px] font-semibold text-[#f5f5f5]"
                      style={{ fontFamily: 'var(--font-mono)' }}
                    >
                      {demandsQuery.isLoading ? '—' : item.count}
                    </span>
                    <div className="w-full flex flex-col justify-end" style={{ height: 76 }}>
                      <div
                        style={{
                          height: barH,
                          background: `rgba(250,255,105,${1 - i * 0.22})`,
                          borderRadius: 3,
                          animation: demandsQuery.data
                            ? `ov-bar-h 0.55s cubic-bezier(.22,.68,0,1.2) ${i * 0.09}s both`
                            : 'none',
                        }}
                      />
                    </div>
                    <span
                      className="text-[10px] text-[var(--color-muted)] text-center whitespace-nowrap"
                      style={{ lineHeight: 1.3 }}
                    >
                      {item.label}
                    </span>
                  </div>
                );
              })}
            </div>

            <div
              className="grid grid-cols-2 gap-x-4 gap-y-[6px] mt-4 pt-[12px]"
              style={{ borderTop: '1px solid var(--color-border)' }}
            >
              {[
                { label: `总${presentation.labels.deliveryUnitSingular}数`, value: demands.length },
                { label: `活跃${presentation.labels.deliveryUnitSingular}`, value: demands.filter((i) => i.lastSeenAt && now - new Date(i.lastSeenAt).getTime() <= FOURTEEN_DAYS_MS).length },
                { label: isSddStageFunnel ? '全阶段覆盖' : '全类型覆盖', value: demands.filter((i) => artifactStages.every((stage) => i.coverageStages.includes(stage.code))).length },
                { label: '有错误', value: demands.filter((i) => i.errorCount > 0).length },
              ].map(({ label, value }) => (
                <div key={label} className="flex items-center justify-between">
                  <span className="text-[11px] text-[var(--color-muted)]">{label}</span>
                  <span className="text-[12px] text-[var(--color-secondary)]" style={{ fontFamily: 'var(--font-mono)' }}>
                    {demandsQuery.isLoading ? '—' : value}
                  </span>
                </div>
              ))}
            </div>
          </section>
          ) : null}
        </div>

        {/* ── Section 3: 热门能力 + 最近活跃交付单元 ── */}
        <div className="grid grid-cols-2 gap-3">

          {/* 热门能力 */}
          <section className="rounded-[6px] overflow-hidden" style={CARD}>
            <SectionHeader icon={<Layers3 size={16} />} title={`热门${presentation.labels.capabilityPlural}`}>
              <span className="text-[11px] text-[var(--color-muted)]">近 {timeRange}</span>
            </SectionHeader>

            <div className="px-[14px] pt-[10px] pb-[12px] grid gap-[7px]">
              {analyticsQuery.isLoading ? (
                <div className="py-8 text-center text-[12px] text-[var(--color-muted)]">加载中…</div>
              ) : topSkills.length === 0 ? (
                <div className="py-8 text-center text-[12px] text-[var(--color-muted)]">暂无数据</div>
              ) : (
                topSkills.map((skill, idx) => {
                  const barPct = (skill.usageCount / skillsMax) * 100;
                  return (
                    <div
                      key={skill.capabilityCode}
                      className="flex items-center gap-[10px]"
                      style={{ animation: `ov-fade-up 0.2s ease-out ${idx * 0.045}s both` }}
                    >
                      <span
                        className="text-[10px] font-bold w-[16px] text-right shrink-0"
                        style={{ fontFamily: 'var(--font-mono)', color: 'var(--color-muted)' }}
                      >
                        {idx + 1}
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between mb-[4px]">
                          <span
                            className="text-[12px] font-medium text-[#f5f5f5] truncate max-w-[180px]"
                            title={skill.displayName}
                          >
                            {skill.displayName}
                          </span>
                          <div className="flex items-center gap-[8px] shrink-0 ml-2">
                            <span
                              className="text-[11px] text-[var(--color-secondary)]"
                              style={{ fontFamily: 'var(--font-mono)' }}
                            >
                              {formatInteger(skill.usageCount)} 次
                            </span>
                            <span className="text-[10px] text-[var(--color-muted)]">
                              {skill.userCount} 人
                            </span>
                          </div>
                        </div>
                        <div
                          className="h-[3px] rounded-full overflow-hidden"
                          style={{ background: 'rgba(255,255,255,0.07)' }}
                        >
                          <div
                            style={{
                              height: '100%',
                              width: `${barPct}%`,
                              background: idx === 0
                                ? 'var(--color-primary)'
                                : idx <= 2
                                  ? 'rgba(250,255,105,0.55)'
                                  : 'rgba(250,255,105,0.28)',
                              borderRadius: 2,
                              animation: analyticsQuery.data
                                ? `ov-bar-w 0.5s cubic-bezier(.22,.68,0,1.1) ${idx * 0.06}s both`
                                : 'none',
                            }}
                          />
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </section>

          {/* 最近活跃交付单元 */}
          <section className="rounded-[6px] overflow-hidden" style={CARD}>
            <SectionHeader icon={<GitBranch size={16} />} title={`最近活跃${presentation.labels.deliveryUnitSingular}`} />

            <table className="w-full" style={{ borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  {[
                    presentation.labels.deliveryUnitSingular,
                    isSddStageFunnel ? '阶段覆盖' : '产物类型',
                    presentation.labels.artifactSingular,
                    '最近更新',
                  ].map((h) => (
                    <th
                      key={h}
                      className="px-[12px] py-[7px] text-left text-[10px] font-bold uppercase tracking-wide text-[var(--color-muted)] whitespace-nowrap"
                      style={{ background: '#111', borderBottom: '1px solid var(--color-border)' }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {recentWorkItems.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="py-8 text-center text-[12px] text-[var(--color-muted)]">
                      {demandsQuery.isLoading ? '加载中…' : '暂无数据'}
                    </td>
                  </tr>
                ) : (
                  recentWorkItems.map((item, idx) => {
                    const isActive = item.lastSeenAt && now - new Date(item.lastSeenAt).getTime() <= FOURTEEN_DAYS_MS;
                    const hasError = item.errorCount > 0;
                    const leftColor = hasError
                      ? 'var(--color-bad-text)'
                      : isActive
                        ? 'var(--color-good-text)'
                        : 'rgba(255,255,255,0.08)';
                    const depth = getCoverageDepth(item.coverageStages, artifactStages);
                    return (
                      <tr
                        key={item.id}
                        className="group"
                        style={{
                          borderBottom: '1px solid var(--color-border)',
                          animation: `ov-fade-up 0.22s ease-out ${idx * 0.04}s both`,
                        }}
                      >
                        {/* 交付单元 */}
                        <td
                          className="group-hover:bg-[var(--color-hover)] transition-colors"
                          style={{ paddingLeft: 20, paddingRight: 12, paddingTop: 8, paddingBottom: 8, position: 'relative', maxWidth: 0 }}
                        >
                          <div
                            style={{
                              position: 'absolute', left: 0, top: 0, bottom: 0, width: 3,
                              background: leftColor,
                            }}
                          />
                          <div className="flex flex-col gap-[1px]">
                            <span
                              className="text-[12px] font-medium text-[#f5f5f5] truncate"
                              style={{ maxWidth: 160 }}
                              title={item.title ?? item.unitSlug ?? undefined}
                            >
                              {item.title ?? item.unitSlug}
                            </span>
                            {item.businessDomain && (
                              <span
                                className="text-[9px] px-[5px] py-[1px] rounded-[3px] w-fit truncate"
                                style={{
                                  color: 'var(--color-secondary)',
                                  background: 'rgba(255,255,255,0.05)',
                                  border: '1px solid rgba(255,255,255,0.08)',
                                  maxWidth: 130,
                                }}
                              >
                                {item.businessDomain}
                              </span>
                            )}
                          </div>
                        </td>
                        {/* 阶段覆盖 / 产物类型 */}
                        <td
                          className="px-[12px] group-hover:bg-[var(--color-hover)] transition-colors"
                          style={{ paddingTop: 8, paddingBottom: 8, width: 80 }}
                        >
                          {isSddStageFunnel ? (
                            <div className="flex items-center gap-[4px]">
                              {artifactStages.map((stage) => (
                                <div
                                  key={stage.code}
                                  title={stage.label}
                                  style={{
                                    width: 6, height: 6, borderRadius: '50%',
                                    background: item.coverageStages.includes(stage.code)
                                      ? 'var(--color-primary)'
                                      : 'rgba(255,255,255,0.10)',
                                  }}
                                />
                              ))}
                              <span
                                className="text-[10px] text-[var(--color-muted)] ml-[2px]"
                                style={{ fontFamily: 'var(--font-mono)' }}
                              >
                                {depth}/{artifactStages.length}
                              </span>
                            </div>
                          ) : (
                            <ArtifactStageChips coverageStages={item.coverageStages} stages={artifactStages} />
                          )}
                        </td>
                        {/* 产物数 */}
                        <td
                          className="px-[12px] group-hover:bg-[var(--color-hover)] transition-colors text-right"
                          style={{ paddingTop: 8, paddingBottom: 8, width: 56 }}
                        >
                          {item.artifactCount > 0 ? (
                            <span
                              className="text-[13px] font-semibold text-[#f5f5f5]"
                              style={{ fontFamily: 'var(--font-mono)' }}
                            >
                              {item.artifactCount}
                            </span>
                          ) : (
                            <span className="text-[12px] text-[var(--color-muted)]">—</span>
                          )}
                        </td>
                        {/* 最近更新 */}
                        <td
                          className="px-[12px] group-hover:bg-[var(--color-hover)] transition-colors"
                          style={{ paddingTop: 8, paddingBottom: 8 }}
                        >
                          <span className="text-[12px] text-[var(--color-secondary)] whitespace-nowrap">
                            {formatRelativeTime(item.lastSeenAt)}
                          </span>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </section>
        </div>

      </div>
    </>
  );
}

// ─── KpiCard ──────────────────────────────────────────────────────────────────

function KpiCard({
  icon,
  label,
  value,
  metric,
  hint,
  loading,
}: {
  icon: React.ReactNode;
  label: string;
  value: number | null;
  metric: MetricPair | undefined;
  hint?: string;
  loading: boolean;
}) {
  const color  = deltaColor(metric);
  const dl     = hint ?? deltaLabel(metric);
  const isUp   = metric && metric.current != null && metric.previous != null && metric.current > metric.previous;
  const isDown = metric && metric.current != null && metric.previous != null && metric.current < metric.previous;

  return (
    <section
      className="flex gap-3 min-h-[100px] p-[14px] rounded-[6px] cursor-default transition-transform duration-150 hover:-translate-y-[1px]"
      style={{
        border: isUp
          ? '1px solid rgba(34,197,94,0.20)'
          : isDown
            ? '1px solid rgba(255,180,171,0.18)'
            : '1px solid var(--color-border)',
        background: 'var(--color-surface)',
      }}
    >
      <div className="grid w-[34px] h-[34px] flex-none place-items-center rounded-[4px]" style={ICON_BOX}>
        {icon}
      </div>
      <div className="flex flex-col justify-between flex-1 min-w-0">
        <span className="text-[12px] text-[var(--color-secondary)]">{label}</span>
        <strong
          className="text-[28px] font-semibold text-[#f5f5f5] leading-none"
          style={{ fontFamily: 'var(--font-mono)' }}
        >
          {loading || value == null ? '—' : formatInteger(value)}
        </strong>
        <em className="text-[11px] not-italic" style={{ color }}>
          {dl}
        </em>
      </div>
    </section>
  );
}

// ─── SectionHeader ────────────────────────────────────────────────────────────

function SectionHeader({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  children?: React.ReactNode;
}) {
  return (
    <div
      className="flex items-center justify-between px-[14px] py-[10px]"
      style={{ borderBottom: '1px solid var(--color-border)' }}
    >
      <div className="flex items-center gap-[7px]" style={{ color: 'var(--color-primary)' }}>
        {icon}
        <h3 className="text-[13px] font-semibold text-[#f5f5f5]">{title}</h3>
      </div>
      {children}
    </div>
  );
}
