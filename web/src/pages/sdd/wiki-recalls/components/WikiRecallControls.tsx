import type { CSSProperties, ReactNode } from 'react';
import type { WikiRecallRange } from '@sdd-telemetry/api';

export const RANGE_OPTIONS: Array<{ value: WikiRecallRange; label: string }> = [
  { value: '7d', label: '7 天' },
  { value: '30d', label: '30 天' },
  { value: '90d', label: '90 天' },
  { value: 'all', label: '全部' },
];

interface SegmentedOption<T extends string> {
  value: T;
  label: string;
}

interface SegmentedControlProps<T extends string> {
  label: string;
  value: T;
  options: Array<SegmentedOption<T>>;
  onChange: (value: T) => void;
}

export function SegmentedControl<T extends string>({
  label,
  value,
  options,
  onChange,
}: SegmentedControlProps<T>) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-[11px] text-[var(--color-muted)]">{label}</span>
      <div
        className="flex items-center gap-1 rounded-[6px] p-1"
        style={{ background: 'var(--color-base)', border: '1px solid var(--color-border)' }}
      >
        {options.map((option) => {
          const active = option.value === value;
          return (
            <button
              key={option.value}
              type="button"
              onClick={() => onChange(option.value)}
              className="h-[24px] rounded-[4px] px-2 text-[11px] font-medium transition-colors whitespace-nowrap"
              style={
                active
                  ? {
                      background: 'rgba(250,255,105,0.10)',
                      border: '1px solid rgba(250,255,105,0.22)',
                      color: 'var(--color-primary)',
                    }
                  : {
                      background: 'transparent',
                      border: '1px solid transparent',
                      color: 'var(--color-muted)',
                    }
              }
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function RangeControl({
  value,
  onChange,
}: {
  value: WikiRecallRange;
  onChange: (value: WikiRecallRange) => void;
}) {
  return (
    <SegmentedControl
      label="时间范围"
      value={value}
      options={RANGE_OPTIONS}
      onChange={onChange}
    />
  );
}

export function QueryNotice({
  loading,
  error,
  loadingText = '正在加载...',
}: {
  loading: boolean;
  error: unknown;
  loadingText?: string;
}) {
  if (loading) {
    return <div className="text-[12px] text-[var(--color-muted)]">{loadingText}</div>;
  }

  if (error) {
    return (
      <div className="text-[12px] text-[#f87171]">
        加载失败：{error instanceof Error ? error.message : String(error)}
      </div>
    );
  }

  return null;
}

export function SoftBadge({
  children,
  tone = 'neutral',
}: {
  children: ReactNode;
  tone?: 'good' | 'warn' | 'neutral';
}) {
  const styles = {
    good: {
      color: 'var(--color-good-text)',
      background: 'var(--color-good-bg)',
      border: '1px solid rgba(34,197,94,0.16)',
    },
    warn: {
      color: 'var(--color-warn-text)',
      background: 'var(--color-warn-bg)',
      border: '1px solid rgba(245,158,11,0.18)',
    },
    neutral: {
      color: 'var(--color-secondary)',
      background: 'rgba(255,255,255,0.05)',
      border: '1px solid var(--color-border)',
    },
  } satisfies Record<string, CSSProperties>;

  return (
    <span
      className="inline-flex h-[20px] items-center rounded-[4px] px-2 text-[11px] font-medium whitespace-nowrap"
      style={styles[tone]}
    >
      {children}
    </span>
  );
}
