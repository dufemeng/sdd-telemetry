import { Layers3 } from 'lucide-react';
import { useShellContext } from '../../../components/layout/useShellContext';
import { useSddUsageSummary } from './useSddUsageSummary';
import { Panel } from '../../../components/ui/Panel';
import { DataTable } from '../../../components/ui/DataTable';
import { formatInteger, formatTime } from '../../../lib/format';

export default function SummaryPage() {
  const { timeRange } = useShellContext();
  const { data } = useSddUsageSummary(timeRange);

  return (
    <Panel title="技能概览" icon={<Layers3 size={18} />}>
      <DataTable
        headers={['技能 / 语义', '调用次数', '用户数', '会话数', '工作项', '版本', '首次', '最近']}
        rows={(data?.items ?? []).map((item) => [
          `${item.rawSkillName} / ${item.semanticDisplayName ?? item.semanticCode ?? '未匹配'}`,
          formatInteger(item.usageCount),
          formatInteger(item.activeUserCount),
          formatInteger(item.sessionCount),
          formatInteger(item.workItemCount),
          item.versions.map((v) => `${v.version}(${v.count})`).join(', ') || '—',
          formatTime(item.firstSeenAt),
          formatTime(item.lastSeenAt),
        ])}
      />
    </Panel>
  );
}
