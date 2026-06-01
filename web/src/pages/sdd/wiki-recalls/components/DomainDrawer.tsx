import { useState } from 'react';
import { BookOpen, GitBranch } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { RowInspectorDrawer, type RowInspectorField } from '@/components/ui/RowInspectorDrawer';
import { WikiDocModal } from '@/components/sdd/WikiDocModal';
import { SoftBadge } from './WikiRecallControls';
import { useWikiRecallDomainDocs, useWikiRecallWorkItemRanking } from '../useWikiRecalls';
import { REPO_LABEL, repoTagStyle } from '../styles';
import { formatInteger } from '@/lib/format';

const STATUS_BADGE: Record<string, { label: string; tone: 'good' | 'neutral' | 'bad' | 'info' }> = {
  hot: { label: '热', tone: 'good' },
  cold: { label: '冷', tone: 'neutral' },
  dead: { label: '死', tone: 'bad' },
  new: { label: '新增未读', tone: 'info' },
};

export function DomainDrawer({ repo, domain, onClose }: { repo: string; domain: string; onClose: () => void }) {
  const navigate = useNavigate();
  const docsQuery = useWikiRecallDomainDocs(repo, domain);
  const reqQuery = useWikiRecallWorkItemRanking('all', { businessDomain: domain });
  const [doc, setDoc] = useState<{ toolCallId?: string | null; source?: { repo: string; relativePath: string } } | null>(null);

  const items = docsQuery.data?.items ?? [];
  const fields: RowInspectorField[] = [
    { label: '知识库', value: `bk-fe-knowledge-${repo}`, mono: true },
    { label: '库内文档', value: `${items.length} 篇` },
    { label: '死知识', value: String(items.filter((i) => i.status === 'dead').length) },
  ];

  return (
    <>
      <RowInspectorDrawer
        open
        onOpenChange={(o) => { if (!o) onClose(); }}
        title={domain}
        subtitle={REPO_LABEL[repo] ?? repo}
        icon={<BookOpen size={18} />}
        row={{ id: `${repo}-${domain}` }}
        fields={fields}
        rawData={docsQuery.data ?? {}}
        loading={docsQuery.isLoading}
        error={docsQuery.error ? String(docsQuery.error) : null}
      >
        <section className="px-5 pb-4">
          <div className="mb-3 flex items-center gap-2 pb-2" style={{ borderBottom: '1px solid var(--color-border)' }}>
            <BookOpen size={14} style={{ color: 'var(--color-primary)' }} />
            <span className="text-[12px] font-semibold text-[#f5f5f5]">文档清单</span>
            <span className="text-[11px] text-[var(--color-muted)]">· {items.length} 篇</span>
          </div>
          <div className="grid gap-[4px]">
            {items.map((it) => {
              const badge = STATUS_BADGE[it.status]!;
              return (
                <button
                  key={it.relativePath}
                  className="grid items-center gap-2 rounded-[4px] px-2 py-[6px] text-left hover:bg-[#171717]"
                  style={{ gridTemplateColumns: '1fr auto auto' }}
                  onClick={() => setDoc(it.lastToolCallId ? { toolCallId: it.lastToolCallId } : { source: { repo, relativePath: it.relativePath } })}
                >
                  <span className="truncate text-[12px] text-[var(--color-secondary)]" style={{ fontFamily: 'var(--font-mono)' }} title={it.relativePath}>{it.relativePath}</span>
                  <SoftBadge tone={badge.tone}>{badge.label}</SoftBadge>
                  <span className="text-right text-[11px] text-[var(--color-muted)]" style={{ fontFamily: 'var(--font-mono)' }}>{it.recallCount} 次</span>
                </button>
              );
            })}
          </div>
        </section>
        <section className="px-5 pb-4">
          <div className="mb-3 flex items-center gap-2 pb-2" style={{ borderBottom: '1px solid var(--color-border)' }}>
            <GitBranch size={14} style={{ color: 'var(--color-primary)' }} />
            <span className="text-[12px] font-semibold text-[#f5f5f5]">关联需求</span>
          </div>
          <div className="grid gap-[4px]">
            {(reqQuery.data?.items ?? []).slice(0, 10).map((w) => (
              <button
                key={w.workItemId}
                className="flex items-center justify-between rounded-[4px] px-2 py-[6px] text-left hover:bg-[#171717]"
                onClick={() => navigate(`/sdd/work-items/${w.workItemId}`)}
              >
                <span className="text-[12px] text-[var(--color-secondary)]">{w.workItemSlug}</span>
                <span className="text-[11px] text-[var(--color-muted)]" style={{ fontFamily: 'var(--font-mono)' }}>{formatInteger(w.totalRecalls)} 次</span>
              </button>
            ))}
          </div>
        </section>
      </RowInspectorDrawer>
      <WikiDocModal
        open={!!doc}
        onOpenChange={(o) => { if (!o) setDoc(null); }}
        toolCallId={doc?.toolCallId ?? null}
        source={doc?.source ?? null}
      />
    </>
  );
}
