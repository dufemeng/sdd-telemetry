import { describe, expect, it } from 'vitest';
import { computeInteractionAssignments } from '../src/jobs/cleaning-worker';
import type { EventRow } from '../src/jobs/cleaning.repository';

/**
 * 单元测试：验证 B1 修复的核心分桶逻辑
 * 参考 docs/design-fix-interaction-fallback-bucket.md §6.1
 */

function row(overrides: Partial<EventRow>): EventRow {
  return {
    id: '1',
    event_id: 'evt-default',
    batch_id: '100',
    user_id: '1',
    session_id: 'session-A',
    prompt_id: null,
    trace_id: null,
    span_id: null,
    event_name: 'claude_code.api_request',
    service_version: null,
    severity_text: null,
    severity_number: null,
    event_time: new Date('2026-05-21T00:00:00.000Z'),
    event_sequence: 1,
    attributes_json: null,
    body_json: null,
    body_text: null,
    ...overrides,
  } as EventRow;
}

describe('computeInteractionAssignments', () => {
  it('event 有 prompt_id 时用 prompt_id 分桶，pairingMethod = prompt_id', () => {
    const events: EventRow[] = [
      row({ event_id: 'a', prompt_id: 'p1', event_sequence: 1 }),
      row({ event_id: 'b', prompt_id: 'p1', event_sequence: 2 }),
    ];

    const { groupsByKey, eventToKey } = computeInteractionAssignments(events);

    expect(groupsByKey.size).toBe(1);
    const onlyGroup = [...groupsByKey.values()][0];
    expect(onlyGroup!.pairingMethod).toBe('prompt_id');
    expect(onlyGroup!.events).toHaveLength(2);
    expect(eventToKey.size).toBe(2);
  });

  it('event 无 prompt_id 但同 session 有更早的 user_prompt 锚点时，回填到 anchor 的 prompt_id', () => {
    const events: EventRow[] = [
      row({
        event_id: 'u1',
        event_name: 'claude_code.user_prompt',
        prompt_id: 'p1',
        event_sequence: 1,
      }),
      row({
        event_id: 'tr1',
        event_name: 'claude_code.tool_result',
        prompt_id: null,
        event_sequence: 5,
      }),
    ];

    const { groupsByKey, eventToKey } = computeInteractionAssignments(events);

    expect(groupsByKey.size).toBe(1);
    const onlyGroup = [...groupsByKey.values()][0];
    expect(onlyGroup!.events).toHaveLength(2);
    expect(onlyGroup!.pairingMethod).toBe('anchored_by_user_prompt');
    expect(eventToKey.has('u1')).toBe(true);
    expect(eventToKey.has('tr1')).toBe(true);
  });

  it('event 无 prompt_id 但 trace_id 能唯一指向 prompt 时，优先按 trace 回填', () => {
    const events: EventRow[] = [
      row({
        event_id: 'api1',
        prompt_id: 'p1',
        trace_id: 'trace-1',
        event_sequence: 1,
      }),
      row({
        event_id: 'body1',
        prompt_id: null,
        trace_id: 'trace-1',
        event_sequence: 2,
      }),
    ];

    const { groupsByKey, eventToKey } = computeInteractionAssignments(events);

    expect(groupsByKey.size).toBe(1);
    expect(eventToKey.get('api1')).toBe(eventToKey.get('body1'));
    const onlyGroup = [...groupsByKey.values()][0];
    expect(onlyGroup!.pairingMethod).toBe('anchored_by_user_prompt');
  });

  it('一个 session 内多个 user_prompt 时锚点回填取最近的、不会跨 prompt 串桶', () => {
    const events: EventRow[] = [
      row({
        event_id: 'u1',
        event_name: 'claude_code.user_prompt',
        prompt_id: 'p1',
        event_sequence: 1,
      }),
      row({
        event_id: 'orphan-1',
        event_name: 'claude_code.tool_result',
        prompt_id: null,
        event_sequence: 3,
      }),
      row({
        event_id: 'u2',
        event_name: 'claude_code.user_prompt',
        prompt_id: 'p2',
        event_sequence: 10,
      }),
      row({
        event_id: 'orphan-2',
        event_name: 'claude_code.tool_result',
        prompt_id: null,
        event_sequence: 15,
      }),
    ];

    const { groupsByKey, eventToKey } = computeInteractionAssignments(events);

    expect(groupsByKey.size).toBe(2);
    // orphan-1 应该挂在 p1 下，orphan-2 应该挂在 p2 下
    const orphan1Key = eventToKey.get('orphan-1');
    const u1Key = eventToKey.get('u1');
    expect(orphan1Key).toBe(u1Key);

    const orphan2Key = eventToKey.get('orphan-2');
    const u2Key = eventToKey.get('u2');
    expect(orphan2Key).toBe(u2Key);

    expect(orphan1Key).not.toBe(orphan2Key);
  });

  it('event 无 prompt_id 且无 user_prompt 锚点时，被识别为孤儿、不写入 eventToKey', () => {
    const events: EventRow[] = [
      row({
        event_id: 'orphan-hook',
        event_name: 'claude_code.hook_fired',
        prompt_id: null,
        event_sequence: 1,
      }),
    ];

    const { groupsByKey, eventToKey } = computeInteractionAssignments(events);

    expect(groupsByKey.size).toBe(0);
    expect(eventToKey.has('orphan-hook')).toBe(false);
  });

  it('不会因为 prompt_id 缺失而把整个 session 折成一行（B1 回归保障）', () => {
    // 模拟旧 bug 场景：同 session 多个 prompt，部分事件 prompt_id 缺失
    const events: EventRow[] = [
      row({
        event_id: 'u1',
        event_name: 'claude_code.user_prompt',
        prompt_id: 'p1',
        event_sequence: 1,
      }),
      row({
        event_id: 'api1',
        event_name: 'claude_code.api_request',
        prompt_id: 'p1',
        event_sequence: 2,
      }),
      row({
        event_id: 'u2',
        event_name: 'claude_code.user_prompt',
        prompt_id: 'p2',
        event_sequence: 5,
      }),
      row({
        event_id: 'api2',
        event_name: 'claude_code.api_request',
        prompt_id: 'p2',
        event_sequence: 6,
      }),
      // 跨 batch 到达的孤儿 tool_result，没有 prompt_id（旧 bug 会把它砸进 session 桶）
      row({
        event_id: 'late-tr',
        event_name: 'claude_code.tool_result',
        prompt_id: null,
        event_sequence: 7,
      }),
    ];

    const { groupsByKey } = computeInteractionAssignments(events);

    // 必须是 2 行 interaction，不是 1 行
    expect(groupsByKey.size).toBe(2);

    // late-tr 应该被锚点回填到 p2（最近的 user_prompt），不是污染整个 session
    const p1Events = [...groupsByKey.values()].find((g) =>
      g.events.some((e) => e.event_id === 'u1'),
    );
    const p2Events = [...groupsByKey.values()].find((g) =>
      g.events.some((e) => e.event_id === 'u2'),
    );
    expect(p1Events!.events.map((e) => e.event_id).sort()).toEqual(['api1', 'u1']);
    expect(p2Events!.events.map((e) => e.event_id).sort()).toEqual(['api2', 'late-tr', 'u2']);
  });

  it('跨 session 的孤儿事件不会借用其他 session 的锚点', () => {
    const events: EventRow[] = [
      row({
        event_id: 'u1',
        session_id: 'session-A',
        event_name: 'claude_code.user_prompt',
        prompt_id: 'pA',
        event_sequence: 1,
      }),
      row({
        event_id: 'orphan-B',
        session_id: 'session-B',
        event_name: 'claude_code.tool_result',
        prompt_id: null,
        event_sequence: 1,
      }),
    ];

    const { groupsByKey, eventToKey } = computeInteractionAssignments(events);

    expect(groupsByKey.size).toBe(1);
    expect(eventToKey.has('u1')).toBe(true);
    expect(eventToKey.has('orphan-B')).toBe(false);
  });

  it('可以用额外 anchor events 回填当前 batch 的缺 prompt_id 事件，但不会把整段 session 拉进 group', () => {
    const currentBatchEvents: EventRow[] = [
      row({
        event_id: 'late-tool-result',
        event_name: 'claude_code.tool_result',
        prompt_id: null,
        event_sequence: 20,
      }),
    ];
    const anchorEvents: EventRow[] = [
      row({
        event_id: 'u1',
        event_name: 'claude_code.user_prompt',
        prompt_id: 'p1',
        event_sequence: 1,
      }),
      row({
        event_id: 'u2',
        event_name: 'claude_code.user_prompt',
        prompt_id: 'p2',
        event_sequence: 10,
      }),
    ];

    const { groupsByKey, eventToKey } = computeInteractionAssignments(
      currentBatchEvents,
      anchorEvents,
    );

    expect(groupsByKey.size).toBe(1);
    expect(eventToKey.has('late-tool-result')).toBe(true);
    const onlyGroup = [...groupsByKey.values()][0];
    expect(onlyGroup!.pairingMethod).toBe('anchored_by_user_prompt');
    expect(onlyGroup!.events.map((event) => event.event_id)).toEqual(['late-tool-result']);
  });

  it('可以用额外 trace anchor events 跨 batch 回填缺 prompt_id 事件', () => {
    const currentBatchEvents: EventRow[] = [
      row({
        event_id: 'response-body',
        session_id: null,
        event_name: 'claude_code.api_response_body',
        prompt_id: null,
        trace_id: 'trace-cross-batch',
        event_sequence: 20,
      }),
    ];
    const anchorEvents: EventRow[] = [
      row({
        event_id: 'api-request',
        session_id: 'session-A',
        event_name: 'claude_code.api_request',
        prompt_id: 'p1',
        trace_id: 'trace-cross-batch',
        event_sequence: 10,
      }),
    ];

    const { groupsByKey, eventToKey } = computeInteractionAssignments(
      currentBatchEvents,
      anchorEvents,
    );

    expect(groupsByKey.size).toBe(1);
    expect(eventToKey.has('response-body')).toBe(true);
    const onlyGroup = [...groupsByKey.values()][0];
    expect(onlyGroup!.pairingMethod).toBe('anchored_by_user_prompt');
    expect(onlyGroup!.events.map((event) => event.event_id)).toEqual(['response-body']);
  });

  it('同 trace_id 关联多个 prompt_id 时跳过 trace 锚并把 traceId 报告给 caller（§11.2 silent fallback 可观测）', () => {
    // 构造：trace-multi 下既有 p1 又有 p2 的 user_prompt，
    // 这时无法用 trace 锚点（不知挑哪个 prompt），应被记录到 skippedMultiPromptTraceIds
    const events: EventRow[] = [
      row({
        event_id: 'u1',
        session_id: 'session-A',
        event_name: 'claude_code.user_prompt',
        prompt_id: 'p1',
        trace_id: 'trace-multi',
        event_sequence: 1,
      }),
      row({
        event_id: 'u2',
        session_id: 'session-A',
        event_name: 'claude_code.user_prompt',
        prompt_id: 'p2',
        trace_id: 'trace-multi',
        event_sequence: 5,
      }),
      // 另一个正常 trace 应该照常进入 index、不出现在 skipped 列表里
      row({
        event_id: 'u3',
        session_id: 'session-B',
        event_name: 'claude_code.user_prompt',
        prompt_id: 'p3',
        trace_id: 'trace-single',
        event_sequence: 1,
      }),
    ];

    const { skippedMultiPromptTraceIds } = computeInteractionAssignments(events);

    expect(skippedMultiPromptTraceIds).toEqual(['trace-multi']);
  });

  it('没有 trace 冲突时 skippedMultiPromptTraceIds 应该为空', () => {
    const events: EventRow[] = [
      row({
        event_id: 'a',
        prompt_id: 'p1',
        trace_id: 'trace-1',
        event_sequence: 1,
      }),
      row({
        event_id: 'b',
        prompt_id: 'p2',
        trace_id: 'trace-2',
        event_sequence: 2,
      }),
    ];

    const { skippedMultiPromptTraceIds } = computeInteractionAssignments(events);

    expect(skippedMultiPromptTraceIds).toEqual([]);
  });
});
