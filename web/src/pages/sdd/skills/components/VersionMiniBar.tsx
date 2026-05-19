import type { SddUsageSummaryItem } from '@sdd-telemetry/api';

interface VersionMiniBarProps {
  versions: SddUsageSummaryItem['versions'];
  tone?: 'normal' | 'bad';
}

export function VersionMiniBar({ versions, tone = 'normal' }: VersionMiniBarProps) {
  const total = versions.reduce((sum, version) => sum + version.count, 0);
  const bg = tone === 'bad' ? '#ffb4ab' : 'var(--color-primary)';

  if (versions.length === 0 || total === 0) {
    return <span className="text-[var(--color-muted)]">—</span>;
  }

  return (
    <div className="grid gap-1">
      <div className="flex h-2 w-[128px] overflow-hidden rounded-[3px]" style={{ background: '#202016' }}>
        {versions.slice(0, 4).map((version, index) => (
          <span
            key={`${version.version}-${index}`}
            className="h-full"
            title={`${version.version}: ${version.count}`}
            style={{
              width: `${Math.max((version.count / total) * 100, 4)}%`,
              background: index === 0 ? bg : '#3a3939',
            }}
          />
        ))}
      </div>
      <span className="max-w-[160px] truncate text-[10px] text-[var(--color-muted)]">
        {versions.map((version) => `${version.version}(${version.count})`).join(', ')}
      </span>
    </div>
  );
}
