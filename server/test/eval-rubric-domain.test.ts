import { describe, expect, it } from 'vitest';
import { RubricSchema, type EvalArtifactType } from '@sdd-telemetry/api';
import { builtinRubric, computeRubricHash, rubricMaxScore } from '../src/modules/eval/eval-rubric-domain';

const TYPES: EvalArtifactType[] = ['design', 'proposal', 'tasks'];

describe('builtinRubric', () => {
  it('三种产物类型的内置 rubric 都通过 RubricSchema 校验', () => {
    for (const t of TYPES) {
      expect(RubricSchema.safeParse(builtinRubric(t)).success).toBe(true);
    }
  });

  it('design 内置含 D1-D5 五维', () => {
    const codes = builtinRubric('design').dimensions.map((d) => d.code);
    expect(codes).toEqual(['D1', 'D2', 'D3', 'D4', 'D5']);
  });

  it('内置 rubric 无重复维度 code', () => {
    for (const t of TYPES) {
      const codes = builtinRubric(t).dimensions.map((d) => d.code);
      expect(new Set(codes).size).toBe(codes.length);
    }
  });
});

describe('computeRubricHash', () => {
  it('同一 rubric 稳定、不同内容变化', () => {
    const a = builtinRubric('design');
    expect(computeRubricHash(a)).toBe(computeRubricHash(builtinRubric('design')));
    const mutated = { ...a, dimensions: a.dimensions.slice(1) };
    expect(computeRubricHash(mutated)).not.toBe(computeRubricHash(a));
  });
});

describe('rubricMaxScore', () => {
  it('等权 5 维满分 = 10', () => {
    expect(rubricMaxScore(builtinRubric('design'))).toBe(10);
  });
});
