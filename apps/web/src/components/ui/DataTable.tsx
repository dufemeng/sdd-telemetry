import React from 'react';
import { EmptyState } from './EmptyState';

interface DataTableProps {
  headers: string[];
  rows: React.ReactNode[][];
  emptyText?: string;
}

export function DataTable({ headers, rows, emptyText = '暂无数据' }: DataTableProps) {
  return (
    <div
      className="max-w-full overflow-auto rounded-[4px]"
      style={{ border: '1px solid var(--color-border)' }}
    >
      <table className="w-full" style={{ borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            {headers.map((h) => (
              <th
                key={h}
                className="sticky top-0 z-10 px-[10px] py-2 text-left text-[10px] font-bold uppercase whitespace-nowrap text-[var(--color-muted)]"
                style={{ background: '#171717', borderBottom: '1px solid var(--color-border)' }}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, ri) => (
            // Use first cell as key when it's a stable string ID; otherwise fall back to index
            // (rows are server-fetched and displayed read-only, so index keys are acceptable here)
            <tr key={typeof row[0] === 'string' ? row[0] : ri} className="group">
              {row.map((cell, ci) => (
                <td
                  key={ci}
                  className={[
                    'px-[10px] py-2 text-[12px] leading-4 align-top max-w-[320px] break-words',
                    'group-hover:bg-[#171717] transition-colors',
                    ci === 0 || ci === 1 ? 'text-[var(--color-text)]' : 'text-[var(--color-secondary)]',
                  ].join(' ')}
                  style={{ borderBottom: '1px solid var(--color-border)', fontFamily: 'var(--font-mono)' }}
                >
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length === 0 && <EmptyState text={emptyText} />}
    </div>
  );
}
