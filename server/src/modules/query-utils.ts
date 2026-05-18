export interface TimeRange {
  from?: string | undefined;
  to?: string | undefined;
}

export function toIsoDate(value: unknown): string | null {
  if (value === null || value === undefined) {
    return null;
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export function toNumber(value: unknown): number {
  if (value === null || value === undefined) {
    return 0;
  }

  return Number(value);
}

export function toStringId(value: unknown): string {
  return String(value);
}

export function truncateText(value: unknown, maxLength = 240): string | null {
  if (value === null || value === undefined) {
    return null;
  }

  const text = typeof value === 'object' ? JSON.stringify(value) : String(value);
  return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text;
}

export function addTimeRangeWhere(
  clauses: string[],
  params: unknown[],
  columnName: string,
  range: TimeRange,
): void {
  if (range.from) {
    clauses.push(`${columnName} >= ?`);
    params.push(range.from);
  }

  if (range.to) {
    clauses.push(`${columnName} <= ?`);
    params.push(range.to);
  }
}

export function whereSql(clauses: string[]): string {
  return clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';
}

export function parseJsonRecord(value: unknown): Record<string, unknown> {
  if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }

  if (typeof value === 'string') {
    try {
      const parsed: unknown = JSON.parse(value);
      if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      return {};
    }
  }

  return {};
}

export function readPath(value: unknown, path: string): unknown {
  const segments = path.split('.');
  let current: unknown = value;

  for (const segment of segments) {
    if (typeof current !== 'object' || current === null) {
      return undefined;
    }

    current = (current as Record<string, unknown>)[segment];
  }

  return current;
}

export function stringifyScalar(value: unknown): string | null {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value === 'string') {
    return value;
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }

  return JSON.stringify(value);
}
