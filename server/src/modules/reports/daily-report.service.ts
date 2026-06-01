import { Config, Inject, Provide } from '@midwayjs/core';
import type {
  DailyReportDetailResponse,
  DailyReportListItem,
  DailyReportListResponse,
  DailyReportMetrics,
  MetricDelta,
} from '@sdd-telemetry/api';
import { DailyReportRepository } from './daily-report.repository';
import { renderHeadline, renderMarkdown } from './daily-report-renderer';

const TEMPLATE_VERSION = 'daily-report-v1';
const QUERY_VERSION = 'daily-report-query-v1';
const STAGE_MAP: Record<string, { code: 'proposal' | 'design' | 'task' | 'review'; label: string }> = {
  proposal: { code: 'proposal', label: '需求撰写' },
  design: { code: 'design', label: '系统设计' },
  task: { code: 'task', label: '任务拆分' },
  review: { code: 'review', label: '代码评审' },
  codereview: { code: 'review', label: '代码评审' },
};

@Provide('dailyReportService')
export class DailyReportService {
  @Inject('dailyReportRepository')
  repo!: DailyReportRepository;

  @Config('dailyReport')
  dailyReportConfig!: { baseUrl: string };

  async generateDailyReport(reportDate: string, generatedBy: 'schedule' | 'manual' | 'regenerate'): Promise<void> {
    const { periodStart, periodEnd, previousStart, previousEnd } = computePeriods(reportDate);
    const now = new Date();

    try {
      const [
        activeUsers, skillUsages, coveredWorkItems, documentOutputs, wikiRecalls,
        prevActiveUsers, prevSkillUsages, prevCoveredWorkItems, prevDocumentOutputs, prevWikiRecalls,
        stageCoverageRows, fullChainCount, multiStageCount,
        prevStageCoverageRows, prevFullChainCount, prevMultiStageCount,
        wikiDistinctFiles, wikiDistinctDomains, topDomains,
        benchmarks,
        outboxPending, outboxFailed, failedBatches,
      ] = await Promise.all([
        this.repo.countDistinctUsers(periodStart, periodEnd),
        this.repo.countSkillUsages(periodStart, periodEnd),
        this.repo.countCoveredWorkItems(periodStart, periodEnd),
        this.repo.countDocumentOutputs(periodStart, periodEnd),
        this.repo.countWikiRecalls(periodStart, periodEnd),
        this.repo.countDistinctUsers(previousStart, previousEnd),
        this.repo.countSkillUsages(previousStart, previousEnd),
        this.repo.countCoveredWorkItems(previousStart, previousEnd),
        this.repo.countDocumentOutputs(previousStart, previousEnd),
        this.repo.countWikiRecalls(previousStart, previousEnd),
        this.repo.countStageCoverage(periodStart, periodEnd),
        this.repo.countFullChainWorkItems(periodStart, periodEnd),
        this.repo.countMultiStageWorkItems(periodStart, periodEnd),
        this.repo.countStageCoverage(previousStart, previousEnd),
        this.repo.countFullChainWorkItems(previousStart, previousEnd),
        this.repo.countMultiStageWorkItems(previousStart, previousEnd),
        this.repo.countWikiDistinctFiles(periodStart, periodEnd),
        this.repo.countWikiDistinctDomains(periodStart, periodEnd),
        this.repo.topWikiDomains(periodStart, periodEnd, 5),
        this.repo.listBenchmarks(periodStart, periodEnd, 5),
        this.repo.countOutboxPending(),
        this.repo.countOutboxFailed(),
        this.repo.countFailedBatches(periodStart, periodEnd),
      ]);

      const stages = buildStages(stageCoverageRows, prevStageCoverageRows);
      const warnings = buildWarnings(outboxPending, outboxFailed, failedBatches);

      const metrics: DailyReportMetrics = {
        reportDate,
        timezone: 'Asia/Shanghai',
        period: { start: periodStart, end: periodEnd },
        generatedAt: now.toISOString(),
        headline: '',
        kpis: {
          activeUsers: makeDelta(activeUsers, prevActiveUsers),
          skillUsages: makeDelta(skillUsages, prevSkillUsages),
          coveredWorkItems: makeDelta(coveredWorkItems, prevCoveredWorkItems),
          documentOutputs: makeDelta(documentOutputs, prevDocumentOutputs),
          wikiRecalls: makeDelta(wikiRecalls, prevWikiRecalls),
        },
        adoption: {
          activeUsers,
          skillUsages,
          coveredWorkItems,
          summary: buildAdoptionSummary(activeUsers, skillUsages, coveredWorkItems),
        },
        chain: {
          stages,
          multiStageWorkItemCount: multiStageCount,
          fullChainWorkItemCount: fullChainCount,
          summary: buildChainSummary(stages, fullChainCount),
        },
        benchmarks: buildBenchmarks(benchmarks),
        knowledge: {
          wikiRecallCount: wikiRecalls,
          distinctFileCount: wikiDistinctFiles,
          distinctDomainCount: wikiDistinctDomains,
          topDomains,
          summary: buildKnowledgeSummary(wikiRecalls, wikiDistinctFiles, wikiDistinctDomains),
        },
        links: {
          overview: this.dailyReportConfig?.baseUrl ?? '/',
          workItems: `${this.dailyReportConfig?.baseUrl ?? ''}/sdd/work-items`,
          wikiRecalls: `${this.dailyReportConfig?.baseUrl ?? ''}/sdd/wiki-recalls`,
        },
        dataHealth: {
          outboxPendingCount: outboxPending,
          outboxFailedCount: outboxFailed,
          failedBatchCount: failedBatches,
          warnings,
        },
        methodology: {
          queryVersion: QUERY_VERSION,
          templateVersion: TEMPLATE_VERSION,
          generatedBy,
        },
      };

      metrics.headline = renderHeadline(metrics);
      const markdownText = renderMarkdown(metrics);

      await this.repo.upsertReport({
        reportDate,
        timezone: 'Asia/Shanghai',
        periodStart: new Date(periodStart),
        periodEnd: new Date(periodEnd),
        status: 'generated',
        metricsJson: JSON.stringify(metrics),
        markdownText,
        dataHealthJson: JSON.stringify(metrics.dataHealth),
        templateVersion: TEMPLATE_VERSION,
        queryVersion: QUERY_VERSION,
        generatedAt: now,
        generatedBy,
        errorMessage: null,
      });
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      const existing = await this.repo.findByDate(reportDate);
      if (existing && existing.status === 'generated') {
        return;
      }
      await this.repo.upsertReport({
        reportDate,
        timezone: 'Asia/Shanghai',
        periodStart: new Date(periodStart),
        periodEnd: new Date(periodEnd),
        status: 'failed',
        metricsJson: '{}',
        markdownText: '',
        dataHealthJson: null,
        templateVersion: TEMPLATE_VERSION,
        queryVersion: QUERY_VERSION,
        generatedAt: now,
        generatedBy,
        errorMessage,
      });
    }
  }

  async getLatest(): Promise<DailyReportDetailResponse | null> {
    const row = await this.repo.findLatest();
    return row ? this.toDetail(row) : null;
  }

  async getByDate(date: string): Promise<DailyReportDetailResponse | null> {
    const row = await this.repo.findByDate(date);
    return row ? this.toDetail(row) : null;
  }

  async listReports(
    from: string | undefined,
    to: string | undefined,
    page: number,
    pageSize: number,
  ): Promise<DailyReportListResponse> {
    const offset = (page - 1) * pageSize;
    const { items, total: rawTotal } = await this.repo.listReports(from, to, pageSize, offset);
    const total = typeof rawTotal === 'string' ? parseInt(rawTotal, 10) : rawTotal;
    return {
      items: items.map((row): DailyReportListItem => ({
        id: String(row.id),
        reportDate: row.report_date,
        status: row.status as DailyReportListItem['status'],
        generatedAt: toIso(row.generated_at),
        generatedBy: row.generated_by as DailyReportListItem['generatedBy'],
        errorMessage: row.error_message,
      })),
      total,
      page,
      pageSize,
    };
  }

  private toDetail(row: import('./daily-report.repository').DailyReportRow): DailyReportDetailResponse {
    const isFailed = row.status === 'failed';
    const metrics = isFailed ? null : JSON.parse(row.metrics_json) as DailyReportMetrics;
    return {
      id: String(row.id),
      reportDate: row.report_date,
      timezone: row.timezone,
      periodStart: toIso(row.period_start),
      periodEnd: toIso(row.period_end),
      status: row.status as DailyReportDetailResponse['status'],
      metrics,
      markdownText: row.markdown_text,
      templateVersion: row.template_version,
      queryVersion: row.query_version,
      generatedAt: toIso(row.generated_at),
      generatedBy: row.generated_by as DailyReportDetailResponse['generatedBy'],
      errorMessage: row.error_message,
    };
  }
}

function computePeriods(reportDate: string) {
  const start = new Date(`${reportDate}T00:00:00.000+08:00`);
  const end = new Date(start.getTime() + 24 * 3600_000);
  const previousStart = new Date(start.getTime() - 24 * 3600_000);
  const previousEnd = new Date(start);
  return {
    periodStart: start.toISOString(),
    periodEnd: end.toISOString(),
    previousStart: previousStart.toISOString(),
    previousEnd: previousEnd.toISOString(),
  };
}

function makeDelta(current: number, previous: number): MetricDelta {
  const delta = current - previous;
  const deltaRate = previous > 0 ? delta / previous : null;
  return { current, previous, delta, deltaRate };
}

function buildStages(
  rows: Array<{ artifact_type: string; work_item_count: string | number }>,
  prevRows: Array<{ artifact_type: string; work_item_count: string | number }>,
): DailyReportMetrics['chain']['stages'] {
  const order: Array<'proposal' | 'design' | 'task' | 'review'> = ['proposal', 'design', 'task', 'review'];
  const countMap = new Map<string, number>();
  const prevMap = new Map<string, number>();

  for (const row of rows) {
    const mapped = STAGE_MAP[row.artifact_type];
    if (mapped) countMap.set(mapped.code, Number(row.work_item_count));
  }
  for (const row of prevRows) {
    const mapped = STAGE_MAP[row.artifact_type];
    if (mapped) prevMap.set(mapped.code, Number(row.work_item_count));
  }

  return order.map((code) => {
    const label = code === 'proposal' ? '需求撰写' : code === 'design' ? '系统设计' : code === 'task' ? '任务拆分' : '代码评审';
    const cnt = countMap.get(code) ?? 0;
    const prev = prevMap.get(code) ?? 0;
    const delta = cnt - prev;
    const status = cnt === 0 ? 'watch' : delta > 0 ? 'growing' : 'healthy';
    return { code, label, workItemCount: cnt, previousDelta: delta, status };
  });
}

function buildBenchmarks(
  rows: Array<{
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
  }>,
): DailyReportMetrics['benchmarks'] {
  return rows.map((r) => {
    const stageCodes = r.stage_codes_csv ? r.stage_codes_csv.split(',').filter(Boolean) : [];
    const normalized = [...new Set(stageCodes.map((s) => STAGE_MAP[s]?.code ?? s))];
    const docCount = Number(r.document_count);
    const contributors = Number(r.contributor_count);
    const wiki = Number(r.wiki_recall_count);
    const usage = Number(r.usage_count);

    let label = '';
    if (normalized.length >= 3) {
      label = `${normalized.length} 阶段覆盖，产出 ${docCount} 篇过程文档，${contributors} 人参与`;
    } else if (wiki > 5) {
      label = `Wiki 召回 ${wiki} 次`;
    } else {
      label = `${docCount} 篇文档，${contributors} 人参与`;
    }

    return {
      workItemId: String(r.work_item_id),
      title: r.work_item_title || r.work_item_slug,
      businessDomain: r.business_domain,
      stageCodes: normalized,
      documentCount: docCount,
      documentWriteCount: Number(r.write_count),
      contributorCount: contributors,
      wikiRecallCount: wiki,
      label,
      link: `/sdd/work-items/${r.work_item_id}`,
    };
  });
}

function buildWarnings(outboxPending: number, outboxFailed: number, failedBatch: number): string[] {
  const warnings: string[] = [];
  if (outboxPending > 0) {
    warnings.push(`数据提示：当前仍有 ${outboxPending} 个清洗任务 pending，本日报可能低估部分使用量。`);
  }
  if (outboxFailed > 0) {
    warnings.push(`数据提示：当前有 ${outboxFailed} 个终态失败的清洗任务，部分数据可能缺失。`);
  }
  if (failedBatch > 0) {
    warnings.push(`数据提示：昨日有 ${failedBatch} 个采集批次失败。`);
  }
  return warnings;
}

function buildAdoptionSummary(users: number, usages: number, workItems: number): string {
  if (users === 0) return '昨日未观测到 SDD 使用。';
  return `昨日 ${users} 人使用 SDD，共 ${usages} 次调用，覆盖 ${workItems} 个需求。`;
}

function buildChainSummary(
  stages: DailyReportMetrics['chain']['stages'],
  fullChain: number,
): string {
  const activeStages = stages.filter((s) => s.workItemCount > 0);
  if (activeStages.length === 0) return '昨日未观测到链路覆盖。';
  const parts = activeStages.map((s) => `${s.label} ${s.workItemCount}`);
  return `${parts.join('，')}${fullChain > 0 ? `，其中 ${fullChain} 个需求进入 3+ 阶段全链路。` : '。'}`;
}

function buildKnowledgeSummary(recalls: number, files: number, domains: number): string {
  if (recalls === 0) return '昨日未观测到知识库召回。';
  return `昨日 Wiki 召回 ${recalls} 次，覆盖 ${files} 个文件、${domains} 个业务域。`;
}

function toIso(value: Date | string): string {
  if (value instanceof Date) return value.toISOString();
  return new Date(value).toISOString();
}
