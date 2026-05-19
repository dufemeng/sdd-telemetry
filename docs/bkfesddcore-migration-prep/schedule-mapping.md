# 调度行为现状记录

> 输出时间：2026-05-19
> 用途：bkfesddcore (Chair/tegg + FaaS) 迁移源端准备
> 范围：记录当前定时扫描行为的全部配置点和调用路径，便于迁移到 Chair `@ScheduleMethod` 时直接对应
> 关联：[cleaning-steps.md](./cleaning-steps.md)、[transaction-registry.md](./transaction-registry.md)

## TL;DR

当前 worker **已经是定时扫描架构**（不是 BullMQ 消费）。完整调用链：

```
worker/src/main.ts
  └─ setInterval(tick, SCHEDULE_CLEANING_INTERVAL_MS=30000)   ── 30 秒一个 tick
        └─ runScheduledCleaning()
              └─ while (Date.now() < deadline=now+SCHEDULE_CLEANING_BUDGET_MS=45000)
                    └─ claimOneOutbox()                       ── 单事务 claim 1 行
                          ├─ SELECT ... FOR UPDATE LIMIT 1 from ingest_outbox
                          └─ UPDATE outbox.status='dispatching' + batch.status='queued'
                    └─ cleanBatch()                            ── 真正的清洗，5 步
                    └─ markOutboxSucceeded() | markOutboxFailed()
```

迁移到 Chair 时把 `setInterval` 替换为 `@ScheduleMethod({ cron })` 即可，其余逻辑零改动。

## 一、入口与触发机制

| 项目 | 实测内容 |
| --- | --- |
| 入口文件 | `worker/src/main.ts` |
| 入口函数 | `main()` （行 8） |
| 触发机制 | `setInterval(tick, intervalMs)` （行 43） |
| 触发间隔 | `intervalMs = SCHEDULE_CLEANING_INTERVAL_MS env`，默认 **30000 ms (30 秒)** （行 20） |
| 启动时立即跑一次 | 是：`await tick();` （行 49） |
| 单次 tick 跳过策略 | 使用 `running` 标志位，上一轮没结束时下一轮 skip（行 23-25），输出 `'scheduled cleaner tick skipped because previous tick is still running'` |
| 单次 tick 函数 | `runScheduledCleaning(options)` （定义在 scheduled-cleaning-runner.ts:36） |
| 优雅退出 | 监听 SIGTERM/SIGINT，`clearInterval` + `pool.end()` + `process.exit(0)` |

### 单次模式（用于冒烟测试）

| 项目 | 实测内容 |
| --- | --- |
| 触发方式 | `WORKER_ONCE=true` 环境变量（main.ts:14-17） |
| 执行 | 跑一轮 `runScheduledCleaning` 后即退出 |
| pnpm 入口 | `pnpm --filter @sdd-telemetry/worker once` |

## 二、单 tick 内的循环

`runScheduledCleaning`（scheduled-cleaning-runner.ts:36-86）：

| 项目 | 实测内容 |
| --- | --- |
| 单 tick 预算 | `budgetMs = SCHEDULE_CLEANING_BUDGET_MS env`，默认 **45000 ms (45 秒)** （行 39） |
| 终止条件 | `Date.now() >= deadline` 或 `remainingMs <= 1000`（行 49-54） |
| 循环动作 | claim 1 outbox 行 → 跑 cleanBatch → mark success/fail，循环直到 budget 用完或没行可 claim |
| outbox 空时 | 立即 `return result`（行 57-59），不等 budget 到期，让出资源 |
| 单 tick 返回 | `{ claimed, succeeded, failed, terminalFailed, deadlineReached }` |

## 三、配置环境变量汇总

| 变量名 | 默认值 | 出处 | 作用 |
| --- | --- | --- | --- |
| `SCHEDULE_CLEANING_INTERVAL_MS` | 30000 | main.ts:20 | tick 触发间隔（setInterval） |
| `SCHEDULE_CLEANING_BUDGET_MS` | 45000 | scheduled-cleaning-runner.ts:39 | 单次 tick 最长运行时间 |
| `SCHEDULE_CLEANING_LOCK_SECONDS` | 120 | scheduled-cleaning-runner.ts:89 | outbox claim 行锁有效期（locked_until） |
| `WORKER_ONCE` | （未设置） | main.ts:14 | true 时只跑一轮就退出 |
| `MYSQL_HOST / PORT / USER / PASSWORD / DATABASE / POOL_SIZE` | 见 mysql/client.ts:8-18 | infrastructure | DB 连接 |
| `EVENT_RETENTION_DAYS / TEXT_RETENTION_DAYS / CLEAN_BATCH_MAX_PAYLOAD_BYTES / CLEAN_BATCH_MAX_EVENTS` | 见 [cleaning-steps.md 第四节](./cleaning-steps.md) | cleaning-worker.ts | 清洗参数 |

## 四、关键参数关系（潜在隐患）

| 关系 | 默认下数值 | 含义 |
| --- | --- | --- |
| `intervalMs(30000) < budgetMs(45000)` | 30 秒间隔 vs 45 秒预算 | **当一轮 tick 真跑满 45 秒时，下一轮 30 秒 tick 会被 skipped，实际频率劣化为 45 秒** |
| `budgetMs(45000) < lockSeconds*1000(120000)` | 45 秒预算 vs 120 秒锁 | **预算耗尽后未释放的行仍被锁 120 秒**，要等锁到期才会被下个 tick 重新 claim。这是 outbox 锁的"保护性悬挂"——避免同一行在多 worker 间反复争用 |
| `lockSeconds(120) > budgetMs(45)` | 120 秒 vs 45 秒 | 即使 worker 进程被杀（lock 没释放），120 秒后锁也会自动失效，新 worker 可重 claim |

**对应 `implementation-plan.md`**：
- 第 288 行 `@ScheduleMethod({ cron: '*/30 * * * * ?' })` —— 与当前 intervalMs=30000 一致
- 第 310 行 `SCHEDULE_CLEANING_BUDGET_MS = 45000` —— 同名同值
- 第 331 行 "ScheduleMethod 是否支持秒级 cron" —— 已在 [review.md A.2 第 2 项](./review.md) 列为待验证

**风险**：若雨燕 FaaS 不支持秒级 cron（比如最小 1 分钟），则 30 秒间隔的设计无法保留，需要权衡：
- 提高 budgetMs（让单次 tick 处理更多 outbox 行）
- 或在 Chair `@ScheduleMethod` 内增加 while 循环延长有效频率（但受 FaaS 单次调用超时约束）

## 五、claim + dispatch 状态机

### outbox 状态流转

```
pending ──claim──→ dispatching ──cleanBatch 成功──→ dispatched
   ↑                  │
   │                  ├──cleanBatch 失败 + attempts < max──→ pending (next_retry_at 退避)
   │                  │
   │                  └──cleanBatch 失败 + attempts >= max 或 TerminalError──→ failed_terminal
   │
   └──── next_retry_at 到期或 locked_until 过期后被重新 claim
```

### batch 状态流转（详见 [cleaning-steps.md 第三节](./cleaning-steps.md)）

```
received ──claim──→ queued ──cleanBatch──→ processing ──→ parsed
                                                       └──→ failed_retryable / failed_terminal
```

## 六、退避策略

`markOutboxFailed`（scheduled-cleaning-runner.ts:154-181）：

| 项目 | 实测内容 |
| --- | --- |
| 退避算法 | `retrySeconds = min(300, 2 ^ min(attempts, 8))` |
| attempts=1 | 2 秒 |
| attempts=2 | 4 秒 |
| attempts=3 | 8 秒 |
| attempts=4 | 16 秒 |
| attempts=5 | 32 秒 |
| attempts=6 | 64 秒 |
| attempts=7 | 128 秒 |
| attempts=8 | 256 秒 |
| attempts ≥ 9 | 300 秒（封顶） |
| 终态判定 | `TerminalCleaningError` 或 `attempts >= max_attempts` → `failed_terminal`，不再调度 |

## 七、ingestOutbox 表所需字段（实测）

供 dal v2 DAO 设计参考。来自 `ingest_outbox` 的 SELECT 投影（scheduled-cleaning-runner.ts:92-93）+ UPDATE 字段（行 109-118, 162-170）：

| 字段 | 用途 |
| --- | --- |
| `id` | 主键 |
| `aggregate_id` | batch id（关联 `otel_ingest_batches.id`） |
| `event_type` | 固定为 `clean_batch` |
| `status` | pending / dispatching / dispatched / failed_terminal |
| `attempts` | 当前重试次数 |
| `max_attempts` | 重试次数上限 |
| `next_retry_at` | 退避到期时间，NULL 表示可立即重试 |
| `locked_by` | claim 该行的 workerId |
| `locked_until` | claim 锁到期时间 |
| `last_error` | 最近一次失败的错误描述 |
| `dispatched_at` | 成功完成时间 |
| `gmt_modified` | 更新时间 |

## 八、迁移到 Chair `@ScheduleMethod` 的映射建议

| 当前 | Chair 目标态 | 备注 |
| --- | --- | --- |
| `worker/src/main.ts` `setInterval` + `tick` | `@ScheduleMethod({ cron: '*/30 * * * * ?' })` 装饰一个 service 方法 | 雨燕 FaaS 是否支持秒级 cron 待验证 |
| `runScheduledCleaning` while 循环 | Service 方法体保留 while 循环，照搬 budget 判定 | 受 FaaS 单次调用超时约束，`budgetMs` 可能需调小 |
| `claimOneOutbox` | dal v2 DAO 方法 + transaction adapter | SELECT FOR UPDATE 行锁 dal v2 应支持 |
| `cleanBatch` | 直接复用（已是纯函数 + IO 拆分） | 见 cleaning-steps.md |
| `markOutboxSucceeded / Failed` | dal v2 DAO 方法 | 无事务（裸 UPDATE） |
| Pool 连接管理 (`createMysqlPool`) | Chair 的 dal v2 自动注入 | 无需手动 createPool |
| 优雅退出 SIGTERM/SIGINT | **FaaS 模型下不需要**——单次调用结束即释放 | — |
| `WORKER_ONCE` 单次模式 | **保留为冒烟测试入口**（本地调试用） | — |

## 九、死代码 flag（独立项，不在本次范围）

### `worker/src/jobs/outbox-dispatcher.ts` 是完全的死代码

| 验证 | 结果 |
| --- | --- |
| 谁 import 它？ | **零外部引用**（rg `outbox-dispatcher\|dispatchOutbox` 全仓只命中文件自身） |
| 它和 scheduled-cleaning-runner 的关系 | 功能重复：scheduled-cleaning-runner 是当前活路径，outbox-dispatcher 是旧路径（按 BullMQ 设计） |
| 依赖 | `import type { Queue } from 'bullmq'` —— 与 BullMQ 死代码一起 |

**建议**：迁移后或独立清理任务里把 `outbox-dispatcher.ts` + `clean-batch-queue.ts` + `bullmq` / `ioredis` 依赖一起删除。本次不动，避免节外生枝。

### BullMQ / ioredis / docker-compose redis 服务

- `worker/package.json` 依赖 `bullmq ^5.76.8` + `ioredis ^5.10.1` —— 仅 outbox-dispatcher.ts + clean-batch-queue.ts 在用
- `docker-compose.yml:26-27` 起 `redis:7.4` —— 业务侧零引用
- `README.md:11` 原来写 "BullMQ + outbox 模式" 已修正为 "定时扫描 outbox + cleanBatch"
- `README.md:16` 原来写 "队列：Redis" 已去掉
