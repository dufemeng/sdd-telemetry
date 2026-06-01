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

## 登录与权限

Dashboard 使用独立的 `auth_users` 登录成员表，不复用遥测侧的 `sdd_users`。角色只有两种：

| 角色 | 权限 |
| --- | --- |
| `super_admin` | 查看数据、维护登录成员、编辑语义映射、查看运维/数据库页面 |
| `viewer` | 登录后查看 dashboard 只读数据 |

首次 migration 后初始化唯一的首位超级管理员：

```bash
pnpm db:migrate
pnpm auth:bootstrap-admin -- --username admin --display-name 管理员
```

命令会隐藏输入初始密码；密码至少 12 位。之后由超级管理员在页面 `/admin/users` 中创建、禁用、改密和调整其他成员角色。禁用成员、重置密码或变更角色都会使该成员已有登录状态立即失效。

开发环境会使用仅限本地的 session secret。生产环境必须配置随机密钥，并通过 HTTPS 提供 Web 服务：

```bash
export AUTH_SESSION_SECRET="$(openssl rand -base64 48)"
export AUTH_SESSION_MAX_AGE_SECONDS=604800 # 可选，默认 7 天
```

网页登录只保护 dashboard 与其 API；Claude Code 的 `POST /api/ingest/otlp-logs` 自动上报入口不依赖浏览器 session。

## 离线 Docker 部署

推荐使用脚本打包和部署。默认只打 `app/web` 镜像，MySQL 镜像只在服务器首次缺失时需要单独导入；需要一起打包可加 `INCLUDE_MYSQL=1`。

Mac 本地构建 Linux amd64 离线包：

```bash
pnpm docker:package
# 等价：./scripts/package-docker.sh
```

不传 `VERSION` 时，脚本默认使用中国大陆时区生成可读版本号，例如 `20260525-185012-cst`。产物在 `dist/docker/`，对外传输优先使用单文件 deployment bundle：

```text
dist/docker/sdd-telemetry-images-<VERSION>.tar.gz
dist/docker/sdd-telemetry-images-<VERSION>.tar.gz.sha256
dist/docker/sdd-telemetry-deploy-bundle-<VERSION>.tar.gz
```

bundle 内包含镜像包、镜像 checksum、`compose.prod.yml` 和 `deploy-docker.sh` 四个文件，适合 Release 下载或 IM / scp 中转。

成功打包后脚本会把本次版本写入 `dist/docker/latest-version`；后续 `pnpm docker:release` 和 `./scripts/scp-package.sh` 默认自动使用该版本，不需要再次输入。`VERSION=<自定义版本>` 仍可用于显式覆盖。

如果工作区有未提交改动，脚本默认拒绝构建；临时测试可显式允许：

```bash
ALLOW_DIRTY=1 pnpm docker:package
```

### 知识库文档挂载与零摩擦冷启动

需求详情/交互抽屉里点 Read 类 **wiki** 标签可查看知识库文档内容（弱依赖：读不到只降级，不影响主流程）。知识库**不入仓、不入镜像**（在构建上下文之外，物理隔离），只在运行时由服务器以只读卷提供：

```text
~/project/sdd-telemetry-deploy/      # 部署目录（运行 deploy-docker.sh 处）
  ├── deploy-docker.sh
  ├── compose.prod.yml
  ├── .env                           # 脚本自动维护
  ├── releases/
  └── knowledge/                     # 与脚本同级，git clone 三个知识库到此
      ├── bk-fe-knowledge-trade/
      ├── bk-fe-knowledge-wealth/
      └── bk-fe-knowledge-loan/
```

`server` 容器以 `:ro` 挂载 `knowledge/` 为 `/knowledge`，`KNOWLEDGE_BASE_ROOT=/knowledge`（均有默认，可用 `KNOWLEDGE_BASE_HOST_DIR` / `KNOWLEDGE_BASE_ROOT` 覆盖）。未 clone 也不报错，功能仅降级。本机 dev 直接 `KNOWLEDGE_BASE_ROOT=<本机知识库父目录> pnpm dev:server`。

**零摩擦冷启动**：部署包已在部署目录时，`./deploy/deploy-docker.sh` 即可起——脚本自动建 `knowledge/`、首次自动生成并落盘 `AUTH_SESSION_SECRET`（复用、不轮换）、从本地 bundle 文件名自动识别 `VERSION`。仅当走「服务器在线从 GitHub Release 下载」时才需显式 `VERSION=<版本>`。

### 三台机器发布流程

有 Docker 的 Mac 同时完成打包、生成单文件 bundle 和 GitHub Release 上传：

```bash
gh auth login # 首次执行
REPO=<owner>/<repo> pnpm docker:publish
```

`docker:publish` 自动生成上海时区的 `VERSION` 并贯穿打包与 Release 上传，输出的版本号用于后续两步。它要求已跟踪文件没有未提交改动，未跟踪的本地草稿不参与发布判断。

GitHub Release 中只需要下载 `sdd-telemetry-deploy-bundle-<VERSION>.tar.gz`。如果公司电脑可以通过命令行访问 Release，可先在本机配置一次转发目标；配置文件只保存在本机，不提交到仓库：

```bash
mkdir -p ~/.config/sdd-telemetry
cat > ~/.config/sdd-telemetry/relay.env <<'EOF'
REPO=<owner>/<repo>
SERVER=<ssh-user>@<server-host>
REMOTE_DIR=project/sdd-telemetry-deploy
EOF
```

之后按版本一键从 GitHub Release 下载 bundle 并上传服务器：

```bash
VERSION=<VERSION> pnpm docker:relay
```

私有 Release 可在运行前设置 `GITHUB_TOKEN`；下载需走代理时可设置 `HTTPS_PROXY` / `ALL_PROXY`，或设置 `RELEASE_BASE_URL` 使用内部制品代理。

如果公司电脑不能通过命令行访问 Release，在 Mac 上将以下单文件通过 IM 发送到公司电脑：

```bash
dist/docker/sdd-telemetry-deploy-bundle-<VERSION>.tar.gz
```

公司电脑无需 Docker 或仓库，直接上传该文件：

```bash
scp ~/Downloads/sdd-telemetry-deploy-bundle-<VERSION>.tar.gz \
  <ssh-user>@<server-host>:~/project/sdd-telemetry-deploy/
```

服务器解压 bundle 并执行其中的部署脚本：

```bash
cd ~/project/sdd-telemetry-deploy
tar -xzf sdd-telemetry-deploy-bundle-<VERSION>.tar.gz
chmod +x deploy-docker.sh
AUTH_SESSION_SECRET="$(openssl rand -base64 48)" \
  VERSION=<VERSION> ARCHIVE=sdd-telemetry-images-<VERSION>.tar.gz ./deploy-docker.sh
docker compose --env-file .env -f compose.prod.yml run --rm server \
  node dist/infrastructure/mysql/bootstrap-auth-admin.js --username admin --display-name 管理员
```

`AUTH_SESSION_SECRET` 在第一次部署时传入即可，部署脚本会保存到服务器部署目录的 `.env`；已有部署继续复用已有值，切勿随版本发布轮换，否则全部登录状态会失效。初始化管理员命令也可在代码仓库中连接同一 MySQL 执行。

### GitHub Release 推荐流程

上传 Release 需要本机安装并登录 `gh`。当前 Release asset 为单个 deployment bundle：

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

`REPO` 指向存放 Release asset 的仓库，可以是当前代码仓库，也可以是单独的部署仓库。脚本优先下载 Release 中的 bundle 并解包；同时兼容历史 Release 的散文件 asset。随后执行 `docker load`，更新 `.env` 中的镜像版本和端口，然后启动 `mysql/server/worker/web`。默认 Web 端口为 `18080`，API 端口为 `4318`；覆盖方式：

```bash
WEB_PUBLISHED_PORT=18081 API_PUBLISHED_PORT=4319 REPO=<owner>/<repo> VERSION=<VERSION> ./deploy/deploy-docker.sh
```

私有 Release 下载需要在服务器设置 `GITHUB_TOKEN`。首次初始化需要写种子数据时加 `RUN_SEED=1`；平时默认只跑 migration。

### scp 兜底流程

如果 Release asset 访问不通，仍可传单文件 bundle：

```bash
SERVER=<user>@<server> VERSION=<VERSION> ./scripts/scp-package.sh
```

若该电脑刚执行过 `pnpm docker:package`，可省略 `VERSION`：

```bash
SERVER=<user>@<server> ./scripts/scp-package.sh
```

服务器上执行：

```bash
cd ~/project/sdd-telemetry-deploy
tar -xzf sdd-telemetry-deploy-bundle-<VERSION>.tar.gz
VERSION=<VERSION> ARCHIVE=sdd-telemetry-images-<VERSION>.tar.gz ./deploy-docker.sh
```

默认端口：API `4318`，Web `18080`，MySQL `3306`。可通过 `API_PUBLISHED_PORT`、`WEB_PUBLISHED_PORT`、`MYSQL_PUBLISHED_PORT` 和 `MYSQL_*` 环境变量覆盖。

### 服务质量监测

后台管理区提供 `/ops/resources` 服务质量页，仅 `super_admin` 可见。页面会直接展示 MySQL 数据库大小和表大小排行；如需展示 Docker 容器 CPU、内存、镜像大小和可写层趋势，在服务器部署时启用可选采集器：

```bash
OPS_RESOURCE_MONITOR_ENABLED=1 VERSION=<VERSION> ARCHIVE=sdd-telemetry-images-<VERSION>.tar.gz ./deploy-docker.sh
```

采集器以 `ops-agent` profile 启动，只按 Compose project `sdd-telemetry` 的 label 采集本项目容器，并将快照写入 `ops_resource_snapshots`。它需要只读挂载 Docker socket：`/var/run/docker.sock:/var/run/docker.sock:ro`。可选配置：

```bash
OPS_RESOURCE_POLL_INTERVAL_SECONDS=30
OPS_RESOURCE_RETENTION_DAYS=14
OPS_CPU_WARN_PERCENT=80
OPS_MEMORY_WARN_PERCENT=80
OPS_OUTBOX_FAILED_WARN=1
OPS_OUTBOX_PENDING_WARN=1000
```

## 常用命令

```bash
pnpm dev:web / dev:server / dev:worker   # 单独启动某个服务
pnpm restart:server                      # 强制重启 server（改 .env 或 tsconfig 后用）
pnpm typecheck                           # 全量类型检查
pnpm build                               # 全量构建
pnpm docker:package                      # 构建 linux/amd64 离线镜像包
pnpm docker:bundle                       # 从已有镜像包生成单文件部署 bundle
pnpm docker:release                      # 上传单文件部署 bundle 到 GitHub Release
pnpm docker:publish                      # 有 Docker 的机器一键打包并发布 Release
pnpm docker:relay                        # 无 Docker 的机器下载 Release 并转传服务器
pnpm db:migrate                          # 跑迁移
pnpm db:seed                             # 写入种子数据
pnpm db:verify                           # 验证 schema
pnpm db:reclean                          # 一键重置派生层 + 用最新语义映射重清洗（推荐）
pnpm db:reset-derived                    # 低层：只清空派生表 + 重排队列，不跑 worker
pnpm --filter @sdd-telemetry/worker once # 单次清洗 worker 冒烟
pnpm auth:bootstrap-admin -- --username admin --display-name 管理员 # 首位超级管理员
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

# 身份 / 路径配置走 HTTP header（必须）
export OTEL_EXPORTER_OTLP_HEADERS="sdd-install-id=<stable-install-id>,sdd-user-name=<your-name>,sdd-requirements-root-path=<absolute-requirements-path>,sdd-wiki-root-path=<absolute-wiki-path>"
```

**为什么走 HTTP header 而不是 `OTEL_RESOURCE_ATTRIBUTES`**：Claude Code 内部有两个 LoggerProvider（启动期模块绑一个、用户交互期模块绑另一个），它们的 OTel resource attributes 是各自启动那一刻的 `process.env` 快照，所以 `settings.json` 注入 env 那条路对 startup 期的 Provider **不可靠**——会导致 `sdd_users.requirements_root_path` 一段时间内是 NULL，连带 work item / artifact 识别失效。HTTP exporter 是进程单例，header 是 exporter 启动时配的一份，**每个 POST 必然带这套 header**，从源头绕开双 Provider 时序问题。

服务端识别的 header（大小写不敏感、可被 URL 编码）：

| Header | 用途 | 必需 |
| --- | --- | --- |
| `sdd-install-id` | 安装级别人类可读标签（仅展示用，user_key 由 Claude Code `user.id` 决定） | 推荐 |
| `sdd-user-name` | dashboard 显示名 | 推荐 |
| `sdd-requirements-root-path` | work item / artifact 路径识别 | **必需**（不设这个 work item 功能不工作） |
| `sdd-wiki-root-path` | wiki 路径识别 | 可选 |
| `sdd-machine-id` / `sdd-machine-name` | 机器维度标签 | 可选 |

`api_request` 默认提供 model / cost / tokens；`OTEL_LOG_RAW_API_BODIES=1` 才会提供完整 LLM response 文本，属于敏感配置，只在明确同意采集 prompt、tool details 和 raw API bodies 的环境开启。

`OTEL_RESOURCE_ATTRIBUTES` 仍然支持作为 header 缺失时的 fallback（向后兼容），但**不推荐再用**。

在当前办公网部署的 Claude Code `2.1.150` 实测中，只配置上面的 `OTEL_EXPORTER_OTLP_HEADERS`；不要另设 `OTEL_EXPORTER_OTLP_LOGS_HEADERS`，否则 logs 不入库。

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
