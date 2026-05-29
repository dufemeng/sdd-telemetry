import { NavLink } from 'react-router-dom';
import { LayoutGroup, motion, type Transition } from 'motion/react';
import {
  BookOpen,
  CheckSquare, Database, Gauge,
  GitBranch, Layers3, ListFilter, Search, Settings, ShieldCheck, Table2, UserRound, Workflow,
} from 'lucide-react';
import { useAuth } from '@/components/auth/useAuth';

const ACTIVE_NAV_TRANSITION: Transition = { type: 'spring', stiffness: 300, damping: 30 };

const NAV_GROUPS = [
  {
    label: '总览',
    items: [{ to: '/', label: '总览', icon: Gauge, end: true }],
  },
  {
    label: '看板',
    items: [
      { to: '/sdd/users',      label: '用户分析', icon: UserRound },
      { to: '/sdd/skills',     label: '技能分析', icon: Layers3 },
      { to: '/sdd/work-items', label: '产出分析', icon: GitBranch },
      { to: '/sdd/wiki-recalls', label: '知识库分析', icon: BookOpen },
    ],
  },
  {
    label: '配置',
    items: [{ to: '/sdd/semantics', label: '语义映射', icon: Settings }],
  },
  {
    label: '监控',
    items: [
      { to: '/sdd/interactions', label: '交互明细', icon: Workflow },
      { to: '/troubleshoot',    label: '排障明细',  icon: Search },
    ],
  },
  {
    label: '数据质量',
    items: [
      { to: '/ingest',  label: '采集健康', icon: CheckSquare },
      { to: '/quality', label: '字段覆盖', icon: ListFilter },
    ],
  },
] as const;

const ADMIN_NAV_GROUP = {
  label: '管理',
  items: [
    { to: '/ops/database', label: '数据检索', icon: Database },
    { to: '/admin/users', label: '成员管理', icon: ShieldCheck },
  ],
} as const;

export function Sidebar() {
  const { user } = useAuth();
  const groups = user.role === 'super_admin' ? [...NAV_GROUPS, ADMIN_NAV_GROUP] : NAV_GROUPS;

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
        <LayoutGroup id="sidebar-nav">
          {groups.map((group) => (
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
                      'group relative flex items-center gap-3 w-[calc(100%-16px)] min-h-[34px] mx-2 px-3 rounded-[6px]',
                      'text-[13px] text-left transition-all duration-200',
                      isActive
                        ? 'text-[var(--color-primary)]'
                        : 'text-[var(--color-secondary)] hover:text-[#f5f5f5] hover:bg-[#202016]',
                    ].join(' ')
                  }
                >
                  {({ isActive }) => (
                    <>
                      {isActive && (
                        <>
                          <motion.span
                            layoutId="sidebar-active-bg"
                            className="absolute inset-0 rounded-[6px] bg-[#2b2b20]"
                            transition={ACTIVE_NAV_TRANSITION}
                            aria-hidden="true"
                          />
                          <motion.span
                            layoutId="sidebar-active-pill"
                            className="absolute left-0 top-[9px] z-20 h-4 w-1 rounded-r-full bg-[var(--color-primary)]"
                            transition={ACTIVE_NAV_TRANSITION}
                            aria-hidden="true"
                          />
                          <span
                            className="absolute right-3 z-10 w-1.5 h-1.5 rounded-full bg-[var(--color-primary)] animate-pulse"
                            aria-hidden="true"
                          />
                        </>
                      )}
                      <item.icon
                        size={18}
                        className={[
                          'relative z-10 flex-none transition-transform duration-200',
                          isActive ? 'scale-110' : 'group-hover:scale-[1.04]',
                        ].join(' ')}
                      />
                      <span className="relative z-10 truncate">{item.label}</span>
                    </>
                  )}
                </NavLink>
              ))}
            </div>
          ))}
        </LayoutGroup>
      </nav>
    </aside>
  );
}
