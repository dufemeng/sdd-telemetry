import { formatInteger, formatPercent } from '@/lib/format';

interface CallQualityFunnelProps {
  triggeredCount: number;
  withPromptCount: number;
  withResponseCount: number;
  pairedCount: number;
}

export function CallQualityFunnel({
  triggeredCount,
  withPromptCount,
  withResponseCount,
  pairedCount,
}: CallQualityFunnelProps) {
  const rows = [
    ['总调用请求', triggeredCount],
    ['有提示词', withPromptCount],
    ['有回答', withResponseCount],
    ['提示回答完整', pairedCount],
  ] as const;
  const base = Math.max(triggeredCount, 1);

  return (
    <div className="grid gap-4">
      {rows.map(([label, value]) => {
        const ratio = value / base;
        return (
          <div key={label} className="grid gap-2">
            <div className="flex items-center justify-between gap-3">
              <span className="text-[12px] text-[var(--color-secondary)]">{label}</span>
              <span className="text-[12px] text-[#f5f5f5]" style={{ fontFamily: 'var(--font-mono)' }}>
                {formatInteger(value)} <em className="not-italic text-[var(--color-primary)]">{formatPercent(ratio)}</em>
              </span>
            </div>
            <div className="h-[7px] overflow-hidden rounded-[4px]" style={{ background: '#202016' }}>
              <div
                className="h-full rounded-[4px]"
                style={{
                  width: `${Math.max(ratio * 100, value > 0 ? 3 : 0)}%`,
                  background: label === '提示回答完整' ? 'var(--color-primary)' : '#3a3939',
                }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
