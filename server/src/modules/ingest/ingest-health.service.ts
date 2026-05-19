import { Inject, Provide } from '@midwayjs/core';
import type {
  BatchDetail,
  BatchListItem,
  BatchListQuery,
  BatchListResponse,
  IngestHealth,
} from '@sdd-telemetry/api';
import { toIsoDate, toNumber, toStringId } from '../query-utils';
import { IngestHealthRepository, type BatchRow } from './ingest-health.repository';

@Provide('ingestHealthService')
export class IngestHealthService {
  @Inject('ingestHealthRepository')
  ingestHealthRepository!: IngestHealthRepository;

  async getHealth(windowHours: number): Promise<IngestHealth> {
    const [healthRows, queueRows] = await Promise.all([
      this.ingestHealthRepository.aggregateHealth(windowHours),
      this.ingestHealthRepository.countPendingOutbox(),
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
    const clauses: string[] = [];
    const params: unknown[] = [];

    if (query.status && query.status.length > 0) {
      const placeholders = query.status.map(() => '?').join(', ');
      clauses.push(`status IN (${placeholders})`);
      params.push(...query.status);
    }

    if (query.cursor) {
      clauses.push('id < ?');
      params.push(query.cursor);
    }

    const rows = await this.ingestHealthRepository.listBatches(clauses, params, query.limit + 1);
    const visibleRows = rows.slice(0, query.limit);

    return {
      items: visibleRows.map(row => this.toBatchListItem(row)),
      nextCursor: rows.length > query.limit ? toStringId(visibleRows.at(-1)?.id) : null,
    };
  }

  async getBatchDetail(batchId: string): Promise<BatchDetail | null> {
    const row = await this.ingestHealthRepository.getBatchDetail(batchId);

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
