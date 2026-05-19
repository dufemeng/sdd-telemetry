import React from 'react';
import { CheckSquare, GitBranch, Layers3, Workflow } from 'lucide-react';
import { useShellContext } from '../../../components/layout/useShellContext';
import { useSddFunnel } from './useSddFunnel';
import { StatCard } from '../../../components/ui/StatCard';
import { Panel } from '../../../components/ui/Panel';
import { BarList } from '../../../components/ui/BarList';
import { formatInteger, formatPercent } from '../../../lib/format';

export default function FunnelPage() {
  const { timeRange } = useShellContext();
  const { data } = useSddFunnel(timeRange);
  const cq = data?.callQuality;

  return (
    <div className="grid gap-3">
      <div className="grid grid-cols-4 gap-3">
        <StatCard
          icon={<Workflow size={18} />}
          label="交互总数"
          value={formatInteger(data?.totalInteractions)}
          hint="sdd_interactions"
        />
        <StatCard
          icon={<Layers3 size={18} />}
          label="技能调用数"
          value={formatInteger(data?.totalSkillUsages)}
          hint="sdd_skill_usages"
        />
        <StatCard
          icon={<CheckSquare size={18} />}
          label="配对成功率"
          value={formatPercent(cq?.pairingSuccessRate)}
          hint="无 api_error / 全部"
        />
        <StatCard
          icon={<GitBranch size={18} />}
          label="覆盖语义数"
          value={formatInteger(data?.stages.length)}
          hint="semantic stages"
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Panel title="调用质量漏斗" icon={<Workflow size={18} />}>
          <div className="grid gap-2">
            {(
              [
                ['已触发', formatInteger(cq?.triggeredCount)],
                ['有提示词', formatInteger(cq?.withPromptCount)],
                ['有回答', formatInteger(cq?.withResponseCount)],
                ['已配对', formatInteger(cq?.pairedCount)],
              ] as [string, string][]
            ).map(([label, value]) => (
              <div
                key={label}
                className="flex items-center justify-between min-h-9 px-[10px] rounded-[4px]"
                style={{
                  border: '1px solid var(--color-border)',
                  background: '#171717',
                }}
              >
                <span className="text-[12px] text-[var(--color-muted)]">{label}</span>
                <strong
                  className="text-[13px] text-[#f5f5f5]"
                  style={{ fontFamily: 'var(--font-mono)' }}
                >
                  {value}
                </strong>
              </div>
            ))}
          </div>
        </Panel>
        <Panel title="语义分布" icon={<Layers3 size={18} />}>
          <BarList
            items={(data?.stages ?? []).map((s) => ({
              label: s.displayName,
              sub: `${s.semanticCode} / ${s.userCount} users`,
              value: s.usageCount,
              ratio: s.conversionRate ?? 0,
            }))}
          />
        </Panel>
      </div>
    </div>
  );
}
