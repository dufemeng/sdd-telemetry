# SDD 质量观测台

SDD（Skill-Driven Development）工作流的全链路观测平台。收集 Claude Code 技能调用的遥测数据，提供实时 dashboard 用于分析技能使用分布、漏斗转化、用户维度和数据质量。

## 技术栈

```
web/        React 19 + Vite + Tailwind CSS v4 + TanStack Query + React Router v7
server/     MidwayJS 4 HTTP API（端口 4318）
worker/     本地异步清洗 worker（定时扫描 outbox + cleanBatch，对齐 Chair @ScheduleMethod 目标态）
packages/
  api/      Zod contract + 共享类型（前后端唯一类型来源）
  config/   共享 tsconfig / eslint / prettier
```

数据库：MySQL 8；构建：pnpm workspace + Turborepo。
本地 MySQL 默认库名、用户名、密码均为 `sdd-telemetry`。

## 本地启动

**前置条件**：Node 20+、pnpm 9+、Docker

```bash
# 1. 依赖
pnpm install

# 2. 基础设施
docker compose up -d mysql

# 3. 数据库初始化（仅首次）
pnpm db:migrate
pnpm db:seed

# 4. 启动全部服务（watch 模式）
pnpm dev
```

服务地址：API `http://localhost:4318`，Web `http://localhost:5173`

## 离线 Docker 部署

推荐使用脚本打包和部署。默认只打 `app/web` 镜像，MySQL 镜像只在服务器首次缺失时需要单独导入；需要一起打包可加 `INCLUDE_MYSQL=1`。

Mac 本地构建 Linux amd64 离线包：

```bash
pnpm docker:package
# 等价：./scripts/package-docker.sh
```

脚本默认使用当前 git 短 hash 作为版本号，产物在 `dist/docker/`：

```text
dist/docker/sdd-telemetry-images-<VERSION>.tar.gz
dist/docker/sdd-telemetry-images-<VERSION>.tar.gz.sha256
```

如果工作区有未提交改动，脚本会拒绝复用当前 commit hash；临时测试可显式允许：

```bash
ALLOW_DIRTY=1 pnpm docker:package
```

### GitHub Release 推荐流程

上传 Release 需要本机安装并登录 `gh`：

```bash
REPO=<owner>/<repo> pnpm docker:release
# 等价：REPO=<owner>/<repo> ./scripts/upload-release.sh
```

服务器可访问 GitHub Release asset 时，在服务器部署目录执行：

```bash
git clone https://github.com/<owner>/<repo>.git ~/project/sdd-telemetry-deploy # 首次
cd ~/project/sdd-telemetry-deploy
git pull
REPO=<owner>/<repo> VERSION=<VERSION> ./deploy/deploy-docker.sh
```

`REPO` 指向存放 Release asset 的仓库，可以是当前代码仓库，也可以是单独的部署仓库。脚本会下载 Release 里的镜像包和 `compose.prod.yml`，执行 `docker load`，更新 `.env` 中的镜像版本和端口，然后启动 `mysql/server/worker/web`。默认 Web 端口为 `18080`，API 端口为 `4318`；覆盖方式：

```bash
WEB_PUBLISHED_PORT=18081 API_PUBLISHED_PORT=4319 REPO=<owner>/<repo> VERSION=<VERSION> ./deploy/deploy-docker.sh
```

私有 Release 下载需要在服务器设置 `GITHUB_TOKEN`。首次初始化需要写种子数据时加 `RUN_SEED=1`；平时默认只跑 migration。

### scp 兜底流程

如果 Release asset 访问不通，仍可传 tar：

```bash
SERVER=<user>@<server> VERSION=<VERSION> ./scripts/scp-package.sh
```

服务器上执行：

```bash
cd ~/project/sdd-telemetry-deploy
VERSION=<VERSION> ARCHIVE=sdd-telemetry-images-<VERSION>.tar.gz ./deploy-docker.sh
```

默认端口：API `4318`，Web `18080`，MySQL `3306`。可通过 `API_PUBLISHED_PORT`、`WEB_PUBLISHED_PORT`、`MYSQL_PUBLISHED_PORT` 和 `MYSQL_*` 环境变量覆盖。

## 常用命令

```bash
pnpm dev:web / dev:server / dev:worker   # 单独启动某个服务
pnpm restart:server                      # 强制重启 server（改 .env 或 tsconfig 后用）
pnpm typecheck                           # 全量类型检查
pnpm build                               # 全量构建
pnpm docker:package                      # 构建 linux/amd64 离线镜像包
pnpm docker:release                      # 上传离线镜像包到 GitHub Release
pnpm db:migrate                          # 跑迁移
pnpm db:seed                             # 写入种子数据
pnpm db:verify                           # 验证 schema
pnpm db:reset-derived                    # 保留 raw payload，清空并重排派生清洗任务
pnpm --filter @sdd-telemetry/worker once # 单次清洗 worker 冒烟
```

## 数据链路

```
Claude Code 插件
  └─ POST /api/ingest/otlp-logs
        └─ 写 otel_raw_payloads + ingest_outbox（事务）
              └─ worker 轮询 outbox → 清洗 → 写 sdd_* 派生表
                    └─ Dashboard 查询派生表展示
```

## Claude Code OTel 推荐配置

```bash
export CLAUDE_CODE_ENABLE_TELEMETRY=1
export OTEL_LOGS_EXPORTER=otlp
export OTEL_EXPORTER_OTLP_PROTOCOL=http/json
export OTEL_EXPORTER_OTLP_LOGS_ENDPOINT=http://127.0.0.1:4318/api/ingest/otlp-logs
export OTEL_LOG_USER_PROMPTS=1
export OTEL_LOG_TOOL_DETAILS=1
export OTEL_LOG_RAW_API_BODIES=1
```

说明：`api_request` 默认提供 model / cost / tokens；`OTEL_LOG_RAW_API_BODIES=1` 才会提供完整 LLM response 文本，属于敏感配置，只在明确同意采集 prompt、tool details 和 raw API bodies 的环境开启。

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

| 电脑     | 有什么                                        | 没有什么                   |
| -------- | --------------------------------------------- | -------------------------- |
| 公司电脑 | 完整的 bk-fe-sdd + @wiki + @requirements 联动 | sdd-telemetry 监控平台     |
| 当前电脑 | sdd-telemetry 监控平台 + bk-fe:xxx skills     | @wiki / @requirements 联动 |

目标：在当前电脑完成 sdd-telemetry，然后部署到公司电脑使用。

## 文档

- [API Contract](./docs/api-contract.md)
- [数据库模型](./docs/database-model.md)
- [实施方案](./docs/implementation-plan.md)
- [Agent 协作规范](./AGENTS.md)
- [Claude 协作规范](./CLAUDE.md)
