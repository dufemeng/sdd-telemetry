import { useMemo, useState } from 'react';
import type {
  OpsResourceHistoryQuery,
  OpsResourceService,
  OpsResourceSummary,
} from '@sdd-telemetry/api';
import {
  Activity,
  AlertTriangle,
  Box,
  Cpu,
  Database,
  HardDrive,
  MemoryStick,
  Server,
} from 'lucide-react';
import { useOpsResourceSummary } from './useOpsResourceSummary';
import { useOpsResourceHistory } from './useOpsResourceHistory';
import { StatCard } from '@/components/ui/StatCard';
import { Panel } from '@/components/ui/Panel';
import { DataTable } from '@/components/ui/DataTable';
import { EmptyState } from '@/components/ui/EmptyState';
import { StatusBadge } from '@/components/ui/StatusBadge';
import {
  formatBytes,
  formatDateTime,
  formatInteger,
  formatPercent,
  truncate,
} from '@/lib/format';

const HISTORY_RANGES: Array<OpsResourceHistoryQuery['range']> = ['1h', '6h', '24h', '7d'];
const HISTORY_METRICS: Array<OpsResourceHistoryQuery['metric']> = ['memory', 'cpu', 'database', 'writableLayer'];
const HISTORY_SERVICES: Array<OpsResourceHistoryQuery['serviceName']> = ['total', 'mysql', 'server', 'worker', 'web'];

const METRIC_LABELS: Record<OpsResourceHistoryQuery['metric'], string> = {
  memory: '内存',
  cpu: 'CPU',
  database: '数据库',
  writableLayer: '可写层',
};

const SERVICE_LABELS: Record<OpsResourceHistoryQuery['serviceName'], string> = {
  total: '合计',
  mysql: 'MySQL',
  server: 'Server',
  worker: 'Worker',
  web: 'Web',
};

export default function ResourcesPage() {
  const summary = useOpsResourceSummary();
  const [range, setRange] = useState<OpsResourceHistoryQuery['range']>('6h');
  const [metric, setMetric] = useState<OpsResourceHistoryQuery['metric']>('memory');
  const [serviceName, setServiceName] = useState<OpsResourceHistoryQuery['serviceName']>('total');
  const history = useOpsResourceHistory({ range, metric, serviceName });

  const data = summary.data;
  const serviceRows = useMemo(() => buildServiceRows(data?.services ?? []), [data?.services]);
  const tableRows = useMemo(() => buildDatabaseRows(data), [data]);

  return (
    <div className="grid gap-3">
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-3 2xl:grid-cols-6">
        <StatCard
          icon={<Server size={18} />}
          label="项目状态"
          value={projectStatus(data)}
          hint={data ? `${data.project.name} · ${data.project.deployVersion ?? '未记录版本'}` : '加载中'}
          loading={summary.isLoading}
        />
        <StatCard
          icon={<Cpu size={18} />}
          label="CPU"
          value={formatCpu(data?.totals.cpuPercent)}
          hint={data?.capturedAt ? `采集 ${formatDateTime(data.capturedAt)}` : '等待采集'}
          loading={summary.isLoading}
        />
        <StatCard
          icon={<MemoryStick size={18} />}
          label="内存"
          value={formatBytes(data?.totals.memoryUsageBytes)}
          hint={formatMemoryHint(data)}
          loading={summary.isLoading}
        />
        <StatCard
          icon={<Database size={18} />}
          label="数据库"
          value={formatBytes(data?.database.totalBytes)}
          hint={`${formatBytes(data?.database.dataBytes)} data / ${formatBytes(data?.database.indexBytes)} index`}
          loading={summary.isLoading}
        />
        <StatCard
          icon={<Box size={18} />}
          label="镜像"
          value={formatBytes(data?.totals.imageSizeBytes)}
          hint="app + web + mysql 当前镜像"
          loading={summary.isLoading}
        />
        <StatCard
          icon={<HardDrive size={18} />}
          label="容器可写层"
          value={formatBytes(data?.totals.containerWritableBytes)}
          hint="不含 MySQL volume"
          loading={summary.isLoading}
        />
      </div>

      {data?.alerts.length ? (
        <Panel title="风险提示" icon={<AlertTriangle size={18} />}>
          <div className="grid gap-2">
            {data.alerts.map((alert) => (
              <div
                key={`${alert.code}-${alert.target}-${alert.message}`}
                className="flex items-center justify-between gap-3 rounded-[4px] px-3 py-2 text-[12px]"
                style={{ border: '1px solid var(--color-border)', background: '#171717' }}
              >
                <div className="min-w-0">
                  <strong className="block text-[#f5f5f5]">{alert.target}</strong>
                  <span className="text-[var(--color-secondary)]">{alert.message}</span>
                </div>
                <StatusBadge status={alert.level} variant={alert.level === 'bad' ? 'bad' : 'warn'} />
              </div>
            ))}
          </div>
        </Panel>
      ) : null}

      <Panel title="资源趋势" icon={<Activity size={18} />} headerRight={
        <div className="flex flex-wrap justify-end gap-2">
          <SegmentGroup
            items={HISTORY_RANGES}
            value={range}
            label={(item) => item}
            onChange={setRange}
          />
          <SegmentGroup
            items={HISTORY_SERVICES}
            value={serviceName}
            label={(item) => SERVICE_LABELS[item]}
            onChange={setServiceName}
          />
          <SegmentGroup
            items={HISTORY_METRICS}
            value={metric}
            label={(item) => METRIC_LABELS[item]}
            onChange={setMetric}
          />
        </div>
      }>
        <ResourceTrendChart
          points={history.data?.points ?? []}
          metric={metric}
          loading={history.isLoading}
        />
      </Panel>

      <div className="grid gap-3 2xl:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
        <Panel title="服务明细" icon={<Server size={18} />}>
          <DataTable
            headers={['service', 'state', 'health', 'restarts', 'CPU', 'memory', 'network', 'block I/O', 'writable', 'image']}
            rows={serviceRows}
            emptyText="暂无资源快照"
          />
        </Panel>

        <Panel title="数据库大小排行" icon={<Database size={18} />}>
          <DataTable
            headers={['table', 'rows', 'total', 'data', 'index', 'updated']}
            rows={tableRows}
            emptyText="暂无数据库表信息"
          />
        </Panel>
      </div>
    </div>
  );
}

function SegmentGroup<T extends string>({
  items,
  value,
  label,
  onChange,
}: {
  items: T[];
  value: T;
  label: (item: T) => string;
  onChange: (value: T) => void;
}) {
  return (
    <div
      className="inline-flex overflow-hidden rounded-[4px]"
      style={{ border: '1px solid var(--color-border)' }}
    >
      {items.map((item) => (
        <button
          key={item}
          type="button"
          onClick={() => onChange(item)}
          className={[
            'min-h-8 px-3 text-[12px] transition-colors',
            value === item
              ? 'bg-[#2b2b20] text-[var(--color-primary)]'
              : 'bg-transparent text-[var(--color-secondary)] hover:text-[#f5f5f5]',
          ].join(' ')}
        >
          {label(item)}
        </button>
      ))}
    </div>
  );
}

function ResourceTrendChart({
  points,
  metric,
  loading,
}: {
  points: Array<{ timestamp: string; value: number | null }>;
  metric: OpsResourceHistoryQuery['metric'];
  loading: boolean;
}) {
  if (loading) return <EmptyState text="加载中…" />;
  if (points.length === 0) return <EmptyState text="暂无趋势数据" />;

  const width = 760;
  const height = 230;
  const padX = 42;
  const padY = 18;
  const values = points.map(point => point.value ?? 0);
  const max = Math.max(...values, 1);
  const xStep = (width - padX * 2) / Math.max(points.length - 1, 1);
  const y = (value: number) => height - padY - (value / max) * (height - padY * 2);
  const line = values
    .map((value, index) => `${index === 0 ? 'M' : 'L'}${(padX + index * xStep).toFixed(1)},${y(value).toFixed(1)}`)
    .join(' ');
  const area = `${line} L${width - padX},${height - padY} L${padX},${height - padY} Z`;
  const ticks = [0, 0.25, 0.5, 0.75, 1];
  const labelIndexes = [0, Math.floor(points.length / 2), points.length - 1]
    .filter((index, position, list) => index >= 0 && list.indexOf(index) === position);

  return (
    <div className="min-h-[250px]">
      <svg viewBox={`0 0 ${width} ${height}`} className="block h-[230px] w-full" role="img" aria-label="资源趋势">
        <defs>
          <linearGradient id="ops-resource-area" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="#c9ce3c" stopOpacity="0.18" />
            <stop offset="100%" stopColor="#c9ce3c" stopOpacity="0.02" />
          </linearGradient>
        </defs>
        {ticks.map((tick) => {
          const lineY = padY + (1 - tick) * (height - padY * 2);
          return (
            <g key={tick}>
              <line x1={padX} x2={width - padX} y1={lineY} y2={lineY} stroke="rgba(255,255,255,0.07)" />
              <text x={8} y={lineY + 4} fill="var(--color-muted)" fontSize="11" fontFamily="var(--font-mono)">
                {formatChartValue(max * tick, metric)}
              </text>
            </g>
          );
        })}
        <path d={area} fill="url(#ops-resource-area)" />
        <path d={line} fill="none" stroke="#c9ce3c" strokeWidth="2" />
        {labelIndexes.map((index) => (
          <text
            key={index}
            x={padX + index * xStep}
            y={height - 2}
            textAnchor="middle"
            fill="var(--color-secondary)"
            fontSize="11"
            fontFamily="var(--font-mono)"
          >
            {formatChartTime(points[index]?.timestamp)}
          </text>
        ))}
      </svg>
    </div>
  );
}

function buildServiceRows(services: OpsResourceService[]) {
  return services.map((service) => [
    SERVICE_LABELS[service.serviceName],
    <StatusBadge key="state" status={service.state} />,
    service.health ? <StatusBadge key="health" status={service.health} /> : '—',
    formatInteger(service.restartCount),
    formatCpu(service.cpuPercent),
    `${formatBytes(service.memoryUsageBytes)} / ${formatBytes(service.memoryLimitBytes)}`,
    `${formatBytes(service.networkRxBytes)} ↓ / ${formatBytes(service.networkTxBytes)} ↑`,
    `${formatBytes(service.blockReadBytes)} R / ${formatBytes(service.blockWriteBytes)} W`,
    formatBytes(service.writableLayerBytes),
    truncate(service.imageRef, 44),
  ]);
}

function buildDatabaseRows(data: OpsResourceSummary | undefined) {
  return (data?.database.tables ?? []).slice(0, 12).map((table) => [
    table.tableName,
    formatInteger(table.estimatedRows),
    formatBytes(table.totalBytes),
    formatBytes(table.dataBytes),
    formatBytes(table.indexBytes),
    formatDateTime(table.updatedAt),
  ]);
}

function projectStatus(data: OpsResourceSummary | undefined): string {
  if (!data) return '—';
  if (data.services.length === 0) return 'DB only';
  return data.services.every(service => service.state === 'running') ? 'running' : 'degraded';
}

function formatMemoryHint(data: OpsResourceSummary | undefined): string {
  const usage = data?.totals.memoryUsageBytes;
  const limit = data?.totals.memoryLimitBytes;
  if (usage == null || limit == null || limit <= 0) return '等待采集';
  return `${formatPercent(usage / limit)} of ${formatBytes(limit)}`;
}

function formatCpu(value: number | null | undefined): string {
  if (value == null) return '—';
  return `${value.toFixed(1)}%`;
}

function formatChartValue(value: number, metric: OpsResourceHistoryQuery['metric']): string {
  if (metric === 'cpu') return `${Math.round(value)}%`;
  return formatBytes(value);
}

function formatChartTime(value: string | undefined): string {
  if (!value) return '';
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}
