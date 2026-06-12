import type { Pool, RowDataPacket } from 'mysql2/promise';
import {
  parseWorkflowProfileConfig,
  ProfileConfigCatalog,
  type ProfileConfigOrigin,
  type ProfileConfigSnapshot,
  type ProfileConfigStore,
} from '@sdd-telemetry/api';

interface PublishedProfileConfigRow extends RowDataPacket {
  profile_id: string;
  origin: ProfileConfigOrigin;
  config_version_id: number | string;
  version_no: number | string;
  definition_hash: string;
  published_at: Date | string | null;
  config_json: unknown;
}

export class MysqlProfileConfigStore implements ProfileConfigStore {
  constructor(private readonly pool: Pool) {}

  async listPublishedProfileConfigs(): Promise<ProfileConfigSnapshot[]> {
    try {
      const [rows] = await this.pool.query<PublishedProfileConfigRow[]>(
        `SELECT c.profile_id, c.origin,
                v.id AS config_version_id, v.version_no, v.definition_hash, v.published_at, v.config_json
         FROM profile_configs c
         JOIN profile_config_versions v
           ON v.id = c.published_version_id
          AND v.version_status = 'published'
         ORDER BY c.profile_id ASC`,
      );
      return rows.map(toSnapshot);
    } catch (error) {
      if (isMissingProfileConfigTable(error)) return [];
      throw error;
    }
  }

  async getPublishedProfileConfig(profileId: string): Promise<ProfileConfigSnapshot | null> {
    try {
      const [rows] = await this.pool.query<PublishedProfileConfigRow[]>(
        `SELECT c.profile_id, c.origin,
                v.id AS config_version_id, v.version_no, v.definition_hash, v.published_at, v.config_json
         FROM profile_configs c
         JOIN profile_config_versions v
           ON v.id = c.published_version_id
          AND v.version_status = 'published'
         WHERE c.profile_id = ?
         LIMIT 1`,
        [profileId],
      );
      return rows[0] ? toSnapshot(rows[0]) : null;
    } catch (error) {
      if (isMissingProfileConfigTable(error)) return null;
      throw error;
    }
  }
}

export function createProfileConfigCatalog(pool: Pool): ProfileConfigCatalog {
  return new ProfileConfigCatalog(new MysqlProfileConfigStore(pool));
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

function toIsoDate(value: Date | string | null): string | null {
  if (value == null) return null;
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function isMissingProfileConfigTable(error: unknown): boolean {
  const code = (error as { code?: string; errno?: number }).code;
  const errno = (error as { code?: string; errno?: number }).errno;
  return code === 'ER_NO_SUCH_TABLE' || errno === 1146;
}
