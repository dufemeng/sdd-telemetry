import { GitBranch, TrendingUp } from 'lucide-react';
import type { TimeRange } from '@/components/layout/TopBar';
import { EmptyState } from '@/components/ui/EmptyState';
import { Panel } from '@/components/ui/Panel';
import { useSkillAnalytics } from './hooks/useSkillAnalytics';
import { useSkillTimeseries } from './hooks/useSkillTimeseries';
import { CallQualityFunnel } from './components/CallQualityFunnel';
import { TrendChart } from './components/TrendChart';

interface TrendsSectionProps {
  timeRange: TimeRange;
}

export function TrendsSection({ timeRange }: TrendsSectionProps) {
  const analytics = useSkillAnalytics(timeRange);
  const timeseries = useSkillTimeseries(timeRange);

  return (
    <div className="grid grid-cols-12 gap-3">
      <Panel title="调用量趋势" icon={<TrendingUp size={18} />} className="col-span-8">
        {timeseries.error ? (
          <SectionError error={timeseries.error} onRetry={() => void timeseries.refetch()} />
        ) : timeseries.data ? (
          <TrendChart points={timeseries.data.points} />
        ) : (
          <EmptyState text="加载中..." />
        )}
      </Panel>
      <Panel title="调用质量漏斗" icon={<GitBranch size={18} />} className="col-span-4">
        {analytics.error ? (
          <SectionError error={analytics.error} onRetry={() => void analytics.refetch()} />
        ) : analytics.data ? (
          <CallQualityFunnel {...analytics.data.callQuality} />
        ) : (
          <EmptyState text="加载中..." />
        )}
      </Panel>
    </div>
  );
}

function SectionError({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  return (
    <div className="flex min-h-24 items-center justify-between gap-3 rounded-[4px] px-3 text-[12px] text-[var(--color-bad-text)]" style={{ background: 'var(--color-bad-bg)' }}>
      <span>{error instanceof Error ? error.message : '加载失败'}</span>
      <button type="button" onClick={onRetry} className="rounded-[4px] px-2 py-1 text-[var(--color-text)]" style={{ border: '1px solid var(--color-border)' }}>
        重试
      </button>
    </div>
  );
}
