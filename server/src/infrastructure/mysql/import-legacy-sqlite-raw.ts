import { execFileSync } from 'node:child_process';
import { createAppDataSource } from './data-source';
import { createUserKey, summarizeOtlpPayload } from '../../modules/ingest/otel-payload-inspector';

interface LegacyRawPayload {
  batch_id: string;
  received_at: string;
  payload_json: string;
  payload_format: string;
  expires_at: string;
}

interface InsertResult {
  insertId?: string | number;
}

interface IdRow {
  id: string;
}

async function main(): Promise<void> {
  const sqlitePath = process.env.LEGACY_SQLITE_PATH;
  if (!sqlitePath) {
    throw new Error('LEGACY_SQLITE_PATH is required');
  }

  const limit = Number(process.env.LEGACY_SQLITE_IMPORT_LIMIT ?? 0);
  const rows = readLegacyRows(sqlitePath, limit);
  const dataSource = createAppDataSource();
  await dataSource.initialize();

  let imported = 0;
  let skipped = 0;

  try {
    for (const row of rows) {
      const payload = JSON.parse(row.payload_json) as unknown;
      const summary = summarizeOtlpPayload(payload);
      const existingBatch = await findBatchByPayloadHash(dataSource, summary.payloadHash);
      if (existingBatch) {
        skipped += 1;
        continue;
      }

      const userId = await upsertUser(dataSource, summary, row);
      const batchId = await insertBatch(dataSource, summary, row, userId);
      await insertRawPayload(dataSource, batchId, row, summary);
      await insertOutbox(dataSource, batchId);
      imported += 1;
    }
  } finally {
    await dataSource.destroy();
  }

  console.info(
    `[sdd-telemetry] imported legacy sqlite raw payloads: imported=${imported}, skipped=${skipped}, source=${sqlitePath}`,
  );
}

function readLegacyRows(sqlitePath: string, limit: number): LegacyRawPayload[] {
  const sql = [
    'SELECT batch_id, received_at, payload_json, payload_format, expires_at',
    'FROM raw_payloads',
    'ORDER BY received_at ASC',
    limit > 0 ? `LIMIT ${limit}` : '',
  ].filter(Boolean).join(' ');
  const output = execFileSync('sqlite3', ['-json', sqlitePath, sql], {
    encoding: 'utf8',
    maxBuffer: Number(process.env.LEGACY_SQLITE_IMPORT_MAX_BUFFER ?? 256 * 1024 * 1024),
  });

  return JSON.parse(output) as LegacyRawPayload[];
}

async function findBatchByPayloadHash(
  dataSource: ReturnType<typeof createAppDataSource>,
  payloadHash: string,
): Promise<string | null> {
  const rows = await dataSource.query(
    'SELECT id FROM otel_ingest_batches WHERE payload_hash = ? LIMIT 1',
    [payloadHash],
  ) as IdRow[];

  return rows[0]?.id ?? null;
}

async function upsertUser(
  dataSource: ReturnType<typeof createAppDataSource>,
  summary: ReturnType<typeof summarizeOtlpPayload>,
  row: LegacyRawPayload,
): Promise<string> {
  const hints = summary.userHints;
  const userKey = createUserKey(hints, summary.payloadHash);

  await dataSource.query(
    `INSERT INTO sdd_users
      (user_key, install_id, user_name, machine_id, machine_name, os_name, os_version,
       client_name, client_version, first_seen_at, last_seen_at, gmt_create, gmt_modified)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3))
     ON DUPLICATE KEY UPDATE
       install_id = COALESCE(VALUES(install_id), install_id),
       user_name = COALESCE(VALUES(user_name), user_name),
       machine_id = COALESCE(VALUES(machine_id), machine_id),
       machine_name = COALESCE(VALUES(machine_name), machine_name),
       os_name = COALESCE(VALUES(os_name), os_name),
       os_version = COALESCE(VALUES(os_version), os_version),
       client_name = COALESCE(VALUES(client_name), client_name),
       client_version = COALESCE(VALUES(client_version), client_version),
       last_seen_at = GREATEST(COALESCE(last_seen_at, VALUES(last_seen_at)), VALUES(last_seen_at)),
       gmt_modified = CURRENT_TIMESTAMP(3)`,
    [
      userKey,
      hints.installId,
      hints.userName,
      hints.machineId,
      hints.machineName,
      hints.osName,
      hints.osVersion,
      hints.clientName,
      hints.clientVersion,
      toDate(row.received_at),
      toDate(row.received_at),
    ],
  );

  const rows = await dataSource.query('SELECT id FROM sdd_users WHERE user_key = ? LIMIT 1', [
    userKey,
  ]) as IdRow[];
  const userId = rows[0]?.id;
  if (!userId) {
    throw new Error(`failed to upsert legacy user for batch ${row.batch_id}`);
  }

  return String(userId);
}

async function insertBatch(
  dataSource: ReturnType<typeof createAppDataSource>,
  summary: ReturnType<typeof summarizeOtlpPayload>,
  row: LegacyRawPayload,
  userId: string,
): Promise<string> {
  const result = await dataSource.query(
    `INSERT INTO otel_ingest_batches
      (payload_hash, user_id, status, status_reason, payload_bytes, raw_log_count,
       event_count, derived_count, duplicate_count, received_at, retry_count,
       gmt_create, gmt_modified)
     VALUES (?, ?, 'received', 'imported from legacy sqlite', ?, ?, 0, 0, 0, ?, 0, ?, ?)`,
    [
      summary.payloadHash,
      userId,
      summary.payloadBytes,
      summary.rawLogCount,
      toDate(row.received_at),
      toDate(row.received_at),
      toDate(row.received_at),
    ],
  ) as InsertResult;

  if (result.insertId === undefined) {
    throw new Error(`failed to insert legacy batch ${row.batch_id}`);
  }

  return String(result.insertId);
}

async function insertRawPayload(
  dataSource: ReturnType<typeof createAppDataSource>,
  batchId: string,
  row: LegacyRawPayload,
  summary: ReturnType<typeof summarizeOtlpPayload>,
): Promise<void> {
  await dataSource.query(
    `INSERT INTO otel_raw_payloads
      (batch_id, payload_json, payload_bytes, content_type, expires_at, gmt_create, gmt_modified)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      batchId,
      row.payload_json,
      summary.payloadBytes,
      row.payload_format || 'json',
      toDate(row.expires_at),
      toDate(row.received_at),
      toDate(row.received_at),
    ],
  );
}

async function insertOutbox(
  dataSource: ReturnType<typeof createAppDataSource>,
  batchId: string,
): Promise<void> {
  await dataSource.query(
    `INSERT INTO ingest_outbox
      (event_type, aggregate_id, payload_json, status, attempts, max_attempts,
       next_retry_at, gmt_create, gmt_modified)
     VALUES ('clean_batch', ?, ?, 'pending', 0, 20, CURRENT_TIMESTAMP(3),
       CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3))
     ON DUPLICATE KEY UPDATE
       status = IF(status = 'failed_terminal', status, 'pending'),
       next_retry_at = CURRENT_TIMESTAMP(3),
       gmt_modified = CURRENT_TIMESTAMP(3)`,
    [batchId, JSON.stringify({ batchId })],
  );
}

function toDate(value: string): Date {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`invalid date from legacy sqlite: ${value}`);
  }

  return date;
}

void main();
