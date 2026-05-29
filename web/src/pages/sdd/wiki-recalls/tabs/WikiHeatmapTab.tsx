import { useMemo, type ReactNode } from 'react';
import { Database, Globe2, Layers3 } from 'lucide-react';
import type { WikiRecallHeatmapBucket } from '@sdd-telemetry/api';
import type { TimeRange } from '@/components/layout/TopBar';
import { BarList } from '@/components/ui/BarList';
import { Panel } from '@/components/ui/Panel';
import { useWikiRecallHeatmap } from '../useWikiRecalls';
import { QueryNotice } from '../components/WikiRecallControls';

export function WikiHeatmapTab({ range }: { range: TimeRange }) {
  const byDomain = useWikiRecallHeatmap(range, 'domain');
  const byAxis = useWikiRecallHeatmap(range, 'axis');
  const bySystem = useWikiRecallHeatmap(range, 'system');

  return (
    <div className="grid grid-cols-1 gap-3 xl:grid-cols-3">
      <HeatmapPanel
        title="按业务域"
        icon={<Globe2 size={17} />}
        buckets={byDomain.data?.buckets}
        loading={byDomain.isLoading}
        error={byDomain.error}
        emptyText="暂无业务域召回"
      />
      <HeatmapPanel
        title="按知识维度"
        icon={<Layers3 size={17} />}
        buckets={byAxis.data?.buckets}
        loading={byAxis.isLoading}
        error={byAxis.error}
        emptyText="暂无维度召回"
      />
      <HeatmapPanel
        title="按系统模块"
        icon={<Database size={17} />}
        buckets={bySystem.data?.buckets}
        loading={bySystem.isLoading}
        error={bySystem.error}
        emptyText="暂无系统模块召回"
      />
    </div>
  );
}

function HeatmapPanel({
  title,
  icon,
  buckets = [],
  loading,
  error,
  emptyText,
}: {
  title: string;
  icon: ReactNode;
  buckets?: WikiRecallHeatmapBucket[];
  loading: boolean;
  error: unknown;
  emptyText: string;
}) {
  const items = useMemo(
    () =>
      buckets.map((bucket) => ({
        label: bucket.key || '(未识别)',
        sub: `${bucket.distinctUsers} 人`,
        value: bucket.totalRecalls,
        ratio: 1,
      })),
    [buckets],
  );

  return (
    <Panel title={title} icon={icon}>
      <div className="grid gap-3">
        <QueryNotice loading={loading} error={error} loadingText="正在加载热度..." />
        <BarList items={items} emptyText={emptyText} />
      </div>
    </Panel>
  );
}
