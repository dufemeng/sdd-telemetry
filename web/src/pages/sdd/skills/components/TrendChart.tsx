import type { SddSkillTimeseries } from '@sdd-telemetry/api';
import { formatInteger } from '@/lib/format';

interface TrendChartProps {
  points: SddSkillTimeseries['points'];
}

const WIDTH = 760;
const HEIGHT = 250;
const PAD_X = 42;
const PAD_Y = 18;
const TRIGGERED_COLOR = '#c9ce3c';
const PAIRED_COLOR = 'var(--color-good-text)';

export function TrendChart({ points }: TrendChartProps) {
  if (points.length === 0) {
    return <div className="grid min-h-[250px] place-items-center text-[12px] text-[var(--color-muted)]">暂无数据</div>;
  }

  const max = Math.max(...points.flatMap((point) => [point.triggeredCount, point.pairedCount]), 1);
  const xStep = (WIDTH - PAD_X * 2) / Math.max(points.length - 1, 1);
  const y = (value: number) => HEIGHT - PAD_Y - (value / max) * (HEIGHT - PAD_Y * 2);
  const line = (field: 'triggeredCount' | 'pairedCount') =>
    points
      .map((point, index) => `${index === 0 ? 'M' : 'L'}${(PAD_X + index * xStep).toFixed(1)},${y(point[field]).toFixed(1)}`)
      .join(' ');
  const area = `${line('triggeredCount')} L${WIDTH - PAD_X},${HEIGHT - PAD_Y} L${PAD_X},${HEIGHT - PAD_Y} Z`;
  const ticks = [0, 0.25, 0.5, 0.75, 1];
  const labelIndexes = [0, 6, 12, 18, 23].filter((index) => index < points.length);

  return (
    <div className="min-h-[250px]">
      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="block h-[250px] w-full" role="img" aria-label="调用量趋势">
        <defs>
          <linearGradient id="skill-trend-area" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor={TRIGGERED_COLOR} stopOpacity="0.18" />
            <stop offset="100%" stopColor={TRIGGERED_COLOR} stopOpacity="0.02" />
          </linearGradient>
        </defs>
        {ticks.map((tick) => {
          const lineY = PAD_Y + (1 - tick) * (HEIGHT - PAD_Y * 2);
          return (
            <g key={tick}>
              <line x1={PAD_X} x2={WIDTH - PAD_X} y1={lineY} y2={lineY} stroke="rgba(255,255,255,0.07)" />
              <text x={8} y={lineY + 4} fill="var(--color-muted)" fontSize="11" fontFamily="var(--font-mono)">
                {formatInteger(Math.round(max * tick))}
              </text>
            </g>
          );
        })}
        <path d={area} fill="url(#skill-trend-area)" />
        <path d={line('triggeredCount')} fill="none" stroke={TRIGGERED_COLOR} strokeWidth="2" />
        <path d={line('pairedCount')} fill="none" stroke={PAIRED_COLOR} strokeWidth="2" />
        {labelIndexes.map((index) => (
          <text
            key={index}
            x={PAD_X + index * xStep}
            y={HEIGHT - 2}
            textAnchor="middle"
            fill="var(--color-secondary)"
            fontSize="11"
            fontFamily="var(--font-mono)"
          >
            {formatHour(points[index]?.timestamp)}
          </text>
        ))}
      </svg>
      <div className="flex items-center gap-4 pl-[42px] text-[11px] text-[var(--color-secondary)]">
        <Legend color={TRIGGERED_COLOR} label="已触发" />
        <Legend color={PAIRED_COLOR} label="已配对" />
      </div>
    </div>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <i className="h-1.5 w-4 rounded-[2px]" style={{ background: color }} />
      {label}
    </span>
  );
}

function formatHour(value: string | undefined): string {
  if (!value) {
    return '';
  }
  return new Intl.DateTimeFormat('zh-CN', { hour: '2-digit', minute: '2-digit' }).format(new Date(value));
}
