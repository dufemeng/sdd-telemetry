import { Inject, Provide } from '@midwayjs/core';
import type { EntityManager } from 'typeorm';
import { MysqlDataSourceManager } from '../../infrastructure/mysql/data-source-manager';

export interface RubricVersionRow {
  id: string;
  profileId: string;
  artifactType: string;
  versionNo: number;
  versionStatus: 'draft' | 'published';
  rubricJson: unknown;
  definitionHash: string;
  publishedAt: string | null;
  gmtModified: string | null;
}

export interface RubricVersionSummaryRow {
  id: string;
  versionNo: number;
  versionStatus: 'draft' | 'published';
  definitionHash: string;
  publishedAt: string | null;
  gmtModified: string | null;
}

/**
 * eval_rubric_versions 仓储 (裸 SQL,与 eval-item 兄弟模块对齐)。
 * 版本模型: 每个 (profile, artifactType) 至多 1 个 draft + 0..N 个 published(不可变);
 * 活动版本 = published 里 version_no 最大的那个。
 */
@Provide('evalRubricRepository')
export class EvalRubricRepository {
  @Inject('mysqlDataSourceManager')
  mysqlDataSourceManager!: MysqlDataSourceManager;

  async getActiveVersion(profileId: string, artifactType: string): Promise<RubricVersionRow | null> {
    const dataSource = await this.mysqlDataSourceManager.getDataSource();
    const rows = (await dataSource.query(
      `SELECT ${cols()} FROM eval_rubric_versions
       WHERE profile_id = ? AND artifact_type = ? AND version_status = 'published'
       ORDER BY version_no DESC LIMIT 1`,
      [profileId, artifactType],
    )) as RubricDbRow[];
    return rows[0] ? toRow(rows[0]) : null;
  }

  async getDraftVersion(profileId: string, artifactType: string): Promise<RubricVersionRow | null> {
    const dataSource = await this.mysqlDataSourceManager.getDataSource();
    const rows = (await dataSource.query(
      `SELECT ${cols()} FROM eval_rubric_versions
       WHERE profile_id = ? AND artifact_type = ? AND version_status = 'draft'
       ORDER BY version_no DESC LIMIT 1`,
      [profileId, artifactType],
    )) as RubricDbRow[];
    return rows[0] ? toRow(rows[0]) : null;
  }

  async getVersionById(id: string, profileId: string): Promise<RubricVersionRow | null> {
    const dataSource = await this.mysqlDataSourceManager.getDataSource();
    const rows = (await dataSource.query(
      `SELECT ${cols()} FROM eval_rubric_versions WHERE id = ? AND profile_id = ? LIMIT 1`,
      [id, profileId],
    )) as RubricDbRow[];
    return rows[0] ? toRow(rows[0]) : null;
  }

  async listVersions(profileId: string, artifactType: string): Promise<RubricVersionSummaryRow[]> {
    const dataSource = await this.mysqlDataSourceManager.getDataSource();
    const rows = (await dataSource.query(
      `SELECT CAST(id AS CHAR) AS id, version_no, version_status, definition_hash, published_at, gmt_modified
       FROM eval_rubric_versions
       WHERE profile_id = ? AND artifact_type = ?
       ORDER BY version_no DESC`,
      [profileId, artifactType],
    )) as Array<{
      id: string;
      version_no: number | string;
      version_status: string;
      definition_hash: string;
      published_at: Date | string | null;
      gmt_modified: Date | string | null;
    }>;
    return rows.map((r) => ({
      id: String(r.id),
      versionNo: Number(r.version_no),
      versionStatus: r.version_status as 'draft' | 'published',
      definitionHash: r.definition_hash,
      publishedAt: toIso(r.published_at),
      gmtModified: toIso(r.gmt_modified),
    }));
  }

  /** upsert 当前 draft: 已有 draft 则覆盖,否则新建 version_no = max+1。 */
  async saveDraftInTransaction(
    manager: EntityManager,
    input: {
      profileId: string;
      artifactType: string;
      rubricJson: string;
      definitionHash: string;
      createdBy: string | null;
    },
  ): Promise<{ id: string; versionNo: number }> {
    const existing = (await manager.query(
      `SELECT id, version_no FROM eval_rubric_versions
       WHERE profile_id = ? AND artifact_type = ? AND version_status = 'draft'
       LIMIT 1 FOR UPDATE`,
      [input.profileId, input.artifactType],
    )) as Array<{ id: string | number; version_no: number | string }>;

    if (existing[0]) {
      await manager.query(
        `UPDATE eval_rubric_versions
           SET rubric_json = CAST(? AS JSON), definition_hash = ?, created_by = ?, gmt_modified = CURRENT_TIMESTAMP(3)
         WHERE id = ?`,
        [input.rubricJson, input.definitionHash, input.createdBy, existing[0].id],
      );
      return { id: String(existing[0].id), versionNo: Number(existing[0].version_no) };
    }

    const maxRows = (await manager.query(
      `SELECT COALESCE(MAX(version_no), 0) + 1 AS nextNo
       FROM eval_rubric_versions WHERE profile_id = ? AND artifact_type = ?`,
      [input.profileId, input.artifactType],
    )) as Array<{ nextNo: number | string }>;
    const versionNo = Number(maxRows[0]?.nextNo ?? 1);

    const result = (await manager.query(
      `INSERT INTO eval_rubric_versions
         (profile_id, artifact_type, version_no, version_status, rubric_json, definition_hash, created_by, gmt_create, gmt_modified)
       VALUES (?, ?, ?, 'draft', CAST(? AS JSON), ?, ?, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3))`,
      [input.profileId, input.artifactType, versionNo, input.rubricJson, input.definitionHash, input.createdBy],
    )) as { insertId?: string | number };
    return { id: String(result.insertId), versionNo };
  }

  /** 把指定 draft 发布为 published(不可变)。 */
  async publishInTransaction(
    manager: EntityManager,
    input: { id: string; profileId: string },
  ): Promise<{ status: 'published'; versionNo: number } | { status: 'missing' } | { status: 'not_draft' }> {
    const rows = (await manager.query(
      `SELECT version_no, version_status FROM eval_rubric_versions
       WHERE id = ? AND profile_id = ? LIMIT 1 FOR UPDATE`,
      [input.id, input.profileId],
    )) as Array<{ version_no: number | string; version_status: string }>;
    const row = rows[0];
    if (!row) return { status: 'missing' };
    if (row.version_status !== 'draft') return { status: 'not_draft' };
    await manager.query(
      `UPDATE eval_rubric_versions
         SET version_status = 'published', published_at = CURRENT_TIMESTAMP(3), gmt_modified = CURRENT_TIMESTAMP(3)
       WHERE id = ?`,
      [input.id],
    );
    return { status: 'published', versionNo: Number(row.version_no) };
  }

  async runInTransaction<T>(work: (manager: EntityManager) => Promise<T>): Promise<T> {
    const dataSource = await this.mysqlDataSourceManager.getDataSource();
    return dataSource.transaction(work);
  }
}

interface RubricDbRow {
  id: number | string;
  profile_id: string;
  artifact_type: string;
  version_no: number | string;
  version_status: string;
  rubric_json: unknown;
  definition_hash: string;
  published_at: Date | string | null;
  gmt_modified: Date | string | null;
}

function cols(): string {
  return `CAST(id AS CHAR) AS id, profile_id, artifact_type, version_no, version_status,
          rubric_json, definition_hash, published_at, gmt_modified`;
}

function toRow(row: RubricDbRow): RubricVersionRow {
  return {
    id: String(row.id),
    profileId: row.profile_id,
    artifactType: row.artifact_type,
    versionNo: Number(row.version_no),
    versionStatus: row.version_status as 'draft' | 'published',
    rubricJson: typeof row.rubric_json === 'string' ? JSON.parse(row.rubric_json) : row.rubric_json,
    definitionHash: row.definition_hash,
    publishedAt: toIso(row.published_at),
    gmtModified: toIso(row.gmt_modified),
  };
}

function toIso(value: Date | string | null): string | null {
  if (value == null) return null;
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}
