import { NavLink } from 'react-router-dom';
import {
  Activity, BarChart3, CheckSquare, Database, FileStack, Gauge,
  GitBranch, Layers3, ListFilter, Settings, Table2, TerminalSquare,
  UserRound, Workflow,
} from 'lucide-react';

const NAV_GROUPS = [
  {
    label: '总览',
    items: [{ to: '/', label: '总览', icon: Gauge, end: true }],
  },
  {
    label: '观测',
    items: [
      { to: '/events',           label: '事件分布', icon: BarChart3 },
      { to: '/sdd/funnel',       label: '技能分布', icon: Activity },
      { to: '/sdd/summary',      label: '技能概览', icon: Layers3 },
      { to: '/sdd/users',        label: '用户维度', icon: UserRound },
      { to: '/sdd/work-items',   label: '工作项',   icon: GitBranch },
    ],
  },
  {
    label: '质检',
    items: [
      { to: '/ingest',           label: '采集健康', icon: CheckSquare },
      { to: '/batches',          label: '批次列表', icon: FileStack },
      { to: '/quality',          label: '数据质量', icon: ListFilter },
      { to: '/sdd/interactions', label: '交互明细', icon: Workflow },
    ],
  },
  {
    label: '配置',
    items: [{ to: '/sdd/semantics', label: '语义配置', icon: Settings }],
  },
  {
    label: '运维',
    items: [
      { to: '/ops/queue',    label: '任务队列',   icon: TerminalSquare },
      { to: '/ops/database', label: '数据库浏览', icon: Database },
    ],
  },
] as const;

export function Sidebar() {
  return (
    <aside
      className="flex flex-col"
      style={{
        gridRow: '1 / -1',
        borderRight: '1px solid var(--color-border)',
        background: 'var(--color-panel)',
      }}
    >
      {/* Brand */}
      <div
        className="flex items-center gap-[10px] min-h-[88px] px-[18px] py-[18px]"
        style={{ borderBottom: '1px solid var(--color-border)' }}
      >
        <div
          className="grid w-10 h-10 flex-none place-items-center rounded-[6px]"
          style={{ background: 'var(--color-primary)', color: 'var(--color-base)' }}
        >
          <Table2 size={22} />
        </div>
        <div>
          <h1 className="text-[18px] font-bold leading-6 text-[#f5f5f5] truncate">SDD 质量观测台</h1>
          <span className="block mt-0.5 text-[11px] text-[var(--color-muted)]">Data Observation</span>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto py-[10px]">
        {NAV_GROUPS.map((group) => (
          <div key={group.label} className="mt-[10px]">
            <div className="px-[18px] pb-[6px] pt-[8px] text-[10px] font-bold tracking-[0.05em] text-[var(--color-muted)] uppercase">
              {group.label}
            </div>
            {group.items.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={'end' in item ? item.end : false}
                className={({ isActive }) =>
                  [
                    'relative flex items-center gap-3 w-[calc(100%-16px)] min-h-[34px] mx-2 px-3 rounded-[4px]',
                    'text-[13px] text-left transition-colors duration-[120ms]',
                    isActive
                      ? 'text-[var(--color-primary)] bg-[#2b2b20]'
                      : 'text-[var(--color-secondary)] hover:text-[#f5f5f5] hover:bg-[#202016]',
                  ].join(' ')
                }
              >
                {({ isActive }) => (
                  <>
                    {isActive && (
                      <span
                        className="absolute left-0 top-[5px] bottom-[5px] w-0.5 rounded-full"
                        style={{ background: 'var(--color-primary)' }}
                      />
                    )}
                    <item.icon size={18} />
                    <span>{item.label}</span>
                  </>
                )}
              </NavLink>
            ))}
          </div>
        ))}
      </nav>
    </aside>
  );
}
