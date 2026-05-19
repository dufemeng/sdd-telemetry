import { GitBranch } from 'lucide-react';
import { useSddWorkItems } from './useSddWorkItems';
import { Panel } from '@/components/ui/Panel';
import { DataTable } from '@/components/ui/DataTable';
import { Pagination } from '@/components/ui/Pagination';
import { formatTime } from '@/lib/format';
import { useClientPagination } from '@/lib/useClientPagination';

const PAGE_SIZE = 20;

export default function WorkItemsPage() {
  const { data } = useSddWorkItems();
  const { pageItems, pageNumber, hasNext, hasPrev, goNext, goPrev } = useClientPagination(data ?? [], PAGE_SIZE);

  return (
    <Panel title="工作项" icon={<GitBranch size={18} />}>
      <div className="grid gap-3">
        <DataTable
          headers={['标题', 'slug', '业务域', '需求库', '相对路径', '首次', '最近']}
          rows={pageItems.map((item) => [
            item.workItemTitle ?? item.workItemSlug,
            item.workItemSlug,
            item.businessDomain ?? '—',
            item.requirementsRepoName ?? '—',
            item.relativeDir,
            formatTime(item.firstSeenAt),
            formatTime(item.lastSeenAt),
          ])}
        />
        <Pagination
          pageNumber={pageNumber}
          pageSize={PAGE_SIZE}
          hasNext={hasNext}
          hasPrev={hasPrev}
          onNext={goNext}
          onPrev={goPrev}
        />
      </div>
    </Panel>
  );
}
