import { Inject, Provide } from '@midwayjs/core';
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
  ProfileOverview,
  ProfileOverviewQuery,
  ProfileUserDeliveryUnit,
  ProfileUserDetail,
  ProfileUserItem,
  ProfileUserMaturity,
  ProfileUserMaturityStage,
  ProfileUserSummary,
  ProfileUsersQuery,
} from '@sdd-telemetry/api';
import { MysqlDataSourceManager } from '../../infrastructure/mysql/data-source-manager';
import { addTimeRangeWhere, toIsoDate, toNumber, toStringId, whereSql } from '../query-utils';

/**
 * profile_projection 读路径（MVP-1，Task 17）。
 * 只读 current pointer 指向的 completed run，时间范围/文档类型口径对齐旧 overview。
 */

const OVERVIEW_DOCUMENT_TYPES = ['proposal', 'design', 'task', 'codereview'] as const;

interface CountRow {
  v: number | string | null;
}

@Provide('profileProjectionRepository')
export class ProfileProjectionRepository {
  @Inject('mysqlDataSourceManager')
  mysqlDataSourceManager!: MysqlDataSourceManager;

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
        count(
          'profile_artifacts',
          'COALESCE(first_seen_at, last_seen_at)',
          [`artifact_type IN (${OVERVIEW_DOCUMENT_TYPES.map(() => '?').join(',')})`],
          [...OVERVIEW_DOCUMENT_TYPES],
        ),
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

    const [unitRows] = await dataSource.query(
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
    ) as [Array<Record<string, unknown>>, unknown];
    const rows = unitRows as Array<Record<string, unknown>>;
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
  ): Promise<ProfileCapabilityAnalytics> {
    const dataSource = await this.mysqlDataSourceManager.getDataSource();

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
           SUM(CASE WHEN cu.trigger_source = 'user' THEN 1 ELSE 0 END) AS user_triggered_count,
           SUM(CASE WHEN cu.trigger_source = 'auto' THEN 1 ELSE 0 END) AS auto_triggered_count
         FROM profile_capability_usages cu
         ${whereSql(clauses)}`,
        params,
      ) as Promise<Array<Record<string, unknown>>>;
    };

    const multiStageQuery = () => {
      const { clauses, params } = buildClauses([]);
      return dataSource.query(
        `SELECT COUNT(DISTINCT du.id) AS v
         FROM profile_delivery_units du
         WHERE du.profile_id = ? AND du.projection_run_id = ?
           AND (
             SELECT COUNT(DISTINCT a.artifact_type)
             FROM profile_artifacts a
             WHERE a.projection_run_id = du.projection_run_id AND a.delivery_unit_id = du.id
           ) >= 2`,
        [profileId, runId],
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
      [bucketSeconds, bucketSeconds, ...params.slice(2)],
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
         cu.capability_code,
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
              cu.session_id, cu.prompt_id, cu.event_time
       FROM profile_capability_usages cu
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
    }));

    return { items, total: toNumber(countRows[0]?.v) };
  }

  // ── Users ────────────────────────────────────────────────────────────────────

  async listUsers(
    profileId: string,
    runId: number,
    query: ProfileUsersQuery,
  ): Promise<{ items: ProfileUserItem[]; total: number }> {
    const dataSource = await this.mysqlDataSourceManager.getDataSource();
    const clauses = ['u.profile_id = ?', 'u.projection_run_id = ?'];
    const params: unknown[] = [profileId, runId];
    addTimeRangeWhere(clauses, params, 'u.last_seen_at', query);

    if (query.status && query.status !== 'live' && query.status !== 'cold' && query.status !== 'churn') {
      // no-op
    }
    if (query.keyword) {
      clauses.push('(u.display_name LIKE ? OR u.user_key LIKE ?)');
      const kw = `%${query.keyword}%`;
      params.push(kw, kw);
    }

    const offset = (query.page - 1) * query.pageSize;

    const countRows = (await dataSource.query(
      `SELECT COUNT(*) AS v FROM profile_users u ${whereSql(clauses)}`,
      params,
    )) as Array<Record<string, unknown>>;

    const rows = (await dataSource.query(
      `SELECT u.id, u.user_key, u.install_id, u.display_name, u.machine_id, u.machine_name,
              u.first_seen_at, u.last_seen_at,
              (SELECT COUNT(*) FROM profile_capability_usages cu
                WHERE cu.projection_run_id = u.projection_run_id AND cu.user_id = u.id) AS capability_usage_count,
              (SELECT COUNT(DISTINCT cu.interaction_id) FROM profile_capability_usages cu
                WHERE cu.projection_run_id = u.projection_run_id AND cu.user_id = u.id AND cu.interaction_id IS NOT NULL) AS interaction_count,
              (SELECT COUNT(DISTINCT cu.delivery_unit_id) FROM profile_capability_usages cu
                WHERE cu.projection_run_id = u.projection_run_id AND cu.user_id = u.id AND cu.delivery_unit_id IS NOT NULL) AS delivery_unit_count,
              (SELECT GROUP_CONCAT(DISTINCT cu.capability_code) FROM profile_capability_usages cu
                WHERE cu.projection_run_id = u.projection_run_id AND cu.user_id = u.id AND cu.capability_code IS NOT NULL) AS capability_stages,
              (SELECT COUNT(*) FROM profile_artifacts a
                WHERE a.projection_run_id = u.projection_run_id AND a.user_id = u.id) AS artifact_count,
              (SELECT COUNT(*) FROM profile_knowledge_recalls kr
                WHERE kr.projection_run_id = u.projection_run_id AND kr.user_id = u.id) AS knowledge_recall_count,
              (SELECT COUNT(*) FROM profile_code_activities ca
                WHERE ca.projection_run_id = u.projection_run_id AND ca.user_id = u.id AND ca.action_type IN ('write','edit','update')) AS code_write_count,
              (SELECT COUNT(*) FROM profile_code_activities ca
                WHERE ca.projection_run_id = u.projection_run_id AND ca.user_id = u.id AND ca.action_type IN ('read','grep','glob')) AS code_read_count
       FROM profile_users u
       ${whereSql(clauses)}
       ORDER BY u.last_seen_at DESC, u.id DESC
       LIMIT ? OFFSET ?`,
      [...params, query.pageSize, offset],
    )) as Array<Record<string, unknown>>;

    const items: ProfileUserItem[] = rows.map((row) => {
      const lastSeen = row.last_seen_at ? new Date(String(row.last_seen_at)).getTime() : 0;
      const firstSeen = row.first_seen_at ? new Date(String(row.first_seen_at)).getTime() : 0;
      const now = Date.now();
      const liveThreshold = 14 * 86_400_000;
      const churnThreshold = 60 * 86_400_000;

      let status: 'live' | 'cold' | 'churn' = 'cold';
      if (lastSeen > 0 && now - lastSeen <= liveThreshold) status = 'live';
      else if (lastSeen === 0 || now - lastSeen > churnThreshold) status = 'churn';

      const rampDays = firstSeen > 0 ? Math.round((now - firstSeen) / 86_400_000) : null;
      const isNew = firstSeen > 0 && now - firstSeen <= 30 * 86_400_000;

      return {
        id: toStringId(row.id),
        userKey: String(row.user_key ?? ''),
        installId: (row.install_id as string | null) ?? null,
        displayName: (row.display_name as string | null) ?? null,
        machineId: (row.machine_id as string | null) ?? null,
        machineName: (row.machine_name as string | null) ?? null,
        firstSeenAt: toIsoDate(row.first_seen_at),
        lastSeenAt: toIsoDate(row.last_seen_at),
        capabilityUsageCount: toNumber(row.capability_usage_count),
        interactionCount: toNumber(row.interaction_count),
        deliveryUnitCount: toNumber(row.delivery_unit_count),
        capabilityStages: row.capability_stages ? String(row.capability_stages).split(',').filter(Boolean) : [],
        status,
        isNew,
        artifactCount: toNumber(row.artifact_count),
        knowledgeRecallCount: toNumber(row.knowledge_recall_count),
        codeWriteCount: toNumber(row.code_write_count),
        codeReadCount: toNumber(row.code_read_count),
        rampDays,
      };
    });

    return { items, total: toNumber(countRows[0]?.v) };
  }

  async getUserDetail(
    profileId: string,
    runId: number,
    userId: string,
  ): Promise<ProfileUserDetail | null> {
    const dataSource = await this.mysqlDataSourceManager.getDataSource();

    const userRows = (await dataSource.query(
      `SELECT u.id, u.user_key, u.install_id, u.display_name, u.machine_id, u.machine_name,
              u.first_seen_at, u.last_seen_at
       FROM profile_users u
       WHERE u.profile_id = ? AND u.projection_run_id = ? AND u.id = ?
       LIMIT 1`,
      [profileId, runId, userId],
    )) as Array<Record<string, unknown>>;

    if (userRows.length === 0) return null;

    const row = userRows[0]!;
    const lastSeen = row.last_seen_at ? new Date(String(row.last_seen_at)).getTime() : 0;
    const firstSeen = row.first_seen_at ? new Date(String(row.first_seen_at)).getTime() : 0;
    const now = Date.now();
    const liveThreshold = 14 * 86_400_000;
    const churnThreshold = 60 * 86_400_000;

    let status: 'live' | 'cold' | 'churn' = 'cold';
    if (lastSeen > 0 && now - lastSeen <= liveThreshold) status = 'live';
    else if (lastSeen === 0 || now - lastSeen > churnThreshold) status = 'churn';

    const isNew = firstSeen > 0 && now - firstSeen <= 30 * 86_400_000;
    const rampDays = firstSeen > 0 ? Math.round((now - firstSeen) / 86_400_000) : null;

    const [summaryRows, deliveryUnitRows, maturityRows] = await Promise.all([
      this.getUserSummary(runId, userId),
      this.getUserDeliveryUnits(runId, userId),
      this.getUserMaturity(runId, userId),
    ]);

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
      firstSeenAt: toIsoDate(row.first_seen_at),
      lastSeenAt: toIsoDate(row.last_seen_at),
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

    const m = maturityRows[0] ?? {};
    const maturity: ProfileUserMaturity = {
      stages: this.computeMaturityStages(user),
      completionRate: this.computeMaturityCompletion(user),
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
        (SELECT COUNT(*) FROM profile_artifacts a
          WHERE a.projection_run_id = ? AND a.user_id = ?) AS artifact_count,
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

  private async getUserMaturity(
    runId: number,
    _userId: string,
  ): Promise<Array<Record<string, unknown>>> {
    return [{}];
  }

  private computeMaturityStages(user: ProfileUserItem): ProfileUserMaturityStage[] {
    const stages: ProfileUserMaturityStage[] = [];
    const now = new Date().toISOString();
    if (user.capabilityUsageCount > 0) {
      stages.push({ stage: 'first_capability_use', firstReachedAt: user.firstSeenAt ?? now });
    }
    if (user.deliveryUnitCount > 0) {
      stages.push({ stage: 'first_delivery_contribution', firstReachedAt: user.firstSeenAt ?? now });
    }
    if (user.knowledgeRecallCount > 0) {
      stages.push({ stage: 'first_knowledge_recall', firstReachedAt: user.firstSeenAt ?? now });
    }
    if (user.codeWriteCount > 0) {
      stages.push({ stage: 'first_code_write', firstReachedAt: user.firstSeenAt ?? now });
    }
    return stages;
  }

  private computeMaturityCompletion(user: ProfileUserItem): number {
    const total = 4;
    let reached = 0;
    if (user.capabilityUsageCount > 0) reached++;
    if (user.deliveryUnitCount > 0) reached++;
    if (user.knowledgeRecallCount > 0) reached++;
    if (user.codeWriteCount > 0) reached++;
    return reached / total;
  }
}
