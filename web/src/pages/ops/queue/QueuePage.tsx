import { Activity, AlertCircle, Clock3, Loader2, TerminalSquare } from 'lucide-react';
import { useOpsQueue } from './useOpsQueue';
import { useOpsJobs } from './useOpsJobs';
import { StatCard } from '@/components/ui/StatCard';
import { Panel } from '@/components/ui/Panel';
import { DataTable } from '@/components/ui/DataTable';
import { Pagination } from '@/components/ui/Pagination';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { formatInteger, formatTime, truncate } from '@/lib/format';
import { useCursorPagination } from '@/lib/useCursorPagination';

const PAGE_SIZE = 20;

export default function QueuePage() {
  const { data: queue } = useOpsQueue();
  const { currentCursor, pageNumber, hasPrev, goNext, goPrev } = useCursorPagination();
  const { data: jobs } = useOpsJobs(PAGE_SIZE, currentCursor);

  const hasNext = Boolean(jobs?.nextCursor);

  return (
    <div className="grid gap-3">
      <div className="grid grid-cols-4 gap-3">
        <StatCard icon={<Clock3      size={18} />} label="pendingOutbox" value={formatInteger(queue?.pendingOutbox)} hint="待投递" />
        <StatCard icon={<Loader2     size={18} />} label="queuedJobs"    value={formatInteger(queue?.queuedJobs)}    hint="队列中" />
        <StatCard icon={<Activity    size={18} />} label="activeJobs"    value={formatInteger(queue?.activeJobs)}    hint="执行中" />
        <StatCard icon={<AlertCircle size={18} />} label="failedJobs"    value={formatInteger(queue?.failedJobs)}    hint="失败任务" />
      </div>
      <Panel title="Job 列表" icon={<TerminalSquare size={18} />}>
        <div className="grid gap-3">
          <DataTable
            headers={['id', 'kind', '状态', 'aggregateId', 'attempts', '错误', '创建', '更新']}
            rows={(jobs?.items ?? []).map((job) => [
              job.id,
              job.kind,
              <StatusBadge key="s" status={job.status} />,
              job.aggregateId ?? '—',
              formatInteger(job.attempts),
              truncate(job.lastError, 120),
              formatTime(job.createdAt),
              formatTime(job.updatedAt),
            ])}
          />
          <Pagination
            pageNumber={pageNumber}
            pageSize={PAGE_SIZE}
            hasNext={hasNext}
            hasPrev={hasPrev}
            onNext={() => jobs?.nextCursor && goNext(jobs.nextCursor)}
            onPrev={goPrev}
          />
        </div>
      </Panel>
    </div>
  );
}
