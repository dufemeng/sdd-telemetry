import { useUserSkillUsages } from '../useUserSkillUsages';

export function SkillUsageChart({ userId, enabled = true }: { userId: string; enabled?: boolean }) {
  const query = useUserSkillUsages(userId, 500, enabled);
  const data = query.data ?? [];

  const countMap = new Map<string, number>();
  for (const item of data) {
    if (item.rawSkillName?.startsWith('bk-fe-')) {
      countMap.set(item.rawSkillName, (countMap.get(item.rawSkillName) ?? 0) + 1);
    }
  }

  const entries = Array.from(countMap.entries()).sort((a, b) => b[1] - a[1]);
  const total = entries.reduce((s, [, c]) => s + c, 0);
  const max = entries[0]?.[1] ?? 1;

  return (
    <section
      className="p-[12px] rounded-[6px]"
      style={{ background: 'var(--color-hover)', border: '1px solid var(--color-border)' }}
    >
      <div className="flex items-center justify-between mb-[10px]">
        <span className="text-[12px] font-semibold text-[#f5f5f5]">skill 调用</span>
        <span className="text-[11px] text-[var(--color-secondary)]" style={{ fontFamily: 'var(--font-mono)' }}>
          bk-fe-* 共 {total} 次
        </span>
      </div>
      {entries.length === 0 ? (
        <div className="text-[11px] text-[var(--color-muted)]">暂无 bk-fe-* skill 调用记录</div>
      ) : (
        <div className="flex flex-col gap-[7px]">
          {entries.map(([skill, count]) => (
            <div key={skill} className="grid items-center gap-3" style={{ gridTemplateColumns: '100px 1fr 36px' }}>
              <span className="text-[11px] text-[var(--color-secondary)] truncate" title={skill}>
                {skill.replace('bk-fe-', '')}
              </span>
              <div className="h-[8px] rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.06)' }}>
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{ width: `${(count / max) * 100}%`, background: 'var(--color-primary)' }}
                />
              </div>
              <span className="text-[11px] text-[#f5f5f5] text-right" style={{ fontFamily: 'var(--font-mono)' }}>
                {count}
              </span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
