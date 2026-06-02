import type { WikiDomainDoc } from '@sdd-telemetry/api';
import { SoftBadge } from './WikiRecallControls';
import { formatInteger } from '@/lib/format';

const STATUS_BADGE: Record<string, { label: string; tone: 'good' | 'neutral' | 'bad' | 'info' }> = {
  hot: { label: '热', tone: 'good' },
  cold: { label: '冷', tone: 'neutral' },
  dead: { label: '沉睡', tone: 'bad' },
  new: { label: '新增未读', tone: 'info' },
};

export function DomainDocList({
  docs,
  selectedPath,
  onSelect,
}: {
  docs: WikiDomainDoc[];
  selectedPath: string | null;
  onSelect: (relativePath: string) => void;
}) {
  return (
    <div className="grid gap-[2px]">
      {docs.map((doc) => {
        const badge = STATUS_BADGE[doc.status]!;
        const active = doc.relativePath === selectedPath;
        return (
          <button
            key={doc.relativePath}
            className="grid items-center gap-2 rounded-[4px] px-2 py-[6px] text-left transition-colors"
            style={{
              gridTemplateColumns: '1fr auto auto',
              background: active ? 'rgba(250,255,105,0.08)' : 'transparent',
              border: active ? '1px solid rgba(250,255,105,0.18)' : '1px solid transparent',
            }}
            onClick={() => onSelect(doc.relativePath)}
          >
            <span
              className="truncate text-[12px]"
              style={{
                fontFamily: 'var(--font-mono)',
                color: active ? 'var(--color-primary)' : 'var(--color-secondary)',
              }}
              title={doc.relativePath}
            >
              {doc.relativePath}
            </span>
            <SoftBadge tone={badge.tone}>{badge.label}</SoftBadge>
            <span className="text-right text-[11px] text-[var(--color-muted)]" style={{ fontFamily: 'var(--font-mono)' }}>
              {formatInteger(doc.recallCount)} 次
            </span>
          </button>
        );
      })}
    </div>
  );
}
