import { Inject, Provide } from '@midwayjs/core';
import type {
  BatchDetail,
  BatchListItem,
  BatchListQuery,
  BatchListResponse,
  IngestHealth,
} from '@sdd-monitor/api';
import { MysqlDataSourceManager } from '../../infrastructure/mysql/data-source-manager';
import { toIsoDate, toNumber, toStringId } from '../query-utils';

interface HealthRow {
  total_batches: string | number;
  parsed_batches: string | number;
  processing_batches: string | number;
  failed_batches: string | number;
  duplicate_batches: string | number;
  total_payload_bytes: string | number | null;
  latest_received_at: Date | string | null;
  latest_parsed_at: Date | string | null;
}

interface QueueRow {
  pending_outbox: string | number;
}

interface BatchRow {
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

@Provide('ingestHealthService')
export class IngestHealthService {
  @Inject('mysqlDataSourceManager')
  mysqlDataSourceManager!: MysqlDataSourceManager;

  async getHealth(windowHours: number): Promise<IngestHealth> {
    const dataSource = await this.mysqlDataSourceManager.getDataSource();
    const [healthRows, queueRows] = await Promise.all([
      dataSource.query(
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
      ) as Promise<HealthRow[]>,
      dataSource.query(
        `SELECT COUNT(*) AS pending_outbox
         FROM ingest_outbox
         WHERE status IN ('pending', 'dispatching')`,
      ) as Promise<QueueRow[]>,
    ]);

    const row = healthRows[0];
    const queue = queueRows[0];

    return {
      windowHours,
      totalBatches: toNumber(row?.total_batches),
      parsedBatches: toNumber(row?.parsed_batches),
      processingBatches: toNumber(row?.processing_batches),
      failedBatches: toNumber(row?.failed_batches),
      duplicateBatches: toNumber(row?.duplicate_batches),
      totalPayloadBytes: toNumber(row?.total_payload_bytes),
      latestReceivedAt: toIsoDate(row?.latest_received_at),
      latestParsedAt: toIsoDate(row?.latest_parsed_at),
      queue: {
        pendingOutbox: toNumber(queue?.pending_outbox),
        queuedJobs: 0,
        activeJobs: 0,
        failedJobs: 0,
      },
    };
  }

  async listBatches(query: BatchListQuery): Promise<BatchListResponse> {
    const dataSource = await this.mysqlDataSourceManager.getDataSource();
    const clauses: string[] = [];
    const params: unknown[] = [];

    if (query.status) {
      clauses.push('status = ?');
      params.push(query.status);
    }

    if (query.cursor) {
      clauses.push('id < ?');
      params.push(query.cursor);
    }

    const where = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';
    const rows = (await dataSource.query(
      `SELECT id, status, payload_bytes, raw_log_count, event_count, derived_count,
              duplicate_count, received_at, parse_duration_ms, last_error
       FROM otel_ingest_batches
       ${where}
       ORDER BY id DESC
       LIMIT ?`,
      [...params, query.limit + 1],
    )) as BatchRow[];

    const visibleRows = rows.slice(0, query.limit);

    return {
      items: visibleRows.map(row => this.toBatchListItem(row)),
      nextCursor: rows.length > query.limit ? toStringId(visibleRows.at(-1)?.id) : null,
    };
  }

  async getBatchDetail(batchId: string): Promise<BatchDetail | null> {
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
    const row = rows[0];

    if (!row) {
      return null;
    }

    return {
      ...this.toBatchListItem(row),
      payloadHash: String(row.payload_hash),
      statusReason: row.status_reason ?? null,
      lastDuplicateAt: toIsoDate(row.last_duplicate_at),
      parseStartedAt: toIsoDate(row.parse_started_at),
      parseCompletedAt: toIsoDate(row.parse_completed_at),
      retryCount: toNumber(row.retry_count),
      rawAvailable: Boolean(row.raw_id),
      rawExpiresAt: toIsoDate(row.raw_expires_at),
      outbox: row.outbox_status
        ? {
            status: row.outbox_status as BatchDetail['outbox'] extends infer T
              ? T extends { status: infer S }
                ? S
                : never
              : never,
            attempts: toNumber(row.outbox_attempts),
            nextRetryAt: toIsoDate(row.outbox_next_retry_at),
            lastError: row.outbox_last_error ?? null,
            dispatchedAt: toIsoDate(row.outbox_dispatched_at),
          }
        : null,
    };
  }

  private toBatchListItem(row: BatchRow): BatchListItem {
    return {
      id: toStringId(row.id),
      status: row.status as BatchListItem['status'],
      payloadBytes: toNumber(row.payload_bytes),
      rawLogCount: toNumber(row.raw_log_count),
      eventCount: toNumber(row.event_count),
      derivedCount: toNumber(row.derived_count),
      duplicateCount: toNumber(row.duplicate_count),
      receivedAt: toIsoDate(row.received_at) ?? new Date(0).toISOString(),
      parseDurationMs: row.parse_duration_ms === null ? null : toNumber(row.parse_duration_ms),
      lastError: row.last_error ?? null,
    };
  }
}
