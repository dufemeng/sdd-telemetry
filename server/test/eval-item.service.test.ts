import { describe, expect, it } from 'vitest';
import { EvalItemService } from '../src/modules/eval/eval-item.service';
import type { EvalItemRepository, CapabilityTextRow, ImportCandidate } from '../src/modules/eval/eval-item.repository';
import type { ProfileConfigRepository } from '../src/modules/profiles/profile-config.repository';
import type { WorkflowProfileConfig } from '@sdd-telemetry/api';

function configFixture(): WorkflowProfileConfig {
  return {
    profileId: 'sdd-default', displayName: 'SDD', status: 'active', projectionMode: 'source_backed',
    manifest: { capabilityUsage: true, deliveryUnits: true, artifacts: true, artifactTimeline: true, knowledgeRecalls: true, codeChanges: true, errors: true, evaluation: true, alerts: false },
    sourceRules: [{ ruleId: 's1', priority: 100, confidence: 'high', enabled: true, category: 'skill', actions: ['invoke'], locatorType: 'skill', skillNames: ['bk-fe-design'] }],
    capabilityRules: [{ ruleId: 'c1', sourceRuleIds: ['s1'], actions: ['invoke'], capabilityCode: 'design', displayName: '设计', surfaceRole: 'core' }],
    deliveryUnitRules: [], artifactRules: [], errorRules: [],
    attributionPolicy: { anchorCategories: ['process_doc'], anchorActions: ['read'], sameInteraction: { enabled: false, preferActions: [] }, sameSessionWindow: { enabled: false, minutes: 0, requireSameUser: false, preferActions: [] } },
    presentation: { workflowKind: 'sdd', maturityStages: [], artifactStageOrder: [], hiddenMetrics: [] },
  };
}

const authActor = { id: 'u1', role: 'super_admin' as const, username: 'admin' };

function createService(opts: {
  projectionRunId?: string | null;
  capabilityRows?: CapabilityTextRow[];
  configVersionId?: string | null;
  config?: WorkflowProfileConfig;
  evaluationEnabled?: boolean;
  upsert?: (candidates: ImportCandidate[]) =>
    { inserted: number; refreshed: number; upgraded: number; skippedDeleted: number };
}): { service: EvalItemService; capturedCandidates: ImportCandidate[] } {
  const capturedCandidates: ImportCandidate[] = [];
  const service = new EvalItemService();
  service.evalItemRepository = {
    getCurrentProjectionRunId: async () => opts.projectionRunId === undefined ? '77' : opts.projectionRunId,
    getConfigVersionIdForRun: async () => opts.configVersionId === undefined ? null : opts.configVersionId,
    readCapabilityTextRows: async (input: { afterCuId?: string }) => {
      if (input.afterCuId) return [];
      return opts.capabilityRows ?? [];
    },
    runInTransaction: async <T,>(work: (m: unknown) => Promise<T>): Promise<T> => work({}),
    upsertCleanedCandidatesInTransaction: async (_m: unknown, cands: ImportCandidate[]) => {
      capturedCandidates.push(...cands);
      return (opts.upsert ?? ((c) => ({ inserted: c.length, refreshed: 0, upgraded: 0, skippedDeleted: 0 })))(cands);
    },
  } as unknown as EvalItemRepository;
  const evalEnabled = opts.evaluationEnabled !== undefined ? opts.evaluationEnabled : true;
  service.profileConfigRepository = {
    getServingProfileConfig: async () => evalEnabled ? ({
      profileId: 'sdd-default', source: 'database', origin: 'builtin',
      configVersionId: '1', versionNo: 1, definitionHash: 'h', publishedAt: null,
      config: opts.config ?? configFixture(),
    }) : null,
    getProfileConfigVersionById: async () => ({
      profileId: 'sdd-default', source: 'database', origin: 'builtin',
      configVersionId: '1', versionNo: 1, definitionHash: 'h', publishedAt: null,
      config: opts.config ?? configFixture(),
    }),
  } as unknown as ProfileConfigRepository;
  return { service, capturedCandidates };
}

describe('EvalItemService.importFromLogs', () => {
  it('dedupes same normalized prompt across interactions into one candidate, occurrenceCount=2', async () => {
    const rows: CapabilityTextRow[] = [
      { cuId: '1', interactionId: '10', promptId: 'p1', capabilityCode: 'design', rawCapabilityName: 'bk-fe-design', eventTime: '2026-06-20T00:00:00.000Z', promptText: '设计一个登录页' },
      { cuId: '2', interactionId: '11', promptId: 'p2', capabilityCode: 'design', rawCapabilityName: 'bk-fe-design', eventTime: '2026-06-21T00:00:00.000Z', promptText: '设计一个登录页' },
    ];
    const { service, capturedCandidates } = createService({ capabilityRows: rows });
    const result = await service.importFromLogs({ profileId: 'sdd-default' });
    expect(result.scannedCount).toBe(2);
    expect(result.candidateCount).toBe(1);
    expect(capturedCandidates.length).toBe(1);
    expect(capturedCandidates[0].occurrenceCount).toBe(2);
    expect(capturedCandidates[0].originInteractionId).toBe('11'); // 最新 event_time
    expect(capturedCandidates[0].targetSkill).toBe('bk-fe-design');
    expect(capturedCandidates[0].targetArtifactType).toBe('design');
  });
  it('skips empty prompt (skippedNoPrompt) without creating candidate', async () => {
    const rows: CapabilityTextRow[] = [
      { cuId: '1', interactionId: null, promptId: null, capabilityCode: 'design', rawCapabilityName: null, eventTime: null, promptText: null },
      { cuId: '2', interactionId: '12', promptId: 'p', capabilityCode: 'design', rawCapabilityName: 'bk-fe-design', eventTime: null, promptText: '   ' },
    ];
    const { service, capturedCandidates } = createService({ capabilityRows: rows });
    const result = await service.importFromLogs({ profileId: 'sdd-default' });
    expect(result.skippedNoPromptCount).toBe(2);
    expect(result.candidateCount).toBe(0);
    expect(capturedCandidates.length).toBe(0);
  });

  it('skips oversize prompt but keeps others (scanned counts both)', async () => {
    const big = 'x'.repeat(256001);
    const rows: CapabilityTextRow[] = [
      { cuId: '1', interactionId: '12', promptId: 'p', capabilityCode: 'design', rawCapabilityName: 'bk-fe-design', eventTime: null, promptText: big },
      { cuId: '2', interactionId: '13', promptId: 'p', capabilityCode: 'design', rawCapabilityName: 'bk-fe-design', eventTime: null, promptText: '正常' },
    ];
    const { service } = createService({ capabilityRows: rows });
    const result = await service.importFromLogs({ profileId: 'sdd-default' });
    expect(result.scannedCount).toBe(2);
    expect(result.skippedOversizeCount).toBe(1);
    expect(result.candidateCount).toBe(1);
  });

  it('satisfies scanned = accepted + skippedNoPrompt + skippedOversize + skippedNoArtifactType; candidate = inserted+refreshed+upgraded+skippedDeleted', async () => {
    const rows: CapabilityTextRow[] = [
      { cuId: '1', interactionId: null, promptId: null, capabilityCode: 'design', rawCapabilityName: null, eventTime: null, promptText: null },
      { cuId: '2', interactionId: '12', promptId: 'p', capabilityCode: 'design', rawCapabilityName: 'bk-fe-design', eventTime: null, promptText: 'a' },
    ];
    const { service } = createService({ capabilityRows: rows });
    const r = await service.importFromLogs({ profileId: 'sdd-default' });
    const accepted = r.insertedCount + r.refreshedCount + r.upgradedCount;
    expect(r.scannedCount).toBe(accepted + r.skippedNoPromptCount + r.skippedOversizeCount + r.skippedNoArtifactTypeCount);
    expect(r.candidateCount).toBe(r.insertedCount + r.refreshedCount + r.upgradedCount + r.skippedDeletedCount);
  });

  it('throws 409 when no current projection run', async () => {
    const { service } = createService({ projectionRunId: null });
    await expect(service.importFromLogs({ profileId: 'sdd-default' })).rejects.toMatchObject({ status: 409 });
  });

  it('throws 409 when evaluation not enabled on profile', async () => {
    const { service } = createService({ evaluationEnabled: false });
    await expect(service.importFromLogs({ profileId: 'sdd-default' })).rejects.toMatchObject({ status: 409, code: 'EVAL_PROFILE_NOT_ENABLED' });
  });

  it('unresolvable target skill (fallback capability) => candidate.targetSkill null', async () => {
    const cfg = configFixture();
    cfg.capabilityRules[0] = { ...cfg.capabilityRules[0], surfaceRole: 'fallback' };
    const rows: CapabilityTextRow[] = [
      { cuId: '1', interactionId: '12', promptId: 'p', capabilityCode: 'design', rawCapabilityName: 'bk-fe-design', eventTime: null, promptText: 'x' },
    ];
    const { service, capturedCandidates } = createService({ capabilityRows: rows, config: cfg });
    await service.importFromLogs({ profileId: 'sdd-default' });
    expect(capturedCandidates[0].targetSkill).toBeNull();
  });

  it('uses config version referenced by projection run (not serving) when versionId present', async () => {
    // serving config: design 规则 -> bk-fe-design; version config: design 规则 -> bk-fe-design-v2
    const versionCfg = configFixture();
    versionCfg.sourceRules = [{ ruleId: 's1', priority: 100, confidence: 'high', enabled: true, category: 'skill', actions: ['invoke'], locatorType: 'skill', skillNames: ['bk-fe-design-v2'] }];
    const servingCfg = configFixture();
    const rows: CapabilityTextRow[] = [
      { cuId: '1', interactionId: '12', promptId: 'p', capabilityCode: 'design', rawCapabilityName: 'bk-fe-design', eventTime: null, promptText: 'x' },
    ];
    const { service, capturedCandidates } = createService({ capabilityRows: rows, configVersionId: '5', config: servingCfg });
    // mock: getProfileConfigVersionById 返回 versionCfg 需要单独注入
    service.profileConfigRepository.getProfileConfigVersionById = async () => ({
      profileId: 'sdd-default', source: 'database', origin: 'builtin',
      configVersionId: '5', versionNo: 2, definitionHash: 'h2', publishedAt: null,
      config: versionCfg,
    }) as never;
    await service.importFromLogs({ profileId: 'sdd-default' });
    expect(capturedCandidates[0].targetSkill).toBe('bk-fe-design-v2'); // 用了 version config 而非 serving
  });

  it('falls back to serving config when projection run has no versionId (legacy)', async () => {
    const rows: CapabilityTextRow[] = [
      { cuId: '1', interactionId: '12', promptId: 'p', capabilityCode: 'design', rawCapabilityName: 'bk-fe-design', eventTime: null, promptText: 'x' },
    ];
    const { service, capturedCandidates } = createService({ capabilityRows: rows, configVersionId: null });
    await service.importFromLogs({ profileId: 'sdd-default' });
    expect(capturedCandidates[0].targetSkill).toBe('bk-fe-design'); // serving config
  });
});

describe('EvalItemService.list', () => {
  it('returns items with promptPreview (not full promptText)', async () => {
    const { service } = createService({});
    service.evalItemRepository.listItems = async () => ({
      items: [{
        id: '1', itemKey: 'k', profileId: 'sdd-default', source: 'manual' as const,
        promptText: 'x'.repeat(300), targetSkill: 's', targetArtifactType: 'design',
        originInteractionId: null, originPromptId: null, originProjectionRunId: null,
        originCapabilityCode: null, originRawCapabilityName: null, occurrenceCount: 0,
        firstObservedAt: null, lastObservedAt: null, lastImportedAt: null,
        enabled: true, title: null, notes: null, deletedAt: null,
      }],
      total: 1,
    });
    service.evalItemRepository.listSummary = async () => ({ total: 1, enabled: 1, cleaned: 0, manual: 1 });
    const result = await service.list({ profileId: 'sdd-default', page: 1, pageSize: 20 });
    expect(result.items[0].promptPreview.length).toBe(240);
    expect((result.items[0] as { promptText?: string }).promptText).toBeUndefined();
  });
});

describe('EvalItemService.update field permissions', () => {
  const cleanedItem = {
    id: '1', itemKey: 'k', profileId: 'sdd-default', source: 'cleaned' as const, promptText: 'p',
    targetSkill: 'bk-fe-design', targetArtifactType: 'design',
    originInteractionId: '1', originPromptId: null, originProjectionRunId: '7',
    originCapabilityCode: 'design', originRawCapabilityName: 'bk-fe-design',
    occurrenceCount: 1, firstObservedAt: null, lastObservedAt: null, lastImportedAt: null,
    enabled: true, title: null, notes: null, deletedAt: null,
  };
  const manualItem = {
    id: '1', itemKey: 'old', profileId: 'sdd-default', source: 'manual' as const, promptText: 'p',
    targetSkill: 'bk-fe-design', targetArtifactType: 'design',
    originInteractionId: null, originPromptId: null, originProjectionRunId: null,
    originCapabilityCode: null, originRawCapabilityName: null,
    occurrenceCount: 0, firstObservedAt: null, lastObservedAt: null, lastImportedAt: null,
    enabled: true, title: null, notes: null, deletedAt: null,
  };

  it('rejects prompt/target change on cleaned item', async () => {
    const { service } = createService({});
    service.evalItemRepository.getItem = async () => cleanedItem;
    await expect(service.update('1', { profileId: 'sdd-default', promptText: 'changed', actor: authActor }))
      .rejects.toMatchObject({ status: 400, code: 'EVAL_CLEANED_IMMUTABLE' });
  });

  it('allows prompt change on manual item, recomputes key', async () => {
    const { service } = createService({});
    service.evalItemRepository.getItem = async () => manualItem;
    let passedKey: string | undefined;
    let passedPrompt: string | undefined;
    service.evalItemRepository.updateItemInTransaction = async (_m, input) => {
      passedKey = (input as { itemKey?: string }).itemKey; passedPrompt = (input as { promptText?: string }).promptText; return { status: 'updated' };
    };
    await service.update('1', { profileId: 'sdd-default', promptText: 'changed', actor: authActor });
    expect(passedPrompt).toBe('changed');
    expect(passedKey).toBeTruthy();
    expect(passedKey).not.toBe('old');
  });

  it('404 when item missing', async () => {
    const { service } = createService({});
    service.evalItemRepository.getItem = async () => null;
    await expect(service.update('1', { profileId: 'sdd-default', title: 't', actor: authActor }))
      .rejects.toMatchObject({ status: 404 });
  });
});

describe('EvalItemService.createManual', () => {
  it('throws conflict when key exists (status=exists)', async () => {
    const { service } = createService({});
    service.evalItemRepository.runInTransaction = async (w) => w({
      // insertManualInTransaction returns exists
    });
    service.evalItemRepository.insertManualInTransaction = async () => ({ status: 'exists', existingId: '5' }) as never;
    await expect(service.createManual({
      profileId: 'sdd-default', promptText: 'p', targetSkill: 'bk-fe-design',
      targetArtifactType: 'design', actor: authActor,
    })).rejects.toMatchObject({ status: 409 });
  });

  it('throws conflict when tombstone', async () => {
    const { service } = createService({});
    service.evalItemRepository.insertManualInTransaction = async () => ({ status: 'tombstone' }) as never;
    await expect(service.createManual({
      profileId: 'sdd-default', promptText: 'p', targetSkill: 'bk-fe-design',
      targetArtifactType: 'design', actor: authActor,
    })).rejects.toMatchObject({ status: 409 });
  });

  it('returns id on create', async () => {
    const { service } = createService({});
    service.evalItemRepository.insertManualInTransaction = async () => ({ status: 'created', id: '9' }) as never;
    const result = await service.createManual({
      profileId: 'sdd-default', promptText: 'p', targetSkill: 'bk-fe-design',
      targetArtifactType: 'design', actor: authActor,
    });
    expect(result).toEqual({ id: '9' });
  });
});

describe('EvalItemService.remove', () => {
  it('404 when already deleted', async () => {
    const { service } = createService({});
    service.evalItemRepository.deleteItemInTransaction = async () => ({ status: 'missing' }) as never;
    await expect(service.remove('1', { profileId: 'sdd-default', actor: authActor }))
      .rejects.toMatchObject({ status: 404 });
  });
});
