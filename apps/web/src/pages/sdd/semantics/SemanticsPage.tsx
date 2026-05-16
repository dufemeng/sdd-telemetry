import { Settings } from 'lucide-react';
import { useSddSemantics } from './useSddSemantics';
import { CreateSemanticForm } from './CreateSemanticForm';
import { Panel } from '../../../components/ui/Panel';
import { DataTable } from '../../../components/ui/DataTable';
import { Pagination } from '../../../components/ui/Pagination';
import { useClientPagination } from '../../../lib/useClientPagination';

const PAGE_SIZE = 20;

export default function SemanticsPage() {
  const { data } = useSddSemantics();
  const { pageItems, pageNumber, hasNext, hasPrev, goNext, goPrev } = useClientPagination(data ?? [], PAGE_SIZE);

  return (
    <div className="grid gap-3" style={{ gridTemplateColumns: 'minmax(0,1.5fr) minmax(320px,0.75fr)' }}>
      <Panel title="语义列表" icon={<Settings size={18} />}>
        <div className="grid gap-3">
          <DataTable
            headers={['语义编码', '展示名', '描述', '技能别名']}
            rows={pageItems.map((item) => [
              item.semanticCode,
              item.displayName,
              item.description ?? '—',
              item.aliases.map((a) => a.skillName).join(', '),
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
      <CreateSemanticForm />
    </div>
  );
}
