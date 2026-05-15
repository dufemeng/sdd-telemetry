import type { TimeRange } from '../components/layout/TopBar';

export function timeRangeToHours(range: TimeRange): number {
  return Number(range.replace('h', ''));
}

export function timeRangeToFromIso(range: TimeRange): string {
  const hours = timeRangeToHours(range);
  return new Date(Date.now() - hours * 3_600_000).toISOString();
}
