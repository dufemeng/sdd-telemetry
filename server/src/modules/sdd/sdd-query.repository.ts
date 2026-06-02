import { Inject, Provide } from '@midwayjs/core';
import type { ReportUserSettingsRequest } from '@sdd-telemetry/api';
import { MysqlDataSourceManager } from '../../infrastructure/mysql/data-source-manager';
import { whereSql } from '../query-utils';
import { ROOT_DOMAIN_LABEL } from './wiki-coverage';

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
  skill_usage_id: string | number | null;
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
  is_wiki_recall: string | number | boolean | null;
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
  first_seen_at: Date | string | null;
  last_seen_at: Date | string | null;
  skill_usage_count: string | number;
  interaction_count: string | number;
  work_item_count: string | number;
  semantic_stages_csv: string | null;
}

export interface UserArtifactCountRow {
  user_id: string | number;
  artifact_count: string | number;
}

export interface UserMaturityRow {
  user_id: string | number;
  semantic_code: string;
  first_event_time: Date | string | null;
}

export interface UserSummaryRow {
  turn_count: string | number;
  session_count: string | number;
  wiki_recall_count: string | number;
  artifact_count: string | number;
}

export interface UserWorkItemRow {
  work_item_id: string | number;
  work_item_title: string | null;
  stage_codes_csv: string | null;
  last_activity_at: Date | string | null;
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
  artifact_count: number | string;
  usage_count: number | string;
  error_count: number | string;
  coverage_stages_json: string;
}

export interface ArtifactRow {
  id: string | number;
  artifact_type: string;
  artifact_relative_path: string;
  system_module: string | null;
  last_seen_at: Date | string | null;
}

export interface ArtifactWriteRow {
  id: string | number;
  node_kind: string;
  write_kind: string | null;
  event_time: Date | string | null;
  event_sequence: number | null;
  interaction_id: string | number | null;
  content_preview: string | null;
  raw_skill_name: string | null;
  skill_semantic_code: string | null;
  skill_display_name: string | null;
  prompt_text: string | null;
  wiki_recall_count: string | number;
}

export interface WorkItemSummaryRow {
  turn_count: string | number;
  session_count: string | number;
  contributor_count: string | number;
  wiki_recall_count: string | number;
}

export interface WikiRecallUserRankingRow {
  userId: string | number;
  userName: string | null;
  hasWikiRootPath: string | number | boolean;
  totalRecalls: string | number;
  distinctFiles: string | number;
  distinctDomains: string | number;
  distinctSystems: string | number;
  lastRecallAt: Date | string | null;
}

export interface WikiRecallWorkItemRankingRow {
  workItemId: string | number;
  workItemSlug: string;
  businessDomain: string | null;
  totalRecalls: string | number;
  distinctDomains: string | number;
  distinctSystems: string | number;
  userCount: string | number;
}

export interface WikiRecallHeatmapBucketRow {
  key: string;
  totalRecalls: string | number;
  distinctUsers: string | number;
}

export interface WikiRecallTimelinePointRow {
  t: string;
  group: string | null;
  count: string | number;
}

export interface WikiRecallListRow {
  id: string | number;
  toolCallId: string | number;
  interactionId: string | number;
  skillUsageId: string | number | null;
  workItemId: string | number | null;
  userId: string | number | null;
  userName: string | null;
  actionType: string;
  rawPath: string;
  wikiRelativePath: string | null;
  wikiDomain: string | null;
  wikiAxis: string | null;
  wikiSystem: string | null;
  eventSequence: string | number | null;
  eventTime: Date | string | null;
}

export interface WikiRecallContentSourceRow {
  raw_path: string;
  wiki_relative_path: string | null;
  action_type: string;
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
      `SELECT tc.id, tc.tool_use_id, tc.skill_usage_id, tc.tool_name, tc.sequence,
              tc.decision, tc.decision_source, tc.success, tc.duration_ms,
              tc.input_size_bytes, tc.result_size_bytes, tc.error_type,
              tc.tool_input_preview, tc.mcp_server_scope,
              EXISTS (
                SELECT 1 FROM sdd_wiki_recalls wr WHERE wr.tool_call_id = tc.id LIMIT 1
              ) AS is_wiki_recall
       FROM sdd_interaction_tool_calls tc
       WHERE tc.interaction_id = ?
       ORDER BY tc.sequence ASC, tc.id ASC`,
      [interactionId],
    )) as InteractionToolCallRow[];
  }

  async findWikiRecallForContent(toolCallId: string): Promise<WikiRecallContentSourceRow | null> {
    const dataSource = await this.mysqlDataSourceManager.getDataSource();
    const rows = (await dataSource.query(
      `SELECT raw_path, wiki_relative_path, action_type
       FROM sdd_wiki_recalls
       WHERE tool_call_id = ?
       ORDER BY id ASC
       LIMIT 1`,
      [toolCallId],
    )) as WikiRecallContentSourceRow[];
    return rows[0] ?? null;
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
              u.requirements_root_path, u.wiki_root_path,
              u.first_seen_at, u.last_seen_at,
              COUNT(DISTINCT su.id)                    AS skill_usage_count,
              COUNT(DISTINCT i.id)                     AS interaction_count,
              COUNT(DISTINCT su.work_item_id)          AS work_item_count,
              GROUP_CONCAT(DISTINCT ss.semantic_code)  AS semantic_stages_csv
       FROM sdd_users u
       LEFT JOIN sdd_skill_usages su   ON su.user_id   = u.id
       LEFT JOIN sdd_interactions i    ON i.user_id    = u.id
       LEFT JOIN sdd_skill_semantics ss ON ss.id       = su.semantic_id
       GROUP BY u.id, u.user_key, u.install_id, u.user_name, u.machine_id, u.machine_name,
                u.requirements_root_path, u.wiki_root_path, u.first_seen_at, u.last_seen_at
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
      `SELECT
         wi.id, wi.work_item_key, wi.requirements_repo_name, wi.business_domain,
         wi.work_item_slug, wi.work_item_title, wi.relative_dir,
         wi.first_seen_at, wi.last_seen_at,
         COALESCE(a.artifact_count, 0)     AS artifact_count,
         COALESCE(u.usage_count, 0)        AS usage_count,
         COALESCE(e.error_count, 0)        AS error_count,
         COALESCE(a.coverage_stages, '')   AS coverage_stages_json
       FROM sdd_work_items wi
       LEFT JOIN (
         SELECT work_item_id,
                COUNT(*)                                  AS artifact_count,
                GROUP_CONCAT(DISTINCT artifact_type)      AS coverage_stages
         FROM sdd_work_item_artifacts
         GROUP BY work_item_id
       ) a ON a.work_item_id = wi.id
       LEFT JOIN (
         SELECT work_item_id, COUNT(*) AS usage_count
         FROM sdd_skill_usages
         GROUP BY work_item_id
       ) u ON u.work_item_id = wi.id
       LEFT JOIN (
         SELECT work_item_id, COUNT(*) AS error_count
         FROM sdd_errors
         GROUP BY work_item_id
       ) e ON e.work_item_id = wi.id
       ${whereSql(clauses)}
       ORDER BY wi.id DESC
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

  async listArtifactWrites(
    workItemId: string,
    artifactId: string,
  ): Promise<ArtifactWriteRow[]> {
    const dataSource = await this.mysqlDataSourceManager.getDataSource();
    return (await dataSource.query(
      `SELECT timeline.* FROM (
         SELECT w.id, 'write' AS node_kind, w.write_kind, w.event_time, w.event_sequence,
                w.interaction_id, w.content_preview, su.raw_skill_name,
                sem.semantic_code AS skill_semantic_code, sem.display_name AS skill_display_name,
                it.prompt_text,
                (SELECT COUNT(*) FROM sdd_wiki_recalls wr WHERE wr.interaction_id = w.interaction_id) AS wiki_recall_count
         FROM sdd_work_item_artifact_writes w
         LEFT JOIN sdd_skill_usages su ON su.id = w.skill_usage_id
         LEFT JOIN sdd_skill_semantics sem ON sem.id = su.semantic_id
         LEFT JOIN sdd_interaction_texts it ON it.interaction_id = w.interaction_id
         WHERE w.work_item_id = ? AND w.artifact_id = ?
         UNION ALL
         SELECT t.id, 'discussion' AS node_kind, NULL AS write_kind, t.event_time,
                NULL AS event_sequence, t.interaction_id, NULL AS content_preview, su.raw_skill_name,
                sem.semantic_code AS skill_semantic_code, sem.display_name AS skill_display_name,
                it.prompt_text,
                (SELECT COUNT(*) FROM sdd_wiki_recalls wr WHERE wr.interaction_id = t.interaction_id) AS wiki_recall_count
         FROM sdd_work_item_artifact_turns t
         LEFT JOIN sdd_skill_usages su ON su.id = t.skill_usage_id
         LEFT JOIN sdd_skill_semantics sem ON sem.id = su.semantic_id
         LEFT JOIN sdd_interaction_texts it ON it.interaction_id = t.interaction_id
         WHERE t.work_item_id = ? AND t.artifact_id = ?
       ) timeline
       ORDER BY timeline.event_time IS NULL, timeline.event_time ASC,
                FIELD(timeline.node_kind, 'discussion', 'write'), timeline.id ASC`,
      [workItemId, artifactId, workItemId, artifactId],
    )) as ArtifactWriteRow[];
  }

  async getWorkItemSummary(workItemId: string): Promise<WorkItemSummaryRow[]> {
    const dataSource = await this.mysqlDataSourceManager.getDataSource();
    return (await dataSource.query(
      `SELECT
          (SELECT COUNT(DISTINCT interaction_id) FROM sdd_skill_usages
             WHERE work_item_id = ? AND interaction_id IS NOT NULL) AS turn_count,
          (SELECT COUNT(DISTINCT session_id) FROM sdd_skill_usages
             WHERE work_item_id = ? AND session_id IS NOT NULL) AS session_count,
          (SELECT COUNT(DISTINCT user_id) FROM sdd_skill_usages
             WHERE work_item_id = ? AND user_id IS NOT NULL) AS contributor_count,
          (SELECT COUNT(*) FROM sdd_wiki_recalls wr
             LEFT JOIN sdd_skill_usages su ON su.id = wr.skill_usage_id
             WHERE COALESCE(wr.work_item_id, su.work_item_id) = ?) AS wiki_recall_count`,
      [workItemId, workItemId, workItemId, workItemId],
    )) as WorkItemSummaryRow[];
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

  async listWikiRecallUserRanking(
    rangeSinceDate: Date | null,
    sortBy: 'total' | 'distinct_files' | 'recent',
    limit: number,
    offset: number,
  ): Promise<{ items: WikiRecallUserRankingRow[]; total: string | number }> {
    const dataSource = await this.mysqlDataSourceManager.getDataSource();
    const whereTime = rangeSinceDate ? 'AND wr.event_time >= ?' : '';
    const params = rangeSinceDate ? [rangeSinceDate] : [];
    const orderBy =
      sortBy === 'distinct_files'
        ? 'distinctFiles DESC'
        : sortBy === 'recent'
          ? 'lastRecallAt DESC'
          : 'totalRecalls DESC';

    const items = (await dataSource.query(
      `SELECT u.id AS userId, u.user_name AS userName,
              (u.wiki_root_path IS NOT NULL) AS hasWikiRootPath,
              COUNT(wr.id) AS totalRecalls,
              COUNT(DISTINCT CASE WHEN wr.action_type = 'read' THEN wr.wiki_relative_path END) AS distinctFiles,
              COUNT(DISTINCT wr.wiki_domain) AS distinctDomains,
              COUNT(DISTINCT wr.wiki_system) AS distinctSystems,
              MAX(wr.event_time) AS lastRecallAt
       FROM sdd_users u
       LEFT JOIN sdd_wiki_recalls wr ON wr.user_id = u.id ${whereTime}
       GROUP BY u.id
       HAVING totalRecalls > 0
       ORDER BY ${orderBy}
       LIMIT ? OFFSET ?`,
      [...params, limit, offset],
    )) as WikiRecallUserRankingRow[];

    const totalRows = (await dataSource.query(
      `SELECT COUNT(DISTINCT wr.user_id) AS total
       FROM sdd_wiki_recalls wr
       WHERE wr.user_id IS NOT NULL ${whereTime}`,
      params,
    )) as Array<{ total: string | number }>;

    return { items, total: totalRows[0]?.total ?? 0 };
  }

  async listWikiRecallWorkItemRanking(
    rangeSinceDate: Date | null,
    wikiDomain: string | null,
    userId: string | null,
    limit: number,
    offset: number,
  ): Promise<{ items: WikiRecallWorkItemRankingRow[]; total: string | number }> {
    const dataSource = await this.mysqlDataSourceManager.getDataSource();
    const effectiveWorkItemIdSql = 'COALESCE(wr.work_item_id, su.work_item_id)';
    const clauses: string[] = [`${effectiveWorkItemIdSql} IS NOT NULL`];
    const params: unknown[] = [];
    if (rangeSinceDate) {
      clauses.push('wr.event_time >= ?');
      params.push(rangeSinceDate);
    }
    if (wikiDomain === ROOT_DOMAIN_LABEL) {
      // 根目录文档（库根、非 domain-* 目录）召回记录的 wiki_domain 落库为 NULL
      clauses.push('wr.wiki_domain IS NULL');
    } else if (wikiDomain) {
      clauses.push('wr.wiki_domain = ?');
      params.push(wikiDomain);
    }
    if (userId) {
      clauses.push('wr.user_id = ?');
      params.push(userId);
    }
    const where = clauses.join(' AND ');

    const items = (await dataSource.query(
      `SELECT wi.id AS workItemId, wi.work_item_slug AS workItemSlug,
              wi.business_domain AS businessDomain,
              COUNT(wr.id) AS totalRecalls,
              COUNT(DISTINCT wr.wiki_domain) AS distinctDomains,
              COUNT(DISTINCT wr.wiki_system) AS distinctSystems,
              COUNT(DISTINCT wr.user_id) AS userCount
       FROM sdd_wiki_recalls wr
       LEFT JOIN sdd_skill_usages su ON su.id = wr.skill_usage_id
       JOIN sdd_work_items wi ON wi.id = ${effectiveWorkItemIdSql}
       WHERE ${where}
       GROUP BY wi.id
       ORDER BY totalRecalls DESC
       LIMIT ? OFFSET ?`,
      [...params, limit, offset],
    )) as WikiRecallWorkItemRankingRow[];

    const totalRows = (await dataSource.query(
      `SELECT COUNT(DISTINCT ${effectiveWorkItemIdSql}) AS total
       FROM sdd_wiki_recalls wr
       LEFT JOIN sdd_skill_usages su ON su.id = wr.skill_usage_id
       JOIN sdd_work_items wi ON wi.id = ${effectiveWorkItemIdSql}
       WHERE ${where}`,
      params,
    )) as Array<{ total: string | number }>;

    return { items, total: totalRows[0]?.total ?? 0 };
  }

  async wikiRecallHeatmap(
    rangeSinceDate: Date | null,
    groupBy: 'domain' | 'axis' | 'system',
  ): Promise<WikiRecallHeatmapBucketRow[]> {
    const dataSource = await this.mysqlDataSourceManager.getDataSource();
    const columnName =
      groupBy === 'domain' ? 'wiki_domain' : groupBy === 'axis' ? 'wiki_axis' : 'wiki_system';
    const whereTime = rangeSinceDate ? 'AND event_time >= ?' : '';
    const params = rangeSinceDate ? [rangeSinceDate] : [];

    return (await dataSource.query(
      `SELECT ${columnName} AS \`key\`,
              COUNT(*) AS totalRecalls,
              COUNT(DISTINCT user_id) AS distinctUsers
       FROM sdd_wiki_recalls
       WHERE action_type = 'read' AND ${columnName} IS NOT NULL ${whereTime}
       GROUP BY ${columnName}
       ORDER BY totalRecalls DESC
       LIMIT 50`,
      params,
    )) as WikiRecallHeatmapBucketRow[];
  }

  async wikiRecallTimeline(
    rangeSinceDate: Date | null,
    granularity: 'day' | 'hour',
    groupBy: 'domain' | 'axis',
    wikiDomain?: string | null,
  ): Promise<WikiRecallTimelinePointRow[]> {
    const dataSource = await this.mysqlDataSourceManager.getDataSource();
    const dateFormat =
      granularity === 'day'
        ? "DATE_FORMAT(event_time, '%Y-%m-%dT00:00:00.000Z')"
        : "DATE_FORMAT(event_time, '%Y-%m-%dT%H:00:00.000Z')";
    const columnName = groupBy === 'domain' ? 'wiki_domain' : 'wiki_axis';
    const clauses: string[] = ['event_time IS NOT NULL'];
    const params: unknown[] = [];
    if (rangeSinceDate) {
      clauses.push('event_time >= ?');
      params.push(rangeSinceDate);
    }
    if (wikiDomain === ROOT_DOMAIN_LABEL) {
      clauses.push('wiki_domain IS NULL');
    } else if (wikiDomain) {
      clauses.push('wiki_domain = ?');
      params.push(wikiDomain);
    }
    const where = clauses.join(' AND ');

    return (await dataSource.query(
      `SELECT ${dateFormat} AS t, ${columnName} AS \`group\`, COUNT(*) AS count
       FROM sdd_wiki_recalls
       WHERE ${where}
       GROUP BY t, \`group\`
       ORDER BY t ASC`,
      params,
    )) as WikiRecallTimelinePointRow[];
  }

  async listWikiRecallDocDetailTrend(
    relativePath: string,
    sinceDate: Date | null,
  ): Promise<Array<{ t: string; count: string | number }>> {
    const dataSource = await this.mysqlDataSourceManager.getDataSource();
    const clauses = ['wiki_relative_path = ?', 'event_time IS NOT NULL'];
    const params: unknown[] = [relativePath];
    if (sinceDate) {
      clauses.push('event_time >= ?');
      params.push(sinceDate);
    }
    const where = clauses.join(' AND ');
    return (await dataSource.query(
      `SELECT DATE_FORMAT(event_time, '%Y-%m-%dT00:00:00.000Z') AS t, COUNT(*) AS count
       FROM sdd_wiki_recalls
       WHERE ${where}
       GROUP BY t
       ORDER BY t ASC`,
      params,
    )) as Array<{ t: string; count: string | number }>;
  }

  async listWikiRecallDocDetailReaders(
    relativePath: string,
  ): Promise<
    Array<{
      userId: string | number;
      userName: string | null;
      recallCount: string | number;
      lastRecallAt: Date | string | null;
    }>
  > {
    const dataSource = await this.mysqlDataSourceManager.getDataSource();
    return (await dataSource.query(
      `SELECT wr.user_id AS userId, u.user_name AS userName,
              COUNT(*) AS recallCount, MAX(wr.event_time) AS lastRecallAt
       FROM sdd_wiki_recalls wr
       LEFT JOIN sdd_users u ON u.id = wr.user_id
       WHERE wr.wiki_relative_path = ? AND wr.user_id IS NOT NULL
       GROUP BY wr.user_id
       ORDER BY recallCount DESC`,
      [relativePath],
    )) as Array<{
      userId: string | number;
      userName: string | null;
      recallCount: string | number;
      lastRecallAt: Date | string | null;
    }>;
  }

  async listWikiRecallDocDetailSourceWorkItems(
    relativePath: string,
  ): Promise<
    Array<{
      workItemId: string | number;
      workItemSlug: string;
      businessDomain: string | null;
      recallCount: string | number;
    }>
  > {
    const dataSource = await this.mysqlDataSourceManager.getDataSource();
    return (await dataSource.query(
      `SELECT wi.id AS workItemId, wi.work_item_slug AS workItemSlug,
              wi.business_domain AS businessDomain,
              COUNT(*) AS recallCount
       FROM sdd_wiki_recalls wr
       LEFT JOIN sdd_skill_usages su ON su.id = wr.skill_usage_id
       JOIN sdd_work_items wi ON wi.id = COALESCE(wr.work_item_id, su.work_item_id)
       WHERE wr.wiki_relative_path = ?
       GROUP BY wi.id
       ORDER BY recallCount DESC`,
      [relativePath],
    )) as Array<{
      workItemId: string | number;
      workItemSlug: string;
      businessDomain: string | null;
      recallCount: string | number;
    }>;
  }

  async listWikiRecalls(
    filters: { workItemId?: string; userId?: string; skillUsageId?: string },
    rangeSinceDate: Date | null,
    limit: number,
    offset: number,
  ): Promise<{ items: WikiRecallListRow[]; total: string | number }> {
    const dataSource = await this.mysqlDataSourceManager.getDataSource();
    const clauses: string[] = [];
    const params: unknown[] = [];
    if (filters.workItemId) {
      clauses.push('COALESCE(wr.work_item_id, su.work_item_id) = ?');
      params.push(filters.workItemId);
    }
    if (filters.userId) {
      clauses.push('wr.user_id = ?');
      params.push(filters.userId);
    }
    if (filters.skillUsageId) {
      clauses.push('wr.skill_usage_id = ?');
      params.push(filters.skillUsageId);
    }
    if (rangeSinceDate) {
      clauses.push('wr.event_time >= ?');
      params.push(rangeSinceDate);
    }
    const where = whereSql(clauses);

    const items = (await dataSource.query(
      `SELECT wr.id, wr.tool_call_id AS toolCallId, wr.interaction_id AS interactionId,
              wr.skill_usage_id AS skillUsageId,
              COALESCE(wr.work_item_id, su.work_item_id) AS workItemId,
              wr.user_id AS userId, u.user_name AS userName, wr.action_type AS actionType,
              wr.raw_path AS rawPath, wr.wiki_relative_path AS wikiRelativePath,
              wr.wiki_domain AS wikiDomain, wr.wiki_axis AS wikiAxis, wr.wiki_system AS wikiSystem,
              wr.event_sequence AS eventSequence, wr.event_time AS eventTime
       FROM sdd_wiki_recalls wr
       LEFT JOIN sdd_skill_usages su ON su.id = wr.skill_usage_id
       LEFT JOIN sdd_users u ON u.id = wr.user_id
       ${where}
       ORDER BY wr.id DESC
       LIMIT ? OFFSET ?`,
      [...params, limit, offset],
    )) as WikiRecallListRow[];

    const totalRows = (await dataSource.query(
      `SELECT COUNT(*) AS total
       FROM sdd_wiki_recalls wr
       LEFT JOIN sdd_skill_usages su ON su.id = wr.skill_usage_id
       ${where}`,
      params,
    )) as Array<{ total: string | number }>;

    return { items, total: totalRows[0]?.total ?? 0 };
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

  async aggregateRecallPaths(): Promise<
    Array<{
      raw_path: string;
      wiki_relative_path: string;
      recalls: number;
      users: number;
      last_at: string | null;
    }>
  > {
    const dataSource = await this.mysqlDataSourceManager.getDataSource();
    return dataSource.query(`
      SELECT MIN(raw_path) AS raw_path,
             wiki_relative_path,
             COUNT(*) AS recalls,
             COUNT(DISTINCT user_id) AS users,
             MAX(event_time) AS last_at
      FROM sdd_wiki_recalls
      WHERE action_type = 'read' AND wiki_relative_path IS NOT NULL AND wiki_relative_path <> ''
      GROUP BY wiki_relative_path
    `);
  }

  async aggregateRecallDistinctUsers(): Promise<
    Array<{
      wiki_domain: string | null;
      repo: string;
      distinct_users: number;
    }>
  > {
    const dataSource = await this.mysqlDataSourceManager.getDataSource();
    return dataSource.query(`
      SELECT wiki_domain,
             CASE
               WHEN raw_path LIKE '%bk-fe-knowledge-trade%' THEN 'trade'
               WHEN raw_path LIKE '%bk-fe-knowledge-loan%' THEN 'loan'
               WHEN raw_path LIKE '%bk-fe-knowledge-wealth%' THEN 'wealth'
               ELSE 'unknown'
             END AS repo,
             COUNT(DISTINCT user_id) AS distinct_users
      FROM sdd_wiki_recalls
      WHERE action_type = 'read' AND wiki_relative_path IS NOT NULL AND wiki_relative_path <> ''
      GROUP BY wiki_domain, repo
    `);
  }

  async aggregateRecallRepoDistinctUsers(): Promise<
    Array<{
      repo: string;
      distinct_users: number;
    }>
  > {
    const dataSource = await this.mysqlDataSourceManager.getDataSource();
    return dataSource.query(`
      SELECT CASE
               WHEN raw_path LIKE '%bk-fe-knowledge-trade%' THEN 'trade'
               WHEN raw_path LIKE '%bk-fe-knowledge-loan%' THEN 'loan'
               WHEN raw_path LIKE '%bk-fe-knowledge-wealth%' THEN 'wealth'
               ELSE 'unknown'
             END AS repo,
             COUNT(DISTINCT user_id) AS distinct_users
      FROM sdd_wiki_recalls
      WHERE action_type = 'read' AND wiki_relative_path IS NOT NULL AND wiki_relative_path <> ''
      GROUP BY repo
    `);
  }

  async listDomainDocRecalls(
    domain: string,
  ): Promise<
    Array<{
      raw_path: string;
      wiki_relative_path: string;
      recalls: number;
      users: number;
      last_at: string | null;
      last_tool_call_id: string | null;
    }>
  > {
    const dataSource = await this.mysqlDataSourceManager.getDataSource();
    return dataSource.query(
      `SELECT MIN(r.raw_path) AS raw_path,
              r.wiki_relative_path,
              COUNT(*) AS recalls,
              COUNT(DISTINCT r.user_id) AS users,
              MAX(r.event_time) AS last_at,
              SUBSTRING_INDEX(GROUP_CONCAT(r.tool_call_id ORDER BY r.event_time DESC), ',', 1) AS last_tool_call_id
       FROM sdd_wiki_recalls r
       WHERE r.action_type = 'read' AND r.wiki_domain = ? AND r.wiki_relative_path IS NOT NULL
       GROUP BY r.wiki_relative_path`,
      [domain],
    );
  }

  async listUserArtifactCounts(): Promise<UserArtifactCountRow[]> {
    const dataSource = await this.mysqlDataSourceManager.getDataSource();
    return (await dataSource.query(
      `SELECT su.user_id, COUNT(DISTINCT a.id) AS artifact_count
       FROM sdd_skill_usages su
       JOIN sdd_work_item_artifacts a ON a.work_item_id = su.work_item_id
       WHERE su.user_id IS NOT NULL
       GROUP BY su.user_id`,
    )) as UserArtifactCountRow[];
  }

  async listUserMaturityAll(): Promise<UserMaturityRow[]> {
    const dataSource = await this.mysqlDataSourceManager.getDataSource();
    return (await dataSource.query(
      `SELECT su.user_id, ss.semantic_code, MIN(su.event_time) AS first_event_time
       FROM sdd_skill_usages su
       JOIN sdd_skill_semantics ss ON ss.id = su.semantic_id
       WHERE su.user_id IS NOT NULL AND su.event_time IS NOT NULL
       GROUP BY su.user_id, ss.semantic_code`,
    )) as UserMaturityRow[];
  }

  async getUserMaturity(userId: string): Promise<UserMaturityRow[]> {
    const dataSource = await this.mysqlDataSourceManager.getDataSource();
    return (await dataSource.query(
      `SELECT su.user_id, ss.semantic_code, MIN(su.event_time) AS first_event_time
       FROM sdd_skill_usages su
       JOIN sdd_skill_semantics ss ON ss.id = su.semantic_id
       WHERE su.user_id = ? AND su.event_time IS NOT NULL
       GROUP BY su.user_id, ss.semantic_code`,
      [userId],
    )) as UserMaturityRow[];
  }

  async getUserSummary(userId: string): Promise<UserSummaryRow[]> {
    const dataSource = await this.mysqlDataSourceManager.getDataSource();
    return (await dataSource.query(
      `SELECT
         (SELECT COUNT(DISTINCT interaction_id) FROM sdd_skill_usages
            WHERE user_id = ? AND interaction_id IS NOT NULL) AS turn_count,
         (SELECT COUNT(DISTINCT session_id) FROM sdd_skill_usages
            WHERE user_id = ? AND session_id IS NOT NULL) AS session_count,
         (SELECT COUNT(*) FROM sdd_wiki_recalls WHERE user_id = ?) AS wiki_recall_count,
         (SELECT COUNT(DISTINCT a.id) FROM sdd_skill_usages su
            JOIN sdd_work_item_artifacts a ON a.work_item_id = su.work_item_id
            WHERE su.user_id = ?) AS artifact_count`,
      [userId, userId, userId, userId],
    )) as UserSummaryRow[];
  }

  async listUserWorkItems(userId: string): Promise<UserWorkItemRow[]> {
    const dataSource = await this.mysqlDataSourceManager.getDataSource();
    return (await dataSource.query(
      `SELECT wi.id AS work_item_id,
              wi.work_item_title,
              GROUP_CONCAT(DISTINCT ss.semantic_code) AS stage_codes_csv,
              MAX(su.event_time) AS last_activity_at
       FROM sdd_skill_usages su
       JOIN sdd_work_items wi ON wi.id = su.work_item_id
       LEFT JOIN sdd_skill_semantics ss ON ss.id = su.semantic_id
       WHERE su.user_id = ? AND su.work_item_id IS NOT NULL
       GROUP BY wi.id, wi.work_item_title
       ORDER BY MAX(su.event_time) DESC, wi.id DESC
       LIMIT 100`,
      [userId],
    )) as UserWorkItemRow[];
  }
}
