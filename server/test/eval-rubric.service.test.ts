import { describe, expect, it } from 'vitest';
import type { Rubric } from '@sdd-telemetry/api';
import { EvalRubricService } from '../src/modules/eval/eval-rubric.service';
import type {
  EvalRubricRepository,
  RubricVersionRow,
  RubricVersionSummaryRow,
} from '../src/modules/eval/eval-rubric.repository';
import type { ProfileConfigRepository } from '../src/modules/profiles/profile-config.repository';
import { computeRubricHash } from '../src/modules/eval/eval-rubric-domain';

const actor = { id: '7', role: 'super_admin' as const, username: 'admin' };

function rubric(code = 'D1'): Rubric {
  return {
    judge: { temperature: 0, evidenceRequired: true, context: 'intrinsic' },
    dimensions: [{
      code,
      name: '覆盖',
      weight: 1,
      anchors: { '0': '未满足', '1': '部分满足', '2': '完全满足' },
    }],
  };
}

function versionRow(input: Partial<RubricVersionRow> = {}): RubricVersionRow {
  const definition = rubric();
  return {
    id: '11',
    profileId: 'sdd-default',
    artifactType: 'design',
    versionNo: 2,
    versionStatus: 'published',
    rubricJson: definition,
    definitionHash: computeRubricHash(definition),
    publishedAt: '2026-06-23T00:00:00.000Z',
    gmtModified: '2026-06-23T00:00:00.000Z',
    ...input,
  };
}

function createService(input: {
  active?: RubricVersionRow | null;
  draft?: RubricVersionRow | null;
  versions?: RubricVersionSummaryRow[];
  saveResult?: { id: string; versionNo: number };
  publishResult?: { status: 'published'; versionNo: number } | { status: 'missing' } | { status: 'not_draft' };
  evaluationEnabled?: boolean;
} = {}) {
  const service = new EvalRubricService();
  let savedInput: Record<string, unknown> | null = null;
  service.evalRubricRepository = {
    getActiveVersion: async () => input.active ?? null,
    getDraftVersion: async () => input.draft ?? null,
    listVersions: async () => input.versions ?? [],
    runInTransaction: async <T,>(work: (manager: unknown) => Promise<T>) => work({}),
    saveDraftInTransaction: async (_manager: unknown, draftInput: Record<string, unknown>) => {
      savedInput = draftInput;
      return input.saveResult ?? { id: '12', versionNo: 3 };
    },
    publishInTransaction: async () => input.publishResult ?? { status: 'published', versionNo: 3 },
  } as unknown as EvalRubricRepository;
  service.profileConfigRepository = {
    getServingProfileConfig: async () => input.evaluationEnabled === false
      ? null
      : ({ config: { manifest: { evaluation: true } } }),
  } as unknown as ProfileConfigRepository;
  return { service, getSavedInput: () => savedInput };
}

describe('EvalRubricService', () => {
  it('assembles active, draft, history, and builtin default in overview', async () => {
    const active = versionRow();
    const draft = versionRow({
      id: '12',
      versionNo: 3,
      versionStatus: 'draft',
      publishedAt: null,
      rubricJson: rubric('D2'),
    });
    const versions: RubricVersionSummaryRow[] = [
      {
        id: draft.id,
        versionNo: draft.versionNo,
        versionStatus: draft.versionStatus,
        definitionHash: draft.definitionHash,
        publishedAt: null,
        gmtModified: draft.gmtModified,
      },
      {
        id: active.id,
        versionNo: active.versionNo,
        versionStatus: active.versionStatus,
        definitionHash: active.definitionHash,
        publishedAt: active.publishedAt,
        gmtModified: active.gmtModified,
      },
    ];
    const { service } = createService({ active, draft, versions });

    const result = await service.getOverview('sdd-default', 'design');

    expect(result.active?.versionNo).toBe(2);
    expect(result.draft?.rubric.dimensions[0]?.code).toBe('D2');
    expect(result.versions.map((version) => version.versionNo)).toEqual([3, 2]);
    expect(result.builtinDefault.dimensions.map((dimension) => dimension.code)).toEqual(['D1', 'D2', 'D3', 'D4', 'D5']);
  });

  it('rejects overview when evaluation is not enabled for the profile', async () => {
    const { service } = createService({ evaluationEnabled: false });
    await expect(service.getOverview('sdd-default', 'design'))
      .rejects.toMatchObject({ status: 409, code: 'EVAL_PROFILE_NOT_ENABLED' });
  });

  it('saves a draft with a stable hash and actor id', async () => {
    const definition = rubric();
    const { service, getSavedInput } = createService();

    await expect(service.saveDraft({
      profileId: 'sdd-default', artifactType: 'design', rubric: definition, actor,
    })).resolves.toEqual({ id: '12', versionNo: 3, versionStatus: 'draft' });

    expect(getSavedInput()).toMatchObject({
      profileId: 'sdd-default',
      artifactType: 'design',
      rubricJson: JSON.stringify(definition),
      definitionHash: computeRubricHash(definition),
      createdBy: '7',
    });
  });

  it('publishes a draft', async () => {
    const { service } = createService({ publishResult: { status: 'published', versionNo: 4 } });
    await expect(service.publish('14', { profileId: 'sdd-default', actor }))
      .resolves.toEqual({ id: '14', versionNo: 4, versionStatus: 'published' });
  });

  it('maps a missing version to EVAL_RUBRIC_NOT_FOUND', async () => {
    const { service } = createService({ publishResult: { status: 'missing' } });
    await expect(service.publish('404', { profileId: 'sdd-default', actor }))
      .rejects.toMatchObject({ status: 404, code: 'EVAL_RUBRIC_NOT_FOUND' });
  });

  it('rejects publishing an immutable published version', async () => {
    const { service } = createService({ publishResult: { status: 'not_draft' } });
    await expect(service.publish('11', { profileId: 'sdd-default', actor }))
      .rejects.toMatchObject({ status: 409, code: 'EVAL_RUBRIC_NOT_DRAFT' });
  });
});
