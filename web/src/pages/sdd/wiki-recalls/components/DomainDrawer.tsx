import { useState, useMemo } from 'react';
import { BookOpen, GitBranch } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { RowInspectorDrawer, type RowInspectorField } from '@/components/ui/RowInspectorDrawer';
import { WikiDocModal } from '@/components/sdd/WikiDocModal';
import { SoftBadge } from './WikiRecallControls';
import { useWikiRecallDomainDocs } from '../useWikiRecalls';
import { useSddWorkItems } from '@/pages/sdd/work-items/useSddWorkItems';
import { REPO_LABEL } from '../styles';
import { formatInteger } from '@/lib/format';

const ROOT_DOMAIN_LABEL = '（根目录）';

const STATUS_BADGE: Record<string, { label: string; tone: 'good' | 'neutral' | 'bad' | 'info' }> = {
  hot: { label: '热', tone: 'good' },
  cold: { label: '冷', tone: 'neutral' },
  dead: { label: '沉睡', tone: 'bad' },
  new: { label: '新增未读', tone: 'info' },
};

export function DomainDrawer({ repo, domain, onClose }: { repo: string; domain: string; onClose: () => void }) {
  const navigate = useNavigate();
  const docsQuery = useWikiRecallDomainDocs(repo, domain);
  const workItemsQuery = useSddWorkItems();
  const [doc, setDoc] = useState<{ toolCallId?: string | null; source?: { repo: string; relativePath: string } } | null>(null);

  const items = docsQuery.data?.items ?? [];
  const reqItems = useMemo(() => {
    const all = workItemsQuery.data ?? [];
    return all
      .filter((i) => (i.businessDomain ?? ROOT_DOMAIN_LABEL) === domain)
      .sort((a, b) => b.artifactCount - a.artifactCount)
      .slice(0, 20);
  }, [workItemsQuery.data, domain]);
  const fields: RowInspectorField[] = [
    { label: '知识库', value: `bk-fe-knowledge-${repo}`, mono: true },
    { label: '库内文档', value: `${items.length} 篇` },
    { label: '沉睡文档', value: String(items.filter((i) => i.status === 'dead').length) },
    { label: '本域需求', value: String(reqItems.length) },
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
            <span className="text-[12px] font-semibold text-[#f5f5f5]">本域需求</span>
            <span className="text-[11px] text-[var(--color-muted)]">· {reqItems.length} 个</span>
          </div>
          <div className="grid gap-[4px]">
            {reqItems.length === 0 ? (
              <div className="px-2 py-3 text-[12px] text-[var(--color-muted)]">
                {workItemsQuery.isLoading ? '加载中…' : '本域暂无需求；请在产出分析确认 work_item.business_domain 是否已写入'}
              </div>
            ) : reqItems.map((w) => (
              <button
                key={w.id}
                className="flex items-center justify-between gap-2 rounded-[4px] px-2 py-[6px] text-left hover:bg-[#171717]"
                onClick={() => navigate(`/sdd/work-items/${w.id}`)}
              >
                <div className="flex flex-col min-w-0">
                  <span className="truncate text-[12px] text-[var(--color-secondary)]" title={w.workItemTitle ?? w.workItemSlug}>
                    {w.workItemTitle ?? w.workItemSlug}
                  </span>
                  {w.workItemTitle && (
                    <span className="truncate text-[10px] text-[var(--color-muted)]" style={{ fontFamily: 'var(--font-mono)' }}>
                      {w.workItemSlug}
                    </span>
                  )}
                </div>
                <span className="text-right text-[11px] text-[var(--color-muted)] shrink-0" style={{ fontFamily: 'var(--font-mono)' }}>
                  {formatInteger(w.artifactCount)} 文档
                </span>
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
