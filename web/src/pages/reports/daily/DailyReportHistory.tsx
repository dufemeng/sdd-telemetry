import { NavLink } from 'react-router-dom';
import type { DailyReportListItem } from '@sdd-telemetry/api';

interface Props {
  items: DailyReportListItem[];
  currentDate?: string;
}

export function DailyReportHistory({ items, currentDate }: Props) {
  if (items.length === 0) return null;

  return (
    <div
      style={{
        position: 'absolute',
        top: 8,
        right: 8,
        zIndex: 10,
        maxHeight: '60vh',
        overflowY: 'auto',
        background: 'rgba(20, 20, 11, 0.95)',
        border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: 6,
        padding: '4px 0',
        minWidth: 140,
      }}
    >
      {items.map((item) => (
        <NavLink
          key={item.reportDate}
          to={`/reports/daily/${item.reportDate}`}
          style={{
            display: 'block',
            padding: '6px 12px',
            fontSize: 12,
            color: item.reportDate === currentDate ? '#faff69' : '#93927c',
            textDecoration: 'none',
            background: item.reportDate === currentDate ? 'rgba(250,255,105,0.08)' : 'transparent',
          }}
        >
          {item.reportDate}
          {item.status === 'failed' && (
            <span style={{ marginLeft: 6, color: '#cc3d3d', fontSize: 10 }}>failed</span>
          )}
        </NavLink>
      ))}
    </div>
  );
}
