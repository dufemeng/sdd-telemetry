# SDD 质量观测台

SDD（Skill-Driven Development）工作流的全链路观测平台。收集 Claude Code 技能调用的遥测数据，提供实时 dashboard 用于分析技能使用分布、漏斗转化、用户维度和数据质量。

## 技术栈

```
web/        React 19 + Vite + Tailwind CSS v4 + TanStack Query + React Router v7
server/     MidwayJS 4 HTTP API（端口 4318）
worker/     本地异步清洗 worker（BullMQ + outbox 模式）
packages/
  api/      Zod contract + 共享类型（前后端唯一类型来源）
  config/   共享 tsconfig / eslint / prettier
```

数据库：MySQL 8；队列：Redis；构建：pnpm workspace + Turborepo。
本地 MySQL 默认库名、用户名、密码均为 `sdd-telemetry`。

## 本地启动

**前置条件**：Node 20+、pnpm 9+、Docker

```bash
# 1. 依赖
pnpm install

# 2. 基础设施
docker compose up -d mysql redis

# 3. 数据库初始化（仅首次）
pnpm db:migrate
pnpm db:seed

# 4. 启动全部服务（watch 模式）
pnpm dev
```

服务地址：API `http://localhost:4318`，Web `http://localhost:5173`

## 常用命令

```bash
pnpm dev:web / dev:server / dev:worker   # 单独启动某个服务
pnpm restart:server                      # 强制重启 server（改 .env 或 tsconfig 后用）
pnpm typecheck                           # 全量类型检查
pnpm build                               # 全量构建
pnpm db:migrate                          # 跑迁移
pnpm db:seed                             # 写入种子数据
pnpm db:verify                           # 验证 schema
pnpm --filter @sdd-telemetry/worker once # 单次清洗 worker 冒烟
```

## 数据链路

```
Claude Code 插件
  └─ POST /api/ingest/batch
        └─ 写 otel_raw_payloads + ingest_outbox（事务）
              └─ worker 轮询 outbox → 清洗 → 写 sdd_* 派生表
                    └─ Dashboard 查询派生表展示
```

## 文档

- [API Contract](./docs/api-contract.md)
- [数据库模型](./docs/database-model.md)
- [实施方案](./docs/implementation-plan.md)
- [Agent 协作规范](./AGENTS.md)
- [Claude 协作规范](./CLAUDE.md)
