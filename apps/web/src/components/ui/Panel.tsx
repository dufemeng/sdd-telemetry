import React from 'react';

interface PanelProps {
  title: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}

export function Panel({ title, icon, children, className = '' }: PanelProps) {
  return (
    <section
      className={`p-[14px] rounded-[6px] min-w-0 ${className}`}
      style={{ border: '1px solid var(--color-border)', background: 'var(--color-surface)' }}
    >
      <div className="flex items-center gap-2 mb-3 text-[var(--color-primary)]">
        {icon}
        <h3 className="text-[14px] font-semibold leading-5 text-[#f5f5f5]">{title}</h3>
      </div>
      {children}
    </section>
  );
}
