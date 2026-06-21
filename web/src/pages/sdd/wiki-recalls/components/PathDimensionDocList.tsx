import type { ProfileKnowledgePathDimensionDoc } from '@sdd-telemetry/api';
import { SoftBadge } from './WikiRecallControls';
import { formatInteger } from '@/lib/format';

export function PathDimensionDocList({
  docs,
  selectedPath,
  onSelect,
}: {
  docs: ProfileKnowledgePathDimensionDoc[];
  selectedPath: string | null;
  onSelect: (relativePath: string) => void;
}) {
  return (
    <div className="grid gap-[2px]">
      {docs.map((doc) => {
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
            <SoftBadge tone={doc.accessCount >= 10 ? 'good' : 'neutral'}>
              {doc.accessCount >= 10 ? '高频' : '活跃'}
            </SoftBadge>
            <span
              className="text-right text-[11px] text-[var(--color-muted)]"
              style={{ fontFamily: 'var(--font-mono)' }}
            >
              {formatInteger(doc.accessCount)} 次
            </span>
          </button>
        );
      })}
    </div>
  );
}
