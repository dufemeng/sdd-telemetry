import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { buildArtifactTurnInputs } from '../src/jobs/cleaning-worker';

const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');

describe('buildArtifactTurnInputs', () => {
  it('每个 turn 生成幂等 turn_key 并带齐归因字段', () => {
    const anchor = new Date('2026-05-28T06:00:00.000Z');
    const write = new Date('2026-05-28T06:30:00.000Z');
    const out = buildArtifactTurnInputs({
      artifactId: '3',
      workItemId: '7',
      skillUsageId: '99',
      userId: '5',
      sessionId: 'sess-1',
      anchorEventTime: anchor,
      writeEventTime: write,
      turns: [
        { id: '4188', startedAt: new Date('2026-05-28T06:10:00.000Z') },
        { id: '4189', startedAt: new Date('2026-05-28T06:20:00.000Z') },
      ],
    });

    expect(out).toHaveLength(2);
    expect(out[0]).toEqual({
      turnKey: sha256('turn:3:4188'),
      artifactId: '3',
      workItemId: '7',
      interactionId: '4188',
      skillUsageId: '99',
      userId: '5',
      sessionId: 'sess-1',
      anchorEventTime: anchor,
      writeEventTime: write,
      eventTime: new Date('2026-05-28T06:10:00.000Z'),
      ruleVersion: 'doc-conversation-v1',
    });
    expect(out[1].turnKey).toBe(sha256('turn:3:4189'));
  });

  it('空 turns 返回空数组', () => {
    expect(
      buildArtifactTurnInputs({
        artifactId: '3',
        workItemId: '7',
        skillUsageId: null,
        userId: null,
        sessionId: null,
        anchorEventTime: null,
        writeEventTime: null,
        turns: [],
      }),
    ).toEqual([]);
  });
});
