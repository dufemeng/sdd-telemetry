import { BookOpen, Code2, FilePen, MessageSquare, Sparkles } from 'lucide-react';
import type { ProfileUserActivityItem } from '@sdd-telemetry/api';
import { formatRelativeTime, formatTime, truncate } from '@/lib/format';

const COUNT_CHIPS: Array<{
  key: keyof NonNullable<ProfileUserActivityItem['activityCounts']>;
  label: string;
}> = [
  { key: 'capability', label: '能力' },
  { key: 'knowledge', label: '知识' },
  { key: 'code', label: '代码' },
  { key: 'artifactWrite', label: '写入' },
  { key: 'artifactDiscussion', label: '讨论' },
];

export function UserActivityTimeline({
  nodes,
  onOpenInteraction,
}: {
  nodes: ProfileUserActivityItem[];
  onOpenInteraction: (interactionId: string) => void;
}) {
  if (nodes.length === 0) {
    return (
      <div className="p-4 text-[12px] text-[var(--color-muted)] text-center">
        暂无活动
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      {nodes.map((node) => {
        const Icon =
          node.kind === 'capability' ? Sparkles :
          node.kind === 'knowledge' ? BookOpen :
          node.kind === 'code' ? Code2 :
          node.kind === 'artifact_discussion' ? MessageSquare :
          FilePen;
        const clickable = Boolean(node.interactionId);
        const detail = node.detail ?? node.locator;
        const counts = node.activityCounts;
        const countChips = counts
          ? COUNT_CHIPS
              .map(({ key, label }) => ({ label, value: counts[key] }))
              .filter(({ value }) => value > 0)
          : [];
        return (
          <button
            type="button"
            key={node.id}
            disabled={!clickable}
            className={`group flex w-full gap-[10px] px-3 py-[10px] text-left ${clickable ? 'cursor-pointer hover:bg-[rgba(250,255,105,0.035)]' : 'cursor-default'}`}
            style={{
              borderBottom: '1px solid var(--color-border)',
              background: 'transparent',
              color: 'inherit',
              font: 'inherit',
            }}
            onClick={() => { if (node.interactionId) onOpenInteraction(node.interactionId); }}
          >
            <div className="flex flex-col items-center pt-[3px]">
              <span
                className="inline-flex h-[18px] w-[18px] items-center justify-center rounded-[4px] border"
                style={{
                  borderColor: 'var(--color-border)',
                  background: 'rgba(255,255,255,0.018)',
                  color: 'var(--color-secondary)',
                }}
              >
                <Icon size={12} />
              </span>
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-start justify-between gap-3">
                <span
                  className="text-[12px] leading-[18px] text-[#f5f5f5]"
                  style={{
                    display: '-webkit-box',
                    WebkitLineClamp: 3,
                    WebkitBoxOrient: 'vertical',
                    overflow: 'hidden',
                    wordBreak: 'break-word',
                  }}
                >
                  {node.title}
                </span>
                <span className="text-[10px] text-[var(--color-muted)] whitespace-nowrap pt-[1px]" style={{ fontFamily: 'var(--font-mono)' }}>
                  {formatRelativeTime(node.eventTime)}
                </span>
              </div>
              <div className="mt-[6px] flex flex-wrap items-center gap-[5px]">
                {countChips.length > 0 ? countChips.map(({ label, value }) => (
                  <span
                    key={label}
                    className="inline-flex h-[18px] items-center rounded-[4px] border px-[6px] text-[10px]"
                    style={{
                      borderColor: 'var(--color-border)',
                      color: 'var(--color-secondary)',
                      background: 'rgba(255,255,255,0.018)',
                    }}
                  >
                    {label} {value}
                  </span>
                )) : (
                  <span
                    className="inline-flex h-[18px] items-center rounded-[4px] border px-[6px] text-[10px]"
                    style={{
                      borderColor: 'var(--color-border)',
                      color: 'var(--color-secondary)',
                      background: 'rgba(255,255,255,0.018)',
                    }}
                  >
                    {node.kind === 'knowledge' ? '知识' :
                      node.kind === 'code' ? '代码' :
                      node.kind === 'artifact_discussion' ? '讨论' :
                      node.kind === 'artifact_write' ? '写入' :
                      '能力'}
                  </span>
                )}
                <span className="text-[10px] text-[var(--color-muted)]" style={{ fontFamily: 'var(--font-mono)' }}>
                  {formatTime(node.eventTime)}
                </span>
                {node.capabilityCode ? (
                  <span className="text-[10px] text-[var(--color-muted)]" style={{ fontFamily: 'var(--font-mono)' }}>
                    {node.capabilityCode}
                  </span>
                ) : null}
              </div>
              {detail && node.kind !== 'capability' ? (
                <div
                  className="mt-[6px] border-l pl-[8px] text-[10px] leading-[16px] text-[var(--color-muted)] whitespace-pre-wrap break-words"
                  style={{
                    borderColor: 'var(--color-border)',
                    fontFamily: 'var(--font-mono)',
                    display: '-webkit-box',
                    WebkitLineClamp: 4,
                    WebkitBoxOrient: 'vertical',
                    overflow: 'hidden',
                  }}
                >
                  {truncate(detail, 400)}
                </div>
              ) : null}
            </div>
          </button>
        );
      })}
    </div>
  );
}
