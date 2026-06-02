import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
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

const STAGE_COLORS: Record<SddStage, string> = {
  proposal: 'var(--color-primary)',
  design: '#a78bfa',
  task: '#60a5fa',
  codereview: '#34d399',
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
  if (workItems.length === 0) {
    return (
      <div className="p-3 text-[12px] text-[var(--color-muted)]">
        暂无关联需求（用户未配置 requirements_root_path 或无 skill_usage 记录）
      </div>
    );
  }
  return (
    <ul className="flex flex-col" style={{ borderTop: '1px solid var(--color-border)' }}>
      <li className="px-3 py-[6px] text-[11px] text-[var(--color-muted)]" style={{ borderBottom: '1px solid var(--color-border)' }}>
        他的需求（{workItems.length}）· 行点击出链产出分析
      </li>
      <li
        className="px-3 py-[8px] cursor-pointer hover:bg-[#171717] transition-colors"
        style={{ borderBottom: '1px solid var(--color-border)', background: selectedId === null ? 'rgba(250,255,105,0.06)' : 'transparent' }}
        onClick={() => onSelect(null)}
      >
        <span className="text-[12px] text-[var(--color-secondary)]">全部活动</span>
      </li>
      {workItems.map((wi) => {
        const isSelected = selectedId === wi.workItemId;
        return (
          <li
            key={wi.workItemId}
            className="px-3 py-[8px] cursor-pointer hover:bg-[#171717] transition-colors"
            style={{ borderBottom: '1px solid var(--color-border)', background: isSelected ? 'rgba(250,255,105,0.06)' : 'transparent' }}
            onClick={() => onSelect(wi.workItemId)}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-[12px] text-[#f5f5f5] truncate flex-1 min-w-0">{wi.title}</span>
              <Link
                to={`/sdd/work-items/${wi.workItemId}`}
                onClick={(e) => e.stopPropagation()}
                className="text-[var(--color-primary)] hover:brightness-125 shrink-0"
                title="出链 → 产出分析"
              >
                <ArrowRight size={12} />
              </Link>
            </div>
            <div className="flex items-center gap-[6px] mt-[4px]">
              {SDD_STAGES.map((s) => (
                <span
                  key={s}
                  title={STAGE_LABELS[s]}
                  className="w-[5px] h-[5px] rounded-full"
                  style={{ background: wi.stageCodes.includes(s) ? STAGE_COLORS[s] : 'rgba(255,255,255,0.10)' }}
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
  );
}
