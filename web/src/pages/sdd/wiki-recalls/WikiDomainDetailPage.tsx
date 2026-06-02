import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, BookOpen } from 'lucide-react';
import { DomainDetailHeader } from './components/DomainDetailHeader';
import { DomainDocList } from './components/DomainDocList';
import { DocRecallDetail } from './components/DocRecallDetail';
import { useWikiRecallDomainDocs } from './useWikiRecalls';
import { CARD_STYLE, REPO_LABEL } from './styles';
import { formatInteger } from '@/lib/format';

export default function WikiDomainDetailPage() {
  const params = useParams();
  const navigate = useNavigate();
  const repo = params.repo ?? '';
  const domain = params.domain ? decodeURIComponent(params.domain) : '';

  const docsQuery = useWikiRecallDomainDocs(repo, domain);
  const docs = docsQuery.data?.items ?? [];
  const [selectedPath, setSelectedPath] = useState<string | null>(null);

  useEffect(() => {
    if (!selectedPath && docs.length > 0) {
      setSelectedPath(docs[0]?.relativePath ?? null);
    }
  }, [docs, selectedPath]);

  const selectedDoc = docs.find((d) => d.relativePath === selectedPath) ?? null;

  if (docsQuery.isLoading) {
    return <div className="p-4 text-[13px] text-[var(--color-muted)]">加载中…</div>;
  }

  return (
    <div className="grid gap-3">
      <section className="flex items-center gap-3 rounded-[6px] p-[14px]" style={CARD_STYLE}>
        <button
          onClick={() => navigate('/sdd/wiki-recalls')}
          className="inline-flex items-center gap-1 text-[12px] text-[var(--color-muted)] hover:text-[var(--color-secondary)]"
        >
          <ArrowLeft size={14} /> 知识库分析
        </button>
        <span className="text-[var(--color-border)]">/</span>
        <span className="text-[12px] text-[var(--color-secondary)]">{REPO_LABEL[repo] ?? repo}</span>
        <span className="text-[var(--color-border)]">/</span>
        <div className="flex items-center gap-1.5">
          <BookOpen size={16} style={{ color: 'var(--color-primary)' }} />
          <h2 className="text-[16px] font-semibold text-[#f5f5f5]">{domain}</h2>
        </div>
      </section>

      <DomainDetailHeader repo={repo} domain={domain} />

      <div className="grid gap-3" style={{ gridTemplateColumns: '300px 1fr' }}>
        <section className="rounded-[6px] p-[10px]" style={CARD_STYLE}>
          <div className="mb-2 flex items-center gap-2 px-1 pb-2" style={{ borderBottom: '1px solid var(--color-border)' }}>
            <span className="text-[12px] font-semibold text-[#f5f5f5]">文档清单</span>
            <span className="text-[11px] text-[var(--color-muted)]">· {formatInteger(docs.length)} 篇</span>
          </div>
          {docs.length === 0 ? (
            <div className="px-2 py-3 text-[12px] text-[var(--color-muted)]">暂无文档</div>
          ) : (
            <DomainDocList docs={docs} selectedPath={selectedPath} onSelect={setSelectedPath} />
          )}
        </section>

        <DocRecallDetail repo={repo} doc={selectedDoc} />
      </div>
    </div>
  );
}
