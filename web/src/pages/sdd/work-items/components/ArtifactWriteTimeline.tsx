import { useState, useMemo } from 'react';
import type { ProfileArtifactTimelineItem } from '@sdd-telemetry/api';
import { BookOpen, ChevronDown, ChevronRight, GitCommit, MessageSquare } from 'lucide-react';
import { formatTime } from '@/lib/format';

const CARD_STYLE = { border: '1px solid var(--color-border)', background: 'var(--color-surface)' };

type TimelineItem = ProfileArtifactTimelineItem & { originalIndex: number };

interface WriteGroup {
  key: string;
  type: 'discussion' | 'group' | 'orphan';
  discussionItem?: TimelineItem;
  items: TimelineItem[];
  promptPreview: string | null;
  interactionId: string | null;
}

function extractFilePath(contentPreview: string | null): string | null {
  if (!contentPreview) return null;
  try {
    const obj = JSON.parse(contentPreview);
    return obj.file_path ?? obj.filePath ?? null;
  } catch {
    return null;
  }
}

function extractChangeSummary(contentPreview: string | null): string | null {
  if (!contentPreview) return null;
  try {
    const obj = JSON.parse(contentPreview);
    const hasOld = typeof obj.old_string === 'string';
    const hasNew = typeof obj.new_string === 'string';
    if (hasOld && hasNew) {
      return `替换 ${obj.old_string.length} → ${obj.new_string.length} 字符`;
    }
    if (hasNew) {
      return `插入 ${obj.new_string.length} 字符`;
    }
    if (typeof obj.content === 'string') {
      return `写入 ${obj.content.length} 字符`;
    }
    return null;
  } catch {
    return null;
  }
}

function groupTimelineItems(items: TimelineItem[]): WriteGroup[] {
  const groups: WriteGroup[] = [];
  const interactionMap = new Map<string, TimelineItem[]>();
  const discussionIndices = new Set<number>();

  items.forEach((item) => {
    if (item.nodeKind === 'discussion') {
      discussionIndices.add(item.originalIndex);
      return;
    }
    if (item.interactionId) {
      if (!interactionMap.has(item.interactionId)) {
        interactionMap.set(item.interactionId, []);
      }
      interactionMap.get(item.interactionId)!.push(item);
    }
  });

  const groupedInteractionIds = new Set<string>();
  let orphanIndex = 0;
  const orphanItems = items.filter(
    (item) => item.nodeKind === 'write' && !item.interactionId,
  );
  const orphanQueue = [...orphanItems];

  items.forEach((item) => {
    if (item.nodeKind === 'discussion') {
      groups.push({
        key: `discussion-${item.id}`,
        type: 'discussion',
        discussionItem: item,
        items: [],
        promptPreview: item.promptPreview,
        interactionId: item.interactionId,
      });
      return;
    }

    if (item.interactionId) {
      if (groupedInteractionIds.has(item.interactionId)) return;
      groupedInteractionIds.add(item.interactionId);

      const groupItems = interactionMap.get(item.interactionId)!;
      const firstItem = groupItems[0]!;
      groups.push({
        key: `group-${item.interactionId}`,
        type: 'group',
        items: groupItems,
        promptPreview: firstItem.promptPreview,
        interactionId: item.interactionId,
      });
      return;
    }

    if (orphanQueue[orphanIndex] === item) {
      groups.push({
        key: `orphan-${item.id}`,
        type: 'orphan',
        items: [item],
        promptPreview: item.promptPreview,
        interactionId: null,
      });
      orphanIndex++;
    }
  });

  return groups;
}

export function ArtifactWriteTimeline({
  writes,
  isLoading,
  onOpenTurn,
}: {
  writes: ProfileArtifactTimelineItem[];
  isLoading: boolean;
  onOpenTurn: (interactionId: string) => void;
}) {
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

  const itemsWithIndex = useMemo(
    () => writes.map((w, i) => ({ ...w, originalIndex: i })),
    [writes],
  );

  const writeCount = writes.filter((w) => w.nodeKind === 'write').length;
  const groups = useMemo(() => groupTimelineItems(itemsWithIndex), [itemsWithIndex]);

  const toggleGroup = (key: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  return (
    <section className="rounded-[6px] overflow-hidden" style={CARD_STYLE}>
      <div
        className="flex items-center gap-2 px-[14px] py-3"
        style={{ borderBottom: '1px solid var(--color-border)', color: 'var(--color-primary)' }}
      >
        <GitCommit size={16} />
        <h3 className="text-[13px] font-semibold text-[#f5f5f5]">生成时间线</h3>
        <span className="text-[11px] text-[var(--color-muted)]">
          · {groups.length} 个节点（{writeCount} 次写入）
        </span>
      </div>

      {isLoading ? (
        <div className="px-[14px] py-6 text-[12px] text-[var(--color-muted)]">正在加载时间线…</div>
      ) : writes.length === 0 ? (
        <div className="px-[14px] py-6 text-[12px] text-[var(--color-muted)]">
          暂无记录（event 层约 30 天内的写入与对话才会出现；更早的需求请见 summary）
        </div>
      ) : (
        <div className="grid">
          {groups.map((group) =>
            group.type === 'discussion' ? (
              <DiscussionCard key={group.key} item={group.discussionItem ?? group.items[0]!} onOpenTurn={onOpenTurn} />
            ) : group.type === 'orphan' ? (
              <OrphanCard key={group.key} item={group.items[0]!} onOpenTurn={onOpenTurn} />
            ) : (
              <WriteGroupCard
                key={group.key}
                group={group}
                expanded={expandedGroups.has(group.key)}
                onToggle={() => toggleGroup(group.key)}
                onOpenTurn={onOpenTurn}
              />
            ),
          )}
        </div>
      )}
    </section>
  );
}

function DiscussionCard({
  item,
  onOpenTurn,
}: {
  item: TimelineItem;
  onOpenTurn: (interactionId: string) => void;
}) {
  return (
    <div
      className="flex flex-col gap-[6px] px-[14px] py-[12px]"
      style={{ borderBottom: '1px solid var(--color-border)' }}
    >
      <div className="flex items-center gap-2 text-[11px]">
        <span className="text-[var(--color-muted)]" style={{ fontFamily: 'var(--font-mono)' }}>
          {formatTime(item.eventTime)}
        </span>
        <span
          className="inline-flex items-center gap-1 px-[6px] py-[1px] rounded-[3px] text-[10px] text-[var(--color-muted)]"
          style={{ background: 'rgba(255,255,255,0.04)' }}
        >
          <MessageSquare size={10} /> 讨论
        </span>
        <span className="text-[var(--color-secondary)]">
          {item.capabilityDisplayName ?? item.rawCapabilityName ?? '无 skill'}
        </span>
        <span className="inline-flex items-center gap-1 text-[var(--color-muted)]">
          <BookOpen size={11} /> wiki×{item.knowledgeRecallCount}
        </span>
      </div>
      {item.promptPreview ? (
        <p
          className="text-[12px] text-[var(--color-text)] overflow-hidden"
          style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}
        >
          {item.promptPreview}
        </p>
      ) : (
        <p className="text-[12px] text-[var(--color-muted)]">（无 prompt 文本）</p>
      )}
      {item.interactionId ? (
        <button
          onClick={() => onOpenTurn(item.interactionId!)}
          className="self-start text-[11px] px-[8px] py-[3px] rounded-[4px]"
          style={{
            color: 'var(--color-primary)',
            border: '1px solid rgba(250,255,105,0.22)',
            background: 'rgba(250,255,105,0.06)',
          }}
        >
          展开全文
        </button>
      ) : (
        <span className="self-start text-[11px] text-[var(--color-muted)]">无可回溯的交互</span>
      )}
    </div>
  );
}

function OrphanCard({
  item,
  onOpenTurn,
}: {
  item: TimelineItem;
  onOpenTurn: (interactionId: string) => void;
}) {
  const filePath = extractFilePath(item.contentPreview);
  const changeSummary = extractChangeSummary(item.contentPreview);

  return (
    <div
      className="flex flex-col gap-[6px] px-[14px] py-[12px]"
      style={{ borderBottom: '1px solid var(--color-border)' }}
    >
      <div className="flex items-center gap-2 text-[11px]">
        <span className="text-[var(--color-muted)]" style={{ fontFamily: 'var(--font-mono)' }}>
          {formatTime(item.eventTime)}
        </span>
        <span
          className="px-[6px] py-[1px] rounded-[3px] text-[10px]"
          style={{ color: 'var(--color-secondary)', background: 'rgba(255,255,255,0.06)' }}
        >
          {item.writeKind}
        </span>
        <span className="text-[var(--color-secondary)]">
          {item.capabilityDisplayName ?? item.rawCapabilityName ?? '无 skill'}
        </span>
        <span className="inline-flex items-center gap-1 text-[var(--color-muted)]">
          <BookOpen size={11} /> wiki×{item.knowledgeRecallCount}
        </span>
      </div>
      {item.promptPreview ? (
        <p
          className="text-[12px] text-[var(--color-text)] overflow-hidden"
          style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}
        >
          {item.promptPreview}
        </p>
      ) : (
        <p className="text-[12px] text-[var(--color-muted)]">（无 prompt 文本）</p>
      )}
      {filePath && (
        <p className="text-[11px] text-[var(--color-muted)] truncate" style={{ fontFamily: 'var(--font-mono)' }}>
          {filePath}
          {changeSummary ? ` · ${changeSummary}` : ''}
        </p>
      )}
      {item.interactionId ? (
        <button
          onClick={() => onOpenTurn(item.interactionId!)}
          className="self-start text-[11px] px-[8px] py-[3px] rounded-[4px]"
          style={{
            color: 'var(--color-primary)',
            border: '1px solid rgba(250,255,105,0.22)',
            background: 'rgba(250,255,105,0.06)',
          }}
        >
          展开全文
        </button>
      ) : (
        <span className="self-start text-[11px] text-[var(--color-muted)]">无可回溯的交互</span>
      )}
    </div>
  );
}

function WriteGroupCard({
  group,
  expanded,
  onToggle,
  onOpenTurn,
}: {
  group: WriteGroup;
  expanded: boolean;
  onToggle: () => void;
  onOpenTurn: (interactionId: string) => void;
}) {
  const first = group.items[0];
  if (!first) return null;
  const filePath = extractFilePath(first.contentPreview);
  const changeSummary = extractChangeSummary(first.contentPreview);

  return (
    <div style={{ borderBottom: '1px solid var(--color-border)' }}>
      <div className="flex flex-col gap-[6px] px-[14px] py-[12px]">
        <div className="flex items-center gap-2 text-[11px]">
          <button
            onClick={onToggle}
            className="inline-flex items-center gap-1 text-[var(--color-secondary)] hover:text-[var(--color-primary)]"
          >
            {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
            <span className="text-[10px] px-[4px] py-[1px] rounded-[3px]" style={{ background: 'rgba(255,255,255,0.06)' }}>
              {group.items.length} 次写入
            </span>
          </button>
          <span className="text-[var(--color-muted)]" style={{ fontFamily: 'var(--font-mono)' }}>
            {formatTime(first.eventTime)}
          </span>
          <span className="text-[var(--color-secondary)]">
            {first.capabilityDisplayName ?? first.rawCapabilityName ?? '无 skill'}
          </span>
          <span className="inline-flex items-center gap-1 text-[var(--color-muted)]">
            <BookOpen size={11} /> wiki×{first.knowledgeRecallCount}
          </span>
        </div>
        {group.promptPreview ? (
          <p
            className="text-[12px] text-[var(--color-text)] overflow-hidden"
            style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}
          >
            {group.promptPreview}
          </p>
        ) : (
          <p className="text-[12px] text-[var(--color-muted)]">（无 prompt 文本）</p>
        )}
        {filePath && (
          <p className="text-[11px] text-[var(--color-muted)] truncate" style={{ fontFamily: 'var(--font-mono)' }}>
            {filePath}
            {changeSummary ? ` · ${changeSummary}` : ''}
          </p>
        )}
        {group.interactionId ? (
          <button
            onClick={() => onOpenTurn(group.interactionId!)}
            className="self-start text-[11px] px-[8px] py-[3px] rounded-[4px]"
            style={{
              color: 'var(--color-primary)',
              border: '1px solid rgba(250,255,105,0.22)',
              background: 'rgba(250,255,105,0.06)',
            }}
          >
            展开全文
          </button>
        ) : (
          <span className="self-start text-[11px] text-[var(--color-muted)]">无可回溯的交互</span>
        )}
      </div>

      {expanded && (
        <div className="pb-[10px]">
          {group.items.map((w) => {
            const wFilePath = extractFilePath(w.contentPreview);
            const wChangeSummary = extractChangeSummary(w.contentPreview);
            return (
              <div
                key={w.id}
                className="flex items-center gap-2 px-[14px] py-[6px] text-[11px]"
                style={{ background: 'rgba(255,255,255,0.015)' }}
              >
                <span
                  className="px-[5px] py-[1px] rounded-[3px] text-[10px]"
                  style={{ color: 'var(--color-secondary)', background: 'rgba(255,255,255,0.06)' }}
                >
                  {w.writeKind}
                </span>
                {wFilePath ? (
                  <span
                    className="text-[var(--color-muted)] truncate max-w-[260px]"
                    style={{ fontFamily: 'var(--font-mono)' }}
                  >
                    {wFilePath}
                  </span>
                ) : (
                  <span className="text-[var(--color-muted)]">（无路径信息）</span>
                )}
                {wChangeSummary && <span className="text-[var(--color-muted)]">· {wChangeSummary}</span>}
                <span className="text-[var(--color-muted)]" style={{ fontFamily: 'var(--font-mono)' }}>
                  {formatTime(w.eventTime)}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
