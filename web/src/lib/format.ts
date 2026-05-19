const intlInt = new Intl.NumberFormat('zh-CN');
const intlPct = new Intl.NumberFormat('zh-CN', {
  style: 'percent',
  maximumFractionDigits: 1,
});
const intlUsd = new Intl.NumberFormat('zh-CN', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 4,
});
const intlTime = new Intl.DateTimeFormat('zh-CN', {
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
});
const intlDt = new Intl.DateTimeFormat('zh-CN', {
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
});

export function formatInteger(value: number | null | undefined): string {
  return intlInt.format(value ?? 0);
}

export function formatPercent(value: number | null | undefined): string {
  if (value == null) return 'unknown';
  return intlPct.format(value);
}

export function formatUsd(value: number | null | undefined): string {
  if (value == null) return '—';
  return intlUsd.format(value);
}

export function formatBytes(value: number | null | undefined): string {
  const n = value ?? 0;
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KiB`;
  return `${(n / 1024 / 1024).toFixed(2)} MiB`;
}

export function formatTime(value: string | null | undefined): string {
  if (!value) return 'unknown';
  return intlTime.format(new Date(value));
}

export function formatDateTime(value: string | null | undefined): string {
  if (!value) return 'unknown';
  return intlDt.format(new Date(value));
}

export function truncate(value: unknown, max = 120): string {
  if (value == null || value === '') return 'unknown';
  const s = typeof value === 'object' ? JSON.stringify(value) : String(value);
  return s.length > max ? `${s.slice(0, max)}...` : s;
}

const GOOD = new Set(['parsed', 'success', 'completed', 'ok']);
const BAD = /failed|error/;
const WARN = new Set(['processing', 'queued', 'received', 'pending']);

export type StatusVariant = 'good' | 'warn' | 'bad' | 'neutral';

export function statusVariant(status: string | null | undefined): StatusVariant {
  const s = status ?? 'unknown';
  if (GOOD.has(s)) return 'good';
  if (BAD.test(s)) return 'bad';
  if (WARN.has(s)) return 'warn';
  return 'neutral';
}
