import { useShellContext } from '@/components/layout/useShellContext';
import { UserRankingTab } from './tabs/UserRankingTab';
import { WorkItemRankingTab } from './tabs/WorkItemRankingTab';
import { WikiHeatmapTab } from './tabs/WikiHeatmapTab';
import { TimelineTab } from './tabs/TimelineTab';

export default function WikiRecallsPage() {
  const { timeRange } = useShellContext();

  return (
    <div className="grid gap-3">
      <header>
        <h1 className="text-[22px] font-semibold tracking-normal text-[#f5f5f5]">知识库分析</h1>
      </header>

      <UserRankingTab range={timeRange} />
      <WikiHeatmapTab range={timeRange} />
      <WorkItemRankingTab range={timeRange} />
      <TimelineTab range={timeRange} />
    </div>
  );
}
