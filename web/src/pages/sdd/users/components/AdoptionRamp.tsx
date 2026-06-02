import type { SddUserMaturityStage } from '@sdd-telemetry/api';

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

function daysFromIso(iso: string | null, baseIso: string | null): number | null {
  if (!iso || !baseIso) return null;
  const ms = new Date(iso).getTime() - new Date(baseIso).getTime();
  if (!Number.isFinite(ms) || ms < 0) return 0;
  return Math.floor(ms / 86_400_000);
}

export function AdoptionRamp({
  stages,
  firstSeenAt,
  rampDays,
}: {
  stages: SddUserMaturityStage[];
  firstSeenAt: string | null;
  rampDays: number | null;
}) {
  const stageMap = new Map(stages.map((s) => [s.stage, s.firstReachedAt]));
  const reachedCount = stages.filter((s) => s.firstReachedAt !== null).length;
  const completionRate = stages.length > 0 ? reachedCount / stages.length : 0;

  return (
    <section className="flex flex-col gap-[8px] p-[12px] rounded-[6px]" style={{ background: 'var(--color-hover)', border: '1px solid var(--color-border)' }}>
      <div className="flex items-center justify-between">
        <span className="text-[12px] font-semibold text-[#f5f5f5]">采用爬坡</span>
        <span className="text-[11px] text-[var(--color-secondary)]" style={{ fontFamily: 'var(--font-mono)' }}>
          {reachedCount}/{stages.length} · 通链 {rampDays !== null ? `${rampDays} 天` : '—'}
        </span>
      </div>
      <div className="grid grid-cols-4 gap-[6px]">
        {SDD_STAGES.map((stage) => {
          const reachedAt = stageMap.get(stage) ?? null;
          const dayOffset = daysFromIso(reachedAt, firstSeenAt);
          const reached = reachedAt !== null;
          return (
            <div
              key={stage}
              className="rounded-[4px] px-[8px] py-[6px]"
              style={{
                background: 'var(--color-surface)',
                border: `1px solid ${reached ? STAGE_COLORS[stage] : 'var(--color-border)'}`,
                opacity: reached ? 1 : 0.55,
              }}
            >
              <div className="flex items-center gap-[5px] mb-[3px]">
                <span className="w-[5px] h-[5px] rounded-full" style={{ background: STAGE_COLORS[stage] }} />
                <span className="text-[10px] text-[var(--color-secondary)]">{STAGE_LABELS[stage]}</span>
              </div>
              <div className="text-[12px] font-semibold" style={{ color: reached ? '#f5f5f5' : 'var(--color-muted)', fontFamily: 'var(--font-mono)' }}>
                {reached ? `D${dayOffset}` : '—'}
              </div>
              {reached ? (
                <div className="text-[10px] text-[var(--color-muted)] mt-[2px]">
                  {new Date(reachedAt).toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' })}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
      <div className="h-[3px] w-full rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.06)' }}>
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${completionRate * 100}%`, background: 'var(--color-primary)' }}
        />
      </div>
    </section>
  );
}
