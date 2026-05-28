import { describe, expect, it } from 'vitest';
import { attachSkillUsageToToolCallsForOneInteraction } from '../src/jobs/cleaning-worker';

describe('attachSkillUsageToToolCallsForOneInteraction', () => {
  it('归属到事件序号≤tool_call的最近 skill_usage', () => {
    const usages = [
      { id: 'u1', eventSequence: 10 },
      { id: 'u2', eventSequence: 30 },
    ];
    const toolCalls = [
      { id: 'tc1', sequence: 5 },   // 之前没有 usage
      { id: 'tc2', sequence: 15 },  // 归 u1
      { id: 'tc3', sequence: 30 },  // 归 u2（边界：相等）
      { id: 'tc4', sequence: 50 },  // 归 u2
    ];

    const assignments = attachSkillUsageToToolCallsForOneInteraction(toolCalls, usages);

    expect(assignments).toEqual([
      { toolCallId: 'tc1', skillUsageId: null },
      { toolCallId: 'tc2', skillUsageId: 'u1' },
      { toolCallId: 'tc3', skillUsageId: 'u2' },
      { toolCallId: 'tc4', skillUsageId: 'u2' },
    ]);
  });

  it('没有 skill_usage 时全部归 null', () => {
    const assignments = attachSkillUsageToToolCallsForOneInteraction(
      [{ id: 'tc1', sequence: 5 }],
      [],
    );
    expect(assignments).toEqual([{ toolCallId: 'tc1', skillUsageId: null }]);
  });

  it('tool_call 在所有 skill_usage 之前时归 null', () => {
    const assignments = attachSkillUsageToToolCallsForOneInteraction(
      [{ id: 'tc1', sequence: 1 }],
      [{ id: 'u1', eventSequence: 100 }],
    );
    expect(assignments).toEqual([{ toolCallId: 'tc1', skillUsageId: null }]);
  });
});
