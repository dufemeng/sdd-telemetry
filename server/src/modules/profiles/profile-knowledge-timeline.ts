export type KnowledgeTimelineGranularity = 'day' | 'hour';

export interface KnowledgeTimelineFact {
  eventTime: Date | string | null;
  relativePath: string | null;
  locator: string | null;
}

export interface KnowledgeTimelineBucket {
  t: string;
  accessCount: number;
}

export interface KnowledgeTimelineDimensionPoint {
  t: string;
  accessCount: number;
}

export interface KnowledgeTimelineDimension {
  segment: string;
  accessCount: number;
  points: KnowledgeTimelineDimensionPoint[];
}

export interface KnowledgeTimeline {
  buckets: KnowledgeTimelineBucket[];
  dimensions: KnowledgeTimelineDimension[];
}

export interface KnowledgePathDimensionFact {
  sourceNamespace: string;
  relativePath: string;
  accessCount: number;
  userId: string | null;
  lastAccessAt: Date | string | null;
}

export interface KnowledgePathDimensionSummary {
  sourceNamespace: string;
  pathSegment: string;
  accessedDocs: number;
  accessCount: number;
  distinctUsers: number;
  lastAccessAt: Date | string | null;
}

export function buildPathSegmentKnowledgeTimeline(
  facts: KnowledgeTimelineFact[],
  granularity: KnowledgeTimelineGranularity,
  pathSegment?: string | null,
): KnowledgeTimeline {
  const normalizedSegment = pathSegment?.trim() || null;
  const bucketCounts = new Map<string, number>();
  const dimensionCounts = new Map<string, Map<string, number>>();

  for (const fact of facts) {
    const path = normalizePath(fact.relativePath ?? fact.locator);
    const segments = extractPathSegments(path);
    if (normalizedSegment && !segments.includes(normalizedSegment)) continue;

    const bucket = formatBucket(fact.eventTime, granularity);
    if (!bucket) continue;
    bucketCounts.set(bucket, (bucketCounts.get(bucket) ?? 0) + 1);

    if (segments.length === 0) {
      incrementDimension(dimensionCounts, '(未识别)', bucket);
      continue;
    }

    for (const segment of segments) {
      incrementDimension(dimensionCounts, segment, bucket);
    }
  }

  const buckets = [...bucketCounts.entries()]
    .map(([t, accessCount]) => ({ t, accessCount }))
    .sort((a, b) => a.t.localeCompare(b.t));
  const dimensions = [...dimensionCounts.entries()]
    .map(([segment, counts]) => ({
      segment,
      accessCount: [...counts.values()].reduce((total, count) => total + count, 0),
      points: [...counts.entries()]
        .map(([t, accessCount]) => ({ t, accessCount }))
        .sort((a, b) => a.t.localeCompare(b.t)),
    }))
    .sort((a, b) => b.accessCount - a.accessCount || a.segment.localeCompare(b.segment));

  return { buckets, dimensions };
}

export function buildPathDimensionSummaries(
  facts: KnowledgePathDimensionFact[],
): KnowledgePathDimensionSummary[] {
  const dimensions = new Map<
    string,
    {
      sourceNamespace: string;
      pathSegment: string;
      docs: Set<string>;
      accessCount: number;
      users: Set<string>;
      lastAccessAt: Date | string | null;
    }
  >();

  for (const fact of facts) {
    const segments = extractPathSegments(fact.relativePath);
    for (const pathSegment of segments) {
      const key = `${fact.sourceNamespace}\0${pathSegment}`;
      const current = dimensions.get(key) ?? {
        sourceNamespace: fact.sourceNamespace,
        pathSegment,
        docs: new Set<string>(),
        accessCount: 0,
        users: new Set<string>(),
        lastAccessAt: null,
      };
      current.docs.add(fact.relativePath);
      current.accessCount += fact.accessCount;
      if (fact.userId) current.users.add(fact.userId);
      current.lastAccessAt = latestDate(current.lastAccessAt, fact.lastAccessAt);
      dimensions.set(key, current);
    }
  }

  return [...dimensions.values()]
    .map((dimension) => ({
      sourceNamespace: dimension.sourceNamespace,
      pathSegment: dimension.pathSegment,
      accessedDocs: dimension.docs.size,
      accessCount: dimension.accessCount,
      distinctUsers: dimension.users.size,
      lastAccessAt: dimension.lastAccessAt,
    }))
    .sort(
      (a, b) =>
        b.accessCount - a.accessCount ||
        a.sourceNamespace.localeCompare(b.sourceNamespace) ||
        a.pathSegment.localeCompare(b.pathSegment),
    );
}

export function extractPathSegments(value: string | null | undefined): string[] {
  const normalized = normalizePath(value);
  if (!normalized) return [];
  const parts = normalized
    .split('/')
    .map((part) => part.trim())
    .filter(Boolean);

  if (parts.length === 0) return [];

  const last = parts[parts.length - 1];
  const directories = last?.includes('.') ? parts.slice(0, -1) : parts;
  return [...new Set(directories)];
}

function incrementDimension(
  dimensions: Map<string, Map<string, number>>,
  segment: string,
  bucket: string,
): void {
  const counts = dimensions.get(segment) ?? new Map<string, number>();
  counts.set(bucket, (counts.get(bucket) ?? 0) + 1);
  dimensions.set(segment, counts);
}

function normalizePath(value: string | null | undefined): string | null {
  if (!value) return null;
  const normalized = value.replace(/\\/g, '/').replace(/^\/+/, '').trim();
  return normalized || null;
}

function formatBucket(
  value: Date | string | null,
  granularity: KnowledgeTimelineGranularity,
): string | null {
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

function latestDate(left: Date | string | null, right: Date | string | null): Date | string | null {
  if (!left) return right;
  if (!right) return left;
  return new Date(left).getTime() >= new Date(right).getTime() ? left : right;
}
