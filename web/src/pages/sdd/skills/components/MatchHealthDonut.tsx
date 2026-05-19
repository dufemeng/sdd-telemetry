import { formatInteger, formatPercent } from '@/lib/format';

interface MatchHealthDonutProps {
  matchedCount: number;
  unmatchedCount: number;
  matchRate: number | null;
}

export function MatchHealthDonut({ matchedCount, unmatchedCount, matchRate }: MatchHealthDonutProps) {
  const radius = 42;
  const circumference = 2 * Math.PI * radius;
  const ratio = matchRate ?? 0;
  const dash = circumference * ratio;

  return (
    <div className="grid grid-cols-[1fr_132px] items-center gap-4">
      <div
        className="min-h-[104px] p-3 rounded-[4px]"
        style={{ border: '1px solid var(--color-border)', background: '#0a0a0a' }}
      >
        <span className="block text-[12px] text-[var(--color-secondary)]">整体匹配率</span>
        <strong className="block mt-2 text-[34px] leading-10 text-[var(--color-primary)]" style={{ fontFamily: 'var(--font-mono)' }}>
          {formatPercent(matchRate)}
        </strong>
        <span className="mt-1 block text-[11px] text-[var(--color-muted)]">
          {formatInteger(matchedCount)} / {formatInteger(matchedCount + unmatchedCount)}
        </span>
      </div>
      <svg viewBox="0 0 112 112" className="h-[112px] w-[112px]" role="img" aria-label="语义匹配健康">
        <circle cx="56" cy="56" r={radius} fill="none" stroke="#202016" strokeWidth="12" />
        <circle
          cx="56"
          cy="56"
          r={radius}
          fill="none"
          stroke="var(--color-primary)"
          strokeWidth="12"
          strokeLinecap="round"
          strokeDasharray={`${dash} ${circumference - dash}`}
          transform="rotate(-90 56 56)"
        />
      </svg>
    </div>
  );
}
