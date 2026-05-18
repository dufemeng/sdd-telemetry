import { Provide } from '@midwayjs/core';
import type { BatchStatus, IngestLogsResponse } from '@sdd-telemetry/api';
import type { EntityManager } from 'typeorm';
import type { OtlpPayloadSummary } from './otel-payload-inspector';

export interface ReceiveLogsRecordInput {
  summary: OtlpPayloadSummary;
  userKey: string;
  rawRetentionDays: number;
  contentType: string | null;
}

interface ExistingBatchRow {
  id: string;
  status: BatchStatus;
}

interface InsertResult {
  insertId?: number | string;
}

@Provide('ingestWriteRepository')
export class IngestWriteRepository {
  async recordReceive(
    manager: EntityManager,
    input: ReceiveLogsRecordInput,
  ): Promise<IngestLogsResponse> {
    const existingBatch = await this.findBatchByPayloadHashForUpdate(
      manager,
      input.summary.payloadHash,
    );

    if (existingBatch) {
      await manager.query(
        `UPDATE otel_ingest_batches
         SET duplicate_count = duplicate_count + 1,
             last_duplicate_at = CURRENT_TIMESTAMP(3),
             gmt_modified = CURRENT_TIMESTAMP(3)
         WHERE id = ?`,
        [existingBatch.id],
      );

      if (existingBatch.status === 'failed_retryable') {
        await this.ensureCleanBatchOutbox(manager, existingBatch.id);
      }

      return {
        batchId: String(existingBatch.id),
        status: existingBatch.status,
        duplicate: true,
        payloadHash: input.summary.payloadHash,
      };
    }

    const userId = await this.upsertUser(manager, input);
    const batchId = await this.insertBatch(manager, input, userId);
    await this.insertRawPayload(manager, batchId, input);
    await this.ensureCleanBatchOutbox(manager, batchId);

    return {
      batchId,
      status: 'received',
      duplicate: false,
      payloadHash: input.summary.payloadHash,
    };
  }

  private async findBatchByPayloadHashForUpdate(
    manager: EntityManager,
    payloadHash: string,
  ): Promise<ExistingBatchRow | null> {
    const rows = (await manager.query(
      `SELECT id, status
       FROM otel_ingest_batches
       WHERE payload_hash = ?
       LIMIT 1
       FOR UPDATE`,
      [payloadHash],
    )) as ExistingBatchRow[];

    return rows[0] ?? null;
  }

  private async upsertUser(manager: EntityManager, input: ReceiveLogsRecordInput): Promise<string> {
    const hints = input.summary.userHints;

    await manager.query(
      `INSERT INTO sdd_users
        (user_key, install_id, user_name, machine_id, machine_name, os_name, os_version,
         client_name, client_version, first_seen_at, last_seen_at, gmt_create, gmt_modified)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3),
         CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3))
       ON DUPLICATE KEY UPDATE
         install_id = COALESCE(VALUES(install_id), install_id),
         user_name = COALESCE(VALUES(user_name), user_name),
         machine_id = COALESCE(VALUES(machine_id), machine_id),
         machine_name = COALESCE(VALUES(machine_name), machine_name),
         os_name = COALESCE(VALUES(os_name), os_name),
         os_version = COALESCE(VALUES(os_version), os_version),
         client_name = COALESCE(VALUES(client_name), client_name),
         client_version = COALESCE(VALUES(client_version), client_version),
         last_seen_at = CURRENT_TIMESTAMP(3),
         gmt_modified = CURRENT_TIMESTAMP(3)`,
      [
        input.userKey,
        hints.installId,
        hints.userName,
        hints.machineId,
        hints.machineName,
        hints.osName,
        hints.osVersion,
        hints.clientName,
        hints.clientVersion,
      ],
    );

    const rows = (await manager.query('SELECT id FROM sdd_users WHERE user_key = ? LIMIT 1', [
      input.userKey,
    ])) as Array<{ id: string }>;
    const userId = rows[0]?.id;

    if (!userId) {
      throw new Error(`failed to upsert user: ${input.userKey}`);
    }

    return String(userId);
  }

  private async insertBatch(
    manager: EntityManager,
    input: ReceiveLogsRecordInput,
    userId: string,
  ): Promise<string> {
    const result = (await manager.query(
      `INSERT INTO otel_ingest_batches
        (payload_hash, user_id, status, status_reason, payload_bytes, raw_log_count,
         event_count, derived_count, duplicate_count, received_at, retry_count,
         gmt_create, gmt_modified)
       VALUES (?, ?, 'received', NULL, ?, ?, 0, 0, 0, CURRENT_TIMESTAMP(3), 0,
         CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3))`,
      [input.summary.payloadHash, userId, input.summary.payloadBytes, input.summary.rawLogCount],
    )) as InsertResult;

    if (result.insertId === undefined) {
      throw new Error('failed to insert ingest batch');
    }

    return String(result.insertId);
  }

  private async insertRawPayload(
    manager: EntityManager,
    batchId: string,
    input: ReceiveLogsRecordInput,
  ): Promise<void> {
    await manager.query(
      `INSERT INTO otel_raw_payloads
        (batch_id, payload_json, payload_bytes, content_type, expires_at, gmt_create, gmt_modified)
       VALUES (?, ?, ?, ?, DATE_ADD(CURRENT_TIMESTAMP(3), INTERVAL ? DAY), CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3))`,
      [
        batchId,
        input.summary.payloadJson,
        input.summary.payloadBytes,
        input.contentType,
        input.rawRetentionDays,
      ],
    );
  }

  private async ensureCleanBatchOutbox(manager: EntityManager, batchId: string): Promise<void> {
    await manager.query(
      `INSERT INTO ingest_outbox
        (event_type, aggregate_id, payload_json, status, attempts, max_attempts,
         next_retry_at, gmt_create, gmt_modified)
       VALUES ('clean_batch', ?, ?, 'pending', 0, 20,
         CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3))
       ON DUPLICATE KEY UPDATE
         status = IF(status = 'failed_terminal', status, 'pending'),
         next_retry_at = CURRENT_TIMESTAMP(3),
         gmt_modified = CURRENT_TIMESTAMP(3)`,
      [batchId, JSON.stringify({ batchId })],
    );
  }
}
