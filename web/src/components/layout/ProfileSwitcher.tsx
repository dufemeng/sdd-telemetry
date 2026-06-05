import { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown, Layers } from 'lucide-react';
import { useProfiles } from '@/pages/profiles/useProfiles';

interface ProfileSwitcherProps {
  profileId: string;
  onProfileChange: (profileId: string) => void;
}

/**
 * 全站 Profile Switcher（Task 18），与时间范围同级。
 * 第一期只有 sdd-default，也保留下拉结构，后续接入 A/B profile 时无需重做。
 */
export function ProfileSwitcher({ profileId, onProfileChange }: ProfileSwitcherProps) {
  const { data: profiles } = useProfiles();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClickOutside(event: MouseEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  const current = profiles?.find((p) => p.profileId === profileId);
  const label = current?.displayName ?? profileId;

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 h-[30px] px-[10px] rounded-[4px] text-[12px] cursor-pointer text-[var(--color-secondary)] hover:text-[var(--color-primary)] transition-colors duration-[120ms]"
        style={{ border: '1px solid var(--color-border)', background: '#171717' }}
        title="切换观测 profile"
      >
        <Layers size={14} />
        <span className="max-w-[160px] truncate">{label}</span>
        <ChevronDown size={14} />
      </button>

      {open && (
        <div
          className="absolute right-0 top-[34px] z-50 min-w-[200px] py-1 rounded-[6px]"
          style={{ border: '1px solid var(--color-border)', background: 'var(--color-panel)' }}
        >
          {(profiles ?? []).map((p) => (
            <button
              key={p.profileId}
              onClick={() => {
                if (p.status === 'disabled') return;
                onProfileChange(p.profileId);
                setOpen(false);
              }}
              disabled={p.status === 'disabled'}
              className="flex items-center justify-between w-full px-3 h-8 text-[12px] border-0 bg-transparent cursor-pointer text-[var(--color-secondary)] hover:bg-[#222] hover:text-[var(--color-primary)] transition-colors duration-[120ms] disabled:cursor-not-allowed disabled:opacity-45"
            >
              <span className="truncate">{p.displayName}{p.status === 'disabled' ? '（未配置）' : ''}</span>
              {p.profileId === profileId && <Check size={14} className="text-emerald-400 shrink-0" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
