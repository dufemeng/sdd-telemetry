import { createBrowserRouter } from 'react-router-dom';
import { lazy, Suspense } from 'react';
import { AppShell } from './components/layout/AppShell';
import { RouteError } from './components/layout/RouteError';
import { AdminOnly } from './components/auth/AdminOnly';
import { AuthGate } from './components/auth/AuthGate';

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
const UserProfilePage   = lazy(() => import('./pages/sdd/users/UserProfilePage'));
const WorkItemsPage     = lazy(() => import('./pages/sdd/work-items/WorkItemsPage'));
const WorkItemDetailPage = lazy(() => import('./pages/sdd/work-items/WorkItemDetailPage'));
const WikiRecallsPage   = lazy(() => import('./pages/sdd/wiki-recalls/WikiRecallsPage'));
const WikiDomainDetailPage = lazy(() => import('./pages/sdd/wiki-recalls/WikiDomainDetailPage'));
const SemanticsPage     = lazy(() => import('./pages/sdd/semantics/SemanticsPage'));
const DatabasePage      = lazy(() => import('./pages/ops/database/DatabasePage'));
const ResourcesPage     = lazy(() => import('./pages/ops/resources/ResourcesPage'));
const TroubleshootPage  = lazy(() => import('./pages/troubleshoot/TroubleshootPage'));
const LoginPage         = lazy(() => import('./pages/auth/LoginPage'));
const AuthUsersPage     = lazy(() => import('./pages/admin/users/AuthUsersPage'));
const DailyReportsPage  = lazy(() => import('./pages/reports/daily/DailyReportsPage'));

export const router = createBrowserRouter([
  {
    path: '/login',
    element: wrap(LoginPage),
  },
  {
    element: <AuthGate />,
    children: [
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
          { path: 'sdd/users/:id',        element: wrap(UserProfilePage),  errorElement: <RouteError /> },
          { path: 'sdd/work-items',       element: wrap(WorkItemsPage),       errorElement: <RouteError /> },
          { path: 'sdd/work-items/:id',   element: wrap(WorkItemDetailPage),  errorElement: <RouteError /> },
          { path: 'sdd/wiki-recalls',     element: wrap(WikiRecallsPage),  errorElement: <RouteError /> },
          { path: 'sdd/wiki-recalls/:repo/:domain', element: wrap(WikiDomainDetailPage), errorElement: <RouteError /> },
          { path: 'reports/daily',          element: wrap(DailyReportsPage), errorElement: <RouteError /> },
          { path: 'reports/daily/latest',   element: wrap(DailyReportsPage), errorElement: <RouteError /> },
          { path: 'reports/daily/:date',    element: wrap(DailyReportsPage), errorElement: <RouteError /> },
          { path: 'sdd/semantics',        element: wrap(SemanticsPage),    errorElement: <RouteError /> },
          { path: 'troubleshoot',         element: wrap(TroubleshootPage), errorElement: <RouteError /> },
          {
            element: <AdminOnly />,
            children: [
              { path: 'ops/database', element: wrap(DatabasePage), errorElement: <RouteError /> },
              { path: 'ops/resources', element: wrap(ResourcesPage), errorElement: <RouteError /> },
              { path: 'admin/users', element: wrap(AuthUsersPage), errorElement: <RouteError /> },
            ],
          },
          { path: '*',                    element: <RouteError /> },
        ],
      },
    ],
  },
]);
