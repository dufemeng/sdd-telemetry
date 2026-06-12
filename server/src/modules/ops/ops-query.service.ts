import { Inject, Provide } from '@midwayjs/core';
import type {
  OpsColumn,
  OpsFilterOperator,
  OpsJob,
  OpsJobsResponse,
  OpsQueue,
  OpsResourceAlert,
  OpsResourceDatabase,
  OpsResourceHistory,
  OpsResourceHistoryQuery,
  OpsResourceService,
  OpsResourceSummary,
  OpsResourceTableSize,
  OpsTable,
  OpsTableFilter,
  OpsTableFilterGroup,
  OpsTableRowResponse,
  OpsTableRowsQuery,
  OpsTableRowsResponse,
  OpsTablesResponse,
} from '@sdd-telemetry/api';
import { toIsoDate, toNumber, toStringId, truncateText } from '../query-utils';
import {
  OpsQueryRepository,
  type ColumnRow,
  type JobRow,
  type ResourceSnapshotRow,
  type TableRow,
} from './ops-query.repository';

const excludedTables = new Set([
  'auth_users',
  'ops_resource_snapshots',
]);

@Provide('opsQueryService')
export class OpsQueryService {
  @Inject('opsQueryRepository')
  opsQueryRepository!: OpsQueryRepository;

  async listTables(): Promise<OpsTablesResponse> {
    const tableRows = await this.opsQueryRepository.listAllTablesMeta();
    const tableNames = tableRows
      .map(row => String(row.table_name ?? row.TABLE_NAME))
      .filter(name => !excludedTables.has(name));

    const [columnRows, countRows] = await Promise.all([
      this.opsQueryRepository.listColumnsForTables(tableNames),
      Promise.all(
        tableNames.map(async name => ({
          name,
          count: await this.opsQueryRepository.countRows(name),
        })),
      ),
    ]);

    const rowCountByTable = new Map(countRows.map(r => [r.name, r.count]));
    const columnsByTable = groupColumnsByTable(columnRows);

    const tables: OpsTable[] = tableRows
      .filter(row => !excludedTables.has(String(row.table_name ?? row.TABLE_NAME)))
      .map(row => {
        const tableName = String(row.table_name ?? row.TABLE_NAME);
        const dataBytes = toNullableNumber(row.data_bytes ?? row.DATA_LENGTH);
        const indexBytes = toNullableNumber(row.index_bytes ?? row.INDEX_LENGTH);
        return {
          tableName,
          estimatedRows: rowCountByTable.get(tableName) ?? 0,
          updatedAt: toIsoDate(row.updated_at ?? row.UPDATE_TIME),
          dataBytes,
          indexBytes,
          totalBytes:
            dataBytes === null && indexBytes === null ? null : (dataBytes ?? 0) + (indexBytes ?? 0),
          columns: columnsByTable.get(tableName) ?? [],
        };
      });

    return { tables };
  }

  async listTableRows(tableName: string, query: OpsTableRowsQuery): Promise<OpsTableRowsResponse> {
    assertAllowedTable(tableName);

    const columns = toOpsColumns(await this.opsQueryRepository.listColumnsForTables([tableName]));
    const columnNames = columns.map(column => column.columnName);
    const columnSet = new Set(columnNames);
    const orderBy = columnNames.includes(query.orderBy ?? '')
      ? query.orderBy!
      : defaultOrderColumn(columns);
    const direction = query.order === 'asc' ? 'ASC' : 'DESC';
    const clauses: string[] = [];
    const params: unknown[] = [];

    appendFilterGroupClauses(query.filters, columnSet, clauses, params);

    if (query.cursor && orderBy === 'id' && columnSet.has('id')) {
      clauses.push(`id ${query.order === 'asc' ? '>' : '<'} ?`);
      params.push(query.cursor);
    }

    const orderSql = buildOrderSql(orderBy, direction, columns);

    const rows = await this.opsQueryRepository.listTableRows({
      tableName,
      whereClauses: clauses,
      params,
      orderSql,
      limit: query.limit + 1,
    });
    const visibleRows = rows.slice(0, query.limit);
    const longTextColumns = new Set(
      columns
        .filter(column => isLargeTextType(column.dataType))
        .map(column => column.columnName),
    );

    return {
      tableName,
      columns,
      rows: visibleRows.map(row => {
        const nextRow: Record<string, unknown> = {};
        for (const [key, value] of Object.entries(row)) {
          if (value instanceof Date) {
            nextRow[key] = value.toISOString();
          } else if (longTextColumns.has(key)) {
            nextRow[key] = truncateText(value, 500);
          } else {
            nextRow[key] = value;
          }
        }
        return nextRow;
      }),
      nextCursor:
        rows.length > query.limit && orderBy === 'id' && columnSet.has('id') ? toStringId(visibleRows.at(-1)?.id) : null,
    };
  }

  async getTableRow(tableName: string, id: string): Promise<OpsTableRowResponse> {
    assertAllowedTable(tableName);
    const raw = await this.opsQueryRepository.getTableRow(tableName, id);
    if (!raw) return { tableName, row: null };

    const row: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(raw)) {
      row[key] = value instanceof Date ? value.toISOString() : value;
    }
    return { tableName, row };
  }

  async getQueue(): Promise<OpsQueue> {
    const rows = await this.opsQueryRepository.aggregateOutboxStatus();
    const row = rows[0];

    return {
      pendingOutbox: toNumber(row?.pending_outbox),
      queuedJobs: toNumber(row?.dispatching_outbox),
      activeJobs: 0,
      failedJobs: toNumber(row?.failed_outbox),
    };
  }

  async listJobs(limit: number, cursor?: string): Promise<OpsJobsResponse> {
    const clauses: string[] = [];
    const params: unknown[] = [];

    if (cursor) {
      clauses.push('id < ?');
      params.push(cursor);
    }

    const rows = await this.opsQueryRepository.listOutboxJobs(clauses, params, limit + 1);
    const visibleRows = rows.slice(0, limit);

    return {
      items: visibleRows.map(row => this.toOutboxJob(row)),
      nextCursor: rows.length > limit ? toStringId(visibleRows.at(-1)?.id) : null,
    };
  }

  async getResourceSummary(): Promise<OpsResourceSummary> {
    const [snapshotRows, tableRows, queueRows] = await Promise.all([
      this.opsQueryRepository.listLatestResourceSnapshots(),
      this.opsQueryRepository.listDatabaseTableSizes(),
      this.opsQueryRepository.aggregateOutboxStatus(),
    ]);
    const capturedAt = toIsoDate(snapshotRows[0]?.captured_at) ?? new Date().toISOString();
    const database = toResourceDatabase(tableRows);
    const services = snapshotRows.map(row => toResourceService(row));
    const latestProject = snapshotRows[0];
    const runtimeTotals = buildRuntimeTotals(
      services,
      toNullableNumber(latestProject?.deploy_directory_bytes),
    );
    const totals = {
      ...runtimeTotals,
      imageSizeBytes: sumUniqueImageSizes(services),
      databaseBytes: database.totalBytes,
    };

    return {
      capturedAt,
      project: {
        name: String(latestProject?.project_name ?? process.env.COMPOSE_PROJECT_NAME ?? 'sdd-telemetry'),
        deployVersion: process.env.DEPLOY_VERSION ?? null,
        appImage: process.env.SDD_TELEMETRY_APP_IMAGE ?? null,
        webImage: process.env.SDD_TELEMETRY_WEB_IMAGE ?? null,
      },
      totals,
      services,
      database,
      alerts: buildResourceAlerts({
        services,
        queue: queueRows[0],
        hasSnapshot: snapshotRows.length > 0,
      }),
    };
  }

  async getResourceHistory(query: OpsResourceHistoryQuery): Promise<OpsResourceHistory> {
    const since = new Date(Date.now() - rangeMs(query.range));
    const metricSql = historyMetricSql(query.metric, query.serviceName);
    const rows = await this.opsQueryRepository.listResourceHistory({
      since,
      metricSql,
      ...(query.serviceName === 'total' ? {} : { serviceName: query.serviceName }),
    });

    return {
      metric: query.metric,
      serviceName: query.serviceName,
      points: rows.map(row => ({
        timestamp: toIsoDate(row.timestamp) ?? new Date().toISOString(),
        value: toNullableNumber(row.value),
      })),
    };
  }

  private toOutboxJob(row: JobRow): OpsJob {
    return {
      id: toStringId(row.id),
      kind: 'outbox',
      status: row.status,
      aggregateId: row.aggregate_id === null ? null : toStringId(row.aggregate_id),
      attempts: toNumber(row.attempts),
      lastError: row.last_error,
      createdAt: toIsoDate(row.created_at),
      updatedAt: toIsoDate(row.updated_at),
    };
  }
}

function toResourceService(row: ResourceSnapshotRow): OpsResourceService {
  const memoryUsageBytes = toNullableNumber(row.memory_usage_bytes);
  const memoryLimitBytes = toNullableNumber(row.memory_limit_bytes);
  return {
    serviceName: toServiceName(row.service_name),
    containerName: row.container_name ?? 'unknown',
    state: row.state ?? 'unknown',
    health: row.health,
    restartCount: toNumber(row.restart_count),
    cpuPercent: toNullableNumber(row.cpu_percent),
    memoryUsageBytes,
    memoryLimitBytes,
    memoryPercent:
      memoryUsageBytes !== null && memoryLimitBytes && memoryLimitBytes > 0
        ? memoryUsageBytes / memoryLimitBytes
        : null,
    networkRxBytes: toNullableNumber(row.network_rx_bytes),
    networkTxBytes: toNullableNumber(row.network_tx_bytes),
    blockReadBytes: toNullableNumber(row.block_read_bytes),
    blockWriteBytes: toNullableNumber(row.block_write_bytes),
    writableLayerBytes: toNullableNumber(row.writable_layer_bytes),
    imageRef: row.image_ref,
    imageSizeBytes: toNullableNumber(row.image_size_bytes),
  };
}

function toServiceName(value: string): OpsResourceService['serviceName'] {
  return ['mysql', 'server', 'worker', 'web'].includes(value)
    ? (value as OpsResourceService['serviceName'])
    : 'server';
}

function toResourceDatabase(rows: TableRow[]): OpsResourceDatabase {
  const tables: OpsResourceTableSize[] = rows.map(row => {
    const dataBytes = toNumber(row.data_bytes ?? row.DATA_LENGTH);
    const indexBytes = toNumber(row.index_bytes ?? row.INDEX_LENGTH);
    return {
      tableName: String(row.table_name ?? row.TABLE_NAME),
      estimatedRows: toNumber(row.estimated_rows ?? row.TABLE_ROWS),
      totalBytes: dataBytes + indexBytes,
      dataBytes,
      indexBytes,
      updatedAt: toIsoDate(row.updated_at ?? row.UPDATE_TIME),
    };
  });

  return {
    totalBytes: tables.reduce((sum, table) => sum + table.totalBytes, 0),
    dataBytes: tables.reduce((sum, table) => sum + table.dataBytes, 0),
    indexBytes: tables.reduce((sum, table) => sum + table.indexBytes, 0),
    tables,
  };
}

function buildResourceAlerts(options: {
  services: OpsResourceService[];
  queue?: { pending_outbox: string | number; failed_outbox: string | number } | undefined;
  hasSnapshot: boolean;
}): OpsResourceAlert[] {
  const alerts: OpsResourceAlert[] = [];
  if (!options.hasSnapshot) {
    alerts.push({
      level: 'warn',
      code: 'ops_agent_no_snapshot',
      message: '尚未收到资源采集快照，启用 ops-agent 后可展示 CPU、内存和镜像占用。',
      target: 'ops-agent',
    });
  }

  for (const service of options.services) {
    if (service.state !== 'running') {
      alerts.push({
        level: 'bad',
        code: 'container_not_running',
        message: `${service.serviceName} 容器状态为 ${service.state}`,
        target: service.serviceName,
      });
    }
    if (service.restartCount > 0) {
      alerts.push({
        level: 'warn',
        code: 'container_restarted',
        message: `${service.serviceName} 已重启 ${service.restartCount} 次`,
        target: service.serviceName,
      });
    }
    if (service.cpuPercent !== null && service.cpuPercent >= Number(process.env.OPS_CPU_WARN_PERCENT ?? 80)) {
      alerts.push({
        level: 'warn',
        code: 'cpu_high',
        message: `${service.serviceName} CPU 当前 ${service.cpuPercent.toFixed(1)}%`,
        target: service.serviceName,
      });
    }
    if (
      service.memoryPercent !== null &&
      service.memoryPercent >= Number(process.env.OPS_MEMORY_WARN_PERCENT ?? 80) / 100
    ) {
      alerts.push({
        level: 'warn',
        code: 'memory_high',
        message: `${service.serviceName} 内存当前 ${(service.memoryPercent * 100).toFixed(1)}%`,
        target: service.serviceName,
      });
    }
  }

  const failedOutbox = toNumber(options.queue?.failed_outbox);
  const pendingOutbox = toNumber(options.queue?.pending_outbox);
  if (failedOutbox >= Number(process.env.OPS_OUTBOX_FAILED_WARN ?? 1)) {
    alerts.push({
      level: 'bad',
      code: 'outbox_failed',
      message: `outbox 失败任务 ${failedOutbox} 条`,
      target: 'ingest_outbox',
    });
  }
  if (pendingOutbox >= Number(process.env.OPS_OUTBOX_PENDING_WARN ?? 1000)) {
    alerts.push({
      level: 'warn',
      code: 'outbox_pending_high',
      message: `outbox 待处理任务 ${pendingOutbox} 条`,
      target: 'ingest_outbox',
    });
  }

  return alerts;
}

function buildRuntimeTotals(
  services: OpsResourceService[],
  deployDirectoryBytes: number | null,
): {
  cpuPercent: number | null;
  memoryUsageBytes: number | null;
  memoryLimitBytes: number | null;
  containerWritableBytes: number | null;
  deployDirectoryBytes: number | null;
} {
  let cpuPercent: number | null = null;
  let memoryUsageBytes: number | null = null;
  let memoryLimitBytes: number | null = null;
  let containerWritableBytes: number | null = null;

  for (const service of services) {
    cpuPercent = sumNullable(cpuPercent, service.cpuPercent);
    memoryUsageBytes = sumNullable(memoryUsageBytes, service.memoryUsageBytes);
    memoryLimitBytes = sumNullable(memoryLimitBytes, service.memoryLimitBytes);
    containerWritableBytes = sumNullable(containerWritableBytes, service.writableLayerBytes);
  }

  return {
    cpuPercent,
    memoryUsageBytes,
    memoryLimitBytes,
    containerWritableBytes,
    deployDirectoryBytes,
  };
}

function historyMetricSql(metric: OpsResourceHistoryQuery['metric'], serviceName: string): string {
  if (serviceName === 'total') {
    if (metric === 'cpu') return 'SUM(cpu_percent)';
    if (metric === 'memory') return 'SUM(memory_usage_bytes)';
    if (metric === 'database') return 'MAX(database_bytes)';
    return 'SUM(writable_layer_bytes)';
  }

  if (metric === 'cpu') return 'MAX(cpu_percent)';
  if (metric === 'memory') return 'MAX(memory_usage_bytes)';
  if (metric === 'database') return 'MAX(database_bytes)';
  return 'MAX(writable_layer_bytes)';
}

function rangeMs(range: OpsResourceHistoryQuery['range']): number {
  if (range === '1h') return 60 * 60 * 1000;
  if (range === '24h') return 24 * 60 * 60 * 1000;
  if (range === '7d') return 7 * 24 * 60 * 60 * 1000;
  return 6 * 60 * 60 * 1000;
}

function toNullableNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : null;
}

function sumNullable(left: unknown, right: unknown): number | null {
  const a = toNullableNumber(left);
  const b = toNullableNumber(right);
  if (a === null && b === null) return null;
  return (a ?? 0) + (b ?? 0);
}

function sumUniqueImageSizes(services: OpsResourceService[]): number | null {
  const seen = new Set<string>();
  let total = 0;
  let hasValue = false;
  for (const service of services) {
    if (!service.imageRef || service.imageSizeBytes === null || seen.has(service.imageRef)) {
      continue;
    }
    seen.add(service.imageRef);
    total += service.imageSizeBytes;
    hasValue = true;
  }
  return hasValue ? total : null;
}

function assertAllowedTable(tableName: string): void {
  if (excludedTables.has(tableName)) {
    throw new Error(`table is not allowed: ${tableName}`);
  }
  if (!/^[a-z_][a-z0-9_]*$/.test(tableName)) {
    throw new Error(`invalid table name: ${tableName}`);
  }
}

function groupColumnsByTable(rows: ColumnRow[]): Map<string, OpsColumn[]> {
  const grouped = new Map<string, OpsColumn[]>();

  for (const row of rows) {
    const tableName = String(row.table_name ?? row.TABLE_NAME);
    const columns = grouped.get(tableName) ?? [];
    columns.push(toOpsColumn(row));
    grouped.set(tableName, columns);
  }

  return grouped;
}

function toOpsColumns(rows: ColumnRow[]): OpsColumn[] {
  return rows.map(row => toOpsColumn(row));
}

function defaultOrderColumn(columns: OpsColumn[]): string {
  const names = new Set(columns.map(column => column.columnName));
  if (names.has('id')) return 'id';
  if (names.has('gmt_modified')) return 'gmt_modified';
  if (names.has('gmt_create')) return 'gmt_create';
  return columns.find(column => column.key === 'PRI')?.columnName ?? columns[0]?.columnName ?? '';
}

function buildOrderSql(orderBy: string, direction: 'ASC' | 'DESC', columns: OpsColumn[]): string {
  if (!orderBy) return '';
  const columnNames = new Set(columns.map(column => column.columnName));
  if (!columnNames.has(orderBy)) return '';

  const primaryColumn = columns.find(column => column.key === 'PRI')?.columnName;
  const tieBreaker = orderBy !== 'id' && columnNames.has('id')
    ? 'id'
    : primaryColumn && primaryColumn !== orderBy
      ? primaryColumn
      : null;

  const parts = [`\`${orderBy}\` ${direction}`];
  if (tieBreaker) parts.push(`\`${tieBreaker}\` ${direction}`);
  return `ORDER BY ${parts.join(', ')}`;
}

function toOpsColumn(row: ColumnRow): OpsColumn {
  const dataType = String(row.data_type ?? row.DATA_TYPE);
  const columnType = String(row.column_type ?? row.COLUMN_TYPE ?? dataType);
  const estimated = estimateMaxSize(row);
  const key = String(row.column_key ?? row.COLUMN_KEY ?? '');
  const extra = String(row.extra ?? row.EXTRA ?? '');
  const defaultValue = row.column_default ?? row.COLUMN_DEFAULT ?? null;

  return {
    columnName: String(row.column_name ?? row.COLUMN_NAME),
    dataType: columnType,
    nullable: String(row.is_nullable ?? row.IS_NULLABLE).toUpperCase() === 'YES',
    key: key === '' ? null : key,
    defaultValue: defaultValue === null ? null : String(defaultValue),
    extra: extra === '' ? null : extra,
    estimatedMaxSize: estimated.estimatedMaxSize,
    sizeBasis: estimated.sizeBasis,
  };
}

function estimateMaxSize(row: ColumnRow): { estimatedMaxSize: number | null; sizeBasis: string } {
  const dataType = String(row.data_type ?? row.DATA_TYPE).toLowerCase();
  const columnType = String(row.column_type ?? row.COLUMN_TYPE ?? dataType).toLowerCase();
  const charLength = toNumber(row.character_maximum_length ?? row.CHARACTER_MAXIMUM_LENGTH);
  const precision = toNumber(row.numeric_precision ?? row.NUMERIC_PRECISION);

  if (['char', 'varchar'].includes(dataType)) {
    return {
      estimatedMaxSize: charLength > 0 ? charLength * 4 : null,
      sizeBasis: 'CHARACTER_MAXIMUM_LENGTH * utf8mb4 4 bytes',
    };
  }

  const fixedSizes: Record<string, number> = {
    tinyint: 1,
    smallint: 2,
    mediumint: 3,
    int: 4,
    integer: 4,
    bigint: 8,
    float: 4,
    double: 8,
    real: 8,
    date: 3,
    time: 3,
    datetime: 8,
    timestamp: 8,
    year: 1,
  };
  if (fixedSizes[dataType] !== undefined) {
    return { estimatedMaxSize: fixedSizes[dataType], sizeBasis: 'MySQL fixed storage estimate' };
  }

  const largeSizes: Record<string, number> = {
    tinytext: 255,
    tinyblob: 255,
    text: 65_535,
    blob: 65_535,
    mediumtext: 16_777_215,
    mediumblob: 16_777_215,
    longtext: 4_294_967_295,
    longblob: 4_294_967_295,
    json: 4_294_967_295,
  };
  if (largeSizes[dataType] !== undefined) {
    return { estimatedMaxSize: largeSizes[dataType], sizeBasis: 'MySQL type maximum' };
  }

  if (['decimal', 'numeric'].includes(dataType)) {
    return {
      estimatedMaxSize: precision > 0 ? Math.ceil(precision / 2) + 1 : null,
      sizeBasis: 'MySQL DECIMAL storage estimate from NUMERIC_PRECISION',
    };
  }

  if (['enum', 'set'].includes(dataType)) {
    return {
      estimatedMaxSize: columnType.length > 0 ? columnType.length * 4 : null,
      sizeBasis: 'COLUMN_TYPE definition length * utf8mb4 4 bytes',
    };
  }

  return { estimatedMaxSize: null, sizeBasis: 'Unknown or engine-dependent' };
}

/**
 * Build WHERE clauses for filter groups: conditions within a group are OR'd, groups themselves are AND'd.
 * Final SQL shape: `(c1 OR c2) AND (c3) AND (c4 OR c5)`
 */
function appendFilterGroupClauses(
  groups: OpsTableFilterGroup[],
  columnSet: Set<string>,
  clauses: string[],
  params: unknown[],
): void {
  for (const group of groups) {
    const orParts: string[] = [];
    for (const filter of group.conditions) {
      const part = buildFilterClause(filter, columnSet, params);
      if (part) orParts.push(part);
    }
    if (orParts.length === 1) {
      clauses.push(orParts[0]!);
    } else if (orParts.length > 1) {
      clauses.push(`(${orParts.join(' OR ')})`);
    }
  }
}

/** Build one SQL fragment (`column op value`) for a single filter; appends bind params in place. */
function buildFilterClause(
  filter: OpsTableFilter,
  columnSet: Set<string>,
  params: unknown[],
): string | null {
  if (!columnSet.has(filter.column)) {
    throw new Error(`filter column is not allowed: ${filter.column}`);
  }

  const columnSql = `\`${filter.column}\``;
  const operator = filter.operator;

  if (operator === 'is_null') return `${columnSql} IS NULL`;
  if (operator === 'is_not_null') return `${columnSql} IS NOT NULL`;

  if (operator === 'in' || operator === 'not_in') {
    const values = filterValueList(filter.value);
    if (values.length === 0) {
      return operator === 'in' ? '1 = 0' : '1 = 1';
    }
    const sqlVerb = operator === 'in' ? 'IN' : 'NOT IN';
    params.push(...values);
    return `${columnSql} ${sqlVerb} (${values.map(() => '?').join(',')})`;
  }

  const value = filterScalarValue(filter.value);
  params.push(value);
  return `${columnSql} ${sqlOperator(operator)} ?`;
}

function sqlOperator(operator: OpsFilterOperator): string {
  const operators: Record<
    Exclude<OpsFilterOperator, 'in' | 'not_in' | 'is_null' | 'is_not_null'>,
    string
  > = {
    eq: '=',
    ne: '<>',
    like: 'LIKE',
    not_like: 'NOT LIKE',
    gt: '>',
    gte: '>=',
    lt: '<',
    lte: '<=',
  };

  if (
    operator === 'in' ||
    operator === 'not_in' ||
    operator === 'is_null' ||
    operator === 'is_not_null'
  ) {
    throw new Error(`operator does not use scalar comparison: ${operator}`);
  }

  return operators[operator];
}

function filterScalarValue(value: OpsTableFilter['value']): string {
  if (Array.isArray(value)) {
    return value[0] ?? '';
  }

  return value ?? '';
}

function filterValueList(value: OpsTableFilter['value']): string[] {
  if (Array.isArray(value)) {
    return value;
  }

  if (!value) {
    return [];
  }

  return value
    .split(',')
    .map(item => item.trim())
    .filter(Boolean);
}

function isLargeTextType(dataType: string): boolean {
  const normalized = dataType.toLowerCase();
  return normalized.includes('text') || normalized.includes('blob') || normalized.includes('json');
}
