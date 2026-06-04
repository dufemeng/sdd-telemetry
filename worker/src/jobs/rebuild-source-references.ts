import type { Pool, ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import type { Logger } from 'pino';
import { createMysqlPool } from '../infrastructure/mysql/client';
import { createLogger } from '../support/logger';
import {
  extractSourceReferences,
  type SourceReferenceInput,
  type ToolCallFact,
} from './source-reference-extractor';

/**
 * source_references 全量重建（MVP-1，Task 6）。
 *
 * - 输入：sdd_interaction_tool_calls + sdd_interactions + 决策事件的完整 attributes_json。
 *   tool_input 从 otel_log_events.attributes_json 读取完整值（不依赖 4096 preview）。
 * - 按 reference_key 幂等 upsert，不 TRUNCATE（rule_version 变更时才需全清重建）。
 */

const PAGE_SIZE = 1000;

interface ToolCallRow extends RowDataPacket {
  tool_call_id: number;
  tool_use_id: string | null;
  tool_name: string;
  mcp_server_scope: string | null;
  interaction_id: number;
  user_id: number | null;
  session_id: string | null;
  prompt_id: string | null;
  source_event_id: string | null;
  event_time: Date | null;
  attributes_json: unknown;
}

export interface RebuildSourceReferencesStats {
  toolCalls: number;
  extracted: number;
  /** 新增行数 = 全表行数差（不依赖 affectedRows，规避 CLIENT_FOUND_ROWS 干扰）。 */
  inserted: number;
  /** 命中既有 reference_key 的次数（更新或无变化）。 */
  reused: number;
  parseFailed: number;
  unknown: number;
}

export async function rebuildSourceReferences(
  pool: Pool,
  logger: Logger,
): Promise<RebuildSourceReferencesStats> {
  const stats: RebuildSourceReferencesStats = {
    toolCalls: 0,
    extracted: 0,
    inserted: 0,
    reused: 0,
    parseFailed: 0,
    unknown: 0,
  };

  const countBefore = await countRows(pool);
  let lastId = 0;
  for (;;) {
    const [rows] = await pool.query<ToolCallRow[]>(
      // tool_input 在 tool_result 事件的 attributes_json 上（不在 tool_decision），
      // 回退到 decision 事件以兜底极少数只有 decision 的调用。
      `SELECT tc.id AS tool_call_id, tc.tool_use_id, tc.tool_name, tc.mcp_server_scope,
              tc.interaction_id, i.user_id, i.session_id, i.prompt_id, i.started_at AS event_time,
              e.event_id AS source_event_id, e.attributes_json
       FROM sdd_interaction_tool_calls tc
       JOIN sdd_interactions i ON i.id = tc.interaction_id
       LEFT JOIN otel_log_events e
         ON e.event_id = COALESCE(
              JSON_UNQUOTE(JSON_EXTRACT(tc.evidence_json, '$.toolResultEventId')),
              JSON_UNQUOTE(JSON_EXTRACT(tc.evidence_json, '$.toolDecisionEventId'))
            )
       WHERE tc.id > ?
       ORDER BY tc.id ASC
       LIMIT ?`,
      [lastId, PAGE_SIZE],
    );

    if (rows.length === 0) break;

    for (const row of rows) {
      lastId = row.tool_call_id;
      stats.toolCalls += 1;

      const fact: ToolCallFact = {
        toolUseId: row.tool_use_id,
        eventId: row.source_event_id,
        toolName: row.tool_name,
        mcpServer: row.mcp_server_scope,
        toolInput: extractToolInputFromAttributes(row.attributes_json),
        interactionId: row.interaction_id,
        toolCallId: row.tool_call_id,
        userId: row.user_id,
        sessionId: row.session_id,
        promptId: row.prompt_id,
        eventTime: row.event_time,
      };

      for (const ref of extractSourceReferences(fact)) {
        stats.extracted += 1;
        if (ref.evidenceJson.parseFailed === true) stats.parseFailed += 1;
        if (ref.locatorType === 'unknown') stats.unknown += 1;
        await upsertSourceReference(pool, ref);
      }
    }
  }

  const countAfter = await countRows(pool);
  stats.inserted = Math.max(0, countAfter - countBefore);
  stats.reused = Math.max(0, stats.extracted - stats.inserted);

  logger.info({ stats }, 'source-references: rebuild completed');
  return stats;
}

async function countRows(pool: Pool): Promise<number> {
  const [rows] = await pool.query<RowDataPacket[]>(
    'SELECT COUNT(*) AS n FROM source_references',
  );
  return Number(rows[0]?.n ?? 0);
}

function extractToolInputFromAttributes(attributes: unknown): unknown {
  if (!attributes || typeof attributes !== 'object') return null;
  const a = attributes as Record<string, unknown>;
  return a.tool_input ?? a.tool_parameters ?? a['tool.parameters'] ?? a.input ?? null;
}

async function upsertSourceReference(pool: Pool, ref: SourceReferenceInput): Promise<void> {
  await pool.query<ResultSetHeader>(
    `INSERT INTO source_references
       (reference_key, interaction_id, tool_call_id, event_id, user_id, session_id, prompt_id,
        action_type, locator_type, direction, raw_locator, normalized_locator, normalized_locator_hash,
        mcp_server, mcp_tool_name, doc_id, url, title, space_id, collection_id, doc_type,
        event_time, evidence_json, rule_version)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
     ON DUPLICATE KEY UPDATE
        interaction_id=VALUES(interaction_id), tool_call_id=VALUES(tool_call_id), event_id=VALUES(event_id),
        user_id=VALUES(user_id), session_id=VALUES(session_id), prompt_id=VALUES(prompt_id),
        action_type=VALUES(action_type), locator_type=VALUES(locator_type), direction=VALUES(direction),
        raw_locator=VALUES(raw_locator), normalized_locator=VALUES(normalized_locator),
        normalized_locator_hash=VALUES(normalized_locator_hash), mcp_server=VALUES(mcp_server),
        mcp_tool_name=VALUES(mcp_tool_name), doc_id=VALUES(doc_id), url=VALUES(url), title=VALUES(title),
        space_id=VALUES(space_id), collection_id=VALUES(collection_id), doc_type=VALUES(doc_type),
        event_time=VALUES(event_time), evidence_json=VALUES(evidence_json), rule_version=VALUES(rule_version)`,
    [
      ref.referenceKey,
      ref.interactionId,
      ref.toolCallId,
      ref.eventId,
      ref.userId,
      ref.sessionId,
      ref.promptId,
      ref.actionType,
      ref.locatorType,
      ref.direction,
      ref.rawLocator,
      ref.normalizedLocator,
      ref.normalizedLocatorHash,
      ref.mcpServer,
      ref.mcpToolName,
      ref.docId,
      ref.url,
      ref.title,
      ref.spaceId,
      ref.collectionId,
      ref.docType,
      ref.eventTime,
      JSON.stringify(ref.evidenceJson),
      ref.ruleVersion,
    ],
  );
}

async function main(): Promise<void> {
  const pool = createMysqlPool();
  const logger = createLogger('rebuild-source-references');
  try {
    const stats = await rebuildSourceReferences(pool, logger);
    console.info(JSON.stringify(stats));
  } finally {
    await pool.end();
  }
}

void main();
