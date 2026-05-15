import { formatInteger } from '../../lib/format';
import { EmptyState } from './EmptyState';

interface BarItem {
  label: string;
  sub?: string;
  value: number;
  ratio: number;
}

interface BarListProps {
  items: BarItem[];
  emptyText?: string;
}

export function BarList({ items, emptyText = '暂无数据' }: BarListProps) {
  const max = Math.max(...items.map((i) => i.value), 1);

  if (items.length === 0) return <EmptyState text={emptyText} />;

  return (
    <div className="grid gap-[10px]">
      {items.map((item) => (
        <div
          key={item.label}
          className="grid items-center gap-3"
          style={{ gridTemplateColumns: 'minmax(180px,0.9fr) minmax(140px,1fr) 64px' }}
        >
          <div className="min-w-0">
            <span className="block truncate text-[12px] leading-4 text-[var(--color-text)]">
              {item.label}
            </span>
            {item.sub && (
              <em className="block truncate mt-0.5 text-[11px] not-italic text-[var(--color-muted)]">
                {item.sub}
              </em>
            )}
          </div>
          <div className="h-2 overflow-hidden rounded-full" style={{ background: '#202016' }}>
            <div
              className="h-full rounded-full"
              style={{
                width: `${Math.max((item.value / max) * 100, 4)}%`,
                background: '#c9ce3c',
              }}
            />
          </div>
          <strong
            className="text-[13px] text-[#f5f5f5] text-right"
            style={{ fontFamily: 'var(--font-mono)' }}
          >
            {formatInteger(item.value)}
          </strong>
        </div>
      ))}
    </div>
  );
}
