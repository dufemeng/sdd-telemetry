import { Inject, Provide } from '@midwayjs/core';
import type {
  OpsJob,
  OpsJobsResponse,
  OpsQueue,
  OpsTable,
  OpsTableRowsQuery,
  OpsTableRowsResponse,
  OpsTablesResponse,
} from '@sdd-monitor/api';
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
  column_name?: string;
  COLUMN_NAME?: string;
  data_type?: string;
  DATA_TYPE?: string;
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
    const rows = (await dataSource.query(
      `SELECT table_name, table_rows AS estimated_rows, update_time AS updated_at
       FROM information_schema.tables
       WHERE table_schema = DATABASE()
         AND table_name IN (${allowedTables.map(() => '?').join(',')})
       ORDER BY table_name ASC`,
      allowedTables,
    )) as TableRow[];

    const tables: OpsTable[] = rows.map(row => ({
      tableName: String(row.table_name ?? row.TABLE_NAME),
      estimatedRows: toNumber(row.estimated_rows ?? row.TABLE_ROWS),
      updatedAt: toIsoDate(row.updated_at ?? row.UPDATE_TIME),
    }));

    return { tables };
  }

  async listTableRows(tableName: string, query: OpsTableRowsQuery): Promise<OpsTableRowsResponse> {
    assertAllowedTable(tableName);

    const dataSource = await this.mysqlDataSourceManager.getDataSource();
    const columns = (await dataSource.query(
      `SELECT column_name, data_type
       FROM information_schema.columns
       WHERE table_schema = DATABASE()
         AND table_name = ?
       ORDER BY ordinal_position ASC`,
      [tableName],
    )) as ColumnRow[];
    const columnNames = columns.map(column => String(column.column_name ?? column.COLUMN_NAME));
    const orderBy = columnNames.includes(query.orderBy ?? '') ? query.orderBy : 'id';
    const direction = query.order === 'asc' ? 'ASC' : 'DESC';
    const clauses: string[] = [];
    const params: unknown[] = [];

    if (query.cursor) {
      clauses.push(`id ${query.order === 'asc' ? '>' : '<'} ?`);
      params.push(query.cursor);
    }

    const rows = (await dataSource.query(
      `SELECT *
       FROM \`${tableName}\`
       ${clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : ''}
       ORDER BY \`${orderBy}\` ${direction}
       LIMIT ?`,
      [...params, query.limit + 1],
    )) as Array<Record<string, unknown>>;
    const visibleRows = rows.slice(0, query.limit);
    const longTextColumns = new Set(
      columns
        .filter(column => String(column.data_type ?? column.DATA_TYPE).toLowerCase().includes('text'))
        .map(column => String(column.column_name ?? column.COLUMN_NAME)),
    );

    return {
      tableName,
      columns: columnNames,
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
      nextCursor: rows.length > query.limit ? toStringId(visibleRows.at(-1)?.id) : null,
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
      `SELECT id, status, aggregate_id, attempts, last_error, created_at, updated_at
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
}

function assertAllowedTable(tableName: string): void {
  if (!allowedTables.includes(tableName)) {
    throw new Error(`table is not allowed: ${tableName}`);
  }
}
