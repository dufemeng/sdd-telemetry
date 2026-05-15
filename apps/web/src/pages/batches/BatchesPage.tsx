import { FileStack } from 'lucide-react';
import { useBatchList } from './useBatchList';
import { Panel } from '../../components/ui/Panel';
import { DataTable } from '../../components/ui/DataTable';
import { StatusBadge } from '../../components/ui/StatusBadge';
import { formatInteger, formatBytes, formatTime, truncate } from '../../lib/format';

export default function BatchesPage() {
  const { data } = useBatchList();

  return (
    <Panel title="批次列表" icon={<FileStack size={18} />}>
      <DataTable
        headers={['状态', 'id', '接收时间', 'payload', 'rawLog数', '事件数', '派生数', '重复数', '耗时', '错误']}
        rows={(data?.items ?? []).map((b) => [
          <StatusBadge key="s" status={b.status} />,
          b.id,
          formatTime(b.receivedAt),
          formatBytes(b.payloadBytes),
          formatInteger(b.rawLogCount),
          formatInteger(b.eventCount),
          formatInteger(b.derivedCount),
          formatInteger(b.duplicateCount),
          b.parseDurationMs == null ? '—' : `${b.parseDurationMs} ms`,
          truncate(b.lastError, 120),
        ])}
      />
    </Panel>
  );
}
