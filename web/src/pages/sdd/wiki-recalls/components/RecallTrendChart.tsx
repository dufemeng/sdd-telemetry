import { useMemo, useState } from 'react';
import { Clock3 } from 'lucide-react';
import type { WikiRecallTimelinePoint } from '@sdd-telemetry/api';
import { EmptyState } from '@/components/ui/EmptyState';
import { formatInteger } from '@/lib/format';
import { useWikiRecallTimeline } from '../useWikiRecalls';
import { QueryNotice, SegmentedControl } from './WikiRecallControls';
import { CARD_STYLE } from '../styles';

type TimelineGranularity = 'day' | 'hour';
type TimelineGroupBy = 'domain' | 'axis';

const GRANULARITY_OPTIONS: Array<{ value: TimelineGranularity; label: string }> = [
  { value: 'day', label: '按日' },
  { value: 'hour', label: '按小时' },
];

const GROUP_OPTIONS: Array<{ value: TimelineGroupBy; label: string }> = [
  { value: 'domain', label: '业务域' },
  { value: 'axis', label: '维度' },
];

const SERIES_COLORS = [
  '#c9ce3c',
  '#60a5fa',
  '#34d399',
  '#f59e0b',
  '#a78bfa',
  '#f472b6',
  '#94a3b8',
  '#22d3ee',
];

export function RecallTrendChart() {
  const [granularity, setGranularity] = useState<TimelineGranularity>('day');
  const [groupBy, setGroupBy] = useState<TimelineGroupBy>('domain');
  const { data, isLoading, error } = useWikiRecallTimeline('30d', granularity, groupBy);
  const chart = useMemo(
    () => buildTimelineChart(data?.points ?? []),
    [data?.points],
  );

  return (
    <section className="p-[14px] rounded-[6px]" style={CARD_STYLE}>
      <div className="mb-1 flex items-center justify-between">
        <div className="flex items-center gap-2" style={{ color: 'var(--color-primary)' }}>
          <Clock3 size={18} />
          <span className="text-[14px] font-semibold text-[#f5f5f5]">召回趋势</span>
        </div>
        <div className="flex items-center gap-2">
          <SegmentedControl label="" value={granularity} options={GRANULARITY_OPTIONS} onChange={setGranularity} />
          <SegmentedControl label="" value={groupBy} options={GROUP_OPTIONS} onChange={setGroupBy} />
        </div>
      </div>
      <div className="grid gap-3">
        <QueryNotice loading={isLoading} error={error} loadingText="正在加载时间线..." />
        {chart.times.length > 0 ? (
          <>
            <div className="flex min-h-[230px] items-end gap-2 overflow-x-auto rounded-[4px] px-2 py-3">
              {chart.times.map((time) => {
                const bucket = chart.byTime.get(time)!;
                const total = bucket.total;
                return (
                  <div key={time} className="flex min-w-[28px] flex-col items-center gap-2">
                    <div
                      className="relative w-[18px] overflow-hidden rounded-t-[4px]"
                      style={{
                        height: `${Math.max((total / chart.maxTotal) * 172, 4)}px`,
                        background: 'rgba(255,255,255,0.06)',
                      }}
                      title={`${formatTimelineTick(time, granularity)}: ${formatInteger(total)} 次`}
                    >
                      <div className="absolute inset-x-0 bottom-0 flex h-full flex-col-reverse">
                        {chart.groups.map((group, index) => {
                          const value = bucket.values.get(group) ?? 0;
                          if (value === 0) return null;
                          return (
                            <div
                              key={group}
                              style={{
                                flexGrow: value,
                                background: SERIES_COLORS[index % SERIES_COLORS.length],
                                minHeight: 2,
                              }}
                            />
                          );
                        })}
                      </div>
                    </div>
                    <span className="w-[44px] rotate-[-35deg] text-right text-[10px] text-[var(--color-muted)]">
                      {formatTimelineTick(time, granularity)}
                    </span>
                  </div>
                );
              })}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {chart.groups.map((group, index) => (
                <span
                  key={group}
                  className="inline-flex items-center gap-1 rounded-[4px] px-2 py-[3px] text-[11px] text-[var(--color-secondary)]"
                  style={{ border: '1px solid var(--color-border)', background: 'rgba(255,255,255,0.04)' }}
                >
                  <span
                    className="h-2 w-2 rounded-full"
                    style={{ background: SERIES_COLORS[index % SERIES_COLORS.length] }}
                  />
                  {group}
                </span>
              ))}
              <span className="inline-flex items-center gap-1 text-[11px] text-[var(--color-muted)]">
                共 {formatInteger(chart.total)} 次
              </span>
            </div>
          </>
        ) : (
          !isLoading && !error ? <EmptyState text="暂无召回时间线数据" /> : null
        )}
      </div>
    </section>
  );
}

function buildTimelineChart(points: WikiRecallTimelinePoint[]) {
  const rawGroupTotals = new Map<string, number>();
  for (const point of points) {
    const group = displayGroup(point.group);
    rawGroupTotals.set(group, (rawGroupTotals.get(group) ?? 0) + point.count);
  }

  const topGroups = [...rawGroupTotals.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 7)
    .map(([group]) => group);
  const topGroupSet = new Set(topGroups);
  const hasOther = [...rawGroupTotals.keys()].some((group) => !topGroupSet.has(group));
  const groups = hasOther ? [...topGroups, '其他'] : topGroups;

  const byTime = new Map<string, { total: number; values: Map<string, number> }>();
  let total = 0;
  let maxTotal = 1;

  for (const point of points) {
    const rawGroup = displayGroup(point.group);
    const group = topGroupSet.has(rawGroup) ? rawGroup : '其他';
    const bucket = byTime.get(point.t) ?? { total: 0, values: new Map<string, number>() };
    bucket.total += point.count;
    bucket.values.set(group, (bucket.values.get(group) ?? 0) + point.count);
    byTime.set(point.t, bucket);
    total += point.count;
    maxTotal = Math.max(maxTotal, bucket.total);
  }

  return {
    groups,
    byTime,
    times: [...byTime.keys()].sort(),
    total,
    maxTotal,
  };
}

function displayGroup(group: string | null): string {
  return group && group.length > 0 ? group : '(未识别)';
}

function formatTimelineTick(value: string, granularity: TimelineGranularity): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  if (granularity === 'hour') {
    const hour = String(date.getHours()).padStart(2, '0');
    return `${month}-${day} ${hour}:00`;
  }
  return `${month}-${day}`;
}
