import type { SddUserMaturityStage } from '@sdd-telemetry/api';

const SDD_STAGES = ['proposal', 'design', 'task', 'codereview'] as const;
type SddStage = (typeof SDD_STAGES)[number];

const STAGE_LABELS: Record<SddStage, string> = {
  proposal: '需求撰写',
  design: '系统设计',
  task: '任务拆分',
  codereview: '代码评审',
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
  const activeStageIndex = SDD_STAGES.reduce(
    (acc, s, i) => ((stageMap.get(s) ?? null) !== null ? i : acc),
    -1,
  );
  const isComplete = reachedCount === SDD_STAGES.length;
  const completedRail = 'var(--color-secondary)';
  const emptyRail = 'var(--color-border)';

  return (
    <section
      className="p-[12px] rounded-[6px]"
      style={{ background: 'var(--color-hover)', border: '1px solid var(--color-border)' }}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-[10px]">
        <span className="text-[12px] font-semibold text-[#f5f5f5]">上手进度</span>
        <span className="text-[11px] text-[var(--color-secondary)]" style={{ fontFamily: 'var(--font-mono)' }}>
          {reachedCount}/{SDD_STAGES.length}
          {isComplete && rampDays !== null
            ? ` · 走通全流程 ${rampDays} 天`
            : !isComplete
              ? ' · 尚未走通全流程'
              : ''}
        </span>
      </div>

      {/* Signal rail */}
      <div
        className="flex items-start"
        style={{ gap: 0 }}
      >
        {SDD_STAGES.map((stage, i) => {
          const reachedAt = stageMap.get(stage) ?? null;
          const dayOffset = daysFromIso(reachedAt, firstSeenAt);
          const reached = reachedAt !== null;
          const isLast = i === SDD_STAGES.length - 1;

          const isActive = i === activeStageIndex;
          const nodeColor = isActive
            ? 'var(--color-primary)'
            : reached
              ? 'var(--color-secondary)'
              : 'var(--color-border)';
          const nodeSize = 8;
          const railH = 2;

          return (
            <div
              key={stage}
              className="flex-1"
              style={{ minWidth: 0 }}
            >
              {/* Rail + Node row */}
              <div className="flex items-center" style={{ height: nodeSize }}>
                {/* Rail segment before node (except first) */}
                {i > 0 && (
                  <div
                    className="flex-1"
                    style={{
                      height: railH,
                      background: SDD_STAGES.slice(0, i).every(
                        (ps) => (stageMap.get(ps) ?? null) !== null,
                      )
                        ? completedRail
                        : emptyRail,
                      transition: 'background 0.2s',
                    }}
                  />
                )}
                {/* Node dot */}
                <div
                  className="rounded-full flex-none"
                  style={{
                    width: nodeSize,
                    height: nodeSize,
                    background: nodeColor,
                    transition: 'background 0.2s',
                  }}
                />
                {/* Rail segment after node (except last) */}
                {!isLast && (
                  <div
                    className="flex-1"
                    style={{
                      height: railH,
                      background: SDD_STAGES.slice(0, i + 1).every(
                        (ps) => (stageMap.get(ps) ?? null) !== null,
                      )
                        ? completedRail
                        : emptyRail,
                      transition: 'background 0.2s',
                    }}
                  />
                )}
              </div>

              {/* Labels below */}
              <div className="mt-[5px]" style={{ paddingLeft: i > 0 ? 4 : 0, paddingRight: isLast ? 0 : 4 }}>
                <div
                  className="text-[11px] whitespace-nowrap"
                  style={{
                    color: reached ? 'var(--color-secondary)' : 'var(--color-muted)',
                    fontFamily: 'var(--font-mono)',
                  }}
                >
                  {reached ? `D${dayOffset}` : '—'}
                </div>
                <div
                  className="text-[10px] whitespace-nowrap mt-[1px]"
                  style={{ color: reached ? 'var(--color-secondary)' : 'var(--color-muted)' }}
                >
                  {STAGE_LABELS[stage]}
                </div>
                {reached ? (
                  <div className="text-[9px] text-[var(--color-muted)] mt-[1px]" style={{ fontFamily: 'var(--font-mono)' }}>
                    {new Date(reachedAt).toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' })}
                  </div>
                ) : (
                  <div className="text-[9px] text-[var(--color-muted)] mt-[1px]">未到达</div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
