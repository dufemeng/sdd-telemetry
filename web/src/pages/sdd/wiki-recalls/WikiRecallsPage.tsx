import { BookOpen, FileText, Gauge, TriangleAlert } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useKnowledgeOverview } from './useWikiRecalls';
import { BusinessLineCompare } from './components/BusinessLineCompare';
import { RecallTrendChart } from './components/RecallTrendChart';
import { TopPathDimensions } from './components/TopPathDimensions';
import { AssetTable } from './components/AssetTable';
import { CARD_STYLE, ICON_BOX } from './styles';
import { formatInteger } from '@/lib/format';

export default function WikiRecallsPage() {
  const navigate = useNavigate();
  const { data, isLoading, error } = useKnowledgeOverview();
  const t = data?.totals;

  const goPathDimension = (sourceNamespace: string, pathSegment: string) => {
    navigate(
      `/sdd/wiki-recalls/${encodeURIComponent(sourceNamespace)}/${encodeURIComponent(pathSegment)}`,
    );
  };

  return (
    <div className="grid gap-3">
      <header className="flex flex-wrap items-baseline gap-3">
        <h1
          className="text-[22px] font-semibold text-[#f5f5f5]"
          style={{ fontFamily: 'var(--font-mono)' }}
        >
          知识库分析
        </h1>
        <span className="text-[12px] text-[var(--color-muted)]">团队知识读取 · 访问事实口径</span>
      </header>

      {error ? (
        <div
          className="rounded-[6px] px-[14px] py-3 text-[12px]"
          style={{
            border: '1px solid var(--color-border)',
            background: 'var(--color-bad-bg)',
            color: 'var(--color-bad-text)',
          }}
        >
          覆盖率数据加载失败：
          {error instanceof Error ? error.message : String(error)}
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi
          icon={<BookOpen size={18} />}
          name="访问文档"
          value={isLoading ? '…' : formatInteger(t?.accessedDocs ?? 0)}
          hint="按来源空间 + 相对路径去重"
        />
        <Kpi
          icon={<FileText size={18} />}
          name="知识访问"
          value={isLoading ? '…' : formatInteger(t?.accessCount ?? 0)}
          hint="全团队知识读取次数"
          volt
        />
        <Kpi
          icon={<Gauge size={18} />}
          name="来源空间"
          value={isLoading ? '…' : formatInteger(data?.sources.length ?? 0)}
          hint="由 source rule 确定"
          volt
        />
        <Kpi
          icon={<TriangleAlert size={18} />}
          name="路径维度"
          value={isLoading ? '…' : formatInteger(data?.pathDimensions.length ?? 0)}
          hint="按相对路径全部目录段即时聚合"
        />
      </div>

      <BusinessLineCompare sources={data?.sources ?? []} />

      <div className="grid grid-cols-1 gap-3 xl:grid-cols-[minmax(0,2fr)_minmax(280px,1fr)]">
        <RecallTrendChart />
        <TopPathDimensions
          pathDimensions={data?.pathDimensions ?? []}
          onSelectPathDimension={goPathDimension}
        />
      </div>

      <AssetTable
        pathDimensions={data?.pathDimensions ?? []}
        sources={data?.sources ?? []}
        onSelectPathDimension={goPathDimension}
      />
    </div>
  );
}

function Kpi({
  icon,
  name,
  value,
  hint,
  volt,
  bad,
}: {
  icon: React.ReactNode;
  name: string;
  value: string;
  hint: string;
  volt?: boolean;
  bad?: boolean;
}) {
  return (
    <section className="flex gap-3 rounded-[6px] p-[14px]" style={{ ...CARD_STYLE, minHeight: 98 }}>
      <div
        className="grid h-[34px] w-[34px] flex-none place-items-center rounded-[4px]"
        style={ICON_BOX}
      >
        {icon}
      </div>
      <div className="flex flex-col justify-between">
        <span className="text-[12px] text-[var(--color-secondary)]">{name}</span>
        <strong
          className="text-[24px] font-semibold"
          style={{
            fontFamily: 'var(--font-mono)',
            color: bad ? 'var(--color-bad-text)' : volt ? 'var(--color-primary)' : '#f5f5f5',
          }}
        >
          {value}
        </strong>
        <em className="text-[11px] not-italic text-[var(--color-muted)]">{hint}</em>
      </div>
    </section>
  );
}
