import { Inject, Provide } from '@midwayjs/core';
import type {
  OpsColumn,
  OpsFilterOperator,
  OpsJob,
  OpsJobsResponse,
  OpsQueue,
  OpsTable,
  OpsTableFilter,
  OpsTableFilterGroup,
  OpsTableRowsQuery,
  OpsTableRowsResponse,
  OpsTablesResponse,
} from '@sdd-telemetry/api';
import { MysqlDataSourceManager } from '../../infrastructure/mysql/data-source-manager';
import { toIsoDate, toNumber, toStringId, truncateText } from '../query-utils';

interface TableRow {
  table_name?: string;
  TABLE_NAME?: string;
  estimated_rows?: string | number;
  TABLE_ROWS?: string | number;
  updated_at?: Date | string | null;
  UPDATE_TIME?: Date | string | null;
}

interface ColumnRow {
  table_name?: string;
  TABLE_NAME?: string;
  column_name?: string;
  COLUMN_NAME?: string;
  data_type?: string;
  DATA_TYPE?: string;
  column_type?: string;
  COLUMN_TYPE?: string;
  is_nullable?: string;
  IS_NULLABLE?: string;
  column_key?: string;
  COLUMN_KEY?: string;
  column_default?: string | null;
  COLUMN_DEFAULT?: string | null;
  extra?: string;
  EXTRA?: string;
  character_maximum_length?: string | number | null;
  CHARACTER_MAXIMUM_LENGTH?: string | number | null;
  numeric_precision?: string | number | null;
  NUMERIC_PRECISION?: string | number | null;
}

interface QueueRow {
  pending_outbox: string | number;
  dispatching_outbox: string | number;
  failed_outbox: string | number;
}

interface JobRow {
  id: string | number;
  status: string;
  aggregate_id: string | number | null;
  attempts: string | number;
  last_error: string | null;
  created_at: Date | string | null;
  updated_at: Date | string | null;
}

const allowedTables = [
  'sdd_users',
  'sdd_skill_semantics',
  'sdd_skill_aliases',
  'otel_ingest_batches',
  'otel_raw_payloads',
  'ingest_outbox',
  'otel_log_events',
  'sdd_interactions',
  'sdd_interaction_texts',
  'sdd_skill_usages',
  'sdd_work_items',
  'sdd_work_item_artifacts',
  'sdd_errors',
];

@Provide('opsQueryService')
export class OpsQueryService {
  @Inject('mysqlDataSourceManager')
  mysqlDataSourceManager!: MysqlDataSourceManager;

  async listTables(): Promise<OpsTablesResponse> {
    const dataSource = await this.mysqlDataSourceManager.getDataSource();
    const [tableRows, columnRows, countRows] = await Promise.all([
      dataSource.query(
        `SELECT table_name, update_time AS updated_at
         FROM information_schema.tables
         WHERE table_schema = DATABASE()
           AND table_name IN (${allowedTables.map(() => '?').join(',')})
         ORDER BY table_name ASC`,
        allowedTables,
      ) as Promise<TableRow[]>,
      this.listColumnsForTables(allowedTables),
      Promise.all(
        allowedTables.map(name =>
          (dataSource.query(`SELECT COUNT(*) AS cnt FROM \`${name}\``) as Promise<[{ cnt: string | number }]>)
            .then(rows => ({ name, count: toNumber(rows[0]?.cnt) })),
        ),
      ),
    ]);

    const rowCountByTable = new Map(countRows.map(r => [r.name, r.count]));
    const columnsByTable  = groupColumnsByTable(columnRows);

    const tables: OpsTable[] = tableRows.map(row => {
      const tableName = String(row.table_name ?? row.TABLE_NAME);
      return {
        tableName,
        estimatedRows: rowCountByTable.get(tableName) ?? 0,
        updatedAt:     toIsoDate(row.updated_at ?? row.UPDATE_TIME),
        columns:       columnsByTable.get(tableName) ?? [],
      };
    });

    return { tables };
  }

  async listTableRows(tableName: string, query: OpsTableRowsQuery): Promise<OpsTableRowsResponse> {
    assertAllowedTable(tableName);

    const dataSource = await this.mysqlDataSourceManager.getDataSource();
    const columns = toOpsColumns(await this.listColumnsForTables([tableName]));
    const columnNames = columns.map(column => column.columnName);
    const columnSet = new Set(columnNames);
    const orderBy = columnNames.includes(query.orderBy ?? '') ? query.orderBy : 'id';
    const direction = query.order === 'asc' ? 'ASC' : 'DESC';
    const clauses: string[] = [];
    const params: unknown[] = [];

    appendFilterGroupClauses(query.filters, columnSet, clauses, params);

    if (query.cursor && orderBy === 'id') {
      clauses.push(`id ${query.order === 'asc' ? '>' : '<'} ?`);
      params.push(query.cursor);
    }

    const orderSql =
      orderBy === 'id'
        ? `ORDER BY \`${orderBy}\` ${direction}`
        : `ORDER BY \`${orderBy}\` ${direction}, \`id\` ${direction}`;
    const rows = (await dataSource.query(
      `SELECT *
       FROM \`${tableName}\`
       ${clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : ''}
       ${orderSql}
       LIMIT ?`,
      [...params, query.limit + 1],
    )) as Array<Record<string, unknown>>;
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
      nextCursor: rows.length > query.limit && orderBy === 'id' ? toStringId(visibleRows.at(-1)?.id) : null,
    };
  }

  async getQueue(): Promise<OpsQueue> {
    const dataSource = await this.mysqlDataSourceManager.getDataSource();
    const rows = (await dataSource.query(
      `SELECT
         SUM(status = 'pending') AS pending_outbox,
         SUM(status = 'dispatching') AS dispatching_outbox,
         SUM(status = 'failed_terminal') AS failed_outbox
       FROM ingest_outbox`,
    )) as QueueRow[];
    const row = rows[0];

    return {
      pendingOutbox: toNumber(row?.pending_outbox),
      queuedJobs: toNumber(row?.dispatching_outbox),
      activeJobs: 0,
      failedJobs: toNumber(row?.failed_outbox),
    };
  }

  async listJobs(limit: number, cursor?: string): Promise<OpsJobsResponse> {
    const dataSource = await this.mysqlDataSourceManager.getDataSource();
    const clauses: string[] = [];
    const params: unknown[] = [];

    if (cursor) {
      clauses.push('id < ?');
      params.push(cursor);
    }

    const rows = (await dataSource.query(
      `SELECT id, status, aggregate_id, attempts, last_error,
              gmt_create AS created_at, gmt_modified AS updated_at
       FROM ingest_outbox
       ${clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : ''}
       ORDER BY id DESC
       LIMIT ?`,
      [...params, limit + 1],
    )) as JobRow[];
    const visibleRows = rows.slice(0, limit);

    return {
      items: visibleRows.map(row => this.toOutboxJob(row)),
      nextCursor: rows.length > limit ? toStringId(visibleRows.at(-1)?.id) : null,
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

  private async listColumnsForTables(tableNames: string[]): Promise<ColumnRow[]> {
    if (tableNames.length === 0) {
      return [];
    }

    const dataSource = await this.mysqlDataSourceManager.getDataSource();
    return (await dataSource.query(
      `SELECT table_name, column_name, data_type, column_type, is_nullable,
              column_key, column_default, extra, character_maximum_length,
              numeric_precision
       FROM information_schema.columns
       WHERE table_schema = DATABASE()
         AND table_name IN (${tableNames.map(() => '?').join(',')})
       ORDER BY table_name ASC, ordinal_position ASC`,
      tableNames,
    )) as ColumnRow[];
  }
}

function assertAllowedTable(tableName: string): void {
  if (!allowedTables.includes(tableName)) {
    throw new Error(`table is not allowed: ${tableName}`);
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

  if (operator === 'is_null')     return `${columnSql} IS NULL`;
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
