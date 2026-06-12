import { createHash } from 'node:crypto';
import { Inject, Provide } from '@midwayjs/core';
import {
  canonicalProfileConfigJson,
  E2E_MONOREPO_PROFILE_ID,
  ONLINE_DOCS_PROFILE_ID,
  SDD_DEFAULT_PROFILE_ID,
  parseWorkflowProfileConfig,
  type ProfileConfigAdminSummary,
  type ProfileConfigOrigin,
  type ProfileConfigSnapshot,
  type ProfileConfigStore,
  type ProfileConfigVersionSummary,
  type WorkflowProfileConfig,
} from '@sdd-telemetry/api';
import type { EntityManager } from 'typeorm';
import { MysqlDataSourceManager } from '../../infrastructure/mysql/data-source-manager';

interface PublishedProfileConfigRow {
  profile_id: string;
  origin: ProfileConfigOrigin;
  config_version_id: number | string;
  version_no: number | string;
  definition_hash: string;
  published_at: Date | string | null;
  config_json: unknown;
}

interface ProfileConfigAdminRow {
  profile_id: string;
  display_name: string;
  status: 'active' | 'disabled';
  projection_mode: 'sdd_bridge' | 'source_backed';
  origin: ProfileConfigOrigin;
  published_version_id: number | string | null;
  published_version_no: number | string | null;
  draft_version_id: number | string | null;
  definition_hash: string | null;
  published_at: Date | string | null;
  gmt_modified: Date | string | null;
}

interface ProfileConfigVersionRow {
  id: number | string;
  version_no: number | string;
  version_status: 'draft' | 'published' | 'archived';
  definition_hash: string;
  notes: string | null;
  published_at: Date | string | null;
  gmt_create: Date | string | null;
}

@Provide('profileConfigRepository')
export class ProfileConfigRepository implements ProfileConfigStore {
  @Inject('mysqlDataSourceManager')
  mysqlDataSourceManager!: MysqlDataSourceManager;

  async listPublishedProfileConfigs(): Promise<ProfileConfigSnapshot[]> {
    try {
      const dataSource = await this.mysqlDataSourceManager.getDataSource();
      const rows = (await dataSource.query(
        `SELECT c.profile_id, c.origin,
                v.id AS config_version_id, v.version_no, v.definition_hash, v.published_at, v.config_json
         FROM profile_configs c
         JOIN profile_config_versions v
           ON v.id = c.published_version_id
          AND v.version_status = 'published'
         ORDER BY c.profile_id ASC`,
      )) as PublishedProfileConfigRow[];
      return rows.map(toSnapshot);
    } catch (error) {
      if (isMissingProfileConfigTable(error)) return [];
      throw error;
    }
  }

  async getPublishedProfileConfig(profileId: string): Promise<ProfileConfigSnapshot | null> {
    try {
      const dataSource = await this.mysqlDataSourceManager.getDataSource();
      const rows = (await dataSource.query(
        `SELECT c.profile_id, c.origin,
                v.id AS config_version_id, v.version_no, v.definition_hash, v.published_at, v.config_json
         FROM profile_configs c
         JOIN profile_config_versions v
           ON v.id = c.published_version_id
          AND v.version_status = 'published'
         WHERE c.profile_id = ?
         LIMIT 1`,
        [profileId],
      )) as PublishedProfileConfigRow[];
      return rows[0] ? toSnapshot(rows[0]) : null;
    } catch (error) {
      if (isMissingProfileConfigTable(error)) return null;
      throw error;
    }
  }

  async listAdminSummaries(): Promise<ProfileConfigAdminSummary[]> {
    try {
      const dataSource = await this.mysqlDataSourceManager.getDataSource();
      const rows = (await dataSource.query(
        `SELECT c.profile_id, c.display_name, c.status, c.projection_mode, c.origin,
                c.published_version_id, v.version_no AS published_version_no, c.draft_version_id,
                v.definition_hash, v.published_at, c.gmt_modified
         FROM profile_configs c
         LEFT JOIN profile_config_versions v ON v.id = c.published_version_id
         ORDER BY c.profile_id ASC`,
      )) as ProfileConfigAdminRow[];
      return rows.map(toAdminSummary);
    } catch (error) {
      if (isMissingProfileConfigTable(error)) return [];
      throw error;
    }
  }

  async listVersions(profileId: string): Promise<ProfileConfigVersionSummary[]> {
    try {
      const dataSource = await this.mysqlDataSourceManager.getDataSource();
      const rows = (await dataSource.query(
        `SELECT id, version_no, version_status, definition_hash, notes, published_at, gmt_create
         FROM profile_config_versions
         WHERE profile_id = ?
         ORDER BY version_no DESC, id DESC`,
        [profileId],
      )) as ProfileConfigVersionRow[];
      return rows.map(toVersionSummary);
    } catch (error) {
      if (isMissingProfileConfigTable(error)) return [];
      throw error;
    }
  }

  async getDraftProfileConfig(profileId: string): Promise<ProfileConfigSnapshot | null> {
    try {
      const dataSource = await this.mysqlDataSourceManager.getDataSource();
      const rows = (await dataSource.query(
        `SELECT c.profile_id, c.origin,
                v.id AS config_version_id, v.version_no, v.definition_hash, v.published_at, v.config_json
         FROM profile_configs c
         JOIN profile_config_versions v
           ON v.id = c.draft_version_id
          AND v.version_status = 'draft'
         WHERE c.profile_id = ?
         LIMIT 1`,
        [profileId],
      )) as PublishedProfileConfigRow[];
      return rows[0] ? toSnapshot(rows[0]) : null;
    } catch (error) {
      if (isMissingProfileConfigTable(error)) return null;
      throw error;
    }
  }

  async saveDraftProfileConfig(input: {
    config: WorkflowProfileConfig;
    actorUserId: string | null;
    notes?: string;
  }): Promise<string> {
    const dataSource = await this.mysqlDataSourceManager.getDataSource();
    return dataSource.transaction(async (manager) => {
      const origin = builtinProfileIds().has(input.config.profileId) ? 'builtin' : 'custom';
      await upsertProfileConfigRow(manager, input.config, origin);
      const draftRows = (await manager.query(
        'SELECT draft_version_id FROM profile_configs WHERE profile_id = ? LIMIT 1',
        [input.config.profileId],
      )) as Array<{ draft_version_id: number | string | null }>;
      const draftVersionId = draftRows[0]?.draft_version_id == null
        ? null
        : String(draftRows[0].draft_version_id);

      const configJson = canonicalProfileConfigJson(input.config);
      const definitionHash = sha256(configJson);
      let versionId = draftVersionId;
      if (versionId) {
        await manager.query(
          `UPDATE profile_config_versions
           SET config_json = ?, definition_hash = ?, notes = ?, created_by_user_id = ?,
               gmt_modified = CURRENT_TIMESTAMP(3)
           WHERE id = ? AND version_status = 'draft'`,
          [configJson, definitionHash, input.notes ?? null, input.actorUserId, versionId],
        );
      } else {
        const versionNo = await nextVersionNo(manager, input.config.profileId);
        const result = (await manager.query(
          `INSERT INTO profile_config_versions
            (profile_id, version_no, version_status, config_json, definition_hash,
             created_by_user_id, created_reason, notes, gmt_create, gmt_modified)
           VALUES (?, ?, 'draft', ?, ?, ?, 'admin_draft', ?, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3))`,
          [
            input.config.profileId,
            versionNo,
            configJson,
            definitionHash,
            input.actorUserId,
            input.notes ?? null,
          ],
        )) as { insertId?: string | number };
        versionId = String(result.insertId);
        await manager.query(
          `UPDATE profile_configs
           SET draft_version_id = ?, gmt_modified = CURRENT_TIMESTAMP(3)
           WHERE profile_id = ?`,
          [versionId, input.config.profileId],
        );
      }
      await insertProfileConfigEvent(manager, {
        profileId: input.config.profileId,
        versionId,
        actorUserId: input.actorUserId,
        eventType: 'draft_saved',
        event: { notes: input.notes ?? null },
      });
      return versionId;
    });
  }

  async publishProfileConfig(input: {
    config: WorkflowProfileConfig;
    actorUserId: string | null;
    notes?: string;
  }): Promise<ProfileConfigSnapshot> {
    const dataSource = await this.mysqlDataSourceManager.getDataSource();
    const versionId = await dataSource.transaction(async (manager) => {
      const origin = builtinProfileIds().has(input.config.profileId) ? 'builtin' : 'custom';
      await upsertProfileConfigRow(manager, input.config, origin);

      const configJson = canonicalProfileConfigJson(input.config);
      const definitionHash = sha256(configJson);
      const versionNo = await nextVersionNo(manager, input.config.profileId);
      const result = (await manager.query(
        `INSERT INTO profile_config_versions
          (profile_id, version_no, version_status, config_json, definition_hash,
           created_by_user_id, created_reason, published_at, published_by_user_id, notes,
           gmt_create, gmt_modified)
         VALUES (?, ?, 'published', ?, ?, ?, 'admin_publish', CURRENT_TIMESTAMP(3), ?, ?,
                 CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3))`,
        [
          input.config.profileId,
          versionNo,
          configJson,
          definitionHash,
          input.actorUserId,
          input.actorUserId,
          input.notes ?? null,
        ],
      )) as { insertId?: string | number };
      const publishedVersionId = String(result.insertId);

      await manager.query(
        `UPDATE profile_config_versions
         SET version_status = 'archived', gmt_modified = CURRENT_TIMESTAMP(3)
         WHERE profile_id = ? AND version_status = 'published' AND id <> ?`,
        [input.config.profileId, publishedVersionId],
      );
      await manager.query(
        `UPDATE profile_configs
         SET display_name = ?, status = ?, projection_mode = ?, published_version_id = ?,
             draft_version_id = NULL, archived_at = NULL, gmt_modified = CURRENT_TIMESTAMP(3)
         WHERE profile_id = ?`,
        [
          input.config.displayName,
          input.config.status,
          input.config.projectionMode,
          publishedVersionId,
          input.config.profileId,
        ],
      );

      if (input.config.status === 'active') {
        await markProjectionDirty(manager, input.config.profileId, publishedVersionId, `profile_config_published:${publishedVersionId}`);
      }

      await insertProfileConfigEvent(manager, {
        profileId: input.config.profileId,
        versionId: publishedVersionId,
        actorUserId: input.actorUserId,
        eventType: 'published',
        event: { notes: input.notes ?? null },
      });
      return publishedVersionId;
    });

    const snapshot = await this.getPublishedProfileConfig(input.config.profileId);
    if (!snapshot || snapshot.configVersionId !== versionId) {
      throw new Error(`published profile config not readable after publish: ${input.config.profileId}`);
    }
    return snapshot;
  }
}

function toSnapshot(row: PublishedProfileConfigRow): ProfileConfigSnapshot {
  const config = parseWorkflowProfileConfig(row.config_json);
  return {
    profileId: String(row.profile_id),
    config,
    source: 'database',
    origin: row.origin,
    configVersionId: String(row.config_version_id),
    versionNo: Number(row.version_no),
    definitionHash: row.definition_hash,
    publishedAt: toIsoDate(row.published_at),
  };
}

function toAdminSummary(row: ProfileConfigAdminRow): ProfileConfigAdminSummary {
  return {
    profileId: String(row.profile_id),
    displayName: String(row.display_name),
    status: row.status,
    projectionMode: row.projection_mode,
    origin: row.origin,
    source: 'database',
    publishedVersionId: row.published_version_id == null ? null : String(row.published_version_id),
    publishedVersionNo: row.published_version_no == null ? null : Number(row.published_version_no),
    draftVersionId: row.draft_version_id == null ? null : String(row.draft_version_id),
    definitionHash: row.definition_hash,
    publishedAt: toIsoDate(row.published_at),
    updatedAt: toIsoDate(row.gmt_modified),
  };
}

function toVersionSummary(row: ProfileConfigVersionRow): ProfileConfigVersionSummary {
  return {
    id: String(row.id),
    versionNo: Number(row.version_no),
    status: row.version_status,
    definitionHash: row.definition_hash,
    notes: row.notes,
    publishedAt: toIsoDate(row.published_at),
    createdAt: toIsoDate(row.gmt_create),
  };
}

function toIsoDate(value: Date | string | null): string | null {
  if (value == null) return null;
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

async function upsertProfileConfigRow(
  manager: EntityManager,
  config: WorkflowProfileConfig,
  origin: ProfileConfigOrigin,
): Promise<void> {
  await manager.query(
    `INSERT INTO profile_configs
      (profile_id, display_name, status, projection_mode, origin, gmt_create, gmt_modified)
     VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3))
     ON DUPLICATE KEY UPDATE
       display_name = VALUES(display_name),
       status = VALUES(status),
       projection_mode = VALUES(projection_mode),
       origin = VALUES(origin),
       gmt_modified = CURRENT_TIMESTAMP(3)`,
    [config.profileId, config.displayName, config.status, config.projectionMode, origin],
  );
}

async function nextVersionNo(manager: EntityManager, profileId: string): Promise<number> {
  const rows = (await manager.query(
    `SELECT COALESCE(MAX(version_no), 0) + 1 AS next_version_no
     FROM profile_config_versions
     WHERE profile_id = ?`,
    [profileId],
  )) as Array<{ next_version_no: number | string }>;
  return Number(rows[0]?.next_version_no ?? 1);
}

async function insertProfileConfigEvent(
  manager: EntityManager,
  input: {
    profileId: string;
    versionId: string | null;
    actorUserId: string | null;
    eventType: string;
    event: Record<string, unknown>;
  },
): Promise<void> {
  await manager.query(
    `INSERT INTO profile_config_events
      (profile_id, profile_config_version_id, event_type, actor_user_id, event_json, gmt_create)
     VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP(3))`,
    [
      input.profileId,
      input.versionId,
      input.eventType,
      input.actorUserId,
      JSON.stringify(input.event),
    ],
  );
}

async function markProjectionDirty(
  manager: EntityManager,
  profileId: string,
  targetConfigVersionId: string,
  reason: string,
): Promise<void> {
  await manager.query(
    `INSERT INTO profile_projection_jobs
       (profile_id, target_config_version_id, status, dirty_seq, dirty_since, dirty_until,
        dirty_reason, max_attempts, next_retry_at)
     VALUES (?, ?, 'dirty', 1, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3), ?, 20, NULL)
     ON DUPLICATE KEY UPDATE
       target_config_version_id = VALUES(target_config_version_id),
       dirty_seq = dirty_seq + 1,
       status = CASE WHEN status = 'running' THEN status ELSE 'dirty' END,
       dirty_since = COALESCE(dirty_since, CURRENT_TIMESTAMP(3)),
       dirty_until = CURRENT_TIMESTAMP(3),
       dirty_reason = VALUES(dirty_reason),
       attempts = 0,
       next_retry_at = NULL,
       last_error = NULL,
       gmt_modified = CURRENT_TIMESTAMP(3)`,
    [profileId, targetConfigVersionId, reason],
  );
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function builtinProfileIds(): Set<string> {
  return new Set([
    SDD_DEFAULT_PROFILE_ID,
    E2E_MONOREPO_PROFILE_ID,
    ONLINE_DOCS_PROFILE_ID,
  ]);
}

function isMissingProfileConfigTable(error: unknown): boolean {
  const code = (error as { code?: string; errno?: number }).code;
  const errno = (error as { code?: string; errno?: number }).errno;
  return code === 'ER_NO_SUCH_TABLE' || errno === 1146;
}
