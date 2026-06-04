import { useMemo, useState } from 'react';
import { Database, ListFilter, Table2 } from 'lucide-react';
import { useOpsTables } from './useOpsTables';
import { useTableRow } from './useTableRow';
import { useTableRows } from './useTableRows';
import { Panel } from '@/components/ui/Panel';
import { DataTable } from '@/components/ui/DataTable';
import { EmptyState } from '@/components/ui/EmptyState';
import { Pagination } from '@/components/ui/Pagination';
import {
  RowInspectorDrawer,
  type RowInspectorField,
  type RowInspectorTextBlock,
} from '@/components/ui/RowInspectorDrawer';
import { formatInteger, formatBytes, truncate, formatDateTime } from '@/lib/format';
import { useDebouncedValue } from '@/lib/useDebouncedValue';
import { useCursorPagination } from '@/lib/useCursorPagination';
import { FilterStrip } from './FilterStrip';
import { toBackendFilterGroups, type FilterGroup } from './databaseFilter';

const PAGE_SIZE = 20;
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

  const [selectedTable,   setSelectedTable]   = useState('');
  const [groups,          setGroups]          = useState<FilterGroup[]>([]);
  const [activeTab,       setActiveTab]       = useState<Tab>('data');
  const [drawerOpen,      setDrawerOpen]      = useState(false);
  const [selectedId,      setSelectedId]      = useState<string | null>(null);
  const [selectedRowKey,  setSelectedRowKey]  = useState<number | null>(null);

  const { currentCursor, pageNumber, hasPrev, goNext, goPrev, reset: resetPagination } = useCursorPagination();

  const activeName  = selectedTable || tables[0]?.tableName || '';
  const fullRow = useTableRow({ tableName: activeName, id: selectedId });
  const activeTable = tables.find((t) => t.tableName === activeName) ?? tables[0];
  const columns     = activeTable?.columns ?? [];

  const debouncedGroups = useDebouncedValue(groups, 300);
  const backendFilters  = useMemo(() => toBackendFilterGroups(debouncedGroups), [debouncedGroups]);

  const rows = useTableRows({
    tableName: activeName,
    filters:   backendFilters,
    cursor:    currentCursor,
    limit:     PAGE_SIZE,
  });

  const switchTable = (name: string) => {
    setSelectedTable(name);
    setGroups([]);
    resetPagination();
    setActiveTab('data');
    setDrawerOpen(false);
    setSelectedId(null);
    setSelectedRowKey(null);
  };

  const updateGroups = (next: FilterGroup[]) => {
    setGroups(next);
    resetPagination();
  };

  const closeDrawer = () => {
    setDrawerOpen(false);
    setSelectedId(null);
    setSelectedRowKey(null);
  };

  const hasNext = Boolean(rows.data?.nextCursor);

  // 本次 Profile 化实施新建的表：source_references + profile_*。其余为原有表。
  const { newTables, oldTables } = useMemo(() => {
    const isNew = (name: string) => name === 'source_references' || name.startsWith('profile_');
    return {
      newTables: tables.filter((t) => isNew(t.tableName)),
      oldTables: tables.filter((t) => !isNew(t.tableName)),
    };
  }, [tables]);

  const renderTableButton = (t: (typeof tables)[number]) => (
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
  );

  return (
    <div
      className="grid h-full min-h-0 gap-3 overflow-hidden"
      style={{ gridTemplateColumns: '280px minmax(0,1fr)' }}
    >
      <Panel
        title="表列表"
        icon={<Database size={18} />}
        className="flex h-full min-h-0 flex-col overflow-hidden"
      >
        <div className="min-h-0 flex-1 overflow-auto">
          <div className="grid gap-1">
            {newTables.length > 0 && (
              <div className="flex items-center gap-1.5 px-2 pt-1 pb-0.5 text-[10px] uppercase tracking-wide text-[var(--color-primary)]">
                本次新增 · Profile 化
                <span className="text-[var(--color-muted)] normal-case">({newTables.length})</span>
              </div>
            )}
            {newTables.map(renderTableButton)}
            {oldTables.length > 0 && (
              <div className="flex items-center gap-1.5 px-2 pt-2 pb-0.5 text-[10px] uppercase tracking-wide text-[var(--color-muted)]">
                原有表
                <span className="normal-case">({oldTables.length})</span>
              </div>
            )}
            {oldTables.map(renderTableButton)}
          </div>
        </div>
      </Panel>

      <div className="flex h-full min-h-0 flex-col gap-3 overflow-hidden">
        <div
          className="flex shrink-0 items-end gap-0"
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
          <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden">
            <Panel title={activeTable?.tableName ?? '—'} icon={<ListFilter size={18} />}>
              <FilterStrip columns={columns} groups={groups} onGroupsChange={updateGroups} />
            </Panel>

            {rows.isLoading ? (
              <EmptyState text="加载中…" />
            ) : (() => {
              const cols = rows.data?.columns ?? [];
              const data = rows.data?.rows ?? [];
              if (cols.length === 0) return <EmptyState text="暂无数据" />;
              return (
                <div className="flex min-h-0 flex-1 flex-col gap-3">
                  <DataTable
                    className="min-h-0 flex-1"
                    headers={cols.map((c) => c.columnName)}
                    rows={data.map((row, ri) => ({
                      key: ri,
                      cells: cols.map((c) => {
                        const val = row[c.columnName];
                        if (c.dataType.toLowerCase().startsWith('datetime') && val != null) {
                          return formatDateTime(String(val));
                        }
                        return truncate(val, 160);
                      }),
                    }))}
                    selectedRowKey={selectedRowKey}
                    onRowSelect={(_, ri) => {
                      const row = data[ri];
                      if (!row) return;
                      const id = row['id'] != null ? String(row['id']) : null;
                      setSelectedId(id);
                      setSelectedRowKey(ri);
                      setDrawerOpen(true);
                    }}
                  />
                  <Pagination
                    pageNumber={pageNumber}
                    pageSize={PAGE_SIZE}
                    hasNext={hasNext}
                    hasPrev={hasPrev}
                    onNext={() => { rows.data?.nextCursor && goNext(rows.data.nextCursor); closeDrawer(); }}
                    onPrev={() => { goPrev(); closeDrawer(); }}
                  />
                </div>
              );
            })()}
          </div>
        )}

        {activeTab === 'schema' && (
          <DataTable
            className="min-h-0 flex-1"
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

      {selectedId && (() => {
        const row = fullRow.data?.row ?? null;
        const dp = row ? buildDrawerProps(activeName, row) : { title: selectedId };
        return (
          <RowInspectorDrawer
            open={drawerOpen}
            onOpenChange={(open) => { if (!open) closeDrawer(); }}
            row={row ?? {}}
            loading={fullRow.isLoading}
            error={fullRow.error ? String(fullRow.error) : undefined}
            size="lg"
            {...dp}
          />
        );
      })()}
    </div>
  );
}

// ── Drawer builder ──────────────────────────────────────────────────────────

interface DrawerProps {
  title: string;
  subtitle?: string;
  overview?: readonly RowInspectorField[];
  fields?: readonly RowInspectorField[];
  textBlocks?: readonly RowInspectorTextBlock[];
}

function buildDrawerProps(tableName: string, row: Record<string, unknown>): DrawerProps {
  if (tableName === 'otel_raw_payloads')      return buildOtelRawPayloadProps(row);
  if (tableName === 'otel_log_events')         return buildOtelLogEventProps(row);
  if (tableName === 'sdd_interaction_texts')   return buildSddInteractionTextProps(row);
  if (tableName === 'sdd_errors')              return buildSddErrorProps(row);
  return buildGenericProps(row);
}

function str(row: Record<string, unknown>, key: string): string | null {
  return row[key] != null ? String(row[key]) : null;
}

function fmtDt(row: Record<string, unknown>, key: string): string | null {
  const s = str(row, key);
  return s == null ? null : formatDateTime(s);
}

function buildOtelRawPayloadProps(row: Record<string, unknown>): DrawerProps {
  return {
    title: str(row, 'batch_id') ?? '—',
    subtitle: `id: ${str(row, 'id') ?? '—'}`,
    overview: [
      { label: 'ID',           value: str(row, 'id'),           mono: true },
      { label: 'Batch ID',     value: str(row, 'batch_id'),     mono: true },
      { label: 'Bytes',        value: str(row, 'payload_bytes') },
      { label: 'Content Type', value: str(row, 'content_type') ?? '—' },
    ],
    fields: [
      { label: 'Expires At',  value: fmtDt(row, 'expires_at')   },
      { label: 'Created At',  value: fmtDt(row, 'gmt_create')   },
      { label: 'Modified At', value: fmtDt(row, 'gmt_modified') },
    ],
    textBlocks: [
      { title: 'payload_json', content: prettyJson(str(row, 'payload_json')), copyValue: str(row, 'payload_json') },
    ],
  };
}

function buildOtelLogEventProps(row: Record<string, unknown>): DrawerProps {
  const textBlocks: RowInspectorTextBlock[] = [];

  for (const key of ['attributes_json', 'resource_json', 'body_json'] as const) {
    if (row[key] != null) {
      const raw = typeof row[key] === 'string' ? row[key] as string : JSON.stringify(row[key]);
      textBlocks.push({ title: key, content: prettyJson(raw), copyValue: raw });
    }
  }
  if (row['body_text'] != null) {
    textBlocks.push({ title: 'body_text', content: str(row, 'body_text') });
  }

  return {
    title:    str(row, 'event_name') ?? '—',
    subtitle: str(row, 'event_id') ?? undefined,
    overview: [
      { label: 'Event Name', value: str(row, 'event_name') },
      { label: 'Severity',   value: str(row, 'severity_text') ?? (str(row, 'severity_number') ? `#${str(row, 'severity_number')}` : '—') },
      { label: 'Event Time', value: fmtDt(row, 'event_time') },
      { label: 'Service',    value: str(row, 'service_name') ?? '—' },
    ],
    fields: [
      { label: 'Event ID',         value: str(row, 'event_id'),          mono: true, copyValue: str(row, 'event_id') },
      { label: 'Batch ID',         value: str(row, 'batch_id'),          mono: true },
      { label: 'User ID',          value: str(row, 'user_id')          ?? '—', mono: true },
      { label: 'Session ID',       value: str(row, 'session_id')       ?? '—', mono: true },
      { label: 'Prompt ID',        value: str(row, 'prompt_id')        ?? '—', mono: true },
      { label: 'Trace ID',         value: str(row, 'trace_id')         ?? '—', mono: true },
      { label: 'Span ID',          value: str(row, 'span_id')          ?? '—', mono: true },
      { label: 'Service Version',  value: str(row, 'service_version')  ?? '—' },
      { label: 'Display Name',     value: str(row, 'display_name')     ?? '—' },
      { label: 'Observed At',      value: fmtDt(row, 'observed_at') },
      { label: 'Expires At',       value: fmtDt(row, 'expires_at')  },
    ],
    textBlocks,
  };
}

function buildSddInteractionTextProps(row: Record<string, unknown>): DrawerProps {
  return {
    title:    str(row, 'interaction_id') ?? '—',
    subtitle: `id: ${str(row, 'id') ?? '—'}`,
    overview: [
      { label: 'ID',             value: str(row, 'id'),             mono: true },
      { label: 'Interaction ID', value: str(row, 'interaction_id'), mono: true },
      { label: 'Expires At',     value: fmtDt(row, 'expires_at') },
      { label: 'Created At',     value: fmtDt(row, 'gmt_create') },
    ],
    textBlocks: [
      { title: 'prompt_text',   content: str(row, 'prompt_text'),                            copyValue: str(row, 'prompt_text')   },
      { title: 'response_text', content: str(row, 'response_text'),                          copyValue: str(row, 'response_text') },
      { title: 'response_json', content: prettyJson(str(row, 'response_json')),              copyValue: str(row, 'response_json') },
    ].filter((b) => b.content),
  };
}

function buildSddErrorProps(row: Record<string, unknown>): DrawerProps {
  return {
    title:    str(row, 'error_type') ?? '—',
    subtitle: str(row, 'error_key') ?? undefined,
    overview: [
      { label: 'Error Type', value: str(row, 'error_type')                                           },
      { label: 'Severity',   value: str(row, 'severity')                                             },
      { label: 'Retryable',  value: str(row, 'retryable') === '1' ? 'Yes' : 'No'                     },
      { label: 'Event Time', value: fmtDt(row, 'event_time')                                          },
    ],
    fields: [
      { label: 'ID',           value: str(row, 'id'),             mono: true                         },
      { label: 'Error Key',    value: str(row, 'error_key'),      mono: true, copyValue: str(row, 'error_key') },
      { label: 'Source',       value: str(row, 'source')       ?? '—'                                },
      { label: 'User ID',      value: str(row, 'user_id')      ?? '—', mono: true                   },
      { label: 'Batch ID',     value: str(row, 'batch_id')     ?? '—', mono: true                   },
      { label: 'Event ID',     value: str(row, 'event_id')     ?? '—', mono: true                   },
      { label: 'Interaction',  value: str(row, 'interaction_id') ?? '—', mono: true                 },
      { label: 'Work Item',    value: str(row, 'work_item_id') ?? '—', mono: true                   },
      { label: 'Msg Hash',     value: str(row, 'error_message_hash') ?? '—', mono: true             },
      { label: 'Stack Hash',   value: str(row, 'stack_hash')   ?? '—', mono: true                   },
      { label: 'Created At',   value: fmtDt(row, 'gmt_create')                                        },
    ],
    textBlocks: [
      { title: 'error_message', content: str(row, 'error_message'), copyValue: str(row, 'error_message') },
      { title: 'stack_trace',   content: str(row, 'stack_trace'),   copyValue: str(row, 'stack_trace')   },
    ].filter((b) => b.content),
  };
}

function buildGenericProps(row: Record<string, unknown>): DrawerProps {
  const fields: RowInspectorField[]     = [];
  const textBlocks: RowInspectorTextBlock[] = [];

  for (const [key, value] of Object.entries(row)) {
    if (value == null) {
      fields.push({ label: key, value: '—', muted: true });
      continue;
    }
    const raw = typeof value === 'object' ? JSON.stringify(value) : String(value);
    if (isJsonString(raw) || raw.length > 120) {
      textBlocks.push({ title: key, content: prettyJson(raw), copyValue: raw });
    } else {
      fields.push({ label: key, value: raw, mono: true });
    }
  }

  const firstVal = Object.values(row)[0];
  const title = str(row, 'id') ?? (firstVal != null ? String(firstVal) : '—');
  return { title, fields, textBlocks };
}

function prettyJson(raw: string | null | undefined): string {
  if (!raw) return '';
  try { return JSON.stringify(JSON.parse(raw), null, 2); } catch { return raw; }
}

function isJsonString(value: string): boolean {
  const t = value.trimStart();
  if (!t.startsWith('{') && !t.startsWith('[')) return false;
  try { JSON.parse(value); return true; } catch { return false; }
}
