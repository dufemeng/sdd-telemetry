import { describe, expect, it } from 'vitest';
import {
  EvalItemListResponseSchema,
  EvalItemDetailResponseSchema,
  EvalItemSummarySchema,
  EvalImportFromLogsRequestSchema,
  EvalImportFromLogsResponseSchema,
  CreateEvalItemRequestSchema,
  RubricSchema,
  UpdateEvalItemRequestSchema,
} from '../src/contracts/eval.contract';

describe('eval contract', () => {
  it('list summary omits promptText, exposes promptPreview <=240 chars', () => {
    const summary = {
      id: '1',
      itemKey: 'k'.repeat(64),
      profileId: 'sdd-default',
      source: 'cleaned',
      promptPreview: 'x'.repeat(240),
      targetSkill: 'bk-fe-design',
      targetArtifactType: 'design',
      originCapabilityCode: 'design',
      originRawCapabilityName: 'bk-fe-design',
      occurrenceCount: 2,
      firstObservedAt: '2026-06-20T00:00:00.000Z',
      lastObservedAt: '2026-06-21T00:00:00.000Z',
      enabled: true,
      title: null,
      lastImportedAt: '2026-06-22T00:00:00.000Z',
      gmtModified: '2026-06-22T00:00:00.000Z',
    };
    const parsed = EvalItemSummarySchema.parse(summary);
    expect(parsed.promptPreview.length).toBe(240);
    expect(() => EvalItemSummarySchema.parse({ ...summary, promptText: 'leak' }))
      .toThrow();
  });

  it('detail response includes full promptText', () => {
    const detail = {
      id: '1',
      itemKey: 'k'.repeat(64),
      profileId: 'sdd-default',
      source: 'cleaned',
      promptText: 'full prompt',
      targetSkill: 'bk-fe-design',
      targetArtifactType: 'design',
      originCapabilityCode: 'design',
      originRawCapabilityName: 'bk-fe-design',
      originInteractionId: '42',
      originProjectionRunId: '7',
      occurrenceCount: 1,
      firstObservedAt: null,
      lastObservedAt: '2026-06-21T00:00:00.000Z',
      lastImportedAt: '2026-06-22T00:00:00.000Z',
      enabled: true,
      title: null,
      notes: null,
      gmtModified: '2026-06-22T00:00:00.000Z',
    };
    const parsed = EvalItemDetailResponseSchema.parse(detail);
    expect(parsed.promptText).toBe('full prompt');
  });

  it('create manual rejects empty prompt / empty target skill / missing artifact type', () => {
    const base = {
      profileId: 'sdd-default',
      source: 'manual',
      promptText: 'p',
      targetSkill: 'bk-fe-design',
      targetArtifactType: 'design',
    };
    expect(CreateEvalItemRequestSchema.parse(base).targetArtifactType).toBe('design');
    expect(() => CreateEvalItemRequestSchema.parse({ ...base, promptText: '   ' })).toThrow();
    expect(() => CreateEvalItemRequestSchema.parse({ ...base, targetSkill: '  ' })).toThrow();
    expect(() => CreateEvalItemRequestSchema.parse({ ...base, targetArtifactType: 'unknown' })).toThrow();
  });

  it('import request requires from/to to appear together within 31 days', () => {
    const base = { profileId: 'sdd-default' };
    expect(EvalImportFromLogsRequestSchema.parse(base).capabilityCode).toBeUndefined();
    expect(() => EvalImportFromLogsRequestSchema.parse({ ...base, from: '2026-06-01' })).toThrow();
    expect(() => EvalImportFromLogsRequestSchema.parse({
      ...base,
      from: '2026-01-01',
      to: '2026-06-01',
    })).toThrow();
  });

  it('update schema rejects unknown fields', () => {
    expect(() => UpdateEvalItemRequestSchema.parse({ bogus: 1 })).toThrow();
  });

  it('rubric rejects duplicate dimension codes', () => {
    const rubric = rubricFixture();
    expect(() => RubricSchema.parse({
      ...rubric,
      dimensions: [rubric.dimensions[0], { ...rubric.dimensions[0], name: '重复维度' }],
    })).toThrow(/duplicate dimension code/);
  });

  it('rubric requires all three anchors', () => {
    const rubric = rubricFixture();
    const dimension = rubric.dimensions[0];
    expect(() => RubricSchema.parse({
      ...rubric,
      dimensions: [{ ...dimension, anchors: { '0': '未满足', '2': '完全满足' } }],
    })).toThrow();
  });

  it('rubric validates judge context enum', () => {
    const rubric = rubricFixture();
    expect(RubricSchema.parse(rubric).judge.context).toBe('intrinsic');
    expect(() => RubricSchema.parse({
      ...rubric,
      judge: { ...rubric.judge, context: 'repository' },
    })).toThrow();
  });
});

function rubricFixture() {
  return {
    judge: { temperature: 0, evidenceRequired: true, context: 'intrinsic' },
    dimensions: [{
      code: 'D1',
      name: '覆盖',
      weight: 1,
      anchors: { '0': '未满足', '1': '部分满足', '2': '完全满足' },
    }],
  } as const;
}
