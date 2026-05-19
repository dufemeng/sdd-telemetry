import { createHash } from 'node:crypto';
import { createConnection, type Connection } from 'mysql2/promise';
import pino from 'pino';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createMysqlPool } from '../../src/infrastructure/mysql/client';
import { cleanBatch } from '../../src/jobs/cleaning-worker';

const INSTALL_ID = 'interaction-fidelity-install';
const SESSION_ID = 'interaction-fidelity-session';
const PROMPT_ID = 'interaction-fidelity-prompt';
const USER_KEY = createHash('sha256').update(`install:${INSTALL_ID}`).digest('hex');

interface InteractionRow {
  id: string;
  status: string;
  model: string | null;
  cost_usd: string | number | null;
  input_tokens: number | string | null;
  output_tokens: number | string | null;
  cache_read_tokens: number | string | null;
  cache_creation_tokens: number | string | null;
  duration_ms: number | string | null;
  llm_call_count: number | string | null;
  tool_call_count: number | string | null;
  skill_name: string | null;
  agent_name: string | null;
  plugin_name: string | null;
  query_source: string | null;
  effort: string | null;
  speed: string | null;
  prompt_text: string | null;
  response_text: string | null;
  response_json: string | null;
}

interface ToolCallRow {
  tool_name: string;
  sequence: number | string;
  decision: string | null;
  decision_source: string | null;
  success: number | boolean | null;
  duration_ms: number | string | null;
  input_size_bytes: number | string | null;
  result_size_bytes: number | string | null;
  tool_input_preview: string | null;
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

async function cleanup() {
  const conn = await dbConnect();
  try {
    await conn.execute(
      `DELETE tc FROM sdd_interaction_tool_calls tc
       JOIN sdd_interactions i ON i.id = tc.interaction_id
       WHERE i.prompt_id = ?`,
      [PROMPT_ID],
    );
    await conn.execute(
      `DELETE t FROM sdd_interaction_texts t
       JOIN sdd_interactions i ON i.id = t.interaction_id
       WHERE i.prompt_id = ?`,
      [PROMPT_ID],
    );
    await conn.execute(
      `DELETE su FROM sdd_skill_usages su
       JOIN sdd_interactions i ON i.id = su.interaction_id
       WHERE i.prompt_id = ?`,
      [PROMPT_ID],
    );
    await conn.execute(
      `DELETE e FROM sdd_errors e
       JOIN sdd_interactions i ON i.id = e.interaction_id
       WHERE i.prompt_id = ?`,
      [PROMPT_ID],
    );
    await conn.execute('DELETE FROM sdd_interactions WHERE prompt_id = ?', [PROMPT_ID]);
    await conn.execute('DELETE FROM otel_log_events WHERE prompt_id = ? OR session_id = ?', [
      PROMPT_ID,
      SESSION_ID,
    ]);

    const [userRows] = (await conn.query(
      `SELECT id FROM sdd_users WHERE install_id = ? OR user_key = ?`,
      [INSTALL_ID, USER_KEY],
    )) as [Array<{ id: string }>, unknown];

    for (const { id: userId } of userRows) {
      const [batchRows] = (await conn.query(
        `SELECT id FROM otel_ingest_batches WHERE user_id = ?`,
        [userId],
      )) as [Array<{ id: string }>, unknown];

      for (const { id: batchId } of batchRows) {
        await conn.execute('DELETE FROM sdd_errors WHERE batch_id = ?', [batchId]);
        await conn.execute('DELETE FROM ingest_outbox WHERE aggregate_id = ?', [batchId]);
        await conn.execute('DELETE FROM otel_raw_payloads WHERE batch_id = ?', [batchId]);
        await conn.execute('DELETE FROM otel_ingest_batches WHERE id = ?', [batchId]);
      }
    }

    await conn.execute('DELETE FROM sdd_users WHERE install_id = ? OR user_key = ?', [
      INSTALL_ID,
      USER_KEY,
    ]);
  } finally {
    await conn.end();
  }
}

async function setupBatch(payload: unknown): Promise<string> {
  const conn = await dbConnect();
  try {
    const [userResult] = (await conn.execute(
      `INSERT INTO sdd_users
        (user_key, install_id, user_name, first_seen_at, last_seen_at, gmt_create, gmt_modified)
       VALUES (?, ?, 'interaction-fidelity-user', CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3),
         CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3))
       ON DUPLICATE KEY UPDATE
         last_seen_at = CURRENT_TIMESTAMP(3),
         gmt_modified = CURRENT_TIMESTAMP(3)`,
      [USER_KEY, INSTALL_ID],
    )) as [{ insertId: number }, unknown];
    const userId = String(
      userResult.insertId ||
        (
          (await conn.query(`SELECT id FROM sdd_users WHERE install_id = ? LIMIT 1`, [
            INSTALL_ID,
          ])) as [Array<{ id: string }>, unknown]
        )[0][0]?.id,
    );

    const payloadJson = JSON.stringify(payload);
    const [batchResult] = (await conn.execute(
      `INSERT INTO otel_ingest_batches
        (payload_hash, user_id, status, payload_bytes, raw_log_count, event_count,
         derived_count, duplicate_count, received_at, gmt_create, gmt_modified)
       VALUES (?, ?, 'queued', ?, 0, 0, 0, 0,
         CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3))`,
      [
        createHash('sha256').update(payloadJson).digest('hex'),
        userId,
        Buffer.byteLength(payloadJson),
      ],
    )) as [{ insertId: number }, unknown];
    const batchId = String(batchResult.insertId);

    await conn.execute(
      `INSERT INTO otel_raw_payloads
        (batch_id, payload_json, payload_bytes, expires_at, gmt_create, gmt_modified)
       VALUES (?, ?, ?, DATE_ADD(CURRENT_TIMESTAMP(3), INTERVAL 7 DAY),
         CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3))`,
      [batchId, payloadJson, Buffer.byteLength(payloadJson)],
    );

    return batchId;
  } finally {
    await conn.end();
  }
}

async function selectInteraction(): Promise<InteractionRow> {
  const conn = await dbConnect();
  try {
    const [rows] = (await conn.query(
      `SELECT i.*, t.prompt_text, t.response_text, CAST(t.response_json AS CHAR) AS response_json
       FROM sdd_interactions i
       LEFT JOIN sdd_interaction_texts t ON t.interaction_id = i.id
       WHERE i.prompt_id = ?
       LIMIT 1`,
      [PROMPT_ID],
    )) as [InteractionRow[], unknown];
    const row = rows[0];
    if (!row) {
      throw new Error('interaction row not found');
    }
    return row;
  } finally {
    await conn.end();
  }
}

async function selectToolCalls(interactionId: string): Promise<ToolCallRow[]> {
  const conn = await dbConnect();
  try {
    const [rows] = (await conn.query(
      `SELECT tool_name, sequence, decision, decision_source, success, duration_ms,
              input_size_bytes, result_size_bytes, tool_input_preview
       FROM sdd_interaction_tool_calls
       WHERE interaction_id = ?
       ORDER BY sequence ASC`,
      [interactionId],
    )) as [ToolCallRow[], unknown];
    return rows;
  } finally {
    await conn.end();
  }
}

describe('interaction fidelity cleaning', () => {
  let pool: ReturnType<typeof createMysqlPool>;
  const logger = pino({ level: 'silent' });

  beforeAll(async () => {
    await cleanup();
    pool = createMysqlPool();
  });

  afterAll(async () => {
    if (pool) {
      await pool.end();
    }
    await cleanup();
  });

  it('aggregates metrics and merges tool calls across batches by prompt_id', async () => {
    const firstBatchId = await setupBatch(
      otlpPayload([
        logRecord(1, 'user_prompt', { prompt: '请修复交互明细保真度' }),
        logRecord(2, 'api_request_body', {
          body: JSON.stringify({
            messages: [{ role: 'user', content: '这个 fallback 不应覆盖 user_prompt' }],
          }),
        }),
        logRecord(3, 'api_request', {
          model: 'claude-opus-4-7',
          cost_usd: 0.03,
          input_tokens: 120,
          output_tokens: 20,
          cache_read_tokens: 5,
          cache_creation_tokens: 7,
          duration_ms: 1000,
          skill_name: 'bk-fe:design',
          'agent.name': 'reviewer',
          'plugin.name': 'bk-fe',
          query_source: 'repl_main_thread',
          effort: 'medium',
          speed: 'normal',
        }),
        logRecord(4, 'tool_decision', {
          tool_use_id: 'toolu_fidelity_1',
          tool_name: 'Bash',
          decision: 'allow',
          decision_source: 'policy',
          tool_input: JSON.stringify({ command: 'pnpm test' }),
        }),
      ]),
    );

    await cleanBatch({ batchId: firstBatchId }, { pool, logger });

    const secondBatchId = await setupBatch(
      otlpPayload([
        logRecord(5, 'tool_result', {
          tool_use_id: 'toolu_fidelity_1',
          tool_name: 'Bash',
          success: true,
          duration_ms: 345,
          tool_input_size_bytes: 27,
          tool_result_size_bytes: 1024,
          tool_input: JSON.stringify({ command: 'pnpm test' }),
        }),
        logRecord(6, 'api_error', {
          error_type: 'RateLimitError',
          'error.message': 'temporary retryable failure',
        }),
        logRecord(7, 'api_request', {
          model: 'claude-opus-4-7',
          cost_usd: 0.02,
          input_tokens: 30,
          output_tokens: 10,
          cache_read_tokens: 1,
          cache_creation_tokens: 2,
          duration_ms: 2000,
          skill_name: 'bk-fe:design',
          'agent.name': 'reviewer',
          'plugin.name': 'bk-fe',
          query_source: 'subagent-reviewer',
          effort: 'high',
          speed: 'fast',
        }),
        logRecord(8, 'api_response_body', {
          body: JSON.stringify({
            content: [
              { type: 'thinking' },
              { type: 'tool_use', name: 'Bash', input: { command: 'pnpm test' } },
              { type: 'text', text: '已完成修复。' },
            ],
          }),
        }),
      ]),
    );

    await cleanBatch({ batchId: secondBatchId }, { pool, logger });

    const interaction = await selectInteraction();
    expect(interaction.status).toBe('completed');
    expect(interaction.model).toBe('claude-opus-4-7');
    expect(Number(interaction.cost_usd)).toBeCloseTo(0.05, 6);
    expect(Number(interaction.input_tokens)).toBe(150);
    expect(Number(interaction.output_tokens)).toBe(30);
    expect(Number(interaction.cache_read_tokens)).toBe(6);
    expect(Number(interaction.cache_creation_tokens)).toBe(9);
    expect(Number(interaction.duration_ms)).toBe(3000);
    expect(Number(interaction.llm_call_count)).toBe(2);
    expect(Number(interaction.tool_call_count)).toBe(1);
    expect(interaction.skill_name).toBe('bk-fe:design');
    expect(interaction.agent_name).toBe('reviewer');
    expect(interaction.plugin_name).toBe('bk-fe');
    expect(interaction.query_source).toBe('subagent-reviewer');
    expect(interaction.effort).toBe('high');
    expect(interaction.speed).toBe('fast');
    expect(interaction.prompt_text).toBe('请修复交互明细保真度');
    expect(interaction.response_text).toContain('[思考（脱敏）]');
    expect(interaction.response_text).toContain('[工具 #1: Bash(');
    expect(interaction.response_text).toContain('已完成修复。');
    const responseJson = JSON.parse(interaction.response_json ?? '{}') as {
      content?: Array<{ type?: string; text?: string; name?: string }>;
    };
    expect(responseJson.content?.[0]?.type).toBe('thinking');
    expect(responseJson.content?.[1]).toMatchObject({ type: 'tool_use', name: 'Bash' });
    expect(responseJson.content?.[2]).toMatchObject({ type: 'text', text: '已完成修复。' });

    const toolCalls = await selectToolCalls(interaction.id);
    expect(toolCalls).toHaveLength(1);
    expect(toolCalls[0]).toMatchObject({
      tool_name: 'Bash',
      decision: 'allow',
      decision_source: 'policy',
    });
    expect(Number(toolCalls[0]?.sequence)).toBe(4);
    expect(Boolean(toolCalls[0]?.success)).toBe(true);
    expect(Number(toolCalls[0]?.duration_ms)).toBe(345);
    expect(Number(toolCalls[0]?.input_size_bytes)).toBe(27);
    expect(Number(toolCalls[0]?.result_size_bytes)).toBe(1024);
    expect(toolCalls[0]?.tool_input_preview).toContain('pnpm test');
  });
});

function otlpPayload(logRecords: unknown[]) {
  return {
    resourceLogs: [
      {
        resource: {
          attributes: [
            attr('install_id', INSTALL_ID),
            attr('service.name', 'claude-code'),
            attr('service.version', 'interaction-fidelity-test'),
          ],
        },
        scopeLogs: [
          {
            scope: { name: 'interaction-fidelity' },
            logRecords,
          },
        ],
      },
    ],
  };
}

function logRecord(sequence: number, eventName: string, attributes: Record<string, unknown>) {
  return {
    timeUnixNano: String(1778769900000000000n + BigInt(sequence) * 1_000_000n),
    severityText: eventName === 'api_error' ? 'ERROR' : 'INFO',
    body: { stringValue: `claude_code.${eventName}` },
    attributes: [
      attr('event.name', eventName),
      attr('event.sequence', sequence),
      attr('session.id', SESSION_ID),
      attr('prompt.id', PROMPT_ID),
      ...Object.entries(attributes).map(([key, value]) => attr(key, value)),
    ],
  };
}

function attr(key: string, value: unknown) {
  if (typeof value === 'number') {
    return Number.isInteger(value)
      ? { key, value: { intValue: String(value) } }
      : { key, value: { doubleValue: value } };
  }

  if (typeof value === 'boolean') {
    return { key, value: { boolValue: value } };
  }

  return {
    key,
    value: {
      stringValue: String(value),
    },
  };
}
