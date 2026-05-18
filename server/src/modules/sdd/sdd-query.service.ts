import { createHash } from 'node:crypto';
import { Inject, Provide } from '@midwayjs/core';
import type {
  CreateSddSemanticRequest,
  UpdateSddSemanticRequest,
  ReportUserSettingsRequest,
  SddErrorItem,
  SddFunnel,
  SddFunnelQuery,
  SddInteractionItem,
  SddListQuery,
  SddSemantic,
  SddUsageSummaryItem,
  SddUsageSummaryQuery,
  SddUsageSummaryResponse,
  SddUsageItem,
  SddUserItem,
  SddVersionItem,
  SddWorkItem,
  SddWorkItemDetail,
} from '@sdd-telemetry/api';
import { MysqlDataSourceManager } from '../../infrastructure/mysql/data-source-manager';
import {
  addTimeRangeWhere,
  toIsoDate,
  toNumber,
  toStringId,
  truncateText,
  whereSql,
} from '../query-utils';

interface SemanticRow {
  id: string | number;
  semantic_code: string;
  display_name: string;
  description: string | null;
  artifact_filename_patterns: unknown;
  alias_id: string | number | null;
  skill_name: string | null;
}

interface FunnelRow {
  semantic_code: string | null;
  display_name: string | null;
  usage_count: string | number;
  user_count: string | number;
  work_item_count: string | number;
}

interface FunnelQualityRow {
  with_prompt_count: string | number | null;
  with_response_count: string | number | null;
  paired_count: string | number | null;
}

interface CountRow {
  count_value: string | number;
}

interface UsageSummaryRow {
  semantic_code: string | null;
  semantic_display_name: string | null;
  raw_skill_name: string;
  usage_count: string | number;
  active_user_count: string | number;
  session_count: string | number;
  work_item_count: string | number;
  first_seen_at: Date | string | null;
  last_seen_at: Date | string | null;
}

interface UsageVersionRow {
  raw_skill_name: string;
  version: string | null;
  count_value: string | number;
}

interface UsageRow {
  id: string | number;
  usage_key: string;
  semantic_code: string | null;
  semantic_display_name: string | null;
  raw_skill_name: string;
  status: string;
  user_id: string | number | null;
  interaction_id: string | number | null;
  work_item_id: string | number | null;
  session_id: string | null;
  prompt_id: string | null;
  observed_version: string | null;
  event_time: Date | string | null;
}

interface InteractionRow {
  id: string | number;
  interaction_key: string;
  status: string;
  user_id: string | number | null;
  session_id: string | null;
  prompt_id: string | null;
  command_name: string | null;
  model: string | null;
  started_at: Date | string | null;
  completed_at: Date | string | null;
  duration_ms: string | number | null;
  prompt_text: string | null;
  response_text: string | null;
}

interface ErrorRow {
  id: string | number;
  error_type: string;
  severity: string;
  source: string | null;
  error_message: string | null;
  count_value?: string | number;
  latest_at: Date | string | null;
  user_id: string | number | null;
  session_id: string | null;
  semantic_code: string | null;
  work_item_id: string | number | null;
}

interface UserRow {
  id: string | number;
  user_key: string;
  install_id: string | null;
  user_name: string | null;
  machine_id: string | null;
  machine_name: string | null;
  requirements_root_path: string | null;
  wiki_root_path: string | null;
  last_seen_at: Date | string | null;
  skill_usage_count: string | number;
  interaction_count: string | number;
}

interface VersionRow {
  version: string | null;
  usage_count: string | number;
  user_count: string | number;
  latest_at: Date | string | null;
}

interface WorkItemRow {
  id: string | number;
  work_item_key: string;
  requirements_repo_name: string | null;
  business_domain: string | null;
  work_item_slug: string;
  work_item_title: string | null;
  relative_dir: string;
  first_seen_at: Date | string | null;
  last_seen_at: Date | string | null;
}

interface ArtifactRow {
  id: string | number;
  artifact_type: string;
  artifact_relative_path: string;
  system_module: string | null;
  last_seen_at: Date | string | null;
}

interface IdRow {
  id: string | number;
}

@Provide('sddQueryService')
export class SddQueryService {
  @Inject('mysqlDataSourceManager')
  mysqlDataSourceManager!: MysqlDataSourceManager;

  async listSemantics(): Promise<SddSemantic[]> {
    const dataSource = await this.mysqlDataSourceManager.getDataSource();
    const rows = (await dataSource.query(
      `SELECT s.id, s.semantic_code, s.display_name, s.description,
              s.artifact_filename_patterns,
              a.id AS alias_id, a.skill_name
       FROM sdd_skill_semantics s
       LEFT JOIN sdd_skill_aliases a ON a.semantic_id = s.id
       ORDER BY s.id ASC, a.skill_name ASC`,
    )) as SemanticRow[];
    const byId = new Map<string, SddSemantic>();

    for (const row of rows) {
      const id = toStringId(row.id);
      const semantic =
        byId.get(id) ??
        ({
          id,
          semanticCode: row.semantic_code,
          displayName: row.display_name,
          description: row.description,
          artifactFilenamePatterns: parseStringArray(row.artifact_filename_patterns),
          aliases: [],
        } satisfies SddSemantic);

      if (row.alias_id && row.skill_name) {
        semantic.aliases.push({
          id: toStringId(row.alias_id),
          skillName: row.skill_name,
        });
      }

      byId.set(id, semantic);
    }

    return Array.from(byId.values());
  }

  async createSemantic(input: CreateSddSemanticRequest): Promise<SddSemantic> {
    const dataSource = await this.mysqlDataSourceManager.getDataSource();
    await dataSource.transaction(async manager => {
      await manager.query(
        `INSERT INTO sdd_skill_semantics
          (semantic_code, display_name, description, artifact_filename_patterns,
           gmt_create, gmt_modified)
         VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3))
         ON DUPLICATE KEY UPDATE
           display_name = VALUES(display_name),
           description = VALUES(description),
           artifact_filename_patterns = VALUES(artifact_filename_patterns),
           gmt_modified = CURRENT_TIMESTAMP(3)`,
        [
          input.semanticCode,
          input.displayName,
          input.description ?? null,
          input.artifactFilenamePatterns === undefined
            ? null
            : JSON.stringify(input.artifactFilenamePatterns),
        ],
      );
      const rows = (await manager.query(
        `SELECT id FROM sdd_skill_semantics WHERE semantic_code = ? LIMIT 1`,
        [input.semanticCode],
      )) as IdRow[];
      const semanticId = rows[0]?.id;
      if (!semanticId) {
        throw new Error(`failed to create semantic: ${input.semanticCode}`);
      }

      for (const skillName of input.aliases) {
        await manager.query(
          `INSERT INTO sdd_skill_aliases
            (semantic_id, skill_name, gmt_create, gmt_modified)
           VALUES (?, ?, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3))
           ON DUPLICATE KEY UPDATE
             semantic_id = VALUES(semantic_id),
             gmt_modified = CURRENT_TIMESTAMP(3)`,
          [semanticId, skillName],
        );
      }
    });

    const semantic = (await this.listSemantics()).find(item => item.semanticCode === input.semanticCode);
    if (!semantic) {
      throw new Error(`semantic not found after create: ${input.semanticCode}`);
    }

    return semantic;
  }

  async updateSemantic(id: string, input: UpdateSddSemanticRequest): Promise<SddSemantic> {
    const dataSource = await this.mysqlDataSourceManager.getDataSource();
    await dataSource.transaction(async manager => {
      await manager.query(
        `UPDATE sdd_skill_semantics
         SET display_name = ?,
             description = ?,
             artifact_filename_patterns = COALESCE(?, artifact_filename_patterns),
             gmt_modified = CURRENT_TIMESTAMP(3)
         WHERE id = ?`,
        [
          input.displayName,
          input.description ?? null,
          input.artifactFilenamePatterns === undefined
            ? null
            : JSON.stringify(input.artifactFilenamePatterns),
          id,
        ],
      );
      await manager.query(
        `DELETE FROM sdd_skill_aliases WHERE semantic_id = ?`,
        [id],
      );
      for (const skillName of input.aliases) {
        await manager.query(
          `INSERT INTO sdd_skill_aliases
            (semantic_id, skill_name, gmt_create, gmt_modified)
           VALUES (?, ?, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3))`,
          [id, skillName],
        );
      }
    });

    const all = await this.listSemantics();
    const updated = all.find(item => item.id === id);
    if (!updated) {
      throw new Error(`semantic not found after update: ${id}`);
    }

    return updated;
  }

  async deleteSemantic(id: string): Promise<void> {
    const dataSource = await this.mysqlDataSourceManager.getDataSource();
    await dataSource.transaction(async manager => {
      await manager.query(`DELETE FROM sdd_skill_aliases WHERE semantic_id = ?`, [id]);
      await manager.query(`DELETE FROM sdd_skill_semantics WHERE id = ?`, [id]);
    });
  }

  async getFunnel(query: SddFunnelQuery): Promise<SddFunnel> {
    const dataSource = await this.mysqlDataSourceManager.getDataSource();
    const usageWhere: string[] = [];
    const usageParams: unknown[] = [];
    addTimeRangeWhere(usageWhere, usageParams, 'u.event_time', query);

    const interactionWhere: string[] = [];
    const interactionParams: unknown[] = [];
    addTimeRangeWhere(interactionWhere, interactionParams, 'i.started_at', query);

    const [interactionRows, qualityRows, usageRows] = await Promise.all([
      dataSource.query(
        `SELECT COUNT(*) AS count_value FROM sdd_interactions i ${whereSql(interactionWhere)}`,
        interactionParams,
      ) as Promise<CountRow[]>,
      dataSource.query(
        `SELECT
           SUM(t.prompt_text IS NOT NULL AND t.prompt_text <> '') AS with_prompt_count,
           SUM(t.response_text IS NOT NULL AND t.response_text <> '') AS with_response_count,
           SUM(
             t.prompt_text IS NOT NULL AND t.prompt_text <> ''
             AND t.response_text IS NOT NULL AND t.response_text <> ''
           ) AS paired_count
         FROM sdd_interactions i
         LEFT JOIN sdd_interaction_texts t ON t.interaction_id = i.id
         ${whereSql(interactionWhere)}`,
        interactionParams,
      ) as Promise<FunnelQualityRow[]>,
      dataSource.query(
        `SELECT s.semantic_code, s.display_name,
                COUNT(u.id) AS usage_count,
                COUNT(DISTINCT u.user_id) AS user_count,
                COUNT(DISTINCT u.work_item_id) AS work_item_count
         FROM sdd_skill_usages u
         LEFT JOIN sdd_skill_semantics s ON s.id = u.semantic_id
         ${whereSql(usageWhere)}
         GROUP BY s.semantic_code, s.display_name
         ORDER BY usage_count DESC, s.semantic_code ASC`,
        usageParams,
      ) as Promise<FunnelRow[]>,
    ]);
    const totalInteractions = toNumber(interactionRows[0]?.count_value);
    const totalSkillUsages = usageRows.reduce((sum, row) => sum + toNumber(row.usage_count), 0);
    const withPromptCount = toNumber(qualityRows[0]?.with_prompt_count);
    const withResponseCount = toNumber(qualityRows[0]?.with_response_count);
    const pairedCount = toNumber(qualityRows[0]?.paired_count);

    return {
      totalInteractions,
      totalSkillUsages,
      callQuality: {
        triggeredCount: totalSkillUsages,
        withPromptCount,
        withResponseCount,
        pairedCount,
        promptCoverageRate: totalInteractions > 0 ? withPromptCount / totalInteractions : null,
        responseCoverageRate: totalInteractions > 0 ? withResponseCount / totalInteractions : null,
        pairingSuccessRate: totalInteractions > 0 ? pairedCount / totalInteractions : null,
      },
      stages: usageRows.map(row => {
        const usageCount = toNumber(row.usage_count);
        return {
          semanticCode: row.semantic_code ?? 'unknown',
          displayName: row.display_name ?? '未匹配 Skill',
          usageCount,
          userCount: toNumber(row.user_count),
          workItemCount: toNumber(row.work_item_count),
          conversionRate: totalInteractions > 0 ? usageCount / totalInteractions : null,
        };
      }),
    };
  }

  async getUsageSummary(query: SddUsageSummaryQuery): Promise<SddUsageSummaryResponse> {
    const dataSource = await this.mysqlDataSourceManager.getDataSource();
    const { where, params } = this.buildUsageSummaryWhere(query);
    const rows = (await dataSource.query(
      `SELECT s.semantic_code, s.display_name AS semantic_display_name,
              u.raw_skill_name,
              COUNT(*) AS usage_count,
              COUNT(DISTINCT u.user_id) AS active_user_count,
              COUNT(DISTINCT u.session_id) AS session_count,
              COUNT(DISTINCT u.work_item_id) AS work_item_count,
              MIN(u.event_time) AS first_seen_at,
              MAX(u.event_time) AS last_seen_at
       FROM sdd_skill_usages u
       LEFT JOIN sdd_skill_semantics s ON s.id = u.semantic_id
       ${where}
       GROUP BY s.semantic_code, s.display_name, u.raw_skill_name
       ORDER BY usage_count DESC, u.raw_skill_name ASC
       LIMIT ?`,
      [...params, query.limit],
    )) as UsageSummaryRow[];

    if (rows.length === 0) {
      return { items: [] };
    }

    const rawSkillNames = rows.map(row => row.raw_skill_name);
    const versionWhere = [...params];
    const versionRows = (await dataSource.query(
      `SELECT u.raw_skill_name,
              COALESCE(u.observed_version, u.service_version, 'unknown') AS version,
              COUNT(*) AS count_value
       FROM sdd_skill_usages u
       LEFT JOIN sdd_skill_semantics s ON s.id = u.semantic_id
       ${where}
         ${where ? 'AND' : 'WHERE'} u.raw_skill_name IN (${rawSkillNames.map(() => '?').join(',')})
       GROUP BY u.raw_skill_name, version
       ORDER BY count_value DESC, version ASC`,
      [...versionWhere, ...rawSkillNames],
    )) as UsageVersionRow[];
    const versionsBySkill = new Map<string, Array<{ version: string; count: number }>>();

    for (const row of versionRows) {
      const versions = versionsBySkill.get(row.raw_skill_name) ?? [];
      versions.push({
        version: row.version ?? 'unknown',
        count: toNumber(row.count_value),
      });
      versionsBySkill.set(row.raw_skill_name, versions);
    }

    return {
      items: rows.map((row): SddUsageSummaryItem => ({
        semanticCode: row.semantic_code,
        semanticDisplayName: row.semantic_display_name,
        rawSkillName: row.raw_skill_name,
        usageCount: toNumber(row.usage_count),
        activeUserCount: toNumber(row.active_user_count),
        sessionCount: toNumber(row.session_count),
        workItemCount: toNumber(row.work_item_count),
        versions: versionsBySkill.get(row.raw_skill_name) ?? [],
        firstSeenAt: toIsoDate(row.first_seen_at),
        lastSeenAt: toIsoDate(row.last_seen_at),
      })),
    };
  }

  async listUsages(query: SddListQuery): Promise<SddUsageItem[]> {
    const dataSource = await this.mysqlDataSourceManager.getDataSource();
    const { where, params } = this.buildUsageWhere(query, 'u');
    const rows = (await dataSource.query(
      `SELECT u.id, u.usage_key, s.semantic_code, s.display_name AS semantic_display_name,
              u.raw_skill_name, u.status, u.user_id, u.interaction_id, u.work_item_id,
              u.session_id, u.prompt_id, u.observed_version, u.event_time
       FROM sdd_skill_usages u
       LEFT JOIN sdd_skill_semantics s ON s.id = u.semantic_id
       ${where}
       ORDER BY u.id DESC
       LIMIT ?`,
      [...params, query.limit],
    )) as UsageRow[];

    return rows.map(row => ({
      id: toStringId(row.id),
      usageKey: row.usage_key,
      semanticCode: row.semantic_code,
      semanticDisplayName: row.semantic_display_name,
      rawSkillName: row.raw_skill_name,
      status: row.status,
      userId: row.user_id === null ? null : toStringId(row.user_id),
      interactionId: row.interaction_id === null ? null : toStringId(row.interaction_id),
      workItemId: row.work_item_id === null ? null : toStringId(row.work_item_id),
      sessionId: row.session_id,
      promptId: row.prompt_id,
      observedVersion: row.observed_version,
      eventTime: toIsoDate(row.event_time),
    }));
  }

  async listInteractions(query: SddListQuery): Promise<SddInteractionItem[]> {
    const dataSource = await this.mysqlDataSourceManager.getDataSource();
    const clauses: string[] = [];
    const params: unknown[] = [];
    addTimeRangeWhere(clauses, params, 'i.started_at', query);
    this.addCommonFilters(clauses, params, query, 'i');

    if (query.semanticCode) {
      clauses.push(
        `EXISTS (
          SELECT 1 FROM sdd_skill_usages u
          LEFT JOIN sdd_skill_semantics s ON s.id = u.semantic_id
          WHERE u.interaction_id = i.id AND s.semantic_code = ?
        )`,
      );
      params.push(query.semanticCode);
    }

    const rows = (await dataSource.query(
      `SELECT i.id, i.interaction_key, i.status, i.user_id, i.session_id, i.prompt_id,
              i.command_name, i.model, i.started_at, i.completed_at, i.duration_ms,
              t.prompt_text, t.response_text
       FROM sdd_interactions i
       LEFT JOIN sdd_interaction_texts t ON t.interaction_id = i.id
       ${whereSql(clauses)}
       ORDER BY i.id DESC
       LIMIT ?`,
      [...params, query.limit],
    )) as InteractionRow[];

    return rows.map(row => ({
      id: toStringId(row.id),
      interactionKey: row.interaction_key,
      status: row.status,
      userId: row.user_id === null ? null : toStringId(row.user_id),
      sessionId: row.session_id,
      promptId: row.prompt_id,
      commandName: row.command_name,
      model: row.model,
      startedAt: toIsoDate(row.started_at),
      completedAt: toIsoDate(row.completed_at),
      durationMs: row.duration_ms === null ? null : toNumber(row.duration_ms),
      promptPreview: truncateText(row.prompt_text),
      responsePreview: truncateText(row.response_text),
    }));
  }

  async listErrors(query: SddListQuery): Promise<SddErrorItem[]> {
    const dataSource = await this.mysqlDataSourceManager.getDataSource();
    const clauses: string[] = [];
    const params: unknown[] = [];
    addTimeRangeWhere(clauses, params, 'e.event_time', query);
    if (query.userId) {
      clauses.push('e.user_id = ?');
      params.push(query.userId);
    }
    if (query.workItemId) {
      clauses.push('e.work_item_id = ?');
      params.push(query.workItemId);
    }
    if (query.sessionId) {
      clauses.push('i.session_id = ?');
      params.push(query.sessionId);
    }
    if (query.cursor) {
      clauses.push('e.id < ?');
      params.push(query.cursor);
    }

    const rows = (await dataSource.query(
      `SELECT e.id, e.error_type, e.severity, e.source, e.error_message,
              1 AS count_value, e.event_time AS latest_at, e.user_id,
              i.session_id, s.semantic_code, e.work_item_id
       FROM sdd_errors e
       LEFT JOIN sdd_interactions i ON i.id = e.interaction_id
       LEFT JOIN sdd_skill_usages u ON u.id = e.usage_id OR u.interaction_id = e.interaction_id
       LEFT JOIN sdd_skill_semantics s ON s.id = u.semantic_id
       ${whereSql(clauses)}
       GROUP BY e.id, e.error_type, e.severity, e.source, e.error_message, e.event_time,
                e.user_id, i.session_id, s.semantic_code, e.work_item_id
       ORDER BY e.id DESC
       LIMIT ?`,
      [...params, query.limit],
    )) as ErrorRow[];

    return rows.map(row => ({
      id: toStringId(row.id),
      errorType: row.error_type,
      severity: row.severity,
      source: row.source,
      message: truncateText(row.error_message, 500),
      count: toNumber(row.count_value),
      latestAt: toIsoDate(row.latest_at),
      userId: row.user_id === null ? null : toStringId(row.user_id),
      sessionId: row.session_id,
      semanticCode: row.semantic_code,
      workItemId: row.work_item_id === null ? null : toStringId(row.work_item_id),
    }));
  }

  async listUsers(): Promise<SddUserItem[]> {
    const dataSource = await this.mysqlDataSourceManager.getDataSource();
    const rows = (await dataSource.query(
      `SELECT u.id, u.user_key, u.install_id, u.user_name, u.machine_id, u.machine_name,
              u.requirements_root_path, u.wiki_root_path, u.last_seen_at,
              COUNT(DISTINCT su.id) AS skill_usage_count,
              COUNT(DISTINCT i.id) AS interaction_count
       FROM sdd_users u
       LEFT JOIN sdd_skill_usages su ON su.user_id = u.id
       LEFT JOIN sdd_interactions i ON i.user_id = u.id
       GROUP BY u.id, u.user_key, u.install_id, u.user_name, u.machine_id, u.machine_name,
                u.requirements_root_path, u.wiki_root_path, u.last_seen_at
       ORDER BY u.last_seen_at DESC, u.id DESC
       LIMIT 200`,
    )) as UserRow[];

    return rows.map(row => ({
      id: toStringId(row.id),
      userKey: row.user_key,
      installId: row.install_id,
      userName: row.user_name,
      machineId: row.machine_id,
      machineName: row.machine_name,
      requirementsRootPath: row.requirements_root_path,
      wikiRootPath: row.wiki_root_path,
      lastSeenAt: toIsoDate(row.last_seen_at),
      skillUsageCount: toNumber(row.skill_usage_count),
      interactionCount: toNumber(row.interaction_count),
    }));
  }

  async listVersions(): Promise<SddVersionItem[]> {
    const dataSource = await this.mysqlDataSourceManager.getDataSource();
    const rows = (await dataSource.query(
      `SELECT COALESCE(observed_version, service_version, 'unknown') AS version,
              COUNT(*) AS usage_count,
              COUNT(DISTINCT user_id) AS user_count,
              MAX(event_time) AS latest_at
       FROM sdd_skill_usages
       GROUP BY version
       ORDER BY usage_count DESC, version ASC
       LIMIT 100`,
    )) as VersionRow[];

    return rows.map(row => ({
      version: row.version ?? 'unknown',
      usageCount: toNumber(row.usage_count),
      userCount: toNumber(row.user_count),
      latestAt: toIsoDate(row.latest_at),
    }));
  }

  async listWorkItems(query: SddListQuery): Promise<SddWorkItem[]> {
    const dataSource = await this.mysqlDataSourceManager.getDataSource();
    const clauses: string[] = [];
    const params: unknown[] = [];

    if (query.cursor) {
      clauses.push('id < ?');
      params.push(query.cursor);
    }

    const rows = (await dataSource.query(
      `SELECT id, work_item_key, requirements_repo_name, business_domain,
              work_item_slug, work_item_title, relative_dir, first_seen_at, last_seen_at
       FROM sdd_work_items
       ${whereSql(clauses)}
       ORDER BY id DESC
       LIMIT ?`,
      [...params, query.limit],
    )) as WorkItemRow[];

    return rows.map(row => this.toWorkItem(row));
  }

  async getWorkItemDetail(workItemId: string): Promise<SddWorkItemDetail | null> {
    const dataSource = await this.mysqlDataSourceManager.getDataSource();
    const [workRows, artifactRows, usageRows, errorRows] = await Promise.all([
      dataSource.query(
        `SELECT id, work_item_key, requirements_repo_name, business_domain,
                work_item_slug, work_item_title, relative_dir, first_seen_at, last_seen_at
         FROM sdd_work_items
         WHERE id = ?
         LIMIT 1`,
        [workItemId],
      ) as Promise<WorkItemRow[]>,
      dataSource.query(
        `SELECT id, artifact_type, artifact_relative_path, system_module, last_seen_at
         FROM sdd_work_item_artifacts
         WHERE work_item_id = ?
         ORDER BY id ASC`,
        [workItemId],
      ) as Promise<ArtifactRow[]>,
      dataSource.query(
        `SELECT COUNT(*) AS count_value FROM sdd_skill_usages WHERE work_item_id = ?`,
        [workItemId],
      ) as Promise<CountRow[]>,
      dataSource.query(
        `SELECT COUNT(*) AS count_value FROM sdd_errors WHERE work_item_id = ?`,
        [workItemId],
      ) as Promise<CountRow[]>,
    ]);
    const workItem = workRows[0];

    if (!workItem) {
      return null;
    }

    return {
      ...this.toWorkItem(workItem),
      artifacts: artifactRows.map(row => ({
        id: toStringId(row.id),
        artifactType: row.artifact_type,
        artifactRelativePath: row.artifact_relative_path,
        systemModule: row.system_module,
        lastSeenAt: toIsoDate(row.last_seen_at),
      })),
      usageCount: toNumber(usageRows[0]?.count_value),
      errorCount: toNumber(errorRows[0]?.count_value),
    };
  }

  async reportUserSettings(input: ReportUserSettingsRequest): Promise<SddUserItem> {
    const dataSource = await this.mysqlDataSourceManager.getDataSource();
    const userKey = createUserKey(input);

    await dataSource.query(
      `INSERT INTO sdd_users
        (user_key, install_id, user_name, machine_id, machine_name,
         requirements_root_path, wiki_root_path, settings_json, settings_reported_at,
         first_seen_at, last_seen_at, gmt_create, gmt_modified)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP(3),
         CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3))
       ON DUPLICATE KEY UPDATE
         install_id = COALESCE(VALUES(install_id), install_id),
         user_name = COALESCE(VALUES(user_name), user_name),
         machine_id = COALESCE(VALUES(machine_id), machine_id),
         machine_name = COALESCE(VALUES(machine_name), machine_name),
         requirements_root_path = VALUES(requirements_root_path),
         wiki_root_path = VALUES(wiki_root_path),
         settings_json = VALUES(settings_json),
         settings_reported_at = CURRENT_TIMESTAMP(3),
         last_seen_at = CURRENT_TIMESTAMP(3),
         gmt_modified = CURRENT_TIMESTAMP(3)`,
      [
        userKey,
        input.installId ?? null,
        input.userName ?? null,
        input.machineId ?? null,
        input.machineName ?? null,
        input.requirementsRootPath,
        input.wikiRootPath ?? null,
        input.settings ? JSON.stringify(input.settings) : null,
      ],
    );

    const user = (await this.listUsers()).find(item => item.userKey === userKey);
    if (!user) {
      throw new Error(`user not found after settings report: ${userKey}`);
    }

    return user;
  }

  private buildUsageWhere(query: SddListQuery, alias: string): { where: string; params: unknown[] } {
    const clauses: string[] = [];
    const params: unknown[] = [];
    addTimeRangeWhere(clauses, params, `${alias}.event_time`, query);
    this.addCommonFilters(clauses, params, query, alias);

    if (query.semanticCode) {
      clauses.push(`s.semantic_code = ?`);
      params.push(query.semanticCode);
    }

    return {
      where: whereSql(clauses),
      params,
    };
  }

  private buildUsageSummaryWhere(query: SddUsageSummaryQuery): { where: string; params: unknown[] } {
    const clauses: string[] = [];
    const params: unknown[] = [];
    addTimeRangeWhere(clauses, params, 'u.event_time', query);

    if (query.semanticCode) {
      clauses.push('s.semantic_code = ?');
      params.push(query.semanticCode);
    }

    if (query.status) {
      clauses.push('u.status = ?');
      params.push(query.status);
    }

    return {
      where: whereSql(clauses),
      params,
    };
  }

  private addCommonFilters(
    clauses: string[],
    params: unknown[],
    query: SddListQuery,
    alias: string,
  ): void {
    if (query.userId) {
      clauses.push(`${alias}.user_id = ?`);
      params.push(query.userId);
    }
    if (query.workItemId) {
      clauses.push(`${alias}.work_item_id = ?`);
      params.push(query.workItemId);
    }
    if (query.sessionId) {
      clauses.push(`${alias}.session_id = ?`);
      params.push(query.sessionId);
    }
    if (query.promptId) {
      clauses.push(`${alias}.prompt_id = ?`);
      params.push(query.promptId);
    }
    if (query.status) {
      clauses.push(`${alias}.status = ?`);
      params.push(query.status);
    }
    if (query.cursor) {
      clauses.push(`${alias}.id < ?`);
      params.push(query.cursor);
    }
  }

  private toWorkItem(row: WorkItemRow): SddWorkItem {
    return {
      id: toStringId(row.id),
      workItemKey: row.work_item_key,
      requirementsRepoName: row.requirements_repo_name,
      businessDomain: row.business_domain,
      workItemSlug: row.work_item_slug,
      workItemTitle: row.work_item_title,
      relativeDir: row.relative_dir,
      firstSeenAt: toIsoDate(row.first_seen_at),
      lastSeenAt: toIsoDate(row.last_seen_at),
    };
  }
}

function createUserKey(input: ReportUserSettingsRequest): string {
  if (input.installId) {
    return sha256(`install:${input.installId}`);
  }

  if (input.machineId) {
    return sha256(`machine:${input.machineId}`);
  }

  return sha256(`settings:${input.requirementsRootPath}`);
}

function parseStringArray(value: unknown): string[] | null {
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === 'string');
  }

  if (typeof value !== 'string') {
    return null;
  }

  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === 'string')
      : null;
  } catch {
    return null;
  }
}

function sha256(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}
