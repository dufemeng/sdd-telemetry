import { Inject, Provide } from '@midwayjs/core';
import {
  type AuthSessionUser,
  type WorkflowProfileConfig,
} from '@sdd-telemetry/api';
import { ApiHttpError, conflict } from '../../common/auth/api-http-error';
import {
  computeItemKey,
  mapArtifactType,
  normalizePromptForDedup,
  PROMPT_MAX,
  resolveTargetSkill,
  previewPrompt,
} from './eval-item-domain';
import type {
  CapabilityTextRow,
  EvalItemRow,
  ImportCandidate,
} from './eval-item.repository';
import { EvalItemRepository } from './eval-item.repository';
import { ProfileConfigRepository } from '../profiles/profile-config.repository';

const BATCH_SIZE = 500;

export interface EvalItemListQuery {
  profileId: string;
  source?: 'cleaned' | 'manual';
  capabilityCode?: string;
  targetSkill?: string;
  enabled?: boolean;
  keyword?: string;
  page: number;
  pageSize: number;
}

@Provide('evalItemService')
export class EvalItemService {
  @Inject('evalItemRepository')
  evalItemRepository!: EvalItemRepository;

  @Inject('profileConfigRepository')
  profileConfigRepository!: ProfileConfigRepository;

  async list(query: EvalItemListQuery): Promise<{
    items: Array<Omit<EvalItemRow, 'promptText'> & { promptPreview: string }>;
    total: number;
    page: number;
    pageSize: number;
    summary: { total: number; enabled: number; cleaned: number; manual: number };
  }> {
    const { items, total } = await this.evalItemRepository.listItems(query);
    const summary = await this.evalItemRepository.listSummary(query.profileId);
    return {
      items: items.map((item) => ({
        ...stripPrompt(item),
        promptPreview: previewPrompt(item.promptText ?? ''),
      })),
      total,
      page: query.page,
      pageSize: query.pageSize,
      summary,
    };
  }

  async getDetail(id: string, profileId: string): Promise<EvalItemRow> {
    const item = await this.evalItemRepository.getItem(id, profileId);
    if (!item) {
      throw new ApiHttpError(404, 'EVAL_ITEM_NOT_FOUND', `eval item not found: ${id}`);
    }
    return item;
  }

  async importFromLogs(input: {
    profileId: string;
    capabilityCode?: string;
    from?: string;
    to?: string;
  }): Promise<{
    projectionRunId: string;
    scannedCount: number;
    candidateCount: number;
    insertedCount: number;
    refreshedCount: number;
    upgradedCount: number;
    skippedNoPromptCount: number;
    skippedOversizeCount: number;
    skippedDeletedCount: number;
  }> {
    // 用 serving config 校验 evaluation 开启; target skill 解析优先用 projection run 引用的 version。
    const servingConfig = await this.requireEvaluationProfile(input.profileId);
    const projectionRunId = await this.evalItemRepository.getCurrentProjectionRunId(input.profileId);
    if (!projectionRunId) {
      throw new ApiHttpError(409, 'EVAL_NO_PROJECTION_RUN', `no current projection run for ${input.profileId}`);
    }
    const versionId = await this.resolveConfigVersionId(input.profileId, projectionRunId);

    const scannedCount = { value: 0 };
    const skippedNoPrompt = { value: 0 };
    const skippedOversize = { value: 0 };
    const groups = new Map<string, CapabilityTextRow[]>();

    let afterCuId: string | undefined;
    for (;;) {
      const rows = await this.evalItemRepository.readCapabilityTextRows({
        profileId: input.profileId,
        projectionRunId,
        ...(input.capabilityCode !== undefined ? { capabilityCode: input.capabilityCode } : {}),
        ...(input.from !== undefined ? { from: input.from } : {}),
        ...(input.to !== undefined ? { to: input.to } : {}),
        ...(afterCuId !== undefined ? { afterCuId } : {}),
        batchSize: BATCH_SIZE,
      });
      if (rows.length === 0) break;
      const lastRow = rows[rows.length - 1];
      if (lastRow) afterCuId = lastRow.cuId;
      for (const row of rows) {
        scannedCount.value += 1;
        const text = row.promptText;
        if (!text || text.trim().length === 0) {
          skippedNoPrompt.value += 1;
          continue;
        }
        if (text.length > PROMPT_MAX) {
          skippedOversize.value += 1;
          continue;
        }
        const normalized = normalizePromptForDedup(text);
        const groupKey = `${row.capabilityCode}\u0000${normalized}`;
        const list = groups.get(groupKey);
        if (list) list.push(row); else groups.set(groupKey, [row]);
      }
      if (rows.length < BATCH_SIZE) break;
    }

    const candidates = buildCandidates(groups, {
      profileId: input.profileId,
      projectionRunId,
      config: versionId ? await this.loadConfigVersion(input.profileId, versionId) : servingConfig,
    });

    const now = new Date();
    const outcome = await this.evalItemRepository.runInTransaction(async (manager) =>
      this.evalItemRepository.upsertCleanedCandidatesInTransaction(manager, candidates, now),
    );

    return {
      projectionRunId,
      scannedCount: scannedCount.value,
      candidateCount: candidates.length,
      insertedCount: outcome.inserted,
      refreshedCount: outcome.refreshed,
      upgradedCount: outcome.upgraded,
      skippedNoPromptCount: skippedNoPrompt.value,
      skippedOversizeCount: skippedOversize.value,
      skippedDeletedCount: outcome.skippedDeleted,
    };
  }

  async createManual(input: {
    profileId: string;
    promptText: string;
    targetSkill: string;
    targetArtifactType: string;
    title?: string;
    notes?: string;
    actor: AuthSessionUser;
  }): Promise<{ id: string }> {
    await this.requireEvaluationProfile(input.profileId);
    const normalized = normalizePromptForDedup(input.promptText);
    const itemKey = computeItemKey({
      profileId: input.profileId,
      targetSkill: input.targetSkill,
      targetArtifactType: input.targetArtifactType,
      normalizedPrompt: normalized,
    });
    const result = await this.evalItemRepository.runInTransaction(async (manager) =>
      this.evalItemRepository.insertManualInTransaction(manager, {
        itemKey,
        profileId: input.profileId,
        promptText: input.promptText,
        targetSkill: input.targetSkill,
        targetArtifactType: input.targetArtifactType,
        ...(input.title !== undefined ? { title: input.title } : {}),
        ...(input.notes !== undefined ? { notes: input.notes } : {}),
      }),
    );
    if (result.status === 'tombstone') {
      throw conflict('该样本已被删除,无法重新创建');
    }
    if (result.status === 'exists') {
      throw conflict('该样本已存在');
    }
    return { id: result.id };
  }

  async update(id: string, input: {
    profileId: string;
    promptText?: string;
    targetSkill?: string;
    targetArtifactType?: 'design' | 'proposal' | 'tasks';
    title?: string | null;
    notes?: string | null;
    enabled?: boolean;
    actor: AuthSessionUser;
  }): Promise<void> {
    const existing = await this.evalItemRepository.getItem(id, input.profileId);
    if (!existing) {
      throw new ApiHttpError(404, 'EVAL_ITEM_NOT_FOUND', `eval item not found: ${id}`);
    }
    let nextItemKey: string | undefined;
    if (existing.source === 'manual') {
      // manual: 允许改 key 字段; 任一 key 字段变更则重算 key
      const newPrompt = input.promptText !== undefined ? input.promptText : existing.promptText ?? '';
      const newSkill = input.targetSkill !== undefined ? input.targetSkill : existing.targetSkill ?? '';
      const newArtifact = input.targetArtifactType !== undefined ? input.targetArtifactType : existing.targetArtifactType ?? '';
      const newKey = computeItemKey({
        profileId: input.profileId,
        targetSkill: newSkill,
        targetArtifactType: newArtifact,
        normalizedPrompt: normalizePromptForDedup(newPrompt),
      });
      if (newKey !== existing.itemKey) nextItemKey = newKey;
    } else {
      // cleaned: 拒绝 prompt/target 改动 (service 层拦截; repository 也不会写)
      if (input.promptText !== undefined || input.targetSkill !== undefined || input.targetArtifactType !== undefined) {
        throw new ApiHttpError(400, 'EVAL_CLEANED_IMMUTABLE', 'cleaned 样本的 prompt/target 不可直接编辑,请复制为手工样本');
      }
    }
    const result = await this.evalItemRepository.runInTransaction(async (manager) =>
      this.evalItemRepository.updateItemInTransaction(manager, {
        id,
        profileId: input.profileId,
        source: existing.source,
        ...(input.title !== undefined ? { title: input.title } : {}),
        ...(input.notes !== undefined ? { notes: input.notes } : {}),
        ...(input.enabled !== undefined ? { enabled: input.enabled } : {}),
        ...(existing.source === 'manual' && input.promptText !== undefined ? { promptText: input.promptText } : {}),
        ...(existing.source === 'manual' && input.targetSkill !== undefined ? { targetSkill: input.targetSkill } : {}),
        ...(existing.source === 'manual' && input.targetArtifactType !== undefined ? { targetArtifactType: input.targetArtifactType } : {}),
        ...(nextItemKey !== undefined ? { itemKey: nextItemKey } : {}),
      }),
    );
    if (result.status === 'missing') {
      throw new ApiHttpError(404, 'EVAL_ITEM_NOT_FOUND', `eval item not found: ${id}`);
    }
    if (result.status === 'conflict') {
      throw conflict('目标样本已存在,无法改为重复 key');
    }
  }

  async remove(id: string, input: { profileId: string; actor: AuthSessionUser }): Promise<void> {
    const result = await this.evalItemRepository.runInTransaction(async (manager) =>
      this.evalItemRepository.deleteItemInTransaction(manager, {
        id,
        profileId: input.profileId,
        userId: input.actor.id,
      }),
    );
    if (result.status === 'missing') {
      throw new ApiHttpError(404, 'EVAL_ITEM_NOT_FOUND', `eval item not found: ${id}`);
    }
  }

  private async requireEvaluationProfile(profileId: string): Promise<WorkflowProfileConfig> {
    const snapshot = await this.profileConfigRepository.getServingProfileConfig(profileId);
    if (!snapshot || !snapshot.config.manifest.evaluation) {
      throw new ApiHttpError(409, 'EVAL_PROFILE_NOT_ENABLED', `evaluation not enabled for ${profileId}`);
    }
    return snapshot.config;
  }

  private async resolveConfigVersionId(profileId: string, projectionRunId: string): Promise<string | null> {
    // 读 projection run 引用的 config version id; legacy run 可能为 null => 回退 serving。
    const dataSource = await this.evalItemRepository.mysqlDataSourceManager.getDataSource();
    const rows = (await dataSource.query(
      `SELECT profile_config_version_id AS versionId
       FROM profile_projection_runs
       WHERE profile_id = ? AND id = ? LIMIT 1`,
      [profileId, projectionRunId],
    )) as Array<{ versionId: string | null }>;
    return rows[0]?.versionId ?? null;
  }

  private async loadConfigVersion(profileId: string, versionId: string): Promise<WorkflowProfileConfig> {
    const snapshot = await this.profileConfigRepository.getProfileConfigVersionById(profileId, versionId);
    if (!snapshot) {
      throw new ApiHttpError(409, 'EVAL_CONFIG_VERSION_MISSING', `projection references missing config version ${versionId}`);
    }
    return snapshot.config;
  }
}

function stripPrompt(item: EvalItemRow): Omit<EvalItemRow, 'promptText'> {
  const { promptText: _omit, ...rest } = item;
  return rest;
}

/** 按归一化 prompt 分组, 每组取最新原文 + 聚合观测次数。 */
function buildCandidates(
  groups: Map<string, CapabilityTextRow[]>,
  ctx: { profileId: string; projectionRunId: string; config: WorkflowProfileConfig },
): ImportCandidate[] {
  const candidates: ImportCandidate[] = [];
  for (const [, rows] of groups) {
    const sorted = [...rows].sort((a, b) => {
      const at = a.eventTime ? new Date(a.eventTime).getTime() : 0;
      const bt = b.eventTime ? new Date(b.eventTime).getTime() : 0;
      if (bt !== at) return bt - at;
      return Number(b.cuId) - Number(a.cuId);
    });
    const latest = sorted[0];
    if (!latest) continue;
    const normalized = normalizePromptForDedup(latest.promptText ?? '');
    const targetSkill = resolveTargetSkill(ctx.config, latest.capabilityCode);
    const targetArtifactType = mapArtifactType(latest.capabilityCode);
    const first = rows.reduce<Date | string | null>((acc, r) => earliest(acc, r.eventTime), null);
    const last = latest.eventTime;
    candidates.push({
      itemKey: computeItemKey({
        profileId: ctx.profileId,
        targetSkill,
        targetArtifactType,
        normalizedPrompt: normalized,
      }),
      profileId: ctx.profileId,
      promptText: latest.promptText ?? '',
      targetSkill,
      targetArtifactType,
      originInteractionId: latest.interactionId,
      originPromptId: latest.promptId,
      originProjectionRunId: ctx.projectionRunId,
      originCapabilityCode: latest.capabilityCode,
      originRawCapabilityName: latest.rawCapabilityName,
      occurrenceCount: rows.length,
      firstObservedAt: first,
      lastObservedAt: last,
    });
  }
  return candidates;
}

function earliest(a: Date | string | null, b: Date | string | null): Date | string | null {
  if (!b) return a;
  if (!a) return b;
  return new Date(a) <= new Date(b) ? a : b;
}
