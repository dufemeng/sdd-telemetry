export interface AttributionResult {
  deliveryUnitId: number | null;
  method: string | null;
  ambiguous: boolean;
}

export interface AttributionAnchor {
  sourceReferenceId: number;
  interactionId: number | null;
  userId: number | null;
  sessionId: string | null;
  eventTime: Date | null;
  deliveryUnitId: number;
  preferred: boolean;
}

export interface AttributionTarget {
  sourceReferenceId: number;
  interactionId: number | null;
  userId: number | null;
  sessionId: string | null;
  eventTime: Date | null;
}

/**
 * 通用上下文归因：
 * - 同 interaction 内优先选择 preferred anchor，同档取最近且不晚于目标。
 * - 同 session 窗口内也先选 preferred tier；同 tier 唯一 delivery unit 才归因，多 delivery unit 标 ambiguous。
 */
export function selectAttributionAnchor(
  anchors: AttributionAnchor[],
  target: AttributionTarget,
  sessionWindowMinutes: number,
  requireSameUser = true,
): AttributionResult {
  const sameInteraction = anchors.filter(
    (anchor) =>
      anchor.interactionId != null &&
      anchor.interactionId === target.interactionId &&
      anchor.sourceReferenceId <= target.sourceReferenceId,
  );
  const interactionPick = pickPreferredAnchor(sameInteraction);
  if (interactionPick) {
    return { deliveryUnitId: interactionPick.deliveryUnitId, method: 'same_interaction_anchor', ambiguous: false };
  }

  const sessionCandidates = anchors.filter((anchor) => {
    if (requireSameUser && (anchor.userId == null || target.userId == null || anchor.userId !== target.userId)) return false;
    if (!anchor.sessionId || !target.sessionId || anchor.sessionId !== target.sessionId) return false;
    if (anchor.sourceReferenceId > target.sourceReferenceId) return false;
    if (!anchor.eventTime || !target.eventTime) return false;
    const diffMs = target.eventTime.getTime() - anchor.eventTime.getTime();
    return diffMs >= 0 && diffMs <= sessionWindowMinutes * 60_000;
  });

  const sessionTier = preferMarked(sessionCandidates);
  const distinct = new Set(sessionTier.map((anchor) => anchor.deliveryUnitId));
  if (distinct.size === 1) {
    const pick = [...sessionTier].sort(compareAnchorDesc)[0]!;
    return { deliveryUnitId: pick.deliveryUnitId, method: 'same_session_unique_anchor', ambiguous: false };
  }
  if (distinct.size > 1) return { deliveryUnitId: null, method: 'ambiguous_session_anchor', ambiguous: true };
  return { deliveryUnitId: null, method: null, ambiguous: false };
}

function preferMarked(candidates: AttributionAnchor[]): AttributionAnchor[] {
  const preferred = candidates.filter((anchor) => anchor.preferred);
  return preferred.length > 0 ? preferred : candidates;
}

function pickPreferredAnchor(candidates: AttributionAnchor[]): AttributionAnchor | null {
  const tier = preferMarked(candidates);
  if (tier.length === 0) return null;
  return [...tier].sort(compareAnchorDesc)[0] ?? null;
}

function compareAnchorDesc(a: AttributionAnchor, b: AttributionAnchor): number {
  const at = a.eventTime?.getTime() ?? 0;
  const bt = b.eventTime?.getTime() ?? 0;
  if (bt !== at) return bt - at;
  return b.sourceReferenceId - a.sourceReferenceId;
}
