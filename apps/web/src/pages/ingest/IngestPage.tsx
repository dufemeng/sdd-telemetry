import React from 'react';
import { Activity, AlertCircle, CheckSquare, Copy, HardDrive } from 'lucide-react';
import { useIngestHealth } from './useIngestHealth';
import { useBatchList } from '../batches/useBatchList';
import { StatCard } from '../../components/ui/StatCard';
import { Panel } from '../../components/ui/Panel';
import { DataTable } from '../../components/ui/DataTable';
import { StatusBadge } from '../../components/ui/StatusBadge';
import { formatInteger, formatBytes, formatTime } from '../../lib/format';

export default function IngestPage() {
  const { data } = useIngestHealth();
  const failedBatches = useBatchList('failed_retryable,failed_terminal');

  const latestMs = data?.latestReceivedAt ? Date.now() - new Date(data.latestReceivedAt).getTime() : null;
  const collectorStatus =
    latestMs === null       ? '暂无数据' :
    latestMs < 5 * 60_000  ? '正在接收' :
    latestMs < 30 * 60_000 ? '可能断流' : '长时间未上报';
  const statusVar =
    collectorStatus === '正在接收' ? 'good' :
    collectorStatus === '暂无数据' ? 'neutral' : 'warn';

  return (
    <div className="grid gap-3">
      <Panel title="链路状态" icon={<Activity size={18} />}>
        <div className="grid gap-4" style={{ gridTemplateColumns: '1fr 280px' }}>
          <div>
            <StatusBadge status={collectorStatus} variant={statusVar} />
            <h3 className="mt-3 text-[24px] font-semibold text-[#f5f5f5]" style={{ fontFamily: 'var(--font-mono)' }}>
              {formatTime(data?.latestReceivedAt)}
            </h3>
            <p className="mt-1.5 text-[12px] text-[var(--color-muted)]">
              latestParsedAt：{formatTime(data?.latestParsedAt)}
            </p>
          </div>
          <div
            className="grid gap-2 p-3 rounded-[4px]"
            style={{ gridTemplateColumns: '1fr auto', border: '1px solid var(--color-border)', background: '#171717' }}
          >
            {([
              ['pending',  formatInteger(data?.queue.pendingOutbox)],
              ['queued',   formatInteger(data?.queue.queuedJobs)],
              ['active',   formatInteger(data?.queue.activeJobs)],
              ['failed',   formatInteger(data?.queue.failedJobs)],
            ] as [string, string][]).map(([k, v]) => (
              <React.Fragment key={k}>
                <span className="text-[12px] text-[var(--color-muted)]">{k}</span>
                <strong className="text-[#f5f5f5]" style={{ fontFamily: 'var(--font-mono)' }}>{v}</strong>
              </React.Fragment>
            ))}
          </div>
        </div>
      </Panel>

      <div className="grid grid-cols-4 gap-3">
        <StatCard icon={<CheckSquare size={18} />} label="成功批次"  value={formatInteger(data?.parsedBatches)}    hint="parsedBatches" />
        <StatCard icon={<AlertCircle size={18} />} label="失败批次"  value={formatInteger(data?.failedBatches)}    hint="failedBatches" />
        <StatCard icon={<Copy        size={18} />} label="重复批次"  value={formatInteger(data?.duplicateBatches)} hint="duplicateBatches" />
        <StatCard icon={<HardDrive   size={18} />} label="Payload"  value={formatBytes(data?.totalPayloadBytes)}   hint="totalPayloadBytes" />
      </div>

      <Panel title="近期失败批次" icon={<AlertCircle size={18} />}>
        <DataTable
          headers={['状态', 'id', '接收时间', 'payload', '错误']}
          rows={(failedBatches.data?.items ?? []).map((b) => [
            <StatusBadge key="s" status={b.status} />,
            b.id,
            formatTime(b.receivedAt),
            formatBytes(b.payloadBytes),
            b.lastError ?? '—',
          ])}
          emptyText="暂无失败批次"
        />
      </Panel>
    </div>
  );
}
