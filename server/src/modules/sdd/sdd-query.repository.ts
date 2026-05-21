import { Inject, Provide } from '@midwayjs/core';
import type { ReportUserSettingsRequest } from '@sdd-telemetry/api';
import { MysqlDataSourceManager } from '../../infrastructure/mysql/data-source-manager';
import { whereSql } from '../query-utils';

export interface SemanticRow {
  id: string | number;
  semantic_code: string;
  display_name: string;
  description: string | null;
  artifact_filename_patterns: unknown;
  alias_id: string | number | null;
  skill_name: string | null;
}

export interface FunnelRow {
  semantic_code: string | null;
  display_name: string | null;
  usage_count: string | number;
  user_count: string | number;
  work_item_count: string | number;
}

export interface OverviewUsageRow {
  active_user_count: string | number;
  skill_usage_count: string | number;
}

export interface FunnelQualityRow {
  with_prompt_count: string | number | null;
  with_response_count: string | number | null;
  paired_count: string | number | null;
  failed_count: string | number | null;
}

export interface CountRow {
  count_value: string | number;
}

export interface UsageSummaryRow {
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

export interface UsageVersionRow {
  raw_skill_name: string;
  version: string | null;
  count_value: string | number;
}

export interface SkillAnalyticsKpiRow {
  skill_usage_count: string | number;
  active_user_count: string | number;
  covered_work_item_count: string | number;
  user_triggered_count: string | number;
  auto_triggered_count: string | number;
  multi_stage_work_item_count: string | number;
}

export interface SkillMatchHealthRow {
  matched_count: string | number;
  unmatched_count: string | number;
}

export interface TopUnmatchedRow {
  raw_skill_name: string;
  usage_count: string | number;
}

export interface SkillTimeseriesRow {
  bucket_index: string | number;
  triggered_count: string | number;
  paired_count: string | number | null;
}

export interface SkillQualityAnalyticsRow {
  triggered_count: string | number;
  interaction_count: string | number;
  with_prompt_count: string | number | null;
  with_response_count: string | number | null;
  paired_count: string | number | null;
  failed_count: string | number | null;
}

export interface UsageRow {
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

export interface InteractionRow {
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
  cost_usd: string | number | null;
  input_tokens: string | number | null;
  output_tokens: string | number | null;
  cache_read_tokens: string | number | null;
  cache_creation_tokens: string | number | null;
  llm_call_count: string | number;
  tool_call_count: string | number;
  skill_name: string | null;
  agent_name: string | null;
  plugin_name: string | null;
  query_source: string | null;
  effort: string | null;
  speed: string | null;
  pairing_method: string | null;
  prompt_text: string | null;
  response_text: string | null;
}

export interface InteractionDetailRow extends InteractionRow {
  response_json: string | null;
}

export interface InteractionToolCallRow {
  id: string | number;
  tool_use_id: string;
  tool_name: string;
  sequence: string | number;
  decision: string | null;
  decision_source: string | null;
  success: string | number | boolean | null;
  duration_ms: string | number | null;
  input_size_bytes: string | number | null;
  result_size_bytes: string | number | null;
  error_type: string | null;
  tool_input_preview: string | null;
  mcp_server_scope: string | null;
}

export interface ErrorRow {
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

export interface UserRow {
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

export interface VersionRow {
  version: string | null;
  usage_count: string | number;
  user_count: string | number;
  latest_at: Date | string | null;
}

export interface WorkItemRow {
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

export interface ArtifactRow {
  id: string | number;
  artifact_type: string;
  artifact_relative_path: string;
  system_module: string | null;
  last_seen_at: Date | string | null;
}

export interface ResolvedTimeWindow {
  from: string;
  to: string;
}

@Provide('sddQueryRepository')
export class SddQueryRepository {
  @Inject('mysqlDataSourceManager')
  mysqlDataSourceManager!: MysqlDataSourceManager;

  async listSemantics(): Promise<SemanticRow[]> {
    const dataSource = await this.mysqlDataSourceManager.getDataSource();
    return (await dataSource.query(
      `SELECT s.id, s.semantic_code, s.display_name, s.description,
              s.artifact_filename_patterns,
              a.id AS alias_id, a.skill_name
       FROM sdd_skill_semantics s
       LEFT JOIN sdd_skill_aliases a ON a.semantic_id = s.id
       ORDER BY s.id ASC, a.skill_name ASC`,
    )) as SemanticRow[];
  }

  async countOverviewUsage(
    clauses: string[],
    params: unknown[],
  ): Promise<OverviewUsageRow[]> {
    const dataSource = await this.mysqlDataSourceManager.getDataSource();
    return (await dataSource.query(
      `SELECT
         COUNT(DISTINCT u.user_id) AS active_user_count,
         COUNT(*) AS skill_usage_count
       FROM sdd_skill_usages u
       ${whereSql(clauses)}`,
      params,
    )) as OverviewUsageRow[];
  }

  async countOverviewWorkItems(clauses: string[], params: unknown[]): Promise<CountRow[]> {
    const dataSource = await this.mysqlDataSourceManager.getDataSource();
    return (await dataSource.query(
      `SELECT COUNT(*) AS count_value
       FROM sdd_work_items wi
       ${whereSql(clauses)}`,
      params,
    )) as CountRow[];
  }

  async countOverviewArtifacts(clauses: string[], params: unknown[]): Promise<CountRow[]> {
    const dataSource = await this.mysqlDataSourceManager.getDataSource();
    return (await dataSource.query(
      `SELECT COUNT(*) AS count_value
       FROM sdd_work_item_artifacts a
       ${whereSql(clauses)}`,
      params,
    )) as CountRow[];
  }

  async countInteractions(clauses: string[], params: unknown[]): Promise<CountRow[]> {
    const dataSource = await this.mysqlDataSourceManager.getDataSource();
    return (await dataSource.query(
      `SELECT COUNT(*) AS count_value FROM sdd_interactions i ${whereSql(clauses)}`,
      params,
    )) as CountRow[];
  }

  async aggregateInteractionQuality(
    clauses: string[],
    params: unknown[],
  ): Promise<FunnelQualityRow[]> {
    const dataSource = await this.mysqlDataSourceManager.getDataSource();
    return (await dataSource.query(
      `SELECT
         SUM(t.prompt_text IS NOT NULL AND t.prompt_text <> '') AS with_prompt_count,
         SUM(t.response_text IS NOT NULL AND t.response_text <> '') AS with_response_count,
         SUM(
           t.prompt_text IS NOT NULL AND t.prompt_text <> ''
           AND t.response_text IS NOT NULL AND t.response_text <> ''
         ) AS paired_count,
         SUM(i.status = 'failed') AS failed_count
       FROM sdd_interactions i
       LEFT JOIN sdd_interaction_texts t ON t.interaction_id = i.id
       ${whereSql(clauses)}`,
      params,
    )) as FunnelQualityRow[];
  }

  async aggregateSemanticDistribution(
    clauses: string[],
    params: unknown[],
  ): Promise<FunnelRow[]> {
    const dataSource = await this.mysqlDataSourceManager.getDataSource();
    return (await dataSource.query(
      `SELECT s.semantic_code, s.display_name,
              COUNT(u.id) AS usage_count,
              COUNT(DISTINCT u.user_id) AS user_count,
              COUNT(DISTINCT u.work_item_id) AS work_item_count
       FROM sdd_skill_usages u
       LEFT JOIN sdd_skill_semantics s ON s.id = u.semantic_id
       ${whereSql(clauses)}
       GROUP BY s.semantic_code, s.display_name
       ORDER BY usage_count DESC, s.semantic_code ASC`,
      params,
    )) as FunnelRow[];
  }

  async topSemanticsByWindow(window: ResolvedTimeWindow): Promise<FunnelRow[]> {
    const dataSource = await this.mysqlDataSourceManager.getDataSource();
    return (await dataSource.query(
      `SELECT s.semantic_code, s.display_name,
              COUNT(u.id) AS usage_count,
              COUNT(DISTINCT u.user_id) AS user_count,
              COUNT(DISTINCT u.work_item_id) AS work_item_count
       FROM sdd_skill_usages u
       INNER JOIN sdd_skill_semantics s ON s.id = u.semantic_id
       WHERE u.event_time >= ? AND u.event_time <= ?
       GROUP BY s.semantic_code, s.display_name
       ORDER BY usage_count DESC, s.semantic_code ASC
       LIMIT 10`,
      [window.from, window.to],
    )) as FunnelRow[];
  }

  async aggregateSemanticMatchHealth(window: ResolvedTimeWindow): Promise<SkillMatchHealthRow[]> {
    const dataSource = await this.mysqlDataSourceManager.getDataSource();
    return (await dataSource.query(
      `SELECT
         SUM(u.semantic_id IS NOT NULL) AS matched_count,
         SUM(u.semantic_id IS NULL) AS unmatched_count
       FROM sdd_skill_usages u
       WHERE u.event_time >= ? AND u.event_time <= ?`,
      [window.from, window.to],
    )) as SkillMatchHealthRow[];
  }

  async topUnmatchedSkills(window: ResolvedTimeWindow): Promise<TopUnmatchedRow[]> {
    const dataSource = await this.mysqlDataSourceManager.getDataSource();
    return (await dataSource.query(
      `SELECT u.raw_skill_name, COUNT(*) AS usage_count
       FROM sdd_skill_usages u
       WHERE u.event_time >= ? AND u.event_time <= ? AND u.semantic_id IS NULL
       GROUP BY u.raw_skill_name
       ORDER BY usage_count DESC, u.raw_skill_name ASC
       LIMIT 5`,
      [window.from, window.to],
    )) as TopUnmatchedRow[];
  }

  async bucketizeSkillUsage(
    fromIso: string,
    toIso: string,
    bucketSeconds: number,
  ): Promise<SkillTimeseriesRow[]> {
    const dataSource = await this.mysqlDataSourceManager.getDataSource();
    return (await dataSource.query(
      `SELECT
         FLOOR(TIMESTAMPDIFF(SECOND, ?, u.event_time) / ?) AS bucket_index,
         COUNT(u.id) AS triggered_count,
         SUM(
           t.prompt_text IS NOT NULL AND t.prompt_text <> ''
           AND t.response_text IS NOT NULL AND t.response_text <> ''
         ) AS paired_count
       FROM sdd_skill_usages u
       LEFT JOIN sdd_interactions i ON i.id = u.interaction_id
       LEFT JOIN sdd_interaction_texts t ON t.interaction_id = i.id
       WHERE u.event_time >= ? AND u.event_time <= ?
       GROUP BY bucket_index
       HAVING bucket_index >= 0 AND bucket_index < 24
       ORDER BY bucket_index ASC`,
      [fromIso, bucketSeconds, fromIso, toIso],
    )) as SkillTimeseriesRow[];
  }

  async countUsageSummary(clauses: string[], params: unknown[]): Promise<CountRow[]> {
    const dataSource = await this.mysqlDataSourceManager.getDataSource();
    return (await dataSource.query(
      `SELECT COUNT(*) AS count_value
       FROM (
         SELECT u.raw_skill_name, s.semantic_code, s.display_name
         FROM sdd_skill_usages u
         LEFT JOIN sdd_skill_semantics s ON s.id = u.semantic_id
         ${whereSql(clauses)}
         GROUP BY s.semantic_code, s.display_name, u.raw_skill_name
       ) grouped_usage_summary`,
      params,
    )) as CountRow[];
  }

  async listUsageSummary(
    clauses: string[],
    params: unknown[],
    pageSize: number,
    offset: number,
  ): Promise<UsageSummaryRow[]> {
    const dataSource = await this.mysqlDataSourceManager.getDataSource();
    return (await dataSource.query(
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
       ${whereSql(clauses)}
       GROUP BY s.semantic_code, s.display_name, u.raw_skill_name
       ORDER BY usage_count DESC, u.raw_skill_name ASC
       LIMIT ? OFFSET ?`,
      [...params, pageSize, offset],
    )) as UsageSummaryRow[];
  }

  async aggregateVersionsByRawSkillNames(
    clauses: string[],
    params: unknown[],
    rawSkillNames: string[],
  ): Promise<UsageVersionRow[]> {
    if (rawSkillNames.length === 0) {
      return [];
    }

    const dataSource = await this.mysqlDataSourceManager.getDataSource();
    return (await dataSource.query(
      `SELECT u.raw_skill_name,
              COALESCE(u.observed_version, u.service_version, 'unknown') AS version,
              COUNT(*) AS count_value
       FROM sdd_skill_usages u
       LEFT JOIN sdd_skill_semantics s ON s.id = u.semantic_id
       ${whereSql([...clauses, `u.raw_skill_name IN (${rawSkillNames.map(() => '?').join(',')})`])}
       GROUP BY u.raw_skill_name, version
       ORDER BY count_value DESC, version ASC`,
      [...params, ...rawSkillNames],
    )) as UsageVersionRow[];
  }

  async listUsages(
    clauses: string[],
    params: unknown[],
    limit: number,
  ): Promise<UsageRow[]> {
    const dataSource = await this.mysqlDataSourceManager.getDataSource();
    return (await dataSource.query(
      `SELECT u.id, u.usage_key, s.semantic_code, s.display_name AS semantic_display_name,
              u.raw_skill_name, u.status, u.user_id, u.interaction_id, u.work_item_id,
              u.session_id, u.prompt_id, u.observed_version, u.event_time
       FROM sdd_skill_usages u
       LEFT JOIN sdd_skill_semantics s ON s.id = u.semantic_id
       ${whereSql(clauses)}
       ORDER BY u.id DESC
       LIMIT ?`,
      [...params, limit],
    )) as UsageRow[];
  }

  async listInteractions(
    clauses: string[],
    params: unknown[],
    limit: number,
  ): Promise<InteractionRow[]> {
    const dataSource = await this.mysqlDataSourceManager.getDataSource();
    return (await dataSource.query(
      `SELECT i.id, i.interaction_key, i.status, i.user_id, i.session_id, i.prompt_id,
              i.command_name, i.model, i.started_at, i.completed_at, i.duration_ms,
              i.cost_usd, i.input_tokens, i.output_tokens, i.cache_read_tokens,
              i.cache_creation_tokens, i.llm_call_count, i.tool_call_count,
              i.skill_name, i.agent_name, i.plugin_name, i.query_source, i.effort, i.speed,
              i.pairing_method,
              t.prompt_text, t.response_text
       FROM sdd_interactions i
       LEFT JOIN sdd_interaction_texts t ON t.interaction_id = i.id
       ${whereSql(clauses)}
       ORDER BY i.id DESC
       LIMIT ?`,
      [...params, limit],
    )) as InteractionRow[];
  }

  async getInteractionDetail(interactionId: string): Promise<InteractionDetailRow[]> {
    const dataSource = await this.mysqlDataSourceManager.getDataSource();
    return (await dataSource.query(
      `SELECT i.id, i.interaction_key, i.status, i.user_id, i.session_id, i.prompt_id,
              i.command_name, i.model, i.started_at, i.completed_at, i.duration_ms,
              i.cost_usd, i.input_tokens, i.output_tokens, i.cache_read_tokens,
              i.cache_creation_tokens, i.llm_call_count, i.tool_call_count,
              i.skill_name, i.agent_name, i.plugin_name, i.query_source, i.effort, i.speed,
              i.pairing_method,
              t.prompt_text, t.response_text, t.response_json
       FROM sdd_interactions i
       LEFT JOIN sdd_interaction_texts t ON t.interaction_id = i.id
       WHERE i.id = ?
       LIMIT 1`,
      [interactionId],
    )) as InteractionDetailRow[];
  }

  async listInteractionToolCalls(interactionId: string): Promise<InteractionToolCallRow[]> {
    const dataSource = await this.mysqlDataSourceManager.getDataSource();
    return (await dataSource.query(
      `SELECT id, tool_use_id, tool_name, sequence, decision, decision_source,
              success, duration_ms, input_size_bytes, result_size_bytes,
              error_type, tool_input_preview, mcp_server_scope
       FROM sdd_interaction_tool_calls
       WHERE interaction_id = ?
       ORDER BY sequence ASC, id ASC`,
      [interactionId],
    )) as InteractionToolCallRow[];
  }

  async listErrors(clauses: string[], params: unknown[], limit: number): Promise<ErrorRow[]> {
    const dataSource = await this.mysqlDataSourceManager.getDataSource();
    return (await dataSource.query(
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
      [...params, limit],
    )) as ErrorRow[];
  }

  async listUsers(): Promise<UserRow[]> {
    const dataSource = await this.mysqlDataSourceManager.getDataSource();
    return (await dataSource.query(
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
  }

  async listVersions(): Promise<VersionRow[]> {
    const dataSource = await this.mysqlDataSourceManager.getDataSource();
    return (await dataSource.query(
      `SELECT COALESCE(observed_version, service_version, 'unknown') AS version,
              COUNT(*) AS usage_count,
              COUNT(DISTINCT user_id) AS user_count,
              MAX(event_time) AS latest_at
       FROM sdd_skill_usages
       GROUP BY version
       ORDER BY usage_count DESC, version ASC
       LIMIT 100`,
    )) as VersionRow[];
  }

  async listWorkItems(
    clauses: string[],
    params: unknown[],
    limit: number,
  ): Promise<WorkItemRow[]> {
    const dataSource = await this.mysqlDataSourceManager.getDataSource();
    return (await dataSource.query(
      `SELECT id, work_item_key, requirements_repo_name, business_domain,
              work_item_slug, work_item_title, relative_dir, first_seen_at, last_seen_at
       FROM sdd_work_items
       ${whereSql(clauses)}
       ORDER BY id DESC
       LIMIT ?`,
      [...params, limit],
    )) as WorkItemRow[];
  }

  async getWorkItem(workItemId: string): Promise<WorkItemRow[]> {
    const dataSource = await this.mysqlDataSourceManager.getDataSource();
    return (await dataSource.query(
      `SELECT id, work_item_key, requirements_repo_name, business_domain,
              work_item_slug, work_item_title, relative_dir, first_seen_at, last_seen_at
       FROM sdd_work_items
       WHERE id = ?
       LIMIT 1`,
      [workItemId],
    )) as WorkItemRow[];
  }

  async listWorkItemArtifacts(workItemId: string): Promise<ArtifactRow[]> {
    const dataSource = await this.mysqlDataSourceManager.getDataSource();
    return (await dataSource.query(
      `SELECT id, artifact_type, artifact_relative_path, system_module, last_seen_at
       FROM sdd_work_item_artifacts
       WHERE work_item_id = ?
       ORDER BY id ASC`,
      [workItemId],
    )) as ArtifactRow[];
  }

  async countWorkItemUsages(workItemId: string): Promise<CountRow[]> {
    const dataSource = await this.mysqlDataSourceManager.getDataSource();
    return (await dataSource.query(
      `SELECT COUNT(*) AS count_value FROM sdd_skill_usages WHERE work_item_id = ?`,
      [workItemId],
    )) as CountRow[];
  }

  async countWorkItemErrors(workItemId: string): Promise<CountRow[]> {
    const dataSource = await this.mysqlDataSourceManager.getDataSource();
    return (await dataSource.query(
      `SELECT COUNT(*) AS count_value FROM sdd_errors WHERE work_item_id = ?`,
      [workItemId],
    )) as CountRow[];
  }

  async upsertUserSettings(input: ReportUserSettingsRequest, userKey: string): Promise<void> {
    const dataSource = await this.mysqlDataSourceManager.getDataSource();
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
  }

  async skillAnalyticsKpis(window: ResolvedTimeWindow): Promise<SkillAnalyticsKpiRow[]> {
    const dataSource = await this.mysqlDataSourceManager.getDataSource();
    return (await dataSource.query(
      `SELECT
         (SELECT COUNT(*) FROM sdd_skill_usages u
          WHERE u.event_time >= ? AND u.event_time <= ?) AS skill_usage_count,
         (SELECT COUNT(DISTINCT u.user_id) FROM sdd_skill_usages u
          WHERE u.event_time >= ? AND u.event_time <= ?) AS active_user_count,
         (SELECT COUNT(DISTINCT u.work_item_id) FROM sdd_skill_usages u
          WHERE u.event_time >= ? AND u.event_time <= ?) AS covered_work_item_count,
         (SELECT COUNT(*) FROM sdd_skill_usages u
          WHERE u.event_time >= ? AND u.event_time <= ?
            AND u.invocation_trigger = 'user-slash') AS user_triggered_count,
         (SELECT COUNT(*) FROM sdd_skill_usages u
          WHERE u.event_time >= ? AND u.event_time <= ?
            AND u.invocation_trigger IN ('claude-proactive', 'nested-skill')) AS auto_triggered_count,
         (SELECT COUNT(*) FROM (
            SELECT work_item_id
            FROM sdd_work_item_artifacts
            WHERE artifact_type IN ('proposal', 'design', 'task', 'review')
              AND work_item_id IN (
                SELECT DISTINCT work_item_id
                FROM sdd_work_item_artifacts
                WHERE first_seen_at >= ? AND first_seen_at <= ?
              )
            GROUP BY work_item_id
            HAVING COUNT(DISTINCT artifact_type) >= 3
          ) sub) AS multi_stage_work_item_count`,
      [
        window.from,
        window.to,
        window.from,
        window.to,
        window.from,
        window.to,
        window.from,
        window.to,
        window.from,
        window.to,
        window.from,
        window.to,
      ],
    )) as SkillAnalyticsKpiRow[];
  }

  async skillQualityWithTrigger(window: ResolvedTimeWindow): Promise<SkillQualityAnalyticsRow[]> {
    const dataSource = await this.mysqlDataSourceManager.getDataSource();
    return (await dataSource.query(
      `SELECT
         COUNT(u.id) AS triggered_count,
         (SELECT COUNT(*) FROM sdd_interactions i
          WHERE i.started_at >= ? AND i.started_at <= ?) AS interaction_count,
         SUM(t.prompt_text IS NOT NULL AND t.prompt_text <> '') AS with_prompt_count,
         SUM(t.response_text IS NOT NULL AND t.response_text <> '') AS with_response_count,
         SUM(
           t.prompt_text IS NOT NULL AND t.prompt_text <> ''
           AND t.response_text IS NOT NULL AND t.response_text <> ''
         ) AS paired_count,
         (SELECT COUNT(*) FROM sdd_interactions i
          WHERE i.started_at >= ? AND i.started_at <= ? AND i.status = 'failed') AS failed_count
       FROM sdd_skill_usages u
       LEFT JOIN sdd_interactions i ON i.id = u.interaction_id
       LEFT JOIN sdd_interaction_texts t ON t.interaction_id = i.id
       WHERE u.event_time >= ? AND u.event_time <= ?`,
      [window.from, window.to, window.from, window.to, window.from, window.to],
    )) as SkillQualityAnalyticsRow[];
  }
}
