import { createConnection } from 'mysql2/promise';
import type { z } from 'zod';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  IngestHealthSchema,
  BatchListResponseSchema,
  BatchDetailSchema,
  IngestLogsResponseSchema,
  EventDistributionSchema,
  FieldCoverageSchema,
  FieldValuesSchema,
  EventTimelineSchema,
  SddSemanticSchema,
  SddFunnelSchema,
  SddUsageSummaryResponseSchema,
  SddUsageItemSchema,
  SddInteractionDetailSchema,
  SddInteractionItemSchema,
  SddErrorItemSchema,
  SddUserItemSchema,
  SddVersionItemSchema,
  SddWorkItemSchema,
  SddWorkItemDetailSchema,
  OpsTablesResponseSchema,
  OpsTableRowsResponseSchema,
  OpsJobsResponseSchema,
  OpsQueueSchema,
  createApiResponseSchema,
} from '@sdd-telemetry/api';

const BASE = process.env.API_BASE_URL ?? 'http://127.0.0.1:4318';
const CONTRACT_SEMANTIC_CODE = 'contract_test_smoke';
const CONTRACT_SKILL_ALIAS = 'contract:test-smoke';
const CONTRACT_SETTINGS_INSTALL_ID = 'contract-test-settings-install';
const CONTRACT_INGEST_INSTALL_ID = 'contract-test-ingest-install';
const CONTRACT_REQUIREMENTS_ROOT = '/tmp/sdd-telemetry-contract-test/requirements';

let contractBatchId: string | null = null;
let didReachServer = false;

async function api(method: string, path: string, body?: unknown) {
  const url = `${BASE}${path}`;
  const init: RequestInit = { method, headers: { 'Content-Type': 'application/json' } };
  if (body !== undefined) {
    init.body = JSON.stringify(body);
  }
  const res = await fetch(url, init);
  const json = await res.json();
  return { status: res.status, body: json };
}

function validateContract<TSchema extends z.ZodType>(
  label: string,
  response: unknown,
  dataSchema: TSchema,
): z.infer<TSchema> {
  const result = createApiResponseSchema(dataSchema).safeParse(response);
  if (!result.success) {
    const issues = result.error.issues.map(
      (i) => `  ${i.path.join('.')}: ${i.message}`,
    );
    throw new Error(`${label} contract violation:\n${issues.join('\n')}`);
  }
  return result.data.data;
}

async function cleanupContractData() {
  if (process.env.API_CONTRACT_CLEANUP === '0') {
    return;
  }

  const connection = await createConnection({
    host: process.env.MYSQL_HOST ?? '127.0.0.1',
    port: Number(process.env.MYSQL_PORT ?? 3306),
    user: process.env.MYSQL_USER ?? 'sdd-telemetry',
    password: process.env.MYSQL_PASSWORD ?? 'sdd-telemetry',
    database: process.env.MYSQL_DATABASE ?? 'sdd-telemetry',
  });

  try {
    const [batchRows] = await connection.query(
      `SELECT b.id
       FROM otel_ingest_batches b
       JOIN sdd_users u ON u.id = b.user_id
       WHERE u.install_id IN (?, ?)`,
      [CONTRACT_SETTINGS_INSTALL_ID, CONTRACT_INGEST_INSTALL_ID],
    ) as [Array<{ id: string }>, unknown];
    const batchIds = [
      ...batchRows.map(row => String(row.id)),
      ...(contractBatchId ? [contractBatchId] : []),
    ];

    for (const batchId of new Set(batchIds)) {
      await connection.execute('DELETE FROM sdd_errors WHERE batch_id = ?', [batchId]);
      await connection.execute('DELETE FROM sdd_skill_usages WHERE interaction_id IN (SELECT id FROM sdd_interactions WHERE source_batch_id = ?)', [batchId]);
      await connection.execute('DELETE FROM sdd_interaction_texts WHERE interaction_id IN (SELECT id FROM sdd_interactions WHERE source_batch_id = ?)', [batchId]);
      await connection.execute('DELETE FROM sdd_interactions WHERE source_batch_id = ?', [batchId]);
      await connection.execute('DELETE FROM otel_log_events WHERE batch_id = ?', [batchId]);
      await connection.execute('DELETE FROM ingest_outbox WHERE event_type = ? AND aggregate_id = ?', [
        'clean_batch',
        batchId,
      ]);
      await connection.execute('DELETE FROM otel_raw_payloads WHERE batch_id = ?', [batchId]);
      await connection.execute('DELETE FROM otel_ingest_batches WHERE id = ?', [batchId]);
    }

    if (contractBatchId) {
      await connection.execute('DELETE FROM ingest_outbox WHERE event_type = ? AND aggregate_id = ?', [
        'clean_batch',
        contractBatchId,
      ]);
      await connection.execute('DELETE FROM otel_raw_payloads WHERE batch_id = ?', [contractBatchId]);
      await connection.execute('DELETE FROM otel_ingest_batches WHERE id = ?', [contractBatchId]);
    }

    await connection.execute('DELETE FROM sdd_skill_aliases WHERE skill_name = ?', [
      CONTRACT_SKILL_ALIAS,
    ]);
    await connection.execute('DELETE FROM sdd_skill_aliases WHERE skill_name LIKE ?', [
      'ct-skill-%',
    ]);
    await connection.execute('DELETE FROM sdd_skill_semantics WHERE semantic_code = ?', [
      CONTRACT_SEMANTIC_CODE,
    ]);
    await connection.execute('DELETE FROM sdd_skill_semantics WHERE semantic_code LIKE ?', [
      'contract-test-%',
    ]);
    await connection.execute('DELETE FROM sdd_users WHERE install_id IN (?, ?)', [
      CONTRACT_SETTINGS_INSTALL_ID,
      CONTRACT_INGEST_INSTALL_ID,
    ]);
  } finally {
    await connection.end();
  }
}

describe('API Contract Tests', () => {
  beforeAll(async () => {
    const res = await fetch(`${BASE}/api/ingest/health`, { signal: AbortSignal.timeout(3000) }).catch(() => null);
    if (!res?.ok) {
      throw new Error(`Server not running at ${BASE}. Start it with: pnpm --filter @sdd-telemetry/server dev`);
    }
    didReachServer = true;
    await cleanupContractData();
  });

  afterAll(async () => {
    if (!didReachServer) {
      return;
    }

    await cleanupContractData();
  });

  describe('Ingest API', () => {
    it('GET /api/ingest/health — returns IngestHealth', async () => {
      const { status, body } = await api('GET', '/api/ingest/health');
      expect(status).toBe(200);
      validateContract('IngestHealth', body, IngestHealthSchema);
    });

    it('GET /api/ingest/health?windowHours=48 — respects query param', async () => {
      const { status, body } = await api('GET', '/api/ingest/health?windowHours=48');
      expect(status).toBe(200);
      const data = validateContract('IngestHealth', body, IngestHealthSchema);
      expect(data.windowHours).toBe(48);
    });

    it('GET /api/ingest/batches — returns BatchListResponse', async () => {
      const { status, body } = await api('GET', '/api/ingest/batches');
      expect(status).toBe(200);
      validateContract('BatchListResponse', body, BatchListResponseSchema);
    });

    it('GET /api/ingest/batches/:id — returns BatchDetail', async () => {
      const listResponse = await api('GET', '/api/ingest/batches');
      const list = validateContract('BatchListResponse', listResponse.body, BatchListResponseSchema);
      const first = list.items[0];
      if (!first) return;
      const { status, body } = await api('GET', `/api/ingest/batches/${first.id}`);
      expect(status).toBe(200);
      validateContract('BatchDetail', body, BatchDetailSchema);
    });

    it('POST /api/ingest/otlp-logs — returns IngestLogsResponse', async () => {
      const payload = {
        resourceLogs: [{
          resource: {
            attributes: [
              { key: 'install_id', value: { stringValue: CONTRACT_INGEST_INSTALL_ID } },
              { key: 'service.name', value: { stringValue: 'contract-test' } },
            ],
          },
          scopeLogs: [{
            scope: {},
            logRecords: [{
              timeUnixNano: '1715699999000000000',
              body: { stringValue: 'contract-test' },
              attributes: [],
            }],
          }],
        }],
      };
      const { status, body } = await api('POST', '/api/ingest/otlp-logs', payload);
      expect(status).toBe(200);
      const data = validateContract('IngestLogsResponse', body, IngestLogsResponseSchema);
      contractBatchId = data.batchId;
    });
  });

  describe('Events API', () => {
    it('GET /api/events/distribution — returns EventDistribution', async () => {
      const { status, body } = await api('GET', '/api/events/distribution');
      expect(status).toBe(200);
      validateContract('EventDistribution', body, EventDistributionSchema);
    });

    it('GET /api/events/field-coverage — returns FieldCoverage', async () => {
      const { status, body } = await api('GET', '/api/events/field-coverage');
      expect(status).toBe(200);
      validateContract('FieldCoverage', body, FieldCoverageSchema);
    });

    it('GET /api/events/field-values — returns FieldValues', async () => {
      const { status, body } = await api('GET', '/api/events/field-values?fieldPath=event_name');
      expect(status).toBe(200);
      const data = validateContract('FieldValues', body, FieldValuesSchema);
      expect(data.fieldPath).toBe('event_name');
      if (data.totalEvents > 0) {
        expect(data.values.length).toBeGreaterThan(0);
      }
    });

    it('GET /api/events/timeline — returns EventTimeline', async () => {
      const { status, body } = await api('GET', '/api/events/timeline');
      expect(status).toBe(200);
      validateContract('EventTimeline', body, EventTimelineSchema);
    });
  });

  describe('SDD API', () => {
    it('GET /api/sdd/semantics — returns SddSemantic[]', async () => {
      const { status, body } = await api('GET', '/api/sdd/semantics');
      expect(status).toBe(200);
      validateContract('SddSemantic[]', body, SddSemanticSchema.array());
    });

    it('POST /api/sdd/semantics — creates and returns SddSemantic', async () => {
      const payload = {
        semanticCode: CONTRACT_SEMANTIC_CODE,
        displayName: 'Contract Test',
        aliases: [CONTRACT_SKILL_ALIAS],
      };
      const { status, body } = await api('POST', '/api/sdd/semantics', payload);
      expect(status).toBe(200);
      const data = validateContract('SddSemantic', body, SddSemanticSchema);
      expect(data.semanticCode).toBe(CONTRACT_SEMANTIC_CODE);
    });

    it('GET /api/sdd/funnel — returns SddFunnel', async () => {
      const { status, body } = await api('GET', '/api/sdd/funnel');
      expect(status).toBe(200);
      validateContract('SddFunnel', body, SddFunnelSchema);
    });

    it('GET /api/sdd/usage-summary — returns SddUsageSummaryResponse', async () => {
      const { status, body } = await api('GET', '/api/sdd/usage-summary');
      expect(status).toBe(200);
      validateContract('SddUsageSummaryResponse', body, SddUsageSummaryResponseSchema);
    });

    it('GET /api/sdd/usages — returns SddUsageItem[]', async () => {
      const { status, body } = await api('GET', '/api/sdd/usages');
      expect(status).toBe(200);
      validateContract('SddUsageItem[]', body, SddUsageItemSchema.array());
    });

    it('GET /api/sdd/interactions — returns SddInteractionItem[]', async () => {
      const { status, body } = await api('GET', '/api/sdd/interactions');
      expect(status).toBe(200);
      validateContract('SddInteractionItem[]', body, SddInteractionItemSchema.array());
    });

    it('GET /api/sdd/interactions/:id — returns SddInteractionDetail', async () => {
      const listResponse = await api('GET', '/api/sdd/interactions');
      const list = validateContract('SddInteractionItem[]', listResponse.body, SddInteractionItemSchema.array());
      const first = list[0];
      if (!first) return;
      const { status, body } = await api('GET', `/api/sdd/interactions/${first.id}`);
      expect(status).toBe(200);
      validateContract('SddInteractionDetail', body, SddInteractionDetailSchema);
    });

    it('GET /api/sdd/errors — returns SddErrorItem[]', async () => {
      const { status, body } = await api('GET', '/api/sdd/errors');
      expect(status).toBe(200);
      validateContract('SddErrorItem[]', body, SddErrorItemSchema.array());
    });

    it('GET /api/sdd/users — returns SddUserItem[]', async () => {
      const { status, body } = await api('GET', '/api/sdd/users');
      expect(status).toBe(200);
      validateContract('SddUserItem[]', body, SddUserItemSchema.array());
    });

    it('GET /api/sdd/versions — returns SddVersionItem[]', async () => {
      const { status, body } = await api('GET', '/api/sdd/versions');
      expect(status).toBe(200);
      validateContract('SddVersionItem[]', body, SddVersionItemSchema.array());
    });

    it('GET /api/sdd/work-items — returns SddWorkItem[]', async () => {
      const { status, body } = await api('GET', '/api/sdd/work-items');
      expect(status).toBe(200);
      validateContract('SddWorkItem[]', body, SddWorkItemSchema.array());
    });

    it('GET /api/sdd/work-items/:id — returns SddWorkItemDetail', async () => {
      const listResponse = await api('GET', '/api/sdd/work-items');
      const list = validateContract('SddWorkItem[]', listResponse.body, SddWorkItemSchema.array());
      const first = list[0];
      if (!first) return;
      const { status, body } = await api('GET', `/api/sdd/work-items/${first.id}`);
      expect(status).toBe(200);
      validateContract('SddWorkItemDetail', body, SddWorkItemDetailSchema);
    });

    it('POST /api/sdd/user-settings — creates and returns SddUserItem', async () => {
      const payload = {
        installId: CONTRACT_SETTINGS_INSTALL_ID,
        userName: 'Contract Test',
        machineId: 'contract-test-machine',
        machineName: 'contract-test-machine',
        requirementsRootPath: CONTRACT_REQUIREMENTS_ROOT,
      };
      const { status, body } = await api('POST', '/api/sdd/user-settings', payload);
      expect(status).toBe(200);
      const data = validateContract('SddUserItem', body, SddUserItemSchema);
      expect(data.installId).toBe(CONTRACT_SETTINGS_INSTALL_ID);
    });
  });

  describe('Ops API', () => {
    it('GET /api/ops/tables — returns OpsTablesResponse', async () => {
      const { status, body } = await api('GET', '/api/ops/tables');
      expect(status).toBe(200);
      validateContract('OpsTablesResponse', body, OpsTablesResponseSchema);
    });

    it('GET /api/ops/tables/:name/rows — returns OpsTableRowsResponse', async () => {
      const { status, body } = await api('GET', '/api/ops/tables/sdd_users/rows?limit=3');
      expect(status).toBe(200);
      validateContract('OpsTableRowsResponse', body, OpsTableRowsResponseSchema);
    });

    it('GET /api/ops/jobs — returns OpsJobsResponse', async () => {
      const { status, body } = await api('GET', '/api/ops/jobs');
      expect(status).toBe(200);
      validateContract('OpsJobsResponse', body, OpsJobsResponseSchema);
    });

    it('GET /api/ops/queue — returns OpsQueue', async () => {
      const { status, body } = await api('GET', '/api/ops/queue');
      expect(status).toBe(200);
      validateContract('OpsQueue', body, OpsQueueSchema);
    });
  });
});
