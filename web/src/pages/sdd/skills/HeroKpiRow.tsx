import { CheckSquare, GitBranch, Layers3, UserRound, Workflow, Tag } from 'lucide-react';
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
        icon={<Workflow size={18} />}
        label="交互总数"
        value={formatInteger(kpis?.interactionCount.current)}
        hint={deltaHint(kpis?.interactionCount, 'integer')}
        loading={query.isLoading}
      />
      <StatCard
        icon={<Layers3 size={18} />}
        label="技能调用数"
        value={formatInteger(kpis?.skillUsageCount.current)}
        hint={deltaHint(kpis?.skillUsageCount, 'integer')}
        loading={query.isLoading}
      />
      <StatCard
        icon={<UserRound size={18} />}
        label="活跃用户"
        value={formatInteger(kpis?.activeUserCount.current)}
        hint={deltaHint(kpis?.activeUserCount, 'integer')}
        loading={query.isLoading}
      />
      <StatCard
        icon={<GitBranch size={18} />}
        label="覆盖工作项"
        value={formatInteger(kpis?.coveredWorkItemCount.current)}
        hint={deltaHint(kpis?.coveredWorkItemCount, 'integer')}
        loading={query.isLoading}
      />
      <StatCard
        icon={<CheckSquare size={18} />}
        label="配对成功率"
        value={formatPercent(kpis?.pairingSuccessRate.current)}
        hint={deltaHint(kpis?.pairingSuccessRate, 'percent')}
        loading={query.isLoading}
      />
      <StatCard
        icon={<Tag size={18} />}
        label="语义匹配率"
        value={formatPercent(kpis?.semanticMatchRate.current)}
        hint={deltaHint(kpis?.semanticMatchRate, 'percent')}
        loading={query.isLoading}
      />
    </div>
  );
}

function deltaHint(metric: Metric | undefined, mode: 'integer' | 'percent'): string {
  if (!metric || metric.previous == null || metric.current == null) {
    return '较上周期 —';
  }
  if (metric.previous === 0 && metric.current > 0) {
    return '较上周期 新增';
  }
  if (metric.previous === 0) {
    return '较上周期 持平';
  }

  const delta = mode === 'percent'
    ? metric.current - metric.previous
    : (metric.current - metric.previous) / metric.previous;
  if (delta === 0) {
    return '较上周期 持平';
  }
  const sign = delta > 0 ? '↑' : '↓';
  const value = mode === 'percent' ? `${(Math.abs(delta) * 100).toFixed(1)}pp` : formatPercent(Math.abs(delta));
  return `较上周期 ${sign} ${value}`;
}
