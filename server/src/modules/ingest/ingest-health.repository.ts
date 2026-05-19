import { Inject, Provide } from '@midwayjs/core';
import { MysqlDataSourceManager } from '../../infrastructure/mysql/data-source-manager';

export interface HealthRow {
  total_batches: string | number;
  parsed_batches: string | number;
  processing_batches: string | number;
  failed_batches: string | number;
  duplicate_batches: string | number;
  total_payload_bytes: string | number | null;
  latest_received_at: Date | string | null;
  latest_parsed_at: Date | string | null;
}

export interface QueueRow {
  pending_outbox: string | number;
}

export interface BatchRow {
  id: string | number;
  status: string;
  payload_hash?: string;
  status_reason?: string | null;
  payload_bytes: string | number;
  raw_log_count: string | number;
  event_count: string | number;
  derived_count: string | number;
  duplicate_count: string | number;
  last_duplicate_at?: Date | string | null;
  received_at: Date | string;
  parse_started_at?: Date | string | null;
  parse_completed_at?: Date | string | null;
  parse_duration_ms: string | number | null;
  retry_count?: string | number;
  last_error: string | null;
  raw_id?: string | number | null;
  raw_expires_at?: Date | string | null;
  outbox_status?: string | null;
  outbox_attempts?: string | number | null;
  outbox_next_retry_at?: Date | string | null;
  outbox_last_error?: string | null;
  outbox_dispatched_at?: Date | string | null;
}

@Provide('ingestHealthRepository')
export class IngestHealthRepository {
  @Inject('mysqlDataSourceManager')
  mysqlDataSourceManager!: MysqlDataSourceManager;

  async aggregateHealth(windowHours: number): Promise<HealthRow[]> {
    const dataSource = await this.mysqlDataSourceManager.getDataSource();
    return (await dataSource.query(
      `SELECT
         COUNT(*) AS total_batches,
         SUM(status = 'parsed') AS parsed_batches,
         SUM(status IN ('queued', 'processing')) AS processing_batches,
         SUM(status IN ('failed_retryable', 'failed_terminal')) AS failed_batches,
         SUM(duplicate_count > 0) AS duplicate_batches,
         COALESCE(SUM(payload_bytes), 0) AS total_payload_bytes,
         MAX(received_at) AS latest_received_at,
         MAX(parse_completed_at) AS latest_parsed_at
       FROM otel_ingest_batches
       WHERE received_at >= DATE_SUB(CURRENT_TIMESTAMP(3), INTERVAL ? HOUR)`,
      [windowHours],
    )) as HealthRow[];
  }

  async countPendingOutbox(): Promise<QueueRow[]> {
    const dataSource = await this.mysqlDataSourceManager.getDataSource();
    return (await dataSource.query(
      `SELECT COUNT(*) AS pending_outbox
       FROM ingest_outbox
       WHERE status IN ('pending', 'dispatching')`,
    )) as QueueRow[];
  }

  async listBatches(
    whereClauses: string[],
    params: unknown[],
    limit: number,
  ): Promise<BatchRow[]> {
    const dataSource = await this.mysqlDataSourceManager.getDataSource();
    const where = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';
    return (await dataSource.query(
      `SELECT id, status, payload_bytes, raw_log_count, event_count, derived_count,
              duplicate_count, received_at, parse_duration_ms, last_error
       FROM otel_ingest_batches
       ${where}
       ORDER BY id DESC
       LIMIT ?`,
      [...params, limit],
    )) as BatchRow[];
  }

  async getBatchDetail(batchId: string): Promise<BatchRow | null> {
    const dataSource = await this.mysqlDataSourceManager.getDataSource();
    const rows = (await dataSource.query(
      `SELECT b.id, b.status, b.payload_hash, b.status_reason, b.payload_bytes,
              b.raw_log_count, b.event_count, b.derived_count, b.duplicate_count,
              b.last_duplicate_at, b.received_at, b.parse_started_at, b.parse_completed_at,
              b.parse_duration_ms, b.retry_count, b.last_error,
              r.id AS raw_id, r.expires_at AS raw_expires_at,
              o.status AS outbox_status, o.attempts AS outbox_attempts,
              o.next_retry_at AS outbox_next_retry_at, o.last_error AS outbox_last_error,
              o.dispatched_at AS outbox_dispatched_at
       FROM otel_ingest_batches b
       LEFT JOIN otel_raw_payloads r ON r.batch_id = b.id
       LEFT JOIN ingest_outbox o ON o.event_type = 'clean_batch' AND o.aggregate_id = b.id
       WHERE b.id = ?
       LIMIT 1`,
      [batchId],
    )) as BatchRow[];
    return rows[0] ?? null;
  }
}
