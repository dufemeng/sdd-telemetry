import { Link } from 'react-router-dom';
import { formatRelativeTime, formatTime } from '@/lib/format';
import type { SddUserWorkItem } from '@sdd-telemetry/api';

const SDD_STAGES = ['proposal', 'design', 'task', 'codereview'] as const;
type SddStage = (typeof SDD_STAGES)[number];

const STAGE_LABELS: Record<SddStage, string> = {
  proposal: '需求撰写',
  design: '系统设计',
  task: '任务拆分',
  codereview: '代码评审',
};

export function UserWorkItemList({
  workItems,
  selectedId,
  onSelect,
}: {
  workItems: SddUserWorkItem[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
}) {
  return (
    <div className="flex flex-col">
      <div
        className="flex items-center justify-between px-3 py-[8px]"
        style={{ borderBottom: '1px solid var(--color-border)' }}
      >
        <span className="text-[12px] font-semibold text-[#f5f5f5]">
          他的需求 <span className="text-[var(--color-muted)] font-normal">（{workItems.length}）</span>
        </span>
        <span className="text-[10px] text-[var(--color-muted)]">点击切换时间线 · ↗ 跳详情</span>
      </div>

      {workItems.length === 0 ? (
        <div className="p-3 text-[12px] text-[var(--color-muted)]">
          暂无关联需求（用户未配置 requirements_root_path 或无 skill_usage 记录）
        </div>
      ) : (
        <ul className="flex flex-col">
          <li
            className="px-3 py-[8px] cursor-pointer hover:bg-[var(--color-hover)] transition-colors"
            style={{ borderBottom: '1px solid var(--color-border)', background: selectedId === null ? 'var(--color-active)' : 'transparent' }}
            onClick={() => onSelect(null)}
          >
            <span className="text-[12px] text-[var(--color-secondary)]">全部活动</span>
          </li>
          {workItems.map((wi) => {
            const isSelected = selectedId === wi.workItemId;
            return (
              <li
                key={wi.workItemId}
                className="px-3 py-[8px] cursor-pointer hover:bg-[var(--color-hover)] transition-colors"
                style={{ borderBottom: '1px solid var(--color-border)', background: isSelected ? 'var(--color-active)' : 'transparent' }}
                onClick={() => onSelect(wi.workItemId)}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[12px] text-[#f5f5f5] truncate flex-1 min-w-0">{wi.title}</span>
                  <Link
                    to={`/sdd/work-items/${wi.workItemId}`}
                    onClick={(e) => e.stopPropagation()}
                    className="text-[var(--color-secondary)] hover:text-[var(--color-primary)] shrink-0"
                    title="跳转产出分析"
                  >
                    ↗
                  </Link>
                </div>
                <div className="flex items-center gap-[6px] mt-[4px]">
                  {SDD_STAGES.map((s) => (
                    <span
                      key={s}
                      title={STAGE_LABELS[s]}
                      className="w-[5px] h-[5px] rounded-full"
                      style={{ background: wi.stageCodes.includes(s) ? 'var(--color-secondary)' : 'var(--color-border)' }}
                    />
                  ))}
                  <span className="text-[10px] text-[var(--color-muted)]" style={{ fontFamily: 'var(--font-mono)' }}>
                    {formatRelativeTime(wi.lastActivityAt)} · {formatTime(wi.lastActivityAt)}
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
