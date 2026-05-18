import { useState } from 'react';
import { Settings } from 'lucide-react';
import { useSddSemantics } from './useSddSemantics';
import { SemanticForm } from './SemanticForm';
import { Panel } from '../../../components/ui/Panel';
import { Pagination } from '../../../components/ui/Pagination';
import { useClientPagination } from '../../../lib/useClientPagination';
import type { SddSemantic } from '@sdd-telemetry/api';

const PAGE_SIZE = 20;

function formatArtifactFilenamePatterns(patterns: string[] | null) {
  if (patterns === null) return '默认';
  if (patterns.length === 0) return '已禁用';
  return patterns.join(', ');
}

export default function SemanticsPage() {
  const { data } = useSddSemantics();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const allItems = data ?? [];
  const { pageItems, pageNumber, hasNext, hasPrev, goNext, goPrev } = useClientPagination(allItems, PAGE_SIZE);

  const selected: SddSemantic | null = allItems.find((item) => item.id === selectedId) ?? null;

  const handleRowClick = (id: string) => {
    setSelectedId((prev) => (prev === id ? null : id));
  };

  const handleDeleteSuccess = () => {
    setSelectedId(null);
  };

  return (
    <div className="grid gap-3" style={{ gridTemplateColumns: 'minmax(0,1.5fr) minmax(320px,0.75fr)' }}>
      <Panel title="语义列表" icon={<Settings size={18} />}>
        <div className="grid gap-3">
          <div className="w-full overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-[var(--color-border)]">
                  {['语义编码', '展示名', '描述', '文件名模式', '技能别名'].map((h) => (
                    <th
                      key={h}
                      className="pb-2 pr-4 text-[11px] text-[var(--color-muted)] font-medium whitespace-nowrap"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {pageItems.map((item) => (
                  <tr
                    key={item.id}
                    onClick={() => handleRowClick(item.id)}
                    className={[
                      'cursor-pointer transition-colors border-b border-[var(--color-border)] last:border-0',
                      item.id === selectedId
                        ? 'bg-[#202016] text-[var(--color-primary)]'
                        : 'text-[var(--color-secondary)] hover:bg-[#202016] hover:text-[var(--color-primary)]',
                    ].join(' ')}
                  >
                    <td className="py-2 pr-4 text-[12px]">{item.semanticCode}</td>
                    <td className="py-2 pr-4 text-[12px]">{item.displayName}</td>
                    <td className="py-2 pr-4 text-[12px] text-[var(--color-muted)]">{item.description ?? '—'}</td>
                    <td className="py-2 pr-4 text-[12px] text-[var(--color-muted)]">
                      {formatArtifactFilenamePatterns(item.artifactFilenamePatterns)}
                    </td>
                    <td className="py-2 text-[12px]">{item.aliases.map((a) => a.skillName).join(', ')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
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

      <SemanticForm selected={selected} onDeleteSuccess={handleDeleteSuccess} />
    </div>
  );
}
