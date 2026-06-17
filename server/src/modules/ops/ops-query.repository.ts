import { Inject, Provide } from '@midwayjs/core';
import { MysqlDataSourceManager } from '../../infrastructure/mysql/data-source-manager';

export interface TableRow {
  table_name?: string;
  TABLE_NAME?: string;
  estimated_rows?: string | number;
  TABLE_ROWS?: string | number;
  data_bytes?: string | number | null;
  DATA_LENGTH?: string | number | null;
  index_bytes?: string | number | null;
  INDEX_LENGTH?: string | number | null;
  updated_at?: Date | string | null;
  UPDATE_TIME?: Date | string | null;
}

export interface ColumnRow {
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

export interface QueueRow {
  pending_outbox: string | number;
  dispatching_outbox: string | number;
  failed_outbox: string | number;
}

export interface JobRow {
  id: string | number;
  status: string;
  aggregate_id: string | number | null;
  attempts: string | number;
  last_error: string | null;
  created_at: Date | string | null;
  updated_at: Date | string | null;
}

export interface ResourceSnapshotRow {
  captured_at: Date | string;
  project_name: string;
  service_name: string;
  container_name: string | null;
  container_id: string | null;
  state: string | null;
  health: string | null;
  restart_count: string | number;
  cpu_percent: string | number | null;
  memory_usage_bytes: string | number | null;
  memory_limit_bytes: string | number | null;
  network_rx_bytes: string | number | null;
  network_tx_bytes: string | number | null;
  block_read_bytes: string | number | null;
  block_write_bytes: string | number | null;
  writable_layer_bytes: string | number | null;
  image_ref: string | null;
  image_size_bytes: string | number | null;
  database_bytes: string | number | null;
  deploy_directory_bytes: string | number | null;
}

export interface ResourceHistoryRow {
  timestamp: Date | string;
  value: string | number | null;
}

export interface ListTableRowsOptions {
  tableName: string;
  whereClauses: string[];
  params: unknown[];
  orderSql: string;
  limit: number;
}

@Provide('opsQueryRepository')
export class OpsQueryRepository {
  @Inject('mysqlDataSourceManager')
  mysqlDataSourceManager!: MysqlDataSourceManager;

  async listAllTablesMeta(): Promise<TableRow[]> {
    const dataSource = await this.mysqlDataSourceManager.getDataSource();
    return (await dataSource.query(
      `SELECT table_name,
              table_rows AS estimated_rows,
              data_length AS data_bytes,
              index_length AS index_bytes,
              update_time AS updated_at
       FROM information_schema.tables
       WHERE table_schema = DATABASE()
       ORDER BY table_name ASC`,
    )) as TableRow[];
  }

  async listColumnsForTables(tableNames: string[]): Promise<ColumnRow[]> {
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

  async listTableRows(options: ListTableRowsOptions): Promise<Array<Record<string, unknown>>> {
    const dataSource = await this.mysqlDataSourceManager.getDataSource();
    const whereSql =
      options.whereClauses.length > 0 ? `WHERE ${options.whereClauses.join(' AND ')}` : '';
    return (await dataSource.query(
      `SELECT *
       FROM \`${options.tableName}\`
       ${whereSql}
       ${options.orderSql}
       LIMIT ?`,
      [...options.params, options.limit],
    )) as Array<Record<string, unknown>>;
  }

  async getTableRow(tableName: string, id: string): Promise<Record<string, unknown> | null> {
    const dataSource = await this.mysqlDataSourceManager.getDataSource();
    const rows = (await dataSource.query(
      `SELECT * FROM \`${tableName}\` WHERE id = ? LIMIT 1`,
      [id],
    )) as Array<Record<string, unknown>>;
    return rows[0] ?? null;
  }

  async aggregateOutboxStatus(): Promise<QueueRow[]> {
    const dataSource = await this.mysqlDataSourceManager.getDataSource();
    return (await dataSource.query(
      `SELECT
         SUM(status = 'pending') AS pending_outbox,
         SUM(status = 'dispatching') AS dispatching_outbox,
         SUM(status = 'failed_terminal') AS failed_outbox
       FROM ingest_outbox`,
    )) as QueueRow[];
  }

  async listOutboxJobs(
    whereClauses: string[],
    params: unknown[],
    limit: number,
  ): Promise<JobRow[]> {
    const dataSource = await this.mysqlDataSourceManager.getDataSource();
    const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';
    return (await dataSource.query(
      `SELECT id, status, aggregate_id, attempts, last_error,
              gmt_create AS created_at, gmt_modified AS updated_at
       FROM ingest_outbox
       ${whereSql}
       ORDER BY id DESC
       LIMIT ?`,
      [...params, limit],
    )) as JobRow[];
  }

  async listDatabaseTableSizes(): Promise<TableRow[]> {
    const dataSource = await this.mysqlDataSourceManager.getDataSource();
    return (await dataSource.query(
      `SELECT table_name,
              table_rows AS estimated_rows,
              data_length AS data_bytes,
              index_length AS index_bytes,
              update_time AS updated_at
       FROM information_schema.tables
       WHERE table_schema = DATABASE()
       ORDER BY data_length + index_length DESC`,
    )) as TableRow[];
  }

  async listLatestResourceSnapshots(): Promise<ResourceSnapshotRow[]> {
    const dataSource = await this.mysqlDataSourceManager.getDataSource();
    return (await dataSource.query(
      `SELECT captured_at, project_name, service_name, container_name, container_id,
              state, health, restart_count, cpu_percent, memory_usage_bytes,
              memory_limit_bytes, network_rx_bytes, network_tx_bytes,
              block_read_bytes, block_write_bytes, writable_layer_bytes,
              image_ref, image_size_bytes, database_bytes, deploy_directory_bytes
       FROM ops_resource_snapshots
       WHERE captured_at = (SELECT MAX(captured_at) FROM ops_resource_snapshots)
       ORDER BY FIELD(service_name, 'mysql', 'server', 'worker', 'web'), service_name ASC`,
    )) as ResourceSnapshotRow[];
  }

  async listResourceHistory(options: {
    since: Date;
    metricSql: string;
    serviceName?: string;
  }): Promise<ResourceHistoryRow[]> {
    const dataSource = await this.mysqlDataSourceManager.getDataSource();
    const params: unknown[] = [options.since];
    const serviceClause = options.serviceName ? 'AND service_name = ?' : '';
    if (options.serviceName) {
      params.push(options.serviceName);
    }

    return (await dataSource.query(
      `SELECT captured_at AS timestamp, ${options.metricSql} AS value
       FROM ops_resource_snapshots
       WHERE captured_at >= ?
         ${serviceClause}
       GROUP BY captured_at
       ORDER BY captured_at ASC`,
      params,
    )) as ResourceHistoryRow[];
  }
}
