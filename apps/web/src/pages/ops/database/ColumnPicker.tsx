import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, Search } from 'lucide-react';
import type { OpsColumn } from '@sdd-telemetry/api';

interface Props {
  columns: OpsColumn[];
  value: string;
  onChange: (columnName: string) => void;
}

const TRIGGER_CLS =
  'flex items-center justify-between min-h-8 px-[10px] rounded-[4px] text-[12px] outline-none text-[var(--color-text)] bg-[var(--color-base)] border border-[rgba(255,255,255,0.10)] hover:border-[rgba(250,255,105,0.30)] focus:border-[rgba(250,255,105,0.55)] transition-colors cursor-pointer';

export function ColumnPicker({ columns, value, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    window.addEventListener('mousedown', onClick);
    return () => window.removeEventListener('mousedown', onClick);
  }, [open]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return columns;
    return columns.filter(
      (c) => c.columnName.toLowerCase().includes(q) || c.dataType.toLowerCase().includes(q),
    );
  }, [columns, query]);

  const current = columns.find((c) => c.columnName === value);

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`${TRIGGER_CLS} w-full`}
      >
        <span className="truncate">
          {current ? (
            <>
              {current.columnName}{' '}
              <em className="not-italic text-[var(--color-muted)]">&lt;{current.dataType}&gt;</em>
            </>
          ) : (
            <span className="text-[var(--color-muted)]">选择字段</span>
          )}
        </span>
        <ChevronDown size={14} className="text-[var(--color-muted)]" />
      </button>

      {open && (
        <div
          className="absolute left-0 right-0 top-full mt-1 z-20 rounded-[4px] overflow-hidden"
          style={{
            background: 'var(--color-surface)',
            border: '1px solid var(--color-border)',
            boxShadow: '0 8px 24px rgba(0,0,0,0.6)',
          }}
        >
          <div
            className="flex items-center gap-2 px-[10px] py-2"
            style={{ borderBottom: '1px solid var(--color-border)' }}
          >
            <Search size={14} className="text-[var(--color-muted)]" />
            <input
              autoFocus
              className="flex-1 bg-transparent outline-none text-[12px] text-[var(--color-text)] placeholder:text-[var(--color-muted)]"
              placeholder="搜索字段名或类型"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <div className="max-h-[280px] overflow-auto py-1">
            {filtered.length === 0 ? (
              <div className="px-[10px] py-2 text-[12px] text-[var(--color-muted)]">未匹配到字段</div>
            ) : (
              filtered.map((c) => (
                <button
                  key={c.columnName}
                  type="button"
                  onClick={() => {
                    onChange(c.columnName);
                    setOpen(false);
                    setQuery('');
                  }}
                  className={[
                    'flex items-baseline justify-between w-full px-[10px] py-1.5 text-left text-[12px] border-0 cursor-pointer transition-colors',
                    c.columnName === value
                      ? 'text-[var(--color-primary)] bg-[#202016]'
                      : 'text-[var(--color-text)] bg-transparent hover:bg-[#202016]',
                  ].join(' ')}
                >
                  <span className="truncate">
                    {c.columnName}{' '}
                    <em className="not-italic text-[var(--color-muted)]">&lt;{c.dataType}&gt;</em>
                  </span>
                  {c.key && (
                    <span
                      className="ml-2 text-[10px] uppercase tracking-[0.05em] text-[var(--color-muted)]"
                      style={{ fontFamily: 'var(--font-mono)' }}
                    >
                      {c.key}
                    </span>
                  )}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
