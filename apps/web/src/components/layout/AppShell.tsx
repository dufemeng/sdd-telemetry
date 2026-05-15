import { useState } from 'react';
import { Outlet, useOutletContext } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { TopBar, type TimeRange } from './TopBar';

interface ShellContext {
  timeRange: TimeRange;
  search: string;
}

export function useShellContext() {
  return useOutletContext<ShellContext>();
}

export function AppShell() {
  const [timeRange, setTimeRange] = useState<TimeRange>('24h');
  const [search,    setSearch]    = useState('');

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
        className="overflow-auto p-[18px]"
        style={{ background: 'var(--color-base)', gridColumn: 2, gridRow: 2 }}
      >
        <Outlet context={{ timeRange, search } satisfies ShellContext} />
      </main>
    </div>
  );
}
