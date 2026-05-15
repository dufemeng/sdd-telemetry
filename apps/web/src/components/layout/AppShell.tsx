import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { TopBar } from './TopBar';

export function AppShell() {
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
      <TopBar />
      <main
        className="overflow-auto p-[18px]"
        style={{ background: 'var(--color-base)', gridColumn: 2, gridRow: 2 }}
      >
        <Outlet />
      </main>
    </div>
  );
}
