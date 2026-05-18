import { Workflow } from 'lucide-react';
import { useShellContext } from '../../../components/layout/useShellContext';
import { useSddInteractions } from './useSddInteractions';
import { Panel } from '../../../components/ui/Panel';
import { DataTable } from '../../../components/ui/DataTable';
import { Pagination } from '../../../components/ui/Pagination';
import { StatusBadge } from '../../../components/ui/StatusBadge';
import { formatTime, truncate } from '../../../lib/format';
import { useClientPagination } from '../../../lib/useClientPagination';

const PAGE_SIZE = 20;

export default function InteractionsPage() {
  const { timeRange, search } = useShellContext();
  const { data } = useSddInteractions(timeRange);

  const filtered = (data ?? []).filter((item) => {
    if (!search) return true;
    const haystack = [item.sessionId, item.promptId, item.userId, item.commandName]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
    return haystack.includes(search.toLowerCase());
  });

  const { pageItems, pageNumber, hasNext, hasPrev, goNext, goPrev } = useClientPagination(filtered, PAGE_SIZE);

  return (
    <Panel title="交互明细" icon={<Workflow size={18} />}>
      <div className="grid gap-3">
        <DataTable
          headers={['时间', '用户', 'sessionId', 'promptId', '模型', '状态', '耗时', '提示词预览', '回答预览']}
          rows={pageItems.map((item) => [
            formatTime(item.completedAt ?? item.startedAt),
            item.userId ?? '—',
            item.sessionId ?? '—',
            item.promptId ?? '—',
            item.model ?? '—',
            <StatusBadge key="s" status={item.status} />,
            item.durationMs == null ? '—' : `${item.durationMs} ms`,
            truncate(item.promptPreview, 140),
            truncate(item.responsePreview, 160),
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
