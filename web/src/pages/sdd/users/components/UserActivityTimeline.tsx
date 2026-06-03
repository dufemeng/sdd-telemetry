import { BookOpen, MessageSquare, Sparkles, Wrench } from 'lucide-react';
import type { ActivityNode } from '../useUserActivity';
import { formatRelativeTime, formatTime, truncate } from '@/lib/format';

export function UserActivityTimeline({
  nodes,
  onOpenInteraction,
}: {
  nodes: ActivityNode[];
  onOpenInteraction: (interactionId: string) => void;
}) {
  if (nodes.length === 0) {
    return (
      <div className="p-4 text-[12px] text-[var(--color-muted)] text-center">
        暂无活动（事件层可能已过期，或该用户尚无 skill_usage / wiki_recall 记录）
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      {nodes.map((node) => {
        const Icon = node.kind === 'skill' ? Sparkles : node.kind === 'wiki' ? BookOpen : node.kind === 'discussion' ? MessageSquare : Wrench;
        const clickable = Boolean(node.interactionId);
        return (
          <div
            key={node.id}
            className={`flex gap-[10px] px-3 py-[8px] ${clickable ? 'cursor-pointer hover:bg-[rgba(255,255,255,0.02)]' : ''}`}
            style={{ borderBottom: '1px solid var(--color-border)' }}
            onClick={() => { if (node.interactionId) onOpenInteraction(node.interactionId); }}
          >
            <div className="flex flex-col items-center pt-[4px]">
              <span className="w-[6px] h-[6px] rounded-full" style={{ background: 'var(--color-border)' }} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2">
                <span className="inline-flex items-center gap-[6px] text-[12px] text-[#f5f5f5] truncate">
                  <Icon size={12} className="text-[var(--color-secondary)]" />
                  <span className="truncate">{node.title}</span>
                </span>
                <span className="text-[10px] text-[var(--color-muted)] whitespace-nowrap" style={{ fontFamily: 'var(--font-mono)' }}>
                  {formatRelativeTime(node.eventTime)}
                </span>
              </div>
              <div className="text-[10px] text-[var(--color-muted)] mt-[2px]" style={{ fontFamily: 'var(--font-mono)' }}>
                {formatTime(node.eventTime)}
                {node.semanticCode ? <> · <span className="text-[var(--color-secondary)]">{node.semanticCode}</span></> : null}
                {node.wikiRelativePath ? <> · wiki</> : null}
                {node.kind === 'write' || node.kind === 'discussion' ? <> · {node.kind === 'discussion' ? '讨论' : '写入'}</> : null}
              </div>
              {node.detail && node.kind !== 'skill' ? (
                <div className="text-[11px] text-[var(--color-secondary)] mt-[4px] whitespace-pre-wrap break-words" style={{ fontFamily: 'var(--font-mono)' }}>
                  {truncate(node.detail, 400)}
                </div>
              ) : null}
            </div>
          </div>
        );
      })}
    </div>
  );
}
