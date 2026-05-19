import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createConnection, type Connection } from 'mysql2/promise';
import pino from 'pino';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createMysqlPool } from '../../src/infrastructure/mysql/client';
import { cleanBatch } from '../../src/jobs/cleaning-worker';

const CASE5_INSTALL_ID = 'case5-test-install';
const CASE5_USER_NAME = 'case5-test-user';
const CASE5_REQUIREMENTS_ROOT = '/tmp/sdd-telemetry-case5-test/requirements';
const CASE5_USER_KEY = createHash('sha256').update(`install:${CASE5_INSTALL_ID}`).digest('hex');

const fixturePath = join(__dirname, '../fixtures/case5-error-with-context-otlp.json');

interface ErrorRow {
  id: string;
  usage_id: string | null;
  work_item_id: string | null;
  error_type: string;
  error_message: string | null;
}

interface WorkItemCountRow {
  count_value: number | string;
}

async function dbConnect(): Promise<Connection> {
  return createConnection({
    host: process.env.MYSQL_HOST ?? '127.0.0.1',
    port: Number(process.env.MYSQL_PORT ?? 3306),
    user: process.env.MYSQL_USER ?? 'sdd-telemetry',
    password: process.env.MYSQL_PASSWORD ?? 'sdd-telemetry',
    database: process.env.MYSQL_DATABASE ?? 'sdd-telemetry',
  });
}

async function cleanupCase5() {
  const conn = await dbConnect();
  try {
    const [userRows] = (await conn.query(
      `SELECT id FROM sdd_users WHERE install_id = ? OR user_key = ?`,
      [CASE5_INSTALL_ID, CASE5_USER_KEY],
    )) as [Array<{ id: string }>, unknown];

    for (const { id: userId } of userRows) {
      const [batchRows] = (await conn.query(
        `SELECT id FROM otel_ingest_batches WHERE user_id = ?`,
        [userId],
      )) as [Array<{ id: string }>, unknown];

      for (const { id: batchId } of batchRows) {
        await conn.execute('DELETE FROM sdd_errors WHERE batch_id = ?', [batchId]);
        await conn.execute(
          'DELETE FROM sdd_skill_usages WHERE interaction_id IN (SELECT id FROM sdd_interactions WHERE source_batch_id = ?)',
          [batchId],
        );
        await conn.execute(
          'DELETE FROM sdd_interaction_texts WHERE interaction_id IN (SELECT id FROM sdd_interactions WHERE source_batch_id = ?)',
          [batchId],
        );
        await conn.execute(
          'DELETE FROM sdd_interaction_tool_calls WHERE interaction_id IN (SELECT id FROM sdd_interactions WHERE source_batch_id = ?)',
          [batchId],
        );
        await conn.execute('DELETE FROM sdd_interactions WHERE source_batch_id = ?', [batchId]);
        await conn.execute('DELETE FROM otel_log_events WHERE batch_id = ?', [batchId]);
        await conn.execute('DELETE FROM ingest_outbox WHERE event_type = ? AND aggregate_id = ?', [
          'clean_batch',
          batchId,
        ]);
        await conn.execute('DELETE FROM otel_raw_payloads WHERE batch_id = ?', [batchId]);
        await conn.execute('DELETE FROM otel_ingest_batches WHERE id = ?', [batchId]);
      }

      await conn.execute(
        `DELETE wia FROM sdd_work_item_artifacts wia
         JOIN sdd_work_items wi ON wi.id = wia.work_item_id
         WHERE wi.relative_dir LIKE ?`,
        ['test-domain/2026-05-18-case5-relink%'],
      );
      await conn.execute('DELETE FROM sdd_work_items WHERE relative_dir LIKE ?', [
        'test-domain/2026-05-18-case5-relink%',
      ]);
    }

    await conn.execute('DELETE FROM sdd_users WHERE install_id = ? OR user_key = ?', [
      CASE5_INSTALL_ID,
      CASE5_USER_KEY,
    ]);
  } finally {
    await conn.end();
  }
}

async function setupCase5Fixture(): Promise<{ batchId: string }> {
  const conn = await dbConnect();
  try {
    const [userResult] = (await conn.execute(
      `INSERT INTO sdd_users
        (user_key, install_id, user_name, requirements_root_path,
         first_seen_at, last_seen_at, gmt_create, gmt_modified)
       VALUES (?, ?, ?, ?,
         CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3),
         CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3))`,
      [CASE5_USER_KEY, CASE5_INSTALL_ID, CASE5_USER_NAME, CASE5_REQUIREMENTS_ROOT],
    )) as [{ insertId: number }, unknown];
    const userId = String(userResult.insertId);

    const payloadJson = readFileSync(fixturePath, 'utf-8');
    const payloadHash = createHash('sha256').update(payloadJson).digest('hex');
    const payloadBytes = Buffer.byteLength(payloadJson);

    const [batchResult] = (await conn.execute(
      `INSERT INTO otel_ingest_batches
        (payload_hash, user_id, status, payload_bytes, raw_log_count, event_count,
         derived_count, duplicate_count, received_at, gmt_create, gmt_modified)
       VALUES (?, ?, 'queued', ?, 4, 0, 0, 0,
         CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3))`,
      [payloadHash, userId, payloadBytes],
    )) as [{ insertId: number }, unknown];
    const batchId = String(batchResult.insertId);

    await conn.execute(
      `INSERT INTO otel_raw_payloads
        (batch_id, payload_json, payload_bytes, expires_at, gmt_create, gmt_modified)
       VALUES (?, ?, ?, DATE_ADD(CURRENT_TIMESTAMP(3), INTERVAL 7 DAY),
         CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3))`,
      [batchId, payloadJson, payloadBytes],
    );

    return { batchId };
  } finally {
    await conn.end();
  }
}

async function selectCase5Errors(batchId: string): Promise<ErrorRow[]> {
  const conn = await dbConnect();
  try {
    const [rows] = (await conn.query(
      `SELECT id, usage_id, work_item_id, error_type, error_message
       FROM sdd_errors
       WHERE batch_id = ?`,
      [batchId],
    )) as [ErrorRow[], unknown];
    return rows;
  } finally {
    await conn.end();
  }
}

async function selectCase5WorkItemErrorCount(workItemId: string): Promise<number> {
  const conn = await dbConnect();
  try {
    const [rows] = (await conn.query(
      `SELECT COUNT(*) AS count_value FROM sdd_errors WHERE work_item_id = ?`,
      [workItemId],
    )) as [WorkItemCountRow[], unknown];
    return Number(rows[0]?.count_value ?? 0);
  } finally {
    await conn.end();
  }
}

describe('case 5: error → usage / work_item 反链 (worker cleanBatch)', () => {
  let pool: ReturnType<typeof createMysqlPool>;
  const logger = pino({ level: 'silent' });
  let batchId = '';

  beforeAll(async () => {
    await cleanupCase5();
    pool = createMysqlPool();
    const setup = await setupCase5Fixture();
    batchId = setup.batchId;
  });

  afterAll(async () => {
    if (pool) {
      await pool.end();
    }
    await cleanupCase5();
  });

  it('cleanBatch 后 sdd_errors 至少有 1 行', async () => {
    await cleanBatch({ batchId }, { pool, logger });

    const errorRows = await selectCase5Errors(batchId);
    expect(errorRows.length).toBeGreaterThanOrEqual(1);
    expect(errorRows[0]?.error_type).toBe('TestError');
  });

  it('error.usage_id 关联到同 session 的最近 usage', async () => {
    const errorRows = await selectCase5Errors(batchId);
    const target = errorRows[0];
    expect(target).toBeDefined();
    expect(target?.usage_id).not.toBeNull();
  });

  it('error.work_item_id 通过 usage 反查回填', async () => {
    const errorRows = await selectCase5Errors(batchId);
    const target = errorRows[0];
    expect(target?.work_item_id).not.toBeNull();
  });

  it('对应 work_item 的 errorCount 等于 1', async () => {
    const errorRows = await selectCase5Errors(batchId);
    const workItemId = errorRows[0]?.work_item_id;
    expect(workItemId).not.toBeNull();
    if (!workItemId) return;
    const count = await selectCase5WorkItemErrorCount(workItemId);
    expect(count).toBe(1);
  });

  it('重复调用 cleanBatch 是幂等的（不会重复插入 error）', async () => {
    // 重置 batch 状态以允许再次 cleanBatch
    const conn = await dbConnect();
    try {
      await conn.execute(
        `UPDATE otel_ingest_batches
         SET status = 'queued', parse_started_at = NULL, parse_completed_at = NULL,
             gmt_modified = CURRENT_TIMESTAMP(3)
         WHERE id = ?`,
        [batchId],
      );
    } finally {
      await conn.end();
    }

    await cleanBatch({ batchId }, { pool, logger });

    const errorRows = await selectCase5Errors(batchId);
    expect(errorRows.length).toBe(1);
    expect(errorRows[0]?.usage_id).not.toBeNull();
    expect(errorRows[0]?.work_item_id).not.toBeNull();
  });
});
