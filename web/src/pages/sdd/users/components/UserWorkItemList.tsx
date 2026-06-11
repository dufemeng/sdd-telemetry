import { formatRelativeTime, formatTime } from '@/lib/format';
import type { ProfileStageDescriptor, ProfileUserDeliveryUnit } from '@sdd-telemetry/api';

export function UserWorkItemList({
  workItems,
  selectedId,
  onSelect,
  stages,
}: {
  workItems: ProfileUserDeliveryUnit[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  stages: ProfileStageDescriptor[];
}) {
  return (
    <div className="flex flex-col">
      <div
        className="flex items-center justify-between px-3 py-[8px]"
        style={{ borderBottom: '1px solid var(--color-border)' }}
      >
        <span className="text-[12px] font-semibold text-[#f5f5f5]">
          关联交付单元 <span className="text-[var(--color-muted)] font-normal">（{workItems.length}）</span>
        </span>
      </div>

      {workItems.length === 0 ? (
        <div className="p-3 text-[12px] text-[var(--color-muted)]">
          暂无关联交付单元
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
                  {stages.length > 0 ? (
                    stages.map((stage) => (
                      <span
                        key={stage.code}
                        title={stage.label}
                        className="w-[5px] h-[5px] rounded-full"
                        style={{ background: wi.stageCodes.includes(stage.code) ? 'var(--color-secondary)' : 'var(--color-border)' }}
                      />
                    ))
                  ) : null}
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
