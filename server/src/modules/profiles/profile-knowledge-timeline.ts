export type KnowledgeTimelineGranularity = 'day' | 'hour';

export interface KnowledgeTimelineFact {
  eventTime: Date | string | null;
  relativePath: string | null;
  locator: string | null;
}

export interface KnowledgeTimelinePoint {
  t: string;
  group: string | null;
  count: number;
}

export function buildPathSegmentKnowledgeTimeline(
  facts: KnowledgeTimelineFact[],
  granularity: KnowledgeTimelineGranularity,
): KnowledgeTimelinePoint[] {
  const buckets = new Map<string, Map<string, number>>();

  for (const fact of facts) {
    const bucket = formatBucket(fact.eventTime, granularity);
    if (!bucket) continue;

    const segments = extractPathSegments(fact.relativePath ?? fact.locator);
    if (segments.length === 0) {
      increment(buckets, bucket, '(未识别)');
      continue;
    }

    for (const segment of segments) {
      increment(buckets, bucket, segment);
    }
  }

  return [...buckets.entries()]
    .flatMap(([t, groups]) => (
      [...groups.entries()].map(([group, count]) => ({ t, group, count }))
    ))
    .sort((a, b) => a.t.localeCompare(b.t) || String(a.group ?? '').localeCompare(String(b.group ?? '')));
}

export function extractPathSegments(value: string | null | undefined): string[] {
  if (!value) return [];
  const parts = value
    .replace(/\\/g, '/')
    .split('/')
    .map((part) => part.trim())
    .filter(Boolean);

  if (parts.length === 0) return [];

  const last = parts[parts.length - 1];
  const directories = last?.includes('.') ? parts.slice(0, -1) : parts;
  return [...new Set(directories)];
}

function increment(buckets: Map<string, Map<string, number>>, bucket: string, group: string): void {
  const groups = buckets.get(bucket) ?? new Map<string, number>();
  groups.set(group, (groups.get(group) ?? 0) + 1);
  buckets.set(bucket, groups);
}

function formatBucket(value: Date | string | null, granularity: KnowledgeTimelineGranularity): string | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  if (granularity === 'hour') {
    const hour = String(date.getUTCHours()).padStart(2, '0');
    return `${year}-${month}-${day}T${hour}:00:00.000Z`;
  }
  return `${year}-${month}-${day}T00:00:00.000Z`;
}
