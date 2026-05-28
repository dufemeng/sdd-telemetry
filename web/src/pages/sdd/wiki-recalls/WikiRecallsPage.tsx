import { type ComponentType } from 'react';
import { useSearchParams } from 'react-router-dom';
import { BarChart3, Clock3, FileStack, Trophy } from 'lucide-react';
import { UserRankingTab } from './tabs/UserRankingTab';
import { WorkItemRankingTab } from './tabs/WorkItemRankingTab';
import { WikiHeatmapTab } from './tabs/WikiHeatmapTab';
import { TimelineTab } from './tabs/TimelineTab';

type TabKey = 'ranking' | 'work-items' | 'heatmap' | 'timeline';

const TABS: Array<{
  key: TabKey;
  label: string;
  icon: ComponentType<{ size?: number }>;
  Component: ComponentType;
}> = [
  { key: 'ranking', label: '用户排行', icon: Trophy, Component: UserRankingTab },
  { key: 'work-items', label: '需求 × wiki', icon: FileStack, Component: WorkItemRankingTab },
  { key: 'heatmap', label: 'Wiki 热度', icon: BarChart3, Component: WikiHeatmapTab },
  { key: 'timeline', label: '召回时间线', icon: Clock3, Component: TimelineTab },
];

function isTabKey(value: string | null): value is TabKey {
  return value === 'ranking' || value === 'work-items' || value === 'heatmap' || value === 'timeline';
}

export default function WikiRecallsPage() {
  const [params, setParams] = useSearchParams();
  const rawTab = params.get('tab');
  const active: TabKey = isTabKey(rawTab) ? rawTab : 'ranking';
  const activeTab = TABS.find((tab) => tab.key === active) ?? TABS[0]!;
  const Active = activeTab.Component;

  return (
    <div className="grid gap-3">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-semibold tracking-normal text-[#f5f5f5]">知识库召回</h1>
        </div>
      </header>

      <div
        className="flex w-fit items-center gap-1 rounded-[8px] p-1"
        style={{ background: 'var(--color-panel)', border: '1px solid var(--color-border)' }}
      >
        {TABS.map((tab) => {
          const isActive = tab.key === active;
          const Icon = tab.icon;
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => {
                const next = new URLSearchParams(params);
                next.set('tab', tab.key);
                setParams(next, { replace: true });
              }}
              className={[
                'flex h-8 items-center gap-2 rounded-[6px] px-3 text-[13px] transition-colors',
                isActive
                  ? 'text-[var(--color-primary)]'
                  : 'text-[var(--color-secondary)] hover:bg-[#202016] hover:text-[#f5f5f5]',
              ].join(' ')}
              style={isActive ? { background: '#2b2b20' } : undefined}
            >
              <Icon size={16} />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      <Active />
    </div>
  );
}
