import { useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { Sidebar } from './Sidebar';
import { TopBar, type TimeRange } from './TopBar';
import { ShellContext } from './useShellContext';

// 累计 / 快照口径的看板，不消费全局时间范围（顶栏选择器在这些页禁用）
const RANGE_EXEMPT_PREFIXES = ['/sdd/users', '/sdd/work-items', '/sdd/wiki-recalls', '/reports/daily'];

const PROFILE_STORAGE_KEY = 'sdd-telemetry.profileId';
const DEFAULT_PROFILE_ID = 'sdd-default';

export function AppShell() {
  const [timeRange, setTimeRange] = useState<TimeRange>('24h');
  const [profileId, setProfileId] = useState<string>(() => {
    if (typeof window === 'undefined') return DEFAULT_PROFILE_ID;
    return window.localStorage.getItem(PROFILE_STORAGE_KEY) ?? DEFAULT_PROFILE_ID;
  });

  function handleProfileChange(next: string) {
    setProfileId(next);
    if (typeof window !== 'undefined') window.localStorage.setItem(PROFILE_STORAGE_KEY, next);
  }

  const { pathname } = useLocation();
  const prefersReducedMotion = useReducedMotion();
  const rangeApplies = !RANGE_EXEMPT_PREFIXES.some((p) => pathname.startsWith(p));

  return (
    <div
      className="h-screen w-screen overflow-hidden text-[var(--color-text)]"
      style={{
        display: 'grid',
        gridTemplateColumns: '240px 1fr',
        gridTemplateRows: '48px 1fr',
        background: 'var(--color-base)',
      }}
    >
      <Sidebar />
      <TopBar
        timeRange={timeRange}
        onTimeRangeChange={setTimeRange}
        rangeApplies={rangeApplies}
        profileId={profileId}
        onProfileChange={handleProfileChange}
      />
      <main
        className="overflow-hidden"
        style={{ background: 'var(--color-base)', gridColumn: 2, gridRow: 2 }}
      >
        <ShellContext.Provider value={{ timeRange, profileId }}>
          <AnimatePresence mode="wait">
            <motion.div
              key={pathname}
              className="h-full overflow-auto p-[18px]"
              {...(prefersReducedMotion ? {} : {
                initial:    { opacity: 0, x: 10, filter: 'blur(10px)' },
                animate:    { opacity: 1, x: 0,  filter: 'blur(0px)' },
                exit:       { opacity: 0, x: -10, filter: 'blur(10px)' },
                transition: { duration: 0.3, ease: [0.22, 1, 0.36, 1] },
              })}
            >
              <Outlet />
            </motion.div>
          </AnimatePresence>
        </ShellContext.Provider>
      </main>
    </div>
  );
}
