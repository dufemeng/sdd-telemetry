import React from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, Clipboard, Copy, X } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';

export type RowInspectorSize = 'md' | 'lg' | 'xl';

export interface RowInspectorAction {
  label: string;
  icon?: React.ReactNode;
  onClick: () => void;
  variant?: 'ghost' | 'secondary' | 'primary';
}

export interface RowInspectorField {
  label: string;
  value: React.ReactNode;
  copyValue?: string | null;
  mono?: boolean;
  muted?: boolean;
}

export interface RowInspectorTextBlock {
  title: string;
  content: string | null | undefined;
  copyValue?: string | null;
  icon?: React.ReactNode;
  emptyText?: string;
}

interface RowInspectorDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  icon?: React.ReactNode;
  badge?: React.ReactNode;
  row: unknown;
  overview?: readonly RowInspectorField[];
  fields?: readonly RowInspectorField[];
  textBlocks?: readonly RowInspectorTextBlock[];
  rawData?: unknown;
  actions?: readonly RowInspectorAction[];
  footerActions?: readonly RowInspectorAction[];
  loading?: boolean;
  error?: React.ReactNode;
  size?: RowInspectorSize;
}

const DRAWER_WIDTH: Record<RowInspectorSize, string> = {
  md: 'min(560px, calc(100vw - 240px))',
  lg: 'min(720px, calc(100vw - 240px))',
  xl: 'min(880px, calc(100vw - 240px))',
};
const SHELL_SIDEBAR_WIDTH = 240;
const SHELL_TOPBAR_HEIGHT = 48;

export function RowInspectorDrawer({
  open,
  onOpenChange,
  title,
  subtitle,
  icon,
  badge,
  row,
  overview = [],
  fields = [],
  textBlocks = [],
  rawData,
  actions = [],
  footerActions = [],
  loading = false,
  error,
  size = 'lg',
}: RowInspectorDrawerProps) {
  const rawText = formatRawData(rawData ?? row);

  if (typeof document === 'undefined') {
    return null;
  }

  return createPortal(
    <AnimatePresence>
      {open ? (
        <>
          <motion.div
            key="row-inspector-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            onClick={() => onOpenChange(false)}
            className="z-40 backdrop-blur-sm"
            style={{
              position: 'fixed',
              top: SHELL_TOPBAR_HEIGHT,
              right: 0,
              bottom: 0,
              left: SHELL_SIDEBAR_WIDTH,
              background: 'rgba(0 0 0 / 0.58)',
            }}
          />

          <motion.aside
            key="row-inspector-drawer"
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', stiffness: 220, damping: 28 }}
            className="z-50 flex flex-col shadow-2xl"
            style={{
              position: 'fixed',
              top: SHELL_TOPBAR_HEIGHT,
              right: 0,
              bottom: 0,
              width: DRAWER_WIDTH[size],
              background: 'var(--color-panel)',
              borderLeft: '1px solid var(--color-border)',
            }}
            aria-modal="true"
            role="dialog"
          >
            <DrawerHeader
              title={title}
              subtitle={subtitle}
              icon={icon}
              badge={badge}
              actions={actions}
              rawText={rawText}
              onClose={() => onOpenChange(false)}
            />

            <div
              className="flex-1 overflow-y-auto p-4 space-y-5"
              style={{ background: 'var(--color-surface)' }}
            >
              {loading ? <DrawerMessage text="正在加载行详情..." /> : null}
              {error ? <DrawerMessage text={error} tone="bad" /> : null}
              {!error ? (
                <>
                  {overview.length > 0 ? <FieldGrid fields={overview} variant="overview" /> : null}
                  {fields.length > 0 ? (
                    <InspectorSection title="Fields">
                      <FieldGrid fields={fields} variant="list" />
                    </InspectorSection>
                  ) : null}
                  {textBlocks.map((block) => (
                    <TextBlock key={block.title} block={block} />
                  ))}
                  {rawText ? <RawDataBlock rawText={rawText} /> : null}
                </>
              ) : null}
            </div>

            {footerActions.length > 0 ? <DrawerFooter actions={footerActions} /> : null}
          </motion.aside>
        </>
      ) : null}
    </AnimatePresence>,
    document.body,
  );
}

function DrawerHeader({
  title,
  subtitle,
  icon,
  badge,
  actions,
  rawText,
  onClose,
}: {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  icon?: React.ReactNode;
  badge?: React.ReactNode;
  actions: readonly RowInspectorAction[];
  rawText: string;
  onClose: () => void;
}) {
  return (
    <div
      className="flex items-center justify-between gap-3 p-4 shrink-0"
      style={{ background: 'var(--color-panel)', borderBottom: '1px solid var(--color-border)' }}
    >
      <div className="flex min-w-0 items-center gap-3">
        {icon ? <div className="text-[var(--color-primary)]">{icon}</div> : null}
        <div className="min-w-0">
          <div className="flex min-w-0 items-center gap-2">
            <h3 className="truncate text-[14px] font-semibold text-[#f5f5f5]">{title}</h3>
            {badge}
          </div>
          {subtitle ? (
            <div className="mt-1 truncate text-[11px] text-[var(--color-muted)]" style={{ fontFamily: 'var(--font-mono)' }}>
              {subtitle}
            </div>
          ) : null}
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-1.5">
        {actions.map((action) => (
          <ActionButton key={action.label} action={action} />
        ))}
        {rawText ? (
          <IconButton title="复制整行 JSON" onClick={() => void copyText(rawText)}>
            <Copy size={16} />
          </IconButton>
        ) : null}
        <IconButton title="关闭" onClick={onClose}>
          <X size={18} />
        </IconButton>
      </div>
    </div>
  );
}

function DrawerFooter({ actions }: { actions: readonly RowInspectorAction[] }) {
  return (
    <div
      className="flex justify-end gap-2 p-4 shrink-0"
      style={{ background: 'var(--color-panel)', borderTop: '1px solid var(--color-border)' }}
    >
      {actions.map((action) => (
        <ActionButton key={action.label} action={action} showLabel />
      ))}
    </div>
  );
}

function InspectorSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h4 className="text-[11px] font-bold uppercase tracking-[0.05em] text-[var(--color-muted)]">{title}</h4>
      {children}
    </section>
  );
}

function FieldGrid({ fields, variant }: { fields: readonly RowInspectorField[]; variant: 'overview' | 'list' }) {
  return (
    <div
      className={variant === 'overview' ? 'grid grid-cols-4 gap-2 rounded-[4px] p-3' : 'grid grid-cols-2 gap-x-4 gap-y-3'}
      style={variant === 'overview' ? { background: 'var(--color-base)', border: '1px solid var(--color-border)' } : undefined}
    >
      {fields.map((field) => (
        <FieldItem key={field.label} field={field} compact={variant === 'overview'} />
      ))}
    </div>
  );
}

function FieldItem({ field, compact }: { field: RowInspectorField; compact: boolean }) {
  return (
    <div className="min-w-0">
      <div className="mb-1 flex items-center gap-1.5">
        <span className="truncate text-[10px] font-bold uppercase tracking-[0.04em] text-[var(--color-muted)]">
          {field.label}
        </span>
        {field.copyValue ? (
          <button
            type="button"
            className="grid h-5 w-5 place-items-center rounded-[3px] text-[var(--color-muted)] hover:bg-[#222] hover:text-[var(--color-primary)]"
            onClick={() => void copyText(field.copyValue ?? '')}
            title={`复制 ${field.label}`}
          >
            <Clipboard size={12} />
          </button>
        ) : null}
      </div>
      <div
        className={[
          compact ? 'text-[12px]' : 'text-[12px] leading-5',
          field.muted ? 'text-[var(--color-muted)]' : 'text-[var(--color-secondary)]',
          field.mono ? 'break-all' : 'break-words',
        ].join(' ')}
        style={field.mono ? { fontFamily: 'var(--font-mono)' } : undefined}
      >
        {field.value ?? '—'}
      </div>
    </div>
  );
}

function TextBlock({ block }: { block: RowInspectorTextBlock }) {
  const content = block.content || block.emptyText || '—';

  return (
    <section className="space-y-2" style={{ contentVisibility: 'auto', containIntrinsicSize: '0 240px' }}>
      <div className="flex items-center justify-between gap-3">
        <h4 className="flex min-w-0 items-center gap-2 text-[13px] font-semibold text-[#f5f5f5]">
          {block.icon ? <span className="text-[var(--color-muted)]">{block.icon}</span> : null}
          <span className="truncate">{block.title}</span>
        </h4>
        {(block.copyValue ?? block.content) ? (
          <button
            type="button"
            className="flex items-center gap-1 rounded-[3px] px-1.5 py-1 text-[10px] font-bold uppercase text-[var(--color-muted)] hover:text-[var(--color-primary)]"
            onClick={() => void copyText(block.copyValue ?? block.content ?? '')}
          >
            <Copy size={12} />
            Copy
          </button>
        ) : null}
      </div>
      <pre
        className="max-h-[420px] overflow-auto whitespace-pre-wrap break-words rounded-[4px] p-3 text-[12px] leading-5 text-[var(--color-secondary)]"
        style={{ background: 'var(--color-base)', border: '1px solid var(--color-border)', fontFamily: 'var(--font-mono)' }}
      >
        {content}
      </pre>
    </section>
  );
}

function RawDataBlock({ rawText }: { rawText: string }) {
  return (
    <details
      className="group rounded-[4px]"
      style={{ background: 'var(--color-base)', border: '1px solid var(--color-border)' }}
    >
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-3 py-2 text-[11px] font-bold uppercase text-[var(--color-muted)]">
        Raw Data
        <ChevronDown size={14} className="transition-transform group-open:rotate-180" />
      </summary>
      <pre
        className="max-h-[360px] overflow-auto whitespace-pre-wrap break-words border-t border-[var(--color-border)] p-3 text-[11px] leading-5 text-[var(--color-secondary)]"
        style={{ fontFamily: 'var(--font-mono)' }}
      >
        {rawText}
      </pre>
    </details>
  );
}

function DrawerMessage({ text, tone = 'neutral' }: { text: React.ReactNode; tone?: 'neutral' | 'bad' }) {
  return (
    <div
      className={['rounded-[4px] p-3 text-[12px]', tone === 'bad' ? 'text-[var(--color-bad-text)]' : 'text-[var(--color-muted)]'].join(' ')}
      style={{ background: 'var(--color-base)', border: '1px solid var(--color-border)' }}
    >
      {text}
    </div>
  );
}

function IconButton({ title, onClick, children }: { title: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className="grid h-8 w-8 place-items-center rounded-[4px] text-[var(--color-muted)] transition-colors hover:bg-[#222] hover:text-[#f5f5f5]"
    >
      {children}
    </button>
  );
}

function ActionButton({ action, showLabel = false }: { action: RowInspectorAction; showLabel?: boolean }) {
  const variant = action.variant ?? 'ghost';
  const className = [
    'inline-flex h-8 items-center gap-2 rounded-[4px] px-2.5 text-[12px] font-medium transition-colors',
    variant === 'primary'
      ? 'bg-[var(--color-primary)] text-[var(--color-base)] hover:opacity-90'
      : variant === 'secondary'
        ? 'border border-[var(--color-border)] text-[var(--color-secondary)] hover:bg-[#222] hover:text-[#f5f5f5]'
        : 'text-[var(--color-muted)] hover:bg-[#222] hover:text-[#f5f5f5]',
  ].join(' ');

  return (
    <button type="button" title={action.label} onClick={action.onClick} className={className}>
      {action.icon}
      {showLabel ? action.label : <span className="sr-only">{action.label}</span>}
    </button>
  );
}

function formatRawData(value: unknown): string {
  if (value == null) {
    return '';
  }

  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

async function copyText(value: string): Promise<void> {
  if (!value) {
    return;
  }

  try {
    await navigator.clipboard?.writeText(value);
  } catch {
    // Clipboard permission failures should not interrupt row inspection.
  }
}
