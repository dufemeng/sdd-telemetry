# SDD Monitor Chair-compatible Monorepo 实施方案

更新时间：2026-05-14  
项目定位：SDD Monitor 新 monorepo 方案仓库  
当前阶段：实施前技术方案冻结

## 1. 目标

本项目不是继续修补旧 `sdd-monitor` demo，而是新建一套更接近公司 Chair 体系的全栈工程，用于跑通 SDD 工作流观测。

核心目标按优先级排序：

1. **功能完整**：新上报数据能完成 raw 入库、异步清洗、派生分析、dashboard 展示。
2. **工程先进**：真实落地 Controller、Service、Repository、ORM、Migration、事务、队列、contract、测试、部署。
3. **迁移可控**：未来迁到 Chair（EggJS-like + tegg DI + dal v2 + FaaS）时，主要替换框架和基础设施层，不重写业务语义。

不承诺工程意义上的 `0bug`。本方案用架构约束、幂等设计和分阶段验收把 P0 主链路一次跑通的信心提升到可执行水平。

## 2. 已冻结决策

| 决策 | 结论 |
|---|---|
| 后端框架 | P0 使用 `MidwayJS + TypeScript` |
| ORM | 使用 `TypeORM`，但限制为 Data Mapper + Repository + Migration |
| 数据库 | MySQL |
| 队列 | Redis + BullMQ，业务层只依赖 `QueuePort` |
| 前端 | 迁入旧 `apps/web`，但不要求后端兼容旧 API |
| API | 按新领域模型设计，分为 `ingest / events / sdd / ops` |
| Contract | `packages/api` 使用 Zod schema 作为 request / response 单一来源 |
| 清洗模式 | raw 同步入库，清洗异步执行 |
| 可靠投递 | 使用 `ingest_outbox` 防止 MySQL commit 成功但 job 丢失 |
| 测试 | 每个里程碑前置验收，不放到最后 |
| 历史数据 | P0 不迁旧 SQLite，只保证新数据链路 |

## 3. P0 范围

P0 只承诺新系统接收的新数据完整跑通。

必须完成：

| 功能 | P0 要求 |
|---|---|
| OTel 上报 | `POST /api/ingest/otlp-logs` 接收 payload |
| raw 保存 | 完整保存到 `otel_raw_payloads`，保留约 7 天 |
| 可靠清洗 | `ingest_outbox` + BullMQ + worker，任务不丢 |
| 批次状态 | 展示 `received / queued / processing / parsed / failed_*` |
| event 分布 | 基于 `otel_log_events` 统计 |
| 字段覆盖率 / 数据质量 | 基于事件层和 SDD 派生层统计 |
| Raw 批次详情 | 查看 batch、payload、状态、错误、清洗耗时 |
| SDD skill 配置 | 管理 semantic 和 alias |
| prompt / response 配对 | 支持跨 batch 按 `prompt_id / session_id` 重算 |
| skill usage | 原始 skill name 映射到 SDD semantic |
| 异常 / 错误视图 | 只纳入强错误，避免弱文本噪音 |
| 用户 / 机器维度 | 基于 `sdd_users` 和事件资源字段统计 |
| 版本维度 | 清洗 observed skill / service version |
| work item P0-lite | 从 requirements 路径推断需求目录和 artifact |
| ops 页面 | MySQL 表、行数据、队列、清洗状态的简化排障能力 |
| 前端 dashboard | 最低成本适配新 API，不污染后端设计 |

P0 不做：

| 功能 | 原因 |
|---|---|
| 旧 SQLite 历史迁移 | 先保证新数据链路 |
| 复杂权限 / 多团队 | 当前 SDD 配置全局唯一 |
| 自动评测打分 | 评测机制未定 |
| LLM 摘要 | 价值和来源未定 |
| OpenAPI 生成 client | P1 等 contract 稳定后做 |
| 对象存储 raw 归档 | MySQL 7 天 raw 足够 MVP |

## 4. 技术栈

```text
pnpm workspace
+ Turborepo
+ MidwayJS
+ TypeORM
+ MySQL
+ Redis
+ BullMQ
+ Zod
+ pino
+ Vitest / Midway mock
+ Playwright
+ Docker Compose
```

TypeORM 使用约束：

1. 不使用 `BaseEntity`。
2. 不使用 lazy relation。
3. 不使用 cascade 魔法。
4. 不使用 `synchronize`。
5. 所有表结构变化必须通过 migration。
6. Service 不直接 import TypeORM Repository / EntityManager。
7. 多 Repository 事务通过 `UnitOfWork` 传递事务上下文。

## 5. Monorepo 结构

```text
sdd-chair-backend/
  apps/
    web/                 # React + Vite dashboard
    server/              # MidwayJS HTTP API
    worker/              # BullMQ worker / outbox dispatcher
  packages/
    api/                 # Zod contract + shared types + API client
    config/              # tsconfig / eslint / prettier
    ui/                  # P1 可选
  docs/
    implementation-plan.md
    database-model.md
    api-contract.md
    acceptance-plan.md
  docker-compose.yml
  package.json
  pnpm-workspace.yaml
  turbo.json
```

后端模块建议：

```text
apps/server/src/
  common/
    errors/
    logger/
    response/
    transaction/
    validation/
  infrastructure/
    mysql/
    redis/
    queue/
  modules/
    ingest/
    events/
    sdd/
    ops/

apps/worker/src/
  outbox-dispatcher.ts
  cleaning-worker.ts
  retention-worker.ts
```

## 6. API 域

后端 API 不向旧项目做兼容。旧前端只作为页面能力参考，前端请求层适配新 API。

API 分为 4 个域：

```text
/api/ingest   采集链路
/api/events   通用 OTel 事件分析
/api/sdd      SDD 业务分析
/api/ops      运维 / 排障 / 数据库观察
```

详见 [api-contract.md](./api-contract.md)。

## 7. 数据库模型

数据库分 5 层：

```text
配置层：sdd_users / sdd_skill_semantics / sdd_skill_aliases
原始层：otel_ingest_batches / otel_raw_payloads / otel_log_events / ingest_outbox
交互层：sdd_interactions / sdd_interaction_texts
业务层：sdd_skill_usages / sdd_work_items / sdd_work_item_artifacts / sdd_errors
运维层：复用 ingest_outbox + batch status，P0 不额外建 jobs 表
```

设计原则：

1. 所有表主键统一为 `id`。
2. 业务幂等使用独立唯一键，例如 `payload_hash`、`event_id`、`interaction_key`、`usage_key`、`error_key`。
3. 业务事件时间使用 `event_time`。
4. 入库和更新时间使用 `created_at`、`updated_at`。
5. 时间字段统一 `DATETIME(3)`，按 UTC 写入。
6. raw payload 保留约 7 天。
7. event 和 prompt / response text 保留约 30 天。
8. SDD 派生业务表至少保留 6 个月。
9. P0 不做 MySQL 分区，使用索引 + 批量删除。

详见 [database-model.md](./database-model.md)。

## 8. 异步清洗闭环

旧 demo 是 HTTP handler 内同步清洗。新方案改成异步清洗后，必须补齐 4 类机制。

### 8.1 可靠投递

```text
POST /api/ingest/otlp-logs
-> 开 MySQL 事务
-> 写 otel_ingest_batches
-> 写 otel_raw_payloads
-> 写 ingest_outbox
-> 提交事务

OutboxDispatcher
-> 扫描 ingest_outbox pending
-> 投递 BullMQ clean-batch job
-> 标记 dispatched
```

这样可以避免 MySQL commit 成功但 BullMQ job 丢失。

### 8.2 Dashboard 查询策略

异步清洗后，dashboard 必须区分链路状态和业务分析。

```text
采集健康 / Raw 批次详情：
  查询所有 batch status

业务分析类页面：
  默认只统计 parsed batch 派生数据

页面提示：
  如果最近 batch 仍在 queued / processing，展示“正在清洗中”
```

### 8.3 幂等重试

清洗任务可重试，派生表不能重复污染。

规则：

1. `otel_log_events.event_id` 唯一。
2. `sdd_interactions.interaction_key` 唯一。
3. `sdd_skill_usages.usage_key` 唯一。
4. `sdd_errors.error_key` 唯一。
5. 普通重试使用 upsert。
6. 人工 reprocess 先按 `batch_id` 或受影响 key 清理，再重建。

### 8.4 跨 batch 配对

prompt / response 可能分散在不同 batch。清洗不能只看当前 batch。

流程：

```text
clean batch
-> 先写入 otel_log_events
-> 找出本 batch 涉及的 prompt_id / session_id
-> 回查这些 prompt_id / session_id 的所有有效事件
-> 重算对应 sdd_interactions / sdd_skill_usages / sdd_errors
```

清洗触发粒度是 batch，实际派生范围是相关 `prompt_id / session_id`。

## 9. Contract 方案

P0 使用 Zod 作为 request / response 的唯一 contract 来源。

```ts
export const CreateSddSemanticRequestSchema = z.object({
  semanticCode: z.string().min(1),
  displayName: z.string().min(1),
  description: z.string().optional(),
  aliases: z.array(z.string().min(1)).min(1),
});

export type CreateSddSemanticRequest = z.infer<
  typeof CreateSddSemanticRequestSchema
>;
```

使用方式：

```text
packages/api
-> 定义 Zod schema 和 TS type

apps/server
-> 使用 schema 做运行时校验

apps/web
-> 使用 infer 出来的类型

tests
-> 使用 schema 校验 API response
```

P0 不先做 OpenAPI 生成 client。OpenAPI 等接口稳定后作为 P1。

## 10. 实施里程碑

### Milestone 0：文档冻结

任务：

1. 更新实施方案。
2. 写清数据库模型。
3. 写清 API contract。
4. 写清验收计划。

验收：

```text
docs/implementation-plan.md
docs/database-model.md
docs/api-contract.md
docs/acceptance-plan.md
```

全部存在且与当前决策一致。

### Milestone 1：工程骨架

任务：

1. 初始化 `pnpm workspace`。
2. 配置 `Turborepo`。
3. 初始化 `apps/server`。
4. 初始化 `apps/worker`。
5. 迁入 `apps/web`。
6. 初始化 `packages/api`、`packages/config`。
7. 接入 ESLint / Prettier / tsconfig。
8. 接入配置、pino、requestId、统一响应、统一错误。
9. 接入 MySQL、Redis。
10. 写 Docker Compose。

验收：

```text
pnpm dev
-> web / server / worker 能同时启动

GET /api/ingest/health
-> 返回 app / mysql / redis / worker 基本状态
```

### Milestone 2：Contract 和数据库

任务：

1. 在 `packages/api` 定义 P0 API Zod schema。
2. 定义 TypeORM Entity。
3. 编写 migration。
4. seed SDD semantic / alias 初始配置。
5. 实现 `UnitOfWork`。
6. 实现基础 Repository。

验收：

```text
pnpm db:migrate
pnpm db:seed
pnpm test:contract
pnpm test:migration
```

### Milestone 3：raw 写入和 outbox

任务：

1. 实现 `POST /api/ingest/otlp-logs`。
2. 计算 `payload_hash`。
3. upsert `sdd_users`。
4. 事务写入 batch、raw、outbox。
5. 实现重复 payload 策略。
6. 实现 outbox dispatcher。

验收：

```text
POST fixture
-> otel_ingest_batches 有记录
-> otel_raw_payloads 有记录
-> ingest_outbox 有记录
-> 重复 POST 不产生重复 batch
```

### Milestone 4：清洗 worker

任务：

1. 实现 OTel extractor。
2. 写入 `otel_log_events`。
3. 实现跨 batch prompt / response 配对。
4. 生成 `sdd_interactions`、`sdd_interaction_texts`。
5. 根据 alias 生成 `sdd_skill_usages`。
6. 提取 strong error 到 `sdd_errors`。
7. 推断 work item / artifact P0-lite。
8. 更新 batch status。

验收：

```text
fixture raw -> parsed
otel_log_events 有数据
sdd_interactions 有数据
sdd_skill_usages 有数据
sdd_errors 可识别强错误
跨 batch prompt/response 可配对
重试不会重复写派生数据
```

### Milestone 5：Dashboard API

任务：

1. 实现 ingest API。
2. 实现 events API。
3. 实现 sdd API。
4. 实现 ops API。
5. 每个 response 过 Zod schema 校验。

验收：

```text
pnpm test:api
-> 所有 P0 API contract 通过
```

### Milestone 6：前端迁移和适配

任务：

1. 迁入旧 `apps/web`。
2. 保留现有页面和交互。
3. 删除旧 API 作为事实来源的地位。
4. 用 `packages/api` contract 改造请求层。
5. 前端 ViewModel adapter 适配新 response。
6. 接入 `VITE_API_BASE_URL`。

验收：

```text
dashboard 不白屏
tab 可切换
空数据状态正常
processing / failed 状态正常
上传 fixture 后页面有数据
```

### Milestone 7：Retention、reprocess、文档

任务：

1. 实现 raw / event / text TTL 清理。
2. 实现 `POST /api/ingest/batches/:batchId/reprocess`。
3. 补 README quickstart。
4. 补部署说明。
5. 补学习说明。

验收：

```text
过期数据可批量清理
指定 batch 可重算
README 可按步骤启动完整链路
```

## 11. Chair 迁移策略

当前实现到 Chair 的映射：

| 当前实现 | Chair 对应 | 控制成本方式 |
|---|---|---|
| Midway Controller | `@TRController` / `@WebGWController` | Controller 只做路由和校验 |
| Service | `@SingletonProto` Service | 不依赖框架 request context |
| TypeORM Entity | dal v2 `@Table` / `@Column` | 表名字段名保持稳定 |
| Repository | dalgen DAO 封装 | Service 只依赖接口 |
| UnitOfWork | dal v2 transaction adapter | 事务上下文不泄漏 |
| BullMQ worker | Chair FaaS / 内部异步任务 | worker 只调用 Service |
| Zod contract | 可保留给前端，也可接 OneAPI | API 语义稳定 |

当前项目不写死：

1. 不在 Service 中直接调用 ORM。
2. 不在 Controller 中写业务逻辑。
3. 不让 Worker 直接写数据库。
4. 不把 Redis / MySQL client 到处透传。
5. 不依赖进程内状态表达业务结果。
6. 不让后端 API 为旧前端接口背历史包袱。

## 12. 风险和应对

| 风险 | 影响 | 应对 |
|---|---|---|
| 异步清洗比同步复杂 | dashboard 有延迟窗口 | batch status + 查询策略 |
| BullMQ 投递失败 | raw 入库但无人清洗 | `ingest_outbox` |
| job 重试重复写 | 派生数据污染 | stable key + upsert + reprocess 清理 |
| prompt/response 跨 batch | 单 batch 配对失败 | 按 `prompt_id / session_id` 重算 |
| TypeORM 和 dal v2 不同 | 未来 ORM 层重写 | Repository + UnitOfWork 隔离 |
| 前端改动变大 | 适配成本上升 | ViewModel adapter，只改请求层 |
| raw payload 大 | MySQL 压力 | body limit + 7 天 TTL |
| 历史数据不可见 | 旧 dashboard 历史断档 | P0 明确只验收新数据 |

## 13. 下一步

执行顺序：

1. 完成 Milestone 0 文档冻结。
2. 开始创建 monorepo 工程骨架。
3. 先跑通 contract、migration、raw 写入。
4. 再实现清洗 worker 和 dashboard API。
5. 最后迁前端并做浏览器 smoke test。
