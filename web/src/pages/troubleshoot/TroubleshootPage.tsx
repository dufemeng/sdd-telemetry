import { lazy, Suspense, type ComponentType } from 'react';
import { useSearchParams } from 'react-router-dom';
import { FileStack, BarChart3, TerminalSquare } from 'lucide-react';

const BatchesPage = lazy(() => import('../batches/BatchesPage'));
const EventsPage  = lazy(() => import('../events/EventsPage'));
const QueuePage   = lazy(() => import('../ops/queue/QueuePage'));

type TabKey = 'batches' | 'events' | 'queue';

const TABS: { key: TabKey; label: string; icon: ComponentType<{ size?: number }>; Page: React.LazyExoticComponent<React.ComponentType> }[] = [
  { key: 'batches', label: '日志批次', icon: FileStack,      Page: BatchesPage },
  { key: 'events',  label: '事件分布', icon: BarChart3,      Page: EventsPage },
  { key: 'queue',   label: '任务队列', icon: TerminalSquare, Page: QueuePage },
];

const DEFAULT_TAB: TabKey = 'batches';

function isTabKey(value: string | null): value is TabKey {
  return value === 'batches' || value === 'events' || value === 'queue';
}

export default function TroubleshootPage() {
  const [params, setParams] = useSearchParams();
  const raw = params.get('tab');
  const active: TabKey = isTabKey(raw) ? raw : DEFAULT_TAB;
  const ActivePage = TABS.find((t) => t.key === active)!.Page;

  return (
    <div className="grid gap-3">
      <div
        className="flex items-center gap-1 p-1 rounded-[8px] w-fit"
        style={{ background: 'var(--color-panel)', border: '1px solid var(--color-border)' }}
      >
        {TABS.map((tab) => {
          const isActive = tab.key === active;
          const Icon = tab.icon;
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => {
                const next = new URLSearchParams(params);
                next.set('tab', tab.key);
                setParams(next, { replace: true });
              }}
              className={[
                'flex items-center gap-2 px-3 h-8 rounded-[6px] text-[13px] transition-colors',
                isActive
                  ? 'text-[var(--color-primary)]'
                  : 'text-[var(--color-secondary)] hover:text-[#f5f5f5] hover:bg-[#202016]',
              ].join(' ')}
              style={isActive ? { background: '#2b2b20' } : undefined}
            >
              <Icon size={16} />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      <Suspense fallback={<div className="p-4 text-[var(--color-muted)] text-[13px]">加载中…</div>}>
        <ActivePage />
      </Suspense>
    </div>
  );
}
