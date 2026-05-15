import { Activity, AlertCircle, Code2, Gauge, ListFilter } from 'lucide-react';
import { useFieldCoverage } from './useFieldCoverage';
import { StatCard } from '../../components/ui/StatCard';
import { Panel } from '../../components/ui/Panel';
import { DataTable } from '../../components/ui/DataTable';
import { formatInteger, formatPercent, truncate } from '../../lib/format';

export default function QualityPage() {
  const { data } = useFieldCoverage();
  const fields      = data?.fields ?? [];
  const lowCoverage = fields.filter((f) => f.coverageRate < 0.8);
  const average     = fields.length > 0
    ? fields.reduce((s, f) => s + f.coverageRate, 0) / fields.length
    : null;

  return (
    <div className="grid gap-3">
      <div className="grid grid-cols-4 gap-3">
        <StatCard icon={<Activity    size={18} />} label="事件总数"    value={formatInteger(data?.totalEvents)} hint="totalEvents" />
        <StatCard icon={<Code2       size={18} />} label="字段数"      value={formatInteger(fields.length)}    hint="field paths" />
        <StatCard icon={<AlertCircle size={18} />} label="低覆盖字段"  value={formatInteger(lowCoverage.length)} hint="coverageRate < 80%" />
        <StatCard icon={<Gauge       size={18} />} label="平均覆盖率"  value={formatPercent(average)}          hint="all fields" />
      </div>
      <Panel title="字段覆盖率" icon={<ListFilter size={18} />}>
        <DataTable
          headers={['字段', '覆盖率', '出现次数', '样例']}
          rows={fields.map((f) => [
            f.fieldPath,
            formatPercent(f.coverageRate),
            formatInteger(f.presentCount),
            truncate(f.examples[0], 90),
          ])}
        />
      </Panel>
    </div>
  );
}
