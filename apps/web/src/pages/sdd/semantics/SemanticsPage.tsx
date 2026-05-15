import { Settings } from 'lucide-react';
import { useSddSemantics } from './useSddSemantics';
import { CreateSemanticForm } from './CreateSemanticForm';
import { Panel } from '../../../components/ui/Panel';
import { DataTable } from '../../../components/ui/DataTable';

export default function SemanticsPage() {
  const { data } = useSddSemantics();

  return (
    <div className="grid gap-3" style={{ gridTemplateColumns: 'minmax(0,1.5fr) minmax(320px,0.75fr)' }}>
      <Panel title="语义列表" icon={<Settings size={18} />}>
        <DataTable
          headers={['语义编码', '展示名', '描述', '技能别名']}
          rows={(data ?? []).map((item) => [
            item.semanticCode,
            item.displayName,
            item.description ?? '—',
            item.aliases.map((a) => a.skillName).join(', '),
          ])}
        />
      </Panel>
      <CreateSemanticForm />
    </div>
  );
}
