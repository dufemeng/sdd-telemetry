import { describe, expect, it } from 'vitest';
import { findParentSkillUsageForSubagent } from '../src/jobs/cleaning-worker';

describe('findParentSkillUsageForSubagent', () => {
  it('subagent 在父 turn skill_activated 之后，归属到该 skill_usage', () => {
    const parentUsages = [
      { id: 'u1', eventTime: new Date('2026-05-28T10:00:00Z') },
      { id: 'u2', eventTime: new Date('2026-05-28T10:05:00Z') },
    ];
    const subagentStartedAt = new Date('2026-05-28T10:07:00Z');
    expect(findParentSkillUsageForSubagent(parentUsages, subagentStartedAt)).toBe('u2');
  });

  it('subagent 在所有父 skill_activated 之前，返回 null', () => {
    const parentUsages = [
      { id: 'u1', eventTime: new Date('2026-05-28T10:10:00Z') },
    ];
    expect(findParentSkillUsageForSubagent(parentUsages, new Date('2026-05-28T10:00:00Z'))).toBeNull();
  });

  it('父 turn 无 skill_usage，返回 null', () => {
    expect(findParentSkillUsageForSubagent([], new Date())).toBeNull();
  });

  it('父 turn skill_usage 没有 event_time 字段时忽略', () => {
    const parentUsages = [
      { id: 'u1', eventTime: null },
      { id: 'u2', eventTime: new Date('2026-05-28T10:05:00Z') },
    ];
    expect(findParentSkillUsageForSubagent(parentUsages, new Date('2026-05-28T10:07:00Z'))).toBe('u2');
  });
});
