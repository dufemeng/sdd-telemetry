import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  ColumnDef,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  SortingState,
  useReactTable,
} from '@tanstack/react-table';
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Clock3,
  Database,
  FileJson,
  Gauge,
  HardDrive,
  Layers3,
  ListTree,
  Plus,
  Radio,
  Search,
  Server,
  ShieldCheck,
  X,
  Users,
} from 'lucide-react';
import {
  api,
  DataQuality,
  DatabaseColumnInfo,
  DatabaseFilterCondition,
  DatabaseFilterGroup,
  DatabaseFilterOperator,
  DatabaseTableData,
  DatabaseTableInfo,
  ErrorInsightSummary,
  ErrorEventSource,
  EventDistribution,
  FieldAudit,
  IngestHealth,
  Interaction,
  RawBatchDetails,
  SkillFunnel,
  SkillUsage,
  UserMachineSummary,
  VersionDimensionSummary,
} from './api';

type View =
  | 'ingest'
  | 'events'
  | 'quality'
  | 'rawBatches'
  | 'skillFunnel'
  | 'errors'
  | 'users'
  | 'versions'
  | 'skills'
  | 'interactions'
  | 'raw'
  | 'schema'
  | 'database';

interface DataSourceProps {
  endpoint: string;
  fields: string[];
}

const TEXT_FILTER_OPERATORS: Array<{ value: DatabaseFilterOperator; label: string }> = [
  { value: 'eq', label: '等于 (=)' },
  { value: 'ne', label: '不等于 (!=)' },
  { value: 'contains', label: '包含 (LIKE)' },
  { value: 'not_contains', label: '不包含 (NOT LIKE)' },
  { value: 'in', label: '属于 (IN)' },
  { value: 'not_in', label: '不属于 (NOT IN)' },
  { value: 'gt', label: '大于 (>)' },
  { value: 'gte', label: '大于等于 (>=)' },
  { value: 'lt', label: '小于 (<)' },
  { value: 'lte', label: '小于等于 (<=)' },
];

const DATE_FILTER_OPERATORS: Array<{ value: DatabaseFilterOperator; label: string }> = [
  { value: 'between', label: '在区间内' },
  { value: 'eq', label: '等于 (=)' },
  { value: 'ne', label: '不等于 (!=)' },
  { value: 'gt', label: '大于 (>)' },
  { value: 'gte', label: '大于等于 (>=)' },
  { value: 'lt', label: '小于 (<)' },
  { value: 'lte', label: '小于等于 (<=)' },
];

function DataSource({ endpoint, fields }: DataSourceProps) {
  return (
    <div className="data-source" title={`${endpoint} -> ${fields.join(', ')}`}>
      <Server size={14} />
      <span>{endpoint}</span>
      <code>{fields.join(', ')}</code>
    </div>
  );
}

function formatTime(value: string | null) {
  if (!value) return 'unknown';
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

function formatDateTime(value: string | null) {
  if (!value) return 'unknown';
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(new Date(value));
}

function formatInteger(value: number | null | undefined) {
  return new Intl.NumberFormat('zh-CN').format(value ?? 0);
}

function formatPercent(value: number | null | undefined) {
  return new Intl.NumberFormat('zh-CN', {
    style: 'percent',
    maximumFractionDigits: 1,
  }).format(value ?? 0);
}

function formatMinutes(value: number | null) {
  if (value === null) return 'unknown';
  if (value < 1) return '刚刚';
  if (value < 60) return `${value} 分钟前`;
  const hours = Math.floor(value / 60);
  const minutes = value % 60;
  return minutes === 0 ? `${hours} 小时前` : `${hours} 小时 ${minutes} 分钟前`;
}

function compact(value: string | null | undefined, max = 160) {
  if (!value) return 'unknown';
  return value.length > max ? `${value.slice(0, max)}...` : value;
}

function eventDescription(eventName: string) {
  const descriptions: Record<string, string> = {
    api_request_body: 'Claude API 请求体快照，通常包含 prompt、上下文和工具调用输入。',
    api_response_body: 'Claude API 响应体快照，用于还原最终回答和中间 tool_use。',
    api_request: '一次 Claude API 请求发生记录，用于统计请求频率和时序。',
    api_error: 'Claude API 请求失败或异常记录，排查模型调用错误时优先关注。',
    user_prompt: '用户提交的原始 prompt 事件，是 prompt_id 交互链路的起点。',
    skill_activated: 'Claude Code 命中并激活 skill 的强证据，skill 统计主要依赖它。',
    tool_decision: '模型决定调用工具的事件，反映工具选择和执行前意图。',
    tool_result: '工具执行结果回传事件，可用于定位工具输出和后续回答关系。',
    hook_execution_start: 'Claude Code hook 开始执行事件，常用于观察本地扩展流程。',
    hook_execution_complete: 'Claude Code hook 执行完成事件，可用于判断 hook 是否正常结束。',
    mcp_server_connection: 'MCP server 连接状态事件，用于排查本地工具服务连接情况。',
  };

  return descriptions[eventName] ?? '未归类的 OTel 事件，需结合 attributes_json 和 body_json 进一步判断。';
}

function errorSourceLabel(source: ErrorEventSource) {
  const labels: Record<ErrorEventSource, string> = {
    api_error: 'api_error',
    api_retries_exhausted: '重试耗尽',
    severity: 'severity',
    tool_or_hook: 'tool / hook',
    weak_text: '弱文本',
  };
  return labels[source];
}

function makeClientId() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function isDateColumn(column: DatabaseColumnInfo | undefined) {
  if (!column) return false;
  const name = column.name.toLowerCase();
  const type = column.type.toLowerCase();
  return (
    type.includes('date') ||
    type.includes('time') ||
    name.includes('timestamp') ||
    name.endsWith('_at') ||
    name.endsWith('_time') ||
    name === 'received_at' ||
    name === 'logged_time' ||
    name === 'loged_time'
  );
}

function filterOperatorsForColumn(column: DatabaseColumnInfo | undefined) {
  return isDateColumn(column) ? DATE_FILTER_OPERATORS : TEXT_FILTER_OPERATORS;
}

function defaultFilterOperator(column: DatabaseColumnInfo | undefined): DatabaseFilterOperator {
  return isDateColumn(column) ? 'gte' : 'eq';
}

function formatDateInput(date: Date) {
  const pad = (value: number) => String(value).padStart(2, '0');
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
  ].join('-') + `T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

function startOfTodayInput() {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  return formatDateInput(date);
}

function endOfTodayInput() {
  const date = new Date();
  date.setHours(23, 59, 59, 0);
  return formatDateInput(date);
}

function defaultFilterValue(column: DatabaseColumnInfo | undefined) {
  return isDateColumn(column) ? startOfTodayInput() : '';
}

function toDateInputValue(value: string) {
  if (!value) return '';
  return value
    .replace(' ', 'T')
    .replace(/Z$/, '')
    .replace(/\.\d+$/, '')
    .slice(0, 19);
}

function fromDateInputValue(value: string) {
  if (!value) return '';
  return value.length === 16 ? `${value}:00` : value;
}

function displayFilterValue(condition: DatabaseFilterCondition) {
  const value = condition.value.replace('T', ' ').replace(/Z$/, '').replace(/\.\d+$/, '');
  if (condition.operator === 'between') {
    const valueTo = (condition.valueTo ?? '').replace('T', ' ').replace(/Z$/, '').replace(/\.\d+$/, '');
    return `${value} ~ ${valueTo}`;
  }
  return value;
}

function operatorLabel(operator: DatabaseFilterOperator) {
  return [...TEXT_FILTER_OPERATORS, DATE_FILTER_OPERATORS.find((item) => item.value === 'between')]
    .filter((item): item is { value: DatabaseFilterOperator; label: string } => Boolean(item))
    .find((item) => item.value === operator)?.label ?? operator;
}

function createFilterCondition(columns: DatabaseColumnInfo[], fieldName?: string): DatabaseFilterCondition {
  const column = columns.find((item) => item.name === fieldName) ?? columns[0];
  return {
    id: makeClientId(),
    field: column?.name ?? '',
    operator: defaultFilterOperator(column),
    value: defaultFilterValue(column),
  };
}

function compactFilterGroup(group: DatabaseFilterGroup): DatabaseFilterGroup | null {
  const conditions = group.conditions
    .map((condition) => ({
      ...condition,
      value: condition.value.trim(),
      valueTo: condition.valueTo?.trim(),
    }))
    .filter((condition) => {
      if (!condition.field || !condition.value) return false;
      return condition.operator !== 'between' || Boolean(condition.valueTo);
    });

  if (conditions.length === 0) {
    return null;
  }

  return {
    ...group,
    conditions,
  };
}

function compactFilterGroups(groups: DatabaseFilterGroup[]) {
  return groups
    .map((group) => compactFilterGroup(group))
    .filter((group): group is DatabaseFilterGroup => Boolean(group));
}

function summarizeFilterGroup(group: DatabaseFilterGroup) {
  return group.conditions
    .map((condition) => `${condition.field} ${operatorLabel(condition.operator)} ${displayFilterValue(condition)}`)
    .join(' 或 ');
}

function fieldExample(key: string, examples: string[]) {
  const example = examples[0];
  if (!example) return 'no example';
  if (key === 'sdd.skill.*.version' && example === '0.0.0-demo') {
    return '历史占位值 0.0.0-demo，派生版本已按 unknown 处理';
  }
  return example;
}

function StatCard({
  icon,
  label,
  value,
  source,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  source: string;
}) {
  return (
    <section className="stat-card">
      <div className="stat-icon">{icon}</div>
      <div>
        <p>{label}</p>
        <strong>{value}</strong>
        <span>{source}</span>
      </div>
    </section>
  );
}

function DataMap() {
  const rows = [
    {
      area: '采集健康',
      endpoint: 'GET /api/ingest/health',
      fields: 'lastReceivedAt, windows, totals, rawRetention',
    },
    {
      area: '事件类型分布',
      endpoint: 'GET /api/events/distribution',
      fields: 'topEvents, lastSeenAt, trendBuckets',
    },
    {
      area: '字段覆盖率',
      endpoint: 'GET /api/data-quality',
      fields: 'fields.coverage, recentSamples, warnings',
    },
    {
      area: 'Raw 批次详情',
      endpoint: 'GET /api/raw-batches',
      fields: 'batches.status, summary, errorMessage',
    },
    {
      area: 'Skill 调用漏斗',
      endpoint: 'GET /api/skills/funnel',
      fields: 'triggered, withPrompt, withResponse, successfulPairs',
    },
    {
      area: '异常 / 错误视图',
      endpoint: 'GET /api/errors/summary',
      fields: 'recentEvents, bySkill, bySession, byUser',
    },
    {
      area: '用户 / 机器维度',
      endpoint: 'GET /api/users/machines',
      fields: 'installId, displayName, skillCallCount, errorEventCount',
    },
    {
      area: '版本维度分析',
      endpoint: 'GET /api/skills/versions',
      fields: 'observedSkillVersion, calls, errorEvents, daily',
    },
    {
      area: '顶部核心指标',
      endpoint: 'GET /health',
      fields: 'rawBatches, normalizedEvents, interactions, skillUsages, activeSkillUsers',
    },
    {
      area: 'Skill 使用概览',
      endpoint: 'GET /api/skills/usage',
      fields: 'skillName, calls, activeUsers, sessions, versions',
    },
    {
      area: 'Skill 调用明细',
      endpoint: 'GET /api/skills/:name/interactions',
      fields: 'promptText, responseText, observedSkillVersion, evidence',
    },
    {
      area: 'Raw 字段审计',
      endpoint: 'GET /debug/field-audit',
      fields: 'fields, eventNames, resourceAttributes, recentBatches',
    },
    {
      area: '表结构',
      endpoint: 'GET /debug/db/tables',
      fields: 'tables, columns, estimatedBytes(max), sizeBasis',
    },
    {
      area: '数据库检索',
      endpoint: 'GET /debug/db/tables/:table/data',
      fields: 'rows, field, q, pagination',
    },
  ];

  return (
    <section className="data-map">
      <div className="section-title">
        <ListTree size={18} />
        <h2>页面消费的后端数据</h2>
      </div>
      <div className="data-map-grid">
        {rows.map((row) => (
          <div key={row.area} className="data-map-row">
            <strong>{row.area}</strong>
            <span>{row.endpoint}</span>
            <code>{row.fields}</code>
          </div>
        ))}
      </div>
    </section>
  );
}

function SkillsTable({
  data,
  selectedSkill,
  onSelectSkill,
}: {
  data: SkillUsage[];
  selectedSkill: string;
  onSelectSkill: (skillName: string) => void;
}) {
  const [sorting, setSorting] = useState<SortingState>([{ id: 'calls', desc: true }]);
  const columns = useMemo<ColumnDef<SkillUsage>[]>(
    () => [
      {
        accessorKey: 'skillName',
        header: 'Skill',
        cell: ({ row }) => (
          <button
            className={row.original.skillName === selectedSkill ? 'skill-link active' : 'skill-link'}
            onClick={() => onSelectSkill(row.original.skillName)}
          >
            {row.original.skillName}
          </button>
        ),
      },
      { accessorKey: 'calls', header: '调用次数' },
      { accessorKey: 'activeUsers', header: '活跃用户' },
      { accessorKey: 'sessions', header: '会话数' },
      {
        id: 'versions',
        header: '版本分布',
        cell: ({ row }) => row.original.versions.map((item) => `${item.version} (${item.calls})`).join(', '),
      },
      {
        accessorKey: 'firstSeenAt',
        header: '首次出现',
        cell: ({ row }) => formatTime(row.original.firstSeenAt),
      },
      {
        accessorKey: 'lastSeenAt',
        header: '最近出现',
        cell: ({ row }) => formatTime(row.original.lastSeenAt),
      },
    ],
    [onSelectSkill, selectedSkill],
  );
  const table = useReactTable({
    data,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  return <Table table={table} />;
}

function InteractionsTable({ data }: { data: Interaction[] }) {
  const [sorting, setSorting] = useState<SortingState>([{ id: 'endedAt', desc: true }]);
  const columns = useMemo<ColumnDef<Interaction>[]>(
    () => [
      {
        accessorKey: 'endedAt',
        header: '时间',
        cell: ({ row }) => formatTime(row.original.endedAt ?? row.original.startedAt),
      },
      {
        accessorKey: 'displayName',
        header: '用户',
        cell: ({ row }) => row.original.displayName ?? row.original.installId ?? 'unknown',
      },
      {
        accessorKey: 'observedSkillVersion',
        header: '版本',
        cell: ({ row }) => row.original.observedSkillVersion ?? 'unknown',
      },
      {
        accessorKey: 'promptText',
        header: '用户 Prompt',
        cell: ({ row }) => <span className="long-text">{compact(row.original.promptText, 180)}</span>,
      },
      {
        accessorKey: 'responseText',
        header: 'Claude 回复',
        cell: ({ row }) => <span className="long-text">{compact(row.original.responseText, 220)}</span>,
      },
      {
        accessorKey: 'pairingConfidence',
        header: '配对证据',
        cell: ({ row }) => (
          <span className={row.original.pairingConfidence === 'high' ? 'pill good' : 'pill warn'}>
            {row.original.pairingMethod}:{row.original.pairingConfidence}
          </span>
        ),
      },
      { accessorKey: 'eventCount', header: '事件数' },
      { accessorKey: 'apiResponseCount', header: 'API 回复数' },
    ],
    [],
  );
  const table = useReactTable({
    data,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  return <Table table={table} />;
}

function Table<T>({ table }: { table: ReturnType<typeof useReactTable<T>> }) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          {table.getHeaderGroups().map((headerGroup) => (
            <tr key={headerGroup.id}>
              {headerGroup.headers.map((header) => (
                <th key={header.id}>
                  {header.isPlaceholder
                    ? null
                    : flexRender(header.column.columnDef.header, header.getContext())}
                </th>
              ))}
            </tr>
          ))}
        </thead>
        <tbody>
          {table.getRowModel().rows.map((row) => (
            <tr key={row.id}>
              {row.getVisibleCells().map((cell) => (
                <td key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function RawAudit({ audit }: { audit?: FieldAudit }) {
  const fields = audit
    ? Object.entries(audit.fields).filter(([key]) =>
        [
          'sdd.display_name',
          'sdd.install_id',
          'sdd.skill.*.version',
          'session.id',
          'prompt.id',
          'event.name',
          'prompt',
          'skill.name',
          'tool_name',
          'tool_parameters',
        ].includes(key),
      )
    : [];
  const eventRows = audit
    ? Object.entries(audit.eventNames).sort((a, b) => b[1] - a[1])
    : [];

  return (
    <div className="raw-grid">
      <section className="panel">
        <div className="section-title">
          <ShieldCheck size={18} />
          <h2>关键字段覆盖</h2>
        </div>
        <DataSource
          endpoint="GET /debug/field-audit"
          fields={['fields.*.found', 'fields.*.count', 'fields.*.examples']}
        />
        <div className="field-list">
          {fields.map(([key, hit]) => (
            <div key={key} className="field-row">
              <span className={hit.found ? 'dot found' : 'dot'} />
              <strong>{key}</strong>
              <span>{hit.count}</span>
              <code>{fieldExample(key, hit.examples)}</code>
            </div>
          ))}
        </div>
      </section>
      <section className="panel">
        <div className="section-title">
          <Activity size={18} />
          <h2>事件分布</h2>
        </div>
        <DataSource endpoint="GET /debug/field-audit" fields={['eventNames']} />
        <div className="event-list">
          {eventRows.map(([name, count]) => (
            <div key={name} className="event-row">
              <span>{name}</span>
              <strong>{count}</strong>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function formatBytes(value: number) {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KiB`;
  return `${(value / 1024 / 1024).toFixed(2)} MiB`;
}

function IngestHealthPage({ data }: { data?: IngestHealth }) {
  const statusMeta = {
    receiving: {
      label: '正在接收',
      detail: '最近 5 分钟内有上报',
      icon: <Radio size={20} />,
    },
    idle: {
      label: '可能断流',
      detail: '超过 5 分钟未收到上报',
      icon: <Clock3 size={20} />,
    },
    empty: {
      label: '暂无数据',
      detail: '还没有收到任何 OTel 批次',
      icon: <AlertTriangle size={20} />,
    },
  }[data?.collectorStatus ?? 'empty'];
  const totals = data?.totals;
  const retention = data?.rawRetention;

  return (
    <div className="ingest-page">
      <section className="panel ingest-overview">
        <div className="section-header">
          <div className="section-title">
            <Activity size={18} />
            <h2>采集健康</h2>
          </div>
          <span className="generated-at">刷新于 {formatDateTime(data?.generatedAt ?? null)}</span>
        </div>
        <DataSource
          endpoint="GET /api/ingest/health"
          fields={['lastReceivedAt', 'windows', 'totals', 'rawRetention']}
        />
        <div className="ingest-status-grid">
          <div className={`ingest-status ${data?.collectorStatus ?? 'empty'}`}>
            <div className="ingest-status-icon">{statusMeta.icon}</div>
            <div>
              <p>{statusMeta.detail}</p>
              <strong>{statusMeta.label}</strong>
              <span>最近上报：{formatDateTime(data?.lastReceivedAt ?? null)}</span>
              <code>{formatMinutes(data?.minutesSinceLastReceived ?? null)}</code>
            </div>
          </div>
          <div className="ingest-kpi-grid">
            <div className="ingest-kpi">
              <span>成功批次</span>
              <strong>{formatInteger(totals?.parsedBatches)}</strong>
              <code>status=parsed</code>
            </div>
            <div className="ingest-kpi">
              <span>失败批次</span>
              <strong>{formatInteger(totals?.failedBatches)}</strong>
              <code>status=failed</code>
            </div>
            <div className="ingest-kpi">
              <span>重复批次</span>
              <strong>{formatInteger(totals?.duplicateBatches)}</strong>
              <code>payload_hash duplicate</code>
            </div>
            <div className="ingest-kpi">
              <span>待解析批次</span>
              <strong>{formatInteger(totals?.receivedBatches)}</strong>
              <code>status=received</code>
            </div>
          </div>
        </div>
      </section>

      <div className="ingest-grid">
        <section className="panel">
          <div className="section-title">
            <Gauge size={18} />
            <h2>最近窗口</h2>
          </div>
          <DataSource endpoint="GET /api/ingest/health" fields={['windows.5m', 'windows.15m', 'windows.60m']} />
          <div className="table-wrap ingest-window-table">
            <table>
              <thead>
                <tr>
                  <th>窗口</th>
                  <th>批次数</th>
                  <th>事件数</th>
                  <th>失败批次</th>
                  <th>payload size</th>
                  <th>起始时间</th>
                </tr>
              </thead>
              <tbody>
                {(data?.windows ?? []).map((window) => (
                  <tr key={window.minutes}>
                    <td>最近 {window.minutes} 分钟</td>
                    <td><strong>{formatInteger(window.batchCount)}</strong></td>
                    <td>{formatInteger(window.eventCount)}</td>
                    <td>{formatInteger(window.failedBatches)}</td>
                    <td>{formatBytes(window.payloadBytes)}</td>
                    <td>{formatDateTime(window.since)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="panel">
          <div className="section-title">
            <HardDrive size={18} />
            <h2>Raw payload 保留</h2>
          </div>
          <DataSource endpoint="GET /api/ingest/health" fields={['totals.rawPayloadBytes', 'rawRetention']} />
          <div className="retention-list">
            <div>
              <span>raw payload 总大小</span>
              <strong>{formatBytes(totals?.rawPayloadBytes ?? 0)}</strong>
            </div>
            <div>
              <span>raw payload 批次</span>
              <strong>{formatInteger(totals?.rawPayloads)}</strong>
            </div>
            <div>
              <span>最早到期时间</span>
              <strong>{formatDateTime(retention?.oldestRawExpiresAt ?? null)}</strong>
            </div>
            <div>
              <span>保留策略</span>
              <strong>{retention ? `${retention.retentionDays} 天 / ${formatInteger(retention.maxBatches)} 批` : 'unknown'}</strong>
            </div>
          </div>
        </section>
      </div>

      <section className="panel">
        <div className="section-title">
          <AlertTriangle size={18} />
          <h2>最近失败批次</h2>
        </div>
        <DataSource endpoint="GET /api/ingest/health" fields={['recentFailures']} />
        <div className="table-wrap failure-table">
          <table>
            <thead>
              <tr>
                <th>batch_id</th>
                <th>接收时间</th>
                <th>payload size</th>
                <th>log records</th>
                <th>错误信息</th>
              </tr>
            </thead>
            <tbody>
              {(data?.recentFailures ?? []).map((failure) => (
                <tr key={failure.batchId}>
                  <td><code>{failure.batchId}</code></td>
                  <td>{formatDateTime(failure.receivedAt)}</td>
                  <td>{formatBytes(failure.payloadBytes)}</td>
                  <td>{formatInteger(failure.logRecordCount)}</td>
                  <td>{failure.errorMessage ?? 'unknown'}</td>
                </tr>
              ))}
              {data && data.recentFailures.length === 0 && (
                <tr>
                  <td colSpan={5}>暂无失败批次</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function EventDistributionPage({
  data,
  hours,
  onHoursChange,
}: {
  data?: EventDistribution;
  hours: number;
  onHoursChange: (hours: number) => void;
}) {
  const maxEventCount = Math.max(1, ...((data?.topEvents ?? []).map((event) => event.count)));
  const maxTrendCount = Math.max(1, ...((data?.trendBuckets ?? []).map((bucket) => bucket.eventCount)));
  const peakBucket = (data?.trendBuckets ?? []).reduce<
    EventDistribution['trendBuckets'][number] | null
  >((peak, bucket) => (!peak || bucket.eventCount > peak.eventCount ? bucket : peak), null);

  return (
    <div className="events-page">
      <section className="panel events-overview">
        <div className="section-header">
          <div className="section-title">
            <Activity size={18} />
            <h2>事件类型分布</h2>
          </div>
          <div className="segmented-control" aria-label="事件统计窗口">
            {[6, 24, 72].map((item) => (
              <button
                key={item}
                type="button"
                className={hours === item ? 'active' : ''}
                onClick={() => onHoursChange(item)}
              >
                {item}h
              </button>
            ))}
          </div>
        </div>
        <DataSource
          endpoint={`GET /api/events/distribution?hours=${hours}&limit=20`}
          fields={['log_events.event_name', 'log_events.received_at', 'log_events.event_timestamp']}
        />
        <div className="events-summary-grid">
          <div className="event-summary-card">
            <span>统计窗口</span>
            <strong>最近 {data?.hours ?? hours} 小时</strong>
            <code>since {formatDateTime(data?.since ?? null)}</code>
          </div>
          <div className="event-summary-card">
            <span>事件总量</span>
            <strong>{formatInteger(data?.totalEvents)}</strong>
            <code>log_events rows</code>
          </div>
          <div className="event-summary-card">
            <span>事件类型数</span>
            <strong>{formatInteger(data?.distinctEventNames)}</strong>
            <code>distinct event_name</code>
          </div>
          <div className="event-summary-card">
            <span>峰值小时</span>
            <strong>{formatInteger(peakBucket?.eventCount)}</strong>
            <code>{peakBucket ? formatDateTime(peakBucket.bucketStart) : 'unknown'}</code>
          </div>
        </div>
      </section>

      <div className="events-grid">
        <section className="panel">
          <div className="section-title">
            <ListTree size={18} />
            <h2>event_name Top N</h2>
          </div>
          <DataSource endpoint="GET /api/events/distribution" fields={['topEvents.count', 'topEvents.lastSeenAt']} />
          <div className="event-top-list">
            {(data?.topEvents ?? []).map((event) => (
              <div key={event.eventName} className="event-top-row">
                <div>
                  <strong>{event.eventName}</strong>
                  <small className="event-description">{eventDescription(event.eventName)}</small>
                  <span className="event-last-seen">最近出现：{formatDateTime(event.lastSeenAt)}</span>
                </div>
                <div className="event-bar-cell">
                  <div className="event-bar-track">
                    <span style={{ width: `${Math.max(4, (event.count / maxEventCount) * 100)}%` }} />
                  </div>
                  <code>{formatInteger(event.count)} · {formatPercent(event.share)}</code>
                </div>
              </div>
            ))}
            {data && data.topEvents.length === 0 && (
              <div className="empty-state">当前窗口内暂无事件</div>
            )}
          </div>
        </section>

        <section className="panel">
          <div className="section-title">
            <Gauge size={18} />
            <h2>事件量趋势</h2>
          </div>
          <DataSource endpoint="GET /api/events/distribution" fields={['trendBuckets.eventCount', 'trendBuckets.topEventName']} />
          <div className="event-trend-chart">
            {(data?.trendBuckets ?? []).map((bucket) => (
              <div key={bucket.bucketStart} className="trend-column" title={`${formatDateTime(bucket.bucketStart)}: ${bucket.eventCount}`}>
                <div className="trend-column-bar">
                  <span style={{ height: `${Math.max(3, (bucket.eventCount / maxTrendCount) * 100)}%` }} />
                </div>
                <code>{new Date(bucket.bucketStart).getHours().toString().padStart(2, '0')}</code>
              </div>
            ))}
          </div>
        </section>
      </div>

      <section className="panel">
        <div className="section-title">
          <Database size={18} />
          <h2>事件类型明细</h2>
        </div>
        <DataSource endpoint="GET /api/events/distribution" fields={['eventName', 'count', 'firstSeenAt', 'lastSeenAt']} />
        <div className="table-wrap event-detail-table">
          <table>
            <thead>
              <tr>
                <th>event_name</th>
                <th>数量</th>
                <th>占比</th>
                <th>首次出现</th>
                <th>最近出现</th>
                <th>最近接收</th>
              </tr>
            </thead>
            <tbody>
              {(data?.topEvents ?? []).map((event) => (
                <tr key={event.eventName}>
                  <td><code>{event.eventName}</code></td>
                  <td><strong>{formatInteger(event.count)}</strong></td>
                  <td>{formatPercent(event.share)}</td>
                  <td>{formatDateTime(event.firstSeenAt)}</td>
                  <td>{formatDateTime(event.lastSeenAt)}</td>
                  <td>{formatDateTime(event.lastReceivedAt)}</td>
                </tr>
              ))}
              {data && data.topEvents.length === 0 && (
                <tr>
                  <td colSpan={6}>当前窗口内暂无事件</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function DataQualityPage({ data }: { data?: DataQuality }) {
  const totals = data?.totals;
  const promptCoverage = totals && totals.promptInteractions > 0
    ? totals.interactionsWithPrompt / totals.promptInteractions
    : 0;
  const responseCoverage = totals && totals.promptInteractions > 0
    ? totals.interactionsWithResponse / totals.promptInteractions
    : 0;
  const highConfidenceRate = totals && totals.promptInteractions > 0
    ? totals.highConfidenceInteractions / totals.promptInteractions
    : 0;

  return (
    <div className="quality-page">
      <section className="panel">
        <div className="section-header">
          <div className="section-title">
            <ShieldCheck size={18} />
            <h2>字段覆盖率 / 数据质量</h2>
          </div>
          <span className="generated-at">刷新于 {formatDateTime(data?.generatedAt ?? null)}</span>
        </div>
        <DataSource
          endpoint="GET /api/data-quality"
          fields={['fields.coverage', 'recentSamples', 'warnings']}
        />
        <div className="quality-summary-grid">
          <div className="quality-summary-card">
            <span>log_events</span>
            <strong>{formatInteger(totals?.logEvents)}</strong>
            <code>标准化事件</code>
          </div>
          <div className="quality-summary-card">
            <span>prompt 交互</span>
            <strong>{formatInteger(totals?.promptInteractions)}</strong>
            <code>prompt_interactions</code>
          </div>
          <div className="quality-summary-card">
            <span>高置信配对</span>
            <strong>{formatPercent(highConfidenceRate)}</strong>
            <code>{formatInteger(totals?.highConfidenceInteractions)} high</code>
          </div>
          <div className="quality-summary-card">
            <span>质量提示</span>
            <strong>{formatInteger(data?.warnings.length)}</strong>
            <code>warn / bad</code>
          </div>
        </div>
      </section>

      <div className="quality-grid">
        <section className="panel">
          <div className="section-title">
            <ListTree size={18} />
            <h2>关键字段非空率</h2>
          </div>
          <DataSource endpoint="GET /api/data-quality" fields={['log_events.*']} />
          <div className="quality-field-list">
            {(data?.fields ?? []).map((field) => (
              <div key={field.field} className="quality-field-row">
                <div className="quality-field-heading">
                  <div>
                    <strong>{field.field}</strong>
                    <span>{field.note}</span>
                  </div>
                  <span className={`quality-status ${field.status}`}>{field.status}</span>
                </div>
                <div className="quality-bar-track">
                  <span style={{ width: `${Math.max(2, field.coverage * 100)}%` }} />
                </div>
                <div className="quality-field-meta">
                  <code>{formatInteger(field.nonNullRows)} / {formatInteger(field.totalRows)}</code>
                  <span>{formatPercent(field.coverage)}</span>
                  <span>最近：{formatDateTime(field.lastSeenAt)}</span>
                </div>
                <div className="sample-list">
                  {field.recentSamples.length > 0
                    ? field.recentSamples.map((sample) => <code key={sample}>{compact(sample, 80)}</code>)
                    : <code>暂无非空样例</code>}
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="panel">
          <div className="section-title">
            <AlertTriangle size={18} />
            <h2>异常字段缺失提示</h2>
          </div>
          <DataSource endpoint="GET /api/data-quality" fields={['warnings']} />
          <div className="warning-list">
            {(data?.warnings ?? []).map((warning) => (
              <div key={`${warning.field}-${warning.message}`} className={`warning-row ${warning.severity}`}>
                <strong>{warning.field}</strong>
                <span>{warning.message}</span>
              </div>
            ))}
            {data && data.warnings.length === 0 && (
              <div className="empty-state">关键字段覆盖率符合当前规则</div>
            )}
          </div>
          <div className="derived-quality">
            <div>
              <span>prompt_text 覆盖</span>
              <strong>{formatPercent(promptCoverage)}</strong>
              <code>{formatInteger(totals?.interactionsWithPrompt)} / {formatInteger(totals?.promptInteractions)}</code>
            </div>
            <div>
              <span>response_text 覆盖</span>
              <strong>{formatPercent(responseCoverage)}</strong>
              <code>{formatInteger(totals?.interactionsWithResponse)} / {formatInteger(totals?.promptInteractions)}</code>
            </div>
            <div>
              <span>skill 调用</span>
              <strong>{formatInteger(totals?.skillInvocations)}</strong>
              <code>skill_invocations</code>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

function RawBatchDetailsPage({ data }: { data?: RawBatchDetails }) {
  const [expandedBatchId, setExpandedBatchId] = useState<string | null>(null);
  const totals = data?.totals;
  const expandedBatch = data?.batches.find((batch) => batch.batchId === expandedBatchId) ?? null;

  return (
    <div className="raw-batches-page">
      <section className="panel">
        <div className="section-header">
          <div className="section-title">
            <FileJson size={18} />
            <h2>Raw 批次详情</h2>
          </div>
          <span className="generated-at">刷新于 {formatDateTime(data?.generatedAt ?? null)}</span>
        </div>
        <DataSource endpoint="GET /api/raw-batches" fields={['ingest_batches', 'raw_payloads', 'summary_json']} />
        <div className="raw-batch-summary-grid">
          <div>
            <span>总批次</span>
            <strong>{formatInteger(totals?.ingestBatches)}</strong>
            <code>ingest_batches</code>
          </div>
          <div>
            <span>parsed</span>
            <strong>{formatInteger(totals?.parsedBatches)}</strong>
            <code>解析成功</code>
          </div>
          <div>
            <span>failed</span>
            <strong>{formatInteger(totals?.failedBatches)}</strong>
            <code>解析失败</code>
          </div>
          <div>
            <span>raw size</span>
            <strong>{formatBytes(totals?.rawPayloadBytes ?? 0)}</strong>
            <code>payload_bytes</code>
          </div>
        </div>
      </section>

      <section className="panel">
        <div className="section-title">
          <Database size={18} />
          <h2>最近 {data?.limit ?? 50} 个批次</h2>
        </div>
        <DataSource endpoint="GET /api/raw-batches" fields={['status', 'payloadBytes', 'logRecordCount', 'rawExpiresAt']} />
        <div className="table-wrap raw-batch-table">
          <table>
            <thead>
              <tr>
                <th>状态</th>
                <th>接收时间</th>
                <th>payload</th>
                <th>log records</th>
                <th>重复</th>
                <th>raw 到期</th>
                <th>batch_id</th>
              </tr>
            </thead>
            <tbody>
              {(data?.batches ?? []).map((batch) => (
                <tr
                  key={batch.batchId}
                  className={expandedBatchId === batch.batchId ? 'selected-row' : ''}
                  onClick={() => setExpandedBatchId(expandedBatchId === batch.batchId ? null : batch.batchId)}
                >
                  <td><span className={`batch-status ${batch.status}`}>{batch.status}</span></td>
                  <td>{formatDateTime(batch.receivedAt)}</td>
                  <td>{formatBytes(batch.payloadBytes)}</td>
                  <td>{formatInteger(batch.logRecordCount)}</td>
                  <td>{formatInteger(batch.duplicateCount)}</td>
                  <td>{formatDateTime(batch.rawExpiresAt)}</td>
                  <td><code>{batch.batchId}</code></td>
                </tr>
              ))}
              {data && data.batches.length === 0 && (
                <tr>
                  <td colSpan={7}>暂无批次</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {expandedBatch && (
        <section className="panel raw-batch-detail">
          <div className="section-header">
            <div className="section-title">
              <FileJson size={18} />
              <h2>summary_json</h2>
            </div>
            <code>{expandedBatch.batchId}</code>
          </div>
          <div className="raw-batch-detail-grid">
            <div>
              <span>payload_hash</span>
              <code>{expandedBatch.payloadHash}</code>
            </div>
            <div>
              <span>last_duplicate_at</span>
              <code>{formatDateTime(expandedBatch.lastDuplicateAt)}</code>
            </div>
            <div>
              <span>raw_available</span>
              <code>{String(expandedBatch.rawAvailable)}</code>
            </div>
            <div>
              <span>error_message</span>
              <code>{expandedBatch.errorMessage ?? 'NULL'}</code>
            </div>
          </div>
          <pre className="json-preview">{JSON.stringify(expandedBatch.summary, null, 2)}</pre>
        </section>
      )}
    </div>
  );
}

function SkillFunnelPage({ data }: { data?: SkillFunnel }) {
  const totals = data?.totals;
  const triggered = totals?.triggered ?? 0;
  const maxTriggered = Math.max(1, ...((data?.rows ?? []).map((row) => row.triggered)));
  const stageWidth = (value: number, denominator = triggered) => {
    if (value <= 0 || denominator <= 0) return '0%';
    return `${Math.max(4, (value / denominator) * 100)}%`;
  };
  const pairRate = triggered > 0 ? (totals?.successfulPairs ?? 0) / triggered : 0;
  const lowConfidenceRate = triggered > 0 ? (totals?.lowConfidencePairs ?? 0) / triggered : 0;
  const stages = [
    { label: '触发', value: totals?.triggered ?? 0, detail: 'skill_invocations' },
    { label: '有 prompt', value: totals?.withPrompt ?? 0, detail: 'prompt_text 非空' },
    { label: '有 response', value: totals?.withResponse ?? 0, detail: 'response_text 非空' },
    { label: '成功配对', value: totals?.successfulPairs ?? 0, detail: 'pairing_confidence=high' },
  ];

  return (
    <div className="skill-funnel-page">
      <section className="panel">
        <div className="section-header">
          <div className="section-title">
            <CheckCircle2 size={18} />
            <h2>Skill 调用漏斗</h2>
          </div>
          <span className="generated-at">刷新于 {formatDateTime(data?.generatedAt ?? null)}</span>
        </div>
        <DataSource
          endpoint="GET /api/skills/funnel"
          fields={['skill_invocations', 'prompt_interactions', 'pairing_confidence']}
        />
        <div className="funnel-summary-grid">
          <div>
            <span>触发次数</span>
            <strong>{formatInteger(totals?.triggered)}</strong>
            <code>skill_invocations</code>
          </div>
          <div>
            <span>成功配对率</span>
            <strong>{formatPercent(pairRate)}</strong>
            <code>{formatInteger(totals?.successfulPairs)} high</code>
          </div>
          <div>
            <span>低置信配对</span>
            <strong>{formatInteger(totals?.lowConfidencePairs)}</strong>
            <code>{formatPercent(lowConfidenceRate)}</code>
          </div>
          <div>
            <span>活跃用户 / 会话</span>
            <strong>{formatInteger(totals?.activeUsers)} / {formatInteger(totals?.sessions)}</strong>
            <code>distinct install_id / session_id</code>
          </div>
        </div>
        <div className="funnel-stage-row">
          {stages.map((stage) => (
            <div key={stage.label} className="funnel-stage">
              <div>
                <span>{stage.label}</span>
                <strong>{formatInteger(stage.value)}</strong>
                <code>{stage.detail}</code>
              </div>
              <div className="funnel-stage-track">
                <span style={{ width: stageWidth(stage.value) }} />
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="panel">
        <div className="section-title">
          <ListTree size={18} />
          <h2>按 Skill 拆分</h2>
        </div>
        <DataSource
          endpoint="GET /api/skills/funnel"
          fields={['rows.skillName', 'withPrompt', 'withResponse', 'successfulPairs', 'lowConfidencePairs']}
        />
        <div className="table-wrap skill-funnel-table">
          <table>
            <thead>
              <tr>
                <th>Skill</th>
                <th>触发</th>
                <th>Prompt</th>
                <th>Response</th>
                <th>成功配对</th>
                <th>低置信</th>
                <th>用户 / 会话</th>
                <th>最近出现</th>
              </tr>
            </thead>
            <tbody>
              {(data?.rows ?? []).map((row) => {
                const promptRate = row.triggered > 0 ? row.withPrompt / row.triggered : 0;
                const responseRate = row.triggered > 0 ? row.withResponse / row.triggered : 0;
                const successRate = row.triggered > 0 ? row.successfulPairs / row.triggered : 0;

                return (
                  <tr key={row.skillName}>
                    <td>
                      <code>{row.skillName}</code>
                      <div className="row-bar-track">
                        <span style={{ width: stageWidth(row.triggered, maxTriggered) }} />
                      </div>
                    </td>
                    <td><strong>{formatInteger(row.triggered)}</strong></td>
                    <td>{formatInteger(row.withPrompt)} · {formatPercent(promptRate)}</td>
                    <td>{formatInteger(row.withResponse)} · {formatPercent(responseRate)}</td>
                    <td><span className="pill good">{formatInteger(row.successfulPairs)} · {formatPercent(successRate)}</span></td>
                    <td><span className={row.lowConfidencePairs > 0 ? 'pill warn' : 'pill good'}>{formatInteger(row.lowConfidencePairs)}</span></td>
                    <td>{formatInteger(row.activeUsers)} / {formatInteger(row.sessions)}</td>
                    <td>{formatDateTime(row.lastSeenAt)}</td>
                  </tr>
                );
              })}
              {data && data.rows.length === 0 && (
                <tr>
                  <td colSpan={8}>暂无 skill 调用</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function UserMachinePage({ data }: { data?: UserMachineSummary }) {
  const totals = data?.totals;
  const maxSkillCalls = Math.max(1, ...((data?.rows ?? []).map((row) => row.skillCallCount)));

  return (
    <div className="user-machines-page">
      <section className="panel">
        <div className="section-header">
          <div className="section-title">
            <Users size={18} />
            <h2>用户 / 机器维度分析</h2>
          </div>
          <span className="generated-at">刷新于 {formatDateTime(data?.generatedAt ?? null)}</span>
        </div>
        <DataSource
          endpoint="GET /api/users/machines?limit=50"
          fields={['install_id', 'display_name', 'skill_calls', 'error_events']}
        />
        <div className="user-summary-grid">
          <div>
            <span>总 install_id</span>
            <strong>{formatInteger(totals?.installs)}</strong>
            <code>distinct install_id</code>
          </div>
          <div>
            <span>7 天活跃</span>
            <strong>{formatInteger(totals?.activeInstalls)}</strong>
            <code>log_events last 7d</code>
          </div>
          <div>
            <span>Skill 调用</span>
            <strong>{formatInteger(totals?.skillCalls)}</strong>
            <code>skill_invocations</code>
          </div>
          <div>
            <span>异常事件</span>
            <strong>{formatInteger(totals?.errorEvents)}</strong>
            <code>api_error / error text</code>
          </div>
        </div>
      </section>

      <section className="panel">
        <div className="section-title">
          <Database size={18} />
          <h2>用户 / 机器列表</h2>
        </div>
        <DataSource
          endpoint="GET /api/users/machines"
          fields={['rows.eventCount', 'rows.interactionCount', 'rows.skillCallCount', 'rows.recentSkills']}
        />
        <div className="table-wrap user-machine-table">
          <table>
            <thead>
              <tr>
                <th>用户 / 机器</th>
                <th>事件</th>
                <th>交互</th>
                <th>Skill 调用</th>
                <th>Skill 种类</th>
                <th>会话</th>
                <th>异常</th>
                <th>Top skills</th>
                <th>最近活跃</th>
              </tr>
            </thead>
            <tbody>
              {(data?.rows ?? []).map((row) => (
                <tr key={row.installId}>
                  <td>
                    <strong>{row.displayName ?? 'unknown'}</strong>
                    <code className="user-install-id">{row.installId}</code>
                    <span>{row.serviceName ?? 'unknown'} {row.serviceVersion ?? ''}</span>
                  </td>
                  <td>{formatInteger(row.eventCount)}</td>
                  <td>{formatInteger(row.interactionCount)}</td>
                  <td>
                    <strong>{formatInteger(row.skillCallCount)}</strong>
                    <div className="row-bar-track">
                      <span style={{ width: row.skillCallCount > 0 ? `${Math.max(4, (row.skillCallCount / maxSkillCalls) * 100)}%` : '0%' }} />
                    </div>
                  </td>
                  <td>{formatInteger(row.distinctSkills)}</td>
                  <td>{formatInteger(row.sessionCount)}</td>
                  <td>
                    <span className={row.errorEventCount > 0 ? 'pill warn' : 'pill good'}>
                      {formatInteger(row.errorEventCount)}
                    </span>
                  </td>
                  <td>
                    <div className="skill-chip-list">
                      {row.recentSkills.length > 0
                        ? row.recentSkills.map((skill) => (
                            <code key={skill.skillName}>{skill.skillName} ({formatInteger(skill.calls)})</code>
                          ))
                        : <code>无 skill 调用</code>}
                    </div>
                  </td>
                  <td>{formatDateTime(row.lastActiveAt)}</td>
                </tr>
              ))}
              {data && data.rows.length === 0 && (
                <tr>
                  <td colSpan={9}>暂无 install_id 数据</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function ErrorGroupPanel({
  title,
  rows,
  keyLabel,
}: {
  title: string;
  rows: ErrorInsightSummary['bySkill'];
  keyLabel: string;
}) {
  const maxCount = Math.max(1, ...rows.map((row) => row.eventCount));

  return (
    <section className="panel error-group-panel">
      <div className="section-title">
        <ListTree size={18} />
        <h2>{title}</h2>
      </div>
      <div className="error-group-list">
        {rows.map((row) => (
          <div key={row.key} className="error-group-row">
            <div>
              <span>{keyLabel}</span>
              <strong>{row.label}</strong>
              <code>{formatInteger(row.affectedUsers)} 用户 · {formatInteger(row.affectedSessions)} 会话</code>
            </div>
            <div className="error-group-metrics">
              <strong>{formatInteger(row.eventCount)}</strong>
              <span>{row.relatedSkills.slice(0, 2).join(', ') || 'unknown skill'}</span>
              <div className="row-bar-track danger">
                <span style={{ width: `${Math.max(4, (row.eventCount / maxCount) * 100)}%` }} />
              </div>
              <code>最近 {formatDateTime(row.lastSeenAt)}</code>
            </div>
          </div>
        ))}
        {rows.length === 0 && <div className="empty-state">暂无异常聚合数据</div>}
      </div>
    </section>
  );
}

function ErrorInsightPage({ data }: { data?: ErrorInsightSummary }) {
  const totals = data?.totals;

  return (
    <div className="error-insight-page">
      <section className="panel">
        <div className="section-header">
          <div className="section-title">
            <AlertTriangle size={18} />
            <h2>执行异常定位台</h2>
          </div>
          <span className="generated-at">刷新于 {formatDateTime(data?.generatedAt ?? null)}</span>
        </div>
        <DataSource
          endpoint="GET /api/errors/summary?limit=50"
          fields={['strongEvents', 'issueSignatures', 'recentStrongEvents', 'weakTextEvents']}
        />
        <div className="error-summary-grid">
          <div>
            <span>强信号异常</span>
            <strong>{formatInteger(totals?.strongEvents)}</strong>
            <code>不含弱文本命中</code>
          </div>
          <div>
            <span>LLM API / 重试</span>
            <strong>{formatInteger(totals?.apiErrorEvents)} / {formatInteger(totals?.retryExhaustedEvents)}</strong>
            <code>api_error / retries</code>
          </div>
          <div>
            <span>Tool/Hook / Severity</span>
            <strong>{formatInteger(totals?.toolOrHookFailureEvents)} / {formatInteger(totals?.severityEvents)}</strong>
            <code>执行失败 / warn+error</code>
          </div>
          <div>
            <span>弱文本命中</span>
            <strong>{formatInteger(totals?.weakTextMatches)}</strong>
            <code>仅辅助排查</code>
          </div>
        </div>
      </section>

      <section className="panel">
        <div className="section-title">
          <ShieldCheck size={18} />
          <h2>待处理问题签名</h2>
        </div>
        <DataSource
          endpoint="GET /api/errors/summary"
          fields={['issueSignatures.signature', 'eventCount', 'affectedUsers', 'relatedSkills']}
        />
        <div className="issue-list">
          {(data?.issueSignatures ?? []).map((issue) => (
            <div key={issue.signature} className="issue-row">
              <div>
                <span className={`issue-evidence ${issue.evidenceLevel}`}>{issue.evidenceLevel}</span>
                <strong>{issue.title}</strong>
                <p>{compact(issue.sampleMessage, 180)}</p>
                <div className="skill-chip-list">
                  {issue.relatedSkills.length > 0
                    ? issue.relatedSkills.slice(0, 6).map((skill) => <code key={skill}>{skill}</code>)
                    : <code>unknown skill</code>}
                </div>
              </div>
              <div className="issue-metrics">
                <strong>{formatInteger(issue.eventCount)}</strong>
                <span>{formatInteger(issue.affectedUsers)} 用户 · {formatInteger(issue.affectedSessions)} 会话</span>
                <code>{errorSourceLabel(issue.sampleSource)} · 最近 {formatDateTime(issue.lastSeenAt)}</code>
              </div>
            </div>
          ))}
          {data && data.issueSignatures.length === 0 && (
            <div className="empty-state">暂无强信号异常</div>
          )}
        </div>
      </section>

      <div className="error-group-grid">
        <ErrorGroupPanel title="按 Skill 聚合" rows={data?.bySkill ?? []} keyLabel="skill" />
        <ErrorGroupPanel title="按 Session 聚合" rows={data?.bySession ?? []} keyLabel="session" />
        <ErrorGroupPanel title="按 User 聚合" rows={data?.byUser ?? []} keyLabel="user" />
      </div>

      <section className="panel">
        <div className="section-title">
          <Database size={18} />
          <h2>最近强信号事件</h2>
        </div>
        <DataSource
          endpoint="GET /api/errors/summary"
          fields={['recentStrongEvents.eventName', 'source', 'message', 'attributesPreview']}
        />
        <div className="table-wrap error-event-table">
          <table>
            <thead>
              <tr>
                <th>来源</th>
                <th>时间</th>
                <th>事件</th>
                <th>用户 / 会话</th>
                <th>Skill</th>
                <th>错误信息</th>
                <th>attributes_json</th>
              </tr>
            </thead>
            <tbody>
              {(data?.recentStrongEvents ?? []).map((event) => (
                <tr key={event.eventId}>
                  <td><span className={`pill ${event.evidenceLevel === 'medium' ? 'warn' : 'bad'}`}>{errorSourceLabel(event.source)}</span></td>
                  <td>{formatDateTime(event.eventTimestamp ?? event.receivedAt)}</td>
                  <td>
                    <code>{event.eventName ?? 'unknown'}</code>
                    <span className="muted-block">{event.model ?? event.toolName ?? event.severityText ?? 'context=NULL'}</span>
                  </td>
                  <td>
                    <strong>{event.displayName ?? event.installId ?? 'unknown'}</strong>
                    <code className="muted-block">{compact(event.sessionId, 52)}</code>
                  </td>
                  <td><code>{event.skillName ?? 'unknown'}</code></td>
                  <td><span className="long-text">{compact(event.message, 180)}</span></td>
                  <td><span className="long-text">{compact(event.attributesPreview, 150)}</span></td>
                </tr>
              ))}
              {data && data.recentStrongEvents.length === 0 && (
                <tr>
                  <td colSpan={7}>暂无强信号异常事件</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <details className="panel weak-events-panel">
        <summary>
          <span>弱信号文本命中</span>
          <code>{formatInteger(totals?.weakTextMatches)} 条，仅辅助搜索</code>
        </summary>
        <div className="table-wrap error-event-table">
          <table>
            <thead>
              <tr>
                <th>时间</th>
                <th>事件</th>
                <th>用户 / 会话</th>
                <th>命中说明</th>
                <th>body_json</th>
              </tr>
            </thead>
            <tbody>
              {(data?.weakTextEvents ?? []).map((event) => (
                <tr key={event.eventId}>
                  <td>{formatDateTime(event.eventTimestamp ?? event.receivedAt)}</td>
                  <td><code>{event.eventName ?? 'unknown'}</code></td>
                  <td>
                    <strong>{event.displayName ?? event.installId ?? 'unknown'}</strong>
                    <code className="muted-block">{compact(event.sessionId, 52)}</code>
                  </td>
                  <td>{event.message}</td>
                  <td><span className="long-text">{compact(event.bodyPreview, 180)}</span></td>
                </tr>
              ))}
              {data && data.weakTextEvents.length === 0 && (
                <tr>
                  <td colSpan={5}>暂无弱信号样例</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}

function VersionDimensionPage({
  data,
  days,
  onDaysChange,
}: {
  data?: VersionDimensionSummary;
  days: number;
  onDaysChange: (days: number) => void;
}) {
  const totals = data?.totals;
  const maxCalls = Math.max(1, ...((data?.rows ?? []).map((row) => row.calls)));
  const maxDailyCalls = Math.max(1, ...((data?.daily ?? []).map((row) => row.calls)));

  return (
    <div className="version-page">
      <section className="panel">
        <div className="section-header">
          <div className="section-title">
            <Layers3 size={18} />
            <h2>版本维度分析</h2>
          </div>
          <div className="segmented-control" aria-label="版本统计窗口">
            {[7, 14, 30].map((item) => (
              <button
                key={item}
                type="button"
                className={days === item ? 'active' : ''}
                onClick={() => onDaysChange(item)}
              >
                {item}d
              </button>
            ))}
          </div>
        </div>
        <DataSource
          endpoint={`GET /api/skills/versions?days=${days}&limit=50`}
          fields={['observed_skill_version', 'skill_usage_daily', 'errorEvents']}
        />
        <div className="version-summary-grid">
          <div>
            <span>Skill 调用</span>
            <strong>{formatInteger(totals?.skillCalls)}</strong>
            <code>skill_invocations</code>
          </div>
          <div>
            <span>版本组合</span>
            <strong>{formatInteger(totals?.versions)}</strong>
            <code>skill + version</code>
          </div>
          <div>
            <span>活跃用户 / 会话</span>
            <strong>{formatInteger(totals?.activeUsers)} / {formatInteger(totals?.sessions)}</strong>
            <code>distinct install/session</code>
          </div>
          <div>
            <span>关联异常</span>
            <strong>{formatInteger(totals?.errorEvents)}</strong>
            <code>same prompt_id</code>
          </div>
        </div>
      </section>

      <section className="panel">
        <div className="section-title">
          <Database size={18} />
          <h2>版本分布</h2>
        </div>
        <DataSource
          endpoint="GET /api/skills/versions"
          fields={['rows.skillName', 'observedSkillVersion', 'calls', 'errorEvents']}
        />
        <div className="table-wrap version-table">
          <table>
            <thead>
              <tr>
                <th>Skill / Version</th>
                <th>调用量</th>
                <th>错误量</th>
                <th>错误率</th>
                <th>用户 / 会话</th>
                <th>首次出现</th>
                <th>最近出现</th>
              </tr>
            </thead>
            <tbody>
              {(data?.rows ?? []).map((row) => {
                const errorRate = row.calls > 0 ? row.errorEvents / row.calls : 0;

                return (
                  <tr key={`${row.skillName}-${row.observedSkillVersion}`}>
                    <td>
                      <code>{row.skillName}</code>
                      <span className="muted-block">{row.observedSkillVersion}</span>
                      <div className="row-bar-track">
                        <span style={{ width: `${Math.max(4, (row.calls / maxCalls) * 100)}%` }} />
                      </div>
                    </td>
                    <td><strong>{formatInteger(row.calls)}</strong></td>
                    <td><span className={row.errorEvents > 0 ? 'pill warn' : 'pill good'}>{formatInteger(row.errorEvents)}</span></td>
                    <td>{formatPercent(errorRate)}</td>
                    <td>{formatInteger(row.activeUsers)} / {formatInteger(row.sessions)}</td>
                    <td>{formatDateTime(row.firstSeenAt)}</td>
                    <td>{formatDateTime(row.lastSeenAt)}</td>
                  </tr>
                );
              })}
              {data && data.rows.length === 0 && (
                <tr>
                  <td colSpan={7}>暂无版本调用数据</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel">
        <div className="section-title">
          <Gauge size={18} />
          <h2>近 {data?.days ?? days} 天版本 rollup</h2>
        </div>
        <DataSource endpoint="GET /api/skills/versions" fields={['daily.date', 'calls', 'activeInstalls', 'sessions']} />
        <div className="version-daily-list">
          {(data?.daily ?? []).map((row) => (
            <div key={`${row.date}-${row.skillName}-${row.observedSkillVersion}`} className="version-daily-row">
              <div>
                <strong>{row.date}</strong>
                <span>{row.skillName}</span>
                <code>{row.observedSkillVersion}</code>
              </div>
              <div>
                <strong>{formatInteger(row.calls)}</strong>
                <span>{formatInteger(row.activeInstalls)} 用户 · {formatInteger(row.sessions)} 会话</span>
                <div className="row-bar-track">
                  <span style={{ width: `${Math.max(4, (row.calls / maxDailyCalls) * 100)}%` }} />
                </div>
              </div>
            </div>
          ))}
          {data && data.daily.length === 0 && (
            <div className="empty-state">当前窗口暂无版本 rollup 数据</div>
          )}
        </div>
      </section>
    </div>
  );
}

function valueText(value: unknown) {
  if (value === null || value === undefined) return 'NULL';
  return typeof value === 'string' ? value : JSON.stringify(value);
}

function DatabaseCell({ value }: { value: unknown }) {
  const raw = valueText(value);
  const isNull = value === null || value === undefined;
  const isLong = raw.length > 80;

  return (
    <span className="db-cell">
      <code
        className={[
          'db-cell-value',
          isNull ? 'null-value' : '',
          isLong ? 'truncated' : '',
        ].filter(Boolean).join(' ')}
        tabIndex={isLong ? 0 : undefined}
      >
        {raw}
      </code>
      {isLong && (
        <span className="db-cell-popover" role="tooltip">
          {raw}
        </span>
      )}
    </span>
  );
}

function TableSchemaExplorer({
  tables,
  selectedTable,
  onSelectTable,
}: {
  tables: DatabaseTableInfo[];
  selectedTable: string;
  onSelectTable: (table: string) => void;
}) {
  const table = tables.find((item) => item.name === selectedTable) ?? tables[0];
  const columns = table?.columns ?? [];

  return (
    <div className="db-grid">
      <aside className="panel db-sidebar">
        <div className="section-title">
          <Database size={18} />
          <h2>数据表</h2>
        </div>
        <DataSource endpoint="GET /debug/db/tables" fields={['name', 'rowCount', 'columns']} />
        <div className="db-table-list">
          {tables.map((item) => (
            <button
              key={item.name}
              className={item.name === table?.name ? 'db-table-button active' : 'db-table-button'}
              onClick={() => onSelectTable(item.name)}
            >
              <span>{item.name}</span>
              <code>{item.rowCount} 行 · {item.columns.length} 列</code>
            </button>
          ))}
        </div>
      </aside>

      <section className="panel db-main">
        <div className="section-header">
          <div className="section-title">
            <ListTree size={18} />
            <h2>{table?.name ?? '表结构'}</h2>
          </div>
          <div className="db-summary">
            <span>{table?.rowCount ?? 0} 行</span>
            <span>{columns.length} 列</span>
          </div>
        </div>
        <DataSource endpoint="GET /debug/db/tables" fields={['type', 'constraints', 'estimatedBytes(max)', 'sizeBasis']} />
        <div className="table-wrap schema-table">
          <table>
            <thead>
              <tr>
                <th>字段</th>
                <th>类型</th>
                <th>约束</th>
                <th>预估最大 size</th>
                <th>事实依据</th>
                <th>默认值</th>
              </tr>
            </thead>
            <tbody>
              {columns.map((column) => (
                <tr key={column.name}>
                  <td><code>{column.name}</code></td>
                  <td>{column.type}</td>
                  <td>
                    {[
                      column.primaryKey ? 'PRIMARY KEY' : '',
                      column.notNull ? 'NOT NULL' : '',
                    ].filter(Boolean).join(' · ') || 'nullable'}
                  </td>
                  <td><strong>{column.estimatedBytes}</strong></td>
                  <td>
                    <span className="schema-basis">{column.sizeBasis}</span>
                  </td>
                  <td>{column.defaultValue ?? 'NULL'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function FilterValueInput({
  condition,
  column,
  onChange,
  onChangeTo,
}: {
  condition: DatabaseFilterCondition;
  column: DatabaseColumnInfo | undefined;
  onChange: (value: string) => void;
  onChangeTo?: (value: string) => void;
}) {
  const dateColumn = isDateColumn(column);
  const inputType = dateColumn ? 'datetime-local' : 'text';
  const inputValue = dateColumn ? toDateInputValue(condition.value) : condition.value;
  const inputValueTo = dateColumn ? toDateInputValue(condition.valueTo ?? '') : (condition.valueTo ?? '');
  const placeholder =
    condition.operator === 'in' || condition.operator === 'not_in'
      ? '逗号分隔多个值'
      : '输入匹配值';

  if (condition.operator === 'between') {
    return (
      <div className="filter-range">
        <input
          type={inputType}
          step={dateColumn ? 1 : undefined}
          value={inputValue}
          onChange={(event) => onChange(dateColumn ? fromDateInputValue(event.target.value) : event.target.value)}
          placeholder="开始值"
        />
        <span>至</span>
        <input
          type={inputType}
          step={dateColumn ? 1 : undefined}
          value={inputValueTo}
          onChange={(event) => onChangeTo?.(dateColumn ? fromDateInputValue(event.target.value) : event.target.value)}
          placeholder="结束值"
        />
      </div>
    );
  }

  return (
    <input
      type={inputType}
      step={dateColumn ? 1 : undefined}
      value={inputValue}
      onChange={(event) => onChange(dateColumn ? fromDateInputValue(event.target.value) : event.target.value)}
      placeholder={placeholder}
    />
  );
}

function FilterGroupEditor({
  columns,
  group,
  onChange,
  onCancel,
  onConfirm,
  onDelete,
}: {
  columns: DatabaseColumnInfo[];
  group: DatabaseFilterGroup;
  onChange: (group: DatabaseFilterGroup) => void;
  onCancel: () => void;
  onConfirm: () => void;
  onDelete?: () => void;
}) {
  const updateCondition = (conditionId: string | undefined, patch: Partial<DatabaseFilterCondition>) => {
    onChange({
      ...group,
      conditions: group.conditions.map((condition) =>
        condition.id === conditionId ? { ...condition, ...patch } : condition,
      ),
    });
  };

  const removeCondition = (conditionId: string | undefined) => {
    onChange({
      ...group,
      conditions: group.conditions.filter((condition) => condition.id !== conditionId),
    });
  };

  const addCondition = () => {
    onChange({
      ...group,
      conditions: [...group.conditions, createFilterCondition(columns)],
    });
  };

  return (
    <div className="filter-popover" role="dialog" aria-label="筛选条件编辑">
      <div className="filter-editor-title">满足以下任一条件</div>
      <div className="filter-condition-list">
        {group.conditions.map((condition) => {
          const column = columns.find((item) => item.name === condition.field);
          const operators = filterOperatorsForColumn(column);
          const effectiveOperator = operators.some((item) => item.value === condition.operator)
            ? condition.operator
            : defaultFilterOperator(column);

          return (
            <div className="filter-condition-row" key={condition.id}>
              <select
                value={condition.field}
                onChange={(event) => {
                  const nextColumn = columns.find((item) => item.name === event.target.value);
                  const nextOperator = defaultFilterOperator(nextColumn);
                  updateCondition(condition.id, {
                    field: event.target.value,
                    operator: nextOperator,
                    value: defaultFilterValue(nextColumn),
                    valueTo: nextOperator === 'between' ? endOfTodayInput() : undefined,
                  });
                }}
              >
                {columns.map((item) => (
                  <option key={item.name} value={item.name}>
                    {item.name} &lt;{item.type || 'TEXT'}&gt;
                  </option>
                ))}
              </select>
              <select
                value={effectiveOperator}
                onChange={(event) => {
                  const nextOperator = event.target.value as DatabaseFilterOperator;
                  updateCondition(condition.id, {
                    operator: nextOperator,
                    value: condition.value || defaultFilterValue(column),
                    valueTo: nextOperator === 'between'
                      ? condition.valueTo || (isDateColumn(column) ? endOfTodayInput() : '')
                      : undefined,
                  });
                }}
              >
                {operators.map((operator) => (
                  <option key={operator.value} value={operator.value}>
                    {operator.label}
                  </option>
                ))}
              </select>
              <FilterValueInput
                condition={{ ...condition, operator: effectiveOperator }}
                column={column}
                onChange={(value) => updateCondition(condition.id, { value })}
                onChangeTo={(valueTo) => updateCondition(condition.id, { valueTo })}
              />
              <button
                type="button"
                className="icon-button"
                aria-label="删除条件"
                onClick={() => removeCondition(condition.id)}
              >
                <X size={16} />
              </button>
            </div>
          );
        })}
      </div>
      <button type="button" className="filter-add-or" onClick={addCondition}>
        <Plus size={16} />
        添加条件
      </button>
      <div className="filter-footer">
        {onDelete && (
          <button type="button" className="secondary-button danger" onClick={onDelete}>
            删除筛选组
          </button>
        )}
        <span className="filter-footer-spacer" />
        <button type="button" className="secondary-button" onClick={onCancel}>
          取消
        </button>
        <button type="button" className="primary-button" onClick={onConfirm}>
          确定
        </button>
      </div>
    </div>
  );
}

function DatabaseFilterBuilder({
  columns,
  filters,
  onFiltersChange,
}: {
  columns: DatabaseColumnInfo[];
  filters: DatabaseFilterGroup[];
  onFiltersChange: (filters: DatabaseFilterGroup[]) => void;
}) {
  const [draftGroup, setDraftGroup] = useState<DatabaseFilterGroup | null>(null);
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null);

  const startNewGroup = () => {
    setEditingGroupId(null);
    setDraftGroup({
      id: makeClientId(),
      conditions: [createFilterCondition(columns)],
    });
  };

  const startEditingGroup = (group: DatabaseFilterGroup) => {
    const groupId = group.id ?? makeClientId();
    setEditingGroupId(groupId);
    setDraftGroup({
      id: groupId,
      conditions: group.conditions.map((condition) => ({
        ...condition,
        id: condition.id ?? makeClientId(),
      })),
    });
  };

  const closeEditor = () => {
    setDraftGroup(null);
    setEditingGroupId(null);
  };

  const confirmGroup = () => {
    if (!draftGroup) return;
    const compactedGroup = compactFilterGroup(draftGroup);
    if (editingGroupId) {
      onFiltersChange(
        compactedGroup
          ? filters.map((group) => (group.id === editingGroupId ? compactedGroup : group))
          : filters.filter((group) => group.id !== editingGroupId),
      );
    } else if (compactedGroup) {
      onFiltersChange([...filters, compactedGroup]);
    }
    closeEditor();
  };

  const deleteGroup = () => {
    if (editingGroupId) {
      onFiltersChange(filters.filter((group) => group.id !== editingGroupId));
    }
    closeEditor();
  };

  return (
    <div className="filter-builder">
      <div className="filter-strip">
        {filters.map((group, index) => (
          <div className="filter-token" key={group.id ?? index}>
            {index > 0 && <span className="filter-joiner">且</span>}
            <button type="button" className="filter-chip" onClick={() => startEditingGroup(group)}>
              {summarizeFilterGroup(group)}
            </button>
          </div>
        ))}
        <button type="button" className="filter-add-and" onClick={startNewGroup} disabled={columns.length === 0}>
          <Plus size={16} />
          添加筛选条件
        </button>
      </div>
      {draftGroup && (
        <FilterGroupEditor
          columns={columns}
          group={draftGroup}
          onChange={setDraftGroup}
          onCancel={closeEditor}
          onConfirm={confirmGroup}
          onDelete={editingGroupId ? deleteGroup : undefined}
        />
      )}
    </div>
  );
}

function DatabaseExplorer({
  tables,
  data,
  selectedTable,
  filters,
  pageSize,
  onSelectTable,
  onFiltersChange,
  onPage,
  onPageSize,
}: {
  tables: DatabaseTableInfo[];
  data?: DatabaseTableData;
  selectedTable: string;
  filters: DatabaseFilterGroup[];
  pageSize: number;
  onSelectTable: (table: string) => void;
  onFiltersChange: (filters: DatabaseFilterGroup[]) => void;
  onPage: (page: number) => void;
  onPageSize: (pageSize: number) => void;
}) {
  const table = tables.find((item) => item.name === selectedTable);
  const columns = data?.columns ?? table?.columns ?? [];
  const totalRows = data?.totalRows ?? table?.rowCount ?? 0;
  const currentPage = data?.page ?? 1;
  const totalPages = data?.totalPages ?? 1;

  return (
    <div className="db-grid">
      <aside className="panel db-sidebar">
        <div className="section-title">
          <Database size={18} />
          <h2>数据表</h2>
        </div>
        <DataSource endpoint="GET /debug/db/tables" fields={['name', 'rowCount', 'columns']} />
        <div className="db-table-list">
          {tables.map((item) => (
            <button
              key={item.name}
              className={item.name === selectedTable ? 'db-table-button active' : 'db-table-button'}
              onClick={() => onSelectTable(item.name)}
            >
              <span>{item.name}</span>
              <code>{item.rowCount} 行 · {item.columns.length} 列</code>
            </button>
          ))}
        </div>
      </aside>

      <section className="panel db-main">
        <div className="section-header">
          <div className="section-title">
            <Search size={18} />
            <h2>{selectedTable || '数据库检索'}</h2>
          </div>
          <div className="db-summary">
            <span>{totalRows} 行</span>
            <span>{columns.length} 列</span>
          </div>
        </div>

        <div className="db-toolbar db-filter-toolbar">
          <DatabaseFilterBuilder columns={columns} filters={filters} onFiltersChange={onFiltersChange} />
          <label className="db-page-size">
            每页
            <select value={pageSize} onChange={(event) => onPageSize(Number(event.target.value))}>
              {[10, 20, 50, 100].map((size) => (
                <option key={size} value={size}>
                  {size}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="db-section">
          <div className="db-data-header">
            <h3>数据</h3>
            <div className="db-pagination">
              <button disabled={currentPage <= 1} onClick={() => onPage(currentPage - 1)}>
                上一页
              </button>
              <span>第 {currentPage} / {totalPages} 页</span>
              <button disabled={currentPage >= totalPages} onClick={() => onPage(currentPage + 1)}>
                下一页
              </button>
            </div>
          </div>
          <DataSource
            endpoint={`GET /debug/db/tables/${selectedTable}/data`}
            fields={['filters', 'page', 'pageSize']}
          />
          <div className="table-wrap db-data-table">
            <table>
              <thead>
                <tr>
                  {columns.map((column) => (
                    <th key={column.name}>{column.name}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(data?.rows ?? []).map((row, index) => (
                  <tr key={index}>
                    {columns.map((column) => (
                      <td key={column.name}>
                        <DatabaseCell value={row[column.name]} />
                      </td>
                    ))}
                  </tr>
                ))}
                {data && data.rows.length === 0 && (
                  <tr>
                    <td colSpan={Math.max(columns.length, 1)}>没有匹配数据</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="db-footer">
            <span>当前结果 {totalRows} 行</span>
            <span>Raw payload 当前占用由顶部 health 统计展示</span>
          </div>
        </div>
      </section>
    </div>
  );
}

export function App() {
  const [view, setView] = useState<View>('ingest');
  const healthQuery = useQuery({ queryKey: ['health'], queryFn: api.health });
  const ingestHealthQuery = useQuery({ queryKey: ['ingest-health'], queryFn: api.ingestHealth });
  const [eventHours, setEventHours] = useState(24);
  const eventDistributionQuery = useQuery({
    queryKey: ['event-distribution', eventHours],
    queryFn: () => api.eventDistribution(eventHours, 20),
  });
  const dataQualityQuery = useQuery({ queryKey: ['data-quality'], queryFn: api.dataQuality });
  const rawBatchesQuery = useQuery({ queryKey: ['raw-batches'], queryFn: () => api.rawBatchDetails(50) });
  const skillFunnelQuery = useQuery({ queryKey: ['skill-funnel'], queryFn: api.skillFunnel });
  const errorSummaryQuery = useQuery({ queryKey: ['error-summary'], queryFn: () => api.errorSummary(50) });
  const userMachinesQuery = useQuery({ queryKey: ['user-machines'], queryFn: () => api.userMachines(50) });
  const [versionDays, setVersionDays] = useState(14);
  const versionQuery = useQuery({
    queryKey: ['skill-versions', versionDays],
    queryFn: () => api.skillVersions(versionDays, 50),
  });
  const skillsQuery = useQuery({ queryKey: ['skills'], queryFn: api.skillUsage });
  const auditQuery = useQuery({ queryKey: ['field-audit'], queryFn: api.fieldAudit });
  const databaseTablesQuery = useQuery({ queryKey: ['database-tables'], queryFn: api.databaseTables });
  const [selectedSkill, setSelectedSkill] = useState('aihot');
  const [selectedTable, setSelectedTable] = useState('');
  const [dbFilters, setDbFilters] = useState<DatabaseFilterGroup[]>([]);
  const [dbPage, setDbPage] = useState(1);
  const [dbPageSize, setDbPageSize] = useState(20);

  const skills = skillsQuery.data ?? [];
  const selectedSkillData = skills.find((skill) => skill.skillName === selectedSkill) ?? skills[0];
  const effectiveSkill = selectedSkillData?.skillName ?? selectedSkill;
  const interactionsQuery = useQuery({
    queryKey: ['skill-interactions', effectiveSkill],
    queryFn: () => api.skillInteractions(effectiveSkill, 20),
    enabled: Boolean(effectiveSkill),
  });

  const health = healthQuery.data;
  const totalCalls = health?.skillUsages ?? skills.reduce((sum, skill) => sum + skill.calls, 0);
  const activeUsers = health?.activeSkillUsers ?? 0;
  const databaseTables = databaseTablesQuery.data ?? [];
  const effectiveTable = databaseTables.some((table) => table.name === selectedTable)
    ? selectedTable
    : (databaseTables[0]?.name ?? '');
  const effectiveFilters = useMemo(() => compactFilterGroups(dbFilters), [dbFilters]);
  const effectiveFilterKey = useMemo(() => JSON.stringify(effectiveFilters), [effectiveFilters]);
  const databaseDataQuery = useQuery({
    queryKey: ['database-table-data', effectiveTable, effectiveFilterKey, dbPage, dbPageSize],
    queryFn: () =>
      api.databaseTableData(effectiveTable, {
        page: dbPage,
        pageSize: dbPageSize,
        field: '__all__',
        q: '',
        filters: effectiveFilters,
      }),
    enabled: Boolean(effectiveTable),
  });

  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <div className="eyebrow">SDD 质量观测台</div>
          <h1>Skill Trace 质量观测台</h1>
          <p>基于真实 Claude Code OTel 数据，按 skill 和 prompt.id 聚合展示。</p>
        </div>
        <div className="api-badge">
          <Database size={16} />
          {api.baseUrl}
        </div>
      </header>

      <section className="stats-grid">
        <StatCard icon={<FileJson size={20} />} label="Raw OTel 批次" value={health?.rawBatches ?? '-'} source="GET /health.rawBatches" />
        <StatCard icon={<Layers3 size={20} />} label="标准化事件" value={health?.normalizedEvents ?? '-'} source="GET /health.normalizedEvents" />
        <StatCard icon={<Gauge size={20} />} label="交互数" value={health?.interactions ?? '-'} source="GET /health.interactions" />
        <StatCard icon={<Users size={20} />} label="Skill 调用 / 用户" value={`${totalCalls} / ${activeUsers}`} source={`${formatBytes(health?.rawPayloadBytes ?? 0)} raw`} />
      </section>

      <DataMap />

      <nav className="tabs" aria-label="Dashboard sections">
        <button className={view === 'ingest' ? 'tab active' : 'tab'} onClick={() => setView('ingest')}>
          采集健康
        </button>
        <button className={view === 'events' ? 'tab active' : 'tab'} onClick={() => setView('events')}>
          事件分布
        </button>
        <button className={view === 'quality' ? 'tab active' : 'tab'} onClick={() => setView('quality')}>
          数据质量
        </button>
        <button className={view === 'rawBatches' ? 'tab active' : 'tab'} onClick={() => setView('rawBatches')}>
          Raw 批次
        </button>
        <button className={view === 'skillFunnel' ? 'tab active' : 'tab'} onClick={() => setView('skillFunnel')}>
          Skill 漏斗
        </button>
        <button className={view === 'errors' ? 'tab active' : 'tab'} onClick={() => setView('errors')}>
          异常错误
        </button>
        <button className={view === 'users' ? 'tab active' : 'tab'} onClick={() => setView('users')}>
          用户机器
        </button>
        <button className={view === 'versions' ? 'tab active' : 'tab'} onClick={() => setView('versions')}>
          版本分析
        </button>
        <button className={view === 'skills' ? 'tab active' : 'tab'} onClick={() => setView('skills')}>
          Skill 使用概览
        </button>
        <button className={view === 'interactions' ? 'tab active' : 'tab'} onClick={() => setView('interactions')}>
          Skill 调用明细
        </button>
        <button className={view === 'raw' ? 'tab active' : 'tab'} onClick={() => setView('raw')}>
          Raw 字段审计
        </button>
        <button className={view === 'schema' ? 'tab active' : 'tab'} onClick={() => setView('schema')}>
          表结构
        </button>
        <button className={view === 'database' ? 'tab active' : 'tab'} onClick={() => setView('database')}>
          数据库检索
        </button>
      </nav>

      {view === 'ingest' && <IngestHealthPage data={ingestHealthQuery.data} />}

      {view === 'events' && (
        <EventDistributionPage
          data={eventDistributionQuery.data}
          hours={eventHours}
          onHoursChange={setEventHours}
        />
      )}

      {view === 'quality' && <DataQualityPage data={dataQualityQuery.data} />}

      {view === 'rawBatches' && <RawBatchDetailsPage data={rawBatchesQuery.data} />}

      {view === 'skillFunnel' && <SkillFunnelPage data={skillFunnelQuery.data} />}

      {view === 'errors' && <ErrorInsightPage data={errorSummaryQuery.data} />}

      {view === 'users' && <UserMachinePage data={userMachinesQuery.data} />}

      {view === 'versions' && (
        <VersionDimensionPage
          data={versionQuery.data}
          days={versionDays}
          onDaysChange={setVersionDays}
        />
      )}

      {view === 'skills' && (
        <section className="panel">
          <div className="section-title">
            <CheckCircle2 size={18} />
            <h2>Skill 使用概览</h2>
          </div>
          <DataSource
            endpoint="GET /api/skills/usage"
            fields={['skillName', 'calls', 'activeUsers', 'sessions', 'versions']}
          />
          <SkillsTable
            data={skills}
            selectedSkill={effectiveSkill}
            onSelectSkill={(skillName) => {
              setSelectedSkill(skillName);
              setView('interactions');
            }}
          />
        </section>
      )}

      {view === 'interactions' && (
        <section className="panel">
          <div className="section-header">
            <div className="section-title">
              <Search size={18} />
              <h2>{effectiveSkill} 调用明细</h2>
            </div>
            <select value={effectiveSkill} onChange={(event) => setSelectedSkill(event.target.value)}>
              {skills.map((skill) => (
                <option key={skill.skillName} value={skill.skillName}>
                  {skill.skillName}
                </option>
              ))}
            </select>
          </div>
          <DataSource
            endpoint={`GET /api/skills/${effectiveSkill}/interactions?limit=20`}
            fields={[
              'promptText',
              'responseText',
              'observedSkillVersion',
              'pairingConfidence',
              'eventCount',
            ]}
          />
          <InteractionsTable data={interactionsQuery.data ?? []} />
        </section>
      )}

      {view === 'raw' && <RawAudit audit={auditQuery.data} />}

      {view === 'schema' && (
        <TableSchemaExplorer
          tables={databaseTables}
          selectedTable={effectiveTable}
          onSelectTable={(table) => {
            setSelectedTable(table);
            setDbFilters([]);
            setDbPage(1);
          }}
        />
      )}

      {view === 'database' && (
        <DatabaseExplorer
          tables={databaseTables}
          data={databaseDataQuery.data}
          selectedTable={effectiveTable}
          filters={effectiveFilters}
          pageSize={dbPageSize}
          onSelectTable={(table) => {
            setSelectedTable(table);
            setDbFilters([]);
            setDbPage(1);
          }}
          onFiltersChange={(filters) => {
            setDbFilters(compactFilterGroups(filters));
            setDbPage(1);
          }}
          onPage={setDbPage}
          onPageSize={(size) => {
            setDbPageSize(size);
            setDbPage(1);
          }}
        />
      )}

      {(healthQuery.isError || ingestHealthQuery.isError || eventDistributionQuery.isError || dataQualityQuery.isError || rawBatchesQuery.isError || skillFunnelQuery.isError || errorSummaryQuery.isError || userMachinesQuery.isError || versionQuery.isError || skillsQuery.isError || interactionsQuery.isError || auditQuery.isError || databaseTablesQuery.isError || databaseDataQuery.isError) && (
        <div className="error-banner">
          部分 API 数据加载失败。请确认 collector 正在 {api.baseUrl} 运行。
        </div>
      )}
    </main>
  );
}
