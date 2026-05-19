# 清洗管道 5 步流程拆分

> 输出时间：2026-05-19
> 用途：bkfesddcore (Chair/tegg + dal v2 + FaaS) 迁移源端准备
> 主文件：`worker/src/jobs/cleaning-worker.ts`（1971 行）
> 主入口：`cleanBatch(job, dependencies)` 行 117-178
> 关联：[transaction-registry.md](./transaction-registry.md)、[schedule-mapping.md](./schedule-mapping.md)

## TL;DR

公司电脑提出的"5 步流程"语义边界与代码完全吻合，但**第 4 步「释放锁」实际在第 3 步事务的 finally 块内**，不是独立的网络往返。重整后的真实流程：

```
cleanBatch(job)
├─ 1. markBatchProcessing          [W1 事务，行 208-253]
├─ 2. parsePayload + extractOtelLogEvents  [纯函数，无 IO，行 150-156]
├─ 3. persistCleanedData           [W2 大事务，行 263-303]
│    ├─ upsertLogEvent × N
│    ├─ acquireCleaningLocks       [事务内 GET_LOCK]
│    ├─ loadScopedEvents
│    ├─ upsertInteractions
│    ├─ upsertToolCalls
│    ├─ upsertSkillUsages
│    ├─ upsertWorkItems
│    ├─ upsertErrors
│    └─ finally: releaseCleaningLocks  [事务 commit/rollback 后]
└─ 4. markBatchParsed              [裸 UPDATE，行 1277-1300]

异常路径：catch → markBatchFailed   [裸 UPDATE，行 180-206]
```

迁移到 Chair/FaaS 时，每一步的语义边界都可以独立映射，没有跨步骤的隐式状态。

---

## 一、详细步骤拆分

### Step 1：markBatchProcessing — 状态翻转 + 锁行 + 读 raw payload

| 项目 | 内容 |
| --- | --- |
| 函数位置 | cleaning-worker.ts:208-253 |
| 调用位置 | cleaning-worker.ts:133 |
| 事务边界 | W1（`withTransaction(pool, ...)`） |
| 输入 | `pool: Pool`, `batchId: string` |
| 输出 | `LoadedBatch \| null`（null 表示已 parsed，跳过；非 null 含 batchId、userId、payloadJson） |
| 涉及表 | `otel_ingest_batches`（SELECT FOR UPDATE + UPDATE 行 233-245）、`otel_raw_payloads`（LEFT JOIN 读出 payload_json） |
| 关键 SQL | `SELECT b.id, b.user_id, b.status, r.payload_json FROM otel_ingest_batches b LEFT JOIN otel_raw_payloads r ON r.batch_id = b.id WHERE b.id = ? LIMIT 1 FOR UPDATE` |
| 状态翻转 | `received / queued / failed_retryable → processing` |
| 异常 | `TerminalCleaningError` if batch 不存在或 raw payload 为空 |
| 纯/IO | **纯 IO**，无业务逻辑 |

### Step 2：parsePayload + extractOtelLogEvents — 解析 OTLP，提取事件

| 项目 | 内容 |
| --- | --- |
| 函数位置 | parsePayload: cleaning-worker.ts:255-261；extractOtelLogEvents: `worker/src/jobs/otel-extractor.ts` |
| 调用位置 | cleaning-worker.ts:150-151 |
| 事务边界 | 无 |
| 输入 | `payloadJson: string`（来自 Step 1 的 LoadedBatch） |
| 输出 | `ExtractedLogEvent[]` |
| 涉及表 | 无 |
| 关键操作 | `JSON.parse` + OTLP logs 结构遍历（resource → scope → logRecord）+ attribute key 标准化 |
| 边界校验 | `maxPayloadBytes` 默认 5MB（env: `CLEAN_BATCH_MAX_PAYLOAD_BYTES`）；`maxEventCount` 默认 500（env: `CLEAN_BATCH_MAX_EVENTS`） |
| 异常 | `TerminalCleaningError` 若 payload 太大、事件过多、JSON 无效 |
| 纯/IO | **纯函数**，无 IO，无副作用，可独立测试 |

### Step 3：persistCleanedData — 8 表 upsert + 命名锁

| 项目 | 内容 |
| --- | --- |
| 函数位置 | cleaning-worker.ts:263-303 |
| 调用位置 | cleaning-worker.ts:158-163 |
| 事务边界 | W2（**手写** `connection.beginTransaction / commit / rollback`，未用 withTransaction） |
| 输入 | `pool: Pool`, `{ batch, events, eventRetentionDays, textRetentionDays }` |
| 输出 | `derivedCount: number`（interactions + toolCalls + usages + errors + artifacts 之和） |
| 涉及表 | **8 张**：`otel_log_events`、`sdd_interactions`、`sdd_interaction_texts`、`sdd_interaction_tool_calls`、`sdd_skill_usages`、`sdd_errors`、`sdd_work_items`、`sdd_work_item_artifacts` |
| 锁机制 | MySQL `GET_LOCK / RELEASE_LOCK` 命名锁，锁名 `sdd-clean:${sha256(rawKey).slice(0,48)}`（58 字符）。锁键来自 `prompt:${promptId}` 或 `session:${sessionId}`，超时 10 秒 |
| 锁生命周期 | **事务内获取（行 282）→ finally 块释放（行 301）→ 连接 release**。即使释放调用失败（catch 内 swallow，见行 350），连接 release 后 MySQL 自动失效 |
| 纯/IO 边界 | 内部混合：8 个 upsert 函数是 IO；但事件分组、stable key 计算（sha256）、skill name 匹配（语义识别）等是**可剥离的纯函数**（迁移后建议剥离到独立 module） |

**Step 3 子流程细化**（按执行顺序）：

| 子步骤 | 行号 | 操作 | 涉及表 |
| --- | --- | --- | --- |
| 3.1 | 278-280 | `upsertLogEvent × N`：每条 OTel 事件一次 upsert | otel_log_events |
| 3.2 | 282 | `acquireCleaningLocks`：按 prompt_id/session_id 加锁（多个则按字典序加锁防死锁） | — |
| 3.3 | 283 | `loadScopedEvents`：读出加锁范围内所有事件（跨 batch） | otel_log_events |
| 3.4 | 284-288 | `upsertInteractions`：识别交互（用户提示、助手响应、工具调用） | sdd_interactions、sdd_interaction_texts |
| 3.5 | 289 | `upsertToolCalls`：从交互文本中提取工具调用 | sdd_interaction_tool_calls |
| 3.6 | 290 | `upsertSkillUsages`：识别 skill 调用 + semantic 映射 | sdd_skill_usages |
| 3.7 | 291 | `upsertWorkItems`：从文件路径推断 work item 和 artifact | sdd_work_items、sdd_work_item_artifacts |
| 3.8 | 292 | `upsertErrors`：识别强错误事件 | sdd_errors |
| 3.9 | 295 | `commit` | — |
| 3.10 | 301（finally） | `releaseCleaningLocks`（逆序） | — |

### Step 4：markBatchParsed — 标记完成

| 项目 | 内容 |
| --- | --- |
| 函数位置 | cleaning-worker.ts:1277-1300 |
| 调用位置 | cleaning-worker.ts:165 |
| 事务边界 | **无**（直接 `pool.query`） |
| 输入 | `pool, batchId, eventCount, derivedCount` |
| 输出 | void |
| 涉及表 | `otel_ingest_batches` |
| 状态翻转 | `processing → parsed`；同时写 event_count、derived_count、parse_completed_at、parse_duration_ms（基于 parse_started_at 用 `TIMESTAMPDIFF` 算微秒差） |
| 纯/IO | 纯 IO |

### Step 5（异常路径）：markBatchFailed

| 项目 | 内容 |
| --- | --- |
| 函数位置 | cleaning-worker.ts:180-206 |
| 调用位置 | cleaning-worker.ts:175（在 cleanBatch 的 catch 内） |
| 事务边界 | 无 |
| 输入 | `pool, batchId, error, status`（status: `failed_retryable \| failed_terminal`） |
| 涉及表 | `otel_ingest_batches` |
| 区分 | `TerminalCleaningError` → `failed_terminal`；其他异常 → `failed_retryable` |
| 写入 | status、status_reason、parse_completed_at、parse_duration_ms、last_error |
| 纯/IO | 纯 IO |

## 二、纯函数模块 vs IO 模块

迁移到 FaaS 时可独立测试 / 独立替换的纯函数模块：

| 模块 | 位置 | 输入 → 输出 | 测试难度 |
| --- | --- | --- | --- |
| `parsePayload` | cleaning-worker.ts:255-261 | string → unknown JSON | 极易 |
| `extractOtelLogEvents` | worker/src/jobs/otel-extractor.ts | OTLP payload → ExtractedLogEvent[] | 易 |
| 事件分组 (`groupInteractionEvents`) | cleaning-worker.ts:1302+ | EventRow[] → Map<key, EventRow[]> | 易 |
| Stable key 生成 (`sha256`) | cleaning-worker.ts:1518/1522 | string → hashed key | 极易 |
| Skill name 匹配 (`SkillSemanticMatcher`) | （在 cleaning-worker 内部） | rawSkillName + semantics → semantic match | 易 |
| Tool call 解析 | （在 cleaning-worker 内部） | text → ToolCall[] | 中（依赖正则/JSON 解析） |
| Work item 路径推断 | 见 [README.md 工作项写入机制](../../README.md) | file_path → { workItemSlug, artifactRelativePath } | 中 |

IO 模块（必须有 DB 连接才能跑）：

| 模块 | 位置 | 副作用 |
| --- | --- | --- |
| 8 个 upsert 函数 | cleaning-worker.ts:359/454/...（详见 transaction-registry.md 的 INSERT 行号表） | INSERT ON DUPLICATE KEY UPDATE |
| `acquireCleaningLocks` / `releaseCleaningLocks` | cleaning-worker.ts:306-353 | MySQL `GET_LOCK / RELEASE_LOCK` |
| `markBatchProcessing` / `markBatchParsed` / `markBatchFailed` / `loadScopedEvents` | 见上 | UPDATE / SELECT |

**迁移建议**：纯函数模块可以放在 `domain/` 目录下、不依赖任何框架；IO 模块通过 dal v2 DAO 注入到 service 层。

## 三、错误处理 + 状态机

```
otel_ingest_batches.status 状态流转：

received ──→ queued ──→ processing ──→ parsed
              │           │
              │           ├──→ failed_retryable ──→ processing（retry 时再 W1 重新进入）
              │           │
              │           └──→ failed_terminal
              │
              └──→ failed_retryable（来自 outbox dispatch 失败）
```

| 错误类型 | 触发位置 | 结果状态 | 是否会被定时扫描重新 claim |
| --- | --- | --- | --- |
| `TerminalCleaningError` | Step 1 batch 不存在、Step 1 raw payload 缺失、Step 2 payload 太大、Step 2 事件过多 | `failed_terminal` | ❌ outbox.attempts 也会被 markTerminal（见 outbox-dispatcher.ts:144） |
| 其他异常 | 任何步骤抛出 | `failed_retryable` | ✅ 下次 claim 仍可重试，受 outbox `max_attempts` 限制 |

幂等性保证：即使因 `failed_retryable` 重试，由于 8 表全部 `ON DUPLICATE KEY UPDATE`，不会产生重复行。详见 [transaction-registry.md 第六节](./transaction-registry.md)。

## 四、关键配置项（环境变量）

| 环境变量 | 默认值 | 作用 |
| --- | --- | --- |
| `EVENT_RETENTION_DAYS` | 30 | otel_log_events 保留天数 |
| `TEXT_RETENTION_DAYS` | 30 | sdd_interaction_texts 保留天数 |
| `CLEAN_BATCH_MAX_PAYLOAD_BYTES` | 5 MB | 单 batch raw payload 上限，超出抛 TerminalCleaningError |
| `CLEAN_BATCH_MAX_EVENTS` | 500 | 单 batch 事件数上限 |
| `SCHEDULE_CLEANING_BUDGET_MS` | 45000 | 单次定时清洗预算，超时停止下一轮 claim（详见 [schedule-mapping.md](./schedule-mapping.md)） |
| `SCHEDULE_CLEANING_LOCK_SECONDS` | 120 | outbox 行的 claim 锁有效期 |

## 五、FaaS 适配关注点

| 关注点 | 现状 | 迁移时要做 |
| --- | --- | --- |
| 每步独立函数化 | ✅ 已分隔为 5 个顶层函数 | 直接映射到 Chair Service 方法即可 |
| 纯/IO 边界 | ⚠️ 8 个 upsert 函数把"SQL 构建"和"connection 执行"耦合在一起 | 迁移时按 dal v2 DAO 模式重组，但**本次不重构** |
| 事务跨 5 步 | ✅ **不跨步**：Step 1/3 各自独立事务，Step 4/5 无事务 | 直接对应 dal v2 transaction adapter |
| MySQL `GET_LOCK` | ⚠️ 锁绑事务（连接）生命周期 | **硬约束**：详见 [transaction-registry.md 第七节](./transaction-registry.md#七迁移到-dal-v2-的关注点) |
| 单次 FaaS tick 时间预算 | ✅ 已有 `SCHEDULE_CLEANING_BUDGET_MS = 45000` + `CLEAN_BATCH_MAX_PAYLOAD_BYTES / MAX_EVENTS` 限流 | 迁移时映射到 FaaS 单次调用的实际超时 |
| 多实例并发 | ✅ W1 用 `SELECT FOR UPDATE` 行锁 + W2 用命名锁双保险 | 雨燕 FaaS 多实例并发执行时，**最坏情况是多实例同时拿到不同 outbox 行，但每行的 batch 仍受 W1 行锁保护** |
| 文件长度 1971 行 | ⚠️ 单文件过大，可读性受影响 | **本次不重构**，留作迁移后的清理项；建议按表拆 8 个 upsert 文件 |

## 六、与公司电脑原描述的对照

| 公司电脑原描述（5 步） | 实测结果 |
| --- | --- |
| 1. 标记 processing | ✅ markBatchProcessing（W1 事务） |
| 2. OTel 提取 | ✅ parsePayload + extractOtelLogEvents（纯函数） |
| 3. 持久化 8 张表 | ✅ persistCleanedData（W2 事务，含 8 表 upsert） |
| 4. 释放锁 | ⚠️ **不是独立步骤**，是 W2 事务 finally 块的一部分（行 301）；独立成步骤会误导迁移设计 |
| 5. 标记 parsed | ✅ markBatchParsed（无事务） |

建议公司电脑文档把"释放锁"标注为 Step 3 子步骤而非顶级步骤，避免迁移时把它独立成一个 service 方法。
