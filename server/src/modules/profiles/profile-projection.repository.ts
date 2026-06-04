import { Inject, Provide } from '@midwayjs/core';
import type {
  ProfileDemand,
  ProfileOverview,
  ProfileOverviewQuery,
} from '@sdd-telemetry/api';
import { MysqlDataSourceManager } from '../../infrastructure/mysql/data-source-manager';
import { addTimeRangeWhere, toIsoDate, toNumber, whereSql } from '../query-utils';

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

  /** 当前可读 run id；无指针返回 null（调用方回退 legacy）。 */
  async getCurrentRunId(profileId: string): Promise<number | null> {
    const dataSource = await this.mysqlDataSourceManager.getDataSource();
    const rows = (await dataSource.query(
      `SELECT current_projection_run_id AS v
       FROM profile_current_projection_runs WHERE profile_id = ?`,
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
                WHERE a.projection_run_id = du.projection_run_id AND a.delivery_unit_id = du.id) AS stages
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
      coverageStages: row.stages ? String(row.stages).split(',').filter(Boolean) : [],
    }));
  }
}
