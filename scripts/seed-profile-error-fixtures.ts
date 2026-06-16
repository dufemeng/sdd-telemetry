import crypto from 'node:crypto';
import mysql from 'mysql2/promise';
import * as dotenv from 'dotenv';

dotenv.config();

const profiles = ['sdd-default', 'e2e-monorepo'];

const cases = [
  {
    errorType: 'empty_locator',
    toolName: 'Read',
    locator: '',
    message: '知识库读取失败：工具输入中的 path 为空，无法解析知识库文档。',
    input: { path: '', reason: 'empty knowledge link' },
  },
  {
    errorType: 'file_missing',
    toolName: 'Read',
    locator: '/workspace/wiki/payment/refund-policy.md',
    message: '知识库读取失败：目标文件不存在或已被移动。',
    input: { path: '/workspace/wiki/payment/refund-policy.md' },
  },
  {
    errorType: 'mcp_resource_not_found',
    toolName: 'mcp__knowledge__read_resource',
    locator: 'mcp://knowledge/payment/refund-policy',
    message: '知识库读取失败：MCP resource 未找到对应文档。',
    input: { uri: 'mcp://knowledge/payment/refund-policy' },
  },
  {
    errorType: 'read_token_limit',
    toolName: 'Read',
    locator: '/workspace/wiki/risk/full-user-journey.md',
    message: '知识库读取失败：文档超过读取 token 限制，内容被拒绝加载。',
    input: { path: '/workspace/wiki/risk/full-user-journey.md', maxTokens: 120000 },
  },
  {
    errorType: 'permission_denied',
    toolName: 'WebFetch',
    locator: 'https://docs.internal.example/wiki/credit-risk/access-control',
    message: '知识库读取失败：内部知识库链接返回 403。',
    input: { url: 'https://docs.internal.example/wiki/credit-risk/access-control' },
  },
  {
    errorType: 'empty_locator',
    toolName: 'mcp__knowledge__read_resource',
    locator: '',
    message: '知识库读取失败：MCP 文档 locator 为空，无法定位资源。',
    input: { uri: '' },
  },
];

async function main() {
  const connection = await mysql.createConnection({
    host: process.env.MYSQL_HOST ?? '127.0.0.1',
    port: Number(process.env.MYSQL_PORT ?? 3306),
    user: process.env.MYSQL_USER ?? 'sdd-telemetry',
    password: process.env.MYSQL_PASSWORD ?? 'sdd-telemetry',
    database: process.env.MYSQL_DATABASE ?? 'sdd-telemetry',
    namedPlaceholders: true,
  });

  try {
    for (const profileId of profiles) {
      const [runRows] = await connection.query<mysql.RowDataPacket[]>(
        'SELECT current_projection_run_id AS runId FROM profile_current_projection_runs WHERE profile_id = ? LIMIT 1',
        [profileId],
      );
      const runId = Number(runRows[0]?.runId ?? 0);
      if (!runId) {
        console.info(JSON.stringify({ profileId, skipped: 'no_current_run' }));
        continue;
      }

      const [contextRows] = await connection.query<mysql.RowDataPacket[]>(
        `SELECT user_id, session_id, prompt_id, interaction_id, delivery_unit_id, id AS capability_usage_id
         FROM profile_capability_usages
         WHERE profile_id = ? AND projection_run_id = ?
         ORDER BY event_time DESC, id DESC
         LIMIT 8`,
        [profileId, runId],
      );
      const contexts = contextRows.length > 0 ? contextRows : [{} as mysql.RowDataPacket];

      let inserted = 0;
      for (let i = 0; i < cases.length; i += 1) {
        const sample = cases[i]!;
        const context = contexts[i % contexts.length]!;
        const key = sha256(`local-fixture:${profileId}:${runId}:knowledge:${i}`);
        const messageHash = sha256(sample.message);
        const hoursAgo = i + (profileId === 'e2e-monorepo' ? 2 : 1);
        await connection.execute(
          `INSERT INTO profile_error_events
             (profile_id, projection_run_id, error_key, category, display_name, severity,
              source_kind, source_scope, source_category, matched_rule_id, confidence,
              user_id, session_id, prompt_id, interaction_id, delivery_unit_id, capability_usage_id,
              tool_call_id, sdd_error_id, event_id, tool_name, error_type, error_message_hash,
              message_preview, input_preview, locator, event_time, evidence_json, rule_version)
           VALUES
             (?, ?, ?, 'knowledge_read_failed', '知识库读取失败', 'error',
              'tool_call', 'matched', 'knowledge', ?, 'high',
              ?, ?, ?, ?, ?, ?,
              NULL, NULL, ?, ?, ?, ?,
              ?, ?, ?, DATE_SUB(NOW(3), INTERVAL ? HOUR), CAST(? AS JSON), 'local-fixture-v1')
           ON DUPLICATE KEY UPDATE
              message_preview = VALUES(message_preview),
              input_preview = VALUES(input_preview),
              locator = VALUES(locator),
              event_time = VALUES(event_time),
              gmt_modified = CURRENT_TIMESTAMP(3)`,
          [
            profileId,
            runId,
            key,
            profileId === 'e2e-monorepo' ? 'e2e-knowledge-docs' : 'skill-code-domain-wiki',
            nullableNumber(context.user_id),
            nullableString(context.session_id),
            nullableString(context.prompt_id),
            nullableNumber(context.interaction_id),
            nullableNumber(context.delivery_unit_id),
            nullableNumber(context.capability_usage_id),
            key,
            sample.toolName,
            sample.errorType,
            messageHash,
            sample.message,
            JSON.stringify(sample.input),
            sample.locator,
            hoursAgo,
            JSON.stringify({ localFixture: true, sample: sample.errorType }),
          ],
        );
        inserted += 1;
      }

      console.info(JSON.stringify({ profileId, runId, inserted }));
    }
  } finally {
    await connection.end();
  }
}

function sha256(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function nullableString(value: unknown): string | null {
  return value == null ? null : String(value);
}

function nullableNumber(value: unknown): number | null {
  return value == null ? null : Number(value);
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
