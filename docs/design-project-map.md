# 项目掌控地图

更新时间：2026-06-08
状态：当前代码地图，不是新方案
目标读者：需要快速恢复项目技术掌控感的前端开发者

## 1. 这份地图解决什么问题

本项目已经不是一个单纯 dashboard。它现在包含三条需要分开理解的链路：

```text
采集链路：Claude Code OTel logs -> raw batch -> outbox -> worker cleanBatch -> sdd_* 派生表

查询链路：web route -> TanStack Query hook -> /api/* -> server service -> repository -> MySQL

Profile 链路：source_references/profile_* projection -> /api/profiles/* -> 可配置研发观测口径
```

以后读 AI 方案时，先判断它改的是哪条链路。很多坏方案的问题不是代码写错，而是把三条链路混成一条：比如为了改页面指标直接改清洗逻辑，或者为了接一个新 profile 又写一套专属 worker adapter。

## 2. 当前运行时边界

仓库根目录是真实应用边界：

| 目录 | 职责 | 关键入口 |
| --- | --- | --- |
| `web/` | React + Vite dashboard | `web/src/router.tsx`、`web/src/components/layout/AppShell.tsx` |
| `server/` | MidwayJS HTTP API，默认端口 `4318` | `server/src/bootstrap.ts`、`server/src/modules/index.ts` |
| `worker/` | 本地清洗运行时、profile rebuild/diff、ops 采集 | `worker/src/main.ts` |
| `packages/api/` | Zod contract、共享类型、profile 配置 | `packages/api/src/index.ts` |
| `packages/config/` | 共享 tsconfig/prettier 等 | `packages/config/` |
| `deploy/`、`scripts/` | Docker 打包、部署、Release 辅助 | `scripts/package-docker.sh`、`deploy/deploy-docker.sh` |
| `docs/` | 过程文档、设计、验收、实施记录 | 本文也放在这里 |

workspace 只包含：

```text
web
server
worker
packages/*
```

不要再新增旧的 `apps/*` 容器目录。

## 3. 前端怎么跑

### 3.1 Shell 和路由

前端路由集中在 `web/src/router.tsx`。除 `/login` 外，其余页面都包在 `AuthGate -> AppShell` 下。

`AppShell` 提供两个全站上下文：

```text
timeRange: 24h / 7d / 30d
profileId: 默认 sdd-default，存在 localStorage: sdd-telemetry.profileId
```

顶部 `TopBar` 控制时间范围、profile switcher、全局刷新。侧边栏 `Sidebar` 决定页面导航，并根据登录角色追加管理入口。

### 3.2 页面分组

主要页面：

| 页面 | 路由 | 当前主要数据入口 |
| --- | --- | --- |
| 总览 | `/` | `/api/profiles/:profileId/overview`、capability/users/demands |
| 用户分析 | `/sdd/users`、`/sdd/users/:id` | `/api/profiles/:profileId/users`，部分历史详情仍复用 `/api/sdd/*` |
| 技能分析 | `/sdd/skills` | `/api/profiles/:profileId/capabilities/*` |
| 产出分析 | `/sdd/work-items`、详情页 | `/api/profiles/:profileId/demands/*` |
| 知识库分析 | `/sdd/wiki-recalls` | `/api/profiles/:profileId/knowledge/*`，内容读取仍有 `/api/sdd/wiki-recalls/*` |
| 每日简报 | `/reports/daily` | `/api/reports/daily/*` |
| 语义映射 | `/sdd/semantics` | `/api/sdd/semantics` |
| 交互明细 | `/sdd/interactions` | `/api/sdd/interactions` |
| 排障明细 | `/troubleshoot` | 组合查询/排障展示 |
| 采集健康 | `/ingest` | `/api/ingest/health` |
| 字段覆盖 | `/quality` | `/api/events/field-coverage` |
| 数据检索 | `/ops/database` | `/api/ops/tables/*`，仅 `super_admin` |
| 服务质量 | `/ops/resources` | `/api/ops/resources/*`，仅 `super_admin` |
| 成员管理 | `/admin/users` | `/api/auth/users/*`，仅 `super_admin` |

### 3.3 前端数据层规则

统一请求封装在 `web/src/api/client.ts`：

```text
requestData<T>(path, init)
  -> fetch(path, credentials: include)
  -> 解析 ApiResponse<T>
  -> 401 时派发 sdd-auth-unauthorized
```

页面数据基本都是：

```text
页面组件
  -> useXxx hook
  -> TanStack Query
  -> requestData<T>
  -> packages/api 推导出的类型
```

前端方案评审时，优先问：

1. 新页面是否需要新增 contract，还是已有 hook/API 已覆盖？
2. Query key 是否包含 `profileId`、时间范围、分页和筛选条件？
3. 是否错误绕过 `requestData<T>` 直接 fetch？
4. 是否把 profile 差异写死在页面里，而不是通过 manifest/presentation 降级？

## 4. API 与类型边界

`packages/api` 是前后端 request/response 的唯一类型来源。导出入口是 `packages/api/src/index.ts`。

当前 contract 文件：

```text
contracts/common.contract.ts
contracts/auth.contract.ts
contracts/ingest.contract.ts
contracts/events.contract.ts
contracts/sdd.contract.ts
contracts/profile.contract.ts
contracts/ops.contract.ts
contracts/reports.contract.ts
profile-config.ts
client/http-client.ts
```

Server Controller 的标准形态：

```text
Controller
  -> parseWithSchema(schema, ctx.query/body)
  -> service.method()
  -> ok(parseWithSchema(ResponseSchema, data))
```

统一响应结构在 `server/src/common/response/api-response.ts`，错误统一经过 `ApiErrorFilter`。

重要判断：改 API 时，不应该只改 server 或只改 web。正常路径是：

```text
packages/api contract
  -> server controller/service/repository
  -> web hook/page
  -> api-contract/integration test 或页面验证
```

读旧文档时注意两类漂移：

1. `docs/api-contract.md` 主要记录 P0 的 `ingest/events/sdd/ops/auth` contract；当前代码已经额外有 `/api/profiles/*` 和 `/api/reports/daily/*`。
2. README 与代码存在少量运行时默认值漂移，例如根 `package.json` 要求 Node `>=22.0.0`，而 README 写 Node 20+；`server/src/config/config.default.ts` 的日报调度默认值是 `00:00`，README 示例写 `12:00`。需要精确判断时，以代码和 `package.json` 为准，再反向更新文档。

## 5. Server 模块地图

Server 模块在 `server/src/modules/`。

| 模块 | 路由 | 职责 |
| --- | --- | --- |
| `auth` | `/api/auth/*` | 登录、登出、当前用户、成员管理、密码/session_version |
| `ingest` | `/api/ingest/*` | OTel logs 接收、raw batch 列表、采集健康 |
| `events` | `/api/events/*` | 事件层分布、字段覆盖、字段值、时间线 |
| `sdd` | `/api/sdd/*` | 历史 SDD 语义、技能、交互、用户、需求、wiki recall 查询 |
| `profiles` | `/api/profiles/*` | 通用 profile 观测 contract，屏蔽 sdd/projection 读源差异 |
| `reports` | `/api/reports/daily/*` | 每日简报生成、查询、导出 |
| `ops` | `/api/ops/*` | 表检索、outbox/jobs、服务资源监控 |
| `health` | `/api/healthz` | 服务健康 |

通用分层：

```text
Controller: HTTP、Zod 校验、统一响应
Service: 业务口径、读源策略、权限边界
Repository: SQL 查询和写入
Infrastructure: MySQL data source、migration、事务
```

Auth 中间件在 `server/src/common/auth/auth.middleware.ts`：

```text
公开：
  GET  /api/healthz
  POST /api/auth/login
  POST /api/auth/logout
  POST /api/ingest/otlp-logs

其余 /api/* 需要 session
super_admin:
  /api/auth/users/*
  /api/ops/*
  POST /api/reports/daily/:date/regenerate
  非 GET 的 /api/sdd/semantics*
  /api/sdd/user-settings
```

## 6. 数据库分层

当前 MySQL 表大致分成这些层：

| 层 | 表 |
| --- | --- |
| 登录成员 | `auth_users` |
| 用户与语义配置 | `sdd_users`、`sdd_skill_semantics`、`sdd_skill_aliases` |
| 原始采集 | `otel_ingest_batches`、`otel_raw_payloads`、`ingest_outbox`、`otel_log_events` |
| 交互事实 | `sdd_interactions`、`sdd_interaction_texts`、`sdd_interaction_tool_calls` |
| SDD 派生 | `sdd_skill_usages`、`sdd_work_items`、`sdd_work_item_artifacts`、`sdd_errors`、`sdd_wiki_recalls`、`sdd_work_item_artifact_writes`、`sdd_work_item_artifact_turns` |
| Source facts | `source_references` |
| Profile 投影 | `profile_projection_runs`、`profile_current_projection_runs`、`profile_capability_usages`、`profile_delivery_units`、`profile_artifacts`、`profile_artifact_writes`、`profile_artifact_turns`、`profile_knowledge_recalls`、`profile_code_activities` |
| 日报 | `sdd_daily_reports` |
| 运维资源 | `ops_resource_snapshots` |

两个核心原则：

1. `otel_raw_payloads` 是证据基石，派生数据应该能追溯到 raw/event/batch。
2. 业务幂等靠稳定 key，不靠自增 id，例如 `payload_hash`、`event_id`、`interaction_key`、`usage_key`、`reference_key`、profile projection key。

## 7. 采集到清洗的主链路

这是本项目最重要的运行时链路。

```text
Claude Code OTel logs
  -> POST /api/ingest/otlp-logs
  -> IngestController.receiveLogs()
  -> IngestReceiveService.receiveLogs()
  -> IngestWriteRepository.recordReceive()
  -> MySQL transaction:
       upsert sdd_users
       insert otel_ingest_batches(status=received)
       insert otel_raw_payloads
       insert ingest_outbox(event_type=clean_batch, status=pending)
  -> HTTP 返回 batchId/payloadHash/duplicate
```

worker 清洗：

```text
worker/src/main.ts
  -> runScheduledCleaning()
  -> OutboxRepository.lockAndLoadNextOutbox()
  -> mark batch queued
  -> cleanBatch(batchId)
  -> mark outbox dispatched / failed
```

`cleanBatch` 做的事：

```text
lock batch + raw payload
  -> parse raw JSON
  -> extractOtelLogEvents()
  -> upsert otel_log_events
  -> 按 prompt_id / trace / session anchor 归并 sdd_interactions
  -> upsert interaction texts
  -> upsert tool calls
  -> 匹配 skill semantics，写 sdd_skill_usages
  -> 从路径/工具结果推断 work item 和 artifact
  -> 写 artifact writes / turns
  -> 写 sdd_errors
  -> 写 sdd_wiki_recalls
  -> batch status = parsed
```

失败语义：

```text
TerminalCleaningError -> batch failed_terminal，outbox failed_terminal
其它错误 -> batch failed_retryable，outbox pending，指数退避重试
```

方案评审时，采集链路的红线：

1. `POST /api/ingest/otlp-logs` 不能同步做重清洗或重计算。
2. raw 入库和 outbox 投递必须在同一事务里完成。
3. 清洗入口应保持 `cleanBatch(batchId)` 唯一，不要在 HTTP、脚本、worker 各写一套清洗逻辑。
4. 重试必须幂等，不能把派生表写出重复污染。

## 8. Profile 化链路

Profile 的目标是把平台从“只懂 SDD”演进到“可配置研发观测口径”。

当前内置 profile 在 `packages/api/src/profile-config.ts`：

| profileId | 状态 | projectionMode | 含义 |
| --- | --- | --- | --- |
| `sdd-default` | active | `sdd_bridge` | 旧 SDD 派生表桥接到 profile contract |
| `e2e-monorepo` | active，但运行期依赖 root env | `source_backed` | 本地 `plan/docs/frontend_repo/backend_repo` 多 root 示例 |
| `online-docs` | disabled | `source_backed` | URL/MCP 在线文档示例，真实日志验证前不冻结 |

运行期是否可选不只看 `status`。`ProfilesService` 会用 `resolveRuntimeProfileConfig(config, process.env)` 检查 source-backed profile 的 root 是否可解析；缺 env 时列表里会降级为 disabled。

### 8.1 Profile read mode

`/api/profiles/*` 的读源由 `server/src/modules/profiles/profiles.service.ts` 决定：

```text
PROFILE_DASHBOARD_READ_SOURCE=profile_projection
  且 profile_current_projection_runs 有 current run
    -> 读 profile_* projection tables

否则：
  projectionMode=sdd_bridge -> 回退读 legacy sdd_*，再映射成 profile contract
  projectionMode=source_backed -> 返回 empty / data not ready
```

所以切换 profile projection 不是改前端开关就完事，必须先：

```bash
pnpm profile:rebuild-source-references
pnpm profile:rebuild -- --profile <profileId>
pnpm profile:diff -- --profile <profileId>
```

### 8.2 source_references

`source_references` 是 profile 化的最小通用事实层。重建入口：

```text
worker/src/jobs/rebuild-source-references.ts
  -> 读取 sdd_interaction_tool_calls + sdd_interactions + otel_log_events.attributes_json
  -> extractSourceReferences()
  -> upsert source_references
```

它把工具调用里的资源定位抽成统一事实：

```text
本地路径：Read / Grep / Glob / Write / Edit / MultiEdit
在线文档：MCP tool input 中的 url/docId/collectionId/spaceId/docType/title
```

关键粒度：`reference_key` 优先基于 `tool_use_id`，回退 `event_id`。这意味着同一文档被读两次会产生两条 source reference，和旧 `sdd_wiki_recalls` 按工具调用计数的口径对齐。

### 8.3 profile projection

Profile rebuild 入口：

```text
worker/src/jobs/profile-rebuild.ts
  -> getProfileOperators(profileId)
  -> runProfileProjection()
```

Projection runner 的安全模型：

```text
GET_LOCK(profile_projection:<profileId>)
  -> 新建 profile_projection_runs(status=running)
  -> operator 按 projection_run_id 写 profile_* 明细
  -> 全部成功：
       mark run completed
       upsert profile_current_projection_runs current pointer
  -> 任一失败：
       mark run failed
       current pointer 不动
```

这保证 dashboard 不会读到半截 projection。

operator 分发不应按具体 profileId 写死：

```text
projectionMode=sdd_bridge
  -> SDD_BRIDGE_OPERATORS + knowledgeOperator + codeOperator

projectionMode=source_backed
  -> SOURCE_BACKED_OPERATORS
```

以后接新 profile，理想情况是只改 `profile-config.ts` 加规则，不新增 `boss-x-matcher`、`boss-x-operators` 这种专属生产路径。

## 9. 日报链路

日报是 server 内部调度，不走 worker outbox。

```text
server onReady()
  -> 初始化 DailyReportScheduler
  -> 每分钟检查 DAILY_REPORT_SCHEDULE_TIME
  -> generateDailyReport(yesterday, 'schedule')
  -> DailyReportRepository 查询 sdd_* / wiki / outbox / code impact
  -> renderMarkdown()
  -> upsert sdd_daily_reports
```

HTTP 入口：

```text
GET  /api/reports/daily/latest
GET  /api/reports/daily
GET  /api/reports/daily/:date
POST /api/reports/daily/:date/regenerate
GET  /api/reports/daily/:date/export?format=markdown
```

当前日报主要还是按 SDD 口径聚合，不等价于 profile projection 口径。以后如果要做 profile 化日报，需要先明确日报是否也必须带 `profileId`。

## 10. Ops 链路

Ops 分两类：

1. 数据库/队列观察：server 直接查 MySQL。
2. Docker 资源采集：`worker/src/ops-resource-agent.ts` 通过 Docker socket 采样，再写 `ops_resource_snapshots`。

本地开发只启动 MySQL；生产 compose 有可选 `ops-agent` profile。

关键页面：

```text
/ops/database  -> /api/ops/tables, /api/ops/tables/:tableName/rows
/ops/resources -> /api/ops/resources/summary, /api/ops/resources/history
```

`/api/ops/*` 只允许 `super_admin`。

## 11. 本地启动和验证

常用命令：

```bash
pnpm install
docker compose up -d mysql
pnpm db:migrate
pnpm db:seed
pnpm dev
```

单服务：

```bash
pnpm dev:web
pnpm dev:server
pnpm dev:worker
```

基础门禁：

```bash
pnpm typecheck
pnpm build
```

运行链路变更时补充：

```bash
pnpm db:verify
pnpm --filter @sdd-telemetry/worker once
curl -sS http://127.0.0.1:4318/api/ingest/health
```

重建派生层推荐：

```bash
pnpm db:reclean
```

Profile projection 验证：

```bash
pnpm profile:rebuild-source-references
pnpm profile:rebuild -- --profile sdd-default
pnpm profile:diff -- --profile sdd-default
```

source-backed profile 需要先配置 root，例如：

```bash
E2E_MONOREPO_ROOT=/absolute/path/to/repo pnpm profile:rebuild -- --profile e2e-monorepo
E2E_MONOREPO_ROOT=/absolute/path/to/repo pnpm profile:diff -- --profile e2e-monorepo
```

## 12. 读方案时的判断清单

以后任何 AI 方案，先用这 10 个问题过一遍：

1. 它改的是采集、清洗、查询、profile projection、页面展示，还是部署？
2. 它有没有复用 `packages/api` contract，还是手写了前后端不一致类型？
3. 它有没有绕过 `requestData<T>` 或绕过 TanStack Query？
4. 它有没有把 profileId、timeRange、分页、筛选放进 query key？
5. 它有没有把 source-backed profile 写成专属 `if profileId === xxx`？
6. 它有没有在 HTTP ingest 里做同步重计算？
7. 它有没有破坏 raw -> event -> interaction -> sdd/profile 的可追溯链？
8. 它改了 DB 表或 outbox 语义时，有没有 migration、幂等、回滚/重建方案？
9. 它改 dashboard 指标时，说清楚读的是 legacy `sdd_*` 还是 `profile_*` current run 了吗？
10. 它的验证是可证伪的吗，还是只看空数据页面“没报错”？

## 13. 面试/汇报时可以这样复述

一句话：

```text
这是一个采集 Claude Code OTel 日志、异步清洗成研发工作流事实层，再通过 SDD/Profile 两套观测口径给 dashboard 和日报提供指标的内部质量观测平台。
```

技术取舍：

```text
HTTP ingest 只做 raw 入库和 outbox 投递，避免上报链路被清洗复杂度拖垮；
worker 通过 cleanBatch 做唯一清洗入口，用稳定 key 保证重试幂等；
前后端共享 Zod contract，server controller 做运行时校验，web 用 TanStack Query 消费；
profile 化通过 source_references + profile projection current pointer，把 SDD 从写死模型变成一种可配置观测口径。
```

最大风险：

```text
项目已经从 SDD 专用 dashboard 进入 profile 化平台阶段，旧 sdd_* 链路、profile_* 链路和页面读源正在共存。任何改动都要先确认当前页面读的是哪个口径，否则很容易出现“看板改对了但数据来源错了”。
```

## 14. 你最该优先熟悉的文件

按顺序读，不要一口气读全仓：

1. `README.md`：启动、部署、产品边界。
2. `web/src/router.tsx`：页面入口。
3. `web/src/components/layout/AppShell.tsx`：全站 timeRange/profileId。
4. `web/src/api/client.ts`：前端请求边界。
5. `packages/api/src/contracts/profile.contract.ts`：当前主看板 contract。
6. `packages/api/src/profile-config.ts`：profile 接入规则。
7. `server/src/modules/profiles/profiles.service.ts`：profile 读源策略。
8. `server/src/modules/ingest/ingest-receive.service.ts`：采集入口业务边界。
9. `worker/src/jobs/cleaning-worker.ts`：清洗主逻辑。
10. `worker/src/jobs/profile-projection/runner.ts`：profile projection 安全模型。
11. `worker/src/jobs/source-reference-extractor.ts`：source reference 抽取。
12. `docs/database-model.md` 和 migrations：表分层和真实 schema。
