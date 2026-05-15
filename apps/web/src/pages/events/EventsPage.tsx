import { Activity, BarChart3, Clock3, Search } from 'lucide-react';
import { useShellContext } from '../../components/layout/AppShell';
import { useEventDistribution } from './useEventDistribution';
import { useEventTimeline } from './useEventTimeline';
import { StatCard } from '../../components/ui/StatCard';
import { Panel } from '../../components/ui/Panel';
import { BarList } from '../../components/ui/BarList';
import { EmptyState } from '../../components/ui/EmptyState';
import { formatInteger, formatTime, formatDateTime } from '../../lib/format';

export default function EventsPage() {
  const { timeRange } = useShellContext();
  const dist     = useEventDistribution(timeRange);
  const timeline = useEventTimeline(timeRange);
  const peak     = [...(timeline.data?.buckets ?? [])].sort((a, b) => b.eventCount - a.eventCount)[0];
  const maxCount = Math.max(...(timeline.data?.buckets ?? []).map((b) => b.eventCount), 1);

  return (
    <div className="grid gap-3">
      <div className="grid grid-cols-4 gap-3">
        <StatCard icon={<Activity  size={18} />} label="事件总数"  value={formatInteger(dist.data?.totalEvents)}         hint="totalEvents" />
        <StatCard icon={<BarChart3 size={18} />} label="事件类型"  value={formatInteger(dist.data?.distinctEventNames)}  hint="distinct types" />
        <StatCard icon={<Clock3    size={18} />} label="峰值时段"  value={formatTime(peak?.bucketStart)}                  hint={`${formatInteger(peak?.eventCount)} events`} />
        <StatCard icon={<Search    size={18} />} label="时间桶数"  value={formatInteger(timeline.data?.buckets.length)}  hint="timeline buckets" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Panel title="事件排行" icon={<BarChart3 size={18} />}>
          <BarList
            items={(dist.data?.items ?? []).map((i) => ({
              label: i.eventName,
              sub:   i.description ?? i.eventName,
              value: i.count,
              ratio: i.percentage,
            }))}
          />
        </Panel>
        <Panel title="事件趋势" icon={<Activity size={18} />}>
          {(timeline.data?.buckets ?? []).length === 0
            ? <EmptyState text="暂无趋势数据" />
            : (
              <div className="flex items-end gap-1.5 min-h-[220px] pt-[10px]">
                {(timeline.data?.buckets ?? []).slice(-24).map((b) => (
                  <div
                    key={b.bucketStart}
                    className="flex flex-col items-center justify-end gap-2 flex-1 min-w-5 h-[220px]"
                    title={`${formatDateTime(b.bucketStart)} ${b.eventCount}`}
                  >
                    <div
                      className="w-full min-h-1 rounded-t-[3px]"
                      style={{ height: `${Math.max((b.eventCount / maxCount) * 100, 4)}%`, background: '#c9ce3c' }}
                    />
                    <span
                      className="max-w-12 overflow-hidden text-[10px] text-[var(--color-muted)] truncate"
                      style={{ writingMode: 'vertical-rl' }}
                    >
                      {formatTime(b.bucketStart)}
                    </span>
                  </div>
                ))}
              </div>
            )
          }
        </Panel>
      </div>
    </div>
  );
}
