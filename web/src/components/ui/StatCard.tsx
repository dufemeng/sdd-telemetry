import React from 'react';

interface StatCardProps {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
  hint?: string;
  loading?: boolean;
}

export function StatCard({ icon, label, value, hint, loading }: StatCardProps) {
  return (
    <section
      className="flex gap-3 min-h-[98px] p-[14px] rounded-[6px]"
      style={{ border: '1px solid var(--color-border)', background: 'var(--color-surface)' }}
    >
      <div
        className="grid w-[34px] h-[34px] flex-none place-items-center rounded-[4px] text-[var(--color-primary)]"
        style={{ background: '#202016' }}
      >
        {icon}
      </div>
      <div>
        <span className="text-[12px] text-[var(--color-secondary)]">{label}</span>
        <strong
          className="block mt-2 text-[24px] font-semibold leading-7 text-[#f5f5f5]"
          style={{ fontFamily: 'var(--font-mono)' }}
        >
          {loading ? '—' : (value ?? '—') }
        </strong>
        {hint && (
          <em className="block mt-2 text-[11px] not-italic text-[var(--color-muted)]">{hint}</em>
        )}
      </div>
    </section>
  );
}
