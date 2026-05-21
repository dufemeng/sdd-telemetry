import { Bot, GitBranch, Layers3, Layers, MousePointerClick, UserRound } from 'lucide-react';
import type { TimeRange } from '@/components/layout/TopBar';
import { StatCard } from '@/components/ui/StatCard';
import { formatInteger, formatPercent } from '@/lib/format';
import { useSkillAnalytics } from './hooks/useSkillAnalytics';

interface Metric {
  current: number | null;
  previous: number | null;
}

interface HeroKpiRowProps {
  timeRange: TimeRange;
}

export function HeroKpiRow({ timeRange }: HeroKpiRowProps) {
  const query = useSkillAnalytics(timeRange);
  const kpis = query.data?.kpis;

  return (
    <div className="grid grid-cols-3 gap-3 2xl:grid-cols-6">
      <StatCard
        icon={<Layers3 size={18} />}
        label="技能调用数"
        value={formatInteger(kpis?.skillUsageCount.current)}
        hint={deltaHint(kpis?.skillUsageCount)}
        loading={query.isLoading}
      />
      <StatCard
        icon={<UserRound size={18} />}
        label="活跃用户"
        value={formatInteger(kpis?.activeUserCount.current)}
        hint={deltaHint(kpis?.activeUserCount)}
        loading={query.isLoading}
      />
      <StatCard
        icon={<GitBranch size={18} />}
        label="覆盖工作项"
        value={formatInteger(kpis?.coveredWorkItemCount.current)}
        hint={deltaHint(kpis?.coveredWorkItemCount)}
        loading={query.isLoading}
      />
      <StatCard
        icon={<MousePointerClick size={18} />}
        label="用户触发"
        value={formatInteger(kpis?.userTriggeredCount.current)}
        hint={shareHint(kpis?.userTriggeredCount, kpis?.skillUsageCount.current, '占总调用')}
        loading={query.isLoading}
      />
      <StatCard
        icon={<Bot size={18} />}
        label="自动触发"
        value={formatInteger(kpis?.autoTriggeredCount.current)}
        hint={shareHint(kpis?.autoTriggeredCount, kpis?.skillUsageCount.current, '占总调用')}
        loading={query.isLoading}
      />
      <StatCard
        icon={<Layers size={18} />}
        label="多阶段需求"
        value={formatInteger(kpis?.multiStageWorkItemCount.current)}
        hint="覆盖 ≥3 个 SDD 阶段"
        loading={query.isLoading}
      />
    </div>
  );
}

function deltaHint(metric: Metric | undefined): string {
  if (!metric || metric.previous == null || metric.current == null) {
    return '较上周期 —';
  }
  if (metric.previous === 0 && metric.current > 0) {
    return '较上周期 新增';
  }
  if (metric.previous === 0) {
    return '较上周期 持平';
  }
  const delta = (metric.current - metric.previous) / metric.previous;
  if (delta === 0) {
    return '较上周期 持平';
  }
  const sign = delta > 0 ? '↑' : '↓';
  return `较上周期 ${sign} ${formatPercent(Math.abs(delta))}`;
}

function shareHint(
  metric: Metric | undefined,
  total: number | null | undefined,
  suffix: string,
): string {
  if (!metric || metric.current == null || total == null || total === 0) {
    return `${suffix} —`;
  }
  return `${suffix} ${formatPercent(metric.current / total)}`;
}
