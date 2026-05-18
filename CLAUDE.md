# Claude 协作规范

## 语言

- 回复用中文。用户正在学习中文。
- **git commit 消息也用中文**。包括 subject 和 body。

## 编码前必做的四项分析（硬性约束）

在动手写或改任何代码之前，先回答这四个问题。任何一项的答案都可能让你不写这段代码、或者改变写法。

1. **复用分析**：将要写的代码是否已经实现？能不能直接 import？
   - 例：写 fetch 包装前先看 `web/src/api/client.ts` 是否已有 `requestData<T>`
   - 例：写时间格式化前先看 `web/src/lib/format.ts`
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

## 本地开发

- 默认 `pnpm dev` 起全部三个 app（watch 模式）；单服务用 `pnpm dev:web` / `dev:server` / `dev:worker`
- 强制重启用 `pnpm restart`（等价于 `pnpm stop && pnpm start`，pnpm 生命周期命令）；单服务用 `restart:web` / `restart:server` / `restart:worker`
- watch 模式下改 `src/` 自动生效；改 `.env` / `vite.config.ts` / `tsconfig.json` / 装依赖 / 进程崩 需手动重启
- 不要用 `node dist/`（start 脚本等价于 dev，不是编译产物）

## 文档保鲜机制

- 目录结构、workspace glob、包名、启动脚本变化时，同步更新 `README.md`、`CLAUDE.md`、`AGENTS.md` 和相关 `docs/`。
- API contract、统一响应、数据库迁移、worker/outbox 语义变化时，同步更新 `docs/api-contract.md`、`docs/implementation-plan.md` 或对应专题文档。
- 提交前检查旧路径残留：

```bash
rg --hidden "ap""ps/(web|server|worker)|\\.\\/ap""ps/(web|server|worker)|ap""ps/" . -g '!node_modules/**' -g '!.git/**'
```

- 基础验证固定跑 `pnpm typecheck` 和 `pnpm build`；影响运行链路时补跑 `docker compose up -d mysql redis`、`pnpm db:migrate`、`pnpm db:seed`、`pnpm db:verify`、`pnpm --filter @sdd-telemetry/worker once` 和至少一个 HTTP health 请求。

## 后端验证

- 在 dev 模式下验证，不在 start 模式
- 构造可证伪查询：空集结果分不清"修好+无数据"和"未修好+错配"
- monorepo 构建边界：`pnpm --filter X build` 只 build X 包
