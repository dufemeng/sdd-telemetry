# 系统设计：路由切换淡入淡出微动画

## 目标和约束

**目标**：在 sdd-telemetry 的侧边栏页面切换时，加入页面过渡动画（opacity + x 位移 + blur 三合一效果），提升感知流畅度。

**参考来源**：`sdd-telemetry-aistudio` 项目 `App.tsx` 中的 `AnimatePresence` + `motion.div` 实现。

**约束**：
- `motion` 包已安装（v12.38.0，包名 `motion`，入口 `motion/react`）
- 不引入新依赖
- 不破坏 Suspense 懒加载机制
- 须兼顾 `prefers-reduced-motion` 无障碍需求

## 总体架构

```
AppShell
  └── main
        └── AnimatePresence (mode="wait")
              └── motion.div (key=pathname)  ← 动画层
                    └── Outlet (context)
```

## 动画参数

直接复用 aistudio 的参数：

| 属性 | initial (进入前) | animate (进入后) | exit (离开时) |
|------|------|------|------|
| opacity | 0 | 1 | 0 |
| x | 10 | 0 | -10 |
| filter | blur(10px) | blur(0px) | blur(10px) |

```tsx
transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
```

easing `[0.22, 1, 0.36, 1]` 是 ease-out-expo 近似，出场快、落点自然。

## 实现

**唯一改动文件**：`web/src/components/layout/AppShell.tsx`

```tsx
import { useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { Sidebar } from './Sidebar';
import { TopBar, type TimeRange } from './TopBar';
import type { ShellContext } from './useShellContext';

export function AppShell() {
  const [timeRange, setTimeRange] = useState<TimeRange>('24h');
  const [search,    setSearch]    = useState('');
  const { pathname } = useLocation();
  const prefersReducedMotion = useReducedMotion();

  return (
    <div className="h-screen w-screen overflow-hidden text-[var(--color-text)]"
      style={{
        display: 'grid',
        gridTemplateColumns: '240px 1fr',
        gridTemplateRows: '48px 1fr',
        background: 'var(--color-base)',
      }}
    >
      <Sidebar />
      <TopBar timeRange={timeRange} onTimeRangeChange={setTimeRange}
              search={search} onSearchChange={setSearch} />
      <main className="overflow-hidden"
        style={{ background: 'var(--color-base)', gridColumn: 2, gridRow: 2 }}
      >
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
            <Outlet context={{ timeRange, search } satisfies ShellContext} />
          </motion.div>
        </AnimatePresence>
      </main>
    </div>
  );
}
```

**注意**：`overflow-auto p-[18px]` 从 `<main>` 移到 `motion.div`，`<main>` 改为 `overflow-hidden`，避免动画期间出现双重滚动条。

## 流程

```
用户点击侧边栏链接
  → React Router 更新 location.pathname
  → AnimatePresence 检测到 key 变化
  → 触发旧 motion.div 的 exit 动画（0.3s）
  → exit 完成后（mode="wait"），旧节点卸载
  → 新 motion.div 挂载，触发 initial → animate（0.3s）
```

## 影响分析

- **改动范围**：仅 `AppShell.tsx`，+8 行
- **影响路径**：所有路由切换（13 个页面路由 + 错误页）
- **破坏风险**：`overflow` 属性迁移需验证各页面滚动行为，尤其 `DatabasePage`（有内嵌表格滚动）
