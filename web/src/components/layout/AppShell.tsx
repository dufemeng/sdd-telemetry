import { useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { Sidebar } from './Sidebar';
import { TopBar, type TimeRange } from './TopBar';
import { ShellContext } from './useShellContext';

export function AppShell() {
  const [timeRange, setTimeRange] = useState<TimeRange>('24h');
  const [search,    setSearch]    = useState('');
  const { pathname } = useLocation();
  const prefersReducedMotion = useReducedMotion();

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
        search={search}
        onSearchChange={setSearch}
      />
      <main
        className="overflow-hidden"
        style={{ background: 'var(--color-base)', gridColumn: 2, gridRow: 2 }}
      >
        <ShellContext.Provider value={{ timeRange, search }}>
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
