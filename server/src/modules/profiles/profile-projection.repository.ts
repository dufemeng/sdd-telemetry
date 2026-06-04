import { Inject, Provide } from '@midwayjs/core';
import type {
  ProfileArtifactTimelineItem,
  ProfileDemand,
  ProfileDemandArtifact,
  ProfileDemandDetail,
  ProfileOverview,
  ProfileOverviewQuery,
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
}
