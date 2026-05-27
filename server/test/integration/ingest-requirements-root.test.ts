import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createConnection } from 'mysql2/promise';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';

const BASE = process.env.API_BASE_URL ?? 'http://127.0.0.1:4318';
const CASE1_INSTALL_ID = 'case1-test-install';
const CASE1_USER_NAME = 'case1-test-user';
const CASE1_EXPECTED_ROOT = '/tmp/sdd-telemetry-case1-test/requirements';

const fixturePath = join(__dirname, '../fixtures/case1-requirements-root-otlp.json');

interface UserRow {
  install_id: string | null;
  user_name: string | null;
  requirements_root_path: string | null;
}

async function dbConnect() {
  return createConnection({
    host: process.env.MYSQL_HOST ?? '127.0.0.1',
    port: Number(process.env.MYSQL_PORT ?? 3306),
    user: process.env.MYSQL_USER ?? 'sdd-telemetry',
    password: process.env.MYSQL_PASSWORD ?? 'sdd-telemetry',
    database: process.env.MYSQL_DATABASE ?? 'sdd-telemetry',
  });
}

async function cleanupCase1() {
  const connection = await dbConnect();
  try {
    const [batchRows] = (await connection.query(
      `SELECT b.id
       FROM otel_ingest_batches b
       JOIN sdd_users u ON u.id = b.user_id
       WHERE u.install_id = ?`,
      [CASE1_INSTALL_ID],
    )) as [Array<{ id: string }>, unknown];

    for (const { id } of batchRows) {
      await connection.execute('DELETE FROM sdd_errors WHERE batch_id = ?', [id]);
      await connection.execute(
        'DELETE FROM sdd_skill_usages WHERE interaction_id IN (SELECT id FROM sdd_interactions WHERE source_batch_id = ?)',
        [id],
      );
      await connection.execute(
        'DELETE FROM sdd_interaction_texts WHERE interaction_id IN (SELECT id FROM sdd_interactions WHERE source_batch_id = ?)',
        [id],
      );
      await connection.execute(
        'DELETE FROM sdd_interaction_tool_calls WHERE interaction_id IN (SELECT id FROM sdd_interactions WHERE source_batch_id = ?)',
        [id],
      );
      await connection.execute('DELETE FROM sdd_interactions WHERE source_batch_id = ?', [id]);
      await connection.execute('DELETE FROM otel_log_events WHERE batch_id = ?', [id]);
      await connection.execute(
        'DELETE FROM ingest_outbox WHERE event_type = ? AND aggregate_id = ?',
        ['clean_batch', id],
      );
      await connection.execute('DELETE FROM otel_raw_payloads WHERE batch_id = ?', [id]);
      await connection.execute('DELETE FROM otel_ingest_batches WHERE id = ?', [id]);
    }

    await connection.execute('DELETE FROM sdd_users WHERE install_id = ?', [CASE1_INSTALL_ID]);
  } finally {
    await connection.end();
  }
}

async function postOtlp(payload: unknown) {
  const res = await fetch(`${BASE}/api/ingest/otlp-logs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const body = (await res.json()) as {
    success: boolean;
    data?: { batchId: string };
  };
  return { status: res.status, body };
}

async function selectCase1User(): Promise<UserRow | null> {
  const connection = await dbConnect();
  try {
    const [rows] = (await connection.query(
      `SELECT install_id, user_name, requirements_root_path
       FROM sdd_users
       WHERE install_id = ?
       LIMIT 1`,
      [CASE1_INSTALL_ID],
    )) as [UserRow[], unknown];
    return rows[0] ?? null;
  } finally {
    await connection.end();
  }
}

describe('case 1: requirements_root_path 上报闭环', () => {
  let didReachServer = false;

  beforeAll(async () => {
    const res = await fetch(`${BASE}/api/healthz`, {
      signal: AbortSignal.timeout(3000),
    }).catch(() => null);
    if (!res?.ok) {
      throw new Error(
        `Server not running at ${BASE}. Start it with: pnpm --filter @sdd-telemetry/server dev`,
      );
    }
    didReachServer = true;
    await cleanupCase1();
  });

  afterAll(async () => {
    if (didReachServer) {
      await cleanupCase1();
    }
  });

  it('POST /api/ingest/otlp-logs 后 sdd_users.requirements_root_path 等于 OTel 上报值', async () => {
    const payload = JSON.parse(readFileSync(fixturePath, 'utf-8'));
    const { status, body } = await postOtlp(payload);

    expect(status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data?.batchId).toBeTruthy();

    const user = await selectCase1User();
    expect(user).not.toBeNull();
    expect(user?.install_id).toBe(CASE1_INSTALL_ID);
    expect(user?.user_name).toBe(CASE1_USER_NAME);
    expect(user?.requirements_root_path).toBe(CASE1_EXPECTED_ROOT);
  });

  it('seed 不再兜底：删除字段后，二次上报应通过 OTel 上报值自动回填', async () => {
    // 先 NULL 化字段（模拟 seed 不再写入的状态）
    const connection = await dbConnect();
    try {
      await connection.execute(
        'UPDATE sdd_users SET requirements_root_path = NULL WHERE install_id = ?',
        [CASE1_INSTALL_ID],
      );
      const [beforeRows] = (await connection.query(
        'SELECT requirements_root_path FROM sdd_users WHERE install_id = ?',
        [CASE1_INSTALL_ID],
      )) as [Array<{ requirements_root_path: string | null }>, unknown];
      expect(beforeRows[0]?.requirements_root_path).toBeNull();
    } finally {
      await connection.end();
    }

    // 修改 fixture 的一个 attribute 让 payload_hash 不同（避免被 duplicate 处理跳过）
    const payload = JSON.parse(readFileSync(fixturePath, 'utf-8'));
    payload.resourceLogs[0].scopeLogs[0].logRecords[0].timeUnixNano = '1715700000000000001';

    const { status, body } = await postOtlp(payload);
    expect(status).toBe(200);
    expect(body.success).toBe(true);

    const user = await selectCase1User();
    expect(user?.requirements_root_path).toBe(CASE1_EXPECTED_ROOT);
  });
});
