import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'motion/react';
import { BookOpen, Copy, X } from 'lucide-react';
import type { SddWikiRecallContent } from '@sdd-telemetry/api';
import { MarkdownView } from './MarkdownView';
import { useWikiRecallContent } from './useWikiRecallContent';

const REASON_HINT: Record<Exclude<SddWikiRecallContent['reason'], 'ok'>, string> = {
  recall_not_found: '未找到该召回记录。',
  not_readable_action: '这是目录浏览 / 检索操作，没有单一文件内容可展示。',
  not_configured: '服务器未配置知识库目录（KNOWLEDGE_BASE_ROOT）。',
  repo_missing: '服务器上未找到该知识库仓库（未 clone）。',
  file_missing: '该文档不在服务器知识库中。',
  not_a_file: '该路径不是一个文件。',
};

export function WikiDocModal({
  toolCallId,
  open,
  onOpenChange,
}: {
  toolCallId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const query = useWikiRecallContent(open ? toolCallId : null);
  const data = query.data;

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onOpenChange(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onOpenChange]);

  if (typeof document === 'undefined') return null;

  return createPortal(
    <AnimatePresence>
      {open ? (
        <motion.div
          key="wiki-doc-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.16 }}
          onClick={() => onOpenChange(false)}
          className="z-[60] grid place-items-center backdrop-blur-sm"
          style={{ position: 'fixed', inset: 0, background: 'rgba(0 0 0 / 0.62)' }}
        >
          <motion.div
            key="wiki-doc-panel"
            initial={{ opacity: 0, scale: 0.97, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: 8 }}
            transition={{ type: 'spring', stiffness: 260, damping: 26 }}
            onClick={(e) => e.stopPropagation()}
            className="flex max-h-[80vh] w-[min(760px,calc(100vw-80px))] flex-col rounded-[8px] shadow-2xl"
            style={{ background: 'var(--color-panel)', border: '1px solid var(--color-border)' }}
            role="dialog"
            aria-modal="true"
          >
            <Header data={data} onCopy={copyText} onClose={() => onOpenChange(false)} />
            <div className="flex-1 overflow-y-auto p-4" style={{ background: 'var(--color-surface)' }}>
              {query.isLoading ? (
                <div className="text-[12px] text-[var(--color-muted)]">正在加载文档…</div>
              ) : query.error ? (
                <div className="text-[12px] text-[var(--color-bad-text)]">
                  加载失败：{query.error instanceof Error ? query.error.message : '未知错误'}
                </div>
              ) : data && data.found && data.content != null ? (
                data.isMarkdown ? (
                  <MarkdownView content={data.content} />
                ) : (
                  <pre className="whitespace-pre-wrap break-words text-[12px] leading-5 text-[var(--color-secondary)]" style={{ fontFamily: 'var(--font-mono)' }}>
                    {data.content}
                  </pre>
                )
              ) : data ? (
                <Degraded data={data} />
              ) : null}
              {data?.truncated ? (
                <div className="mt-3 text-[11px] text-[var(--color-muted)]">（文档较大，已截断显示）</div>
              ) : null}
            </div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>,
    document.body,
  );
}

function Header({
  data,
  onCopy,
  onClose,
}: {
  data: SddWikiRecallContent | undefined;
  onCopy: (v: string) => void;
  onClose: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3 p-4" style={{ borderBottom: '1px solid var(--color-border)' }}>
      <div className="flex min-w-0 items-center gap-2">
        <BookOpen size={16} className="text-[var(--color-primary)]" />
        <div className="min-w-0">
          <div className="truncate text-[13px] font-semibold text-[#f5f5f5]">
            {data?.repoName ?? '知识库文档'}
          </div>
          <div className="truncate text-[11px] text-[var(--color-muted)]" style={{ fontFamily: 'var(--font-mono)' }}>
            {data?.relativePath ?? data?.rawPath ?? ''}
          </div>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        {data?.rawPath ? (
          <button
            type="button"
            title="复制原始路径"
            onClick={() => onCopy(data.rawPath ?? '')}
            className="grid h-8 w-8 place-items-center rounded-[4px] text-[var(--color-muted)] hover:bg-[#222] hover:text-[#f5f5f5]"
          >
            <Copy size={15} />
          </button>
        ) : null}
        <button
          type="button"
          title="关闭"
          onClick={onClose}
          className="grid h-8 w-8 place-items-center rounded-[4px] text-[var(--color-muted)] hover:bg-[#222] hover:text-[#f5f5f5]"
        >
          <X size={18} />
        </button>
      </div>
    </div>
  );
}

function Degraded({ data }: { data: SddWikiRecallContent }) {
  const hint = data.reason === 'ok' ? '' : REASON_HINT[data.reason];
  return (
    <div className="space-y-2 text-[12px]">
      <div className="text-[var(--color-muted)]">{hint}</div>
      {data.rawPath ? (
        <div className="text-[var(--color-muted)]">
          原始路径：<span style={{ fontFamily: 'var(--font-mono)' }}>{data.rawPath}</span>
        </div>
      ) : null}
    </div>
  );
}

function copyText(value: string): void {
  if (!value) return;
  void navigator.clipboard?.writeText(value);
}
