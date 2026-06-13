import { Config, Inject, Provide } from '@midwayjs/core';
import { normalizeProfilePresentation } from '@sdd-telemetry/api';
import type {
  ProfileArtifactTimelineItem,
  ProfileCapabilityAnalytics,
  ProfileCapabilityTimeseries,
  ProfileCapabilityTimeseriesQuery,
  ProfileCapabilityUsageItem,
  ProfileCapabilityUsageSummaryItem,
  ProfileCapabilityUsagesQuery,
  ProfileCapabilityUsageSummaryQuery,
  ProfileDemand,
  ProfileDemandArtifact,
  ProfileDemandDetail,
  ProfileKnowledgeCoverageDomain,
  ProfileKnowledgeCoverageRepo,
  ProfileKnowledgeCoverageResponse,
  ProfileKnowledgeRecallItem,
  ProfileKnowledgeTimelinePoint,
  ProfileOverview,
  ProfileOverviewQuery,
  ProfilePresentation,
  ProfileInspectorFactCounts,
  ProfileInspectorMatchCounts,
  ProfileInspectorProjectionJob,
  ProfileInspectorProjectionRun,
  ProfileUserDeliveryUnit,
  ProfileUserActivityItem,
  ProfileUserDetail,
  ProfileUserItem,
  ProfileUserMaturity,
  ProfileUserMaturityStage,
  ProfileUserSummary,
  ProfileUsersQuery,
} from '@sdd-telemetry/api';
import { MysqlDataSourceManager } from '../../infrastructure/mysql/data-source-manager';
import { addTimeRangeWhere, toIsoDate, toNumber, toStringId, whereSql } from '../query-utils';
import {
  collapseProfileUserActivityItems,
  expandProfileUserActivityFetchLimit,
  type ProfileUserActivityFactItem,
} from './profile-user-activity';

/**
 * profile_projection 读路径（MVP-1，Task 17）。
 * 只读 current pointer 指向的 completed run；基础概览按 profile_* 通用事实聚合。
 */

const DAY_MS = 86_400_000;
const ROOT_DOMAIN_LABEL = '（根目录）';

interface CountRow {
  v: number | string | null;
}

interface KnowledgeTimelineOptions {
  rangeSinceDate: Date | null;
  granularity: 'day' | 'hour';
  groupBy: 'domain' | 'axis';
  wikiDomain?: string | null;
}

interface KnowledgeFilterOptions {
  rangeSinceDate?: Date | null;
  wikiDomain?: string | null;
  userId?: string | null;
}

interface UserActivityOptions {
  deliveryUnitId?: string | null;
  rangeSinceDate?: Date | null;
  limit: number;
}

export interface ProfileProjectionInspector {
  currentRun: ProfileInspectorProjectionRun | null;
  latestRun: ProfileInspectorProjectionRun | null;
  counts: ProfileInspectorFactCounts;
  job: ProfileInspectorProjectionJob | null;
  matchCounts: ProfileInspectorMatchCounts;
}

@Provide('profileProjectionRepository')
export class ProfileProjectionRepository {
  @Inject('mysqlDataSourceManager')
  mysqlDataSourceManager!: MysqlDataSourceManager;

  /** 用户状态/新增阈值复用统一配置，不在 repository 里硬编码（对齐旧 userAnalysis 口径）。 */
  @Config('userAnalysis')
  userAnalysis!: { coldDays: number; churnDays: number; newDays: number };

  /**
   * 当前可读 run id；无指针、或指针指向的 run 非 completed 时返回 null（调用方回退 legacy）。
   * runner 只在 completed 同事务里切 pointer，正常不会指向非 completed；这里 join runs 表
   * 多一道读侧硬防线，防手工改表 / 未来新写入路径。
   */
  async getCurrentRunId(profileId: string): Promise<number | null> {
    const dataSource = await this.mysqlDataSourceManager.getDataSource();
    const rows = (await dataSource.query(
      `SELECT c.current_projection_run_id AS v
       FROM profile_current_projection_runs c
       JOIN profile_projection_runs r
         ON r.id = c.current_projection_run_id AND r.status = 'completed'
       WHERE c.profile_id = ?`,
      [profileId],
    )) as CountRow[];
    const value = rows[0]?.v;
    return value == null ? null : Number(value);
  }

  async getInspector(profileId: string): Promise<ProfileProjectionInspector> {
    const dataSource = await this.mysqlDataSourceManager.getDataSource();
    const [currentRows, latestRows] = await Promise.all([
      dataSource.query(
        `SELECT r.id, r.profile_config_version_id, r.run_type, r.status, r.started_at, r.completed_at,
                r.projection_definition_hash, r.resolved_config_hash, r.stats_json, r.error_message
         FROM profile_current_projection_runs c
         JOIN profile_projection_runs r
           ON r.id = c.current_projection_run_id
         WHERE c.profile_id = ?
         LIMIT 1`,
        [profileId],
      ) as Promise<Array<Record<string, unknown>>>,
      dataSource.query(
        `SELECT r.id, r.profile_config_version_id, r.run_type, r.status, r.started_at, r.completed_at,
                r.projection_definition_hash, r.resolved_config_hash, r.stats_json, r.error_message
         FROM profile_projection_runs r
         WHERE r.profile_id = ?
         ORDER BY r.id DESC
         LIMIT 1`,
        [profileId],
      ) as Promise<Array<Record<string, unknown>>>,
    ]);

    const currentRun = currentRows[0] ? toProjectionRun(currentRows[0]) : null;
    const latestRun = latestRows[0] ? toProjectionRun(latestRows[0]) : null;
    const currentConfigVersionId = currentRun?.profileConfigVersionId ?? null;
    const [counts, job, matchCounts] = await Promise.all([
      currentRun ? this.getFactCounts(profileId, Number(currentRun.id)) : emptyFactCounts(),
      this.getProjectionJob(profileId),
      this.getMatchCounts(profileId, currentConfigVersionId),
    ]);
    return { currentRun, latestRun, counts, job, matchCounts };
  }

  private async getProjectionJob(profileId: string): Promise<ProfileInspectorProjectionJob | null> {
    const dataSource = await this.mysqlDataSourceManager.getDataSource();
    const rows = (await dataSource.query(
      `SELECT target_config_version_id, status, dirty_seq, dirty_reason, attempts, max_attempts,
              locked_by, locked_until, last_started_at, last_completed_at, last_projection_run_id,
              last_profile_config_version_id, last_resolved_config_hash, last_error
       FROM profile_projection_jobs
       WHERE profile_id = ?
       LIMIT 1`,
      [profileId],
    )) as Array<Record<string, unknown>>;
    const row = rows[0];
    if (!row) return null;
    return {
      targetConfigVersionId: row.target_config_version_id == null ? null : toStringId(row.target_config_version_id),
      status: String(row.status ?? ''),
      dirtySeq: toNumber(row.dirty_seq),
      dirtyReason: (row.dirty_reason as string | null) ?? null,
      attempts: toNumber(row.attempts),
      maxAttempts: toNumber(row.max_attempts),
      lockedBy: (row.locked_by as string | null) ?? null,
      lockedUntil: toIsoDate(row.locked_until),
      lastStartedAt: toIsoDate(row.last_started_at),
      lastCompletedAt: toIsoDate(row.last_completed_at),
      lastProjectionRunId: row.last_projection_run_id == null ? null : toStringId(row.last_projection_run_id),
      lastProfileConfigVersionId: row.last_profile_config_version_id == null ? null : toStringId(row.last_profile_config_version_id),
      lastResolvedConfigHash: (row.last_resolved_config_hash as string | null) ?? null,
      lastError: (row.last_error as string | null) ?? null,
    };
  }

  private async getMatchCounts(
    profileId: string,
    profileConfigVersionId: string | null,
  ): Promise<ProfileInspectorMatchCounts> {
    const dataSource = await this.mysqlDataSourceManager.getDataSource();
    const versionClause = profileConfigVersionId ? ' AND profile_config_version_id = ?' : '';
    const params = profileConfigVersionId ? [profileId, profileConfigVersionId] : [profileId];
    const rows = (await dataSource.query(
      `SELECT COUNT(*) AS v
       FROM profile_source_matches
       WHERE profile_id = ?${versionClause}`,
      params,
    )) as CountRow[];
    return { sourceMatches: toNumber(rows[0]?.v) };
  }

  private async getFactCounts(profileId: string, runId: number): Promise<ProfileInspectorFactCounts> {
    const dataSource = await this.mysqlDataSourceManager.getDataSource();
    const count = async (table: string): Promise<number> => {
      const rows = (await dataSource.query(
        `SELECT COUNT(*) AS v
         FROM \`${table}\`
         WHERE profile_id = ? AND projection_run_id = ?`,
        [profileId, runId],
      )) as CountRow[];
      return toNumber(rows[0]?.v);
    };

    const [
      deliveryUnits,
      artifacts,
      artifactWrites,
      artifactTurns,
      capabilityUsages,
      knowledgeRecalls,
      codeActivities,
    ] = await Promise.all([
      count('profile_delivery_units'),
      count('profile_artifacts'),
      count('profile_artifact_writes'),
      count('profile_artifact_turns'),
      count('profile_capability_usages'),
      count('profile_knowledge_recalls'),
      count('profile_code_activities'),
    ]);

    return {
      deliveryUnits,
      artifacts,
      artifactWrites,
      artifactTurns,
      capabilityUsages,
      knowledgeRecalls,
      codeActivities,
    };
  }

  async getOverview(
    profileId: string,
    runId: number,
    query: ProfileOverviewQuery,
  ): Promise<ProfileOverview> {
    const dataSource = await this.mysqlDataSourceManager.getDataSource();
    const count = async (table: string, column: string, extraClauses: string[] = [], extraParams: unknown[] = [], select = 'COUNT(*) AS v'): Promise<CountRow[]> => {
      const clauses = ['profile_id = ?', 'projection_run_id = ?', ...extraClauses];
      const params: unknown[] = [profileId, runId, ...extraParams];
      addTimeRangeWhere(clauses, params, column, query);
      return (await dataSource.query(
        `SELECT ${select} FROM \`${table}\` ${whereSql(clauses)}`,
        params,
      )) as CountRow[];
    };

    const [usageRows, deliveryRows, artifactRows, knowledgeRows, codeReadRows, codeWriteRows] =
      await Promise.all([
        count('profile_capability_usages', 'event_time', [], [], 'COUNT(DISTINCT user_id) AS active, COUNT(*) AS v'),
        count('profile_delivery_units', 'last_seen_at'),
        count('profile_artifacts', 'COALESCE(first_seen_at, last_seen_at)'),
        count('profile_knowledge_recalls', 'event_time'),
        count('profile_code_activities', 'event_time', ["action_type IN ('read','grep','glob')"]),
        count('profile_code_activities', 'event_time', ["action_type IN ('write','edit','update')"]),
      ]);

    const usageRow = usageRows[0] as (CountRow & { active?: number | string | null }) | undefined;

    return {
      activeUserCount: toNumber(usageRow?.active),
      capabilityUsageCount: toNumber(usageRow?.v),
      deliveryUnitCount: toNumber(deliveryRows[0]?.v),
      artifactCount: toNumber(artifactRows[0]?.v),
      knowledgeRecallCount: toNumber(knowledgeRows[0]?.v),
      // codeChanges：轻量概况，已知口径差异项，不参与强一致对账。
      codeWriteCount: toNumber(codeWriteRows[0]?.v),
      codeReadCount: toNumber(codeReadRows[0]?.v),
    };
  }

  /** 产出分析列表：delivery unit + 文档数 + 覆盖阶段（current run）。 */
  async listDemands(
    profileId: string,
    runId: number,
    query: ProfileOverviewQuery,
  ): Promise<ProfileDemand[]> {
    const dataSource = await this.mysqlDataSourceManager.getDataSource();
    const clauses = ['du.profile_id = ?', 'du.projection_run_id = ?'];
    const params: unknown[] = [profileId, runId];
    addTimeRangeWhere(clauses, params, 'du.last_seen_at', query);

    const rows = (await dataSource.query(
      `SELECT du.id, du.delivery_unit_key, du.business_domain, du.unit_slug, du.title,
              du.relative_dir_or_locator AS locator, du.first_seen_at, du.last_seen_at,
              (SELECT COUNT(*) FROM profile_artifacts a
                WHERE a.projection_run_id = du.projection_run_id AND a.delivery_unit_id = du.id) AS artifact_count,
              (SELECT GROUP_CONCAT(DISTINCT a.artifact_type) FROM profile_artifacts a
                WHERE a.projection_run_id = du.projection_run_id AND a.delivery_unit_id = du.id) AS stages,
              (SELECT COUNT(*) FROM profile_capability_usages cu
                WHERE cu.projection_run_id = du.projection_run_id AND cu.delivery_unit_id = du.id) AS capability_usage_count,
              0 AS error_count
       FROM profile_delivery_units du
       ${whereSql(clauses)}
       ORDER BY du.last_seen_at DESC, du.id DESC`,
      params,
    )) as Array<Record<string, unknown>>;

    return rows.map((row) => ({
      id: String(row.id),
      deliveryUnitKey: String(row.delivery_unit_key),
      businessDomain: (row.business_domain as string | null) ?? null,
      unitSlug: (row.unit_slug as string | null) ?? null,
      title: (row.title as string | null) ?? null,
      locator: (row.locator as string | null) ?? null,
      firstSeenAt: toIsoDate(row.first_seen_at),
      lastSeenAt: toIsoDate(row.last_seen_at),
      artifactCount: toNumber(row.artifact_count),
      capabilityUsageCount: toNumber(row.capability_usage_count),
      errorCount: toNumber(row.error_count),
      coverageStages: row.stages ? String(row.stages).split(',').filter(Boolean) : [],
    }));
  }

  async getDemandDetail(
    profileId: string,
    runId: number,
    demandId: string,
  ): Promise<ProfileDemandDetail | null> {
    const dataSource = await this.mysqlDataSourceManager.getDataSource();

    const rows = (await dataSource.query(
      `SELECT du.id, du.delivery_unit_key, du.business_domain, du.unit_slug, du.title,
              du.relative_dir_or_locator AS locator, du.first_seen_at, du.last_seen_at,
              (SELECT COUNT(*) FROM profile_artifacts a
                WHERE a.projection_run_id = du.projection_run_id AND a.delivery_unit_id = du.id) AS artifact_count,
              (SELECT GROUP_CONCAT(DISTINCT a.artifact_type) FROM profile_artifacts a
                WHERE a.projection_run_id = du.projection_run_id AND a.delivery_unit_id = du.id) AS stages,
              (SELECT COUNT(*) FROM profile_capability_usages cu
                WHERE cu.projection_run_id = du.projection_run_id AND cu.delivery_unit_id = du.id) AS capability_usage_count,
              0 AS error_count
       FROM profile_delivery_units du
       WHERE du.profile_id = ? AND du.projection_run_id = ? AND du.id = ?
       LIMIT 1`,
      [profileId, runId, demandId],
    )) as Array<Record<string, unknown>>;
    if (rows.length === 0) return null;
    const row = rows[0]!;

    const [artifacts, summaryRows] = await Promise.all([
      this.listDemandArtifacts(profileId, runId, demandId),
      this.getDemandSummary(runId, demandId),
    ]);

    return {
      id: String(row.id),
      deliveryUnitKey: String(row.delivery_unit_key),
      businessDomain: (row.business_domain as string | null) ?? null,
      unitSlug: (row.unit_slug as string | null) ?? null,
      title: (row.title as string | null) ?? null,
      locator: (row.locator as string | null) ?? null,
      firstSeenAt: toIsoDate(row.first_seen_at),
      lastSeenAt: toIsoDate(row.last_seen_at),
      artifactCount: toNumber(row.artifact_count),
      capabilityUsageCount: toNumber(row.capability_usage_count),
      errorCount: toNumber(row.error_count),
      coverageStages: row.stages ? String(row.stages).split(',').filter(Boolean) : [],
      artifacts,
      turnCount: toNumber(summaryRows[0]?.turn_count),
      sessionCount: toNumber(summaryRows[0]?.session_count),
      contributorCount: toNumber(summaryRows[0]?.contributor_count),
      knowledgeRecallCount: toNumber(summaryRows[0]?.knowledge_recall_count),
    };
  }

  async listDemandArtifacts(
    profileId: string,
    runId: number,
    demandId: string,
  ): Promise<ProfileDemandArtifact[]> {
    const dataSource = await this.mysqlDataSourceManager.getDataSource();
    const rows = (await dataSource.query(
      `SELECT a.id, a.artifact_type, a.artifact_locator, a.system_module, a.last_seen_at
       FROM profile_artifacts a
       WHERE a.profile_id = ? AND a.projection_run_id = ? AND a.delivery_unit_id = ?
       ORDER BY a.id ASC`,
      [profileId, runId, demandId],
    )) as Array<Record<string, unknown>>;
    return rows.map((row) => ({
      id: String(row.id),
      artifactType: String(row.artifact_type ?? ''),
      artifactLocator: (row.artifact_locator as string | null) ?? null,
      systemModule: (row.system_module as string | null) ?? null,
      lastSeenAt: toIsoDate(row.last_seen_at),
    }));
  }

  async getArtifactTimeline(
    profileId: string,
    runId: number,
    demandId: string,
    artifactId: string,
  ): Promise<ProfileArtifactTimelineItem[]> {
    const dataSource = await this.mysqlDataSourceManager.getDataSource();
    const rows = (await dataSource.query(
      `SELECT timeline.* FROM (
        SELECT w.id, 'write' AS node_kind, w.write_kind, w.event_time, w.event_sequence,
               w.interaction_id,
               cu.capability_code, cu.display_name AS capability_display_name,
               cu.raw_capability_name,
               (SELECT COUNT(*) FROM profile_knowledge_recalls kr
                 WHERE kr.projection_run_id = w.projection_run_id AND kr.interaction_id = w.interaction_id) AS knowledge_recall_count,
               it.prompt_text
        FROM profile_artifact_writes w
        LEFT JOIN profile_capability_usages cu ON cu.id = w.capability_usage_id
        LEFT JOIN sdd_interaction_texts it ON it.interaction_id = w.interaction_id
        WHERE w.profile_id = ? AND w.projection_run_id = ? AND w.delivery_unit_id = ? AND w.artifact_id = ?

        UNION ALL

        SELECT t.id, 'discussion' AS node_kind, NULL AS write_kind, t.event_time, NULL AS event_sequence,
               t.interaction_id,
               cu.capability_code, cu.display_name AS capability_display_name,
               cu.raw_capability_name,
               (SELECT COUNT(*) FROM profile_knowledge_recalls kr
                 WHERE kr.projection_run_id = t.projection_run_id AND kr.interaction_id = t.interaction_id) AS knowledge_recall_count,
               it.prompt_text
        FROM profile_artifact_turns t
        LEFT JOIN profile_capability_usages cu ON cu.id = t.capability_usage_id
        LEFT JOIN sdd_interaction_texts it ON it.interaction_id = t.interaction_id
        WHERE t.profile_id = ? AND t.projection_run_id = ? AND t.delivery_unit_id = ? AND t.artifact_id = ?
      ) timeline
      ORDER BY timeline.event_time IS NULL, timeline.event_time ASC,
               FIELD(timeline.node_kind, 'discussion', 'write'), timeline.id ASC`,
      [profileId, runId, demandId, artifactId, profileId, runId, demandId, artifactId],
    )) as Array<Record<string, unknown>>;

    return rows.map((row) => ({
      id: String(row.id),
      nodeKind: row.node_kind === 'discussion' ? 'discussion' as const : 'write' as const,
      writeKind: (row.write_kind as string | null) ?? null,
      eventTime: toIsoDate(row.event_time),
      eventSequence: row.event_sequence == null ? null : toNumber(row.event_sequence),
      interactionId: row.interaction_id == null ? null : String(row.interaction_id),
      capabilityCode: (row.capability_code as string | null) ?? null,
      capabilityDisplayName: (row.capability_display_name as string | null) ?? null,
      rawCapabilityName: (row.raw_capability_name as string | null) ?? null,
      knowledgeRecallCount: toNumber(row.knowledge_recall_count),
      promptPreview: row.prompt_text ? String(row.prompt_text).slice(0, 200) : null,
      contentPreview: null,
    }));
  }

  private async getDemandSummary(
    runId: number,
    demandId: string,
  ): Promise<Array<Record<string, unknown>>> {
    const dataSource = await this.mysqlDataSourceManager.getDataSource();
    return (await dataSource.query(
      `SELECT
        (SELECT COUNT(DISTINCT interaction_id) FROM profile_artifact_turns
          WHERE projection_run_id = ? AND delivery_unit_id = ? AND interaction_id IS NOT NULL) AS turn_count,
        (SELECT COUNT(DISTINCT session_id) FROM profile_capability_usages
          WHERE projection_run_id = ? AND delivery_unit_id = ? AND session_id IS NOT NULL) AS session_count,
        (SELECT COUNT(DISTINCT user_id) FROM profile_capability_usages
          WHERE projection_run_id = ? AND delivery_unit_id = ? AND user_id IS NOT NULL) AS contributor_count,
        (SELECT COUNT(*) FROM profile_knowledge_recalls
          WHERE projection_run_id = ? AND delivery_unit_id = ?) AS knowledge_recall_count`,
      [runId, demandId, runId, demandId, runId, demandId, runId, demandId],
    )) as Array<Record<string, unknown>>;
  }

  // ── Capability Analytics ────────────────────────────────────────────────────

  async getCapabilityAnalytics(
    profileId: string,
    runId: number,
    query: ProfileOverviewQuery,
    presentationConfig: ProfilePresentation | undefined,
  ): Promise<ProfileCapabilityAnalytics> {
    const dataSource = await this.mysqlDataSourceManager.getDataSource();
    const presentation = normalizeProfilePresentation(presentationConfig);
    const multiStageArtifactTypes = presentation.stages.artifactStages.map((stage) => stage.code);

    const buildClauses = (extra: string[] = []): { clauses: string[]; params: unknown[] } => {
      const clauses = ['cu.profile_id = ?', 'cu.projection_run_id = ?', ...extra];
      const params: unknown[] = [profileId, runId];
      addTimeRangeWhere(clauses, params, 'cu.event_time', query);
      return { clauses, params };
    };

    const kpiQuery = (extra: string[] = []) => {
      const { clauses, params } = buildClauses(extra);
      return dataSource.query(
        `SELECT
           COUNT(*) AS usage_count,
           COUNT(DISTINCT cu.user_id) AS active_user_count,
           COUNT(DISTINCT cu.delivery_unit_id) AS covered_delivery_unit_count,
            SUM(CASE WHEN cu.trigger_source = 'user-slash' THEN 1 ELSE 0 END) AS user_triggered_count,
            SUM(CASE WHEN cu.trigger_source IN ('claude-proactive', 'nested-skill') THEN 1 ELSE 0 END) AS auto_triggered_count
         FROM profile_capability_usages cu
         ${whereSql(clauses)}`,
        params,
      ) as Promise<Array<Record<string, unknown>>>;
    };

    const multiStageQuery = () => {
      if (multiStageArtifactTypes.length === 0) {
        return Promise.resolve([{ v: 0 }]) as Promise<Array<Record<string, unknown>>>;
      }
      const activeClauses = [
        'active.profile_id = ?',
        'active.projection_run_id = ?',
        'active.delivery_unit_id IS NOT NULL',
      ];
      const activeParams: unknown[] = [profileId, runId];
      addTimeRangeWhere(activeClauses, activeParams, 'active.first_seen_at', query);
      return dataSource.query(
        `SELECT COUNT(*) AS v
         FROM (
           SELECT a.delivery_unit_id
           FROM profile_artifacts a
           WHERE a.profile_id = ? AND a.projection_run_id = ?
             AND a.artifact_type IN (${multiStageArtifactTypes.map(() => '?').join(',')})
             AND a.delivery_unit_id IN (
               SELECT DISTINCT active.delivery_unit_id
               FROM profile_artifacts active
               ${whereSql(activeClauses)}
             )
           GROUP BY a.delivery_unit_id
           HAVING COUNT(DISTINCT a.artifact_type) >= 3
         ) sub`,
        [profileId, runId, ...multiStageArtifactTypes, ...activeParams],
      ) as Promise<Array<Record<string, unknown>>>;
    };

    const qualityQuery = () => {
      const { clauses, params } = buildClauses([]);
      return dataSource.query(
        `SELECT
           COUNT(*) AS triggered_count,
           SUM(CASE WHEN cu.prompt_id IS NOT NULL THEN 1 ELSE 0 END) AS with_prompt_count,
           SUM(CASE WHEN cu.interaction_id IS NOT NULL THEN 1 ELSE 0 END) AS with_response_count,
           SUM(CASE WHEN cu.interaction_id IS NOT NULL AND cu.prompt_id IS NOT NULL THEN 1 ELSE 0 END) AS paired_count,
           SUM(CASE WHEN cu.status = 'failed' THEN 1 ELSE 0 END) AS failed_count
         FROM profile_capability_usages cu
         ${whereSql(clauses)}`,
        params,
      ) as Promise<Array<Record<string, unknown>>>;
    };

    const topCapabilitiesQuery = () => {
      const { clauses, params } = buildClauses([]);
      return dataSource.query(
        `SELECT
           cu.capability_code,
           MAX(cu.display_name) AS display_name,
           COUNT(*) AS usage_count,
           COUNT(DISTINCT cu.user_id) AS user_count,
           COUNT(DISTINCT cu.delivery_unit_id) AS delivery_unit_count
         FROM profile_capability_usages cu
         ${whereSql(clauses)} AND cu.capability_code IS NOT NULL
         GROUP BY cu.capability_code
         ORDER BY usage_count DESC
         LIMIT 10`,
        params,
      ) as Promise<Array<Record<string, unknown>>>;
    };

    const matchHealthQuery = () => {
      const { clauses, params } = buildClauses([]);
      return dataSource.query(
        `SELECT
           SUM(CASE WHEN cu.capability_code IS NOT NULL THEN 1 ELSE 0 END) AS matched_count,
           SUM(CASE WHEN cu.capability_code IS NULL THEN 1 ELSE 0 END) AS unmatched_count
         FROM profile_capability_usages cu
         ${whereSql(clauses)}`,
        params,
      ) as Promise<Array<Record<string, unknown>>>;
    };

    const topUnmatchedQuery = () => {
      const { clauses, params } = buildClauses([]);
      return dataSource.query(
        `SELECT cu.raw_capability_name, COUNT(*) AS usage_count
         FROM profile_capability_usages cu
         ${whereSql(clauses)} AND cu.capability_code IS NULL
         GROUP BY cu.raw_capability_name
         ORDER BY usage_count DESC
         LIMIT 5`,
        params,
      ) as Promise<Array<Record<string, unknown>>>;
    };

    const [currentKpis, qualityRows, topRows, matchRows, unmatchedRows, multiStageRows] =
      await Promise.all([
        kpiQuery(),
        qualityQuery(),
        topCapabilitiesQuery(),
        matchHealthQuery(),
        topUnmatchedQuery(),
        multiStageQuery(),
      ]);

    const k = currentKpis[0] ?? {};
    const q = qualityRows[0] ?? {};
    const matchedCount = toNumber(matchRows[0]?.matched_count);
    const unmatchedCount = toNumber(matchRows[0]?.unmatched_count);
    const totalMatchState = matchedCount + unmatchedCount;
    const usageCountTotal = toNumber(k.usage_count);
    const triggeredCount = toNumber(q.triggered_count);

    return {
      kpis: {
        capabilityUsageCount: { current: usageCountTotal, previous: null },
        activeUserCount: { current: toNumber(k.active_user_count), previous: null },
        coveredDeliveryUnitCount: { current: toNumber(k.covered_delivery_unit_count), previous: null },
        userTriggeredCount: { current: toNumber(k.user_triggered_count), previous: null },
        autoTriggeredCount: { current: toNumber(k.auto_triggered_count), previous: null },
        multiStageDeliveryUnitCount: { current: toNumber(multiStageRows[0]?.v), previous: null },
      },
      callQuality: {
        triggeredCount,
        withPromptCount: toNumber(q.with_prompt_count),
        withResponseCount: toNumber(q.with_response_count),
        pairedCount: toNumber(q.paired_count),
        promptCoverageRate: triggeredCount > 0 ? toNumber(q.with_prompt_count) / triggeredCount : null,
        responseCoverageRate: triggeredCount > 0 ? toNumber(q.with_response_count) / triggeredCount : null,
        pairingSuccessRate: triggeredCount > 0 ? 1 - toNumber(q.failed_count) / triggeredCount : null,
      },
      topCapabilities: topRows.map((row) => {
        const usageCount = toNumber(row.usage_count);
        return {
          capabilityCode: String(row.capability_code ?? 'unknown'),
          displayName: String(row.display_name ?? '未匹配'),
          usageCount,
          userCount: toNumber(row.user_count),
          deliveryUnitCount: toNumber(row.delivery_unit_count),
          conversionRate: usageCountTotal > 0 ? usageCount / usageCountTotal : null,
        };
      }),
      matchHealth: {
        matchedCount,
        unmatchedCount,
        matchRate: totalMatchState > 0 ? matchedCount / totalMatchState : null,
        topUnmatched: unmatchedRows.map((row) => ({
          rawCapabilityName: String(row.raw_capability_name ?? ''),
          usageCount: toNumber(row.usage_count),
        })),
      },
    };
  }

  async getCapabilityTimeseries(
    profileId: string,
    runId: number,
    query: ProfileCapabilityTimeseriesQuery,
  ): Promise<ProfileCapabilityTimeseries> {
    const dataSource = await this.mysqlDataSourceManager.getDataSource();
    const bucket = query.bucket ?? '1h';
    const bucketSeconds = bucket === '15m' ? 900 : bucket === '3h' ? 10800 : 3600;

    const clauses = ['cu.profile_id = ?', 'cu.projection_run_id = ?'];
    const params: unknown[] = [profileId, runId];
    addTimeRangeWhere(clauses, params, 'cu.event_time', query);

    const rows = (await dataSource.query(
      `SELECT
         FROM_UNIXTIME(FLOOR(UNIX_TIMESTAMP(cu.event_time) / ?) * ?) AS bucket_ts,
         COUNT(*) AS triggered_count,
         SUM(CASE WHEN cu.interaction_id IS NOT NULL AND cu.prompt_id IS NOT NULL THEN 1 ELSE 0 END) AS paired_count
       FROM profile_capability_usages cu
       ${whereSql(clauses)}
       GROUP BY bucket_ts
       ORDER BY bucket_ts ASC`,
      [bucketSeconds, bucketSeconds, ...params],
    )) as Array<Record<string, unknown>>;

    return {
      bucket,
      points: rows.map((row) => ({
        timestamp: toIsoDate(row.bucket_ts) ?? '',
        triggeredCount: toNumber(row.triggered_count),
        pairedCount: toNumber(row.paired_count),
      })),
    };
  }

  async listCapabilityUsageSummary(
    profileId: string,
    runId: number,
    query: ProfileCapabilityUsageSummaryQuery,
  ): Promise<{ items: ProfileCapabilityUsageSummaryItem[]; total: number }> {
    const dataSource = await this.mysqlDataSourceManager.getDataSource();
    const clauses = ['cu.profile_id = ?', 'cu.projection_run_id = ?'];
    const params: unknown[] = [profileId, runId];
    addTimeRangeWhere(clauses, params, 'cu.event_time', query);

    if (query.capabilityCode) {
      clauses.push('cu.capability_code = ?');
      params.push(query.capabilityCode);
    }
    if (query.status) {
      clauses.push('cu.status = ?');
      params.push(query.status);
    }
    if (query.matched === 'matched') {
      clauses.push('cu.capability_code IS NOT NULL');
    } else if (query.matched === 'unmatched') {
      clauses.push('cu.capability_code IS NULL');
    }
    if (query.keyword) {
      clauses.push('(cu.raw_capability_name LIKE ? OR cu.display_name LIKE ?)');
      const kw = `%${query.keyword}%`;
      params.push(kw, kw);
    }

    const offset = (query.page - 1) * query.pageSize;

    const countRows = (await dataSource.query(
      `SELECT COUNT(DISTINCT cu.raw_capability_name) AS v
       FROM profile_capability_usages cu
       ${whereSql(clauses)}`,
      params,
    )) as Array<Record<string, unknown>>;

    const rows = (await dataSource.query(
      `SELECT
         MAX(cu.capability_code) AS capability_code,
         MAX(cu.display_name) AS capability_display_name,
         cu.raw_capability_name,
         COUNT(*) AS usage_count,
         COUNT(DISTINCT cu.user_id) AS active_user_count,
         COUNT(DISTINCT cu.session_id) AS session_count,
         COUNT(DISTINCT cu.delivery_unit_id) AS delivery_unit_count,
         MIN(cu.event_time) AS first_seen_at,
         MAX(cu.event_time) AS last_seen_at
       FROM profile_capability_usages cu
       ${whereSql(clauses)}
       GROUP BY cu.raw_capability_name
       ORDER BY usage_count DESC
       LIMIT ? OFFSET ?`,
      [...params, query.pageSize, offset],
    )) as Array<Record<string, unknown>>;

    const items: ProfileCapabilityUsageSummaryItem[] = rows.map((row) => ({
      capabilityCode: (row.capability_code as string | null) ?? null,
      capabilityDisplayName: (row.capability_display_name as string | null) ?? null,
      rawCapabilityName: String(row.raw_capability_name ?? ''),
      usageCount: toNumber(row.usage_count),
      activeUserCount: toNumber(row.active_user_count),
      sessionCount: toNumber(row.session_count),
      deliveryUnitCount: toNumber(row.delivery_unit_count),
      versions: [],
      firstSeenAt: toIsoDate(row.first_seen_at),
      lastSeenAt: toIsoDate(row.last_seen_at),
    }));

    return { items, total: toNumber(countRows[0]?.v) };
  }

  async listCapabilityUsages(
    profileId: string,
    runId: number,
    query: ProfileCapabilityUsagesQuery,
  ): Promise<{ items: ProfileCapabilityUsageItem[]; total: number }> {
    const dataSource = await this.mysqlDataSourceManager.getDataSource();
    const clauses = ['cu.profile_id = ?', 'cu.projection_run_id = ?'];
    const params: unknown[] = [profileId, runId];
    addTimeRangeWhere(clauses, params, 'cu.event_time', query);

    if (query.capabilityCode) {
      clauses.push('cu.capability_code = ?');
      params.push(query.capabilityCode);
    }
    if (query.rawCapabilityName) {
      clauses.push('cu.raw_capability_name = ?');
      params.push(query.rawCapabilityName);
    }
    if (query.userId) {
      clauses.push('cu.user_id = ?');
      params.push(query.userId);
    }
    if (query.deliveryUnitId) {
      clauses.push('cu.delivery_unit_id = ?');
      params.push(query.deliveryUnitId);
    }
    if (query.sessionId) {
      clauses.push('cu.session_id = ?');
      params.push(query.sessionId);
    }
    if (query.promptId) {
      clauses.push('cu.prompt_id = ?');
      params.push(query.promptId);
    }
    if (query.status) {
      clauses.push('cu.status = ?');
      params.push(query.status);
    }

    const offset = (query.page - 1) * query.pageSize;

    const countRows = (await dataSource.query(
      `SELECT COUNT(*) AS v FROM profile_capability_usages cu ${whereSql(clauses)}`,
      params,
    )) as Array<Record<string, unknown>>;

    const rows = (await dataSource.query(
      `SELECT cu.id, cu.usage_key, cu.capability_code, cu.display_name AS capability_display_name,
              cu.raw_capability_name, cu.capability_source, cu.status,
              cu.user_id, cu.interaction_id, cu.delivery_unit_id,
              cu.session_id, cu.prompt_id, cu.event_time,
              sr.reference_key AS source_reference_key,
              sr.action_type AS source_action_type,
              sr.normalized_locator AS source_locator
       FROM profile_capability_usages cu
       LEFT JOIN source_references sr
         ON cu.usage_key = SHA2(CONCAT(cu.profile_id, ':capability:', sr.reference_key), 256)
       ${whereSql(clauses)}
       ORDER BY cu.event_time DESC, cu.id DESC
       LIMIT ? OFFSET ?`,
      [...params, query.pageSize, offset],
    )) as Array<Record<string, unknown>>;

    const items: ProfileCapabilityUsageItem[] = rows.map((row) => ({
      id: toStringId(row.id),
      usageKey: String(row.usage_key ?? ''),
      capabilityCode: (row.capability_code as string | null) ?? null,
      capabilityDisplayName: (row.capability_display_name as string | null) ?? null,
      rawCapabilityName: String(row.raw_capability_name ?? ''),
      capabilitySource: (row.capability_source as string | null) ?? null,
      status: String(row.status ?? ''),
      userId: row.user_id == null ? null : toStringId(row.user_id),
      interactionId: row.interaction_id == null ? null : toStringId(row.interaction_id),
      deliveryUnitId: row.delivery_unit_id == null ? null : toStringId(row.delivery_unit_id),
      sessionId: (row.session_id as string | null) ?? null,
      promptId: (row.prompt_id as string | null) ?? null,
      eventTime: toIsoDate(row.event_time),
      sourceReferenceKey: (row.source_reference_key as string | null) ?? null,
      sourceActionType: (row.source_action_type as string | null) ?? null,
      sourceLocator: (row.source_locator as string | null) ?? null,
    }));

    return { items, total: toNumber(countRows[0]?.v) };
  }

  // ── Users ────────────────────────────────────────────────────────────────────

  async listUsers(
    profileId: string,
    runId: number,
    query: ProfileUsersQuery,
    presentationConfig: ProfilePresentation | undefined,
  ): Promise<{ items: ProfileUserItem[]; total: number }> {
    const dataSource = await this.mysqlDataSourceManager.getDataSource();
    const offset = (query.page - 1) * query.pageSize;
    const now = Date.now();

    // 用户全集和活跃时间必须来自当前 profile 的事实表，不能使用 sdd_users 全局活跃时间。
    const activitySql = this.profileUserActivitySql();
    const activityParams = this.profileUserActivityParams(profileId, runId);
    const userClauses: string[] = [];
    const userParams: unknown[] = [];
    addTimeRangeWhere(userClauses, userParams, 'uu.last_seen_at', query);
    if (query.keyword) {
      const kw = `%${query.keyword}%`;
      userClauses.push('(su.user_name LIKE ? OR su.user_key LIKE ? OR su.install_id LIKE ? OR su.machine_name LIKE ?)');
      userParams.push(kw, kw, kw, kw);
    }
    if (query.status) {
      const liveCutoff = new Date(now - this.userAnalysis.coldDays * DAY_MS);
      const churnCutoff = new Date(now - this.userAnalysis.churnDays * DAY_MS);
      if (query.status === 'live') {
        userClauses.push('uu.last_seen_at IS NOT NULL AND uu.last_seen_at >= ?');
        userParams.push(liveCutoff);
      } else if (query.status === 'cold') {
        userClauses.push('uu.last_seen_at IS NOT NULL AND uu.last_seen_at < ? AND uu.last_seen_at >= ?');
        userParams.push(liveCutoff, churnCutoff);
      } else {
        userClauses.push('(uu.last_seen_at IS NULL OR uu.last_seen_at < ?)');
        userParams.push(churnCutoff);
      }
    }

    const countRows = (await dataSource.query(
      `SELECT COUNT(*) AS v
       FROM (${activitySql}) uu
       JOIN sdd_users su ON su.id = uu.user_id
       ${whereSql(userClauses)}`,
      [...activityParams, ...userParams],
    )) as Array<Record<string, unknown>>;

    // artifact_count 复用旧口径：用户能力调用覆盖的 delivery unit 下的 distinct artifact
    // （profile_artifacts 无 user_id，必须经 delivery_unit_id 归因）。
    const itemRows = (await dataSource.query(
      `SELECT uu.user_id,
              su.user_key, su.user_name AS display_name, su.install_id, su.machine_id, su.machine_name,
              uu.first_seen_at AS profile_first_seen_at, uu.last_seen_at AS profile_last_seen_at,
              (SELECT COUNT(*) FROM profile_capability_usages cu
                WHERE cu.projection_run_id = ? AND cu.user_id = uu.user_id) AS capability_usage_count,
              (SELECT COUNT(DISTINCT cu.interaction_id) FROM profile_capability_usages cu
                WHERE cu.projection_run_id = ? AND cu.user_id = uu.user_id AND cu.interaction_id IS NOT NULL) AS interaction_count,
              (SELECT COUNT(DISTINCT cu.delivery_unit_id) FROM profile_capability_usages cu
                WHERE cu.projection_run_id = ? AND cu.user_id = uu.user_id AND cu.delivery_unit_id IS NOT NULL) AS delivery_unit_count,
              (SELECT GROUP_CONCAT(DISTINCT cu.capability_code) FROM profile_capability_usages cu
                WHERE cu.projection_run_id = ? AND cu.user_id = uu.user_id AND cu.capability_code IS NOT NULL) AS capability_stages,
              (SELECT COUNT(DISTINCT a.id) FROM profile_capability_usages cu
                JOIN profile_artifacts a ON a.projection_run_id = cu.projection_run_id AND a.delivery_unit_id = cu.delivery_unit_id
                WHERE cu.projection_run_id = ? AND cu.user_id = uu.user_id AND cu.delivery_unit_id IS NOT NULL) AS artifact_count,
              (SELECT COUNT(*) FROM profile_knowledge_recalls kr
                WHERE kr.projection_run_id = ? AND kr.user_id = uu.user_id) AS knowledge_recall_count,
              (SELECT COUNT(*) FROM profile_code_activities ca
                WHERE ca.projection_run_id = ? AND ca.user_id = uu.user_id AND ca.action_type IN ('write','edit','update')) AS code_write_count,
              (SELECT COUNT(*) FROM profile_code_activities ca
                WHERE ca.projection_run_id = ? AND ca.user_id = uu.user_id AND ca.action_type IN ('read','grep','glob')) AS code_read_count
       FROM (${activitySql}) uu
       JOIN sdd_users su ON su.id = uu.user_id
       ${whereSql(userClauses)}
       ORDER BY uu.last_seen_at DESC, uu.user_id DESC
       LIMIT ? OFFSET ?`,
      [
        runId, runId, runId, runId, runId, runId, runId, runId,
        ...activityParams,
        ...userParams,
        query.pageSize,
        offset,
      ],
    )) as Array<Record<string, unknown>>;

    const maturityStageCodes = this.getMaturityStageCodes(presentationConfig);
    const maturityByUser = await this.loadMaturityMap(runId, itemRows.map((r) => toStringId(r.user_id)));

    const items: ProfileUserItem[] = itemRows.map((row) => {
      const id = toStringId(row.user_id);
      const { rampDays } = this.computeMaturity(maturityByUser.get(id) ?? new Map(), row.profile_first_seen_at, maturityStageCodes);
      return {
        id,
        userKey: String(row.user_key ?? ''),
        installId: (row.install_id as string | null) ?? null,
        displayName: (row.display_name as string | null) ?? null,
        machineId: (row.machine_id as string | null) ?? null,
        machineName: (row.machine_name as string | null) ?? null,
        firstSeenAt: toIsoDate(row.profile_first_seen_at),
        lastSeenAt: toIsoDate(row.profile_last_seen_at),
        capabilityUsageCount: toNumber(row.capability_usage_count),
        interactionCount: toNumber(row.interaction_count),
        deliveryUnitCount: toNumber(row.delivery_unit_count),
        capabilityStages: row.capability_stages ? String(row.capability_stages).split(',').filter(Boolean) : [],
        status: this.computeStatus(row.profile_last_seen_at, now),
        isNew: this.computeIsNew(row.profile_first_seen_at, now),
        artifactCount: toNumber(row.artifact_count),
        knowledgeRecallCount: toNumber(row.knowledge_recall_count),
        codeWriteCount: toNumber(row.code_write_count),
        codeReadCount: toNumber(row.code_read_count),
        rampDays,
      };
    });

    return { items, total: toNumber(countRows[0]?.v) };
  }

  private profileUserActivitySql(): string {
    return `
        SELECT activity.user_id, MIN(activity.event_time) AS first_seen_at, MAX(activity.event_time) AS last_seen_at
        FROM (
          SELECT user_id, event_time FROM profile_capability_usages WHERE profile_id = ? AND projection_run_id = ? AND user_id IS NOT NULL
          UNION ALL SELECT user_id, event_time FROM profile_artifact_writes WHERE profile_id = ? AND projection_run_id = ? AND user_id IS NOT NULL
          UNION ALL SELECT user_id, event_time FROM profile_knowledge_recalls WHERE profile_id = ? AND projection_run_id = ? AND user_id IS NOT NULL
          UNION ALL SELECT user_id, event_time FROM profile_code_activities WHERE profile_id = ? AND projection_run_id = ? AND user_id IS NOT NULL
        ) activity
        GROUP BY activity.user_id`;
  }

  private profileUserActivityParams(profileId: string, runId: number): unknown[] {
    return [profileId, runId, profileId, runId, profileId, runId, profileId, runId];
  }

  private async getProfileUserActivity(
    profileId: string,
    runId: number,
    userId: string,
  ): Promise<{ firstSeenAt: unknown; lastSeenAt: unknown } | null> {
    const dataSource = await this.mysqlDataSourceManager.getDataSource();
    const activitySql = this.profileUserActivitySql();
    const rows = (await dataSource.query(
      `SELECT uu.first_seen_at, uu.last_seen_at
       FROM (${activitySql}) uu
       WHERE uu.user_id = ?
       LIMIT 1`,
      [...this.profileUserActivityParams(profileId, runId), userId],
    )) as Array<Record<string, unknown>>;
    const row = rows[0];
    return row ? { firstSeenAt: row.first_seen_at, lastSeenAt: row.last_seen_at } : null;
  }

  /** 用户状态：对齐旧 userAnalysis 口径，阈值来自统一配置。 */
  private computeStatus(lastSeenAt: unknown, now: number): 'live' | 'cold' | 'churn' {
    if (!lastSeenAt) return 'churn';
    const diffDays = (now - new Date(String(lastSeenAt)).getTime()) / DAY_MS;
    if (diffDays <= this.userAnalysis.coldDays) return 'live';
    if (diffDays <= this.userAnalysis.churnDays) return 'cold';
    return 'churn';
  }

  private computeIsNew(firstSeenAt: unknown, now: number): boolean {
    if (!firstSeenAt) return false;
    return (now - new Date(String(firstSeenAt)).getTime()) / DAY_MS <= this.userAnalysis.newDays;
  }

  /** 按 user 加载 capability_code → 首次到达时间，供成熟度/rampDays 计算（对齐旧 listUserMaturity）。 */
  private async loadMaturityMap(
    runId: number,
    userIds: string[],
  ): Promise<Map<string, Map<string, string>>> {
    const byUser = new Map<string, Map<string, string>>();
    if (userIds.length === 0) return byUser;
    const dataSource = await this.mysqlDataSourceManager.getDataSource();
    const placeholders = userIds.map(() => '?').join(',');
    const rows = (await dataSource.query(
      `SELECT cu.user_id, cu.capability_code, MIN(cu.event_time) AS first_event_time
       FROM profile_capability_usages cu
       WHERE cu.projection_run_id = ? AND cu.user_id IN (${placeholders})
         AND cu.capability_code IS NOT NULL AND cu.event_time IS NOT NULL
       GROUP BY cu.user_id, cu.capability_code`,
      [runId, ...userIds],
    )) as Array<Record<string, unknown>>;
    for (const row of rows) {
      const uid = toStringId(row.user_id);
      let inner = byUser.get(uid);
      if (!inner) {
        inner = new Map();
        byUser.set(uid, inner);
      }
      const iso = toIsoDate(row.first_event_time);
      const code = String(row.capability_code);
      if (iso && (!inner.has(code) || inner.get(code)! > iso)) inner.set(code, iso);
    }
    return byUser;
  }

  /** 成熟度：按 profile presentation 阶段返回；无成熟度阶段时返回空 stages。 */
  private computeMaturity(
    firstByStage: Map<string, string>,
    firstSeenAt: unknown,
    maturityStageCodes: string[],
  ): { stages: ProfileUserMaturityStage[]; completionRate: number; rampDays: number | null } {
    const stages: ProfileUserMaturityStage[] = maturityStageCodes.map((stage) => ({
      stage,
      firstReachedAt: firstByStage.get(stage) ?? null,
    }));
    const reachedCount = stages.filter((s) => s.firstReachedAt !== null).length;
    const completionRate = maturityStageCodes.length > 0 ? reachedCount / maturityStageCodes.length : 0;

    let rampDays: number | null = null;
    if (maturityStageCodes.length > 0 && reachedCount === maturityStageCodes.length && firstSeenAt) {
      const firstSeenMs = new Date(String(firstSeenAt)).getTime();
      const reachedTimes = stages
        .map((s) => (s.firstReachedAt ? new Date(s.firstReachedAt).getTime() : null))
        .filter((v): v is number => v !== null);
      const lastReachedMs = Math.max(...reachedTimes);
      const diff = Math.floor((lastReachedMs - firstSeenMs) / DAY_MS);
      rampDays = diff >= 0 ? diff : null;
    }
    return { stages, completionRate, rampDays };
  }

  private getMaturityStageCodes(presentationConfig: ProfilePresentation | undefined): string[] {
    return normalizeProfilePresentation(presentationConfig).stages.maturityStages.map((stage) => stage.code);
  }

  async getUserDetail(
    profileId: string,
    runId: number,
    userId: string,
    presentationConfig: ProfilePresentation | undefined,
  ): Promise<ProfileUserDetail | null> {
    const dataSource = await this.mysqlDataSourceManager.getDataSource();

    const [userRows, profileActivity] = await Promise.all([
      dataSource.query(
      `SELECT su.id, su.user_key, su.install_id, su.user_name AS display_name, su.machine_id, su.machine_name
       FROM sdd_users su
       WHERE su.id = ?
       LIMIT 1`,
      [userId],
      ) as Promise<Array<Record<string, unknown>>>,
      this.getProfileUserActivity(profileId, runId, userId),
    ]);

    if (userRows.length === 0 || !profileActivity) return null;

    const row = userRows[0]!;
    const now = Date.now();
    const status = this.computeStatus(profileActivity.lastSeenAt, now);
    const isNew = this.computeIsNew(profileActivity.firstSeenAt, now);

    const [summaryRows, deliveryUnitRows, maturityByUser] = await Promise.all([
      this.getUserSummary(runId, userId),
      this.getUserDeliveryUnits(runId, userId),
      this.loadMaturityMap(runId, [userId]),
    ]);
    const maturityStageCodes = this.getMaturityStageCodes(presentationConfig);

    const maturityResult = this.computeMaturity(
      maturityByUser.get(userId) ?? new Map(),
      profileActivity.firstSeenAt,
      maturityStageCodes,
    );
    const rampDays = maturityResult.rampDays;

    const s = summaryRows[0] ?? {};
    const capabilityStages = (await dataSource.query(
      `SELECT GROUP_CONCAT(DISTINCT cu.capability_code) AS v
       FROM profile_capability_usages cu
       WHERE cu.projection_run_id = ? AND cu.user_id = ? AND cu.capability_code IS NOT NULL`,
      [runId, userId],
    )) as Array<Record<string, unknown>>;

    const user: ProfileUserItem = {
      id: toStringId(row.id),
      userKey: String(row.user_key ?? ''),
      installId: (row.install_id as string | null) ?? null,
      displayName: (row.display_name as string | null) ?? null,
      machineId: (row.machine_id as string | null) ?? null,
      machineName: (row.machine_name as string | null) ?? null,
      firstSeenAt: toIsoDate(profileActivity.firstSeenAt),
      lastSeenAt: toIsoDate(profileActivity.lastSeenAt),
      capabilityUsageCount: toNumber(s.capability_usage_count),
      interactionCount: toNumber(s.interaction_count),
      deliveryUnitCount: toNumber(s.delivery_unit_count),
      capabilityStages: capabilityStages[0]?.v ? String(capabilityStages[0].v).split(',').filter(Boolean) : [],
      status,
      isNew,
      artifactCount: toNumber(s.artifact_count),
      knowledgeRecallCount: toNumber(s.knowledge_recall_count),
      codeWriteCount: toNumber(s.code_write_count),
      codeReadCount: toNumber(s.code_read_count),
      rampDays,
    };

    const summary: ProfileUserSummary = {
      deliveryUnitCount: toNumber(s.delivery_unit_count),
      artifactCount: toNumber(s.artifact_count),
      turnCount: toNumber(s.turn_count),
      sessionCount: toNumber(s.session_count),
      knowledgeRecallCount: toNumber(s.knowledge_recall_count),
      codeWriteCount: toNumber(s.code_write_count),
      codeReadCount: toNumber(s.code_read_count),
    };

    const maturity: ProfileUserMaturity = {
      stages: maturityResult.stages,
      completionRate: maturityResult.completionRate,
      rampDays,
    };

    const deliveryUnits: ProfileUserDeliveryUnit[] = deliveryUnitRows.map((du) => ({
      deliveryUnitId: toStringId(du.id),
      title: (du.title as string | null) ?? null,
      stageCodes: du.stages ? String(du.stages).split(',').filter(Boolean) : [],
      lastActivityAt: toIsoDate(du.last_activity_at),
    }));

    return { user, summary, maturity, deliveryUnits };
  }

  async listUserActivity(
    profileId: string,
    runId: number,
    userId: string,
    options: UserActivityOptions,
  ): Promise<ProfileUserActivityItem[]> {
    const dataSource = await this.mysqlDataSourceManager.getDataSource();
    const paramsFor = (alias: string): { clause: string; params: unknown[] } => {
      const clauses = [
        `${alias}.profile_id = ?`,
        `${alias}.projection_run_id = ?`,
        `${alias}.user_id = ?`,
      ];
      const params: unknown[] = [profileId, runId, userId];
      if (options.deliveryUnitId) {
        clauses.push(`${alias}.delivery_unit_id = ?`);
        params.push(options.deliveryUnitId);
      }
      if (options.rangeSinceDate) {
        clauses.push(`${alias}.event_time >= ?`);
        params.push(options.rangeSinceDate);
      }
      return { clause: clauses.join(' AND '), params };
    };

    const capability = paramsFor('cu');
    const knowledge = paramsFor('kr');
    const writes = paramsFor('w');
    const turns = paramsFor('t');
    const code = paramsFor('ca');
    const rawLimit = expandProfileUserActivityFetchLimit(options.limit);
    const rows = (await dataSource.query(
      `SELECT * FROM (
        SELECT CONCAT('capability-', cu.id) AS id, 'capability' AS kind,
               cu.event_time, cu.interaction_id, cu.delivery_unit_id,
               NULL AS artifact_id, cu.id AS capability_usage_id,
               cu.capability_code, cu.display_name AS capability_display_name,
               cu.raw_capability_name,
               COALESCE(cu.display_name, cu.raw_capability_name, '能力调用') AS title,
               cu.status AS detail,
               it.prompt_text,
               NULL AS locator
        FROM profile_capability_usages cu
        LEFT JOIN sdd_interaction_texts it ON it.interaction_id = cu.interaction_id
        WHERE ${capability.clause}

        UNION ALL

        SELECT CONCAT('knowledge-', kr.id) AS id, 'knowledge' AS kind,
               kr.event_time, kr.interaction_id, kr.delivery_unit_id,
               NULL AS artifact_id, kr.capability_usage_id,
               cu.capability_code, cu.display_name AS capability_display_name,
               cu.raw_capability_name,
               CASE WHEN kr.action_type = 'read' THEN '知识读取' ELSE CONCAT('知识 ', COALESCE(kr.action_type, '活动')) END AS title,
               kr.knowledge_locator AS detail,
               it.prompt_text,
               kr.knowledge_locator AS locator
        FROM profile_knowledge_recalls kr
        LEFT JOIN profile_capability_usages cu ON cu.id = kr.capability_usage_id
        LEFT JOIN sdd_interaction_texts it ON it.interaction_id = kr.interaction_id
        WHERE ${knowledge.clause}

        UNION ALL

        SELECT CONCAT('artifact-write-', w.id) AS id, 'artifact_write' AS kind,
               w.event_time, w.interaction_id, w.delivery_unit_id,
               w.artifact_id, w.capability_usage_id,
               cu.capability_code, cu.display_name AS capability_display_name,
               cu.raw_capability_name,
               COALESCE(w.write_kind, '产物写入') AS title,
               w.content_preview AS detail,
               it.prompt_text,
               NULL AS locator
        FROM profile_artifact_writes w
        LEFT JOIN profile_capability_usages cu ON cu.id = w.capability_usage_id
        LEFT JOIN sdd_interaction_texts it ON it.interaction_id = w.interaction_id
        WHERE ${writes.clause}

        UNION ALL

        SELECT CONCAT('artifact-discussion-', t.id) AS id, 'artifact_discussion' AS kind,
               t.event_time, t.interaction_id, t.delivery_unit_id,
               t.artifact_id, t.capability_usage_id,
               cu.capability_code, cu.display_name AS capability_display_name,
               cu.raw_capability_name,
               '产物讨论' AS title,
               NULL AS detail,
               it.prompt_text,
               NULL AS locator
        FROM profile_artifact_turns t
        LEFT JOIN profile_capability_usages cu ON cu.id = t.capability_usage_id
        LEFT JOIN sdd_interaction_texts it ON it.interaction_id = t.interaction_id
        WHERE ${turns.clause}

        UNION ALL

        SELECT CONCAT('code-', ca.id) AS id, 'code' AS kind,
               ca.event_time, ca.interaction_id, ca.delivery_unit_id,
               NULL AS artifact_id, ca.capability_usage_id,
               cu.capability_code, cu.display_name AS capability_display_name,
               cu.raw_capability_name,
               CASE WHEN ca.action_type IN ('write','edit','update') THEN '代码实施' ELSE CONCAT('代码 ', COALESCE(ca.action_type, '活动')) END AS title,
               ca.action_type AS detail,
               it.prompt_text,
               ca.code_locator AS locator
        FROM profile_code_activities ca
        LEFT JOIN profile_capability_usages cu ON cu.id = ca.capability_usage_id
        LEFT JOIN sdd_interaction_texts it ON it.interaction_id = ca.interaction_id
        WHERE ${code.clause}
      ) activity
      ORDER BY activity.event_time IS NULL, activity.event_time DESC, activity.id DESC
      LIMIT ?`,
      [
        ...capability.params,
        ...knowledge.params,
        ...writes.params,
        ...turns.params,
        ...code.params,
        rawLimit,
      ],
    )) as Array<Record<string, unknown>>;

    const items = rows.map((row): ProfileUserActivityFactItem => ({
      id: String(row.id),
      kind: String(row.kind) as ProfileUserActivityItem['kind'],
      eventTime: toIsoDate(row.event_time),
      interactionId: row.interaction_id == null ? null : toStringId(row.interaction_id),
      deliveryUnitId: row.delivery_unit_id == null ? null : toStringId(row.delivery_unit_id),
      artifactId: row.artifact_id == null ? null : toStringId(row.artifact_id),
      capabilityUsageId: row.capability_usage_id == null ? null : toStringId(row.capability_usage_id),
      capabilityCode: (row.capability_code as string | null) ?? null,
      capabilityDisplayName: (row.capability_display_name as string | null) ?? null,
      rawCapabilityName: (row.raw_capability_name as string | null) ?? null,
      title: String(row.title ?? '活动'),
      detail: (row.detail as string | null) ?? null,
      locator: (row.locator as string | null) ?? null,
      promptText: (row.prompt_text as string | null) ?? null,
    }));
    return collapseProfileUserActivityItems(items, options.limit);
  }

  private async getUserSummary(
    runId: number,
    userId: string,
  ): Promise<Array<Record<string, unknown>>> {
    const dataSource = await this.mysqlDataSourceManager.getDataSource();
    return (await dataSource.query(
      `SELECT
        (SELECT COUNT(*) FROM profile_capability_usages cu
          WHERE cu.projection_run_id = ? AND cu.user_id = ?) AS capability_usage_count,
        (SELECT COUNT(DISTINCT cu.interaction_id) FROM profile_capability_usages cu
          WHERE cu.projection_run_id = ? AND cu.user_id = ? AND cu.interaction_id IS NOT NULL) AS interaction_count,
        (SELECT COUNT(DISTINCT cu.delivery_unit_id) FROM profile_capability_usages cu
          WHERE cu.projection_run_id = ? AND cu.user_id = ? AND cu.delivery_unit_id IS NOT NULL) AS delivery_unit_count,
        (SELECT COUNT(DISTINCT a.id) FROM profile_capability_usages cu
          JOIN profile_artifacts a ON a.projection_run_id = cu.projection_run_id AND a.delivery_unit_id = cu.delivery_unit_id
          WHERE cu.projection_run_id = ? AND cu.user_id = ? AND cu.delivery_unit_id IS NOT NULL) AS artifact_count,
        (SELECT COUNT(DISTINCT interaction_id) FROM profile_artifact_turns t
          WHERE t.projection_run_id = ? AND t.user_id = ? AND t.interaction_id IS NOT NULL) AS turn_count,
        (SELECT COUNT(DISTINCT session_id) FROM profile_capability_usages cu
          WHERE cu.projection_run_id = ? AND cu.user_id = ? AND cu.session_id IS NOT NULL) AS session_count,
        (SELECT COUNT(*) FROM profile_knowledge_recalls kr
          WHERE kr.projection_run_id = ? AND kr.user_id = ?) AS knowledge_recall_count,
        (SELECT COUNT(*) FROM profile_code_activities ca
          WHERE ca.projection_run_id = ? AND ca.user_id = ? AND ca.action_type IN ('write','edit','update')) AS code_write_count,
        (SELECT COUNT(*) FROM profile_code_activities ca
          WHERE ca.projection_run_id = ? AND ca.user_id = ? AND ca.action_type IN ('read','grep','glob')) AS code_read_count`,
      [runId, userId, runId, userId, runId, userId, runId, userId,
       runId, userId, runId, userId, runId, userId, runId, userId, runId, userId],
    )) as Array<Record<string, unknown>>;
  }

  private async getUserDeliveryUnits(
    runId: number,
    userId: string,
  ): Promise<Array<Record<string, unknown>>> {
    const dataSource = await this.mysqlDataSourceManager.getDataSource();
    return (await dataSource.query(
      `SELECT du.id, du.title,
              (SELECT GROUP_CONCAT(DISTINCT a.artifact_type) FROM profile_artifacts a
                WHERE a.projection_run_id = du.projection_run_id AND a.delivery_unit_id = du.id) AS stages,
              (SELECT MAX(cu.event_time) FROM profile_capability_usages cu
                WHERE cu.projection_run_id = du.projection_run_id AND cu.delivery_unit_id = du.id AND cu.user_id = ?) AS last_activity_at
       FROM profile_delivery_units du
       WHERE du.projection_run_id = ?
         AND EXISTS (
           SELECT 1 FROM profile_capability_usages cu
           WHERE cu.projection_run_id = du.projection_run_id AND cu.delivery_unit_id = du.id AND cu.user_id = ?
         )
       ORDER BY last_activity_at DESC`,
      [userId, runId, userId],
    )) as Array<Record<string, unknown>>;
  }

  // ── Knowledge ───────────────────────────────────────────────────────────────

  async getKnowledgeCoverage(
    profileId: string,
    runId: number,
  ): Promise<ProfileKnowledgeCoverageResponse> {
    const dataSource = await this.mysqlDataSourceManager.getDataSource();

    const totalsRows = (await dataSource.query(
      `SELECT
         COUNT(*) AS total_docs,
          COUNT(DISTINCT CASE WHEN kr.id IS NOT NULL THEN kr.knowledge_locator END) AS recalled_docs,
          COUNT(*) AS recalls,
          COUNT(DISTINCT CASE WHEN kr.knowledge_locator IS NOT NULL THEN kr.knowledge_locator END) AS distinct_recalled,
         0 AS cold_docs,
         0 AS dead_docs,
         0 AS new_unread_docs,
         0 AS orphan_paths
       FROM profile_knowledge_recalls kr
       WHERE kr.profile_id = ? AND kr.projection_run_id = ?`,
      [profileId, runId],
    )) as Array<Record<string, unknown>>;

    const t = totalsRows[0] ?? {};
    const totalDocs = toNumber(t.total_docs);
    const recalledDocs = toNumber(t.distinct_recalled);
    const coverageRate = totalDocs > 0 ? recalledDocs / totalDocs : 0;
    const namespaceSql = `COALESCE(
      NULLIF(JSON_UNQUOTE(JSON_EXTRACT(kr.evidence_json, '$.sourceNamespace')), ''),
      NULLIF(SUBSTRING_INDEX(kr.knowledge_locator, '/', 1), ''),
      'local'
    )`;

    const repoRows = (await dataSource.query(
      `SELECT
          ${namespaceSql} AS source_namespace,
          COUNT(*) AS total_docs,
          COUNT(DISTINCT kr.knowledge_locator) AS recalled_docs,
          COUNT(*) AS recalls,
          COUNT(DISTINCT kr.user_id) AS distinct_users,
          MAX(kr.event_time) AS last_recall_at
       FROM profile_knowledge_recalls kr
       WHERE kr.profile_id = ? AND kr.projection_run_id = ?
       GROUP BY ${namespaceSql}
       ORDER BY recalls DESC`,
      [profileId, runId],
    )) as Array<Record<string, unknown>>;

    const domainRows = (await dataSource.query(
      `SELECT
          ${namespaceSql} AS source_namespace,
          COALESCE(kr.knowledge_domain, 'unknown') AS domain,
          COUNT(*) AS total_docs,
          COUNT(DISTINCT kr.knowledge_locator) AS recalled_docs,
         COUNT(*) AS recalls,
         0 AS dead_docs,
         0 AS new_unread_docs,
         COUNT(DISTINCT kr.user_id) AS distinct_users,
         MAX(kr.event_time) AS last_recall_at
       FROM profile_knowledge_recalls kr
       WHERE kr.profile_id = ? AND kr.projection_run_id = ?
       GROUP BY ${namespaceSql}, COALESCE(kr.knowledge_domain, 'unknown')
       ORDER BY recalls DESC`,
      [profileId, runId],
    )) as Array<Record<string, unknown>>;

    const repos: ProfileKnowledgeCoverageRepo[] = repoRows.map((row) => {
      const recalls = toNumber(row.recalls);
      const repoTotalDocs = toNumber(row.total_docs);
      const repoRecalledDocs = toNumber(row.recalled_docs);
      return {
        sourceNamespace: String(row.source_namespace ?? 'local'),
        label: String(row.source_namespace ?? 'local'),
        totalDocs: repoTotalDocs,
        recalledDocs: repoRecalledDocs,
        coverageRate: repoTotalDocs > 0 ? repoRecalledDocs / repoTotalDocs : 0,
        recalls,
        deadDocs: 0,
        newUnreadDocs: 0,
        distinctUsers: toNumber(row.distinct_users),
      };
    });

    const domains: ProfileKnowledgeCoverageDomain[] = domainRows.map((row) => ({
      sourceNamespace: String(row.source_namespace ?? 'local'),
      domain: String(row.domain ?? ''),
      totalDocs: toNumber(row.total_docs),
      recalledDocs: toNumber(row.recalled_docs),
      recalls: toNumber(row.recalls),
      deadDocs: 0,
      newUnreadDocs: 0,
      distinctUsers: toNumber(row.distinct_users),
      lastRecallAt: toIsoDate(row.last_recall_at),
    }));

    return {
      scan: {
        configured: false,
        repos: repoRows.map((row) => ({
          sourceNamespace: String(row.source_namespace ?? 'local'),
          label: String(row.source_namespace ?? 'local'),
          gitRef: null,
          scannedAt: toIsoDate(row.last_recall_at) ?? new Date(0).toISOString(),
        })),
      },
      totals: {
        totalDocs,
        recalledDocs,
        coverageRate,
        recalls: toNumber(t.recalls),
        coldDocs: 0,
        deadDocs: 0,
        newUnreadDocs: 0,
        orphanPaths: 0,
      },
      repos,
      domains,
    };
  }

  async getKnowledgeTimeline(
    profileId: string,
    runId: number,
    query: KnowledgeTimelineOptions,
  ): Promise<{ points: ProfileKnowledgeTimelinePoint[] }> {
    const dataSource = await this.mysqlDataSourceManager.getDataSource();
    const dateExpr = query.granularity === 'day'
      ? "DATE_FORMAT(kr.event_time, '%Y-%m-%dT00:00:00.000Z')"
      : "DATE_FORMAT(kr.event_time, '%Y-%m-%dT%H:00:00.000Z')";
    const groupExpr = query.groupBy === 'axis' ? 'kr.knowledge_axis' : 'kr.knowledge_domain';
    const clauses = ['kr.profile_id = ?', 'kr.projection_run_id = ?', 'kr.event_time IS NOT NULL'];
    const params: unknown[] = [profileId, runId];
    if (query.rangeSinceDate) {
      clauses.push('kr.event_time >= ?');
      params.push(query.rangeSinceDate);
    }
    addKnowledgeDomainWhere(clauses, params, query.wikiDomain ?? null);

    const rows = (await dataSource.query(
      `SELECT
         ${dateExpr} AS bucket_ts,
         ${groupExpr} AS \`group\`,
         COUNT(*) AS count
       FROM profile_knowledge_recalls kr
       ${whereSql(clauses)}
       GROUP BY bucket_ts, \`group\`
       ORDER BY bucket_ts ASC`,
      params,
    )) as Array<Record<string, unknown>>;

    return {
      points: rows.map((row) => ({
        t: toIsoDate(row.bucket_ts) ?? '',
        group: (row.group as string | null) ?? null,
        count: toNumber(row.count),
      })),
    };
  }

  async listKnowledgeRecalls(
    profileId: string,
    runId: number,
    query: { page: number; pageSize: number; rangeSinceDate?: Date | null; deliveryUnitId?: string; userId?: string; capabilityUsageId?: string },
  ): Promise<{ items: ProfileKnowledgeRecallItem[]; total: number }> {
    const dataSource = await this.mysqlDataSourceManager.getDataSource();
    const clauses = ['kr.profile_id = ?', 'kr.projection_run_id = ?'];
    const params: unknown[] = [profileId, runId];

    if (query.deliveryUnitId) {
      clauses.push('kr.delivery_unit_id = ?');
      params.push(query.deliveryUnitId);
    }
    if (query.userId) {
      clauses.push('kr.user_id = ?');
      params.push(query.userId);
    }
    if (query.capabilityUsageId) {
      clauses.push('kr.capability_usage_id = ?');
      params.push(query.capabilityUsageId);
    }
    if (query.rangeSinceDate) {
      clauses.push('kr.event_time >= ?');
      params.push(query.rangeSinceDate);
    }

    const offset = (query.page - 1) * query.pageSize;

    const countRows = (await dataSource.query(
      `SELECT COUNT(*) AS v FROM profile_knowledge_recalls kr ${whereSql(clauses)}`,
      params,
    )) as Array<Record<string, unknown>>;

    const rows = (await dataSource.query(
      `SELECT kr.id, kr.tool_call_id, kr.interaction_id, kr.capability_usage_id,
              kr.delivery_unit_id, kr.user_id,
              su.user_name AS user_name,
              kr.action_type, kr.knowledge_locator,
              JSON_UNQUOTE(JSON_EXTRACT(kr.evidence_json, '$.relative')) AS knowledge_relative_path,
              kr.knowledge_domain,
              kr.knowledge_axis, kr.knowledge_system,
              kr.event_time
       FROM profile_knowledge_recalls kr
       LEFT JOIN sdd_users su ON su.id = kr.user_id
       ${whereSql(clauses)}
       ORDER BY kr.event_time DESC, kr.id DESC
       LIMIT ? OFFSET ?`,
      [...params, query.pageSize, offset],
    )) as Array<Record<string, unknown>>;

    const items: ProfileKnowledgeRecallItem[] = rows.map((row) => ({
      id: toStringId(row.id),
      toolCallId: row.tool_call_id == null ? null : toStringId(row.tool_call_id),
      interactionId: row.interaction_id == null ? null : toStringId(row.interaction_id),
      capabilityUsageId: row.capability_usage_id == null ? null : toStringId(row.capability_usage_id),
      deliveryUnitId: row.delivery_unit_id == null ? null : toStringId(row.delivery_unit_id),
      userId: row.user_id == null ? null : toStringId(row.user_id),
      userName: (row.user_name as string | null) ?? null,
      actionType: String(row.action_type ?? ''),
      rawLocator: (row.knowledge_locator as string | null) ?? null,
      knowledgeRelativePath:
        (row.knowledge_relative_path as string | null) ?? (row.knowledge_locator as string | null) ?? null,
      knowledgeDomain: (row.knowledge_domain as string | null) ?? null,
      knowledgeAxis: (row.knowledge_axis as string | null) ?? null,
      knowledgeSystem: (row.knowledge_system as string | null) ?? null,
      eventSequence: null,
      eventTime: toIsoDate(row.event_time),
    }));

    return { items, total: toNumber(countRows[0]?.v) };
  }

  async getKnowledgeDeliveryUnitRanking(
    profileId: string,
    runId: number,
    query: KnowledgeFilterOptions = {},
  ): Promise<{ items: Array<{ deliveryUnitId: string; unitSlug: string | null; businessDomain: string | null; totalRecalls: number; distinctDomains: number; distinctSystems: number; userCount: number }>; total: number }> {
    const dataSource = await this.mysqlDataSourceManager.getDataSource();
    const clauses = ['kr.profile_id = ?', 'kr.projection_run_id = ?', 'kr.delivery_unit_id IS NOT NULL'];
    const params: unknown[] = [profileId, runId];
    if (query.rangeSinceDate) {
      clauses.push('kr.event_time >= ?');
      params.push(query.rangeSinceDate);
    }
    addKnowledgeDomainWhere(clauses, params, query.wikiDomain ?? null);
    if (query.userId) {
      clauses.push('kr.user_id = ?');
      params.push(query.userId);
    }

    const rows = (await dataSource.query(
      `SELECT
         kr.delivery_unit_id,
         du.unit_slug,
         du.business_domain,
         COUNT(*) AS total_recalls,
         COUNT(DISTINCT kr.knowledge_domain) AS distinct_domains,
         COUNT(DISTINCT kr.knowledge_system) AS distinct_systems,
         COUNT(DISTINCT kr.user_id) AS user_count
       FROM profile_knowledge_recalls kr
       LEFT JOIN profile_delivery_units du ON du.id = kr.delivery_unit_id AND du.projection_run_id = kr.projection_run_id
       ${whereSql(clauses)}
       GROUP BY kr.delivery_unit_id, du.unit_slug, du.business_domain
       ORDER BY total_recalls DESC`,
      params,
    )) as Array<Record<string, unknown>>;

    return {
      items: rows.map((row) => ({
        deliveryUnitId: toStringId(row.delivery_unit_id),
        unitSlug: (row.unit_slug as string | null) ?? null,
        businessDomain: (row.business_domain as string | null) ?? null,
        totalRecalls: toNumber(row.total_recalls),
        distinctDomains: toNumber(row.distinct_domains),
        distinctSystems: toNumber(row.distinct_systems),
        userCount: toNumber(row.user_count),
      })),
      total: rows.length,
    };
  }
}

function toProjectionRun(row: Record<string, unknown>): ProfileInspectorProjectionRun {
  return {
    id: toStringId(row.id),
    profileConfigVersionId: row.profile_config_version_id == null ? null : toStringId(row.profile_config_version_id),
    runType: String(row.run_type ?? ''),
    status: String(row.status ?? ''),
    startedAt: toIsoDate(row.started_at),
    completedAt: toIsoDate(row.completed_at),
    projectionDefinitionHash: (row.projection_definition_hash as string | null) ?? null,
    resolvedConfigHash: (row.resolved_config_hash as string | null) ?? null,
    stats: toRecord(row.stats_json),
    errorMessage: (row.error_message as string | null) ?? null,
  };
}

function toRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  if (typeof value === 'string' && value.trim()) {
    try {
      const parsed = JSON.parse(value) as unknown;
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      return {};
    }
  }
  return {};
}

function emptyFactCounts(): ProfileInspectorFactCounts {
  return {
    deliveryUnits: 0,
    artifacts: 0,
    artifactWrites: 0,
    artifactTurns: 0,
    capabilityUsages: 0,
    knowledgeRecalls: 0,
    codeActivities: 0,
  };
}

function addKnowledgeDomainWhere(clauses: string[], params: unknown[], wikiDomain: string | null): void {
  if (wikiDomain === ROOT_DOMAIN_LABEL) {
    clauses.push('kr.knowledge_domain IS NULL');
  } else if (wikiDomain) {
    clauses.push('kr.knowledge_domain = ?');
    params.push(wikiDomain);
  }
}
