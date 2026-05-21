import type { TimeRange } from '@/components/layout/TopBar';

export function timeRangeToHours(range: TimeRange): number {
  if (range.endsWith('d')) return Number(range.replace('d', '')) * 24;
  return Number(range.replace('h', ''));
}

export function timeRangeToFromIso(range: TimeRange): string {
  const hours = timeRangeToHours(range);
  return new Date(Date.now() - hours * 3_600_000).toISOString();
}
