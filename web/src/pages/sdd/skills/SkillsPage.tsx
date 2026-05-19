import { useShellContext } from '@/components/layout/useShellContext';
import { HeroKpiRow } from './HeroKpiRow';
import { TrendsSection } from './TrendsSection';
import { StructureHealthSection } from './StructureHealthSection';
import { DetailTableSection } from './DetailTableSection';

export default function SkillsPage() {
  const { timeRange } = useShellContext();

  return (
    <div className="grid gap-3">
      <div className="flex items-end justify-between gap-3 pb-2" style={{ borderBottom: '1px solid var(--color-border)' }}>
        <div>
          <h2 className="text-[28px] font-semibold leading-9 text-[#f5f5f5]">技能分析</h2>
          <p className="mt-1 text-[13px] text-[var(--color-secondary)]">近 {timeRange} · 技能调用健康度与语义匹配质量</p>
        </div>
      </div>
      <HeroKpiRow timeRange={timeRange} />
      <TrendsSection timeRange={timeRange} />
      <StructureHealthSection timeRange={timeRange} />
      <DetailTableSection timeRange={timeRange} />
    </div>
  );
}
