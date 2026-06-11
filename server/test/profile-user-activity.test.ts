import type { ProfileUserActivityItem } from '@sdd-telemetry/api';
import { describe, expect, it } from 'vitest';
import {
  collapseProfileUserActivityItems,
  expandProfileUserActivityFetchLimit,
  type ProfileUserActivityFactItem,
} from '../src/modules/profiles/profile-user-activity';

function activity(input: Partial<ProfileUserActivityFactItem> & { id: string }): ProfileUserActivityFactItem {
  return {
    kind: 'capability',
    eventTime: '2026-06-11T02:13:49.751Z',
    interactionId: '9992531',
    deliveryUnitId: '228',
    artifactId: null,
    capabilityUsageId: null,
    capabilityCode: null,
    capabilityDisplayName: null,
    rawCapabilityName: null,
    title: '活动',
    detail: null,
    locator: null,
    ...input,
  };
}

describe('profile user activity collapse', () => {
  it('collapses activity facts from the same interaction into one visual card', () => {
    const items = collapseProfileUserActivityItems([
      activity({
        id: 'knowledge-667',
        kind: 'knowledge',
        capabilityCode: 'knowledge-recall',
        title: '知识读取',
        detail: 'wiki/platform/telemetry-guidelines.md',
        locator: 'wiki/platform/telemetry-guidelines.md',
        promptText: '请根据知识库和现有代码，补齐 checkout telemetry 的方案与测试。',
      }),
      activity({
        id: 'code-20083',
        kind: 'code',
        capabilityCode: 'code-implementation',
        title: '代码实施',
        detail: 'edit',
        locator: 'src/checkout/checkoutTelemetry.test.ts',
      }),
      activity({
        id: 'capability-2650',
        kind: 'capability',
        capabilityCode: 'plan-doc-read',
        capabilityDisplayName: '计划文档读取',
        title: '计划文档读取',
      }),
      activity({
        id: 'capability-2645',
        kind: 'capability',
        capabilityCode: 'plan-doc-read',
        capabilityDisplayName: '计划文档读取',
        title: '计划文档读取',
      }),
      activity({
        id: 'artifact-write-162',
        kind: 'artifact_write',
        artifactId: '34',
        title: 'edit',
      }),
    ]);

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      id: 'interaction-9992531',
      interactionId: '9992531',
      deliveryUnitId: '228',
      title: '请根据知识库和现有代码，补齐 checkout telemetry 的方案与测试。',
      activityCounts: {
        total: 5,
        capability: 2,
        knowledge: 1,
        code: 1,
        artifactWrite: 1,
        artifactDiscussion: 0,
      },
    });
    expect(items[0].detail).toContain('知识读取: wiki/platform/telemetry-guidelines.md');
    expect(items[0].detail).toContain('代码实施: src/checkout/checkoutTelemetry.test.ts');
    expect(items[0].detail).toContain('计划文档读取 x2');
    expect(items[0].detail).toContain('产物写入: edit');
  });

  it('falls back to a compact activity title when the interaction has no prompt text', () => {
    const items = collapseProfileUserActivityItems([
      activity({ id: 'capability-1', interactionId: '100', capabilityDisplayName: '计划文档读取', title: '计划文档读取' }),
      activity({ id: 'knowledge-1', interactionId: '100', kind: 'knowledge', title: '知识读取' }),
    ]);

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      id: 'interaction-100',
      title: '一次互动 · 1 次能力 · 1 次知识',
      activityCounts: {
        total: 2,
        capability: 1,
        knowledge: 1,
        code: 0,
        artifactWrite: 0,
        artifactDiscussion: 0,
      },
    });
  });

  it('does not collapse records without an interaction id', () => {
    const items = collapseProfileUserActivityItems([
      activity({ id: 'knowledge-1', interactionId: null, kind: 'knowledge', title: '知识读取' }),
      activity({ id: 'knowledge-2', interactionId: null, kind: 'knowledge', title: '知识读取' }),
    ]);

    expect(items.map((item) => item.id)).toEqual(['knowledge-2', 'knowledge-1']);
  });

  it('applies the requested limit after collapsing interactions', () => {
    const items = collapseProfileUserActivityItems([
      activity({ id: 'capability-old', interactionId: 'old', eventTime: '2026-06-10T00:00:00.000Z' }),
      activity({ id: 'capability-new', interactionId: 'new', eventTime: '2026-06-11T00:00:00.000Z' }),
      activity({ id: 'knowledge-new', interactionId: 'new', kind: 'knowledge', eventTime: '2026-06-11T00:00:00.000Z' }),
    ], 1);

    expect(items).toHaveLength(1);
    expect(items[0].id).toBe('interaction-new');
  });

  it('expands the raw fetch limit to avoid one dense interaction starving older cards', () => {
    expect(expandProfileUserActivityFetchLimit(10)).toBe(100);
    expect(expandProfileUserActivityFetchLimit(500)).toBe(1000);
  });
});
