# P0 验收计划

更新时间：2026-05-14

## 1. 验收原则

1. 不等全部代码写完再测试，每个里程碑都有验收。
2. 验收对象是新数据链路，不包括旧 SQLite 历史数据。
3. 所有 API response 必须通过 `packages/api` 的 Zod schema。
4. 所有数据库结构变化必须通过 migration。
5. 清洗 worker 必须用 fixture 证明幂等、重试、跨 batch 配对。
6. 前端必须用浏览器 smoke test 证明页面可用。

## 2. Fixture 策略

P0 至少准备 4 类 fixture：

| fixture | 用途 |
|---|---|
| `basic-otlp.json` | 正常上报、事件拆解、基础统计 |
| `skill-usage-otlp.json` | skill alias 匹配、semantic 归类 |
| `split-interaction-otlp-a.json` / `split-interaction-otlp-b.json` | prompt / response 跨 batch 配对 |
| `error-otlp.json` | strong error 入库验证；错误视图今日 MVP 延后 |

fixture 来源优先级：

1. 真实脱敏 OTel payload。
2. 当前 demo 能生成的近真实 payload。
3. 手写最小 OTel payload。

## 3. Contract Test

目标：保证前后端对 API 结构的理解一致。

检查项：

1. `packages/api` 所有 schema 可被 import。
2. 后端每个 P0 API 的 response 能通过对应 schema。
3. 错误响应结构统一。
4. 分页、空数据、processing、failed 状态都符合 schema。

命令建议：

```text
pnpm test:contract
```

## 4. Migration Test

目标：保证 MySQL 从空库能稳定建表。

检查项：

1. migration 可从空库执行成功。
2. 13 张 P0 表存在。
3. 主键均为 `id`。
4. 唯一键存在：`payload_hash`、`event_id`、`interaction_key`、`usage_key`、`error_key`。
5. 关键索引存在：时间、状态、用户、session、prompt、semantic。
6. seed 后有 SDD semantic 和 alias。

命令建议：

```text
pnpm db:migrate
pnpm db:seed
pnpm test:migration
```

## 5. Ingest Integration Test

目标：证明 raw 写入和 outbox 可靠。

流程：

```text
POST /api/ingest/otlp-logs basic-otlp.json
```

检查项：

1. `otel_ingest_batches` 有记录。
2. `otel_raw_payloads` 有记录。
3. `ingest_outbox` 有 `clean_batch` 记录。
4. batch 初始状态是 `received` 或 `queued`。
5. response 返回 `batchId`、`payloadHash`、`duplicate=false`。

重复 POST 同一 payload：

1. 不新增 batch。
2. `duplicate_count` 增加。
3. response 返回相同 `batchId`、`duplicate=true`。

BullMQ 暂停时：

1. raw 仍能写入。
2. outbox 保留 pending。
3. Redis 恢复后 dispatcher 能补投。

## 6. Cleaning Integration Test

目标：证明异步清洗完整、可重试、幂等。

基础清洗检查：

1. batch 状态从 `queued` -> `processing` -> `parsed`。
2. `otel_log_events` 生成。
3. `sdd_interactions` 生成。
4. `sdd_interaction_texts` 生成。
5. `sdd_skill_usages` 生成。
6. `sdd_errors` 对 strong error 生效。
7. `sdd_work_items` 和 `sdd_work_item_artifacts` 能从 requirements 路径生成。

幂等检查：

1. 同一个 job 重试不会重复插入事件。
2. 同一个 job 重试不会重复插入 usage。
3. reprocess 后续补齐后，派生数据数量应保持稳定；今日 MVP 不验收 reprocess。

跨 batch 检查：

1. batch A 只有 prompt。
2. batch B 只有 response。
3. 两个 batch 都清洗后，能生成同一个 interaction。
4. 新 batch 触发时能重算相关 `prompt_id / session_id`。

## 7. Dashboard API Test

目标：证明页面所需数据都能从新 API 获取。

API 覆盖：

```text
GET /api/ingest/health
GET /api/ingest/batches
GET /api/events/distribution
GET /api/events/field-coverage
GET /api/sdd/semantics
GET /api/sdd/funnel
GET /api/sdd/usages
GET /api/sdd/interactions
GET /api/sdd/users
GET /api/sdd/work-items
GET /api/ops/tables
GET /api/ops/jobs
GET /api/ops/queue
```

状态覆盖：

1. 空数据。
2. 正在 processing。
3. parsed 有数据。
4. failed 有错误。
5. 分页有下一页。

## 8. Frontend Smoke Test

目标：证明 dashboard 作为产品可用。

浏览器验收：

1. 页面不白屏。
2. 所有 tab 可切换。
3. 空数据状态正常。
4. 上传 fixture 后采集健康页能看到 batch。
5. 清洗完成后事件分布有数据。
6. Skill 调用漏斗有数据。
7. 用户 / 机器维度有数据。
8. Raw 批次详情能看到 batch 状态。
9. Skill 使用概览能看到按 skill / semantic 聚合后的调用统计。
10. ops 数据库浏览能查看 MySQL 表结构和表数据。

今日 MVP 暂不验收：

1. 异常 / 错误视图。
2. 版本分析。

命令建议：

```text
pnpm test:e2e
```

## 9. 性能和容量 Smoke

P0 不做复杂压测，但要证明 100 人团队 MVP 规模不会立刻崩。

最小检查：

1. 连续上传 1000 个 fixture batch。
2. dispatcher 不丢 outbox。
3. worker 能在可接受时间内清洗完成。
4. dashboard 查询 P95 小于 2s。
5. raw / text 大字段不会被默认列表接口全量返回。

## 10. P0 完成定义

全部满足才算 P0 完成：

1. `pnpm dev` 能启动 web / server / worker。
2. Docker Compose 能启动 MySQL / Redis。
3. migration 和 seed 可重复执行。
4. 新上报 payload 能入 raw。
5. outbox 能可靠投递。
6. worker 能清洗并生成派生数据。
7. 所有 P0 API 通过 Zod contract test。
8. dashboard 今日 MVP 页面可用。
9. retention 可用；reprocess 作为后续能力补齐。
10. README 有本地启动、测试、排障说明。
