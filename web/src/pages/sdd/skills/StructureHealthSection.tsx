import { Layers3, Tags } from 'lucide-react';
import type { TimeRange } from '@/components/layout/TopBar';
import { BarList } from '@/components/ui/BarList';
import { EmptyState } from '@/components/ui/EmptyState';
import { Panel } from '@/components/ui/Panel';
import { useSkillAnalytics } from './hooks/useSkillAnalytics';
import { MatchHealthDonut } from './components/MatchHealthDonut';
import { UnmatchedTopList } from './components/UnmatchedTopList';

interface StructureHealthSectionProps {
  timeRange: TimeRange;
}

export function StructureHealthSection({ timeRange }: StructureHealthSectionProps) {
  const query = useSkillAnalytics(timeRange);

  return (
    <div className="grid grid-cols-2 gap-3">
      <Panel title="语义 TOP10" icon={<Layers3 size={18} />}>
        {query.error ? (
          <SectionError error={query.error} onRetry={() => void query.refetch()} />
        ) : query.data ? (
          <BarList
            items={query.data.topSemantics.map((item) => ({
              label: item.displayName,
              sub: `${item.semanticCode} / ${item.userCount} users`,
              value: item.usageCount,
              ratio: item.conversionRate ?? 0,
            }))}
          />
        ) : (
          <EmptyState text="加载中..." />
        )}
      </Panel>
      <Panel title="语义匹配健康" icon={<Tags size={18} />}>
        {query.error ? (
          <SectionError error={query.error} onRetry={() => void query.refetch()} />
        ) : query.data ? (
          <div className="grid gap-4">
            <MatchHealthDonut {...query.data.matchHealth} />
            <div>
              <h4 className="mb-2 text-[12px] font-medium text-[var(--color-secondary)]">未匹配技能 TOP5</h4>
              <UnmatchedTopList items={query.data.matchHealth.topUnmatched} />
            </div>
          </div>
        ) : (
          <EmptyState text="加载中..." />
        )}
      </Panel>
    </div>
  );
}

function SectionError({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  return (
    <div className="flex min-h-24 items-center justify-between gap-3 rounded-[4px] px-3 text-[12px] text-[var(--color-bad-text)]" style={{ background: 'var(--color-bad-bg)' }}>
      <span>{error instanceof Error ? error.message : '加载失败'}</span>
      <button type="button" onClick={onRetry} className="rounded-[4px] px-2 py-1 text-[var(--color-text)]" style={{ border: '1px solid var(--color-border)' }}>
        重试
      </button>
    </div>
  );
}
