import { Inject, Provide } from '@midwayjs/core';
import { MysqlDataSourceManager } from '../../infrastructure/mysql/data-source-manager';
import { toNumber } from '../query-utils';

export interface DailyReportRow {
  id: string | number;
  report_date: string;
  timezone: string;
  period_start: Date | string;
  period_end: Date | string;
  status: string;
  metrics_json: string;
  markdown_text: string;
  html_snapshot: string | null;
  data_health_json: string | null;
  template_version: string;
  query_version: string;
  generated_at: Date | string;
  generated_by: string;
  error_message: string | null;
}

export interface DailyReportSummaryRow {
  id: string | number;
  report_date: string;
  status: string;
  generated_at: Date | string;
  generated_by: string;
  error_message: string | null;
}

export interface DailyReportCodeImpactRow {
  toolName: string;
  toolInputPreview: string | null;
  userId: string | number | null;
  requirementsRootPath: string | null;
  wikiRootPath: string | null;
}

@Provide('dailyReportRepository')
export class DailyReportRepository {
  @Inject('mysqlDataSourceManager')
  mysqlDataSourceManager!: MysqlDataSourceManager;

  async findByDate(reportDate: string): Promise<DailyReportRow | null> {
    const dataSource = await this.mysqlDataSourceManager.getDataSource();
    const rows = (await dataSource.query(
      `SELECT * FROM sdd_daily_reports WHERE report_date = ? LIMIT 1`,
      [reportDate],
    )) as DailyReportRow[];
    return rows[0] ?? null;
  }

  async findLatest(): Promise<DailyReportRow | null> {
    const dataSource = await this.mysqlDataSourceManager.getDataSource();
    const rows = (await dataSource.query(
      `SELECT * FROM sdd_daily_reports WHERE status = 'generated' ORDER BY report_date DESC LIMIT 1`,
    )) as DailyReportRow[];
    return rows[0] ?? null;
  }

  async listReports(
    from: string | undefined,
    to: string | undefined,
    pageSize: number,
    offset: number,
  ): Promise<{ items: DailyReportSummaryRow[]; total: string | number }> {
    const dataSource = await this.mysqlDataSourceManager.getDataSource();
    const clauses: string[] = [];
    const params: unknown[] = [];
    if (from) {
      clauses.push('report_date >= ?');
      params.push(from);
    }
    if (to) {
      clauses.push('report_date <= ?');
      params.push(to);
    }
    const where = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';

    const items = (await dataSource.query(
      `SELECT id, report_date, status, generated_at, generated_by, error_message
       FROM sdd_daily_reports ${where}
       ORDER BY report_date DESC
       LIMIT ? OFFSET ?`,
      [...params, pageSize, offset],
    )) as DailyReportSummaryRow[];

    const totalRows = (await dataSource.query(
      `SELECT COUNT(*) AS total FROM sdd_daily_reports ${where}`,
      params,
    )) as Array<{ total: string | number }>;

    return { items, total: toNumber(totalRows[0]?.total) };
  }

  async upsertReport(report: {
    reportDate: string;
    timezone: string;
    periodStart: Date;
    periodEnd: Date;
    status: string;
    metricsJson: string;
    markdownText: string;
    dataHealthJson: string | null;
    templateVersion: string;
    queryVersion: string;
    generatedAt: Date;
    generatedBy: string;
    errorMessage: string | null;
  }): Promise<void> {
    const dataSource = await this.mysqlDataSourceManager.getDataSource();
    await dataSource.query(
      `INSERT INTO sdd_daily_reports
        (report_date, timezone, period_start, period_end, status,
         metrics_json, markdown_text, data_health_json,
         template_version, query_version,
         generated_at, generated_by, error_message,
         gmt_create, gmt_modified)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
         CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3))
       ON DUPLICATE KEY UPDATE
         period_start = VALUES(period_start),
         period_end = VALUES(period_end),
         status = VALUES(status),
         metrics_json = VALUES(metrics_json),
         markdown_text = VALUES(markdown_text),
         data_health_json = VALUES(data_health_json),
         template_version = VALUES(template_version),
         query_version = VALUES(query_version),
         generated_at = VALUES(generated_at),
         generated_by = VALUES(generated_by),
          error_message = VALUES(error_message),
         gmt_modified = CURRENT_TIMESTAMP(3)`,
      [
        report.reportDate,
        report.timezone,
        report.periodStart,
        report.periodEnd,
        report.status,
        report.metricsJson,
        report.markdownText,
        report.dataHealthJson,
        report.templateVersion,
        report.queryVersion,
        report.generatedAt,
        report.generatedBy,
        report.errorMessage,
      ],
    );
  }

  async countDistinctUsers(periodStart: string, periodEnd: string): Promise<number> {
    const dataSource = await this.mysqlDataSourceManager.getDataSource();
    const rows = (await dataSource.query(
      `SELECT COUNT(DISTINCT user_id) AS cnt FROM sdd_skill_usages
       WHERE event_time >= ? AND event_time < ?`,
      [periodStart, periodEnd],
    )) as Array<{ cnt: string | number }>;
    return toNumber(rows[0]?.cnt);
  }

  async countSkillUsages(periodStart: string, periodEnd: string): Promise<number> {
    const dataSource = await this.mysqlDataSourceManager.getDataSource();
    const rows = (await dataSource.query(
      `SELECT COUNT(*) AS cnt FROM sdd_skill_usages
       WHERE event_time >= ? AND event_time < ?`,
      [periodStart, periodEnd],
    )) as Array<{ cnt: string | number }>;
    return toNumber(rows[0]?.cnt);
  }

  async countCoveredWorkItems(periodStart: string, periodEnd: string): Promise<number> {
    const dataSource = await this.mysqlDataSourceManager.getDataSource();
    const rows = (await dataSource.query(
      `SELECT COUNT(DISTINCT work_item_id) AS cnt FROM sdd_skill_usages
       WHERE event_time >= ? AND event_time < ?`,
      [periodStart, periodEnd],
    )) as Array<{ cnt: string | number }>;
    return toNumber(rows[0]?.cnt);
  }

  async countDocumentOutputs(periodStart: string, periodEnd: string): Promise<number> {
    const dataSource = await this.mysqlDataSourceManager.getDataSource();
    const rows = (await dataSource.query(
      `SELECT COUNT(DISTINCT artifact_id) AS cnt FROM sdd_work_item_artifact_writes
       WHERE event_time >= ? AND event_time < ?`,
      [periodStart, periodEnd],
    )) as Array<{ cnt: string | number }>;
    return toNumber(rows[0]?.cnt);
  }

  async countWikiRecalls(periodStart: string, periodEnd: string): Promise<number> {
    const dataSource = await this.mysqlDataSourceManager.getDataSource();
    const rows = (await dataSource.query(
      `SELECT COUNT(*) AS cnt FROM sdd_wiki_recalls
       WHERE event_time >= ? AND event_time < ?`,
      [periodStart, periodEnd],
    )) as Array<{ cnt: string | number }>;
    return toNumber(rows[0]?.cnt);
  }

  async countWikiDistinctFiles(periodStart: string, periodEnd: string): Promise<number> {
    const dataSource = await this.mysqlDataSourceManager.getDataSource();
    const rows = (await dataSource.query(
      `SELECT COUNT(DISTINCT wiki_relative_path) AS cnt FROM sdd_wiki_recalls
       WHERE event_time >= ? AND event_time < ? AND wiki_relative_path IS NOT NULL`,
      [periodStart, periodEnd],
    )) as Array<{ cnt: string | number }>;
    return toNumber(rows[0]?.cnt);
  }

  async countWikiDistinctDomains(periodStart: string, periodEnd: string): Promise<number> {
    const dataSource = await this.mysqlDataSourceManager.getDataSource();
    const rows = (await dataSource.query(
      `SELECT COUNT(DISTINCT wiki_domain) AS cnt FROM sdd_wiki_recalls
       WHERE event_time >= ? AND event_time < ? AND wiki_domain IS NOT NULL`,
      [periodStart, periodEnd],
    )) as Array<{ cnt: string | number }>;
    return toNumber(rows[0]?.cnt);
  }

  async topWikiDomains(
    periodStart: string,
    periodEnd: string,
    limit: number,
  ): Promise<Array<{ domain: string; count: number }>> {
    const dataSource = await this.mysqlDataSourceManager.getDataSource();
    const rows = await dataSource.query(
      `SELECT wiki_domain AS domain, COUNT(*) AS count
       FROM sdd_wiki_recalls
       WHERE event_time >= ? AND event_time < ? AND wiki_domain IS NOT NULL
       GROUP BY wiki_domain
       ORDER BY count DESC
       LIMIT ?`,
      [periodStart, periodEnd, limit],
    );
    return (rows as Array<{ domain: string; count: string | number }>).map(r => ({
      domain: r.domain,
      count: toNumber(r.count),
    }));
  }

  async listCodeImpactRows(
    periodStart: string,
    periodEnd: string,
  ): Promise<DailyReportCodeImpactRow[]> {
    const dataSource = await this.mysqlDataSourceManager.getDataSource();
    return (await dataSource.query(
      `SELECT tc.tool_name AS toolName,
              tc.tool_input_preview AS toolInputPreview,
              i.user_id AS userId,
              u.requirements_root_path AS requirementsRootPath,
              u.wiki_root_path AS wikiRootPath
       FROM sdd_interaction_tool_calls tc
       JOIN sdd_interactions i ON i.id = tc.interaction_id
       LEFT JOIN sdd_users u ON u.id = i.user_id
       WHERE i.started_at >= ? AND i.started_at < ?
         AND tc.tool_name IN ('Write', 'Edit', 'MultiEdit', 'Read', 'Grep', 'Glob')
         AND (
           tc.skill_usage_id IS NOT NULL
           OR EXISTS (
             SELECT 1 FROM sdd_skill_usages su
             WHERE su.interaction_id = i.id
             LIMIT 1
           )
         )`,
      [periodStart, periodEnd],
    )) as DailyReportCodeImpactRow[];
  }

  async countStageCoverage(
    periodStart: string,
    periodEnd: string,
  ): Promise<
    Array<{
      artifact_type: string;
      work_item_count: string | number;
    }>
  > {
    const dataSource = await this.mysqlDataSourceManager.getDataSource();
    return dataSource.query(
      `SELECT
         CASE WHEN a.artifact_type = 'codereview' THEN 'review' ELSE a.artifact_type END AS artifact_type,
         COUNT(DISTINCT a.work_item_id) AS work_item_count
       FROM sdd_work_item_artifacts a
       WHERE a.artifact_type IN ('proposal', 'design', 'task', 'review', 'codereview')
         AND a.work_item_id IN (
           SELECT DISTINCT su.work_item_id
           FROM sdd_skill_usages su
           WHERE su.event_time >= ? AND su.event_time < ?
         )
       GROUP BY CASE WHEN a.artifact_type = 'codereview' THEN 'review' ELSE a.artifact_type END`,
      [periodStart, periodEnd],
    );
  }

  async countFullChainWorkItems(
    periodStart: string,
    periodEnd: string,
  ): Promise<number> {
    const dataSource = await this.mysqlDataSourceManager.getDataSource();
    const rows = (await dataSource.query(
      `SELECT COUNT(*) AS cnt FROM (
         SELECT su.work_item_id
         FROM sdd_skill_usages su
         WHERE su.event_time >= ? AND su.event_time < ?
         GROUP BY su.work_item_id
         HAVING (
           SELECT COUNT(DISTINCT
             CASE WHEN a.artifact_type = 'codereview' THEN 'review' ELSE a.artifact_type END
           ) FROM sdd_work_item_artifacts a WHERE a.work_item_id = su.work_item_id
         ) >= 3
       ) sub`,
      [periodStart, periodEnd],
    )) as Array<{ cnt: string | number }>;
    return toNumber(rows[0]?.cnt);
  }

  async countMultiStageWorkItems(
    periodStart: string,
    periodEnd: string,
  ): Promise<number> {
    const dataSource = await this.mysqlDataSourceManager.getDataSource();
    const rows = (await dataSource.query(
      `SELECT COUNT(*) AS cnt FROM (
         SELECT su.work_item_id
         FROM sdd_skill_usages su
         WHERE su.event_time >= ? AND su.event_time < ?
         GROUP BY su.work_item_id
          HAVING (
            SELECT COUNT(DISTINCT
              CASE WHEN a.artifact_type = 'codereview' THEN 'review' ELSE a.artifact_type END
            )
            FROM sdd_work_item_artifacts a WHERE a.work_item_id = su.work_item_id
          ) >= 2
       ) sub`,
      [periodStart, periodEnd],
    )) as Array<{ cnt: string | number }>;
    return toNumber(rows[0]?.cnt);
  }

  async listBenchmarks(
    periodStart: string,
    periodEnd: string,
    limit: number,
  ): Promise<
    Array<{
      work_item_id: string | number;
      work_item_title: string | null;
      work_item_slug: string;
      business_domain: string | null;
      stage_codes_csv: string | null;
      document_count: string | number;
      write_count: string | number;
      contributor_count: string | number;
      wiki_recall_count: string | number;
      usage_count: string | number;
    }>
  > {
    const dataSource = await this.mysqlDataSourceManager.getDataSource();
    return dataSource.query(
      `SELECT
         wi.id AS work_item_id,
         wi.work_item_title,
         wi.work_item_slug,
         wi.business_domain,
         (SELECT GROUP_CONCAT(DISTINCT a.artifact_type)
          FROM sdd_work_item_artifacts a WHERE a.work_item_id = wi.id) AS stage_codes_csv,
         (SELECT COUNT(DISTINCT a.id)
          FROM sdd_work_item_artifacts a WHERE a.work_item_id = wi.id) AS document_count,
         (SELECT COUNT(DISTINCT w.id)
          FROM sdd_work_item_artifact_writes w
          WHERE w.work_item_id = wi.id AND w.event_time >= ? AND w.event_time < ?) AS write_count,
         (SELECT COUNT(DISTINCT su.user_id)
          FROM sdd_skill_usages su
          WHERE su.work_item_id = wi.id AND su.event_time >= ? AND su.event_time < ?) AS contributor_count,
          (SELECT COUNT(*)
           FROM sdd_wiki_recalls wr
           LEFT JOIN sdd_skill_usages su2 ON su2.id = wr.skill_usage_id
           WHERE COALESCE(wr.work_item_id, su2.work_item_id) = wi.id
             AND wr.event_time >= ? AND wr.event_time < ?
          ) AS wiki_recall_count,
         (SELECT COUNT(*)
          FROM sdd_skill_usages su3
          WHERE su3.work_item_id = wi.id AND su3.event_time >= ? AND su3.event_time < ?) AS usage_count
       FROM sdd_work_items wi
       WHERE EXISTS (
         SELECT 1 FROM sdd_skill_usages su
         WHERE su.work_item_id = wi.id AND su.event_time >= ? AND su.event_time < ?
       )
       ORDER BY document_count DESC, usage_count DESC
      LIMIT ?`,
      [
        periodStart, periodEnd,
        periodStart, periodEnd,
        periodStart, periodEnd,
        periodStart, periodEnd,
        periodStart, periodEnd,
        limit,
      ]
    );
  }

  async countOutboxPending(): Promise<number> {
    const dataSource = await this.mysqlDataSourceManager.getDataSource();
    const rows = (await dataSource.query(
      `SELECT COUNT(*) AS cnt FROM ingest_outbox WHERE status = 'pending'`,
    )) as Array<{ cnt: string | number }>;
    return toNumber(rows[0]?.cnt);
  }

  async countOutboxFailed(): Promise<number> {
    const dataSource = await this.mysqlDataSourceManager.getDataSource();
    const rows = (await dataSource.query(
      `SELECT COUNT(*) AS cnt FROM ingest_outbox WHERE status = 'failed_terminal'`,
    )) as Array<{ cnt: string | number }>;
    return toNumber(rows[0]?.cnt);
  }

  async countFailedBatches(periodStart: string, periodEnd: string): Promise<number> {
    const dataSource = await this.mysqlDataSourceManager.getDataSource();
    const rows = (await dataSource.query(
      `SELECT COUNT(*) AS cnt FROM otel_ingest_batches
       WHERE status = 'failed_terminal' AND received_at >= ? AND received_at < ?`,
      [periodStart, periodEnd],
    )) as Array<{ cnt: string | number }>;
    return toNumber(rows[0]?.cnt);
  }
}
