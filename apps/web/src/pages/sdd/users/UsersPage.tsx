import { UserRound } from 'lucide-react';
import { useSddUsers } from './useSddUsers';
import { Panel } from '../../../components/ui/Panel';
import { DataTable } from '../../../components/ui/DataTable';
import { formatInteger, formatTime } from '../../../lib/format';

export default function UsersPage() {
  const { data } = useSddUsers();

  return (
    <Panel title="用户维度" icon={<UserRound size={18} />}>
      <DataTable
        headers={['用户', 'installId', 'machineId', 'machineName', '交互数', '技能调用', '最近活跃']}
        rows={(data ?? []).map((u) => [
          u.userName ?? u.userKey,
          u.installId ?? '—',
          u.machineId ?? '—',
          u.machineName ?? '—',
          formatInteger(u.interactionCount),
          formatInteger(u.skillUsageCount),
          formatTime(u.lastSeenAt),
        ])}
      />
    </Panel>
  );
}
