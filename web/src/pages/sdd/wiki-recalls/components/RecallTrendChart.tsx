import { useMemo, useState } from 'react';
import { Clock3 } from 'lucide-react';
import type { ProfileKnowledgeTimelineResponse } from '@sdd-telemetry/api';
import { EmptyState } from '@/components/ui/EmptyState';
import { formatInteger } from '@/lib/format';
import { useWikiRecallTimeline } from '../useWikiRecalls';
import { QueryNotice, SegmentedControl } from './WikiRecallControls';
import { CARD_STYLE } from '../styles';

type TimelineGranularity = 'day' | 'hour';

const GRANULARITY_OPTIONS: Array<{
  value: TimelineGranularity;
  label: string;
}> = [
  { value: 'day', label: '按日' },
  { value: 'hour', label: '按小时' },
];

export function RecallTrendChart() {
  const [granularity, setGranularity] = useState<TimelineGranularity>('day');
  const { data, isLoading, error } = useWikiRecallTimeline('30d', granularity);
  const chart = useMemo(() => buildTimelineChart(data ?? { buckets: [], dimensions: [] }), [data]);

  return (
    <section className="rounded-[6px] p-[14px]" style={CARD_STYLE}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2" style={{ color: 'var(--color-primary)' }}>
          <Clock3 size={18} />
          <span className="text-[14px] font-semibold text-[#f5f5f5]">知识访问与路径维度</span>
        </div>
        <SegmentedControl
          label=""
          value={granularity}
          options={GRANULARITY_OPTIONS}
          onChange={setGranularity}
        />
      </div>

      <QueryNotice loading={isLoading} error={error} loadingText="正在加载知识访问..." />
      {chart.buckets.length > 0 ? (
        <div className="grid grid-cols-1 gap-4 2xl:grid-cols-[minmax(0,1fr)_300px]">
          <div className="min-w-0">
            <div className="mb-2 flex items-center justify-between text-[11px]">
              <span className="font-medium text-[var(--color-secondary)]">访问次数</span>
              <span
                className="text-[var(--color-muted)]"
                style={{ fontFamily: 'var(--font-mono)' }}
              >
                共 {formatInteger(chart.totalAccesses)} 次
              </span>
            </div>
            <div className="flex min-h-[230px] items-end gap-2 overflow-x-auto px-2 py-3">
              {chart.buckets.map((bucket) => (
                <div key={bucket.t} className="flex min-w-[28px] flex-col items-center gap-2">
                  <div
                    className="w-[18px] rounded-t-[4px]"
                    style={{
                      height: `${Math.max((bucket.accessCount / chart.maxAccessCount) * 172, 4)}px`,
                      background: 'var(--color-primary)',
                    }}
                    title={`${formatTimelineTick(bucket.t, granularity)}: ${formatInteger(bucket.accessCount)} 次访问`}
                  />
                  <span className="w-[44px] rotate-[-35deg] text-right text-[10px] text-[var(--color-muted)]">
                    {formatTimelineTick(bucket.t, granularity)}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="min-w-0">
            <div className="mb-2 flex items-center justify-between text-[11px]">
              <span className="font-medium text-[var(--color-secondary)]">全部路径维度</span>
              <span
                className="text-[var(--color-muted)]"
                style={{ fontFamily: 'var(--font-mono)' }}
              >
                {formatInteger(chart.dimensions.length)} 个
              </span>
            </div>
            <div className="max-h-[230px] overflow-y-auto pr-1">
              {chart.dimensions.map((dimension) => (
                <div
                  key={dimension.segment}
                  className="grid grid-cols-[minmax(0,1fr)_84px_36px] items-center gap-2 py-[5px]"
                >
                  <span
                    className="truncate text-[11px] text-[var(--color-secondary)]"
                    title={dimension.segment}
                    style={{ fontFamily: 'var(--font-mono)' }}
                  >
                    {dimension.segment}
                  </span>
                  <span
                    className="h-[6px] overflow-hidden rounded-full"
                    style={{ background: '#202016' }}
                  >
                    <span
                      className="block h-full rounded-full"
                      style={{
                        width: `${Math.max((dimension.accessCount / chart.maxDimensionAccessCount) * 100, 3)}%`,
                        background: '#c9ce3c',
                      }}
                    />
                  </span>
                  <span
                    className="text-right text-[11px] text-[#f5f5f5]"
                    style={{ fontFamily: 'var(--font-mono)' }}
                  >
                    {formatInteger(dimension.accessCount)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : !isLoading && !error ? (
        <EmptyState text="暂无知识访问数据" />
      ) : null}
    </section>
  );
}

export function buildTimelineChart(data: ProfileKnowledgeTimelineResponse) {
  const buckets = [...data.buckets].sort((a, b) => a.t.localeCompare(b.t));
  const dimensions = [...data.dimensions].sort(
    (a, b) => b.accessCount - a.accessCount || a.segment.localeCompare(b.segment),
  );

  return {
    buckets,
    dimensions,
    totalAccesses: buckets.reduce((total, bucket) => total + bucket.accessCount, 0),
    maxAccessCount: Math.max(1, ...buckets.map((bucket) => bucket.accessCount)),
    maxDimensionAccessCount: Math.max(1, ...dimensions.map((dimension) => dimension.accessCount)),
  };
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
