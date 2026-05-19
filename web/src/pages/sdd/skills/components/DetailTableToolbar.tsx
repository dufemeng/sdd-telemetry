import { Search } from 'lucide-react';
import type { UsageMatchFilter } from '../hooks/useSddUsageSummary';

interface DetailTableToolbarProps {
  keyword: string;
  matched: UsageMatchFilter;
  onKeywordChange: (value: string) => void;
  onMatchedChange: (value: UsageMatchFilter) => void;
}

const FILTERS: Array<{ value: UsageMatchFilter; label: string }> = [
  { value: 'all', label: '全部' },
  { value: 'matched', label: '已匹配' },
  { value: 'unmatched', label: '未匹配' },
];

export function DetailTableToolbar({
  keyword,
  matched,
  onKeywordChange,
  onMatchedChange,
}: DetailTableToolbarProps) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div
        className="flex h-8 w-[320px] items-center gap-2 rounded-[4px] px-[10px] text-[var(--color-muted)]"
        style={{ border: '1px solid var(--color-border)', background: 'var(--color-base)' }}
      >
        <Search size={15} />
        <input
          className="w-full bg-transparent text-[12px] text-[var(--color-text)] outline-none placeholder:text-[var(--color-muted)]"
          value={keyword}
          onChange={(event) => onKeywordChange(event.target.value)}
          placeholder="搜索技能或语义..."
        />
      </div>
      <div
        className="flex h-8 items-center gap-0.5 rounded-[4px] p-0.5"
        style={{ border: '1px solid var(--color-border)', background: '#171717' }}
      >
        {FILTERS.map((filter) => (
          <button
            key={filter.value}
            type="button"
            onClick={() => onMatchedChange(filter.value)}
            className={[
              'h-6 px-[10px] rounded-[3px] border-0 text-[12px] cursor-pointer transition-colors',
              matched === filter.value
                ? 'bg-[#222] text-[#f5f5f5]'
                : 'bg-transparent text-[var(--color-secondary)] hover:text-[var(--color-primary)]',
            ].join(' ')}
          >
            {filter.label}
          </button>
        ))}
      </div>
    </div>
  );
}
