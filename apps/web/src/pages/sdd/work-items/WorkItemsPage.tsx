import { GitBranch } from 'lucide-react';
import { useSddWorkItems } from './useSddWorkItems';
import { Panel } from '../../../components/ui/Panel';
import { DataTable } from '../../../components/ui/DataTable';
import { formatTime } from '../../../lib/format';

export default function WorkItemsPage() {
  const { data } = useSddWorkItems();

  return (
    <Panel title="工作项" icon={<GitBranch size={18} />}>
      <DataTable
        headers={['标题', 'slug', '业务域', '需求库', '相对路径', '首次', '最近']}
        rows={(data ?? []).map((item) => [
          item.workItemTitle ?? item.workItemSlug,
          item.workItemSlug,
          item.businessDomain ?? '—',
          item.requirementsRepoName ?? '—',
          item.relativeDir,
          formatTime(item.firstSeenAt),
          formatTime(item.lastSeenAt),
        ])}
      />
    </Panel>
  );
}
