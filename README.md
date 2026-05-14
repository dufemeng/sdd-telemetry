# SDD Chair-compatible Monorepo

这是 SDD Monitor 的新 monorepo 方案仓库。

目标不是在旧 `sdd-monitor` demo 上继续修补，而是重新设计一套更贴近公司 Chair 体系的全栈工程：前端保留现有 dashboard 体验，后端按新领域模型、MySQL、异步清洗和 Zod contract 重新实现。

## 核心目标

- 功能目标：跑通 SDD 日志上报、raw 保存、异步清洗、派生分析和 dashboard 展示。
- 学习目标：真实落地 Controller、Service、Repository、ORM、Migration、事务、队列、日志、测试、部署、API contract 和前端工程化。
- 迁移目标：降低未来迁到 Chair（EggJS-like + tegg DI + dal v2 + FaaS）的成本。

## 已冻结方向

```text
pnpm workspace + Turborepo
apps/web      # React + Vite dashboard
apps/server   # MidwayJS HTTP API
apps/worker   # BullMQ worker / outbox dispatcher
packages/api  # Zod contract + shared types + API client
packages/config # 共享 tsconfig / eslint / prettier
```

关键决策：

- 后端不兼容旧 API，按 `ingest / events / sdd / ops` 四个新域设计。
- 前端最低成本适配新 API，不让历史接口污染后端。
- raw 同步入 MySQL，清洗异步执行。
- 使用 `ingest_outbox` 保证清洗任务可靠投递。
- P0 不迁旧 SQLite 历史数据，只验收新上报数据链路。

## 文档

- [实施方案](./docs/implementation-plan.md)
- [数据库模型](./docs/database-model.md)
- [API Contract](./docs/api-contract.md)
- [P0 验收计划](./docs/acceptance-plan.md)

## 本地开发

安装依赖：

```bash
pnpm install
```

启动基础设施：

```bash
docker compose up -d mysql redis
```

初始化数据库：

```bash
pnpm db:migrate
pnpm db:seed
pnpm db:verify
```

启动全部应用：

```bash
pnpm dev
```

也可以单独启动：

```bash
pnpm --filter @sdd-monitor/server dev
pnpm --filter @sdd-monitor/worker dev
pnpm --filter @sdd-monitor/web dev
```

基础验收：

```bash
pnpm typecheck
pnpm build
curl -sS http://127.0.0.1:4318/api/ingest/health
```

当前已完成 Milestone 1 工程骨架和 Milestone 2 数据库模型基线。raw 写入、outbox 投递和清洗 worker 会在后续 Milestone 落地。
