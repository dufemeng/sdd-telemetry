import { useState } from 'react';
import { Code2, Database, HardDrive, Table2 } from 'lucide-react';
import { useOpsTables } from './useOpsTables';
import { useTableRows } from './useTableRows';
import { Panel } from '../../../components/ui/Panel';
import { DataTable } from '../../../components/ui/DataTable';
import { EmptyState } from '../../../components/ui/EmptyState';
import { formatInteger, formatBytes, truncate } from '../../../lib/format';

export default function DatabasePage() {
  const { data: tablesData } = useOpsTables();
  const tables = tablesData?.tables ?? [];

  const [selectedTable,  setSelectedTable]  = useState('');
  const [filterColumn,   setFilterColumn]   = useState('');
  const [filterValue,    setFilterValue]    = useState('');

  const activeName  = selectedTable || tables[0]?.tableName || '';
  const activeTable = tables.find((t) => t.tableName === activeName) ?? tables[0];
  const rows        = useTableRows({ tableName: activeName, filterColumn, filterValue });

  const selectCls = 'min-h-8 px-[10px] rounded-[4px] text-[12px] outline-none text-[var(--color-text)] bg-[var(--color-base)] border border-[rgba(255,255,255,0.10)] focus:border-[rgba(250,255,105,0.55)] transition-colors';

  return (
    <div className="grid gap-3" style={{ gridTemplateColumns: '280px minmax(0,1fr)' }}>
      <Panel title="表列表" icon={<Database size={18} />} className="self-start max-h-[calc(100vh-130px)] overflow-auto">
        <div className="grid gap-1">
          {tables.map((t) => (
            <button
              key={t.tableName}
              onClick={() => { setSelectedTable(t.tableName); setFilterColumn(''); setFilterValue(''); }}
              className={[
                'flex justify-between items-center w-full min-h-8 px-2 rounded-[4px] text-[12px] border-0 cursor-pointer text-left transition-colors',
                t.tableName === activeName
                  ? 'text-[var(--color-primary)] bg-[#202016]'
                  : 'text-[var(--color-secondary)] bg-transparent hover:text-[var(--color-primary)] hover:bg-[#202016]',
              ].join(' ')}
            >
              <span className="truncate">{t.tableName}</span>
              <em className="not-italic text-[var(--color-muted)]">{formatInteger(t.estimatedRows)}</em>
            </button>
          ))}
        </div>
      </Panel>

      <div className="grid gap-3">
        <Panel title={activeTable?.tableName ?? '—'} icon={<Table2 size={18} />}>
          <div className="flex gap-2">
            <select
              className={selectCls}
              value={filterColumn}
              onChange={(e) => setFilterColumn(e.target.value)}
            >
              <option value="">选择字段</option>
              {(activeTable?.columns ?? []).map((c) => (
                <option key={c.columnName} value={c.columnName}>{c.columnName}</option>
              ))}
            </select>
            <input
              className={`${selectCls} flex-1`}
              placeholder="LIKE 筛选值"
              value={filterValue}
              onChange={(e) => setFilterValue(e.target.value)}
            />
          </div>
        </Panel>

        <Panel title="表结构" icon={<Code2 size={18} />}>
          <DataTable
            headers={['columnName', 'dataType', 'nullable', 'key', 'defaultValue', 'extra', 'estimatedMaxSize', 'sizeBasis']}
            rows={(activeTable?.columns ?? []).map((c) => [
              c.columnName,
              c.dataType,
              c.nullable ? 'YES' : 'NO',
              c.key ?? '',
              c.defaultValue ?? '',
              c.extra ?? '',
              c.estimatedMaxSize == null ? '—' : formatBytes(c.estimatedMaxSize),
              c.sizeBasis,
            ])}
          />
        </Panel>

        <Panel title="表数据" icon={<HardDrive size={18} />}>
          {rows.isLoading
            ? <EmptyState text="加载中…" />
            : (() => {
                const cols = rows.data?.columns ?? [];
                const data = rows.data?.rows   ?? [];
                if (cols.length === 0) return <EmptyState text="暂无数据" />;
                return (
                  <DataTable
                    headers={cols.map((c) => c.columnName)}
                    rows={data.map((row) =>
                      cols.map((c) => truncate(row[c.columnName], 160))
                    )}
                  />
                );
              })()
          }
        </Panel>
      </div>
    </div>
  );
}
