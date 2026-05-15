import { CheckSquare, Activity, Workflow, UserRound, Gauge, BarChart3, Layers3, FileStack } from 'lucide-react';
import { useIngestHealth } from '../ingest/useIngestHealth';
import { useSddFunnel } from '../sdd/funnel/useSddFunnel';
import { useEventDistribution } from '../events/useEventDistribution';
import { useSddUsers } from '../sdd/users/useSddUsers';
import { useBatchList } from '../batches/useBatchList';
import { StatCard } from '../../components/ui/StatCard';
import { Panel } from '../../components/ui/Panel';
import { BarList } from '../../components/ui/BarList';
import { DataTable } from '../../components/ui/DataTable';
import { StatusBadge } from '../../components/ui/StatusBadge';
import { formatInteger, formatTime, formatBytes } from '../../lib/format';
import { useShellContext } from '../../components/layout/useShellContext';
import { timeRangeToHours } from '../../lib/timeRange';

export default function OverviewPage() {
  const { timeRange } = useShellContext();
  const health  = useIngestHealth(timeRangeToHours(timeRange));
  const funnel  = useSddFunnel(timeRange);
  const dist    = useEventDistribution(timeRange);
  const users   = useSddUsers();
  const batches = useBatchList();

  const topUsers = (users.data ?? []).slice(0, 5);

  return (
    <div className="grid gap-3">
      {/* KPI row */}
      <div className="grid grid-cols-4 gap-3">
        <StatCard icon={<CheckSquare size={18} />} label="已解析批次"  value={formatInteger(health.data?.parsedBatches)}      hint="ingest/health" />
        <StatCard icon={<Activity    size={18} />} label="标准化事件"  value={formatInteger(dist.data?.totalEvents)}           hint="events total" />
        <StatCard icon={<Workflow    size={18} />} label="技能调用"    value={formatInteger(funnel.data?.totalSkillUsages)}    hint="sdd_skill_usages" />
        <StatCard icon={<UserRound   size={18} />} label="活跃用户"    value={formatInteger(topUsers.length)}                  hint="最近用户" />
      </div>

      {/* Row 2 */}
      <div className="grid grid-cols-2 gap-3">
        <Panel title="采集健康" icon={<Gauge size={18} />}>
          <div className="grid gap-2">
            {([
              ['parsed',     formatInteger(health.data?.parsedBatches)],
              ['processing', formatInteger(health.data?.processingBatches)],
              ['failed',     formatInteger(health.data?.failedBatches)],
              ['duplicate',  formatInteger(health.data?.duplicateBatches)],
            ] as [string, string][]).map(([label, value]) => (
              <div
                key={label}
                className="flex items-center justify-between min-h-9 px-[10px] rounded-[4px]"
                style={{ border: '1px solid var(--color-border)', background: '#171717' }}
              >
                <span className="text-[12px] text-[var(--color-muted)]">{label}</span>
                <strong className="text-[13px] text-[#f5f5f5]" style={{ fontFamily: 'var(--font-mono)' }}>{value}</strong>
              </div>
            ))}
          </div>
        </Panel>
        <Panel title="事件排行前 5" icon={<BarChart3 size={18} />}>
          <BarList
            items={(dist.data?.items ?? []).slice(0, 5).map((i) => ({
              label: i.eventName,
              sub:   i.description ?? i.eventName,
              value: i.count,
              ratio: i.percentage,
            }))}
          />
        </Panel>
      </div>

      {/* Row 3 */}
      <div className="grid grid-cols-2 gap-3">
        <Panel title="技能语义分布" icon={<Layers3 size={18} />}>
          <BarList
            items={(funnel.data?.stages ?? []).slice(0, 6).map((s) => ({
              label: s.displayName,
              sub:   s.semanticCode,
              value: s.usageCount,
              ratio: s.conversionRate ?? 0,
            }))}
          />
        </Panel>
        <Panel title="活跃用户" icon={<UserRound size={18} />}>
          <DataTable
            headers={['用户', '技能调用', '最近活跃']}
            rows={topUsers.map((u) => [
              u.userName ?? u.userKey,
              formatInteger(u.skillUsageCount),
              formatTime(u.lastSeenAt),
            ])}
          />
        </Panel>
      </div>

      {/* Recent batches */}
      <Panel title="最近批次" icon={<FileStack size={18} />}>
        <DataTable
          headers={['状态', 'id', '接收时间', 'payload', '事件数', '错误']}
          rows={(batches.data?.items ?? []).slice(0, 8).map((b) => [
            <StatusBadge key="s" status={b.status} />,
            b.id,
            formatTime(b.receivedAt),
            formatBytes(b.payloadBytes),
            formatInteger(b.eventCount),
            b.lastError ?? '—',
          ])}
        />
      </Panel>
    </div>
  );
}
