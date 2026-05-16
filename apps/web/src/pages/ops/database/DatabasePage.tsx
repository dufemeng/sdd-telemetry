import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Database, ListFilter, Table2 } from 'lucide-react';
import { useOpsTables } from './useOpsTables';
import { useTableRows } from './useTableRows';
import { Panel } from '../../../components/ui/Panel';
import { DataTable } from '../../../components/ui/DataTable';
import { EmptyState } from '../../../components/ui/EmptyState';
import { formatInteger, formatBytes, truncate } from '../../../lib/format';
import { useDebouncedValue } from '../../../lib/useDebouncedValue';
import { FilterStrip } from './FilterStrip';
import { toBackendFilterGroups, type FilterGroup } from './databaseFilter';

const PAGE_SIZE = 50;
type Tab = 'data' | 'schema';

function TabButton({
  active,
  onClick,
  label,
  badge,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  badge?: number;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        'flex items-center gap-2 min-h-9 px-4 text-[13px] border-0 cursor-pointer transition-colors',
        active
          ? 'text-[var(--color-primary)] bg-[var(--color-surface)]'
          : 'text-[var(--color-secondary)] bg-transparent hover:text-[#f5f5f5]',
      ].join(' ')}
      style={{
        borderBottom: active ? '2px solid var(--color-primary)' : '2px solid transparent',
        marginBottom: '-1px',
      }}
    >
      <span>{label}</span>
      {badge !== undefined && (
        <em
          className="not-italic text-[11px] text-[var(--color-muted)]"
          style={{ fontFamily: 'var(--font-mono)' }}
        >
          {badge}
        </em>
      )}
    </button>
  );
}

export default function DatabasePage() {
  const { data: tablesData } = useOpsTables();
  const tables = tablesData?.tables ?? [];

  const [selectedTable, setSelectedTable] = useState('');
  const [groups,        setGroups]        = useState<FilterGroup[]>([]);
  const [cursorStack,   setCursorStack]   = useState<string[]>([]);
  const [activeTab,     setActiveTab]     = useState<Tab>('data');

  const activeName  = selectedTable || tables[0]?.tableName || '';
  const activeTable = tables.find((t) => t.tableName === activeName) ?? tables[0];
  const columns     = activeTable?.columns ?? [];

  const debouncedGroups = useDebouncedValue(groups, 300);
  const backendFilters  = useMemo(() => toBackendFilterGroups(debouncedGroups), [debouncedGroups]);
  const currentCursor   = cursorStack[cursorStack.length - 1];

  const rows = useTableRows({
    tableName: activeName,
    filters:   backendFilters,
    cursor:    currentCursor,
    limit:     PAGE_SIZE,
  });

  const switchTable = (name: string) => {
    setSelectedTable(name);
    setGroups([]);
    setCursorStack([]);
    setActiveTab('data');
  };

  const updateGroups = (next: FilterGroup[]) => {
    setGroups(next);
    setCursorStack([]);
  };

  const goNext = () => {
    if (rows.data?.nextCursor) setCursorStack([...cursorStack, rows.data.nextCursor]);
  };

  const goPrev = () => {
    setCursorStack(cursorStack.slice(0, -1));
  };

  const pageNumber = cursorStack.length + 1;
  const hasNext = Boolean(rows.data?.nextCursor);
  const hasPrev = cursorStack.length > 0;

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
              onClick={() => switchTable(t.tableName)}
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
          <FilterStrip columns={columns} groups={groups} onGroupsChange={updateGroups} />
        </Panel>

        <div
          className="flex items-end gap-0"
          style={{ borderBottom: '1px solid var(--color-border)' }}
        >
          <TabButton
            active={activeTab === 'data'}
            onClick={() => setActiveTab('data')}
            label="数据"
            badge={rows.data?.rows.length}
          />
          <TabButton
            active={activeTab === 'schema'}
            onClick={() => setActiveTab('schema')}
            label="结构"
            badge={columns.length}
          />
        </div>

        {activeTab === 'data' && (
          <div>
            {rows.isLoading ? (
              <EmptyState text="加载中…" />
            ) : (() => {
              const cols = rows.data?.columns ?? [];
              const data = rows.data?.rows ?? [];
              if (cols.length === 0) return <EmptyState text="暂无数据" />;
              return (
                <div className="grid gap-3">
                  <DataTable
                    headers={cols.map((c) => c.columnName)}
                    rows={data.map((row) => cols.map((c) => truncate(row[c.columnName], 160)))}
                  />
                  <div className="flex items-center justify-between pt-1">
                    <span className="text-[11px] text-[var(--color-muted)]">
                      第 {pageNumber} 页 · 每页 {PAGE_SIZE} 行
                    </span>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={goPrev}
                        disabled={!hasPrev}
                        className="flex items-center gap-1 min-h-8 px-3 rounded-[4px] text-[12px] cursor-pointer text-[var(--color-secondary)] disabled:opacity-50 disabled:cursor-not-allowed hover:text-[var(--color-primary)] hover:bg-[#202016]"
                        style={{ border: '1px solid var(--color-border)', background: 'transparent' }}
                      >
                        <ChevronLeft size={14} />
                        上一页
                      </button>
                      <button
                        type="button"
                        onClick={goNext}
                        disabled={!hasNext}
                        className="flex items-center gap-1 min-h-8 px-3 rounded-[4px] text-[12px] cursor-pointer text-[var(--color-secondary)] disabled:opacity-50 disabled:cursor-not-allowed hover:text-[var(--color-primary)] hover:bg-[#202016]"
                        style={{ border: '1px solid var(--color-border)', background: 'transparent' }}
                      >
                        下一页
                        <ChevronRight size={14} />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })()}
          </div>
        )}

        {activeTab === 'schema' && (
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
        )}

        {rows.error && (
          <Panel title="查询错误" icon={<Table2 size={18} />}>
            <pre
              className="whitespace-pre-wrap text-[12px] text-[var(--color-bad-text)]"
              style={{ fontFamily: 'var(--font-mono)' }}
            >
              {rows.error.message}
            </pre>
          </Panel>
        )}
      </div>
    </div>
  );
}
