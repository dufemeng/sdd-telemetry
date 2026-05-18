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

## SDD 工作流背景

本平台服务于以下完整的 SDD（Skill-Driven Development）链路：

### 完整链路（公司电脑）

```
init 命令
  └─ clone 团队共用 git 仓库到本地：
       @wiki  = bk-fe-knowledge-trade   （知识库，全团队共用）
       @requirements = bk-fe-requirements-trade （需求过程文档库，全团队共用）
  └─ 写入 settings.json：
       { "pathAliases": { "@wiki": "/path/to/...", "@requirements": "/path/to/..." } }

bk-fe:xxx skills
  └─ 从 @wiki 召回项目/系统知识
  └─ 产出过程文档（proposal.md / design.md / tasks.md）写入 @requirements
```

### @requirements 目录结构（需求维度）

```
bk-fe-requirements-trade/
├── cashier/                              # 业务域
│   └── 2026-04-10-unfreeze-component/   # 需求（work item），以日期+slug命名
│       ├── proposal.md
│       └── bk-cashier-sign-sdk/         # 系统模块
│           ├── design.md
│           └── tasks.md
└── mybank-home/                          # 另一个业务域
    └── 2026-01-08-子女帮父母理财二期/
        └── proposal.md
```

sdd_work_items 对应上面的**需求目录**（日期-slug），sdd_work_item_artifacts 对应其中的**过程文档**。

### work item 写入机制

当 bk-fe skill 调用 Write/Edit 工具把文档写入 @requirements 时，Claude Code 通过 OTel 上报 `tool_result` 事件，`tool_input` 字段包含完整 `file_path`。cleaning-worker 解析这个路径，如果路径中含有 `YYYY-MM-DD-<slug>` 格式的目录段，则推断出 work item 和 artifact，写入 sdd_work_items / sdd_work_item_artifacts。

### 两台电脑的现状

| 电脑 | 有什么 | 没有什么 |
|---|---|---|
| 公司电脑 | 完整的 bk-fe-sdd + @wiki + @requirements 联动 | sdd-telemetry 监控平台 |
| 当前电脑 | sdd-telemetry 监控平台 + bk-fe:xxx skills | @wiki / @requirements 联动 |

目标：在当前电脑完成 sdd-telemetry，然后部署到公司电脑使用。

## 文档

- [API Contract](./docs/api-contract.md)
- [数据库模型](./docs/database-model.md)
- [实施方案](./docs/implementation-plan.md)
- [Agent 协作规范](./AGENTS.md)
- [Claude 协作规范](./CLAUDE.md)
