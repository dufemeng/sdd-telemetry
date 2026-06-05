import { describe, expect, it } from 'vitest';
import {
  selectAttributionAnchor,
  type AttributionAnchor,
  type AttributionTarget,
} from '../src/jobs/profile-projection/boss-a-operators';

const baseAnchor = (over: Partial<AttributionAnchor>): AttributionAnchor => ({
  sourceReferenceId: 1,
  interactionId: 10,
  userId: 1,
  sessionId: 's1',
  eventTime: new Date('2026-01-01T00:00:00Z'),
  deliveryUnitId: 100,
  isWrite: false,
  ...over,
});

const target = (over: Partial<AttributionTarget>): AttributionTarget => ({
  sourceReferenceId: 99,
  interactionId: 10,
  userId: 1,
  sessionId: 's1',
  eventTime: new Date('2026-01-01T01:00:00Z'),
  ...over,
});

const WINDOW = 120;

describe('Boss A attribution anchor selection', () => {
  it('prefers a plan-doc write anchor over a more recent read anchor in the same interaction', () => {
    const anchors = [
      baseAnchor({ sourceReferenceId: 1, eventTime: new Date('2026-01-01T00:00:00Z'), deliveryUnitId: 100, isWrite: true }),
      baseAnchor({ sourceReferenceId: 2, eventTime: new Date('2026-01-01T00:30:00Z'), deliveryUnitId: 200, isWrite: false }),
    ];
    const result = selectAttributionAnchor(anchors, target({ sourceReferenceId: 3 }), WINDOW);
    expect(result.deliveryUnitId).toBe(100);
    expect(result.method).toBe('same_interaction_anchor');
    expect(result.ambiguous).toBe(false);
  });

  it('falls back to the most recent read anchor when no write anchor exists in the interaction', () => {
    const anchors = [
      baseAnchor({ sourceReferenceId: 1, eventTime: new Date('2026-01-01T00:00:00Z'), deliveryUnitId: 100, isWrite: false }),
      baseAnchor({ sourceReferenceId: 2, eventTime: new Date('2026-01-01T00:30:00Z'), deliveryUnitId: 200, isWrite: false }),
    ];
    const result = selectAttributionAnchor(anchors, target({ sourceReferenceId: 3 }), WINDOW);
    expect(result.deliveryUnitId).toBe(200);
    expect(result.method).toBe('same_interaction_anchor');
  });

  it('ignores anchors that occur after the target within the interaction', () => {
    const anchors = [
      baseAnchor({ sourceReferenceId: 5, deliveryUnitId: 100, isWrite: true }),
    ];
    const result = selectAttributionAnchor(anchors, target({ sourceReferenceId: 3 }), WINDOW);
    expect(result.deliveryUnitId).toBeNull();
  });

  it('uses the unique write anchor within the session window across interactions', () => {
    const anchors = [
      baseAnchor({ sourceReferenceId: 1, interactionId: 1, eventTime: new Date('2026-01-01T00:00:00Z'), deliveryUnitId: 100, isWrite: true }),
      baseAnchor({ sourceReferenceId: 2, interactionId: 2, eventTime: new Date('2026-01-01T00:30:00Z'), deliveryUnitId: 200, isWrite: false }),
    ];
    const result = selectAttributionAnchor(anchors, target({ sourceReferenceId: 3, interactionId: 3 }), WINDOW);
    expect(result.deliveryUnitId).toBe(100);
    expect(result.method).toBe('same_session_unique_anchor');
    expect(result.ambiguous).toBe(false);
  });

  it('returns ambiguous when multiple distinct write anchors exist in the session window', () => {
    const anchors = [
      baseAnchor({ sourceReferenceId: 1, interactionId: 1, eventTime: new Date('2026-01-01T00:00:00Z'), deliveryUnitId: 100, isWrite: true }),
      baseAnchor({ sourceReferenceId: 2, interactionId: 2, eventTime: new Date('2026-01-01T00:30:00Z'), deliveryUnitId: 300, isWrite: true }),
    ];
    const result = selectAttributionAnchor(anchors, target({ sourceReferenceId: 3, interactionId: 3 }), WINDOW);
    expect(result.deliveryUnitId).toBeNull();
    expect(result.ambiguous).toBe(true);
  });

  it('does not attribute across the session window boundary', () => {
    const anchors = [
      baseAnchor({ sourceReferenceId: 1, interactionId: 1, eventTime: new Date('2026-01-01T00:00:00Z'), deliveryUnitId: 100, isWrite: true }),
    ];
    // target 3 hours later, window is 120 min
    const result = selectAttributionAnchor(
      anchors,
      target({ sourceReferenceId: 3, interactionId: 3, eventTime: new Date('2026-01-01T03:00:00Z') }),
      WINDOW,
    );
    expect(result.deliveryUnitId).toBeNull();
    expect(result.ambiguous).toBe(false);
  });

  it('returns no attribution when there are no anchors', () => {
    const result = selectAttributionAnchor([], target({}), WINDOW);
    expect(result.deliveryUnitId).toBeNull();
    expect(result.method).toBeNull();
    expect(result.ambiguous).toBe(false);
  });
});
