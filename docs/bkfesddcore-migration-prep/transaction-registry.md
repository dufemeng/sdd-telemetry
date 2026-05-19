# 事务边界 + 幂等性现状清单

> 输出时间：2026-05-19
> 用途：bkfesddcore (Chair/tegg + dal v2) 迁移源端准备
> 范围：枚举当前所有事务边界、嵌套调用关系、幂等性设计；不包含任何代码改动
> 关联：[review.md](./review.md)、[cleaning-steps.md](./cleaning-steps.md)

## TL;DR

- **server 端 4 处业务事务 + 1 个抽象层**；worker 端 **6 处业务事务 + 1 个抽象层**
- **全部为单层事务，无任何嵌套调用**——dal v2 不支持嵌套事务（假设成立）不会卡迁移
- worker 全部复用 `withTransaction` 抽象；server 只有 1/4 复用 `TypeOrmUnitOfWork`，其余 3 处直接 `dataSource.transaction()`（**已有抽象未复用**，但不在本次重构范围内，仅记录）
- 8 张派生表全部 `INSERT ... ON DUPLICATE KEY UPDATE` 幂等
- **关键约束**：MySQL `GET_LOCK` 在 cleaning-worker 的 `persistCleanedData` **事务内**获取（cleaning-worker.ts:282），锁生命周期绑定连接生命周期，事务结束即释放——迁移时锁机制设计必须考虑这个绑定关系

---

## 一、抽象层（2 处）

| 抽象 | 位置 | 实现方式 | 被谁用 |
| --- | --- | --- | --- |
| `withTransaction(pool, callback)` | `worker/src/infrastructure/mysql/client.ts:21-38` | 直接管 `mysql2/promise` 的 `connection.beginTransaction / commit / rollback` + finally release | worker 端全部业务事务（W1/W3/W4/W5/W6），唯独 W2 没用 |
| `TypeOrmUnitOfWork.run(handler)` | `server/src/common/transaction/unit-of-work.ts:18-40` | TypeORM `dataSource.createQueryRunner` + `startTransaction / commitTransaction / rollbackTransaction` + finally release。同时存在 `NoopUnitOfWork` 用于测试 | server 端只有 S1 用了 |

## 二、server 端业务事务（4 处）

### S1：`ingest-receive.service.ts:48-62` `receive()`

| 项目 | 内容 |
| --- | --- |
| 用途 | OTLP logs 接收入口：写原始 payload + outbox + 创建/更新 user |
| 涉及表 | `otel_raw_payloads`、`otel_ingest_batches`、`ingest_outbox`、`sdd_users` |
| 抽象层复用 | ✅ 使用 `TypeOrmUnitOfWork` |
| 事务体内 service 调用 | 调 `ingestWriteRepository.recordReceive(context.manager, ...)`，**传 manager 共享事务，不嵌套** |
| 隔离级别假设 | 依赖 MySQL 默认 REPEATABLE READ；批次 ID 用 sdd-snowflake 生成，无 SELECT 后 INSERT 的脏读风险 |
| 注释 | 这是 P0 数据入口最关键事务，迁移后必须保持「raw + outbox 原子性」语义 |

### S2：`sdd-query.service.ts:259-299` `createSemantic()`

| 项目 | 内容 |
| --- | --- |
| 用途 | 新建一个 SDD skill semantic + 关联的多个 alias |
| 涉及表 | `sdd_skill_semantics`、`sdd_skill_aliases` |
| 抽象层复用 | ❌ 直接调用 `dataSource.transaction(async manager => ...)` |
| 事务体内 service 调用 | 只调 `manager.query()`，**无嵌套** |
| 事务结束后立即查询 | `await this.listSemantics()`（行 301，不在事务内）——存在并发下读不到自己写的风险窗口（通常可忽略，因为 createSemantic 一般串行操作） |
| 隔离级别假设 | 依赖 ON DUPLICATE KEY UPDATE 幂等，重复创建不会报错 |

### S3：`sdd-query.service.ts:313-339` `updateSemantic()`

| 项目 | 内容 |
| --- | --- |
| 用途 | 更新 semantic + 全删全建 aliases |
| 涉及表 | 同 S2 |
| 抽象层复用 | ❌ |
| 事务体内 service 调用 | 只调 `manager.query()`，**无嵌套** |
| 特别注意 | DELETE 全量 + INSERT 全量的「替换语义」对 FK 不友好，但 sdd_skill_aliases 没有外键约束，所以行为正确 |

### S4：`sdd-query.service.ts:352-355` `deleteSemantic()`

| 项目 | 内容 |
| --- | --- |
| 用途 | 双表 DELETE（先 aliases 再 semantic） |
| 涉及表 | 同 S2 |
| 抽象层复用 | ❌ |
| 事务体内 service 调用 | **无嵌套** |

## 三、worker 端业务事务（6 处）

### W1：`cleaning-worker.ts:208-253` `markBatchProcessing()`

| 项目 | 内容 |
| --- | --- |
| 用途 | 5 步流程的第 1 步：把 batch 状态从 received/queued/failed_retryable → processing；同时读出 raw payload |
| 涉及表 | `otel_ingest_batches`（SELECT FOR UPDATE + UPDATE）、`otel_raw_payloads`（SELECT JOIN） |
| 抽象层复用 | ✅ `withTransaction` |
| 事务体内 service 调用 | 无嵌套，单文件内联 |
| 锁 | 用 `SELECT ... FOR UPDATE` 行锁防止两个 worker 实例同时处理同一 batch |

### W2：`cleaning-worker.ts:263-303` `persistCleanedData()` —— 核心大事务

| 项目 | 内容 |
| --- | --- |
| 用途 | 5 步流程的第 3 步：所有派生数据写入 + MySQL `GET_LOCK` 获取 |
| 涉及表 | **8 张**：`otel_log_events`、`sdd_interactions`、`sdd_interaction_texts`、`sdd_interaction_tool_calls`、`sdd_skill_usages`、`sdd_errors`、`sdd_work_items`、`sdd_work_item_artifacts` |
| 抽象层复用 | ❌ **手写 `connection.beginTransaction / commit / rollback`**（行 276/295/298），未用 `withTransaction` |
| 事务体内 service 调用 | 调 `acquireCleaningLocks`、`loadScopedEvents`、`upsertLogEvent`、`upsertInteractions`、`upsertToolCalls`、`upsertSkillUsages`、`upsertWorkItems`、`upsertErrors` —— **全部传 `connection` 共享事务，不嵌套** |
| **关键约束** | `acquireCleaningLocks(connection, events)` 在事务内（行 282），意味着：MySQL `GET_LOCK` 锁是**连接级**，事务 commit/rollback 后连接 release，锁自动释放。`releaseCleaningLocks` 在 finally 块（行 301）做的是显式释放，但即使不调用，连接释放后锁也会消失。**迁移到 FaaS 时要保留「锁生命周期 = 事务生命周期」的语义** |
| 隔离级别 | 依赖 REPEATABLE READ + 8 张表的 ON DUPLICATE KEY UPDATE 幂等性 + GET_LOCK 互斥（同一 prompt_id/session_id 只能一个 worker 进入） |
| 复用违反 | ❌ 应改用 `withTransaction`，但本次不重构 |

### W3：`outbox-dispatcher.ts:46-86` `claimOutboxRows()`

| 项目 | 内容 |
| --- | --- |
| 用途 | 批量 claim outbox 行，把 status 从 pending/dispatching → dispatching，attempts +1，加 locked_by 和 locked_until |
| 涉及表 | `ingest_outbox` |
| 抽象层复用 | ✅ `withTransaction` |
| 事务体内 service 调用 | 只调 `markTerminalInTransaction(connection, row, ...)`，**传 connection 共享，不嵌套** |
| 锁 | `SELECT ... FOR UPDATE` |

### W4：`outbox-dispatcher.ts:88-112` `markOutboxDispatched()`

| 项目 | 内容 |
| --- | --- |
| 用途 | dispatch 成功后：outbox.status → dispatched + batch.status → queued |
| 涉及表 | `ingest_outbox`、`otel_ingest_batches` |
| 抽象层复用 | ✅ |
| 嵌套 | 无 |

### W5：`outbox-dispatcher.ts:114-142` `markOutboxDispatchFailed()`

| 项目 | 内容 |
| --- | --- |
| 用途 | dispatch 失败：含指数退避 `retrySeconds = min(300, 2^min(attempts, 8))` |
| 涉及表 | `ingest_outbox` |
| 抽象层复用 | ✅ |
| 嵌套 | 无 |

### W6：`scheduled-cleaning-runner.ts:88-129` `claimOneOutbox()`

| 项目 | 内容 |
| --- | --- |
| 用途 | 定时扫描入口的 claim 实现，单次取一行 |
| 涉及表 | `ingest_outbox`、`otel_ingest_batches` |
| 抽象层复用 | ✅ |
| 锁 | `SELECT ... FOR UPDATE LIMIT 1` |
| 嵌套 | 无 |
| 注意 | 跟 W3 是两套 claim 实现，行为相似但参数不同。迁移到 Chair `@ScheduleMethod` 时应保留 W6 这条路径（实际生产 path），W3 可视情况废弃 |

## 四、嵌套事务核查结论

逐一核对 10 处业务事务体内的所有调用：

| 事务 | 体内调用 | 是否嵌套？ |
| --- | --- | --- |
| S1 | `ingestWriteRepository.recordReceive(context.manager, ...)` | ❌ 共享 manager |
| S2/S3/S4 | 仅 `manager.query()` | ❌ |
| W1 | 仅 `connection.query()` | ❌ |
| W2 | 8 个 upsert 函数 + `acquireCleaningLocks` + `loadScopedEvents`，全部传 `connection` | ❌ |
| W3 | `markTerminalInTransaction(connection, ...)` | ❌ 共享 connection |
| W4/W5 | 仅 `connection.query()` | ❌ |
| W6 | 仅 `connection.query()` | ❌ |

**最终结论：10 处事务全部单层、无任何嵌套调用。** dal v2 是否支持嵌套事务（待验证）不会成为迁移阻塞点。

> 反例补充：如果迁移过程中新增需求让某个事务调用其他 service 的方法，必须保持「传递 manager / connection 而不开新事务」的模式，避免引入嵌套。

## 五、已有抽象的复用情况

| 抽象 | 应用位置 | 复用率 |
| --- | --- | --- |
| `withTransaction` | W1, W3, W4, W5, W6 复用（5/6）；W2 未复用 | **83%** |
| `TypeOrmUnitOfWork` | S1 复用；S2/S3/S4 未复用（3/4 直接 `dataSource.transaction()`） | **25%** |

**记录但不在本次重构**：
- W2 应改用 `withTransaction`（一致性）
- S2/S3/S4 应改用 `TypeOrmUnitOfWork`（CLAUDE.md 四项自检的复用分析违反）

迁移时这些复用违反会自然消失——dal v2 transaction adapter 会替换底层实现，service 层不会再直接调 `dataSource.transaction()`。

## 六、幂等性现状卡

### 8 张派生表全部 `INSERT ... ON DUPLICATE KEY UPDATE`

| 表 | INSERT 行号 | ON DUPLICATE KEY UPDATE 行号 |
| --- | --- | --- |
| `otel_log_events` | 366 | 373 |
| `sdd_interactions` | 518 | 526 |
| `sdd_interaction_texts` | 610 | 614 |
| `sdd_interaction_tool_calls` | 676 | 681 |
| `sdd_skill_usages` | 756 | 763 |
| `sdd_errors` | 835 | 840 |
| `sdd_work_items` | 934 | 938 |
| `sdd_work_item_artifacts` | 967 | 972 |

均在 `worker/src/jobs/cleaning-worker.ts`。

### Stable Key 设计（防重复污染）

- `prompt:${event.prompt_id}` / `session:${event.session_id}` —— 用于 W2 事务内 `acquireCleaningLocks` 的锁名计算（cleaning-worker.ts:1518/1522）
- `usage:${event.event_id}:${rawSkillName}` —— sdd_skill_usages 的稳定唯一键
- `error:${event.event_id}:${messageHash ?? ''}` + `errorMessage` 的 sha256 / stackTrace 的 sha256 —— sdd_errors 的稳定键
- `artifact:${relativeDir}:${artifactPath}` + `work-item:${businessDomain ?? ''}:${slug}` —— work items 的稳定键

所有 stable key 都用 `sha256` hash，不存原始字符串作为唯一键（避免长度问题 + 隐私问题）。

### 锁机制

- 类型：MySQL `GET_LOCK / RELEASE_LOCK` 命名锁（**不是** Redis 分布式锁，**不是** 行锁）
- 锁名规则：`sdd-clean:${sha256(rawKey).slice(0, 48)}` —— **58 字符**（10 字符前缀 + 48 字符 hex），适配 MySQL `GET_LOCK` 64 字符上限的有意设计（不是历史包袱）
- 锁获取位置：W2 事务内 `acquireCleaningLocks`（cleaning-worker.ts:282）
- 锁释放位置：finally 块（cleaning-worker.ts:301），但即使不调，连接释放时锁也会自动失效（GET_LOCK 是会话级）
- 锁的作用：防止两个 worker 实例同时清洗同一 prompt/session 的事件，避免做无用功（数据正确性由 upsert 幂等保证）

## 七、迁移到 dal v2 的关注点

按本清单可直接得出的迁移决策：

| 关注点 | 现状 | 迁移建议 |
| --- | --- | --- |
| 嵌套事务 | 无 | 不需要 dal v2 支持嵌套 |
| 事务抽象层 | server 用 `TypeOrmUnitOfWork`（QueryRunner），worker 用 `withTransaction`（mysql2 Pool） | dal v2 transaction adapter 替换两个抽象，service/job 代码改动量小 |
| `TypeORM dataSource.transaction()` 直接调用（S2/S3/S4） | 3 处违反复用 | 迁移时一并接入 dal v2 transaction adapter |
| `mysql2` 手写 `beginTransaction`（W2） | 1 处不一致 | 迁移时改用 dal v2 等价 API |
| `SELECT ... FOR UPDATE` 行锁（W1/W3/W6） | 行级 | dal v2 应继续支持，无需改 |
| MySQL `GET_LOCK` 连接级命名锁（W2 内） | 锁绑事务生命周期 | **FaaS 适配硬约束**：必须验证 FaaS 实例池中获取的连接持有锁的可见性是否符合预期。若雨燕 FaaS 用连接池，每个实例持续持有连接，则语义不变；若每次调用都新建连接，则需替换为 SELECT FOR UPDATE 行锁或基于 ingest_outbox 的乐观锁 |
| ON DUPLICATE KEY UPDATE 幂等 | 8 表全覆盖 | dal v2 应继续支持。若 dal v2 不直接支持，需用其等价 API 表达 |
| `sdd_users` 表的写入（S1 事务内的 ensureUser） | 见 ingest-write.repository.ts 实现 | 详见 sql-registry.md（待输出） |

## 八、待验证项（来自 review.md A.2）

- A.2 第 1 项：dal v2 是否支持嵌套事务 —— 由本清单结论 **「现有代码无嵌套」** 解锁，迁移可以**不依赖**嵌套支持
- A.2 第 5 项：sdd-query.service.ts:259/313/352 三处事务体内是否调用其他可能开事务的 service 方法 —— **本清单已核对完毕：S2/S3/S4 体内仅 `manager.query()`，无嵌套风险**
