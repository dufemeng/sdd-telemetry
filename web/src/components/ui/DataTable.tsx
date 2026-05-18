import React from 'react';
import { EmptyState } from './EmptyState';

export interface DataTableRow {
  key: React.Key;
  cells: React.ReactNode[];
  ariaLabel?: string;
}

interface DataTableProps {
  headers: string[];
  rows: Array<React.ReactNode[] | DataTableRow>;
  emptyText?: string;
  onRowClick?: (rowIndex: number) => void;
  onRowSelect?: (rowKey: React.Key, rowIndex: number) => void;
  selectedRowKey?: React.Key | null;
}

export function DataTable({
  headers,
  rows,
  emptyText = '暂无数据',
  onRowClick,
  onRowSelect,
  selectedRowKey = null,
}: DataTableProps) {
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
          {rows.map((row, ri) => {
            const isObjectRow = isDataTableRow(row);
            const cells = isObjectRow ? row.cells : row;
            const rowKey = isObjectRow ? row.key : typeof cells[0] === 'string' ? cells[0] : ri;
            const isSelected = selectedRowKey === rowKey;
            const isInteractive = Boolean(onRowClick || onRowSelect);

            return (
              <tr
                key={rowKey}
                className="group"
                aria-label={isObjectRow ? row.ariaLabel : undefined}
                aria-selected={isSelected || undefined}
                onClick={
                  isInteractive
                    ? () => {
                        onRowClick?.(ri);
                        onRowSelect?.(rowKey, ri);
                      }
                    : undefined
                }
                style={isInteractive ? { cursor: 'pointer' } : undefined}
              >
                {cells.map((cell, ci) => (
                  <td
                    key={ci}
                    className={[
                      'px-[10px] py-2 text-[12px] leading-4 align-top max-w-[320px] break-words',
                      'group-hover:bg-[#171717] transition-colors',
                      isSelected ? 'bg-[#222]' : '',
                      ci === 0 || ci === 1 ? 'text-[var(--color-text)]' : 'text-[var(--color-secondary)]',
                    ].join(' ')}
                    style={{ borderBottom: '1px solid var(--color-border)', fontFamily: 'var(--font-mono)' }}
                  >
                    {cell}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
      {rows.length === 0 && <EmptyState text={emptyText} />}
    </div>
  );
}

function isDataTableRow(row: React.ReactNode[] | DataTableRow): row is DataTableRow {
  return !Array.isArray(row);
}
