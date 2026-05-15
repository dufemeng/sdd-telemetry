import { createBrowserRouter } from 'react-router-dom';
import { lazy, Suspense } from 'react';
import { AppShell } from './components/layout/AppShell';

function Loading() {
  return <div className="p-4 text-[var(--color-muted)] text-[13px]">加载中…</div>;
}

function wrap(Component: React.LazyExoticComponent<() => React.ReactElement>) {
  return (
    <Suspense fallback={<Loading />}>
      <Component />
    </Suspense>
  );
}

const OverviewPage      = lazy(() => import('./pages/overview/OverviewPage'));
const IngestPage        = lazy(() => import('./pages/ingest/IngestPage'));
const BatchesPage       = lazy(() => import('./pages/batches/BatchesPage'));
const EventsPage        = lazy(() => import('./pages/events/EventsPage'));
const QualityPage       = lazy(() => import('./pages/quality/QualityPage'));
const FunnelPage        = lazy(() => import('./pages/sdd/funnel/FunnelPage'));
const SummaryPage       = lazy(() => import('./pages/sdd/summary/SummaryPage'));
const InteractionsPage  = lazy(() => import('./pages/sdd/interactions/InteractionsPage'));
const UsersPage         = lazy(() => import('./pages/sdd/users/UsersPage'));
const WorkItemsPage     = lazy(() => import('./pages/sdd/work-items/WorkItemsPage'));
const SemanticsPage     = lazy(() => import('./pages/sdd/semantics/SemanticsPage'));
const QueuePage         = lazy(() => import('./pages/ops/queue/QueuePage'));
const DatabasePage      = lazy(() => import('./pages/ops/database/DatabasePage'));

export const router = createBrowserRouter([
  {
    path: '/',
    element: <AppShell />,
    children: [
      { index: true,                  element: wrap(OverviewPage) },
      { path: 'ingest',               element: wrap(IngestPage) },
      { path: 'batches',              element: wrap(BatchesPage) },
      { path: 'events',               element: wrap(EventsPage) },
      { path: 'quality',              element: wrap(QualityPage) },
      { path: 'sdd/funnel',           element: wrap(FunnelPage) },
      { path: 'sdd/summary',          element: wrap(SummaryPage) },
      { path: 'sdd/interactions',     element: wrap(InteractionsPage) },
      { path: 'sdd/users',            element: wrap(UsersPage) },
      { path: 'sdd/work-items',       element: wrap(WorkItemsPage) },
      { path: 'sdd/semantics',        element: wrap(SemanticsPage) },
      { path: 'ops/queue',            element: wrap(QueuePage) },
      { path: 'ops/database',         element: wrap(DatabasePage) },
    ],
  },
]);
