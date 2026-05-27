import { useState } from 'react';
import { Check, RefreshCw } from 'lucide-react';
import { useIsFetching, useQueryClient } from '@tanstack/react-query';
import { AccountMenu } from './AccountMenu';

export type TimeRange = '24h' | '7d' | '30d';

export const TIME_RANGES: readonly TimeRange[] = ['24h', '7d', '30d'] as const;

interface TopBarProps {
  timeRange: TimeRange;
  onTimeRangeChange: (range: TimeRange) => void;
}

export function TopBar({ timeRange, onTimeRangeChange }: TopBarProps) {
  const isFetching = useIsFetching() > 0;
  const qc = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);
  const [done, setDone] = useState(false);

  async function handleRefresh() {
    setRefreshing(true);
    try {
      await qc.refetchQueries();
      setDone(true);
      setTimeout(() => setDone(false), 800);
    } finally {
      setRefreshing(false);
    }
  }

  return (
    <header
      className="flex items-center justify-between px-4 min-w-0"
      style={{
        gridColumn: 2,
        height: 48,
        borderBottom: '1px solid var(--color-border)',
        background: 'var(--color-panel)',
      }}
    >
      <div />

      {/* Actions */}
      <div className="flex items-center gap-2">
        {/* Time range */}
        <div
          className="flex items-center h-[30px] p-0.5 gap-0.5 rounded-[4px]"
          style={{ border: '1px solid var(--color-border)', background: '#171717' }}
        >
          {TIME_RANGES.map((r) => (
            <button
              key={r}
              onClick={() => onTimeRangeChange(r)}
              className={[
                'h-6 px-[10px] rounded-[3px] text-[12px] border-0 cursor-pointer transition-colors duration-[120ms]',
                r === timeRange
                  ? 'bg-[#222] text-[#f5f5f5]'
                  : 'bg-transparent text-[var(--color-secondary)]',
              ].join(' ')}
            >
              {r}
            </button>
          ))}
        </div>

        {/* Refresh */}
        <button
          onClick={() => void handleRefresh()}
          disabled={refreshing}
          className="grid w-8 h-8 place-items-center rounded-[4px] border-0 cursor-pointer text-[var(--color-secondary)] hover:text-[var(--color-primary)] hover:bg-[#222] transition-colors duration-[120ms] disabled:opacity-40 disabled:cursor-not-allowed"
          style={{ border: '1px solid var(--color-border)', background: '#171717' }}
          title="刷新"
        >
          {done
            ? <Check size={18} className="text-emerald-400" />
            : <RefreshCw size={18} className={(isFetching || refreshing) ? 'animate-spin' : ''} />
          }
        </button>
        <AccountMenu />
      </div>
    </header>
  );
}
