import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, BookOpen, MessageSquare, Sparkles, Wrench } from 'lucide-react';
import type { ActivityNode } from '../useUserActivity';
import { formatRelativeTime, formatTime, truncate } from '@/lib/format';

const STAGE_COLORS: Record<string, string> = {
  proposal: 'var(--color-primary)',
  design: '#a78bfa',
  task: '#60a5fa',
  codereview: '#34d399',
};

export function UserActivityTimeline({
  nodes,
  onOpenInteraction,
}: {
  nodes: ActivityNode[];
  onOpenInteraction: (interactionId: string) => void;
}) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  if (nodes.length === 0) {
    return (
      <div className="p-4 text-[12px] text-[var(--color-muted)] text-center">
        暂无活动（事件层可能已过期，或该用户尚无 skill_usage / wiki_recall 记录）
      </div>
    );
  }

  const toggle = (id: string) => {
    const next = new Set(expanded);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setExpanded(next);
  };

  return (
    <div className="flex flex-col">
      {nodes.map((node) => {
        const isOpen = expanded.has(node.id);
        const color = node.kind === 'skill' ? (STAGE_COLORS[node.semanticCode ?? ''] ?? 'var(--color-primary)') : node.kind === 'wiki' ? '#60a5fa' : '#34d399';
        const Icon = node.kind === 'skill' ? Sparkles : node.kind === 'wiki' ? BookOpen : node.kind === 'discussion' ? MessageSquare : Wrench;
        return (
          <div key={node.id} className="flex gap-[10px] px-3 py-[8px]" style={{ borderBottom: '1px solid var(--color-border)' }}>
            <div className="flex flex-col items-center pt-[4px]">
              <span className="w-[8px] h-[8px] rounded-full" style={{ background: color }} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2">
                <button
                  onClick={() => toggle(node.id)}
                  className="inline-flex items-center gap-[6px] text-[12px] text-[#f5f5f5] hover:text-[var(--color-primary)] truncate"
                >
                  <Icon size={12} style={{ color }} />
                  <span className="truncate">{node.title}</span>
                </button>
                <span className="text-[10px] text-[var(--color-muted)] whitespace-nowrap" style={{ fontFamily: 'var(--font-mono)' }}>
                  {formatRelativeTime(node.eventTime)}
                </span>
              </div>
              <div className="text-[10px] text-[var(--color-muted)] mt-[2px]" style={{ fontFamily: 'var(--font-mono)' }}>
                {formatTime(node.eventTime)}
                {node.semanticCode ? <> · <span style={{ color: STAGE_COLORS[node.semanticCode] ?? 'var(--color-secondary)' }}>{node.semanticCode}</span></> : null}
                {node.wikiRelativePath ? <> · wiki</> : null}
              </div>
              {node.detail && isOpen ? (
                <div className="text-[11px] text-[var(--color-secondary)] mt-[4px] whitespace-pre-wrap break-words" style={{ fontFamily: 'var(--font-mono)' }}>
                  {truncate(node.detail, 400)}
                </div>
              ) : null}
              <div className="flex items-center gap-2 mt-[4px]">
                {node.interactionId ? (
                  <button
                    onClick={() => onOpenInteraction(node.interactionId!)}
                    className="inline-flex items-center gap-1 text-[10px] text-[var(--color-primary)] hover:underline"
                  >
                    展开全文 <ArrowRight size={10} />
                  </button>
                ) : null}
                {node.kind === 'wiki' && node.wikiRelativePath ? (
                  <Link
                    to="/sdd/wiki-recalls"
                    className="inline-flex items-center gap-1 text-[10px] text-[#60a5fa] hover:underline"
                  >
                    出链 → 知识库分析
                  </Link>
                ) : null}
                {node.kind === 'skill' ? (
                  <Link
                    to="/sdd/skills"
                    className="inline-flex items-center gap-1 text-[10px] text-[#a78bfa] hover:underline"
                  >
                    出链 → 技能分析
                  </Link>
                ) : null}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
