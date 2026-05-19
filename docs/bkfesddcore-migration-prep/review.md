# 技术提案：bkfesddcore 迁移源端准备工作评审

> 评审日期：2026-05-19
> 评审对象：公司电脑产出的「SDD Telemetry → bkfesddcore (Chair/tegg FaaS) 迁移源端准备」4 项任务
> 评审形式：基于当前电脑 sdd-telemetry 仓库实际代码状态的可行性核对 + 盲点补充

## 背景

当前 SDD Telemetry 项目在「当前电脑」上以 MidwayJS + TypeORM + 本地 BullMQ worker 形态运行；目标是把后端迁移到「公司电脑」上的 bkfesddcore 平台，即 Chair（EggJS-like）+ tegg DI + dal v2 + FaaS 调度模型。

`docs/implementation-plan.md` 第 11 节早已定义 Chair 映射策略：Controller → `@TRController`、Service → `@SingletonProto`、TypeORM Repository → dalgen DAO、UnitOfWork → dal v2 transaction adapter、本地清洗 → Chair Schedule/FaaS、清洗入口固定为 `cleanBatch`。

公司电脑同事在此映射的基础上，进一步产出了 4 项**源端准备任务**（不重构架构、不改 ORM、不改表）：

1. **SQL 集中注册** — 扫描所有 `dataSource.query()` 生成清单，按 ingest → events → sdd → ops → cleaning 排序
2. **清洗管道步骤拆分** — 把 `cleaning-worker.ts` 拆成 5 步并标注纯函数
3. **动态 SQL 参数化标注** — 列举动态 WHERE 的所有参数组合
4. **端点验证基线** — 跑通 27 个查询端点，记录 request/response 样例

本评审目的：核对 4 项任务的可行性与必要性，识别盲点，对应需补充的源端工作，给出一份可直接反馈给公司电脑同事的调整建议。

## 目标

- 在零代码改动前提下，为 bkfesddcore 迁移产出可执行的源端清单和回归基线
- 把"公司电脑视角"的任务清单与"当前电脑视角"的真实代码状态对齐，消除歧义
- 显式标注公司电脑视角看不到的盲点（锁机制、事务边界、FaaS 调度替换）

## 非目标

- 本次不重构代码、不改 ORM、不改表结构
- 本次不实际执行 4 项任务、不产出 `sql-registry.md` / `cleaning-steps.md` / `endpoint-baseline.json`
- 本次不讨论"是否迁移到 bkfesddcore"——这是既定方向
- 本次不涉及前端（web）迁移；前端是 React 19 + Vite，是否同源迁留给后续讨论

## 现状分析

### 公司电脑断言 vs 当前代码实测

| 断言 | 实测结果 | 偏差 / 说明 |
| --- | --- | --- |
| SQL 散落在 `src/modules/` 和 `worker/src/` | `.query()` 调用共 **68 处**：server 55 处（sdd 30 / ingest 11 / events 7 / ops 7），worker 13 处 | ✅ 路径需修正为 **`server/src/modules/`** |
| cleaning-worker 是 5 步流程 | `worker/src/jobs/cleaning-worker.ts:117` `cleanBatch()`，5 步对应：标记 processing（208-252）→ parsePayload + extractOtelLogEvents（150-156）→ persistCleanedData 事务（158-303）→ releaseCleaningLocks（301-352）→ markBatchParsed（1277-1300） | ✅ 与代码完全匹配 |
| 持久化 8 张表 | `otel_log_events` / `sdd_interactions` / `sdd_interaction_texts` / `sdd_interaction_tool_calls` / `sdd_skill_usages` / `sdd_errors` / `sdd_work_items` / `sdd_work_item_artifacts` | ✅ 精确 8 张 |
| 27 个查询端点 | 实测 **25 个 `@Get`** + **3 个 `@Post`**（sdd 12 + 3 post / events 4 / ingest 4 / ops 5） | ⚠️ 数字差 ±1-2，应以 controller 装饰器实测为准 |
| 「释放锁」 | 实际是 **MySQL `GET_LOCK` / `RELEASE_LOCK` 命名锁**，锁名 `sdd-clean:{sha256(key).slice(0,48)}` | ⚠️ 公司电脑未指明锁类型；这是 FaaS 适配的硬卡点 |
| 动态 WHERE | 由 `server/src/modules/query-utils.ts:40-59` 的 `whereSql()` / `addTimeRangeWhere()` 集中处理，全部参数化，无 SQL 注入风险 | ✅ 现状比预期更好 |

### Chair 迁移已有铺垫

`docs/implementation-plan.md` 第 11 节已定义当前实现 → Chair 映射表，并明确约束：
- Service 不直接调用 ORM
- Controller 不写业务逻辑
- 调度入口不直接写业务 SQL，统一调用清洗 Service
- 不让 MySQL client 到处透传

公司电脑的 4 项任务是在为这套映射"补代码侧源端清单"，**方向与已冻结的迁移策略一致**。

## 方案选项

### 选项 A：原样执行 4 项任务

- 优点：任务定义最清晰，工期可控
- 缺点：MySQL 锁机制 / FaaS 事务模型 / 调度替换的**关键未知**没有源端输出，迁移阶段会被迫返工
- 适用场景：迁移工期极紧、可以接受迁移阶段做 ad-hoc 调研

### 选项 B：调整顺序、扩栏、合并任务 3

| 调整 | 内容 |
| --- | --- |
| 任务 1 扩栏 | 在原 6 栏基础上加「是否事务参与」+「返回值 schema / Zod contract 关联」 |
| 任务 1 顺序 | 改为 sdd（30 条复杂度最高） → ingest → cleaning → events → ops，先暴露格式不足 |
| 任务 2 补充 | 显式标注锁机制类型为 MySQL `GET_LOCK`；纯/IO 边界用"模块图 + 函数签名分类"，不只是"注释" |
| 任务 3 合并入任务 1 | 「动态参数」栏扩展为「参数组合矩阵 + 每种组合展开后的最终 SQL 形态」 |
| 任务 4 收紧 | 每端点 ≥3 scenarios（空集 / 单用户 / 多用户跨时间段），用 `packages/api` 的 Zod contract 驱动生成，加 db 状态指纹 |

- 优点：相比 A 工作量增量 ~10-15%，但消除冗余、提升清单可用性
- 缺点：仍未覆盖 FaaS 适配盲点

### 选项 C（推荐）：B + 新增任务 5、6 覆盖盲点

在 B 的基础上追加：

- **任务 5：事务边界清单**
  - 枚举所有 `beginTransaction` / `commit` / `manager.transaction()` 出现位置
  - 标注事务跨表范围、是否嵌套、是否依赖隔离级别假设
  - 产出物：`transaction-registry.md`
  - 价值：直接喂给 dal v2 transaction adapter 设计

- **任务 6：OTel ingest + outbox dispatch 的 FaaS 适配预研**
  - 列出从 `POST /api/ingest/otlp-logs` 到 outbox dispatcher 的全链路上下文依赖
  - 标注哪些是 MidwayJS 特有 API、哪些可直接复用
  - 评估 MySQL `GET_LOCK` 在 FaaS 实例间不可持有的影响，输出锁的替代方案候选（分布式锁服务 / 数据库行锁 / 业务键去重 upsert）
  - 评估 BullMQ 替换为「Chair 定时任务扫描 ingest_outbox」的扫描频率、并发、错误处理具体参数
  - 产出物：`faas-adaptation-notes.md`
  - 价值：在迁移启动前消除最大不确定性

- 优点：覆盖完整、迁移阶段极少返工
- 缺点：工作量比 A 大约多 30%

## 推荐方案

**采纳选项 C**。

理由：
1. 任务 5、6 的产出物在物理上可以并入任务 1、2 的同一份文档不增加显著工作量（事务边界本来就要在 SQL 清单里标注；FaaS 适配本来就要在清洗步骤拆分时讨论锁）
2. MySQL `GET_LOCK` 在 FaaS 下不可持有几乎是确定的——晚发现不如早发现
3. `implementation-plan.md` 已经说"P0 公司环境降级为 Chair 定时任务扫描 ingest_outbox"，但具体参数缺失，任务 6 正好补齐这个空白
4. 4 项任务的**优先级**建议为：**4 > 1 > 2 > 5 > 6**。Baseline（任务 4）决定迁完能不能验回归，没它一切都白搭

## 影响范围

- **代码**：零改动
- **文档输出**：在公司电脑或当前电脑产出 5-6 份源端清单（sql-registry.md / cleaning-steps.md / endpoint-baseline.json / transaction-registry.md / faas-adaptation-notes.md）
- **下游影响**：bkfesddcore 实际迁移阶段将基于此批清单分阶段执行，迁移完成后可用 baseline 跑回归
- **跨电脑依赖**：评审完成后，本 review.md 已收拢到当前 `sdd-telemetry` 仓库的 `docs/bkfesddcore-migration-prep/`，交接给公司电脑时不再依赖外部需求文档仓库

## 风险和应对

| 风险 | 影响 | 应对 |
| --- | --- | --- |
| FaaS 下 MySQL `GET_LOCK` 不可持有 | 清洗 worker 直接迁过去会丢失互斥语义，可能导致同一 batch 重复清洗 | 任务 6 输出锁替代方案候选；优先验证基于业务键的 upsert + 状态机是否已足够幂等（cleaning-worker.ts 已有 stable key + upsert 设计） |
| seed 数据覆盖度不足 | endpoint-baseline 退化为"happy path only"，迁移回归时无法发现边界 bug | 任务 4 先做 seed 覆盖率审计，缺哪个端点的数据就补哪个 |
| 清单标准过严工期翻倍 | 4-6 项任务全做完会拖延迁移启动 | 分阶段交付：先 sdd 模块试点任务 1，2-3 天验证清单粒度，再扩展到全模块 |
| 任务 3 合并后被忽略 | 若合并入任务 1 但未明确"参数组合矩阵"栏，会丢失公司电脑原本的关注点 | 在调整后的任务 1 模板里加红字提示"对每条含动态 WHERE 的 SQL 必须列举所有组合" |
| 端点数差异（25+3 vs 27） | 公司电脑视角的端点清单与实测不一致，可能漏迁 | 任务 4 以 `controller.ts` 装饰器扫描结果为准，不以公司电脑的数字为准 |
| 锁名 sha256 截断 48 字符的约束在迁移后失效 | 当前 `sdd-clean:` 10 字符 + sha256 hex 48 字符 = 58 字符，是适配 MySQL `GET_LOCK` 64 字符上限的有意设计（不是历史包袱）。迁移后若改用其他锁机制，64 字符约束不再适用，可重新设计但需明确文档化原约束的由来 | 任务 6 输出新锁名规则建议时，明确标注"原 64 字符约束已不适用"，避免后人误以为是任意截断 |

## 验收标准

可证伪的产出物清单：

1. `sql-registry.md`
   - 包含 ≥66 条记录（68 处中扣除少量内部工具调用，覆盖率 ≥97%）
   - 每条含 8 列：模块 / 函数 / 命名 / SQL 摘要 / 动态参数 / 涉及表 / **是否事务** / **返回值 schema**
   - 对每条含动态 WHERE 的 SQL，必须附「参数组合矩阵」+ 每种组合展开后的最终 SQL
   - 按 sdd → ingest → cleaning → events → ops 排序

2. `cleaning-steps.md`
   - 5 步流程边界清晰，每步标注输入/输出/涉及表
   - 显式标注锁机制为 MySQL `GET_LOCK`，并指出 FaaS 适配风险
   - 纯函数模块清单（payload 解析、字段提取）与 IO 模块清单（8 表 upsert、状态机翻转、锁）分离表达

3. `endpoint-baseline.json`
   - 覆盖 25 @Get + 3 @Post 全部端点
   - 每端点 ≥3 scenarios（空集 / 单用户 / 多用户跨时间段）
   - 格式：`{ endpoint, method, scenarios: [{ request, response, db_state_hash }] }`
   - 用 `packages/api` 的 Zod contract 校验过响应结构

4. `transaction-registry.md`（新增）
   - 覆盖 `cleaning-worker.ts` 主清洗事务、`ingest-write.repository.ts` raw + outbox 事务
   - 标注事务跨表范围、是否嵌套、隔离级别假设

5. `faas-adaptation-notes.md`（新增）
   - 输出从 ingest 入口到 outbox dispatch 的上下文依赖清单
   - 至少给出 2 种锁替代方案候选并标注优缺点
   - 给出 Chair 定时任务扫描 outbox 的扫描频率、并发数、退避策略建议值

## 待确认问题

> 评审追加记录见末尾附录 A。以下问题中部分已由公司电脑回答但需进一步查证，详见附录 B。

1. **Chair dal v2 是否支持嵌套事务？** 这决定 cleaning-worker 内部 sub-step 是否需要拆事务（公司电脑回答：dal v2 用 `beginTransactionScope` 单层 scope 模式，"大概率不支持"，但底层依赖 `@eggjs/rds`，未找到禁止嵌套的明确文档——**仍需查证 rds 实现**）
2. **FaaS 定时任务最小触发间隔是多少？** 直接影响 outbox 扫描频率上限（公司电脑曾断言"最小 1 分钟"已自证错误；Chair `@ScheduleMethod` 支持 Quartz 6 位 cron 秒级精度，**实际下限取决于雨燕 FaaS 平台调度能力，需查雨燕文档或实测**）
3. **bkfesddcore 是否已有 OneAPI 接入决策？** 影响 `packages/api` Zod contract 是否保留（公司电脑：`module.yml` 已配 OneAPI 数据源，`tnpm run oneapi` 自动生成。**还需确认 OneAPI 类型描述格式（YAML / TS / proto），决定 Zod → OneAPI 是否能自动转换**）
4. **公司电脑环境下是否可用 Redis？** 若可用，分布式锁优先于 MySQL `GET_LOCK` 替代方案（公司电脑：不确定，建议先按"无 Redis"方案准备）
5. **是否要把前端（web）一并迁移？** 当前 review 不覆盖（公司电脑：不一并迁移，前端 React 19 + Vite 独立仓库，后续再议）
6. ~~MySQL 锁名 sha256 截断 48 字符是否是历史包袱？~~ **已查证**：是有意为 MySQL `GET_LOCK` 64 字符上限留余量的显式设计（`sdd-clean:` 10 + sha256 hex 48 = 58 字符）
7. **`implementation-plan.md` Section 8.5 定的 `cron: '*/30 * * * * ?'` + `SCHEDULE_CLEANING_BUDGET_MS = 45000` 是否可行？** 30 秒间隔 + 45 秒单次预算本身已经紧（超时一次即堆积），加上 #2 雨燕调度能力未确认，整个清洗调度方案在迁移前必须先做可行性验证

---

## 附录 A：评审第二、三轮事实链清单

本评审经历三轮交互：当前电脑出初稿 → 公司电脑回答 6 个待确认问题 → 当前电脑核对 6 条回答并发现 5 个 gap → 公司电脑自查并修正 3 条无事实依据的断言 → 当前电脑自查并发现自己也有 2 处描述错误。本节固化双方共同验证的事实，避免后续讨论重复验证。

### A.1 已验证事实（来自当前代码或公开文档，均可复现）

| 事实 | 验证路径 | 来源 |
| --- | --- | --- |
| 68 处 `.query()`，分布在 server/modules（sdd 30 / ingest 11 / events 7 / ops 7 = 55）+ worker（13） | `rg "\.query\(" server/src worker/src` | 当前电脑实测 |
| cleaning-worker 5 步流程：标记 processing（208-252）→ parsePayload + extractOtelLogEvents（150-156）→ persistCleanedData 事务（158-303）→ releaseCleaningLocks（301-352）→ markBatchParsed（1277-1300） | `worker/src/jobs/cleaning-worker.ts:117 cleanBatch()` | 当前电脑实测 |
| 8 张表持久化全部使用 `INSERT ... ON DUPLICATE KEY UPDATE`（幂等） | cleaning-worker.ts INSERT 行 366/518/610/676/756/835/934/967 与 ON DUPLICATE KEY UPDATE 行 373/526/614/681/763/840/938/972 一一对应 | 当前电脑实测 |
| 6 处事务边界（无显式嵌套） | worker/src/infrastructure/mysql/client.ts:28、worker/src/jobs/cleaning-worker.ts:276、server/src/common/transaction/unit-of-work.ts:24、server/src/modules/sdd/sdd-query.service.ts:259/313/352 | 当前电脑实测 |
| 25 @Get + 3 @Post 端点（不是 27） | controller.ts 装饰器扫描 | 当前电脑实测 |
| 动态 WHERE 由 `query-utils.ts:40-59` `whereSql()` / `addTimeRangeWhere()` 集中处理，全部参数化 | 当前电脑实测 |
| 锁机制：MySQL `GET_LOCK / RELEASE_LOCK` 命名锁，锁名 `sdd-clean:${sha256(rawKey).slice(0, 48)}`（58 字符）；MySQL `GET_LOCK` 上限 64 字符 | cleaning-worker.ts:326/356 + MySQL 文档 | 当前电脑实测 + 公开文档 |
| `implementation-plan.md` 设计假设 30 秒 cron + 45 秒单次清洗预算 | `docs/implementation-plan.md:288 cron: '*/30 * * * * ?'`、行 310 `SCHEDULE_CLEANING_BUDGET_MS = 45000` | 当前电脑实测 |
| `implementation-plan.md` 自己已经把 "ScheduleMethod 是否支持秒级 cron" 列为待确认问题 | `docs/implementation-plan.md:331` | 当前电脑实测 |
| OneAPI 在 bkfesddcore 已配置 | `module.yml` + `tnpm run oneapi` | 公司电脑（基于 CLAUDE.md 自证） |
| Chair `@ScheduleMethod` 类型签名只有 `cron: string` + `disable?: boolean`，无最小间隔约束 | `@alipay/tegg-types/controller/decorator.d.ts:34-37` | 公司电脑（已自证） |

### A.2 待验证项（迁移前必须确认，逐项标注 owner）

| # | 待验证项 | 当前最强假设 | 验证方式 |
| --- | --- | --- | --- |
| 1 | dal v2 是否真不支持嵌套事务 | 大概率不支持（基于 `beginTransactionScope` 单层 scope 模式 + 未找到嵌套 API） | 查 `@eggjs/rds` 源码 或实测嵌套 scope 行为 |
| 2 | 雨燕 FaaS 平台支持的最小 cron 触发间隔 | 未知 | 查雨燕平台文档 或 SRE 同事 或部署一个 `*/30` cron 实测 |
| 3 | OneAPI 类型描述格式 | 未知（YAML / TS / proto？） | 查 bkfesddcore 现有 OneAPI 配置 |
| 4 | bkfesddcore 是否可用 Redis | 不可用（保守假设） | 查 module.yml 或问 SRE |
| 5 | `sdd-query.service.ts:259/313/352` 三处事务体内是否间接调用其他可能开事务的 service 方法 | 未知 | 静态分析事务体内的方法调用图 |
| 6 | 30 秒 cron + 45 秒单次清洗预算的组合可行性 | 紧张（已被 implementation-plan 自身列为风险） | #2 验证完后做一次端到端压力测试 |

### A.3 已确认错误（不要再传播）

| # | 原断言 | 修正 | 错误方 |
| --- | --- | --- | --- |
| 1 | "FaaS 定时任务最小 1 分钟" | 取决于雨燕平台，未确认 | 公司电脑（已自证） |
| 2 | "MySQL 锁名 sha256 截断 48 字符是历史包袱" | 是适配 MySQL `GET_LOCK` 64 字符上限的有意设计 | 公司电脑（已自证）+ 当前电脑原 review 风险表（已修正） |
| 3 | "dal v2 不支持嵌套事务"（无条件断言） | 大概率不支持但待验证，不能作为强约束 | 公司电脑（已自证） |
| 4 | "任务 5 输出后必须在迁移前拍平嵌套事务" | 拍平动作以 dal v2 验证结果为前提；任务 5 先输出调用图，再决定拍平与否 | 当前电脑（已修正，见下文方案选项部分） |
| 5 | "任务 6 范围收窄到锁替代方案即可" | 仍需保留 BullMQ 现有行为映射 + 扫描频率/批量/并发参数建议 | 公司电脑（已撤回） |

### A.4 双方确认的最终行动建议（基于 A.1 + A.2）

1. **迁移前置门禁**：先完成 A.2 第 2 项（雨燕调度能力）+ 第 6 项（30/45 秒组合可行性）。若雨燕不支持 30 秒级 cron 或组合不可行，`implementation-plan.md` Section 8.5 整段调度方案需要重新设计，后续任务的优先级和范围都会变
2. **任务执行顺序**：A.2 第 2、6 项门禁 → 任务 4（baseline，越早做越能赶上 seed 数据补完）→ 任务 5（事务边界，影响 SQL 清单映射）→ 任务 1（SQL 集中注册）→ 任务 2（清洗步骤拆分）→ 任务 6 剩余项（BullMQ 映射 + 锁方案）
3. **任务范围微调**（已在「方案选项 / 推荐方案」部分体现）：
   - 任务 5 新增「事务体内是否调用其他 service 方法（潜在嵌套）」列，发现隐性嵌套**视 dal v2 验证结果**决定是否拍平
   - 任务 6 优先评估「upsert 幂等下能否直接取消锁」（A.1 已验证 8 表全部 `ON DUPLICATE KEY UPDATE`），其次才考虑锁替代方案
   - 任务 4 baseline 不校验 `cleaning_at` / 批次状态等时效字段，理由：A.2 第 2 项延迟下限未知
   - 任务 1 的「返回值 schema」栏扩为「Zod schema + OneAPI 类型定义」两列，A.2 第 3 项确认后做 1-2 端点 Zod → OneAPI 转换 PoC

### A.5 流程教训（评审过程暴露的协作问题）

1. **凭印象答待确认问题是反模式**：公司电脑前两轮有 3 条断言无事实依据。当前电脑也有 1 处描述错误（sha256 与 dal v2 冲突）。今后双方对待确认问题的回答必须附上验证路径（文件:行 / 文档 URL / 实测命令），无法验证的应明确标注"未确认"
2. **优先级建议是主观判断**：本 review 的"4 > 5 > 1 > 2 > 6"等顺序均为主观推荐，没有数据支撑，最终顺序应基于 A.4 门禁结果决定
3. **review 不替代 design**：本 review 只对源端准备任务的范围和顺序达成共识；后续 dal v2 / FaaS 适配的具体实施方案应单独走 bk-fe-design 流程
