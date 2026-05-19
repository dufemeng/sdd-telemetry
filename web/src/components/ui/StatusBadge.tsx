import { statusVariant, type StatusVariant } from '@/lib/format';

const VARIANT_STYLES: Record<StatusVariant, string> = {
  good:    'text-[var(--color-good-text)] bg-[var(--color-good-bg)]',
  warn:    'text-[var(--color-warn-text)] bg-[var(--color-warn-bg)]',
  bad:     'text-[var(--color-bad-text)]  bg-[var(--color-bad-bg)]',
  neutral: 'text-[var(--color-secondary)] bg-[rgba(255,255,255,0.08)]',
};

interface StatusBadgeProps {
  status: string | null | undefined;
  variant?: StatusVariant;
}

export function StatusBadge({ status, variant }: StatusBadgeProps) {
  const v: StatusVariant = variant ?? statusVariant(status);
  return (
    <span
      className={[
        'inline-flex items-center min-h-5 px-2 rounded-full',
        'text-[11px] leading-[14px] font-medium whitespace-nowrap',
        VARIANT_STYLES[v],
      ].join(' ')}
    >
      {status ?? 'unknown'}
    </span>
  );
}
