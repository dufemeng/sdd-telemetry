import { createBrowserRouter } from 'react-router-dom';
import { lazy, Suspense } from 'react';
import { AppShell } from './components/layout/AppShell';
import { RouteError } from './components/layout/RouteError';

function Loading() {
  return <div className="p-4 text-[var(--color-muted)] text-[13px]">加载中…</div>;
}

function wrap(Component: React.LazyExoticComponent<React.ComponentType>) {
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
const SkillsPage        = lazy(() => import('./pages/sdd/skills/SkillsPage'));
const InteractionsPage  = lazy(() => import('./pages/sdd/interactions/InteractionsPage'));
const UsersPage         = lazy(() => import('./pages/sdd/users/UsersPage'));
const WorkItemsPage     = lazy(() => import('./pages/sdd/work-items/WorkItemsPage'));
const SemanticsPage     = lazy(() => import('./pages/sdd/semantics/SemanticsPage'));
const QueuePage         = lazy(() => import('./pages/ops/queue/QueuePage'));
const DatabasePage      = lazy(() => import('./pages/ops/database/DatabasePage'));
const TroubleshootPage  = lazy(() => import('./pages/troubleshoot/TroubleshootPage'));

export const router = createBrowserRouter([
  {
    path: '/',
    element: <AppShell />,
    errorElement: <AppShell />,
    children: [
      { index: true,                  element: wrap(OverviewPage),     errorElement: <RouteError /> },
      { path: 'ingest',               element: wrap(IngestPage),       errorElement: <RouteError /> },
      { path: 'batches',              element: wrap(BatchesPage),      errorElement: <RouteError /> },
      { path: 'events',               element: wrap(EventsPage),       errorElement: <RouteError /> },
      { path: 'quality',              element: wrap(QualityPage),      errorElement: <RouteError /> },
      { path: 'sdd/skills',           element: wrap(SkillsPage),       errorElement: <RouteError /> },
      { path: 'sdd/interactions',     element: wrap(InteractionsPage), errorElement: <RouteError /> },
      { path: 'sdd/users',            element: wrap(UsersPage),        errorElement: <RouteError /> },
      { path: 'sdd/work-items',       element: wrap(WorkItemsPage),    errorElement: <RouteError /> },
      { path: 'sdd/semantics',        element: wrap(SemanticsPage),    errorElement: <RouteError /> },
      { path: 'ops/queue',            element: wrap(QueuePage),        errorElement: <RouteError /> },
      { path: 'ops/database',         element: wrap(DatabasePage),     errorElement: <RouteError /> },
      { path: 'troubleshoot',         element: wrap(TroubleshootPage), errorElement: <RouteError /> },
      { path: '*',                    element: <RouteError /> },
    ],
  },
]);
