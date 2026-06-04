import { formatRelativeTime, formatTime } from '@/lib/format';
import type { ProfileUserDeliveryUnit } from '@sdd-telemetry/api';

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
  workItems: ProfileUserDeliveryUnit[];
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
      </div>

      {workItems.length === 0 ? (
        <div className="p-3 text-[12px] text-[var(--color-muted)]">
          暂无关联需求
        </div>
      ) : (
        <ul className="flex flex-col">
          {workItems.map((wi) => {
            const isSelected = selectedId === wi.deliveryUnitId;
            return (
              <li
                key={wi.deliveryUnitId}
                className="px-3 py-[8px] cursor-pointer hover:bg-[var(--color-hover)] transition-colors"
                style={{ borderBottom: '1px solid var(--color-border)', background: isSelected ? 'var(--color-active)' : 'transparent' }}
                onClick={() => onSelect(isSelected ? null : wi.deliveryUnitId)}
              >
                <span className="text-[12px] text-[#f5f5f5] truncate">{wi.title}</span>
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
