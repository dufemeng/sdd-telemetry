# Agent 协作规范

本文件是 Codex/自动化 agent 的入口规范。人类阅读入口仍以 `README.md` 为主；Claude 专用协作细则在 `CLAUDE.md`。

## 当前仓库结构

```text
sdd-telemetry/
  web/       # React + Vite dashboard
  server/    # MidwayJS HTTP API
  worker/    # 本地清洗运行时 / outbox cleaner
  packages/  # api contract、共享配置、可选共享包
  deploy/    # Docker 运行时配置和服务器部署脚本
  scripts/   # 本地开发、打包、发布辅助脚本
  docs/      # 方案、数据库、API contract、验收文档
```

不要再新增旧的应用容器目录；新的运行时应用应直接放在仓库根目录，新的共享能力放在 `packages/`。

## 变更前四项风险自检

四项自检是动手前的风险门禁，不是每轮对话都要逐项汇报。Agent 应始终在心里检查，但只有命中下列场景时才需要在对话中显式说明结果：

- 新增或修改设计文档、任务清单、提案、实施记录等过程文档。
- 修改 API contract、数据库迁移、worker/outbox 语义、启动脚本、环境变量或跨端依赖方向。
- 修改共享组件、hook、util、service、schema、配置包等会影响多个调用方的代码。
- 单次改动跨多个模块，或可能改变用户路径、运行时行为、数据结构、类型边界。
- Agent 准备新增抽象、迁移目录、重命名公开字段 / 路由 / 包名。

未命中以上场景时，不要求显式输出四项分析；可以直接处理问题。低风险单文件改动可用一句话合并说明风险判断。

需要显式说明时，回答这四个问题：

1. **复用分析**：将要写的代码或方案是否已经实现？能不能直接 import 或复用？
2. **抽象分析**：将要写的代码在项目里是否出现过类似形态？grep 确认后，要不要先抽成 util/hook/组件/方法？（只出现 1 次时不要抽）
3. **破坏性分析**：本次改动会不会破坏现有功能（类型、运行时、API 契约）？
4. **影响分析**：本次改动对哪些页面、路径、调用方有影响？这个影响是否和目标对齐？

结果在对话中说明，不写进代码注释；除非用户要求详细展开，否则保持简短。

## 过程文档存放规则（硬性约束）

所有过程文档——包括但不限于设计文档、任务清单、提案、实施记录，无论由哪个 skill（bk-fe-design、bk-fe-task、bk-fe-proposal、Plan 等）产生——**必须保存在当前项目的 `docs/` 目录下**。

- 禁止保存在 agent 或 Claude 的全局根目录
- 文件命名格式：`design-<topic>.md`、`tasks-<topic>.md`、`proposal-<topic>.md`

## 文档保鲜机制

做以下变更时，必须同步检查 `README.md`、`CLAUDE.md`、`AGENTS.md` 和相关 `docs/`：

- 目录结构、workspace glob、包名、启动脚本发生变化。
- API contract、统一响应结构、Zod schema、前后端依赖方向发生变化。
- 数据库迁移、worker/outbox 语义、本地启动流程发生变化。
- 验证命令、端口、环境变量、Docker 服务发生变化。

提交前至少执行：

```bash
rg --hidden "ap""ps/(web|server|worker)|\\.\\/ap""ps/(web|server|worker)|ap""ps/" . -g '!node_modules/**' -g '!.git/**'
pnpm typecheck
pnpm build
```

如果改动影响运行链路，还要做本地冒烟：

```bash
docker compose up -d mysql
pnpm db:migrate
pnpm db:seed
pnpm db:verify
pnpm --filter @sdd-telemetry/worker once
curl -sS http://127.0.0.1:4318/api/ingest/health
```

需要保留 `otel_raw_payloads` 并重建事件层 / SDD 派生表时，可先执行 `pnpm db:reset-derived`，再执行 `pnpm --filter @sdd-telemetry/worker once`。

Claude Code 客户端 OTel 推荐配置以 `README.md` 为准；当前服务只接 logs 通路 `/api/ingest/otlp-logs`，不要在无 traces ingest 的情况下要求开启 `OTEL_LOG_TOOL_CONTENT`。

## 提交要求

- commit 消息使用中文。
- 不提交 `dist/`、`.turbo/`、`.pnpm-store/`、`node_modules/`。
- 目录移动后，用 `git status --short --renames` 检查 Git 是否能识别 rename。
