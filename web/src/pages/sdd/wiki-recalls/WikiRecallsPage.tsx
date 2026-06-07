import { BookOpen, FileText, Gauge, TriangleAlert } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useWikiRecallCoverage } from './useWikiRecalls';
import { BusinessLineCompare } from './components/BusinessLineCompare';
import { RecallTrendChart } from './components/RecallTrendChart';
import { TopDomains } from './components/TopDomains';
import { AssetTable } from './components/AssetTable';
import { CARD_STYLE, ICON_BOX } from './styles';
import { formatInteger } from '@/lib/format';

export default function WikiRecallsPage() {
  const navigate = useNavigate();
  const { data, isLoading, error } = useWikiRecallCoverage();
  const degraded = !isLoading && data?.scan.configured === false;
  const t = data?.totals;

  const goDomain = (repo: string, domain: string) => {
    navigate(`/sdd/wiki-recalls/${repo}/${encodeURIComponent(domain)}`);
  };

  return (
    <div className="grid gap-3">
      <header className="flex items-baseline gap-3">
        <h1 className="text-[22px] font-semibold text-[#f5f5f5]" style={{ fontFamily: 'var(--font-mono)' }}>知识库分析</h1>
        <span className="text-[12px] text-[var(--color-muted)]">团队知识资产 · 累计口径 · 分母取服务器当前快照</span>
      </header>

      {error ? (
        <div className="rounded-[6px] px-[14px] py-3 text-[12px]" style={{ border: '1px solid var(--color-border)', background: 'var(--color-bad-bg)', color: 'var(--color-bad-text)' }}>
          覆盖率数据加载失败：{error instanceof Error ? error.message : String(error)}
        </div>
      ) : null}

      <div className="grid grid-cols-4 gap-3">
        <Kpi icon={<BookOpen size={18} />} name="知识库规模" value={isLoading ? '…' : degraded ? '—' : formatInteger(t?.totalDocs ?? 0)} hint="3 库 .md 合计 · 当前快照" />
        <Kpi icon={<Gauge size={18} />} name="知识利用率" value={isLoading ? '…' : degraded ? '—' : `${Math.round((t?.coverageRate ?? 0) * 100)}%`} hint={degraded ? '需服务器挂载知识库' : `${t?.recalledDocs ?? 0} / ${t?.totalDocs ?? 0}`} volt />
        <Kpi icon={<FileText size={18} />} name="累计召回" value={isLoading ? '…' : formatInteger(t?.recalls ?? 0)} hint="全团队 wiki 读取次数" volt />
        <Kpi icon={<TriangleAlert size={18} />} name="沉睡文档" value={isLoading ? '…' : degraded ? '—' : String(t?.deadDocs ?? 0)} hint="超 30 天未被召回" bad />
      </div>

      <BusinessLineCompare repos={data?.repos ?? []} degraded={!!degraded} />

      <div className="grid gap-3" style={{ gridTemplateColumns: '2fr 1fr' }}>
        <RecallTrendChart />
        <TopDomains domains={data?.domains ?? []} degraded={!!degraded} onSelectDomain={goDomain} />
      </div>

      <AssetTable domains={data?.domains ?? []} repos={data?.repos ?? []} degraded={!!degraded} onSelectDomain={goDomain} />
    </div>
  );
}

function Kpi({ icon, name, value, hint, volt, bad }: { icon: React.ReactNode; name: string; value: string; hint: string; volt?: boolean; bad?: boolean }) {
  return (
    <section className="flex gap-3 rounded-[6px] p-[14px]" style={{ ...CARD_STYLE, minHeight: 98 }}>
      <div className="grid h-[34px] w-[34px] flex-none place-items-center rounded-[4px]" style={ICON_BOX}>{icon}</div>
      <div className="flex flex-col justify-between">
        <span className="text-[12px] text-[var(--color-secondary)]">{name}</span>
        <strong className="text-[24px] font-semibold" style={{ fontFamily: 'var(--font-mono)', color: bad ? 'var(--color-bad-text)' : volt ? 'var(--color-primary)' : '#f5f5f5' }}>{value}</strong>
        <em className="text-[11px] not-italic text-[var(--color-muted)]">{hint}</em>
      </div>
    </section>
  );
}
