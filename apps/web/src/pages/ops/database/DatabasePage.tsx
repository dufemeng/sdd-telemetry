import { useState } from 'react';
import { Code2, Database, HardDrive, ListFilter, Table2 } from 'lucide-react';
import { useOpsTables } from './useOpsTables';
import { useTableRows } from './useTableRows';
import { Panel } from '../../../components/ui/Panel';
import { DataTable } from '../../../components/ui/DataTable';
import { EmptyState } from '../../../components/ui/EmptyState';
import { formatInteger, formatBytes, truncate } from '../../../lib/format';
import { DatabaseFilterBuilder } from './DatabaseFilterBuilder';
import { toBackendFilters, type FilterGroup } from './databaseFilter';

export default function DatabasePage() {
  const { data: tablesData } = useOpsTables();
  const tables = tablesData?.tables ?? [];

  const [selectedTable, setSelectedTable] = useState('');
  const [filters,       setFilters]       = useState<FilterGroup[]>([]);

  const activeName  = selectedTable || tables[0]?.tableName || '';
  const activeTable = tables.find((t) => t.tableName === activeName) ?? tables[0];
  const columns     = activeTable?.columns ?? [];
  const rows = useTableRows({ tableName: activeName, filters: toBackendFilters(filters) });

  return (
    <div className="grid gap-3" style={{ gridTemplateColumns: '280px minmax(0,1fr)' }}>
      <Panel
        title="表列表"
        icon={<Database size={18} />}
        className="self-start max-h-[calc(100vh-130px)] overflow-auto"
      >
        <div className="grid gap-1">
          {tables.map((t) => (
            <button
              key={t.tableName}
              onClick={() => {
                setSelectedTable(t.tableName);
                setFilters([]);
              }}
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
        <Panel title={activeTable?.tableName ?? '—'} icon={<ListFilter size={18} />}>
          <DatabaseFilterBuilder
            columns={columns}
            filters={filters}
            onFiltersChange={setFilters}
          />
        </Panel>

        <Panel title="表结构" icon={<Code2 size={18} />}>
          <DataTable
            headers={['columnName', 'dataType', 'nullable', 'key', 'defaultValue', 'extra', 'estimatedMaxSize', 'sizeBasis']}
            rows={columns.map((c) => [
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
          {rows.isLoading ? (
            <EmptyState text="加载中…" />
          ) : (() => {
            const cols = rows.data?.columns ?? [];
            const data = rows.data?.rows ?? [];
            if (cols.length === 0) return <EmptyState text="暂无数据" />;
            return (
              <DataTable
                headers={cols.map((c) => c.columnName)}
                rows={data.map((row) => cols.map((c) => truncate(row[c.columnName], 160)))}
              />
            );
          })()}
        </Panel>

        {rows.error && (
          <Panel title="查询错误" icon={<Table2 size={18} />}>
            <pre className="whitespace-pre-wrap text-[12px] text-[var(--color-bad-text)]" style={{ fontFamily: 'var(--font-mono)' }}>
              {rows.error.message}
            </pre>
          </Panel>
        )}
      </div>
    </div>
  );
}
