import { UserRound } from 'lucide-react';
import { useSddUsers } from './useSddUsers';
import { Panel } from '@/components/ui/Panel';
import { DataTable } from '@/components/ui/DataTable';
import { Pagination } from '@/components/ui/Pagination';
import { formatInteger, formatTime } from '@/lib/format';
import { useClientPagination } from '@/lib/useClientPagination';

const PAGE_SIZE = 20;

export default function UsersPage() {
  const { data } = useSddUsers();
  const { pageItems, pageNumber, hasNext, hasPrev, goNext, goPrev } = useClientPagination(data ?? [], PAGE_SIZE);

  return (
    <Panel title="用户维度" icon={<UserRound size={18} />}>
      <div className="grid gap-3">
        <DataTable
          headers={[
            '用户',
            'installId',
            'machineId',
            'requirementsRoot',
            'wikiRoot',
            '交互数',
            '技能调用',
            '最近活跃',
          ]}
          rows={pageItems.map((u) => [
            u.userName ?? u.userKey,
            u.installId ?? '—',
            u.machineId ?? '—',
            u.requirementsRootPath ?? '—',
            u.wikiRootPath ?? '—',
            formatInteger(u.interactionCount),
            formatInteger(u.skillUsageCount),
            formatTime(u.lastSeenAt),
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
