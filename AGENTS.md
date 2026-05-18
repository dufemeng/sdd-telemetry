# Agent 协作规范

本文件是 Codex/自动化 agent 的入口规范。人类阅读入口仍以 `README.md` 为主；Claude 专用协作细则在 `CLAUDE.md`。

## 当前仓库结构

```text
sdd-telemetry/
  web/       # React + Vite dashboard
  server/    # MidwayJS HTTP API
  worker/    # 本地清洗运行时 / outbox cleaner
  packages/  # api contract、共享配置、可选共享包
  docs/      # 方案、数据库、API contract、验收文档
```

不要再新增旧的应用容器目录；新的运行时应用应直接放在仓库根目录，新的共享能力放在 `packages/`。

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
docker compose up -d mysql redis
pnpm db:migrate
pnpm db:seed
pnpm db:verify
pnpm --filter @sdd-telemetry/worker once
curl -sS http://127.0.0.1:4318/api/ingest/health
```

## 提交要求

- commit 消息使用中文。
- 不提交 `dist/`、`.turbo/`、`.pnpm-store/`、`node_modules/`。
- 目录移动后，用 `git status --short --renames` 检查 Git 是否能识别 rename。
