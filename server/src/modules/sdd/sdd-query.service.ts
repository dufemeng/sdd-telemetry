import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { Config, Inject, Provide } from '@midwayjs/core';
import type {
  CreateSddSemanticRequest,
  UpdateSddSemanticRequest,
  ReportUserSettingsRequest,
  SddArtifactWriteListResponse,
  SddErrorItem,
  SddFunnel,
  SddFunnelQuery,
  SddInteractionDetail,
  SddInteractionItem,
  SddInteractionToolCallListResponse,
  SddListQuery,
  SddWorkItemListQuery,
  SddOverview,
  SddOverviewQuery,
  SddSemantic,
  SddSkillAnalytics,
  SddSkillAnalyticsQuery,
  SddSkillTimeseries,
  SddSkillTimeseriesQuery,
  SddUsageSummaryItem,
  SddUsageSummaryQuery,
  SddUsageSummaryResponse,
  SddUsageItem,
  SddUserItem,
  SddVersionItem,
  SddWorkItem,
  SddWorkItemDetail,
  SddWikiRecallContent,
  WikiRecallHeatmapResponse,
  WikiRecallListResponse,
  WikiRecallRange,
  WikiRecallTimelineResponse,
  WikiRecallUserRankingResponse,
  WikiRecallWorkItemRankingResponse,
} from '@sdd-telemetry/api';
import { TypeOrmUnitOfWork } from '../../common/transaction/unit-of-work';
import { MysqlDataSourceManager } from '../../infrastructure/mysql/data-source-manager';
import { addTimeRangeWhere, toIsoDate, toNumber, toStringId, truncateText } from '../query-utils';
import {
  SddQueryRepository,
  type ArtifactWriteRow,
  type InteractionRow,
  type ResolvedTimeWindow,
  type WorkItemRow,
  type WorkItemSummaryRow,
} from './sdd-query.repository';
import { SddWriteRepository } from './sdd-write.repository';
import { deriveRepoName, resolveWikiContentPath } from './wiki-content';

const SDD_OVERVIEW_DOCUMENT_TYPES = ['proposal', 'design', 'task', 'codereview'] as const;

@Provide('sddQueryService')
export class SddQueryService {
  @Inject('mysqlDataSourceManager')
  mysqlDataSourceManager!: MysqlDataSourceManager;

  @Inject('sddWriteRepository')
  sddWriteRepository!: SddWriteRepository;

  @Inject('sddQueryRepository')
  sddQueryRepository!: SddQueryRepository;

  @Config('knowledgeBase')
  knowledgeBaseConfig!: { rootPath: string; contentMaxBytes: number; scanCacheTtlMs: number; deadKnowledgeGraceDays: number };

  async getWikiRecallContent(toolCallId: string): Promise<SddWikiRecallContent> {
    const row = await this.sddQueryRepository.findWikiRecallForContent(toolCallId);
    if (!row) {
      return emptyWikiContent('recall_not_found', null, null, null);
    }

    const rawPath = row.raw_path;
    const relativePath = row.wiki_relative_path;
    const repoName = deriveRepoName(rawPath, relativePath);

    if (row.action_type !== 'read') {
      return emptyWikiContent('not_readable_action', repoName, relativePath, rawPath);
    }
    const root = this.knowledgeBaseConfig.rootPath;
    if (!root) {
      return emptyWikiContent('not_configured', repoName, relativePath, rawPath);
    }
    if (!repoName || !relativePath) {
      return emptyWikiContent('file_missing', repoName, relativePath, rawPath);
    }

    const target = resolveWikiContentPath(root, repoName, relativePath);
    if (!target) {
      return emptyWikiContent('file_missing', repoName, relativePath, rawPath);
    }

    const repoDir = path.resolve(root, repoName);
    const repoStat = await statOrNull(repoDir);
    if (!repoStat || !repoStat.isDirectory()) {
      return emptyWikiContent('repo_missing', repoName, relativePath, rawPath);
    }
    const fileStat = await statOrNull(target);
    if (!fileStat) {
      return emptyWikiContent('file_missing', repoName, relativePath, rawPath);
    }
    if (!fileStat.isFile()) {
      return emptyWikiContent('not_a_file', repoName, relativePath, rawPath);
    }

    const cap = this.knowledgeBaseConfig.contentMaxBytes;
    const content = await readUpTo(target, cap);
    return {
      found: true,
      reason: 'ok',
      repoName,
      relativePath,
      rawPath,
      isMarkdown: target.toLowerCase().endsWith('.md'),
      content,
      truncated: fileStat.size > cap,
    };
  }

  async listSemantics(): Promise<SddSemantic[]> {
    const rows = await this.sddQueryRepository.listSemantics();
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
    const unitOfWork = new TypeOrmUnitOfWork(dataSource);
    await unitOfWork.run(async (context) => {
      if (!context.manager) {
        throw new Error('missing transaction manager');
      }
      const manager = context.manager;
      await this.sddWriteRepository.upsertSemantic(manager, input);
      const semanticId = await this.sddWriteRepository.findSemanticIdByCode(
        manager,
        input.semanticCode,
      );
      if (!semanticId) {
        throw new Error(`failed to create semantic: ${input.semanticCode}`);
      }

      for (const skillName of input.aliases) {
        await this.sddWriteRepository.upsertSemanticAlias(manager, semanticId, skillName);
      }
    });

    const semantic = (await this.listSemantics()).find(
      (item) => item.semanticCode === input.semanticCode,
    );
    if (!semantic) {
      throw new Error(`semantic not found after create: ${input.semanticCode}`);
    }

    return semantic;
  }

  async updateSemantic(id: string, input: UpdateSddSemanticRequest): Promise<SddSemantic> {
    const dataSource = await this.mysqlDataSourceManager.getDataSource();
    const unitOfWork = new TypeOrmUnitOfWork(dataSource);
    await unitOfWork.run(async (context) => {
      if (!context.manager) {
        throw new Error('missing transaction manager');
      }
      const manager = context.manager;
      await this.sddWriteRepository.updateSemantic(manager, id, input);
      await this.sddWriteRepository.deleteSemanticAliases(manager, id);
      for (const skillName of input.aliases) {
        await this.sddWriteRepository.insertSemanticAlias(manager, id, skillName);
      }
    });

    const all = await this.listSemantics();
    const updated = all.find((item) => item.id === id);
    if (!updated) {
      throw new Error(`semantic not found after update: ${id}`);
    }

    return updated;
  }

  async deleteSemantic(id: string): Promise<void> {
    const dataSource = await this.mysqlDataSourceManager.getDataSource();
    const unitOfWork = new TypeOrmUnitOfWork(dataSource);
    await unitOfWork.run(async (context) => {
      if (!context.manager) {
        throw new Error('missing transaction manager');
      }
      const manager = context.manager;
      await this.sddWriteRepository.deleteSemanticAliases(manager, id);
      await this.sddWriteRepository.deleteSemantic(manager, id);
    });
  }

  async getOverview(query: SddOverviewQuery): Promise<SddOverview> {
    const usageWhere: string[] = [];
    const usageParams: unknown[] = [];
    addTimeRangeWhere(usageWhere, usageParams, 'u.event_time', query);

    const workItemWhere: string[] = [];
    const workItemParams: unknown[] = [];
    addTimeRangeWhere(workItemWhere, workItemParams, 'wi.last_seen_at', query);

    const artifactWhere = [
      `a.artifact_type IN (${SDD_OVERVIEW_DOCUMENT_TYPES.map(() => '?').join(',')})`,
    ];
    const artifactParams: unknown[] = [...SDD_OVERVIEW_DOCUMENT_TYPES];
    addTimeRangeWhere(
      artifactWhere,
      artifactParams,
      'COALESCE(a.first_seen_at, a.last_seen_at)',
      query,
    );

    const [usageRows, workItemRows, artifactRows] = await Promise.all([
      this.sddQueryRepository.countOverviewUsage(usageWhere, usageParams),
      this.sddQueryRepository.countOverviewWorkItems(workItemWhere, workItemParams),
      this.sddQueryRepository.countOverviewArtifacts(artifactWhere, artifactParams),
    ]);

    return {
      activeUserCount: toNumber(usageRows[0]?.active_user_count),
      skillUsageCount: toNumber(usageRows[0]?.skill_usage_count),
      coveredWorkItemCount: toNumber(workItemRows[0]?.count_value),
      generatedDocumentCount: toNumber(artifactRows[0]?.count_value),
    };
  }

  async getFunnel(query: SddFunnelQuery): Promise<SddFunnel> {
    const usageWhere: string[] = [];
    const usageParams: unknown[] = [];
    addTimeRangeWhere(usageWhere, usageParams, 'u.event_time', query);

    const interactionWhere: string[] = [];
    const interactionParams: unknown[] = [];
    addTimeRangeWhere(interactionWhere, interactionParams, 'i.started_at', query);

    const [interactionRows, qualityRows, usageRows] = await Promise.all([
      this.sddQueryRepository.countInteractions(interactionWhere, interactionParams),
      this.sddQueryRepository.aggregateInteractionQuality(interactionWhere, interactionParams),
      this.sddQueryRepository.aggregateSemanticDistribution(usageWhere, usageParams),
    ]);
    const totalInteractions = toNumber(interactionRows[0]?.count_value);
    const totalSkillUsages = usageRows.reduce((sum, row) => sum + toNumber(row.usage_count), 0);
    const withPromptCount = toNumber(qualityRows[0]?.with_prompt_count);
    const withResponseCount = toNumber(qualityRows[0]?.with_response_count);
    const pairedCount = toNumber(qualityRows[0]?.paired_count);
    const failedCount = toNumber(qualityRows[0]?.failed_count);

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
        pairingSuccessRate: totalInteractions > 0 ? 1 - failedCount / totalInteractions : null,
      },
      stages: usageRows.map((row) => {
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

  async getSkillAnalytics(query: SddSkillAnalyticsQuery): Promise<SddSkillAnalytics> {
    const currentWindow = resolveSkillAnalyticsWindow(query);
    const previousWindow = previousTimeWindow(currentWindow);

    const [currentKpiRows, previousKpiRows, qualityRows, topRows, matchRows, unmatchedRows] =
      await Promise.all([
        this.sddQueryRepository.skillAnalyticsKpis(currentWindow),
        this.sddQueryRepository.skillAnalyticsKpis(previousWindow),
        this.sddQueryRepository.skillQualityWithTrigger(currentWindow),
        this.sddQueryRepository.topSemanticsByWindow(currentWindow),
        this.sddQueryRepository.aggregateSemanticMatchHealth(currentWindow),
        this.sddQueryRepository.topUnmatchedSkills(currentWindow),
      ]);

    const current = currentKpiRows[0];
    const previous = previousKpiRows[0];
    const quality = qualityRows[0];
    const matchedCount = toNumber(matchRows[0]?.matched_count);
    const unmatchedCount = toNumber(matchRows[0]?.unmatched_count);
    const totalMatchedState = matchedCount + unmatchedCount;
    const currentSkillUsageCount = toNumber(current?.skill_usage_count);
    const qualityInteractionCount = toNumber(quality?.interaction_count);
    const qualityTriggeredCount = toNumber(quality?.triggered_count);
    const withPromptCount = toNumber(quality?.with_prompt_count);
    const withResponseCount = toNumber(quality?.with_response_count);
    const pairedCount = toNumber(quality?.paired_count);
    const failedCount = toNumber(quality?.failed_count);

    return {
      kpis: {
        skillUsageCount: {
          current: currentSkillUsageCount,
          previous: toNumber(previous?.skill_usage_count),
        },
        activeUserCount: {
          current: toNumber(current?.active_user_count),
          previous: toNumber(previous?.active_user_count),
        },
        coveredWorkItemCount: {
          current: toNumber(current?.covered_work_item_count),
          previous: toNumber(previous?.covered_work_item_count),
        },
        userTriggeredCount: {
          current: toNumber(current?.user_triggered_count),
          previous: toNumber(previous?.user_triggered_count),
        },
        autoTriggeredCount: {
          current: toNumber(current?.auto_triggered_count),
          previous: toNumber(previous?.auto_triggered_count),
        },
        multiStageWorkItemCount: {
          current: toNumber(current?.multi_stage_work_item_count),
          previous: toNumber(previous?.multi_stage_work_item_count),
        },
      },
      callQuality: {
        triggeredCount: qualityTriggeredCount,
        withPromptCount,
        withResponseCount,
        pairedCount,
        promptCoverageRate:
          qualityTriggeredCount > 0 ? withPromptCount / qualityTriggeredCount : null,
        responseCoverageRate:
          qualityTriggeredCount > 0 ? withResponseCount / qualityTriggeredCount : null,
        pairingSuccessRate:
          qualityInteractionCount > 0 ? 1 - failedCount / qualityInteractionCount : null,
      },
      topSemantics: topRows.map((row) => {
        const usageCount = toNumber(row.usage_count);
        return {
          semanticCode: row.semantic_code ?? 'unknown',
          displayName: row.display_name ?? '未匹配 Skill',
          usageCount,
          userCount: toNumber(row.user_count),
          workItemCount: toNumber(row.work_item_count),
          conversionRate:
            currentSkillUsageCount > 0 ? usageCount / currentSkillUsageCount : null,
        };
      }),
      matchHealth: {
        matchedCount,
        unmatchedCount,
        matchRate: totalMatchedState > 0 ? matchedCount / totalMatchedState : null,
        topUnmatched: unmatchedRows.map((row) => ({
          rawSkillName: row.raw_skill_name,
          usageCount: toNumber(row.usage_count),
        })),
      },
    };
  }

  async getSkillTimeseries(query: SddSkillTimeseriesQuery): Promise<SddSkillTimeseries> {
    const window = resolveSkillAnalyticsWindow(query);
    const bucket = query.bucket ?? chooseSkillTimeseriesBucket(window);
    const bucketSeconds = bucketToSeconds(bucket);
    const points = createSkillTimeseriesTemplate(window, bucketSeconds);
    const rows = await this.sddQueryRepository.bucketizeSkillUsage(
      window.from,
      window.to,
      bucketSeconds,
    );

    for (const row of rows) {
      const index = toNumber(row.bucket_index);
      const point = points[index];
      if (!point) {
        continue;
      }
      point.triggeredCount = toNumber(row.triggered_count);
      point.pairedCount = toNumber(row.paired_count);
    }

    return { bucket, points };
  }

  async getUsageSummary(query: SddUsageSummaryQuery): Promise<SddUsageSummaryResponse> {
    const { clauses, params } = this.buildUsageSummaryWhere(query);
    const page = query.page;
    const pageSize = query.limit ?? query.pageSize;
    const offset = (page - 1) * pageSize;
    const countRows = await this.sddQueryRepository.countUsageSummary(clauses, params);
    const rows = await this.sddQueryRepository.listUsageSummary(
      clauses,
      params,
      pageSize,
      offset,
    );

    if (rows.length === 0) {
      return { items: [], total: toNumber(countRows[0]?.count_value), page, pageSize };
    }

    const rawSkillNames = rows.map((row) => row.raw_skill_name);
    const versionRows = await this.sddQueryRepository.aggregateVersionsByRawSkillNames(
      clauses,
      params,
      rawSkillNames,
    );
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
      items: rows.map(
        (row): SddUsageSummaryItem => ({
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
        }),
      ),
      total: toNumber(countRows[0]?.count_value),
      page,
      pageSize,
    };
  }

  async listUsages(query: SddListQuery): Promise<SddUsageItem[]> {
    const { clauses, params } = this.buildUsageWhere(query, 'u');
    const rows = await this.sddQueryRepository.listUsages(clauses, params, query.limit);

    return rows.map((row) => ({
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

    const rows = await this.sddQueryRepository.listInteractions(clauses, params, query.limit);

    return rows.map(toInteractionItem);
  }

  async getInteractionDetail(interactionId: string): Promise<SddInteractionDetail | null> {
    const rows = await this.sddQueryRepository.getInteractionDetail(interactionId);

    const row = rows[0];
    if (!row) {
      return null;
    }

    return {
      ...toInteractionItem(row),
      promptText: row.prompt_text,
      responseText: row.response_text,
      responseJson: row.response_json,
    };
  }

  async listInteractionToolCalls(
    interactionId: string,
  ): Promise<SddInteractionToolCallListResponse> {
    const rows = await this.sddQueryRepository.listInteractionToolCalls(interactionId);

    return {
      items: rows.map((row) => ({
        id: toStringId(row.id),
        toolUseId: row.tool_use_id,
        skillUsageId: row.skill_usage_id === null ? null : toStringId(row.skill_usage_id),
        toolName: row.tool_name,
        sequence: toNumber(row.sequence),
        decision: row.decision,
        decisionSource: row.decision_source,
        success: toNullableBoolean(row.success),
        durationMs: toNullableNumber(row.duration_ms),
        inputSizeBytes: toNullableNumber(row.input_size_bytes),
        resultSizeBytes: toNullableNumber(row.result_size_bytes),
        errorType: row.error_type,
        toolInputPreview: row.tool_input_preview,
        mcpServerScope: row.mcp_server_scope,
        isWikiRecall: toNullableBoolean(row.is_wiki_recall) ?? false,
      })),
    };
  }

  async listErrors(query: SddListQuery): Promise<SddErrorItem[]> {
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

    const rows = await this.sddQueryRepository.listErrors(clauses, params, query.limit);

    return rows.map((row) => ({
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
    const rows = await this.sddQueryRepository.listUsers();

    return rows.map((row) => ({
      id: toStringId(row.id),
      userKey: row.user_key,
      installId: row.install_id,
      userName: row.user_name,
      machineId: row.machine_id,
      machineName: row.machine_name,
      requirementsRootPath: row.requirements_root_path,
      wikiRootPath: row.wiki_root_path,
      firstSeenAt: toIsoDate(row.first_seen_at),
      lastSeenAt: toIsoDate(row.last_seen_at),
      skillUsageCount: toNumber(row.skill_usage_count),
      interactionCount: toNumber(row.interaction_count),
      workItemCount: toNumber(row.work_item_count),
      semanticStages: row.semantic_stages_csv
        ? row.semantic_stages_csv.split(',').filter(Boolean)
        : [],
    }));
  }

  async listVersions(): Promise<SddVersionItem[]> {
    const rows = await this.sddQueryRepository.listVersions();

    return rows.map((row) => ({
      version: row.version ?? 'unknown',
      usageCount: toNumber(row.usage_count),
      userCount: toNumber(row.user_count),
      latestAt: toIsoDate(row.latest_at),
    }));
  }

  async listWorkItems(query: SddWorkItemListQuery): Promise<SddWorkItem[]> {
    const rows = await this.sddQueryRepository.listWorkItems([], [], query.limit);

    return rows.map((row) => this.toWorkItem(row));
  }

  async getWorkItemDetail(workItemId: string): Promise<SddWorkItemDetail | null> {
    const [workRows, artifactRows, usageRows, errorRows, summaryRows] = await Promise.all([
      this.sddQueryRepository.getWorkItem(workItemId),
      this.sddQueryRepository.listWorkItemArtifacts(workItemId),
      this.sddQueryRepository.countWorkItemUsages(workItemId),
      this.sddQueryRepository.countWorkItemErrors(workItemId),
      this.sddQueryRepository.getWorkItemSummary(workItemId),
    ]);
    const workItem = workRows[0];

    if (!workItem) {
      return null;
    }

    return {
      ...this.toWorkItem(workItem),
      artifacts: artifactRows.map((row) => ({
        id: toStringId(row.id),
        artifactType: row.artifact_type,
        artifactRelativePath: row.artifact_relative_path,
        systemModule: row.system_module,
        lastSeenAt: toIsoDate(row.last_seen_at),
      })),
      usageCount: toNumber(usageRows[0]?.count_value),
      errorCount: toNumber(errorRows[0]?.count_value),
      turnCount: toNumber(summaryRows[0]?.turn_count),
      sessionCount: toNumber(summaryRows[0]?.session_count),
      contributorCount: toNumber(summaryRows[0]?.contributor_count),
      wikiRecallCount: toNumber(summaryRows[0]?.wiki_recall_count),
    };
  }

  async listArtifactWrites(
    workItemId: string,
    artifactId: string,
  ): Promise<SddArtifactWriteListResponse> {
    const rows = await this.sddQueryRepository.listArtifactWrites(workItemId, artifactId);
    return {
      items: rows.map((row: ArtifactWriteRow) => ({
        id: toStringId(row.id),
        nodeKind: row.node_kind === 'discussion' ? 'discussion' : 'write',
        writeKind: row.write_kind,
        eventTime: toIsoDate(row.event_time),
        eventSequence: row.event_sequence === null ? null : toNumber(row.event_sequence),
        interactionId: row.interaction_id === null ? null : toStringId(row.interaction_id),
        skillSemanticCode: row.skill_semantic_code,
        skillDisplayName: row.skill_display_name,
        rawSkillName: row.raw_skill_name,
        wikiRecallCount: toNumber(row.wiki_recall_count),
        promptPreview: row.prompt_text ? row.prompt_text.slice(0, 200) : null,
        contentPreview: row.content_preview,
      })),
    };
  }

  async reportUserSettings(input: ReportUserSettingsRequest): Promise<SddUserItem> {
    const userKey = createUserKey(input);

    await this.sddQueryRepository.upsertUserSettings(input, userKey);

    const user = (await this.listUsers()).find((item) => item.userKey === userKey);
    if (!user) {
      throw new Error(`user not found after settings report: ${userKey}`);
    }

    return user;
  }

  async getWikiRecallUserRanking(
    range: WikiRecallRange,
    sortBy: 'total' | 'distinct_files' | 'recent',
    page = 1,
    pageSize = 50,
  ): Promise<WikiRecallUserRankingResponse> {
    const since = rangeToSinceDate(range);
    const { items, total } = await this.sddQueryRepository.listWikiRecallUserRanking(
      since,
      sortBy,
      pageSize,
      (page - 1) * pageSize,
    );

    return {
      items: items.map((row) => ({
        userId: toStringId(row.userId),
        userName: row.userName,
        hasWikiRootPath: toNullableBoolean(row.hasWikiRootPath) ?? false,
        totalRecalls: toNumber(row.totalRecalls),
        distinctFiles: toNumber(row.distinctFiles),
        distinctDomains: toNumber(row.distinctDomains),
        distinctSystems: toNumber(row.distinctSystems),
        lastRecallAt: toIsoDate(row.lastRecallAt),
      })),
      total: toNumber(total),
    };
  }

  async getWikiRecallWorkItemRanking(
    range: WikiRecallRange,
    businessDomain: string | null,
    userId: string | null,
    page = 1,
    pageSize = 50,
  ): Promise<WikiRecallWorkItemRankingResponse> {
    const since = rangeToSinceDate(range);
    const { items, total } = await this.sddQueryRepository.listWikiRecallWorkItemRanking(
      since,
      businessDomain,
      userId,
      pageSize,
      (page - 1) * pageSize,
    );

    return {
      items: items.map((row) => ({
        workItemId: toStringId(row.workItemId),
        workItemSlug: row.workItemSlug,
        businessDomain: row.businessDomain,
        totalRecalls: toNumber(row.totalRecalls),
        distinctDomains: toNumber(row.distinctDomains),
        distinctSystems: toNumber(row.distinctSystems),
        userCount: toNumber(row.userCount),
      })),
      total: toNumber(total),
    };
  }

  async getWikiRecallHeatmap(
    range: WikiRecallRange,
    groupBy: 'domain' | 'axis' | 'system',
  ): Promise<WikiRecallHeatmapResponse> {
    const buckets = await this.sddQueryRepository.wikiRecallHeatmap(
      rangeToSinceDate(range),
      groupBy,
    );

    return {
      buckets: buckets.map((bucket) => ({
        key: bucket.key,
        totalRecalls: toNumber(bucket.totalRecalls),
        distinctUsers: toNumber(bucket.distinctUsers),
      })),
    };
  }

  async getWikiRecallTimeline(
    range: WikiRecallRange,
    granularity: 'day' | 'hour',
    groupBy: 'domain' | 'axis',
  ): Promise<WikiRecallTimelineResponse> {
    const points = await this.sddQueryRepository.wikiRecallTimeline(
      rangeToSinceDate(range),
      granularity,
      groupBy,
    );

    return {
      points: points.map((point) => ({
        t: point.t,
        group: point.group,
        count: toNumber(point.count),
      })),
    };
  }

  async listWikiRecalls(
    range: WikiRecallRange,
    filters: { workItemId?: string; userId?: string; skillUsageId?: string },
    page = 1,
    pageSize = 50,
  ): Promise<WikiRecallListResponse> {
    const { items, total } = await this.sddQueryRepository.listWikiRecalls(
      filters,
      rangeToSinceDate(range),
      pageSize,
      (page - 1) * pageSize,
    );

    return {
      items: items.map((row) => ({
        id: toStringId(row.id),
        toolCallId: toStringId(row.toolCallId),
        interactionId: toStringId(row.interactionId),
        skillUsageId: row.skillUsageId === null ? null : toStringId(row.skillUsageId),
        workItemId: row.workItemId === null ? null : toStringId(row.workItemId),
        userId: row.userId === null ? null : toStringId(row.userId),
        userName: row.userName,
        actionType: row.actionType,
        rawPath: row.rawPath,
        wikiRelativePath: row.wikiRelativePath,
        wikiDomain: row.wikiDomain,
        wikiAxis: row.wikiAxis,
        wikiSystem: row.wikiSystem,
        eventSequence: toNullableNumber(row.eventSequence),
        eventTime: toIsoDate(row.eventTime),
      })),
      total: toNumber(total),
    };
  }

  private buildUsageWhere(
    query: SddListQuery,
    alias: string,
  ): { clauses: string[]; params: unknown[] } {
    const clauses: string[] = [];
    const params: unknown[] = [];
    addTimeRangeWhere(clauses, params, `${alias}.event_time`, query);
    this.addCommonFilters(clauses, params, query, alias);

    if (query.semanticCode) {
      clauses.push(`s.semantic_code = ?`);
      params.push(query.semanticCode);
    }

    return {
      clauses,
      params,
    };
  }

  private buildUsageSummaryWhere(query: SddUsageSummaryQuery): {
    clauses: string[];
    params: unknown[];
  } {
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

    if (query.matched === 'matched') {
      clauses.push('u.semantic_id IS NOT NULL');
    } else if (query.matched === 'unmatched') {
      clauses.push('u.semantic_id IS NULL');
    }

    if (query.keyword) {
      clauses.push('(u.raw_skill_name LIKE ? OR s.display_name LIKE ? OR s.semantic_code LIKE ?)');
      const keyword = `%${query.keyword}%`;
      params.push(keyword, keyword, keyword);
    }

    return {
      clauses,
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
    if (query.rawSkillName) {
      clauses.push(`${alias}.raw_skill_name = ?`);
      params.push(query.rawSkillName);
    }
    if (query.cursor) {
      clauses.push(`${alias}.id < ?`);
      params.push(query.cursor);
    }
  }

  private toWorkItem(row: WorkItemRow): SddWorkItem {
    const raw = row.coverage_stages_json ?? '';
    const coverageStages: string[] = raw
      ? raw.split(',').map((s) => s.trim()).filter(Boolean)
      : [];
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
      artifactCount: Number(row.artifact_count ?? 0),
      usageCount: Number(row.usage_count ?? 0),
      errorCount: Number(row.error_count ?? 0),
      coverageStages,
    };
  }
}

function resolveSkillAnalyticsWindow(query: SddSkillAnalyticsQuery): ResolvedTimeWindow {
  const toDate = query.to ? new Date(query.to) : new Date();
  const fromDate = query.from
    ? new Date(query.from)
    : new Date(toDate.getTime() - 24 * 3_600_000);

  return {
    from: fromDate.toISOString(),
    to: toDate.toISOString(),
  };
}

function previousTimeWindow(window: ResolvedTimeWindow): ResolvedTimeWindow {
  const fromDate = new Date(window.from);
  const toDate = new Date(window.to);
  const durationMs = Math.max(toDate.getTime() - fromDate.getTime(), 1);

  return {
    from: new Date(fromDate.getTime() - durationMs).toISOString(),
    to: fromDate.toISOString(),
  };
}

function chooseSkillTimeseriesBucket(window: ResolvedTimeWindow): '15m' | '1h' | '3h' {
  const fromMs = new Date(window.from).getTime();
  const toMs = new Date(window.to).getTime();
  const hours = Math.max((toMs - fromMs) / 3_600_000, 0);

  if (hours <= 6) {
    return '15m';
  }
  if (hours <= 24) {
    return '1h';
  }
  return '3h';
}

function bucketToSeconds(bucket: '15m' | '1h' | '3h'): number {
  if (bucket === '15m') {
    return 15 * 60;
  }
  if (bucket === '1h') {
    return 60 * 60;
  }
  return 3 * 60 * 60;
}

function createSkillTimeseriesTemplate(
  window: ResolvedTimeWindow,
  bucketSeconds: number,
): SddSkillTimeseries['points'] {
  const fromMs = new Date(window.from).getTime();
  return Array.from({ length: 24 }, (_, index) => ({
    timestamp: new Date(fromMs + index * bucketSeconds * 1000).toISOString(),
    triggeredCount: 0,
    pairedCount: 0,
  }));
}

function toInteractionItem(row: InteractionRow): SddInteractionItem {
  return {
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
    costUsd: toNullableNumber(row.cost_usd),
    inputTokens: toNullableNumber(row.input_tokens),
    outputTokens: toNullableNumber(row.output_tokens),
    cacheReadTokens: toNullableNumber(row.cache_read_tokens),
    cacheCreationTokens: toNullableNumber(row.cache_creation_tokens),
    llmCallCount: toNumber(row.llm_call_count),
    toolCallCount: toNumber(row.tool_call_count),
    skillName: row.skill_name,
    agentName: row.agent_name,
    pluginName: row.plugin_name,
    querySource: row.query_source,
    effort: row.effort,
    speed: row.speed,
    pairingMethod: toPairingMethod(row.pairing_method),
  };
}

function toPairingMethod(
  value: string | null,
): 'prompt_id' | 'anchored_by_user_prompt' | undefined {
  if (value === 'prompt_id' || value === 'anchored_by_user_prompt') {
    return value;
  }
  return undefined;
}

function toNullableNumber(value: unknown): number | null {
  return value === null || value === undefined ? null : Number(value);
}

function toNullableBoolean(value: unknown): boolean | null {
  if (value === null || value === undefined) {
    return null;
  }

  return value === true || value === 1 || value === '1' || value === 'true';
}

function rangeToSinceDate(range: WikiRecallRange): Date | null {
  const now = Date.now();
  if (range === '24h') return new Date(now - 24 * 60 * 60 * 1000);
  if (range === '7d') return new Date(now - 7 * 24 * 60 * 60 * 1000);
  if (range === '30d') return new Date(now - 30 * 24 * 60 * 60 * 1000);
  if (range === '90d') return new Date(now - 90 * 24 * 60 * 60 * 1000);
  return null;
}

// TODO: reportUserSettings 接口 (POST /api/sdd/user-settings) 前端无任何调用方，
// 仅 integration test 引用。计划整体删除接口、controller、service 方法、repository
// 方法和这个本地 createUserKey。删除时一并移除 sdd.contract.ts 里的
// ReportUserSettingsRequestSchema 和 ReportUserSettingsRequest 类型。
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

function emptyWikiContent(
  reason: SddWikiRecallContent['reason'],
  repoName: string | null,
  relativePath: string | null,
  rawPath: string | null,
): SddWikiRecallContent {
  return {
    found: false,
    reason,
    repoName,
    relativePath,
    rawPath,
    isMarkdown: false,
    content: null,
    truncated: false,
  };
}

async function statOrNull(p: string): Promise<import('node:fs').Stats | null> {
  try {
    return await fs.stat(p);
  } catch {
    return null;
  }
}

async function readUpTo(file: string, cap: number): Promise<string> {
  const handle = await fs.open(file, 'r');
  try {
    const buf = Buffer.alloc(cap);
    const { bytesRead } = await handle.read(buf, 0, cap, 0);
    return buf.subarray(0, bytesRead).toString('utf8');
  } finally {
    await handle.close();
  }
}
