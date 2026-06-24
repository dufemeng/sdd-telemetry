import type { Pool, ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import {
  decodeMaybeDoubleEncoded,
  extractSkillSourceReference,
  extractSourceReferences,
  type SourceReferenceInput,
  type ToolCallFact,
} from '../source-reference-extractor';

export const SOURCE_REFERENCE_PAGE_SIZE = 1000;
// 批量 INSERT 每条语句最多塞多少行（25 列/行，留足 max_allowed_packet 余量，evidence_json 可能较大）。
const SOURCE_REFERENCE_INSERT_CHUNK = 200;
// 增量按 usage_key IN (...) 取数时每条 SELECT 最多带多少个 key。
const SKILL_USAGE_KEY_CHUNK = 500;
// 增量按 tool_use_id IN (...) 取数时每条 SELECT 最多带多少个 id。
const TOOL_USE_ID_CHUNK = 500;

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

// source_batch_id 随 tool-call 行而变(rebuildAll 横跨所有批),故批量写入时按行携带,
// 不在 batchUpsert 里用单一 batchId。skill 引用统一 sourceBatchId=null。
interface SourceReferenceUpsertItem {
  ref: SourceReferenceInput;
  sourceBatchId: string | null;
}

export class SourceReferenceWriter {
  async rebuildAll(pool: Pool): Promise<SourceReferenceWriteStats> {
    const stats = emptyStats();
    let lastId = 0;
    for (;;) {
      const rows = await this.loadToolCallRows(pool, { lastId, limit: SOURCE_REFERENCE_PAGE_SIZE });
      if (rows.length === 0) break;

      const items: SourceReferenceUpsertItem[] = [];
      for (const row of rows) {
        lastId = row.tool_call_id;
        items.push(...this.collectToolCallRefs(row, stats));
      }
      stats.affectedRows += await this.batchUpsert(pool, items);
    }
    await this.rebuildSkillReferences(pool, stats);
    return stats;
  }

  /**
   * 全量把 sdd_skill_usages emit 成 locator_type='skill' 的 source_reference。
   * 仅 rebuildAll（reclean）和 updateForBatch 的回退路径（skillUsageKeys=null）用——
   * 全量重建幂等且完整。常规 per-batch 路径走 emitSkillReferencesForKeys 增量。
   * 粒度 = skill_usage（reference_key 绑 usage_key），upsert 幂等。
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
      const items: SourceReferenceUpsertItem[] = [];
      for (const row of rows) {
        lastId = row.id;
        const ref = skillRefFromRow(row);
        if (ref) items.push({ ref, sourceBatchId: null });
      }
      stats.skillUsages += items.length;
      stats.affectedRows += await this.batchUpsert(pool, items);
    }
  }

  /**
   * per-batch 增量:只 emit 本批 clean 实际写出的那批 skill_usage（用其 usage_key 精确取数）。
   * 增量键来自 cleanBatch 写库返回的 usage_key,而非按 source_batch_id 反推——
   * 后者会漏掉「skill_usage 在批 Y 创建、但其 interaction.source_batch_id=X(更早批)」的行。
   * 按 usage_key 取数与 batch 无关,天然绕开该缺口,且批量写入只一条 INSERT。
   */
  async emitSkillReferencesForKeys(
    pool: Pool,
    usageKeys: string[],
    stats: SourceReferenceWriteStats,
  ): Promise<void> {
    if (usageKeys.length === 0) return;
    const items: SourceReferenceUpsertItem[] = [];
    for (let i = 0; i < usageKeys.length; i += SKILL_USAGE_KEY_CHUNK) {
      const chunk = usageKeys.slice(i, i + SKILL_USAGE_KEY_CHUNK);
      const placeholders = chunk.map(() => '?').join(', ');
      const [rows] = await pool.query<SkillUsageRow[]>(
        `SELECT id, usage_key, raw_skill_name, interaction_id, user_id, session_id, prompt_id,
                invocation_trigger, skill_source, status, event_time
         FROM sdd_skill_usages
         WHERE usage_key IN (${placeholders})`,
        chunk,
      );
      for (const row of rows) {
        const ref = skillRefFromRow(row);
        if (ref) items.push({ ref, sourceBatchId: null });
      }
    }
    stats.skillUsages += items.length;
    stats.affectedRows += await this.batchUpsert(pool, items);
  }

  /**
   * @param skillUsageKeys 本批 clean 实际写出的 skill usage_key(增量);传 null 时回退全表重建。
   * @param toolUseIds 本批 clean 实际写出的 tool_use_id(增量,走唯一索引取数);传 null 时回退
   *   按 e.batch_id 全量分页扫。两者传 null 的场景:reclean、以及 clean 成功但维护失败的 skipped
   *   重试——此时拿不到本批写出的 key/id。
   */
  async updateForBatch(
    pool: Pool,
    batchId: string,
    skillUsageKeys: string[] | null,
    toolUseIds: string[] | null = null,
  ): Promise<SourceReferenceWriteStats> {
    const stats = emptyStats();

    if (toolUseIds == null) {
      // 回退:按 e.batch_id 全量分页扫(扫整张 tool_calls 表,慢但完整)。
      let lastId = 0;
      for (;;) {
        const rows = await this.loadToolCallRows(pool, { batchId, lastId, limit: SOURCE_REFERENCE_PAGE_SIZE });
        if (rows.length === 0) break;
        const items: SourceReferenceUpsertItem[] = [];
        for (const row of rows) {
          lastId = row.tool_call_id;
          items.push(...this.collectToolCallRefs(row, stats));
        }
        stats.affectedRows += await this.batchUpsert(pool, items);
      }
    } else {
      // 增量:按本批写出的 tool_use_id 走 uk_...tool_use_id 唯一索引取数,只命中本批那几行,
      // 不再 LEFT JOIN 后按 e.batch_id 过滤整表(那会 O(全表 tool_calls)/批)。
      for (let i = 0; i < toolUseIds.length; i += TOOL_USE_ID_CHUNK) {
        const rows = await this.loadToolCallRowsByToolUseIds(pool, toolUseIds.slice(i, i + TOOL_USE_ID_CHUNK));
        const items: SourceReferenceUpsertItem[] = [];
        for (const row of rows) items.push(...this.collectToolCallRefs(row, stats));
        stats.affectedRows += await this.batchUpsert(pool, items);
      }
    }

    if (skillUsageKeys === null) {
      await this.rebuildSkillReferences(pool, stats);
    } else {
      await this.emitSkillReferencesForKeys(pool, skillUsageKeys, stats);
    }
    return stats;
  }

  private async loadToolCallRowsByToolUseIds(pool: Pool, toolUseIds: string[]): Promise<ToolCallSourceRow[]> {
    if (toolUseIds.length === 0) return [];
    const placeholders = toolUseIds.map(() => '?').join(', ');
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
       WHERE tc.tool_use_id IN (${placeholders})
       ORDER BY tc.id ASC`,
      toolUseIds,
    );
    return rows;
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

  /** 抽出一条 tool-call 行的 source reference(纯收集 + 累计 stats,不落库),交由调用方批量写入。 */
  private collectToolCallRefs(
    row: ToolCallSourceRow,
    stats: SourceReferenceWriteStats,
  ): SourceReferenceUpsertItem[] {
    stats.toolCalls += 1;

    // Claude Code 把 MCP tool_name 匿名成 "mcp_tool"，真服务器名/工具名在 tool_result.tool_parameters；
    // mcp_server_scope 是作用域(user/project/local)不是服务器名，不能直接喂给 rule.mcpServers 匹配。
    const mcpMeta = extractMcpToolMeta(row.attributes_json);
    const fact: ToolCallFact = {
      toolUseId: row.tool_use_id,
      eventId: row.source_event_id,
      toolName: row.tool_name,
      mcpServer: mcpMeta.mcpServerName ?? row.mcp_server_scope,
      mcpToolName: mcpMeta.mcpToolName,
      toolInput: extractToolInputFromAttributes(row.attributes_json),
      interactionId: row.interaction_id,
      toolCallId: row.tool_call_id,
      userId: row.user_id,
      sessionId: row.session_id,
      promptId: row.prompt_id,
      eventTime: row.event_time,
    };

    const items: SourceReferenceUpsertItem[] = [];
    for (const ref of extractSourceReferences(fact)) {
      stats.extracted += 1;
      if (ref.evidenceJson.parseFailed === true) stats.parseFailed += 1;
      if (ref.locatorType === 'unknown') stats.unknown += 1;
      items.push({ ref, sourceBatchId: row.source_batch_id });
    }
    return items;
  }

  /** 多行合并成单条 INSERT（按 chunk 分批），把 N 次往返/fsync 压成 ceil(N/chunk) 次。 */
  async batchUpsert(pool: Pool, items: SourceReferenceUpsertItem[]): Promise<number> {
    let affected = 0;
    for (let i = 0; i < items.length; i += SOURCE_REFERENCE_INSERT_CHUNK) {
      const chunk = items.slice(i, i + SOURCE_REFERENCE_INSERT_CHUNK);
      const values = chunk.map(() => SOURCE_REFERENCE_ROW_PLACEHOLDERS).join(', ');
      const params = chunk.flatMap(({ ref, sourceBatchId }) => sourceReferenceParams(ref, sourceBatchId));
      const [result] = await pool.query<ResultSetHeader>(
        `${SOURCE_REFERENCE_INSERT_PREFIX}
         VALUES ${values}
         ${SOURCE_REFERENCE_ON_DUPLICATE}`,
        params,
      );
      affected += result.affectedRows;
    }
    return affected;
  }
}

const SOURCE_REFERENCE_INSERT_COLUMN_LIST = [
  'reference_key', 'interaction_id', 'tool_call_id', 'event_id', 'source_batch_id', 'user_id', 'session_id', 'prompt_id',
  'action_type', 'locator_type', 'direction', 'raw_locator', 'normalized_locator', 'normalized_locator_hash',
  'mcp_server', 'mcp_tool_name', 'doc_id', 'url', 'title', 'space_id', 'collection_id', 'doc_type',
  'event_time', 'evidence_json', 'rule_version',
] as const;

// source_batch_id 用 COALESCE 保护已有值不被 NULL 覆盖；其余列以新值为准（与原单行 upsert 语义一致）。
const SOURCE_REFERENCE_INSERT_PREFIX =
  `INSERT INTO source_references (${SOURCE_REFERENCE_INSERT_COLUMN_LIST.join(', ')})`;
const SOURCE_REFERENCE_ROW_PLACEHOLDERS =
  `(${SOURCE_REFERENCE_INSERT_COLUMN_LIST.map(() => '?').join(',')})`;
const SOURCE_REFERENCE_ON_DUPLICATE =
  `ON DUPLICATE KEY UPDATE ${SOURCE_REFERENCE_INSERT_COLUMN_LIST
    .filter((column) => column !== 'reference_key' && column !== 'source_batch_id')
    .map((column) => `${column}=VALUES(${column})`)
    .concat('source_batch_id=COALESCE(VALUES(source_batch_id), source_batch_id)')
    .join(', ')}`;

function sourceReferenceParams(ref: SourceReferenceInput, sourceBatchId: string | null): unknown[] {
  return [
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
  ];
}

function skillRefFromRow(row: SkillUsageRow): SourceReferenceInput | null {
  return extractSkillSourceReference({
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

export interface McpToolMeta {
  mcpServerName: string | null;
  mcpToolName: string | null;
}

/**
 * 从 tool_result 事件的 tool_parameters 解出 MCP 真服务器名 / 真工具名。
 * tool_parameters 形如 {"mcp_server_name":"skylarkmcpserver","mcp_tool_name":"skylark_doc_update"}，
 * 且常是 double-encoded JSON 字符串，复用 extractor 的受控解码。非 MCP 调用返回全 null。
 */
export function extractMcpToolMeta(attributes: unknown): McpToolMeta {
  const empty: McpToolMeta = { mcpServerName: null, mcpToolName: null };
  if (!attributes || typeof attributes !== 'object') return empty;
  const a = attributes as Record<string, unknown>;
  const raw = a.tool_parameters ?? a['tool.parameters'];
  if (raw == null) return empty;
  const decoded = decodeMaybeDoubleEncoded(raw);
  if (decoded.parseFailed || !decoded.value || typeof decoded.value !== 'object') return empty;
  const obj = decoded.value as Record<string, unknown>;
  const str = (v: unknown): string | null =>
    typeof v === 'string' && v.trim() !== '' ? v : null;
  return { mcpServerName: str(obj.mcp_server_name), mcpToolName: str(obj.mcp_tool_name) };
}
