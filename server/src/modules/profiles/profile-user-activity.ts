import type { ProfileUserActivityCounts, ProfileUserActivityItem } from '@sdd-telemetry/api';

const COLLAPSED_DETAIL_LIMIT = 8;
const RAW_FETCH_MULTIPLIER = 10;
const RAW_FETCH_LIMIT = 1000;

const COUNT_LABELS: Array<{ kind: ProfileUserActivityItem['kind']; label: string }> = [
  { kind: 'capability', label: '能力' },
  { kind: 'knowledge', label: '知识' },
  { kind: 'code', label: '代码' },
  { kind: 'artifact_write', label: '写入' },
  { kind: 'artifact_discussion', label: '讨论' },
];

const KIND_PRIORITY: ProfileUserActivityItem['kind'][] = [
  'artifact_discussion',
  'code',
  'artifact_write',
  'knowledge',
  'capability',
];

export type ProfileUserActivityFactItem = ProfileUserActivityItem & {
  promptText?: string | null;
};

export function expandProfileUserActivityFetchLimit(limit: number): number {
  return Math.min(Math.max(limit * RAW_FETCH_MULTIPLIER, limit), RAW_FETCH_LIMIT);
}

export function collapseProfileUserActivityItems(
  items: ProfileUserActivityFactItem[],
  limit = items.length,
): ProfileUserActivityItem[] {
  const groups = new Map<string, ProfileUserActivityFactItem[]>();

  for (const item of items) {
    const key = item.interactionId ? `interaction:${item.interactionId}` : `item:${item.id}`;
    const group = groups.get(key);
    if (group) {
      group.push(item);
    } else {
      groups.set(key, [item]);
    }
  }

  return Array.from(groups.values())
    .map(collapseGroup)
    .sort(compareActivityDesc)
    .slice(0, limit);
}

function collapseGroup(group: ProfileUserActivityFactItem[]): ProfileUserActivityItem {
  const first = group[0];
  if (!first) {
    throw new Error('cannot collapse empty profile user activity group');
  }
  if (group.length === 1 && !normalizePrompt(first.promptText)) {
    return {
      ...toPublicItem(first),
      activityCounts: countByKind(group),
    };
  }

  const sorted = [...group].sort(compareActivityDesc);
  const primary = pickPrimary(sorted);
  const interactionId = primary.interactionId;
  const promptTitle = firstPromptTitle(sorted);

  return {
    ...toPublicItem(primary),
    id: interactionId ? `interaction-${interactionId}` : primary.id,
    kind: primary.kind,
    eventTime: firstValue(sorted.map((item) => item.eventTime)),
    interactionId,
    deliveryUnitId: firstValue(sorted.map((item) => item.deliveryUnitId)),
    artifactId: singleDistinct(sorted.map((item) => item.artifactId)),
    capabilityUsageId: singleDistinct(sorted.map((item) => item.capabilityUsageId)),
    capabilityCode: singleDistinct(sorted.map((item) => item.capabilityCode)),
    capabilityDisplayName: singleDistinct(sorted.map((item) => item.capabilityDisplayName)),
    rawCapabilityName: singleDistinct(sorted.map((item) => item.rawCapabilityName)),
    title: promptTitle ?? buildCollapsedTitle(sorted),
    detail: buildCollapsedDetail(sorted),
    locator: null,
    activityCounts: countByKind(sorted),
  };
}

function pickPrimary(items: ProfileUserActivityFactItem[]): ProfileUserActivityFactItem {
  const first = [...items].sort((a, b) => {
    const priority = KIND_PRIORITY.indexOf(a.kind) - KIND_PRIORITY.indexOf(b.kind);
    if (priority !== 0) return priority;
    return compareActivityDesc(a, b);
  })[0];
  if (!first) {
    throw new Error('cannot pick primary profile user activity from empty list');
  }
  return first;
}

function buildCollapsedTitle(items: ProfileUserActivityItem[]): string {
  const counts = countByKind(items);
  const parts = COUNT_LABELS
    .map(({ kind, label }) => {
      const count = counts[kindToCountKey(kind)];
      return count > 0 ? `${count} 次${label}` : null;
    })
    .filter((part): part is string => Boolean(part));

  return `一次互动 · ${parts.join(' · ')}`;
}

function buildCollapsedDetail(items: ProfileUserActivityItem[]): string | null {
  const counts = new Map<string, number>();

  for (const item of items) {
    const line = activityDetailLine(item);
    if (!line) continue;
    counts.set(line, (counts.get(line) ?? 0) + 1);
  }

  const lines = Array.from(counts.entries())
    .slice(0, COLLAPSED_DETAIL_LIMIT)
    .map(([line, count]) => (count > 1 ? `${line} x${count}` : line));

  const remaining = counts.size - lines.length;
  if (remaining > 0) lines.push(`还有 ${remaining} 类活动`);

  return lines.length > 0 ? lines.join('\n') : null;
}

function activityDetailLine(item: ProfileUserActivityItem): string | null {
  if (item.kind === 'capability') {
    return item.capabilityDisplayName ?? item.title;
  }
  if (item.kind === 'knowledge') {
    return `${item.title}: ${item.locator ?? item.detail ?? '未知知识'}`;
  }
  if (item.kind === 'code') {
    return `${item.title}: ${item.locator ?? item.detail ?? '未知代码'}`;
  }
  if (item.kind === 'artifact_write') {
    return `产物写入: ${item.locator ?? item.detail ?? item.title}`;
  }
  if (item.kind === 'artifact_discussion') {
    return item.capabilityDisplayName ? `产物讨论: ${item.capabilityDisplayName}` : '产物讨论';
  }
  return item.title;
}

function countByKind(items: ProfileUserActivityItem[]): ProfileUserActivityCounts {
  const counts: ProfileUserActivityCounts = {
    total: items.length,
    capability: 0,
    knowledge: 0,
    code: 0,
    artifactWrite: 0,
    artifactDiscussion: 0,
  };
  for (const item of items) {
    counts[kindToCountKey(item.kind)] += 1;
  }
  return counts;
}

function kindToCountKey(kind: ProfileUserActivityItem['kind']): keyof Omit<ProfileUserActivityCounts, 'total'> {
  if (kind === 'artifact_write') return 'artifactWrite';
  if (kind === 'artifact_discussion') return 'artifactDiscussion';
  return kind;
}

function compareActivityDesc(left: ProfileUserActivityItem, right: ProfileUserActivityItem): number {
  if (!left.eventTime && !right.eventTime) return right.id.localeCompare(left.id);
  if (!left.eventTime) return 1;
  if (!right.eventTime) return -1;
  const timeDiff = new Date(right.eventTime).getTime() - new Date(left.eventTime).getTime();
  return timeDiff === 0 ? right.id.localeCompare(left.id) : timeDiff;
}

function firstValue(values: Array<string | null>): string | null {
  return values.find((value): value is string => Boolean(value)) ?? null;
}

function singleDistinct(values: Array<string | null>): string | null {
  const distinct = new Set(values.filter((value): value is string => Boolean(value)));
  if (distinct.size !== 1) return null;
  return distinct.values().next().value ?? null;
}

function firstPromptTitle(items: ProfileUserActivityFactItem[]): string | null {
  for (const item of items) {
    const prompt = normalizePrompt(item.promptText);
    if (prompt) return truncateText(prompt, 260);
  }
  return null;
}

function normalizePrompt(value: string | null | undefined): string | null {
  const normalized = value?.replace(/\s+/g, ' ').trim();
  return normalized ? normalized : null;
}

function truncateText(value: string, maxLength: number): string {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, maxLength - 1)}…`;
}

function toPublicItem(item: ProfileUserActivityFactItem): ProfileUserActivityItem {
  const { promptText: _promptText, ...publicItem } = item;
  return publicItem;
}
