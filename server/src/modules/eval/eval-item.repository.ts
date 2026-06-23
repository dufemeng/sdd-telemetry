import { Inject, Provide } from '@midwayjs/core';
import type { EntityManager } from 'typeorm';
import { MysqlDataSourceManager } from '../../infrastructure/mysql/data-source-manager';

export interface EvalItemRow {
  id: string;
  itemKey: string;
  profileId: string;
  source: 'cleaned' | 'manual';
  promptText: string | null;
  targetSkill: string | null;
  targetArtifactType: string | null;
  originInteractionId: string | null;
  originPromptId: string | null;
  originProjectionRunId: string | null;
  originCapabilityCode: string | null;
  originRawCapabilityName: string | null;
  occurrenceCount: number;
  firstObservedAt: string | null;
  lastObservedAt: string | null;
  lastImportedAt: string | null;
  enabled: boolean;
  title: string | null;
  notes: string | null;
  deletedAt: string | null;
}

interface ListFilter {
  profileId: string;
  source?: 'cleaned' | 'manual';
  capabilityCode?: string;
  targetSkill?: string;
  enabled?: boolean;
  keyword?: string;
  page: number;
  pageSize: number;
}

export interface ImportCandidate {
  itemKey: string;
  profileId: string;
  promptText: string;
  targetSkill: string | null;
  targetArtifactType: string | null;
  originInteractionId: string | null;
  originPromptId: string | null;
  originProjectionRunId: string;
  originCapabilityCode: string;
  originRawCapabilityName: string | null;
  occurrenceCount: number;
  firstObservedAt: string | null;
  lastObservedAt: string | null;
}

export interface CapabilityTextRow {
  cuId: string;
  interactionId: string | null;
  promptId: string | null;
  capabilityCode: string;
  rawCapabilityName: string | null;
  eventTime: string | null;
  promptText: string | null;
}

/**
 * eval_items 仓储 (裸 SQL)。与 profile-config-admin 兄弟模块对齐, 不引入 TypeORM entity:
 * import-from-logs 跨表 join 注定手写 SQL, 两套范式混用最糟。
 * 未来 Slice 2/3 若 run->items 一对多查询变复杂, 可局部引入 entity (局部重构)。
 */
@Provide('evalItemRepository')
export class EvalItemRepository {
  @Inject('mysqlDataSourceManager')
  mysqlDataSourceManager!: MysqlDataSourceManager;

  async getCurrentProjectionRunId(profileId: string): Promise<string | null> {
    const dataSource = await this.mysqlDataSourceManager.getDataSource();
    const rows = (await dataSource.query(
      `SELECT current_projection_run_id AS runId
       FROM profile_current_projection_runs
       WHERE profile_id = ? LIMIT 1`,
      [profileId],
    )) as Array<{ runId: string | null }>;
    return rows[0]?.runId ?? null;
  }

  /** 按 capability usage id 单调游标分批读取候选 (LEFT JOIN 保留无正文记录)。 */
  async readCapabilityTextRows(input: {
    profileId: string;
    projectionRunId: string;
    capabilityCode?: string;
    from?: string;
    to?: string;
    afterCuId?: string;
    batchSize: number;
  }): Promise<CapabilityTextRow[]> {
    const dataSource = await this.mysqlDataSourceManager.getDataSource();
    const params: unknown[] = [input.profileId, input.projectionRunId];
    let where = 'WHERE cu.profile_id = ? AND cu.projection_run_id = ?';
    if (input.afterCuId) {
      where += ' AND cu.id > ?';
      params.push(input.afterCuId);
    }
    if (input.capabilityCode) {
      where += ' AND cu.capability_code = ?';
      params.push(input.capabilityCode);
    }
    if (input.from) {
      where += ' AND (cu.event_time IS NULL OR cu.event_time >= ?)';
      params.push(input.from);
    }
    if (input.to) {
      where += ' AND (cu.event_time IS NULL OR cu.event_time <= ?)';
      params.push(input.to);
    }
    params.push(input.batchSize);
    return (await dataSource.query(
      `SELECT CAST(cu.id AS CHAR) AS cuId, CAST(cu.interaction_id AS CHAR) AS interactionId,
              cu.prompt_id AS promptId, cu.capability_code AS capabilityCode,
              cu.raw_capability_name AS rawCapabilityName,
              cu.event_time AS eventTime,
              t.prompt_text AS promptText
       FROM profile_capability_usages cu
       LEFT JOIN sdd_interaction_texts t ON t.interaction_id = cu.interaction_id
       ${where}
       ORDER BY cu.id ASC
       LIMIT ?`,
      params,
    )) as CapabilityTextRow[];
  }

  async listItems(filter: ListFilter): Promise<{ items: EvalItemRow[]; total: number }> {
    const dataSource = await this.mysqlDataSourceManager.getDataSource();
    const where: string[] = ['profile_id = ?', 'deleted_at IS NULL'];
    const params: unknown[] = [filter.profileId];
    if (filter.source) { where.push('source = ?'); params.push(filter.source); }
    if (filter.capabilityCode) { where.push('origin_capability_code = ?'); params.push(filter.capabilityCode); }
    if (filter.targetSkill) { where.push('target_skill = ?'); params.push(filter.targetSkill); }
    if (filter.enabled !== undefined) { where.push('enabled = ?'); params.push(filter.enabled ? 1 : 0); }
    if (filter.keyword) {
      where.push('(title LIKE ? OR notes LIKE ? OR target_skill LIKE ?)');
      const kw = `%${filter.keyword}%`;
      params.push(kw, kw, kw);
    }
    const whereSql = where.join(' AND ');
    const totalRows = (await dataSource.query(
      `SELECT COUNT(*) AS cnt FROM eval_items WHERE ${whereSql}`,
      params,
    )) as Array<{ cnt: number | string }>;
    const total = Number(totalRows[0]?.cnt ?? 0);
    const offset = (filter.page - 1) * filter.pageSize;
    params.push(filter.pageSize, offset);
    const rows = (await dataSource.query(
      `SELECT ${itemColumns()} FROM eval_items WHERE ${whereSql}
       ORDER BY gmt_modified DESC, id DESC LIMIT ? OFFSET ?`,
      params,
    )) as EvalItemDbRow[];
    return { items: rows.map(toItemRow), total };
  }

  async listSummary(profileId: string): Promise<{ total: number; enabled: number; cleaned: number; manual: number }> {
    const dataSource = await this.mysqlDataSourceManager.getDataSource();
    const rows = (await dataSource.query(
      `SELECT
         COUNT(*) AS total,
         SUM(enabled = 1) AS enabled,
         SUM(source = 'cleaned') AS cleaned,
         SUM(source = 'manual') AS manual
       FROM eval_items
       WHERE profile_id = ? AND deleted_at IS NULL`,
      [profileId],
    )) as Array<{ total: number | string; enabled: number | string | null; cleaned: number | string | null; manual: number | string | null }>;
    const r = rows[0];
    return {
      total: Number(r?.total ?? 0),
      enabled: Number(r?.enabled ?? 0),
      cleaned: Number(r?.cleaned ?? 0),
      manual: Number(r?.manual ?? 0),
    };
  }

  async getItem(id: string, profileId: string): Promise<EvalItemRow | null> {
    const dataSource = await this.mysqlDataSourceManager.getDataSource();
    const rows = (await dataSource.query(
      `SELECT ${itemColumns()} FROM eval_items
       WHERE id = ? AND profile_id = ? AND deleted_at IS NULL LIMIT 1`,
      [id, profileId],
    )) as EvalItemDbRow[];
    return rows[0] ? toItemRow(rows[0]) : null;
  }

  async getItemByKey(itemKey: string): Promise<EvalItemRow | null> {
    const dataSource = await this.mysqlDataSourceManager.getDataSource();
    const rows = (await dataSource.query(
      `SELECT ${itemColumns()} FROM eval_items WHERE item_key = ? LIMIT 1`,
      [itemKey],
    )) as EvalItemDbRow[];
    return rows[0] ? toItemRow(rows[0]) : null;
  }

  /**
   * 导入事务: 按 item_key upsert。
   * - 命中 deleted tombstone => 跳过 (skippedDeleted), 不复活。
   * - 命中未删除行 => 刷新 cleaned 来源统计 + 用规范等价最新原文替换 prompt,
   *   不覆盖 title/notes/enabled; manual->cleaned 计 upgraded。
   * - 未命中 => insert (source=cleaned)。
   */
  async upsertCleanedCandidatesInTransaction(
    manager: EntityManager,
    candidates: ImportCandidate[],
    nowIso: string,
  ): Promise<{ inserted: number; refreshed: number; upgraded: number; skippedDeleted: number }> {
    let inserted = 0;
    let refreshed = 0;
    let upgraded = 0;
    let skippedDeleted = 0;
    for (const c of candidates) {
      const existing = (await manager.query(
        `SELECT id, source, deleted_at FROM eval_items WHERE item_key = ? LIMIT 1`,
        [c.itemKey],
      )) as Array<{ id: string | number; source: string; deleted_at: string | null }>;
      if (existing[0]?.deleted_at) {
        skippedDeleted += 1;
        continue;
      }
      if (existing[0]) {
        const isUpgrade = existing[0].source !== 'cleaned';
        await manager.query(
          `UPDATE eval_items
             SET source = 'cleaned',
                 prompt_text = ?,
                 origin_interaction_id = ?,
                 origin_prompt_id = ?,
                 origin_projection_run_id = ?,
                 origin_capability_code = ?,
                 origin_raw_capability_name = ?,
                 occurrence_count = ?,
                 first_observed_at = ?,
                 last_observed_at = ?,
                 last_imported_at = ?,
                 gmt_modified = CURRENT_TIMESTAMP(3)
           WHERE id = ?`,
          [
            c.promptText,
            c.originInteractionId,
            c.originPromptId,
            c.originProjectionRunId,
            c.originCapabilityCode,
            c.originRawCapabilityName,
            c.occurrenceCount,
            c.firstObservedAt,
            c.lastObservedAt,
            nowIso,
            existing[0].id,
          ],
        );
        if (isUpgrade) upgraded += 1; else refreshed += 1;
        continue;
      }
      await manager.query(
        `INSERT INTO eval_items
           (item_key, profile_id, source, origin_interaction_id, origin_prompt_id,
            origin_projection_run_id, origin_capability_code, origin_raw_capability_name,
            target_skill, target_artifact_type, prompt_text, enabled, occurrence_count,
            first_observed_at, last_observed_at, last_imported_at,
            gmt_create, gmt_modified)
         VALUES (?, ?, 'cleaned', ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3))`,
        [
          c.itemKey,
          c.profileId,
          c.originInteractionId,
          c.originPromptId,
          c.originProjectionRunId,
          c.originCapabilityCode,
          c.originRawCapabilityName,
          c.targetSkill,
          c.targetArtifactType,
          c.promptText,
          c.occurrenceCount,
          c.firstObservedAt,
          c.lastObservedAt,
          nowIso,
        ],
      );
      inserted += 1;
    }
    return { inserted, refreshed, upgraded, skippedDeleted };
  }

  async insertManualInTransaction(
    manager: EntityManager,
    input: {
      itemKey: string;
      profileId: string;
      promptText: string;
      targetSkill: string;
      targetArtifactType: string;
      title?: string;
      notes?: string;
    },
  ): Promise<{ status: 'created'; id: string } | { status: 'tombstone' } | { status: 'exists'; existingId: string }> {
    const existing = (await manager.query(
      `SELECT id, deleted_at FROM eval_items WHERE item_key = ? LIMIT 1`,
      [input.itemKey],
    )) as Array<{ id: string | number; deleted_at: string | null }>;
    if (existing[0]?.deleted_at) return { status: 'tombstone' };
    if (existing[0]) return { status: 'exists', existingId: String(existing[0].id) };
    const result = (await manager.query(
      `INSERT INTO eval_items
         (item_key, profile_id, source, target_skill, target_artifact_type, prompt_text,
          title, notes, enabled, occurrence_count,
          gmt_create, gmt_modified)
       VALUES (?, ?, 'manual', ?, ?, ?, ?, ?, 1, 0, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3))`,
      [
        input.itemKey,
        input.profileId,
        input.targetSkill,
        input.targetArtifactType,
        input.promptText,
        input.title ?? null,
        input.notes ?? null,
      ],
    )) as { insertId?: string | number };
    return { status: 'created', id: String(result.insertId) };
  }

  async updateItemInTransaction(
    manager: EntityManager,
    input: {
      id: string;
      profileId: string;
      source: 'cleaned' | 'manual';
      promptText?: string;
      targetSkill?: string;
      targetArtifactType?: string;
      title?: string | null;
      notes?: string | null;
      enabled?: boolean;
      itemKey?: string;
    },
  ): Promise<{ status: 'updated' } | { status: 'missing' } | { status: 'conflict' }> {
    const sets: string[] = [];
    const params: unknown[] = [];
    if (input.title !== undefined) { sets.push('title = ?'); params.push(input.title); }
    if (input.notes !== undefined) { sets.push('notes = ?'); params.push(input.notes); }
    if (input.enabled !== undefined) { sets.push('enabled = ?'); params.push(input.enabled ? 1 : 0); }
    if (input.source === 'manual') {
      if (input.promptText !== undefined) { sets.push('prompt_text = ?'); params.push(input.promptText); }
      if (input.targetSkill !== undefined) { sets.push('target_skill = ?'); params.push(input.targetSkill); }
      if (input.targetArtifactType !== undefined) { sets.push('target_artifact_type = ?'); params.push(input.targetArtifactType); }
      if (input.itemKey !== undefined) { sets.push('item_key = ?'); params.push(input.itemKey); }
    }
    if (sets.length === 0) {
      const rows = (await manager.query(
        `SELECT 1 FROM eval_items WHERE id = ? AND profile_id = ? AND deleted_at IS NULL LIMIT 1`,
        [input.id, input.profileId],
      )) as unknown[];
      return rows.length ? { status: 'updated' } : { status: 'missing' };
    }
    sets.push('gmt_modified = CURRENT_TIMESTAMP(3)');
    params.push(input.id, input.profileId);
    try {
      const result = (await manager.query(
        `UPDATE eval_items SET ${sets.join(', ')}
         WHERE id = ? AND profile_id = ? AND deleted_at IS NULL`,
        params,
      )) as { affectedRows?: number };
      if ((result.affectedRows ?? 0) === 0) {
        return { status: 'missing' };
      }
      return { status: 'updated' };
    } catch (error) {
      if (isDuplicateKey(error)) return { status: 'conflict' };
      throw error;
    }
  }

  async deleteItemInTransaction(
    manager: EntityManager,
    input: { id: string; profileId: string; userId: string },
  ): Promise<{ status: 'deleted' } | { status: 'missing' }> {
    const result = (await manager.query(
      `UPDATE eval_items
         SET prompt_text = NULL, title = NULL, notes = NULL,
             origin_interaction_id = NULL, origin_prompt_id = NULL,
             origin_projection_run_id = NULL, origin_capability_code = NULL,
             origin_raw_capability_name = NULL,
             enabled = 0, deleted_at = CURRENT_TIMESTAMP(3), deleted_by_user_id = ?,
             gmt_modified = CURRENT_TIMESTAMP(3)
       WHERE id = ? AND profile_id = ? AND deleted_at IS NULL`,
      [input.userId, input.id, input.profileId],
    )) as { affectedRows?: number };
    return (result.affectedRows ?? 0) > 0 ? { status: 'deleted' } : { status: 'missing' };
  }

  async runInTransaction<T>(work: (manager: EntityManager) => Promise<T>): Promise<T> {
    const dataSource = await this.mysqlDataSourceManager.getDataSource();
    return dataSource.transaction(work);
  }
}

interface EvalItemDbRow {
  id: number | string;
  item_key: string;
  profile_id: string;
  source: string;
  prompt_text: string | null;
  target_skill: string | null;
  target_artifact_type: string | null;
  origin_interaction_id: number | string | null;
  origin_prompt_id: string | null;
  origin_projection_run_id: number | string | null;
  origin_capability_code: string | null;
  origin_raw_capability_name: string | null;
  occurrence_count: number | string;
  first_observed_at: Date | string | null;
  last_observed_at: Date | string | null;
  last_imported_at: Date | string | null;
  enabled: number | boolean;
  title: string | null;
  notes: string | null;
  deleted_at: Date | string | null;
}

function itemColumns(): string {
  return `CAST(id AS CHAR) AS id, item_key, profile_id, source, prompt_text,
          target_skill, target_artifact_type,
          CAST(origin_interaction_id AS CHAR) AS origin_interaction_id,
          origin_prompt_id, CAST(origin_projection_run_id AS CHAR) AS origin_projection_run_id,
          origin_capability_code, origin_raw_capability_name, occurrence_count,
          first_observed_at, last_observed_at, last_imported_at,
          enabled, title, notes, deleted_at`;
}

function toItemRow(row: EvalItemDbRow): EvalItemRow {
  return {
    id: String(row.id),
    itemKey: row.item_key,
    profileId: row.profile_id,
    source: row.source as 'cleaned' | 'manual',
    promptText: row.prompt_text,
    targetSkill: row.target_skill,
    targetArtifactType: row.target_artifact_type,
    originInteractionId: row.origin_interaction_id == null ? null : String(row.origin_interaction_id),
    originPromptId: row.origin_prompt_id,
    originProjectionRunId: row.origin_projection_run_id == null ? null : String(row.origin_projection_run_id),
    originCapabilityCode: row.origin_capability_code,
    originRawCapabilityName: row.origin_raw_capability_name,
    occurrenceCount: Number(row.occurrence_count),
    firstObservedAt: toIso(row.first_observed_at),
    lastObservedAt: toIso(row.last_observed_at),
    lastImportedAt: toIso(row.last_imported_at),
    enabled: Boolean(row.enabled),
    title: row.title,
    notes: row.notes,
    deletedAt: toIso(row.deleted_at),
  };
}

function toIso(value: Date | string | null): string | null {
  if (value == null) return null;
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

export function isDuplicateKey(error: unknown): boolean {
  const code = (error as { code?: string }).code;
  return code === 'ER_DUP_ENTRY';
}
