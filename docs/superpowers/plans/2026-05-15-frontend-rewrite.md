# SDD Monitor Frontend Rewrite Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rewrite `web` from a monolithic 988-line `App.tsx` into a properly structured React application with React Router v7, Tailwind CSS v4, feature-based pages, and clean architectural layering.

**Architecture:** Five-layer clean architecture — Router → Page (Container) → [UI Components + Data Hooks] → API Client. Each layer has a single responsibility; data flows only downward. 13 pages each live in their own directory under `pages/` with co-located data hooks.

**Tech Stack:** React 19, TypeScript 5.9, React Router v7, Tailwind CSS v4 (`@tailwindcss/vite`), TanStack Query v5, `@tanstack/react-table` v8, Lucide React, Vitest + `@testing-library/react`

**Design Constraints:** Vercel React best practices (hard constraint); SOLID principles (hard constraint). Refer to `docs/superpowers/specs/2026-05-15-frontend-rewrite-design.md` for full spec.

---

## File Map

### New files
```
web/src/
  lib/
    format.ts              ← formatter utilities (formatInteger, formatBytes, etc.)
    format.test.ts
  api/
    client.ts              ← requestData<T>, unified error handling
    client.test.ts
  components/
    ui/
      StatusBadge.tsx
      StatCard.tsx
      Panel.tsx
      DataTable.tsx        ← wraps @tanstack/react-table
      BarList.tsx
      EmptyState.tsx
    layout/
      AppShell.tsx         ← grid shell + <Outlet />
      Sidebar.tsx          ← nav groups + active route highlight
      TopBar.tsx           ← search input + time range switcher + refresh
  pages/
    overview/OverviewPage.tsx
    ingest/IngestPage.tsx
    ingest/useIngestHealth.ts
    batches/BatchesPage.tsx
    batches/useBatchList.ts
    events/EventsPage.tsx
    events/useEventDistribution.ts
    events/useEventTimeline.ts
    quality/QualityPage.tsx
    quality/useFieldCoverage.ts
    sdd/funnel/FunnelPage.tsx
    sdd/funnel/useSddFunnel.ts
    sdd/summary/SummaryPage.tsx
    sdd/summary/useSddUsageSummary.ts
    sdd/interactions/InteractionsPage.tsx
    sdd/interactions/useSddInteractions.ts
    sdd/users/UsersPage.tsx
    sdd/users/useSddUsers.ts
    sdd/work-items/WorkItemsPage.tsx
    sdd/work-items/useSddWorkItems.ts
    sdd/semantics/SemanticsPage.tsx
    sdd/semantics/CreateSemanticForm.tsx
    sdd/semantics/useSddSemantics.ts
    ops/queue/QueuePage.tsx
    ops/queue/useOpsQueue.ts
    ops/queue/useOpsJobs.ts
    ops/database/DatabasePage.tsx
    ops/database/useOpsTables.ts
    ops/database/useTableRows.ts
  router.tsx
  styles/tokens.css        ← Tailwind @import + @theme design tokens
```

### Modified files
```
web/package.json      ← add react-router-dom, @tailwindcss/vite, @testing-library/react
web/vite.config.ts    ← add @tailwindcss/vite plugin
web/src/main.tsx      ← swap <App> for <RouterProvider>, add Suspense
web/index.html        ← add Google Fonts link (Inter + JetBrains Mono)
```

### Deleted files
```
web/src/App.tsx       ← replaced by router + pages
web/src/styles.css    ← replaced by tokens.css (Tailwind)
web/src/api.ts        ← replaced by api/client.ts
web/src/api/client.ts ← old client, replaced
```

---

## Phase 1 — Infrastructure (serial, everything depends on this)

---

### Task 1: Install dependencies

**Files:**
- Modify: `web/package.json`

- [ ] **Step 1: Install runtime and dev dependencies**

```bash
cd web
pnpm add react-router-dom
pnpm add -D tailwindcss @tailwindcss/vite @testing-library/react @testing-library/user-event
```

- [ ] **Step 2: Verify install**

```bash
pnpm ls react-router-dom tailwindcss @tailwindcss/vite @testing-library/react
```

Expected: all four packages listed with versions.

- [ ] **Step 3: Commit**

```bash
git add web/package.json web/pnpm-lock.yaml pnpm-lock.yaml
git commit -m "chore(web): add react-router-dom, tailwindcss v4, testing-library"
```

---

### Task 2: Tailwind CSS v4 setup + design tokens

**Files:**
- Create: `web/src/styles/tokens.css`
- Modify: `web/vite.config.ts`
- Modify: `web/index.html`

- [ ] **Step 1: Update vite.config.ts**

Replace the entire file:

```ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:4318',
        changeOrigin: true,
      },
    },
  },
  preview: { port: 4173 },
});
```

- [ ] **Step 2: Create `src/styles/tokens.css`**

```css
@import "tailwindcss";

@theme {
  --color-base:      #0a0a0a;
  --color-surface:   #101010;
  --color-panel:     #14140b;
  --color-hover:     #171717;
  --color-active:    #222222;
  --color-primary:   #faff69;
  --color-text:      #e5e3d3;
  --color-secondary: #c9c8af;
  --color-muted:     #93927c;
  --color-border:    rgba(255 255 255 / 0.08);

  --color-good-text: #22c55e;
  --color-good-bg:   rgba(34 197 94 / 0.10);
  --color-warn-text: #f59e0b;
  --color-warn-bg:   rgba(245 158 11 / 0.10);
  --color-bad-text:  #ffb4ab;
  --color-bad-bg:    rgba(239 68 68 / 0.16);

  --font-ui:   Inter, 'PingFang SC', system-ui, sans-serif;
  --font-mono: 'JetBrains Mono', ui-monospace, monospace;

  --radius-sm: 4px;
  --radius-md: 6px;
}

body {
  background-color: var(--color-base);
  color: var(--color-text);
  font-family: var(--font-ui);
  min-width: 1180px;
  overflow: hidden;
}

* { box-sizing: border-box; }
h1, h2, h3, p { margin: 0; }
```

- [ ] **Step 3: Add Google Fonts to `index.html`**

Inside `<head>`, add before closing tag:

```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&family=JetBrains+Mono:wght@450&display=swap" rel="stylesheet">
```

- [ ] **Step 4: Smoke-test Tailwind is working**

In `web/src/main.tsx`, temporarily add `import './styles/tokens.css'` and run:

```bash
pnpm --filter @sdd-telemetry/web dev
```

Open http://localhost:5173. Background should be `#0a0a0a`. Stop the server.

- [ ] **Step 5: Commit**

```bash
git add web/vite.config.ts web/src/styles/tokens.css web/index.html
git commit -m "feat(web): add tailwindcss v4 with design token theme"
```

---

### Task 3: Formatter utilities (TDD)

**Files:**
- Create: `web/src/lib/format.ts`
- Create: `web/src/lib/format.test.ts`

- [ ] **Step 1: Write failing tests**

Create `web/src/lib/format.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  formatInteger,
  formatPercent,
  formatBytes,
  formatTime,
  formatDateTime,
  truncate,
  statusVariant,
} from './format';

describe('formatInteger', () => {
  it('formats zero', () => expect(formatInteger(0)).toBe('0'));
  it('formats null as 0', () => expect(formatInteger(null)).toBe('0'));
  it('formats thousands', () => expect(formatInteger(1234)).toBe('1,234'));
});

describe('formatPercent', () => {
  it('formats null as unknown', () => expect(formatPercent(null)).toBe('unknown'));
  it('formats 0.8 as 80%', () => expect(formatPercent(0.8)).toMatch(/80/));
});

describe('formatBytes', () => {
  it('formats bytes', () => expect(formatBytes(512)).toBe('512 B'));
  it('formats KiB', () => expect(formatBytes(2048)).toBe('2.0 KiB'));
  it('formats MiB', () => expect(formatBytes(2 * 1024 * 1024)).toBe('2.00 MiB'));
  it('handles null', () => expect(formatBytes(null)).toBe('0 B'));
});

describe('truncate', () => {
  it('returns unknown for null', () => expect(truncate(null)).toBe('unknown'));
  it('truncates long string', () => expect(truncate('a'.repeat(200), 10)).toBe('aaaaaaaaaa...'));
  it('returns string unchanged if short', () => expect(truncate('hi', 10)).toBe('hi'));
});

describe('statusVariant', () => {
  it('maps parsed to good', () => expect(statusVariant('parsed')).toBe('good'));
  it('maps failed_retryable to bad', () => expect(statusVariant('failed_retryable')).toBe('bad'));
  it('maps processing to warn', () => expect(statusVariant('processing')).toBe('warn'));
  it('maps unknown to neutral', () => expect(statusVariant('unknown')).toBe('neutral'));
});
```

- [ ] **Step 2: Run tests — verify they fail**

```bash
pnpm --filter @sdd-telemetry/web test
```

Expected: multiple failures with "Cannot find module './format'".

- [ ] **Step 3: Write `src/lib/format.ts`**

```ts
const intlInt = new Intl.NumberFormat('zh-CN');
const intlPct = new Intl.NumberFormat('zh-CN', { style: 'percent', maximumFractionDigits: 1 });
const intlTime = new Intl.DateTimeFormat('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
const intlDt   = new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });

export function formatInteger(value: number | null | undefined): string {
  return intlInt.format(value ?? 0);
}

export function formatPercent(value: number | null | undefined): string {
  if (value == null) return 'unknown';
  return intlPct.format(value);
}

export function formatBytes(value: number | null | undefined): string {
  const n = value ?? 0;
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KiB`;
  return `${(n / 1024 / 1024).toFixed(2)} MiB`;
}

export function formatTime(value: string | null | undefined): string {
  if (!value) return 'unknown';
  return intlTime.format(new Date(value));
}

export function formatDateTime(value: string | null | undefined): string {
  if (!value) return 'unknown';
  return intlDt.format(new Date(value));
}

export function truncate(value: unknown, max = 120): string {
  if (value == null || value === '') return 'unknown';
  const s = String(value);
  return s.length > max ? `${s.slice(0, max)}...` : s;
}

const GOOD = new Set(['parsed', 'success', 'completed', 'ok']);
const BAD  = /failed|error/;
const WARN = new Set(['processing', 'queued', 'received', 'pending']);

export type StatusVariant = 'good' | 'warn' | 'bad' | 'neutral';

export function statusVariant(status: string | null | undefined): StatusVariant {
  const s = status ?? 'unknown';
  if (GOOD.has(s)) return 'good';
  if (BAD.test(s)) return 'bad';
  if (WARN.has(s)) return 'warn';
  return 'neutral';
}
```

- [ ] **Step 4: Run tests — verify they pass**

```bash
pnpm --filter @sdd-telemetry/web test
```

Expected: all 12 tests pass.

- [ ] **Step 5: Commit**

```bash
git add web/src/lib/
git commit -m "feat(web): add formatter utilities with tests"
```

---

### Task 4: API client

**Files:**
- Create: `web/src/api/client.ts`
- Create: `web/src/api/client.test.ts`

- [ ] **Step 1: Write failing test**

Create `web/src/api/client.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { requestData } from './client';

beforeEach(() => { vi.restoreAllMocks(); });

describe('requestData', () => {
  it('returns data on success', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, data: { count: 3 }, requestId: 'r1', timestamp: 't' }),
    }));
    const result = await requestData<{ count: number }>('/api/test');
    expect(result).toEqual({ count: 3 });
  });

  it('throws on API error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({ success: false, error: { code: 'BAD_REQUEST', message: 'invalid' }, requestId: 'r1', timestamp: 't' }),
    }));
    await expect(requestData('/api/test')).rejects.toThrow('invalid');
  });

  it('throws HTTP status when no error message', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({ success: false, requestId: 'r1', timestamp: 't' }),
    }));
    await expect(requestData('/api/test')).rejects.toThrow('HTTP 500');
  });
});
```

- [ ] **Step 2: Run test — verify it fails**

```bash
pnpm --filter @sdd-telemetry/web test
```

Expected: "Cannot find module './client'".

- [ ] **Step 3: Write `src/api/client.ts`**

```ts
const BASE = import.meta.env.VITE_API_BASE_URL ?? '';

interface ApiEnvelope<T> {
  success: boolean;
  data: T;
  error?: { code: string; message: string };
  requestId: string;
  timestamp: string;
}

export async function requestData<T>(path: string, init?: RequestInit): Promise<T> {
  const url = BASE ? new URL(path, BASE).toString() : path;
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json', ...init?.headers },
    ...init,
  });
  const body = (await res.json()) as ApiEnvelope<T>;
  if (!res.ok || !body.success) {
    throw new Error(body.error?.message ?? `HTTP ${res.status}`);
  }
  return body.data;
}
```

- [ ] **Step 4: Run tests — verify all pass**

```bash
pnpm --filter @sdd-telemetry/web test
```

Expected: all 15 tests pass (12 formatter + 3 client).

- [ ] **Step 5: Commit**

```bash
git add web/src/api/
git commit -m "feat(web): add typed API client with error handling"
```

---

## Phase 2 — Layout Shell (serial, pages depend on this)

---

### Task 5: AppShell + Sidebar + TopBar

**Files:**
- Create: `web/src/components/layout/AppShell.tsx`
- Create: `web/src/components/layout/Sidebar.tsx`
- Create: `web/src/components/layout/TopBar.tsx`

- [ ] **Step 1: Create `AppShell.tsx`**

```tsx
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
```

- [ ] **Step 2: Create `Sidebar.tsx`**

```tsx
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
          className="grid w-10 h-10 place-items-center rounded-[6px]"
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
```

- [ ] **Step 3: Create `TopBar.tsx`**

```tsx
import { RefreshCw, Search } from 'lucide-react';
import { useIsFetching, useQueryClient } from '@tanstack/react-query';

export type TimeRange = '6h' | '24h' | '72h';

interface TopBarProps {
  timeRange: TimeRange;
  onTimeRangeChange: (range: TimeRange) => void;
  search: string;
  onSearchChange: (value: string) => void;
}

export function TopBar({ timeRange, onTimeRangeChange, search, onSearchChange }: TopBarProps) {
  const isFetching = useIsFetching() > 0;
  const qc = useQueryClient();

  return (
    <header
      className="flex items-center justify-between px-4 min-w-0"
      style={{
        gridColumn: 2,
        height: 48,
        borderBottom: '1px solid var(--color-border)',
        background: 'var(--color-panel)',
      }}
    >
      {/* Search */}
      <div
        className="flex items-center gap-2 h-8 px-[10px] w-[min(520px,46vw)] rounded-[4px] text-[var(--color-muted)]"
        style={{ border: '1px solid rgba(255,255,255,0.10)', background: 'var(--color-base)' }}
      >
        <Search size={16} />
        <input
          className="w-full bg-transparent outline-none text-[12px] text-[var(--color-text)] placeholder:text-[var(--color-muted)]"
          placeholder="搜索批次 / 会话 / 提示词 / 用户 / 技能"
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
        />
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2">
        {/* Time range */}
        <div
          className="flex items-center h-[30px] p-0.5 gap-0.5 rounded-[4px]"
          style={{ border: '1px solid var(--color-border)', background: '#171717' }}
        >
          {(['6h', '24h', '72h'] as TimeRange[]).map((r) => (
            <button
              key={r}
              onClick={() => onTimeRangeChange(r)}
              className={[
                'h-6 px-[10px] rounded-[3px] text-[12px] border-0 transition-colors duration-[120ms]',
                r === timeRange
                  ? 'bg-[#222] text-[#f5f5f5]'
                  : 'bg-transparent text-[var(--color-secondary)]',
              ].join(' ')}
            >
              {r}
            </button>
          ))}
        </div>

        {/* Refresh */}
        <button
          onClick={() => void qc.invalidateQueries()}
          className="grid w-8 h-8 place-items-center rounded-[4px] border-0 text-[var(--color-secondary)] hover:text-[var(--color-primary)] hover:bg-[#222] transition-colors duration-[120ms]"
          style={{ border: '1px solid var(--color-border)', background: '#171717' }}
          title="刷新"
        >
          <RefreshCw size={18} className={isFetching ? 'animate-spin' : ''} />
        </button>
      </div>
    </header>
  );
}
```

- [ ] **Step 4: Commit**

```bash
git add web/src/components/layout/
git commit -m "feat(web): add AppShell, Sidebar, TopBar layout components"
```

---

## Phase 3 — Atomic UI Components (Tasks 6-11, can run in parallel)

---

### Task 6: StatusBadge

**Files:**
- Create: `web/src/components/ui/StatusBadge.tsx`

- [ ] **Step 1: Create `StatusBadge.tsx`**

```tsx
import type { StatusVariant } from '../../lib/format';

const VARIANT_STYLES: Record<StatusVariant, string> = {
  good:    'text-[var(--color-good-text)] bg-[var(--color-good-bg)]',
  warn:    'text-[var(--color-warn-text)] bg-[var(--color-warn-bg)]',
  bad:     'text-[var(--color-bad-text)]  bg-[var(--color-bad-bg)]',
  neutral: 'text-[var(--color-secondary)] bg-[rgba(255,255,255,0.08)]',
};

interface StatusBadgeProps {
  status: string | null | undefined;
  variant?: StatusVariant;
}

export function StatusBadge({ status, variant }: StatusBadgeProps) {
  const { statusVariant } = require('../../lib/format');
  const v: StatusVariant = variant ?? statusVariant(status);
  return (
    <span
      className={[
        'inline-flex items-center min-h-5 px-2 rounded-full text-[11px] leading-[14px] font-medium whitespace-nowrap',
        VARIANT_STYLES[v],
      ].join(' ')}
    >
      {status ?? 'unknown'}
    </span>
  );
}
```

Wait — using `require` in an ES module is wrong. Fix:

```tsx
import { statusVariant, type StatusVariant } from '../../lib/format';

const VARIANT_STYLES: Record<StatusVariant, string> = {
  good:    'text-[var(--color-good-text)] bg-[var(--color-good-bg)]',
  warn:    'text-[var(--color-warn-text)] bg-[var(--color-warn-bg)]',
  bad:     'text-[var(--color-bad-text)]  bg-[var(--color-bad-bg)]',
  neutral: 'text-[var(--color-secondary)] bg-[rgba(255,255,255,0.08)]',
};

interface StatusBadgeProps {
  status: string | null | undefined;
  /** Override automatic variant detection */
  variant?: StatusVariant;
}

export function StatusBadge({ status, variant }: StatusBadgeProps) {
  const v: StatusVariant = variant ?? statusVariant(status);
  return (
    <span
      className={[
        'inline-flex items-center min-h-5 px-2 rounded-full',
        'text-[11px] leading-[14px] font-medium whitespace-nowrap',
        VARIANT_STYLES[v],
      ].join(' ')}
    >
      {status ?? 'unknown'}
    </span>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add web/src/components/ui/StatusBadge.tsx
git commit -m "feat(web): add StatusBadge component"
```

---

### Task 7: StatCard

**Files:**
- Create: `web/src/components/ui/StatCard.tsx`

- [ ] **Step 1: Create `StatCard.tsx`**

```tsx
interface StatCardProps {
  icon: React.ReactNode;
  label: string;
  value: string | number | null | undefined;
  hint?: string;
  loading?: boolean;
}

export function StatCard({ icon, label, value, hint, loading }: StatCardProps) {
  return (
    <section
      className="flex gap-3 min-h-[98px] p-[14px] rounded-[6px]"
      style={{ border: '1px solid var(--color-border)', background: 'var(--color-surface)' }}
    >
      <div
        className="grid w-[34px] h-[34px] flex-none place-items-center rounded-[4px] text-[var(--color-primary)]"
        style={{ background: '#202016' }}
      >
        {icon}
      </div>
      <div>
        <span className="text-[12px] text-[var(--color-secondary)]">{label}</span>
        <strong
          className="block mt-2 text-[24px] font-semibold leading-7 text-[#f5f5f5]"
          style={{ fontFamily: 'var(--font-mono)' }}
        >
          {loading ? '—' : (value ?? '—')}
        </strong>
        {hint && (
          <em className="block mt-2 text-[11px] not-italic text-[var(--color-muted)]">{hint}</em>
        )}
      </div>
    </section>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add web/src/components/ui/StatCard.tsx
git commit -m "feat(web): add StatCard component"
```

---

### Task 8: Panel + EmptyState

**Files:**
- Create: `web/src/components/ui/Panel.tsx`
- Create: `web/src/components/ui/EmptyState.tsx`

- [ ] **Step 1: Create `Panel.tsx`**

```tsx
interface PanelProps {
  title: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}

export function Panel({ title, icon, children, className = '' }: PanelProps) {
  return (
    <section
      className={`p-[14px] rounded-[6px] min-w-0 ${className}`}
      style={{ border: '1px solid var(--color-border)', background: 'var(--color-surface)' }}
    >
      <div className="flex items-center gap-2 mb-3 text-[var(--color-primary)]">
        {icon}
        <h3 className="text-[14px] font-semibold leading-5 text-[#f5f5f5]">{title}</h3>
      </div>
      {children}
    </section>
  );
}
```

- [ ] **Step 2: Create `EmptyState.tsx`**

```tsx
interface EmptyStateProps { text: string }

export function EmptyState({ text }: EmptyStateProps) {
  return (
    <div className="grid min-h-24 place-items-center text-[12px] text-[var(--color-muted)]">
      {text}
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add web/src/components/ui/Panel.tsx web/src/components/ui/EmptyState.tsx
git commit -m "feat(web): add Panel and EmptyState components"
```

---

### Task 9: DataTable

**Files:**
- Create: `web/src/components/ui/DataTable.tsx`

- [ ] **Step 1: Create `DataTable.tsx`**

```tsx
import { EmptyState } from './EmptyState';

interface DataTableProps {
  headers: string[];
  rows: React.ReactNode[][];
  emptyText?: string;
}

export function DataTable({ headers, rows, emptyText = '暂无数据' }: DataTableProps) {
  return (
    <div
      className="max-w-full overflow-auto rounded-[4px]"
      style={{ border: '1px solid var(--color-border)' }}
    >
      <table className="w-full" style={{ borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            {headers.map((h) => (
              <th
                key={h}
                className="sticky top-0 z-10 px-[10px] py-2 text-left text-[10px] font-bold uppercase whitespace-nowrap text-[var(--color-muted)]"
                style={{ background: '#171717', borderBottom: '1px solid var(--color-border)' }}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, ri) => (
            <tr
              key={ri}
              className="group"
            >
              {row.map((cell, ci) => (
                <td
                  key={ci}
                  className={[
                    'px-[10px] py-2 text-[12px] leading-4 align-top max-w-[320px] break-words',
                    'group-hover:bg-[#171717] transition-colors',
                    ci === 0 || ci === 1 ? 'text-[var(--color-text)]' : 'text-[var(--color-secondary)]',
                  ].join(' ')}
                  style={{ borderBottom: '1px solid var(--color-border)' }}
                >
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length === 0 && <EmptyState text={emptyText} />}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add web/src/components/ui/DataTable.tsx
git commit -m "feat(web): add DataTable component"
```

---

### Task 10: BarList

**Files:**
- Create: `web/src/components/ui/BarList.tsx`

- [ ] **Step 1: Create `BarList.tsx`**

```tsx
import { formatInteger } from '../../lib/format';
import { EmptyState } from './EmptyState';

interface BarItem {
  label: string;
  sub?: string;
  value: number;
  ratio: number;
}

interface BarListProps {
  items: BarItem[];
  emptyText?: string;
}

export function BarList({ items, emptyText = '暂无数据' }: BarListProps) {
  const max = Math.max(...items.map((i) => i.value), 1);

  if (items.length === 0) return <EmptyState text={emptyText} />;

  return (
    <div className="grid gap-[10px]">
      {items.map((item) => (
        <div
          key={item.label}
          className="grid items-center gap-3"
          style={{ gridTemplateColumns: 'minmax(180px,0.9fr) minmax(140px,1fr) 64px' }}
        >
          <div className="min-w-0">
            <span className="block truncate text-[12px] leading-4 text-[var(--color-text)]">
              {item.label}
            </span>
            {item.sub && (
              <em className="block truncate mt-0.5 text-[11px] not-italic text-[var(--color-muted)]">
                {item.sub}
              </em>
            )}
          </div>
          <div className="h-2 overflow-hidden rounded-full" style={{ background: '#202016' }}>
            <div
              className="h-full rounded-full"
              style={{
                width: `${Math.max((item.value / max) * 100, 4)}%`,
                background: '#c9ce3c',
              }}
            />
          </div>
          <strong
            className="text-[13px] text-[#f5f5f5] text-right"
            style={{ fontFamily: 'var(--font-mono)' }}
          >
            {formatInteger(item.value)}
          </strong>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add web/src/components/ui/BarList.tsx
git commit -m "feat(web): add BarList component"
```

---

### Task 11: Router skeleton + main.tsx update

**Files:**
- Create: `web/src/router.tsx`
- Modify: `web/src/main.tsx`

- [ ] **Step 1: Create `router.tsx` with placeholder pages**

```tsx
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
```

- [ ] **Step 2: Update `main.tsx`**

Replace entire file:

```tsx
import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { router } from './router';
import './styles/tokens.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 15_000, retry: 1 },
  },
});

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </React.StrictMode>,
);
```

Note: `useState` import removed — not needed at this level.

- [ ] **Step 3: Create placeholder for every page (so router compiles)**

Each placeholder is one line. Create all 13 files now so `router.tsx` compiles:

```bash
mkdir -p web/src/pages/{overview,ingest,batches,events,quality}
mkdir -p web/src/pages/sdd/{funnel,summary,interactions,users,work-items,semantics}
mkdir -p web/src/pages/ops/{queue,database}
```

For each page file, create a minimal export:

```tsx
// Example — repeat for all 13 pages with the correct function name
export default function OverviewPage() {
  return <div className="text-[var(--color-muted)] p-4 text-[13px]">Overview — coming soon</div>;
}
```

Pages to create (function name in parentheses):
- `pages/overview/OverviewPage.tsx` (OverviewPage)
- `pages/ingest/IngestPage.tsx` (IngestPage)
- `pages/batches/BatchesPage.tsx` (BatchesPage)
- `pages/events/EventsPage.tsx` (EventsPage)
- `pages/quality/QualityPage.tsx` (QualityPage)
- `pages/sdd/funnel/FunnelPage.tsx` (FunnelPage)
- `pages/sdd/summary/SummaryPage.tsx` (SummaryPage)
- `pages/sdd/interactions/InteractionsPage.tsx` (InteractionsPage)
- `pages/sdd/users/UsersPage.tsx` (UsersPage)
- `pages/sdd/work-items/WorkItemsPage.tsx` (WorkItemsPage)
- `pages/sdd/semantics/SemanticsPage.tsx` (SemanticsPage)
- `pages/ops/queue/QueuePage.tsx` (QueuePage)
- `pages/ops/database/DatabasePage.tsx` (DatabasePage)

- [ ] **Step 4: Verify the app compiles and navigates**

```bash
pnpm --filter @sdd-telemetry/web dev
```

Open http://localhost:5173. Sidebar should be visible. Click nav items — URL should change and show "coming soon" text. No console errors. Stop the server.

- [ ] **Step 5: Commit**

```bash
git add web/src/router.tsx web/src/main.tsx web/src/pages/
git commit -m "feat(web): add router, main entrypoint, placeholder pages"
```

---

## Phase 4 — Pages (Tasks 12-24, can run in parallel after Phase 2+3 complete)

> Each task below follows the same pattern:
> 1. Write the data hook
> 2. Implement the page component
> 3. Commit

---

### Task 12: OverviewPage

**Files:**
- Modify: `web/src/pages/overview/OverviewPage.tsx`

OverviewPage composes data from multiple hooks already defined in other tasks. Implement it last among pages (or after Task 13-24 complete). For now it imports from sibling hooks.

- [ ] **Step 1: Implement `OverviewPage.tsx`**

```tsx
import { CheckSquare, Activity, Workflow, UserRound, Gauge, BarChart3, Layers3, FileStack } from 'lucide-react';
import { useIngestHealth } from '../ingest/useIngestHealth';
import { useSddFunnel } from '../sdd/funnel/useSddFunnel';
import { useEventDistribution } from '../events/useEventDistribution';
import { useSddUsers } from '../sdd/users/useSddUsers';
import { useBatchList } from '../batches/useBatchList';
import { StatCard } from '../../components/ui/StatCard';
import { Panel } from '../../components/ui/Panel';
import { BarList } from '../../components/ui/BarList';
import { DataTable } from '../../components/ui/DataTable';
import { StatusBadge } from '../../components/ui/StatusBadge';
import { formatInteger, formatTime, formatBytes } from '../../lib/format';

export default function OverviewPage() {
  const health    = useIngestHealth();
  const funnel    = useSddFunnel('24h');
  const dist      = useEventDistribution('24h');
  const users     = useSddUsers();
  const batches   = useBatchList();

  const topUsers = (users.data ?? []).slice(0, 5);

  return (
    <div className="grid gap-3">
      {/* KPI row */}
      <div className="grid grid-cols-4 gap-3">
        <StatCard icon={<CheckSquare size={18} />} label="已解析批次"  value={formatInteger(health.data?.parsedBatches)}      hint="ingest/health" />
        <StatCard icon={<Activity   size={18} />} label="标准化事件"  value={formatInteger(dist.data?.totalEvents)}           hint="events total" />
        <StatCard icon={<Workflow   size={18} />} label="技能调用"    value={formatInteger(funnel.data?.totalSkillUsages)}    hint="sdd_skill_usages" />
        <StatCard icon={<UserRound  size={18} />} label="活跃用户"    value={formatInteger(topUsers.length)}                  hint="最近用户" />
      </div>

      {/* Row 2 */}
      <div className="grid grid-cols-2 gap-3">
        <Panel title="采集健康" icon={<Gauge size={18} />}>
          <div className="grid gap-2">
            {[
              ['parsed',     formatInteger(health.data?.parsedBatches)],
              ['processing', formatInteger(health.data?.processingBatches)],
              ['failed',     formatInteger(health.data?.failedBatches)],
              ['duplicate',  formatInteger(health.data?.duplicateBatches)],
            ].map(([label, value]) => (
              <div
                key={label}
                className="flex items-center justify-between min-h-9 px-[10px] rounded-[4px]"
                style={{ border: '1px solid var(--color-border)', background: '#171717' }}
              >
                <span className="text-[12px] text-[var(--color-muted)]">{label}</span>
                <strong className="text-[13px] text-[#f5f5f5]" style={{ fontFamily: 'var(--font-mono)' }}>{value}</strong>
              </div>
            ))}
          </div>
        </Panel>
        <Panel title="事件排行前 5" icon={<BarChart3 size={18} />}>
          <BarList
            items={(dist.data?.items ?? []).slice(0, 5).map((i) => ({
              label: i.eventName,
              sub:   i.description ?? i.eventName,
              value: i.count,
              ratio: i.percentage,
            }))}
          />
        </Panel>
      </div>

      {/* Row 3 */}
      <div className="grid grid-cols-2 gap-3">
        <Panel title="技能语义分布" icon={<Layers3 size={18} />}>
          <BarList
            items={(funnel.data?.stages ?? []).slice(0, 6).map((s) => ({
              label: s.displayName,
              sub:   s.semanticCode,
              value: s.usageCount,
              ratio: s.conversionRate ?? 0,
            }))}
          />
        </Panel>
        <Panel title="活跃用户" icon={<UserRound size={18} />}>
          <DataTable
            headers={['用户', '技能调用', '最近活跃']}
            rows={topUsers.map((u) => [
              u.userName ?? u.userKey,
              formatInteger(u.skillUsageCount),
              formatTime(u.lastSeenAt),
            ])}
          />
        </Panel>
      </div>

      {/* Recent batches */}
      <Panel title="最近批次" icon={<FileStack size={18} />}>
        <DataTable
          headers={['状态', 'id', '接收时间', 'payload', '事件数', '错误']}
          rows={(batches.data?.items ?? []).slice(0, 8).map((b) => [
            <StatusBadge key="s" status={b.status} />,
            b.id,
            formatTime(b.receivedAt),
            formatBytes(b.payloadBytes),
            formatInteger(b.eventCount),
            b.lastError ?? '—',
          ])}
        />
      </Panel>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add web/src/pages/overview/
git commit -m "feat(web): implement OverviewPage"
```

---

### Task 13: IngestPage

**Files:**
- Create: `web/src/pages/ingest/useIngestHealth.ts`
- Modify: `web/src/pages/ingest/IngestPage.tsx`

- [ ] **Step 1: Create `useIngestHealth.ts`**

```ts
import { useQuery } from '@tanstack/react-query';
import type { IngestHealth } from '@sdd-telemetry/api';
import { requestData } from '../../api/client';

export function useIngestHealth(windowHours = 24) {
  return useQuery({
    queryKey: ['ingest-health', windowHours],
    queryFn: () => requestData<IngestHealth>(`/api/ingest/health?windowHours=${windowHours}`),
    staleTime: 15_000,
  });
}
```

- [ ] **Step 2: Implement `IngestPage.tsx`**

```tsx
import { Activity, AlertCircle, CheckSquare, Clock3, Copy, HardDrive } from 'lucide-react';
import { useIngestHealth } from './useIngestHealth';
import { useBatchList } from '../batches/useBatchList';
import { StatCard } from '../../components/ui/StatCard';
import { Panel } from '../../components/ui/Panel';
import { DataTable } from '../../components/ui/DataTable';
import { StatusBadge } from '../../components/ui/StatusBadge';
import { formatInteger, formatBytes, formatTime } from '../../lib/format';

export default function IngestPage() {
  const { data } = useIngestHealth();
  const failedBatches = useBatchList('failed_retryable,failed_terminal');

  const latestMs = data?.latestReceivedAt ? Date.now() - new Date(data.latestReceivedAt).getTime() : null;
  const collectorStatus =
    latestMs === null       ? '暂无数据' :
    latestMs < 5 * 60_000  ? '正在接收' :
    latestMs < 30 * 60_000 ? '可能断流' : '长时间未上报';
  const statusVariant =
    collectorStatus === '正在接收' ? 'good' :
    collectorStatus === '暂无数据' ? 'neutral' : 'warn';

  return (
    <div className="grid gap-3">
      <Panel title="链路状态" icon={<Activity size={18} />}>
        <div className="grid gap-4" style={{ gridTemplateColumns: '1fr 280px' }}>
          <div>
            <StatusBadge status={collectorStatus} variant={statusVariant} />
            <h3 className="mt-3 text-[24px] font-semibold text-[#f5f5f5]" style={{ fontFamily: 'var(--font-mono)' }}>
              {formatTime(data?.latestReceivedAt)}
            </h3>
            <p className="mt-1.5 text-[12px] text-[var(--color-muted)]">
              latestParsedAt：{formatTime(data?.latestParsedAt)}
            </p>
          </div>
          <div
            className="grid gap-2 p-3 rounded-[4px]"
            style={{ gridTemplateColumns: '1fr auto', border: '1px solid var(--color-border)', background: '#171717' }}
          >
            {[
              ['pending',  formatInteger(data?.queue.pendingOutbox)],
              ['queued',   formatInteger(data?.queue.queuedJobs)],
              ['active',   formatInteger(data?.queue.activeJobs)],
              ['failed',   formatInteger(data?.queue.failedJobs)],
            ].map(([k, v]) => (
              <>
                <span key={`${k}-l`} className="text-[12px] text-[var(--color-muted)]">{k}</span>
                <strong key={`${k}-v`} className="text-[#f5f5f5]" style={{ fontFamily: 'var(--font-mono)' }}>{v}</strong>
              </>
            ))}
          </div>
        </div>
      </Panel>

      <div className="grid grid-cols-4 gap-3">
        <StatCard icon={<CheckSquare size={18} />} label="成功批次"  value={formatInteger(data?.parsedBatches)}    hint="parsedBatches" />
        <StatCard icon={<AlertCircle size={18} />} label="失败批次"  value={formatInteger(data?.failedBatches)}    hint="failedBatches" />
        <StatCard icon={<Copy        size={18} />} label="重复批次"  value={formatInteger(data?.duplicateBatches)} hint="duplicateBatches" />
        <StatCard icon={<HardDrive   size={18} />} label="Payload"  value={formatBytes(data?.totalPayloadBytes)}   hint="totalPayloadBytes" />
      </div>

      <Panel title="近期失败批次" icon={<AlertCircle size={18} />}>
        <DataTable
          headers={['状态', 'id', '接收时间', 'payload', '错误']}
          rows={(failedBatches.data?.items ?? []).map((b) => [
            <StatusBadge key="s" status={b.status} />,
            b.id,
            formatTime(b.receivedAt),
            formatBytes(b.payloadBytes),
            b.lastError ?? '—',
          ])}
          emptyText="暂无失败批次"
        />
      </Panel>
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add web/src/pages/ingest/
git commit -m "feat(web): implement IngestPage + useIngestHealth"
```

---

### Task 14: BatchesPage

**Files:**
- Create: `web/src/pages/batches/useBatchList.ts`
- Modify: `web/src/pages/batches/BatchesPage.tsx`

- [ ] **Step 1: Create `useBatchList.ts`**

```ts
import { useQuery } from '@tanstack/react-query';
import type { BatchListResponse } from '@sdd-telemetry/api';
import { requestData } from '../../api/client';

export function useBatchList(status?: string, limit = 50) {
  const params = new URLSearchParams({ limit: String(limit) });
  if (status) params.set('status', status);
  return useQuery({
    queryKey: ['batches', status, limit],
    queryFn: () => requestData<BatchListResponse>(`/api/ingest/batches?${params}`),
    staleTime: 15_000,
  });
}
```

- [ ] **Step 2: Implement `BatchesPage.tsx`**

```tsx
import { FileStack } from 'lucide-react';
import { useBatchList } from './useBatchList';
import { Panel } from '../../components/ui/Panel';
import { DataTable } from '../../components/ui/DataTable';
import { StatusBadge } from '../../components/ui/StatusBadge';
import { formatInteger, formatBytes, formatTime, truncate } from '../../lib/format';

export default function BatchesPage() {
  const { data } = useBatchList();

  return (
    <Panel title="批次列表" icon={<FileStack size={18} />}>
      <DataTable
        headers={['状态', 'id', '接收时间', 'payload', 'rawLog数', '事件数', '派生数', '重复数', '耗时', '错误']}
        rows={(data?.items ?? []).map((b) => [
          <StatusBadge key="s" status={b.status} />,
          b.id,
          formatTime(b.receivedAt),
          formatBytes(b.payloadBytes),
          formatInteger(b.rawLogCount),
          formatInteger(b.eventCount),
          formatInteger(b.derivedCount),
          formatInteger(b.duplicateCount),
          b.parseDurationMs == null ? '—' : `${b.parseDurationMs} ms`,
          truncate(b.lastError, 120),
        ])}
      />
    </Panel>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add web/src/pages/batches/
git commit -m "feat(web): implement BatchesPage + useBatchList"
```

---

### Task 15: EventsPage

**Files:**
- Create: `web/src/pages/events/useEventDistribution.ts`
- Create: `web/src/pages/events/useEventTimeline.ts`
- Modify: `web/src/pages/events/EventsPage.tsx`

- [ ] **Step 1: Create `useEventDistribution.ts`**

```ts
import { useQuery } from '@tanstack/react-query';
import type { EventDistribution } from '@sdd-telemetry/api';
import { requestData } from '../../api/client';

export function useEventDistribution(timeRange: '6h' | '24h' | '72h', limit = 50) {
  const hours = Number(timeRange.replace('h', ''));
  const from  = new Date(Date.now() - hours * 3_600_000).toISOString();
  return useQuery({
    queryKey: ['events-distribution', timeRange],
    queryFn: () => requestData<EventDistribution>(`/api/events/distribution?from=${from}&limit=${limit}`),
    staleTime: 15_000,
  });
}
```

- [ ] **Step 2: Create `useEventTimeline.ts`**

```ts
import { useQuery } from '@tanstack/react-query';
import type { EventTimeline } from '@sdd-telemetry/api';
import { requestData } from '../../api/client';

export function useEventTimeline(timeRange: '6h' | '24h' | '72h') {
  const hours = Number(timeRange.replace('h', ''));
  const from  = new Date(Date.now() - hours * 3_600_000).toISOString();
  return useQuery({
    queryKey: ['events-timeline', timeRange],
    queryFn: () => requestData<EventTimeline>(`/api/events/timeline?from=${from}`),
    staleTime: 15_000,
  });
}
```

- [ ] **Step 3: Implement `EventsPage.tsx`**

```tsx
import { Activity, BarChart3, Clock3, Search } from 'lucide-react';
import { useEventDistribution } from './useEventDistribution';
import { useEventTimeline } from './useEventTimeline';
import { StatCard } from '../../components/ui/StatCard';
import { Panel } from '../../components/ui/Panel';
import { BarList } from '../../components/ui/BarList';
import { EmptyState } from '../../components/ui/EmptyState';
import { formatInteger, formatTime, formatDateTime } from '../../lib/format';

interface EventsPageProps { timeRange?: '6h' | '24h' | '72h' }

export default function EventsPage({ timeRange = '24h' }: EventsPageProps) {
  const dist     = useEventDistribution(timeRange);
  const timeline = useEventTimeline(timeRange);
  const peak     = [...(timeline.data?.buckets ?? [])].sort((a, b) => b.eventCount - a.eventCount)[0];
  const maxCount = Math.max(...(timeline.data?.buckets ?? []).map((b) => b.eventCount), 1);

  return (
    <div className="grid gap-3">
      <div className="grid grid-cols-4 gap-3">
        <StatCard icon={<Activity  size={18} />} label="事件总数"  value={formatInteger(dist.data?.totalEvents)}         hint="totalEvents" />
        <StatCard icon={<BarChart3 size={18} />} label="事件类型"  value={formatInteger(dist.data?.distinctEventNames)}  hint="distinct types" />
        <StatCard icon={<Clock3    size={18} />} label="峰值时段"  value={formatTime(peak?.bucketStart)}                  hint={`${formatInteger(peak?.eventCount)} events`} />
        <StatCard icon={<Search    size={18} />} label="时间桶数"  value={formatInteger(timeline.data?.buckets.length)}  hint="timeline buckets" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Panel title="事件排行" icon={<BarChart3 size={18} />}>
          <BarList
            items={(dist.data?.items ?? []).map((i) => ({
              label: i.eventName,
              sub:   i.description ?? i.eventName,
              value: i.count,
              ratio: i.percentage,
            }))}
          />
        </Panel>
        <Panel title="事件趋势" icon={<Activity size={18} />}>
          {(timeline.data?.buckets ?? []).length === 0
            ? <EmptyState text="暂无趋势数据" />
            : (
              <div className="flex items-end gap-1.5 min-h-[220px] pt-[10px]">
                {(timeline.data?.buckets ?? []).slice(-24).map((b) => (
                  <div
                    key={b.bucketStart}
                    className="flex flex-col items-center justify-end gap-2 flex-1 min-w-5 h-[220px]"
                    title={`${formatDateTime(b.bucketStart)} ${b.eventCount}`}
                  >
                    <div
                      className="w-full min-h-1 rounded-t-[3px]"
                      style={{ height: `${Math.max((b.eventCount / maxCount) * 100, 4)}%`, background: '#c9ce3c' }}
                    />
                    <span
                      className="max-w-12 overflow-hidden text-[10px] text-[var(--color-muted)] truncate"
                      style={{ writingMode: 'vertical-rl' }}
                    >
                      {formatTime(b.bucketStart)}
                    </span>
                  </div>
                ))}
              </div>
            )
          }
        </Panel>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Commit**

```bash
git add web/src/pages/events/
git commit -m "feat(web): implement EventsPage + hooks"
```

---

### Task 16: QualityPage

**Files:**
- Create: `web/src/pages/quality/useFieldCoverage.ts`
- Modify: `web/src/pages/quality/QualityPage.tsx`

- [ ] **Step 1: Create `useFieldCoverage.ts`**

```ts
import { useQuery } from '@tanstack/react-query';
import type { FieldCoverage } from '@sdd-telemetry/api';
import { requestData } from '../../api/client';

export function useFieldCoverage() {
  return useQuery({
    queryKey: ['field-coverage'],
    queryFn: () => requestData<FieldCoverage>('/api/events/field-coverage'),
    staleTime: 30_000,
  });
}
```

- [ ] **Step 2: Implement `QualityPage.tsx`**

```tsx
import { Activity, AlertCircle, Code2, Gauge, ListFilter } from 'lucide-react';
import { useFieldCoverage } from './useFieldCoverage';
import { StatCard } from '../../components/ui/StatCard';
import { Panel } from '../../components/ui/Panel';
import { DataTable } from '../../components/ui/DataTable';
import { formatInteger, formatPercent, truncate } from '../../lib/format';

export default function QualityPage() {
  const { data } = useFieldCoverage();
  const fields      = data?.fields ?? [];
  const lowCoverage = fields.filter((f) => f.coverageRate < 0.8);
  const average     = fields.length > 0
    ? fields.reduce((s, f) => s + f.coverageRate, 0) / fields.length
    : null;

  return (
    <div className="grid gap-3">
      <div className="grid grid-cols-4 gap-3">
        <StatCard icon={<Activity    size={18} />} label="事件总数"    value={formatInteger(data?.totalEvents)} hint="totalEvents" />
        <StatCard icon={<Code2       size={18} />} label="字段数"      value={formatInteger(fields.length)}    hint="field paths" />
        <StatCard icon={<AlertCircle size={18} />} label="低覆盖字段"  value={formatInteger(lowCoverage.length)} hint="coverageRate < 80%" />
        <StatCard icon={<Gauge       size={18} />} label="平均覆盖率"  value={formatPercent(average)}          hint="all fields" />
      </div>
      <Panel title="字段覆盖率" icon={<ListFilter size={18} />}>
        <DataTable
          headers={['字段', '覆盖率', '出现次数', '样例']}
          rows={fields.map((f) => [
            f.fieldPath,
            formatPercent(f.coverageRate),
            formatInteger(f.presentCount),
            truncate(f.examples[0], 90),
          ])}
        />
      </Panel>
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add web/src/pages/quality/
git commit -m "feat(web): implement QualityPage + useFieldCoverage"
```

---

### Task 17: FunnelPage

**Files:**
- Create: `web/src/pages/sdd/funnel/useSddFunnel.ts`
- Modify: `web/src/pages/sdd/funnel/FunnelPage.tsx`

- [ ] **Step 1: Create `useSddFunnel.ts`**

```ts
import { useQuery } from '@tanstack/react-query';
import type { SddFunnel } from '@sdd-telemetry/api';
import { requestData } from '../../../api/client';

export function useSddFunnel(timeRange: '6h' | '24h' | '72h') {
  const hours = Number(timeRange.replace('h', ''));
  const from  = new Date(Date.now() - hours * 3_600_000).toISOString();
  return useQuery({
    queryKey: ['sdd-funnel', timeRange],
    queryFn: () => requestData<SddFunnel>(`/api/sdd/funnel?from=${from}`),
    staleTime: 15_000,
  });
}
```

- [ ] **Step 2: Implement `FunnelPage.tsx`**

```tsx
import { CheckSquare, GitBranch, Layers3, Workflow } from 'lucide-react';
import { useSddFunnel } from './useSddFunnel';
import { StatCard } from '../../../components/ui/StatCard';
import { Panel } from '../../../components/ui/Panel';
import { BarList } from '../../../components/ui/BarList';
import { formatInteger, formatPercent } from '../../../lib/format';

export default function FunnelPage() {
  const { data } = useSddFunnel('24h');
  const cq = data?.callQuality;

  return (
    <div className="grid gap-3">
      <div className="grid grid-cols-4 gap-3">
        <StatCard icon={<Workflow   size={18} />} label="交互总数"    value={formatInteger(data?.totalInteractions)}    hint="sdd_interactions" />
        <StatCard icon={<Layers3    size={18} />} label="技能调用数"  value={formatInteger(data?.totalSkillUsages)}     hint="sdd_skill_usages" />
        <StatCard icon={<CheckSquare size={18} />} label="配对成功率" value={formatPercent(cq?.pairingSuccessRate)}     hint="paired / triggered" />
        <StatCard icon={<GitBranch  size={18} />} label="覆盖语义数" value={formatInteger(data?.stages.length)}        hint="semantic stages" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Panel title="调用质量漏斗" icon={<Workflow size={18} />}>
          <div className="grid gap-2">
            {[
              ['已触发',   formatInteger(cq?.triggeredCount)],
              ['有提示词', formatInteger(cq?.withPromptCount)],
              ['有回答',   formatInteger(cq?.withResponseCount)],
              ['已配对',   formatInteger(cq?.pairedCount)],
            ].map(([label, value]) => (
              <div
                key={label}
                className="flex items-center justify-between min-h-9 px-[10px] rounded-[4px]"
                style={{ border: '1px solid var(--color-border)', background: '#171717' }}
              >
                <span className="text-[12px] text-[var(--color-muted)]">{label}</span>
                <strong className="text-[13px] text-[#f5f5f5]" style={{ fontFamily: 'var(--font-mono)' }}>{value}</strong>
              </div>
            ))}
          </div>
        </Panel>
        <Panel title="语义分布" icon={<Layers3 size={18} />}>
          <BarList
            items={(data?.stages ?? []).map((s) => ({
              label: s.displayName,
              sub:   `${s.semanticCode} / ${s.userCount} users`,
              value: s.usageCount,
              ratio: s.conversionRate ?? 0,
            }))}
          />
        </Panel>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add web/src/pages/sdd/funnel/
git commit -m "feat(web): implement FunnelPage + useSddFunnel"
```

---

### Task 18: SummaryPage

**Files:**
- Create: `web/src/pages/sdd/summary/useSddUsageSummary.ts`
- Modify: `web/src/pages/sdd/summary/SummaryPage.tsx`

- [ ] **Step 1: Create `useSddUsageSummary.ts`**

```ts
import { useQuery } from '@tanstack/react-query';
import type { SddUsageSummaryResponse } from '@sdd-telemetry/api';
import { requestData } from '../../../api/client';

export function useSddUsageSummary(timeRange: '6h' | '24h' | '72h') {
  const hours = Number(timeRange.replace('h', ''));
  const from  = new Date(Date.now() - hours * 3_600_000).toISOString();
  return useQuery({
    queryKey: ['sdd-usage-summary', timeRange],
    queryFn: () => requestData<SddUsageSummaryResponse>(`/api/sdd/usage-summary?from=${from}&limit=100`),
    staleTime: 15_000,
  });
}
```

- [ ] **Step 2: Implement `SummaryPage.tsx`**

```tsx
import { Layers3 } from 'lucide-react';
import { useSddUsageSummary } from './useSddUsageSummary';
import { Panel } from '../../../components/ui/Panel';
import { DataTable } from '../../../components/ui/DataTable';
import { formatInteger, formatTime } from '../../../lib/format';

export default function SummaryPage() {
  const { data } = useSddUsageSummary('24h');

  return (
    <Panel title="技能概览" icon={<Layers3 size={18} />}>
      <DataTable
        headers={['技能 / 语义', '调用次数', '用户数', '会话数', '工作项', '版本', '首次', '最近']}
        rows={(data?.items ?? []).map((item) => [
          `${item.rawSkillName} / ${item.semanticDisplayName ?? item.semanticCode ?? '未匹配'}`,
          formatInteger(item.usageCount),
          formatInteger(item.activeUserCount),
          formatInteger(item.sessionCount),
          formatInteger(item.workItemCount),
          item.versions.map((v) => `${v.version}(${v.count})`).join(', ') || '—',
          formatTime(item.firstSeenAt),
          formatTime(item.lastSeenAt),
        ])}
      />
    </Panel>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add web/src/pages/sdd/summary/
git commit -m "feat(web): implement SummaryPage + useSddUsageSummary"
```

---

### Task 19: InteractionsPage

**Files:**
- Create: `web/src/pages/sdd/interactions/useSddInteractions.ts`
- Modify: `web/src/pages/sdd/interactions/InteractionsPage.tsx`

- [ ] **Step 1: Create `useSddInteractions.ts`**

```ts
import { useQuery } from '@tanstack/react-query';
import type { SddInteractionItem } from '@sdd-telemetry/api';
import { requestData } from '../../../api/client';

export function useSddInteractions(timeRange: '6h' | '24h' | '72h', limit = 100) {
  const hours = Number(timeRange.replace('h', ''));
  const from  = new Date(Date.now() - hours * 3_600_000).toISOString();
  return useQuery({
    queryKey: ['sdd-interactions', timeRange],
    queryFn: () => requestData<SddInteractionItem[]>(`/api/sdd/interactions?from=${from}&limit=${limit}`),
    staleTime: 15_000,
  });
}
```

- [ ] **Step 2: Implement `InteractionsPage.tsx`**

```tsx
import { Workflow } from 'lucide-react';
import { useSddInteractions } from './useSddInteractions';
import { Panel } from '../../../components/ui/Panel';
import { DataTable } from '../../../components/ui/DataTable';
import { StatusBadge } from '../../../components/ui/StatusBadge';
import { formatTime, truncate } from '../../../lib/format';

interface InteractionsPageProps {
  timeRange?: '6h' | '24h' | '72h';
  search?: string;
}

export default function InteractionsPage({ timeRange = '24h', search = '' }: InteractionsPageProps) {
  const { data } = useSddInteractions(timeRange);

  const rows = (data ?? []).filter((item) => {
    if (!search) return true;
    return `${item.sessionId} ${item.promptId} ${item.userId} ${item.commandName}`
      .toLowerCase()
      .includes(search.toLowerCase());
  });

  return (
    <Panel title="交互明细" icon={<Workflow size={18} />}>
      <DataTable
        headers={['时间', '用户', 'sessionId', 'promptId', '模型', '状态', '耗时', '提示词预览', '回答预览']}
        rows={rows.map((item) => [
          formatTime(item.completedAt ?? item.startedAt),
          item.userId ?? '—',
          item.sessionId ?? '—',
          item.promptId ?? '—',
          item.model ?? '—',
          <StatusBadge key="s" status={item.status} />,
          item.durationMs == null ? '—' : `${item.durationMs} ms`,
          truncate(item.promptPreview, 140),
          truncate(item.responsePreview, 160),
        ])}
      />
    </Panel>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add web/src/pages/sdd/interactions/
git commit -m "feat(web): implement InteractionsPage + useSddInteractions"
```

---

### Task 20: UsersPage

**Files:**
- Create: `web/src/pages/sdd/users/useSddUsers.ts`
- Modify: `web/src/pages/sdd/users/UsersPage.tsx`

- [ ] **Step 1: Create `useSddUsers.ts`**

```ts
import { useQuery } from '@tanstack/react-query';
import type { SddUserItem } from '@sdd-telemetry/api';
import { requestData } from '../../../api/client';

export function useSddUsers() {
  return useQuery({
    queryKey: ['sdd-users'],
    queryFn: () => requestData<SddUserItem[]>('/api/sdd/users'),
    staleTime: 30_000,
  });
}
```

- [ ] **Step 2: Implement `UsersPage.tsx`**

```tsx
import { UserRound } from 'lucide-react';
import { useSddUsers } from './useSddUsers';
import { Panel } from '../../../components/ui/Panel';
import { DataTable } from '../../../components/ui/DataTable';
import { formatInteger, formatTime } from '../../../lib/format';

export default function UsersPage() {
  const { data } = useSddUsers();

  return (
    <Panel title="用户维度" icon={<UserRound size={18} />}>
      <DataTable
        headers={['用户', 'installId', 'machineId', 'machineName', '交互数', '技能调用', '最近活跃']}
        rows={(data ?? []).map((u) => [
          u.userName ?? u.userKey,
          u.installId ?? '—',
          u.machineId ?? '—',
          u.machineName ?? '—',
          formatInteger(u.interactionCount),
          formatInteger(u.skillUsageCount),
          formatTime(u.lastSeenAt),
        ])}
      />
    </Panel>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add web/src/pages/sdd/users/
git commit -m "feat(web): implement UsersPage + useSddUsers"
```

---

### Task 21: WorkItemsPage

**Files:**
- Create: `web/src/pages/sdd/work-items/useSddWorkItems.ts`
- Modify: `web/src/pages/sdd/work-items/WorkItemsPage.tsx`

- [ ] **Step 1: Create `useSddWorkItems.ts`**

```ts
import { useQuery } from '@tanstack/react-query';
import type { SddWorkItem } from '@sdd-telemetry/api';
import { requestData } from '../../../api/client';

export function useSddWorkItems(limit = 100) {
  return useQuery({
    queryKey: ['sdd-work-items'],
    queryFn: () => requestData<SddWorkItem[]>(`/api/sdd/work-items?limit=${limit}`),
    staleTime: 30_000,
  });
}
```

- [ ] **Step 2: Implement `WorkItemsPage.tsx`**

```tsx
import { GitBranch } from 'lucide-react';
import { useSddWorkItems } from './useSddWorkItems';
import { Panel } from '../../../components/ui/Panel';
import { DataTable } from '../../../components/ui/DataTable';
import { formatTime } from '../../../lib/format';

export default function WorkItemsPage() {
  const { data } = useSddWorkItems();

  return (
    <Panel title="工作项" icon={<GitBranch size={18} />}>
      <DataTable
        headers={['标题', 'slug', '业务域', '需求库', '相对路径', '首次', '最近']}
        rows={(data ?? []).map((item) => [
          item.workItemTitle ?? item.workItemSlug,
          item.workItemSlug,
          item.businessDomain ?? '—',
          item.requirementsRepoName ?? '—',
          item.relativeDir,
          formatTime(item.firstSeenAt),
          formatTime(item.lastSeenAt),
        ])}
      />
    </Panel>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add web/src/pages/sdd/work-items/
git commit -m "feat(web): implement WorkItemsPage + useSddWorkItems"
```

---

### Task 22: SemanticsPage (includes CREATE form)

**Files:**
- Create: `web/src/pages/sdd/semantics/useSddSemantics.ts`
- Create: `web/src/pages/sdd/semantics/CreateSemanticForm.tsx`
- Modify: `web/src/pages/sdd/semantics/SemanticsPage.tsx`

- [ ] **Step 1: Create `useSddSemantics.ts`**

```ts
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CreateSddSemanticRequest, SddSemantic } from '@sdd-telemetry/api';
import { requestData } from '../../../api/client';

export function useSddSemantics() {
  return useQuery({
    queryKey: ['sdd-semantics'],
    queryFn: () => requestData<SddSemantic[]>('/api/sdd/semantics'),
    staleTime: 30_000,
  });
}

export function useCreateSddSemantic() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateSddSemanticRequest) =>
      requestData<SddSemantic>('/api/sdd/semantics', {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['sdd-semantics'] }),
  });
}
```

- [ ] **Step 2: Create `CreateSemanticForm.tsx`**

```tsx
import { useState } from 'react';
import { Plus } from 'lucide-react';
import { useCreateSddSemantic } from './useSddSemantics';
import { Panel } from '../../../components/ui/Panel';

export function CreateSemanticForm() {
  const [code,    setCode]    = useState('');
  const [name,    setName]    = useState('');
  const [aliases, setAliases] = useState('');
  const mutation = useCreateSddSemantic();

  const inputCls = 'w-full min-h-8 px-[10px] rounded-[4px] text-[12px] text-[var(--color-text)] outline-none bg-[var(--color-base)] transition-colors';
  const borderCls = 'border border-[rgba(255,255,255,0.10)] focus:border-[rgba(250,255,105,0.55)]';

  return (
    <Panel title="新增语义" icon={<Plus size={18} />}>
      <form
        className="grid gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          mutation.mutate({
            semanticCode: code,
            displayName:  name,
            aliases:      aliases.split('\n').map((s) => s.trim()).filter(Boolean),
          });
          setCode(''); setName(''); setAliases('');
        }}
      >
        <label className="grid gap-1.5 text-[12px] text-[var(--color-secondary)]">
          语义编码
          <input className={`${inputCls} ${borderCls}`} value={code} onChange={(e) => setCode(e.target.value)} required />
        </label>
        <label className="grid gap-1.5 text-[12px] text-[var(--color-secondary)]">
          展示名
          <input className={`${inputCls} ${borderCls}`} value={name} onChange={(e) => setName(e.target.value)} required />
        </label>
        <label className="grid gap-1.5 text-[12px] text-[var(--color-secondary)]">
          技能别名（每行一个）
          <textarea
            className={`${inputCls} ${borderCls} min-h-[108px] p-2 resize-y`}
            placeholder="每行一个 alias"
            value={aliases}
            onChange={(e) => setAliases(e.target.value)}
          />
        </label>
        <button
          type="submit"
          disabled={mutation.isPending}
          className="min-h-[34px] rounded-[4px] font-bold text-[var(--color-base)] bg-[var(--color-primary)] disabled:opacity-65 disabled:cursor-not-allowed border-0"
        >
          {mutation.isPending ? '提交中…' : '新增语义'}
        </button>
        {mutation.error && (
          <p className="text-[12px] text-[var(--color-bad-text)]">{mutation.error.message}</p>
        )}
      </form>
    </Panel>
  );
}
```

- [ ] **Step 3: Implement `SemanticsPage.tsx`**

```tsx
import { Settings } from 'lucide-react';
import { useSddSemantics } from './useSddSemantics';
import { CreateSemanticForm } from './CreateSemanticForm';
import { Panel } from '../../../components/ui/Panel';
import { DataTable } from '../../../components/ui/DataTable';

export default function SemanticsPage() {
  const { data } = useSddSemantics();

  return (
    <div className="grid gap-3" style={{ gridTemplateColumns: 'minmax(0,1.5fr) minmax(320px,0.75fr)' }}>
      <Panel title="语义列表" icon={<Settings size={18} />}>
        <DataTable
          headers={['语义编码', '展示名', '描述', '技能别名']}
          rows={(data ?? []).map((item) => [
            item.semanticCode,
            item.displayName,
            item.description ?? '—',
            item.aliases.map((a) => a.skillName).join(', '),
          ])}
        />
      </Panel>
      <CreateSemanticForm />
    </div>
  );
}
```

- [ ] **Step 4: Commit**

```bash
git add web/src/pages/sdd/semantics/
git commit -m "feat(web): implement SemanticsPage, CreateSemanticForm, useSddSemantics"
```

---

### Task 23: QueuePage

**Files:**
- Create: `web/src/pages/ops/queue/useOpsQueue.ts`
- Create: `web/src/pages/ops/queue/useOpsJobs.ts`
- Modify: `web/src/pages/ops/queue/QueuePage.tsx`

- [ ] **Step 1: Create `useOpsQueue.ts`**

```ts
import { useQuery } from '@tanstack/react-query';
import type { OpsQueue } from '@sdd-telemetry/api';
import { requestData } from '../../../api/client';

export function useOpsQueue() {
  return useQuery({
    queryKey: ['ops-queue'],
    queryFn: () => requestData<OpsQueue>('/api/ops/queue'),
    staleTime: 10_000,
  });
}
```

- [ ] **Step 2: Create `useOpsJobs.ts`**

```ts
import { useQuery } from '@tanstack/react-query';
import type { OpsJobsResponse } from '@sdd-telemetry/api';
import { requestData } from '../../../api/client';

export function useOpsJobs(limit = 50) {
  return useQuery({
    queryKey: ['ops-jobs', limit],
    queryFn: () => requestData<OpsJobsResponse>(`/api/ops/jobs?limit=${limit}`),
    staleTime: 10_000,
  });
}
```

- [ ] **Step 3: Implement `QueuePage.tsx`**

```tsx
import { Activity, AlertCircle, Clock3, Loader2, TerminalSquare } from 'lucide-react';
import { useOpsQueue } from './useOpsQueue';
import { useOpsJobs } from './useOpsJobs';
import { StatCard } from '../../../components/ui/StatCard';
import { Panel } from '../../../components/ui/Panel';
import { DataTable } from '../../../components/ui/DataTable';
import { StatusBadge } from '../../../components/ui/StatusBadge';
import { formatInteger, formatTime, truncate } from '../../../lib/format';

export default function QueuePage() {
  const { data: queue } = useOpsQueue();
  const { data: jobs  } = useOpsJobs();

  return (
    <div className="grid gap-3">
      <div className="grid grid-cols-4 gap-3">
        <StatCard icon={<Clock3      size={18} />} label="pendingOutbox" value={formatInteger(queue?.pendingOutbox)} hint="待投递" />
        <StatCard icon={<Loader2     size={18} />} label="queuedJobs"    value={formatInteger(queue?.queuedJobs)}    hint="队列中" />
        <StatCard icon={<Activity    size={18} />} label="activeJobs"    value={formatInteger(queue?.activeJobs)}    hint="执行中" />
        <StatCard icon={<AlertCircle size={18} />} label="failedJobs"    value={formatInteger(queue?.failedJobs)}    hint="失败任务" />
      </div>
      <Panel title="Job 列表" icon={<TerminalSquare size={18} />}>
        <DataTable
          headers={['id', 'kind', '状态', 'aggregateId', 'attempts', '错误', '创建', '更新']}
          rows={(jobs?.items ?? []).map((job) => [
            job.id,
            job.kind,
            <StatusBadge key="s" status={job.status} />,
            job.aggregateId ?? '—',
            formatInteger(job.attempts),
            truncate(job.lastError, 120),
            formatTime(job.createdAt),
            formatTime(job.updatedAt),
          ])}
        />
      </Panel>
    </div>
  );
}
```

- [ ] **Step 4: Commit**

```bash
git add web/src/pages/ops/queue/
git commit -m "feat(web): implement QueuePage + ops queue hooks"
```

---

### Task 24: DatabasePage

**Files:**
- Create: `web/src/pages/ops/database/useOpsTables.ts`
- Create: `web/src/pages/ops/database/useTableRows.ts`
- Modify: `web/src/pages/ops/database/DatabasePage.tsx`

- [ ] **Step 1: Create `useOpsTables.ts`**

```ts
import { useQuery } from '@tanstack/react-query';
import type { OpsTablesResponse } from '@sdd-telemetry/api';
import { requestData } from '../../../api/client';

export function useOpsTables() {
  return useQuery({
    queryKey: ['ops-tables'],
    queryFn: () => requestData<OpsTablesResponse>('/api/ops/tables'),
    staleTime: 60_000,
  });
}
```

- [ ] **Step 2: Create `useTableRows.ts`**

```ts
import { useQuery } from '@tanstack/react-query';
import type { OpsTableRowsResponse } from '@sdd-telemetry/api';
import { requestData } from '../../../api/client';

interface TableRowsParams {
  tableName: string;
  filterColumn?: string;
  filterValue?: string;
  limit?: number;
}

export function useTableRows({ tableName, filterColumn, filterValue, limit = 50 }: TableRowsParams) {
  const filters =
    filterColumn && filterValue
      ? encodeURIComponent(JSON.stringify([{ column: filterColumn, operator: 'like', value: `%${filterValue}%` }]))
      : '';
  const url = `/api/ops/tables/${tableName}/rows?limit=${limit}${filters ? `&filters=${filters}` : ''}`;

  return useQuery({
    queryKey: ['table-rows', tableName, filterColumn, filterValue],
    queryFn: () => requestData<OpsTableRowsResponse>(url),
    enabled: Boolean(tableName),
    staleTime: 15_000,
  });
}
```

- [ ] **Step 3: Implement `DatabasePage.tsx`**

```tsx
import { useState } from 'react';
import { Code2, Database, HardDrive, Table2 } from 'lucide-react';
import { useOpsTables } from './useOpsTables';
import { useTableRows } from './useTableRows';
import { Panel } from '../../../components/ui/Panel';
import { DataTable } from '../../../components/ui/DataTable';
import { EmptyState } from '../../../components/ui/EmptyState';
import { formatInteger, formatBytes, truncate } from '../../../lib/format';

export default function DatabasePage() {
  const { data: tablesData } = useOpsTables();
  const tables = tablesData?.tables ?? [];

  const [selectedTable,  setSelectedTable]  = useState('');
  const [filterColumn,   setFilterColumn]   = useState('');
  const [filterValue,    setFilterValue]    = useState('');

  const activeName  = selectedTable || tables[0]?.tableName || '';
  const activeTable = tables.find((t) => t.tableName === activeName) ?? tables[0];
  const rows        = useTableRows({ tableName: activeName, filterColumn, filterValue });

  const selectCls = 'min-h-8 px-[10px] rounded-[4px] text-[12px] outline-none text-[var(--color-text)] bg-[var(--color-base)] border border-[rgba(255,255,255,0.10)] focus:border-[rgba(250,255,105,0.55)]';

  return (
    <div className="grid gap-3" style={{ gridTemplateColumns: '280px minmax(0,1fr)' }}>
      {/* Table list sidebar */}
      <Panel title="表列表" icon={<Database size={18} />} className="self-start max-h-[calc(100vh-130px)] overflow-auto">
        <div className="grid gap-1">
          {tables.map((t) => (
            <button
              key={t.tableName}
              onClick={() => { setSelectedTable(t.tableName); setFilterColumn(''); setFilterValue(''); }}
              className={[
                'flex justify-between items-center w-full min-h-8 px-2 rounded-[4px] text-[12px] border-0 text-left transition-colors',
                t.tableName === activeName
                  ? 'text-[var(--color-primary)] bg-[#202016]'
                  : 'text-[var(--color-secondary)] bg-transparent hover:text-[var(--color-primary)] hover:bg-[#202016]',
              ].join(' ')}
            >
              <span className="truncate">{t.tableName}</span>
              <em className="not-italic text-[var(--color-muted)]">{formatInteger(t.estimatedRows)}</em>
            </button>
          ))}
        </div>
      </Panel>

      {/* Right panel */}
      <div className="grid gap-3">
        {/* Filter */}
        <Panel title={activeTable?.tableName ?? '—'} icon={<Table2 size={18} />}>
          <div className="flex gap-2">
            <select
              className={selectCls}
              value={filterColumn}
              onChange={(e) => setFilterColumn(e.target.value)}
            >
              <option value="">选择字段</option>
              {(activeTable?.columns ?? []).map((c) => (
                <option key={c.columnName} value={c.columnName}>{c.columnName}</option>
              ))}
            </select>
            <input
              className={`${selectCls} flex-1`}
              placeholder="LIKE 筛选值"
              value={filterValue}
              onChange={(e) => setFilterValue(e.target.value)}
            />
          </div>
        </Panel>

        {/* Schema */}
        <Panel title="表结构" icon={<Code2 size={18} />}>
          <DataTable
            headers={['columnName', 'dataType', 'nullable', 'key', 'defaultValue', 'extra', 'estimatedMaxSize', 'sizeBasis']}
            rows={(activeTable?.columns ?? []).map((c) => [
              c.columnName,
              c.dataType,
              c.nullable ? 'YES' : 'NO',
              c.key ?? '',
              c.defaultValue ?? '',
              c.extra ?? '',
              c.estimatedMaxSize == null ? '—' : formatBytes(c.estimatedMaxSize),
              c.sizeBasis,
            ])}
          />
        </Panel>

        {/* Rows */}
        <Panel title="表数据" icon={<HardDrive size={18} />}>
          {rows.isLoading
            ? <EmptyState text="加载中…" />
            : (() => {
                const cols = rows.data?.columns ?? [];
                const data = rows.data?.rows   ?? [];
                if (cols.length === 0) return <EmptyState text="暂无数据" />;
                return (
                  <DataTable
                    headers={cols.map((c) => c.columnName)}
                    rows={data.map((row) =>
                      cols.map((c) => truncate(row[c.columnName], 160))
                    )}
                  />
                );
              })()
          }
        </Panel>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Commit**

```bash
git add web/src/pages/ops/database/
git commit -m "feat(web): implement DatabasePage + ops database hooks"
```

---

## Phase 5 — Integration & Cleanup

---

### Task 25: Wire up TopBar state + delete old files

**Files:**
- Modify: `web/src/components/layout/AppShell.tsx`
- Delete: `web/src/App.tsx`
- Delete: `web/src/styles.css`
- Delete: `web/src/api.ts`
- Delete: `web/src/api/client.ts` (old one if it existed before this plan)

- [ ] **Step 1: Lift TimeRange + search state into AppShell**

Replace `AppShell.tsx` entirely:

```tsx
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
```

- [ ] **Step 2: Update pages that need timeRange/search from context**

Pages that need `timeRange`: EventsPage, FunnelPage, SummaryPage, InteractionsPage.
Each uses `useShellContext()` instead of receiving props:

```tsx
// Example: web/src/pages/events/EventsPage.tsx (top of file)
import { useShellContext } from '../../components/layout/AppShell';

export default function EventsPage() {
  const { timeRange } = useShellContext();
  const dist     = useEventDistribution(timeRange);
  const timeline = useEventTimeline(timeRange);
  // ... rest unchanged
}
```

Apply the same pattern to `FunnelPage`, `SummaryPage`, and `InteractionsPage` (use `{ search }` for interactions).

- [ ] **Step 3: Delete old files**

```bash
rm web/src/App.tsx
rm web/src/styles.css
rm web/src/api.ts
```

- [ ] **Step 4: Run typecheck**

```bash
pnpm --filter @sdd-telemetry/web typecheck
```

Expected: zero errors.

- [ ] **Step 5: Run tests**

```bash
pnpm --filter @sdd-telemetry/web test
```

Expected: all tests pass.

- [ ] **Step 6: Start dev server and smoke test every route**

```bash
pnpm --filter @sdd-telemetry/web dev
```

Verify each route loads without console errors:
- `/` — Overview
- `/ingest` — Ingest Health
- `/batches` — Batch List
- `/events` — Events
- `/quality` — Data Quality
- `/sdd/funnel` — Funnel
- `/sdd/summary` — Summary
- `/sdd/interactions` — Interactions
- `/sdd/users` — Users
- `/sdd/work-items` — Work Items
- `/sdd/semantics` — Semantics
- `/ops/queue` — Queue
- `/ops/database` — Database

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat(web): complete frontend rewrite — router, pages, Tailwind, cleanup"
```

---

## Self-review Checklist

- [x] All 13 pages have tasks with full implementation code
- [x] `useBatchList` referenced in Task 13 and defined in Task 14 — Task 13 must run after Task 14, or OverviewPage should be implemented last
- [x] `useShellContext` defined in Task 25 and consumed in Tasks 15/17/18/19 — those pages' `export default` functions use it, so Task 25 Step 2 finalizes them
- [x] All type imports use `@sdd-telemetry/api` — no hand-written API types
- [x] No TBD/TODO placeholders
- [x] `statusVariant` exported from `lib/format.ts` and imported in `StatusBadge.tsx`
- [x] `TimeRange` type exported from `TopBar.tsx` and used in `AppShell.tsx`

**⚠️ Execution order note:** OverviewPage (Task 12) imports hooks from Tasks 13–21. If running in parallel, implement Task 12 last, or ensure placeholder hooks exist first.
