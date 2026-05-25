# P0 验收计划

更新时间：2026-05-18

## 1. 验收原则

1. 不等全部代码写完再测试，每个里程碑都有验收。
2. 验收对象是新数据链路，不包括旧 SQLite 历史数据。
3. 所有 API response 必须通过 `packages/api` 的 Zod schema。
4. 所有数据库结构变化必须通过 migration。
5. 定时清洗任务必须用 fixture 证明幂等、重试、跨 batch 配对。
6. 前端必须用浏览器 smoke test 证明页面可用。
7. **可证伪原则**：每条验收必须能 "命中失败"——空集查询不算证明，必须断言字段值或行数与预期一致。

## 2. Fixture 策略

P0 需要的 fixture 清单和现状：

| fixture                                                           | 用途                                                                         | 现状   |
| ----------------------------------------------------------------- | ---------------------------------------------------------------------------- | ------ |
| `basic-otlp.json`                                                 | 正常上报、事件拆解、基础统计                                                 | 已存在 |
| `sdd-cleaning-otlp.json`                                          | skill_activated + tool_result write artifact + interaction，覆盖清洗完整链路 | 已存在 |
| `skill-usage-otlp.json`                                           | 仅 skill alias 匹配的最小 payload；覆盖 alias 匹配与 unmatched 两种 case     | 待新增 |
| `split-interaction-otlp-a.json` / `split-interaction-otlp-b.json` | prompt / response 跨 batch 配对                                              | 待新增 |
| `error-otlp.json`                                                 | strong error 入库 + usage_id / work_item_id 反链验证                         | 待新增 |

fixture 来源优先级：

1. 真实脱敏 OTel payload。
2. 当前 demo 能生成的近真实 payload。
3. 手写最小 OTel payload。

每个 fixture 在 `server/test/fixtures/` 下，文件名小写 kebab-case，内容必须能通过 OTel JSON schema。

## 3. Contract Test

目标：保证前后端对 API 结构的理解一致。

检查项：

1. `packages/api` 所有 schema 可被 import。
2. 后端每个 P0 API 的 response 能通过对应 schema。
3. 错误响应结构统一（`success=false`，`error.code`、`error.message`）。
4. 分页、空数据、processing、failed 状态都符合 schema。
5. **非法 query 被 zod 拒绝**：例如 `GET /api/sdd/funnel?groupBy=user` 返回 `VALIDATION_FAILED`，而不是被静默忽略。

命令建议：

```text
pnpm test:api          # 命中现有 server/test/integration/api-contract.test.ts
```

## 4. Migration Test

目标：保证 MySQL 从空库能稳定建表。

检查项：

1. migration 可从空库执行成功。
2. P0 表全部存在：`otel_ingest_batches`、`otel_raw_payloads`、`otel_log_events`、`ingest_outbox`、`sdd_users`、`sdd_skill_semantics`、`sdd_skill_aliases`、`sdd_interactions`、`sdd_interaction_texts`、`sdd_interaction_tool_calls`、`sdd_skill_usages`、`sdd_errors`、`sdd_work_items`、`sdd_work_item_artifacts`。
3. 主键均为 `id`。
4. 唯一键存在：`payload_hash`、`event_id`、`interaction_key`、`usage_key`、`error_key`、`work_item_key`、`artifact_key`。
5. 关键索引存在：时间、状态、用户、session、prompt、semantic。
6. `seed` 后有 SDD semantic 和 alias，**不再写 `sdd_users.requirements_root_path`**（该字段必须由 OTel 上报闭环填充，详见 §11 case 1）。

命令建议：

```text
pnpm db:migrate
pnpm db:seed
pnpm db:verify
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
6. 超过 `MAX_OTLP_PAYLOAD_BYTES` 或 `MAX_OTLP_LOG_RECORDS` 的 payload 会被拒绝。

重复 POST 同一 payload：

1. 不新增 batch。
2. `duplicate_count` 增加。
3. response 返回相同 `batchId`、`duplicate=true`。

定时清洗任务未触发时：

1. raw 仍能写入。
2. outbox 保留 pending。
3. 下次定时任务触发后能 claim 并清洗。

## 6. Cleaning Integration Test

目标：证明异步清洗完整、可重试、幂等。worker 调用顺序固定为 `upsertInteractions` → `upsertSkillUsages` → `upsertWorkItems` → `upsertErrors`。

### 6.1 基础清洗

1. batch 状态从 `queued` → `processing` → `parsed`。
2. `otel_log_events` 生成。
3. `sdd_interactions` 生成（含 `prompt_id`、`session_id`、`status`、`started_at` / `completed_at`）。
4. `sdd_interaction_texts` 生成（prompt 和 response 文本入库）。
5. `sdd_skill_usages` 生成；每条 `raw_skill_name`、`event_time` 不为空。
6. `sdd_errors` 对 strong error 生效。
7. `sdd_work_items` 和 `sdd_work_item_artifacts` 能从 requirements 路径生成。

### 6.2 P0 修复链路验收（case 1 / 2 / 5 / 9）

**case 1：requirements_root_path 上报闭环**

1. Fixture OTel `resource.attributes` 含 `sdd.requirements_root_path=...`。
2. ingest 后 `sdd_users.requirements_root_path` 字段值等于上报值，**不依赖 seed 兜底**。
3. 缺失该字段时，worker 跳过该用户的 work_item 检测（不报错，不污染）。

**case 2：skill_usage 信号纯净 + 未匹配落库**

1. `upsertSkillUsages` 只处理 `event_name='skill_activated'` 事件；`tool_result`、`user_prompt.command_name` 不进表。
2. 当 `skill_activated.skill.name` 在 `sdd_skill_aliases` 表无匹配（例如 `grill-me`）：写入 `sdd_skill_usages`，`semantic_id`、`alias_id` 为 NULL，`matched_by='unmatched'`。
3. `GET /api/sdd/funnel` 的 `stages[]` 含 `semanticCode='unknown'`、`displayName='未匹配 Skill'` 节点，`usageCount` 等于真实未匹配事件数。

**case 5：error → usage / work_item 反链**

1. strong error 事件清洗后，`sdd_errors.usage_id` 命中同 session 内 `event_time ≤ error.event_time` 的最近一条 usage。
2. `sdd_errors.work_item_id` 等于该 usage 的 `work_item_id`（若 usage 未关联 work_item 则为 NULL）。
3. `GET /api/sdd/work-items/:id` 返回的 `errorCount` 等于 `SELECT COUNT(*) FROM sdd_errors WHERE work_item_id = ?`，**不再恒为 0**。

**case 9：缺失资源身份时 `user.id` 稳定兜底**

1. 两个内容不同的 OTLP payload 均不含 `sdd.install_id` / `machine.id`，但 log record 均含相同 `user.id` 时，生成同一个 `user_key`。
2. 同一 payload 同时含 `sdd.install_id` 和 `user.id` 时，`sdd.install_id` 仍优先生成 `user_key`。
3. 只有上述稳定身份全缺失时，才按 `payload_hash` 生成 `unknown` 用户。

### 6.3 work_item 识别细则

1. 仅当 artifact 路径满足 `startsWith(sdd_users.requirements_root_path)` 才记入 work_item。
2. `work_item_slug` 必须匹配 `YYYY-MM-DD-<name>` 正则；不匹配则跳过整个 artifact。
3. `business_domain` 取 slug 上一级路径段，`work_item_title` = slug 去掉日期前缀。
4. skill 归因走 session-window：在 artifact 写入事件之前、同 session 内最近的 `skill_activated` 事件提供 `skill_id`；找不到则 `skill_id=NULL`，仍写 work_item。
5. 文件名能匹配 `sdd_skill_semantics.artifact_filename_patterns` 时，`artifact_type` 取该 semantic；否则 fallback 到通用类型。

### 6.4 幂等

1. 同一 batch 被重复调度不会重复插入 `otel_log_events`、`sdd_interactions`、`sdd_skill_usages`、`sdd_work_items`、`sdd_errors`。
2. `usage_key` / `error_key` / `interaction_key` / `work_item_key` 的 sha256 计算稳定。
3. `ON DUPLICATE KEY UPDATE` 不会把已关联的 `work_item_id` / `usage_id` 重置为 NULL（用 `COALESCE(VALUES(...), col)`）。

### 6.5 跨 batch

1. batch A 只含 prompt 事件，batch B 只含 response 事件（同一 `prompt_id` / `session_id`）。
2. 两个 batch 都清洗后，生成同一个 `sdd_interactions` 行，`prompt_text` 和 `response_text` 都不为空。
3. 跨 batch 的 work_item / skill_usage 关联在更晚的 batch 进来时不会丢失。

## 7. Dashboard API Test

目标：证明页面所需数据都能从新 API 获取，且每个端点 response 通过 zod schema。

完整 P0 API 列表（26 个）：

**Ingest（4）**

```text
POST /api/ingest/otlp-logs
GET  /api/ingest/health
GET  /api/ingest/batches
GET  /api/ingest/batches/:batchId
```

**Events（4）**

```text
GET /api/events/distribution
GET /api/events/field-coverage
GET /api/events/field-values
GET /api/events/timeline
```

**SDD（15）**

```text
GET    /api/sdd/semantics
POST   /api/sdd/semantics
PUT    /api/sdd/semantics/:id
DELETE /api/sdd/semantics/:id
GET    /api/sdd/funnel
GET    /api/sdd/usage-summary
GET    /api/sdd/usages
GET    /api/sdd/interactions
GET    /api/sdd/interactions/:interactionId
GET    /api/sdd/interactions/:interactionId/tool-calls
GET    /api/sdd/errors
GET    /api/sdd/users
GET    /api/sdd/versions
GET    /api/sdd/work-items
GET    /api/sdd/work-items/:workItemId
POST   /api/sdd/user-settings
```

**Ops（4）**

```text
GET /api/ops/tables
GET /api/ops/tables/:tableName/rows
GET /api/ops/jobs
GET /api/ops/queue
```

状态覆盖：

1. 空数据：表为空时返回 `items=[]`，不抛错。
2. 正在 processing：batch 状态 `processing` 时返回的列表项包含该 batch。
3. parsed 有数据：派生表非空，统计数字非 0。
4. failed 有错误：batch `status='failed_retryable'` 或 `failed_terminal` 时返回 `lastError` 字段。
5. 分页有下一页：`cursor` 字段在结果不为空时返回；客户端用 `cursor` 拉下一页能取到不重复数据。
6. 非法 query 被拒：`?groupBy=user`、`?status=invalid`、`?limit=abc` 等返回 `VALIDATION_FAILED`。

## 8. Frontend Smoke Test

目标：证明 dashboard 作为产品可用。

浏览器验收：

1. 页面不白屏。
2. 所有 tab 可切换。
3. 空数据状态正常。
4. 上传 fixture 后采集健康页能看到 batch。
5. 清洗完成后事件分布有数据。
6. Skill 调用漏斗有数据，且**含"未匹配 Skill"节点**（case 2 验收点）。
7. 用户 / 机器维度有数据，`requirementsRootPath` 字段显示来自 OTel 的真实值（case 1 验收点）。
8. Raw 批次详情能看到 batch 状态。
9. Skill 使用概览能看到按 skill / semantic 聚合后的调用统计。
10. Ops 数据库浏览能查看 MySQL 表结构、字段最大 size 估算、字段筛选和表数据。
11. Work item 详情页 `errorCount` 在有错误时显示非 0（case 5 验收点）。

今日 MVP 暂不验收：

1. 版本分析视图。

命令建议：

```text
pnpm dev:web
# 浏览器手工走查 + 录像
```

## 9. 性能和容量 Smoke

P0 不做复杂压测，但要证明 100 人团队 MVP 规模不会立刻崩。

最小检查：

1. 连续上传 1000 个 fixture batch。
2. 定时任务不丢 outbox。
3. 清洗任务能在可接受时间内完成。
4. dashboard 查询 P95 小于 2s。
5. raw / text 大字段不会被默认列表接口全量返回。

## 10. P0 完成定义

全部满足才算 P0 完成：

1. `pnpm dev` 能启动 web / server / 本地清洗运行时。
2. Docker Compose 能启动 MySQL。
3. migration 和 seed 可重复执行。
4. 新上报 payload 能入 raw。
5. outbox 能被定时任务可靠 claim。
6. 定时清洗任务能生成派生数据。
7. 所有 P0 API 通过 Zod contract test。
8. dashboard 今日 MVP 页面可用。
9. retention 可用；reprocess 作为后续能力补齐。
10. README 有本地启动、测试、排障说明。

## 11. P0 修复回归清单

本节追踪 2026-05-18 这一轮针对 work item 识别链路缺口的修复（commit `a6cca02`）。每条都要在 §6 对应小节有可证伪断言。

| Case | 问题                                                                                                  | 修复                                                                                                                               | 验收位置                                |
| ---- | ----------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------- |
| 1    | `sdd_users.requirements_root_path` 靠 seed 硬编码兜底，OTel 上报链路没闭环                            | 客户端 `OTEL_RESOURCE_ATTRIBUTES` 加 `sdd.requirements_root_path=...`；删除 `seed.ts` 里的无差别 UPDATE                            | §6.2 case 1                             |
| 2    | `tool.name`、`user_prompt.command_name` 污染 `sdd_skill_usages`；未匹配 alias 的 usage 被 worker 丢弃 | `upsertSkillUsages` 仅处理 `event_name='skill_activated'`；未匹配 alias 时仍落库，`matched_by='unmatched'`                         | §6.2 case 2                             |
| 3    | `SddFunnelQuerySchema.groupBy` 暴露 `user` / `work_item` 但实现固定按 `semantic` 分组                 | enum 收紧为 `['semantic']`；同步 `docs/frontend-gap-analysis.md`                                                                   | §3 第 5 项                              |
| 4    | `docs/api-contract.md` 列出 `/usages.rawSkillName`、`/interactions.hasError` 但 contract 和实现都没有 | 文档移除上述未实现字段                                                                                                             | §7 API 列表（保持文档与 contract 一致） |
| 5    | `sdd_errors.usage_id` / `work_item_id` 始终写 NULL，`workItem.errorCount` 恒为 0                      | `upsertErrors` 通过 `(session_id, event_time ≤ error.event_time)` 关联最近 usage 回填两字段；调用顺序调整到 `upsertWorkItems` 之后 | §6.2 case 5                             |
| 9    | 缺少自定义资源身份时每个变化 payload 都按 `unknown:<payload_hash>` 新增用户                           | 从 Claude Code log record 提取稳定 `user.id` 作为 `otel-user:` 兜底，并在 README 补充 `sdd.install_id` 配置                        | §6.2 case 9                             |

待修复（不在本次 commit 范围）：

| Case | 状态                                                                                                      |
| ---- | --------------------------------------------------------------------------------------------------------- |
| 6    | reprocess 端点缺失（contract 已定义，server 未实现），P1                                                  |
| 7    | ops job detail（`GET /api/ops/jobs/:jobId`）缺失，P1                                                      |
| 8    | 测试覆盖薄（worker 是 `--passWithNoTests`），P0：本次准备按 §6.2 + §6.3 + §6.4 各挑一条写 worker 集成测试 |
