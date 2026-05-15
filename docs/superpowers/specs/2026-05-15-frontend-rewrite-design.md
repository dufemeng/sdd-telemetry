# SDD Monitor 前端重写设计文档

日期：2026-05-15  
状态：已确认，待实施

---

## 1. 背景与目标

### 问题

现有 `apps/web/src/App.tsx`（~988 行）存在以下问题：

- **违反 SRP**：所有组件、所有数据查询、所有业务逻辑堆在一个文件里
- **无效预取**：App 挂载时同时发出 14 个 API 请求，无论用户访问哪个视图
- **无路由**：用 `useState<View>` 切换视图，刷新丢状态，无法直接分享链接
- **无样式封装**：764 行全局 CSS，样式污染无法追踪
- **违反 DIP**：组件直接依赖 `fetch` URL 字符串，后端改字段需要全局搜索

### 目标

用正确的架构重写前端，满足：

1. Vercel React 最佳实践（硬性约束）
2. SOLID 原则（硬性约束）
3. 功能完整覆盖全部 13 个 MVP 页面
4. 与后端 `packages/api` Zod contract 完全对齐，无手写 API 类型

---

## 2. 技术决策

| 决策项 | 结论 | 原因 |
|---|---|---|
| 路由 | React Router v7，`lazy()` 懒加载 | URL 可分享；路由激活才加载代码和数据 |
| CSS | Tailwind CSS v4 | Vercel 首选；design token 配置到主题；天然无全局污染 |
| 目录命名 | `pages/`（非 `features/`） | 每个路由目录的核心产出是页面组件，命名直观 |
| 共享 UI | `components/ui/`（不提升到 `packages/ui`） | 当前只有一个消费方，遵守 AHA / YAGNI 原则 |
| 数据层 | TanStack Query，每页独立 hook | 路由激活时才执行查询；缓存和失效策略集中管理 |
| 类型来源 | `packages/api` Zod contract `z.infer<>` | 类型与运行时校验同源，后端改 schema 前端编译报错 |

---

## 3. 架构分层

五层，从外到内依赖方向单向向下，上层不知道下层实现细节：

```
┌─────────────────────────────────────────────────────┐
│  5. Router  (router.tsx)                            │
│     路由定义 + lazy import，唯一知道 URL 的地方       │
├─────────────────────────────────────────────────────┤
│  4. Page Components  (pages/*/Page.tsx)             │
│     Container 层：调用 hook，把 ViewModel 传给 UI    │
│     不含样式逻辑，不含 fetch，不含业务计算            │
├──────────────────────┬──────────────────────────────┤
│  3a. UI Components   │  3b. Data Hooks              │
│  (components/ui/)    │  (pages/*/use*.ts)           │
│  纯展示，只接 props   │  TanStack Query + ViewModel  │
│  Tailwind 样式        │  转换，返回 Page 消费的结构  │
├──────────────────────┴──────────────────────────────┤
│  1. API Client  (api/client.ts)                     │
│     requestData<T> + 错误处理，唯一知道 baseURL 的地方│
└─────────────────────────────────────────────────────┘
```

### SOLID 映射

- **SRP**：每个文件一个职责。`IngestPage` 只组合，`useIngestHealth` 只取数据，`Kpi` 只渲染
- **OCP**：新增页面只需在 `pages/` 新建目录 + 在 `router.tsx` 加一行，不改已有文件
- **DIP**：Page 依赖 ViewModel 接口（抽象），不依赖 `fetch`。Hook 依赖 `api/client`（抽象），不依赖 URL 字符串
- **ISP**：UI 组件 props 最小化。`<Kpi>` 只要 `label / value / hint`，不接受整个 API response 对象

---

## 4. 目录结构

```
apps/web/
├── index.html
├── vite.config.ts
├── tailwind.config.ts        ← design token 主题配置
└── src/
    ├── main.tsx              ← React DOM render + QueryClient + RouterProvider
    ├── router.tsx            ← 全部路由定义（lazy import）
    ├── api/
    │   └── client.ts         ← requestData<T>，统一错误处理
    ├── components/
    │   ├── ui/                  ← Atomic 层，纯展示
    │   │   ├── StatusBadge.tsx  ← 状态徽章（good/warn/bad/neutral）
    │   │   ├── BarList.tsx      ← 水平条形排行列表
    │   │   ├── DataTable.tsx    ← 通用紧凑表格
    │   │   ├── EmptyState.tsx
    │   │   ├── StatCard.tsx     ← 数字指标卡片
    │   │   └── Panel.tsx        ← 带标题的内容面板
    │   └── layout/           ← Shell 层
    │       ├── AppShell.tsx  ← 整体网格布局
    │       ├── Sidebar.tsx   ← 左侧导航
    │       └── TopBar.tsx    ← 顶部工具栏（搜索 + 时间切换 + 刷新）
    └── pages/
        ├── overview/
        │   └── OverviewPage.tsx
        ├── ingest/
        │   ├── IngestPage.tsx
        │   └── useIngestHealth.ts
        ├── batches/
        │   ├── BatchesPage.tsx
        │   └── useBatchList.ts
        ├── events/
        │   ├── EventsPage.tsx
        │   ├── useEventDistribution.ts
        │   └── useEventTimeline.ts
        ├── quality/
        │   ├── QualityPage.tsx
        │   └── useFieldCoverage.ts
        └── sdd/
        │   ├── funnel/
        │   │   ├── FunnelPage.tsx
        │   │   └── useSddFunnel.ts
        │   ├── summary/
        │   │   ├── SummaryPage.tsx
        │   │   └── useSddUsageSummary.ts
        │   ├── interactions/
        │   │   ├── InteractionsPage.tsx
        │   │   └── useSddInteractions.ts
        │   ├── users/
        │   │   ├── UsersPage.tsx
        │   │   └── useSddUsers.ts
        │   ├── work-items/
        │   │   ├── WorkItemsPage.tsx
        │   │   └── useSddWorkItems.ts
        │   └── semantics/
        │       ├── SemanticsPage.tsx
        │       ├── CreateSemanticForm.tsx  ← SemanticsPage 专属子组件
        │       └── useSddSemantics.ts
        └── ops/
            ├── queue/
            │   ├── QueuePage.tsx
            │   ├── useOpsQueue.ts
            │   └── useOpsJobs.ts
            └── database/
                ├── DatabasePage.tsx
                ├── useOpsTables.ts
                └── useTableRows.ts
```

---

## 5. 关键实现规范

### 5.1 API Client

```ts
// api/client.ts
const BASE = import.meta.env.VITE_API_BASE_URL ?? '';

export async function requestData<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(BASE ? new URL(path, BASE).toString() : path, {
    headers: { 'Content-Type': 'application/json', ...init?.headers },
    ...init,
  });
  const body = await res.json();
  if (!res.ok || !body.success) throw new Error(body.error?.message ?? `HTTP ${res.status}`);
  return body.data as T;
}
```

### 5.2 Data Hook 规范

```ts
// pages/ingest/useIngestHealth.ts
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

规则：
- query key 第一项为资源名，后续项为参数
- 只在对应路由下调用，不在 App 根组件预取
- `staleTime` 统一 15 秒，特殊需求在 hook 内覆盖

### 5.3 Page Component 规范

```ts
// pages/ingest/IngestPage.tsx
import { useIngestHealth } from './useIngestHealth';
import { StatCard } from '../../components/ui/StatCard';
import { Panel } from '../../components/ui/Panel';

export function IngestPage() {
  const { data, isLoading } = useIngestHealth();
  // 只负责组合，不写样式，不写计算逻辑
  return (
    <div className="grid gap-3">
      <div className="grid grid-cols-4 gap-3">
        <StatCard label="已解析" value={data?.parsedBatches} loading={isLoading} />
        <StatCard label="失败" value={data?.failedBatches} loading={isLoading} />
        ...
      </div>
      <Panel title="链路状态">...</Panel>
    </div>
  );
}
```

### 5.4 Router 规范

```ts
// router.tsx
import { createBrowserRouter, lazy } from 'react-router-dom';
import { AppShell } from './components/layout/AppShell';

const OverviewPage    = lazy(() => import('./pages/overview/OverviewPage'));
const IngestPage      = lazy(() => import('./pages/ingest/IngestPage'));
// ... 所有 13 个页面全部 lazy import

export const router = createBrowserRouter([
  {
    path: '/',
    element: <AppShell />,
    children: [
      { index: true,              element: <OverviewPage /> },
      { path: 'ingest',           element: <IngestPage /> },
      { path: 'batches',          element: <BatchesPage /> },
      { path: 'events',           element: <EventsPage /> },
      { path: 'quality',          element: <QualityPage /> },
      { path: 'sdd/funnel',       element: <FunnelPage /> },
      { path: 'sdd/summary',      element: <SummaryPage /> },
      { path: 'sdd/interactions', element: <InteractionsPage /> },
      { path: 'sdd/users',        element: <UsersPage /> },
      { path: 'sdd/work-items',   element: <WorkItemsPage /> },
      { path: 'sdd/semantics',    element: <SemanticsPage /> },
      { path: 'ops/queue',        element: <QueuePage /> },
      { path: 'ops/database',     element: <DatabasePage /> },
    ],
  },
]);
```

### 5.5 Tailwind Design Token 配置

```ts
// tailwind.config.ts（v4 使用 CSS 变量方式）
// src/styles/tokens.css
@import "tailwindcss";

@theme {
  --color-base:    #0a0a0a;
  --color-surface: #101010;
  --color-panel:   #14140b;
  --color-hover:   #171717;
  --color-primary: #faff69;
  --color-text:    #e5e3d3;
  --color-muted:   #93927c;
  --color-border:  rgba(255 255 255 / 0.08);

  --font-ui:   Inter, 'PingFang SC', system-ui, sans-serif;
  --font-mono: 'JetBrains Mono', ui-monospace, monospace;
}
```

---

## 6. 页面与 API 对照

| 路径 | 页面 | 主要 API |
|---|---|---|
| `/` | OverviewPage | `ingest/health` + `sdd/funnel` + `events/distribution` + `sdd/users` |
| `/ingest` | IngestPage | `ingest/health` + `ingest/batches?status=failed*` |
| `/batches` | BatchesPage | `ingest/batches` |
| `/events` | EventsPage | `events/distribution` + `events/timeline` |
| `/quality` | QualityPage | `events/field-coverage` |
| `/sdd/funnel` | FunnelPage | `sdd/funnel` |
| `/sdd/summary` | SummaryPage | `sdd/usage-summary` |
| `/sdd/interactions` | InteractionsPage | `sdd/interactions` |
| `/sdd/users` | UsersPage | `sdd/users` |
| `/sdd/work-items` | WorkItemsPage | `sdd/work-items` |
| `/sdd/semantics` | SemanticsPage | `sdd/semantics`（GET + POST） |
| `/ops/queue` | QueuePage | `ops/queue` + `ops/jobs` |
| `/ops/database` | DatabasePage | `ops/tables` + `ops/tables/:name/rows` |

---

## 7. 不在本次范围内

- 版本分析页（`/api/sdd/versions`）— 数据维度不足，延后
- 异常错误页（`/api/sdd/errors`）— 后端聚合接口未完成，延后
- Batch 详情页（`/api/ingest/batches/:id`）— P1
- Batch 重处理（`POST /api/ingest/batches/:id/reprocess`）— P1
- E2E 测试 — P1，当前 Playwright 已安装但不在本次写代码范围内

---

## 8. 实施顺序建议

1. **基础设施**（串行，其他一切的前提）
   - 安装 React Router v7 + Tailwind CSS v4
   - 写 `api/client.ts`
   - 写 `components/layout/`（AppShell、Sidebar、TopBar）
   - 写 `router.tsx` 骨架（所有路由，页面先用占位符）
   - 配置 Tailwind design token

2. **原子 UI 组件**（可并行）
   - Badge、Kpi、Panel、DataTable、BarList、EmptyState

3. **各页面**（可大量并行，互相独立）
   - 13 个页面各自的 `Page.tsx` + `use*.ts`

4. **集成验收**
   - 启动完整 dev server，逐页验收功能
