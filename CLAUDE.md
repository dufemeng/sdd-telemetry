# Claude 协作规范

## 语言

- 回复用中文。用户正在学习中文。
- **git commit 消息也用中文**。包括 subject 和 body。

## 编码前必做的四项分析（硬性约束）

在动手写或改任何代码之前，先回答这四个问题。任何一项的答案都可能让你不写这段代码、或者改变写法。

1. **复用分析**：将要写的代码是否已经实现？能不能直接 import？
   - 例：写 fetch 包装前先看 `apps/web/src/api/client.ts` 是否已有 `requestData<T>`
   - 例：写时间格式化前先看 `apps/web/src/lib/format.ts`
2. **抽象分析**：将要写的代码在项目里是否出现过类似形态？要不要先抽成一个 util/hook/组件，再让多处复用？
   - 例：3 个 hook 都写了 `Number(timeRange.replace('h', ''))`，第 4 次出现时就该抽出 `timeRangeToHours` 函数
   - 警惕过早抽象：只出现 1 次时不要抽
3. **影响分析**：本次改动对哪些页面、哪些用户路径、哪些 API 调用方有影响？
   - 改 hook 签名 → 列出所有调用点
   - 改组件 props → 列出所有消费方
4. **破坏性分析**：本次改动会不会破坏现有功能？
   - 类型层面：原来能编译的现在还能编译吗？
   - 运行时层面：原来正确的行为现在还正确吗？
   - 契约层面：API 响应结构有变化吗？前后端都升了吗？

四项分析的结果应该在本次会话的对话里讲清楚，再动手；不需要写到代码注释里。

## 前端硬性约束（不是参考，是必须遵守）

1. **Vercel React 最佳实践** — 组件单一职责、feature-based 目录结构、自定义 hooks 分离数据层、懒加载、TypeScript 严格模式
2. **用户的架构设计方法论** — SOLID 原则（SRP/OCP/DIP）、Container/Presentational 分离、关注点分离、组合优于继承、避免过早抽象（AHA）
3. **消除不必要的硬编码** — 颜色/尺寸用 design token；魔法字符串提常量；表现规则不要写死在通用组件里（用 props 注入）

## 前端架构决策（已确认）

- **路由**：React Router v7，每个视图为独立路由，懒加载
- **CSS**：Tailwind CSS v4，design token 配置到主题，不写全局样式文件
- **目录命名**：顶层路由页面目录叫 `pages/`（不叫 `features/`）
- **数据层**：TanStack Query（已安装）
- **类型**：从 `packages/api` Zod contract 推导，不手写 API 类型

## 本地开发约定

### 启动命令

| 命令 | 行为 |
|---|---|
| `pnpm dev` | 根目录 turbo dev，**并行启全部三个 app**（web 5173/5174、server 4318、worker） |
| `pnpm dev:web` | 只起 web |
| `pnpm dev:server` | 只起 server |
| `pnpm dev:worker` | 只起 worker |

**默认就用 `pnpm dev`**。三个 app 都是 watch 模式（tsx watch / vite HMR），改 `src/` 代码自动重启或热替换，不需要手动重启。

### 什么时候才需要 kill + 重启

watch 模式下绝大多数代码改动都自动生效。**只在以下情况需要 Ctrl-C 重启**：
- 改了 `.env` 或环境变量
- 改了 `vite.config.ts` / `tsconfig.json` / `tsx watch` 配置
- `pnpm install` 增减了依赖
- 进程崩了挂死

不要写 `restart:*` 之类的 script——这些场景一年遇到几次，Ctrl-C 后重跑 `pnpm dev` 就行。

### 不要用 start 模式开发

`pnpm --filter @sdd-telemetry/server start` 跑的是编译后的 `dist/`，跟 `src/` 完全脱钩。后果：你改了代码看不到效果、ApiErrorFilter 之类的新文件根本不存在。**只有真正测部署产物时才用 start，平时一律 dev**。

## 后端验证守则

修后端代码后验证修复是否生效，遵守这三条，避免"假绿"：

1. **优先 dev/watch 模式验证**，不要在 start 模式下测——start 跑的是旧 dist，永远看不到你刚改的 src
2. **测试要构造可证伪查询**：空集结果不能区分"修好+无数据"和"没修好+SQL 错配"。要选一个 "修好返回 N 条、没修好返回 0" 的查询来测
3. **注意 monorepo 构建边界**：`pnpm --filter @sdd-telemetry/api build` 只 rebuild api 包，server 自己的 dist/ 不会跟着重建。在 dev 模式下无此问题（直接读 src）
