import { RefreshCw, Search } from 'lucide-react';
import { useIsFetching, useQueryClient } from '@tanstack/react-query';

export type TimeRange = '24h' | '7d' | '30d';

export const TIME_RANGES: readonly TimeRange[] = ['24h', '7d', '30d'] as const;

interface TopBarProps {
  timeRange: TimeRange;
  onTimeRangeChange: (range: TimeRange) => void;
  search: string;
  onSearchChange: (value: string) => void;
}

export function TopBar({ timeRange, onTimeRangeChange, search, onSearchChange }: TopBarProps) {
  const isFetching = useIsFetching() > 0;
  const qc = useQueryClient();

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
      {/* Search */}
      <div
        className="flex items-center gap-2 h-8 px-[10px] w-[min(520px,46vw)] rounded-[4px] text-[var(--color-muted)]"
        style={{ border: '1px solid rgba(255,255,255,0.10)', background: 'var(--color-base)' }}
      >
        <Search size={16} />
        <input
          className="w-full bg-transparent outline-none text-[12px] text-[var(--color-text)] placeholder:text-[var(--color-muted)]"
          placeholder="搜索批次 / 会话 / 提示词 / 用户 / 技能"
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
        />
      </div>

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
          onClick={() => void qc.invalidateQueries()}
          className="grid w-8 h-8 place-items-center rounded-[4px] border-0 cursor-pointer text-[var(--color-secondary)] hover:text-[var(--color-primary)] hover:bg-[#222] transition-colors duration-[120ms]"
          style={{ border: '1px solid var(--color-border)', background: '#171717' }}
          title="刷新"
        >
          <RefreshCw size={18} className={isFetching ? 'animate-spin' : ''} />
        </button>
      </div>
    </header>
  );
}
