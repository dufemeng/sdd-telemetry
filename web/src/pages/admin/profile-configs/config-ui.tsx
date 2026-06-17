import type { ReactNode } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';

export const INPUT_CLASS =
  'w-full min-h-8 px-[10px] rounded-[4px] text-[12px] text-[var(--color-text)] outline-none bg-[var(--color-base)] border border-[var(--color-border)] focus:border-[rgba(250,255,105,0.55)] transition-colors';
export const TEXTAREA_CLASS = `${INPUT_CLASS} min-h-[60px] py-2 resize-y leading-[1.6]`;
export const MONO_TEXTAREA_CLASS = `${TEXTAREA_CLASS} font-mono`;
export const BUTTON_CLASS =
  'inline-flex h-8 items-center gap-1.5 rounded-[4px] border border-[var(--color-border)] px-3 text-[12px] text-[var(--color-secondary)] hover:text-[var(--color-primary)] hover:border-[rgba(250,255,105,0.35)] transition-colors disabled:opacity-50';
export const PRIMARY_BUTTON_CLASS =
  'inline-flex h-8 items-center gap-1.5 rounded-[4px] border-0 bg-[var(--color-primary)] px-3 text-[12px] font-bold text-[var(--color-base)] disabled:opacity-60';

export function ConfigGroup({
  title,
  action,
  children,
  className = '',
  bodyClassName = 'mt-2',
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <section className={`border-t border-[var(--color-border)] pt-3 ${className}`}>
      <div className="flex min-h-8 items-center justify-between gap-3">
        <h2 className="text-[13px] font-semibold text-[#f5f5f5]">{title}</h2>
        {action}
      </div>
      <div className={bodyClassName}>{children}</div>
    </section>
  );
}

export function Section({
  title,
  hint,
  action,
  children,
  bodyClassName = 'p-3',
  className = '',
}: {
  title: string;
  hint?: string;
  action?: ReactNode;
  children: ReactNode;
  bodyClassName?: string;
  className?: string;
}) {
  return (
    <section className={`rounded-[6px] border border-[var(--color-border)] bg-[#0d0d0d] ${className}`}>
      <div className="flex min-h-11 items-center justify-between gap-3 border-b border-[var(--color-border)] px-3 py-2">
        <div className="min-w-0">
          <h2 className="text-[13px] font-semibold text-[#f5f5f5]">{title}</h2>
          {hint ? <p className="mt-0.5 text-[11px] text-[var(--color-muted)]">{hint}</p> : null}
        </div>
        {action}
      </div>
      <div className={bodyClassName}>{children}</div>
    </section>
  );
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="grid gap-1">
      <span className="text-[11px] text-[var(--color-muted)]">
        {label}
        {hint ? <span className="ml-1.5 text-[var(--color-muted)] opacity-70">· {hint}</span> : null}
      </span>
      {children}
    </label>
  );
}

export function Disclosure({
  open,
  onToggle,
  children,
}: {
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="flex w-full items-center gap-1.5 text-left text-[12px] text-[var(--color-secondary)] hover:text-[var(--color-primary)]"
    >
      {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
      {children}
    </button>
  );
}

export function Warn({ children }: { children: ReactNode }) {
  return (
    <p className="rounded-[4px] border border-[rgba(245,158,11,0.35)] bg-[var(--color-warn-bg)] px-2 py-1 text-[11px] text-[var(--color-warn-text)]">
      {children}
    </p>
  );
}

export function linesToArray(value: string): string[] {
  return value.split('\n').map((item) => item.trim()).filter(Boolean);
}

export function csvToArray(value: string): string[] {
  return value.split(',').map((item) => item.trim()).filter(Boolean);
}
