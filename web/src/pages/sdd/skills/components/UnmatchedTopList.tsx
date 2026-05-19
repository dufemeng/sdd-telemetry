import type { SddSkillAnalytics } from '@sdd-telemetry/api';
import { formatInteger } from '@/lib/format';
import { EmptyState } from '@/components/ui/EmptyState';

interface UnmatchedTopListProps {
  items: SddSkillAnalytics['matchHealth']['topUnmatched'];
}

export function UnmatchedTopList({ items }: UnmatchedTopListProps) {
  if (items.length === 0) {
    return <EmptyState text="暂无未匹配技能" />;
  }

  return (
    <div className="grid gap-2">
      {items.map((item) => (
        <div key={item.rawSkillName} className="flex items-center justify-between gap-3">
          <span className="min-w-0 truncate text-[12px] text-[var(--color-text)]">{item.rawSkillName}</span>
          <strong
            className="rounded-[4px] px-2 py-1 text-[12px] text-[var(--color-bad-text)]"
            style={{ background: 'rgba(255,180,171,0.10)', fontFamily: 'var(--font-mono)' }}
          >
            {formatInteger(item.usageCount)}
          </strong>
        </div>
      ))}
    </div>
  );
}
