import type { Pool, ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import {
  extractSkillSourceReference,
  extractSourceReferences,
  type SourceReferenceInput,
  type ToolCallFact,
} from '../source-reference-extractor';

export const SOURCE_REFERENCE_PAGE_SIZE = 1000;

export interface ToolCallSourceRow extends RowDataPacket {
  source_batch_id: string | null;
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

export interface SourceReferenceWriteStats {
  toolCalls: number;
  extracted: number;
  parseFailed: number;
  unknown: number;
  skillUsages: number;
  affectedRows: number;
}

interface SkillUsageRow extends RowDataPacket {
  id: number;
  usage_key: string;
  raw_skill_name: string;
  interaction_id: number | null;
  user_id: number | null;
  session_id: string | null;
  prompt_id: string | null;
  invocation_trigger: string | null;
  skill_source: string | null;
  status: string | null;
  event_time: Date | null;
}

export class SourceReferenceWriter {
  async rebuildAll(pool: Pool): Promise<SourceReferenceWriteStats> {
    const stats = emptyStats();
    let lastId = 0;
    for (;;) {
      const rows = await this.loadToolCallRows(pool, { lastId, limit: SOURCE_REFERENCE_PAGE_SIZE });
      if (rows.length === 0) break;

      for (const row of rows) {
        lastId = row.tool_call_id;
        await this.extractAndUpsert(pool, row, stats);
      }
    }
    await this.rebuildSkillReferences(pool, stats);
    return stats;
  }

  /**
   * 全量把 sdd_skill_usages emit 成 locator_type='skill' 的 source_reference（rebuildAll + updateForBatch 都用)。
   * 粒度 = skill_usage（reference_key 绑 usage_key），upsert 幂等。
   *
   * 为何不做 per-batch 增量:skill_usage 可能在批 Y 清洗时创建,但其 interaction.source_batch_id=X(更早的批),
   * updateForBatch(X) 时它还不存在、updateForBatch(Y) 又不在 X 作用域 → 漏掉(reclean 实测 48~69/81,随批序非确定)。
   * 全量重建幂等且完整;skill 量小开销可接受(大规模可再优化成每 worker pass 一次)。
   */
  private async rebuildSkillReferences(pool: Pool, stats: SourceReferenceWriteStats): Promise<void> {
    let lastId = 0;
    for (;;) {
      const [rows] = await pool.query<SkillUsageRow[]>(
        `SELECT id, usage_key, raw_skill_name, interaction_id, user_id, session_id, prompt_id,
                invocation_trigger, skill_source, status, event_time
         FROM sdd_skill_usages
         WHERE id > ?
         ORDER BY id ASC
         LIMIT ?`,
        [lastId, SOURCE_REFERENCE_PAGE_SIZE],
      );
      if (rows.length === 0) break;
      for (const row of rows) {
        lastId = row.id;
        await this.emitSkillRow(pool, row, stats);
      }
    }
  }

  private async emitSkillRow(pool: Pool, row: SkillUsageRow, stats: SourceReferenceWriteStats): Promise<void> {
    const ref = extractSkillSourceReference({
      usageKey: row.usage_key,
      skillName: row.raw_skill_name,
      interactionId: row.interaction_id,
      userId: row.user_id,
      sessionId: row.session_id,
      promptId: row.prompt_id,
      invocationTrigger: row.invocation_trigger,
      skillSource: row.skill_source,
      status: row.status,
      eventTime: row.event_time,
    });
    if (!ref) return;
    stats.skillUsages += 1;
    stats.affectedRows += await this.upsert(pool, ref, null);
  }

  async updateForBatch(pool: Pool, batchId: string): Promise<SourceReferenceWriteStats> {
    const stats = emptyStats();
    let lastId = 0;
    for (;;) {
      const rows = await this.loadToolCallRows(pool, {
        batchId,
        lastId,
        limit: SOURCE_REFERENCE_PAGE_SIZE,
      });
      if (rows.length === 0) break;

      for (const row of rows) {
        lastId = row.tool_call_id;
        await this.extractAndUpsert(pool, row, stats);
      }
    }
    await this.rebuildSkillReferences(pool, stats);
    return stats;
  }

  private async loadToolCallRows(
    pool: Pool,
    input: { batchId?: string; lastId: number; limit: number },
  ): Promise<ToolCallSourceRow[]> {
    const batchClause = input.batchId ? 'AND e.batch_id = ?' : '';
    const params: unknown[] = input.batchId
      ? [input.lastId, input.batchId, input.limit]
      : [input.lastId, input.limit];

    const [rows] = await pool.query<ToolCallSourceRow[]>(
      `SELECT e.batch_id AS source_batch_id, tc.id AS tool_call_id, tc.tool_use_id, tc.tool_name, tc.mcp_server_scope,
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
       ${batchClause}
       ORDER BY tc.id ASC
       LIMIT ?`,
      params,
    );
    return rows;
  }

  private async extractAndUpsert(
    pool: Pool,
    row: ToolCallSourceRow,
    stats: SourceReferenceWriteStats,
  ): Promise<void> {
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
      stats.affectedRows += await this.upsert(pool, ref, row.source_batch_id);
    }
  }

  async upsert(pool: Pool, ref: SourceReferenceInput, sourceBatchId: string | null): Promise<number> {
    const [result] = await pool.query<ResultSetHeader>(
      `INSERT INTO source_references
         (reference_key, interaction_id, tool_call_id, event_id, source_batch_id, user_id, session_id, prompt_id,
          action_type, locator_type, direction, raw_locator, normalized_locator, normalized_locator_hash,
          mcp_server, mcp_tool_name, doc_id, url, title, space_id, collection_id, doc_type,
          event_time, evidence_json, rule_version)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
       ON DUPLICATE KEY UPDATE
          interaction_id=VALUES(interaction_id), tool_call_id=VALUES(tool_call_id), event_id=VALUES(event_id),
          source_batch_id=COALESCE(VALUES(source_batch_id), source_batch_id),
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
        sourceBatchId,
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
    return result.affectedRows;
  }
}

function emptyStats(): SourceReferenceWriteStats {
  return {
    toolCalls: 0,
    extracted: 0,
    parseFailed: 0,
    unknown: 0,
    skillUsages: 0,
    affectedRows: 0,
  };
}

function extractToolInputFromAttributes(attributes: unknown): unknown {
  if (!attributes || typeof attributes !== 'object') return null;
  const a = attributes as Record<string, unknown>;
  return a.tool_input ?? a.tool_parameters ?? a['tool.parameters'] ?? a.input ?? null;
}
