# bkfesddcore 迁移交接文档

> 交接日期：2026-05-19
> 交接目标：告知公司电脑，SDD Telemetry 迁移源端准备已完成，可以开始进入 bkfesddcore（Chair/tegg FaaS + dal v2）迁移执行阶段。

## 结论

当前电脑上的 SDD Telemetry 已完成迁移前置准备：SQL 面、事务边界、清洗链路、动态参数、端点基线和 repository 隔离层均已梳理或改造完成。

公司电脑可以开始迁移，但开始前必须同步到以下基线：

- 代码仓库：`/Users/loomisli/Desktop/lm/sdd-telemetry`
- 迁移基线 commit：`25e2d98 refactor(worker): 抽出 cleaning 与 outbox repository`
- 需求文档仓库：`/Users/loomisli/Desktop/lm/bk-fe-requirements-trade`
- 迁移准备文档 commit：`ae7016d feat: 新增需求文档`

注意：当前本地 `main` 已包含迁移准备代码；如果公司电脑通过远端仓库同步，需要先确保远端包含 `8e96a19` 到 `25e2d98` 这一组提交。

## 已完成的事情

### 1. 迁移事实清单已产出

产物目录：

```text
/Users/loomisli/Desktop/lm/bk-fe-requirements-trade/sdd-telemetry/2026-05-19-bkfesddcore-migration-prep/
```

关键产物：

| 文件 | 用途 |
| --- | --- |
| `review.md` | 对公司电脑原始 4 项任务做可行性评审，补出事务、FaaS、锁、调度等迁移盲点 |
| `sql-registry.md` | SQL 注册清单，覆盖业务 `.query()` 调用、建议命名、动态参数、涉及表、事务、Zod schema |
| `cleaning-steps.md` | cleaning-worker 清洗链路步骤拆分，标注输入/输出、涉及表、纯函数/IO 边界 |
| `transaction-registry.md` | 事务边界清单，给 dal v2 transaction adapter 使用 |
| `schedule-mapping.md` | 本地 worker/outbox 到 Chair Schedule/FaaS 的映射说明 |
| `endpoint-baseline.json` | 27 个 GET 查询端点、46 个 GET scenarios、4 个写端点的 request/response baseline |
| `generate-endpoint-baseline.py` | 端点 baseline 生成脚本 |
| `implementation-plan-pr5d-pr5e.md` | 后续 repository 改造执行计划 |

说明：`cleaning-steps.md` 是迁移准备早期产物，里面保留了当时对 MySQL `GET_LOCK` 的分析。当前代码已在 `f7ffb5c` 移除 GET_LOCK，迁移时以代码基线 `25e2d98` 为准。

### 2. 源端代码已完成迁移降风险改造

代码仓库：

```text
/Users/loomisli/Desktop/lm/sdd-telemetry
```

已完成提交：

| commit | 内容 | 迁移价值 |
| --- | --- | --- |
| `8e96a19` | 清理 BullMQ / outbox-dispatcher / Redis docker 死代码 | 降低 Chair FaaS 调度迁移噪声 |
| `ffece27` | 统一事务抽象，复用 `TypeOrmUnitOfWork` / `withTransaction` | 给 dal v2 transaction adapter 留替换点 |
| `f7ffb5c` | 取消 MySQL `GET_LOCK` 命名锁，依赖 upsert 幂等 | 去掉 FaaS 多实例下最硬的锁迁移风险 |
| `b32e7bb` | events-query 抽出 repository | 试点查询 SQL 隔离 |
| `690cbbd` | ops-query 抽出 repository，保留动态表名白名单 | 隔离 ops raw SQL，明确 dal v2 特殊处理点 |
| `715ba1b` | ingest-health 抽出 repository | 隔离 ingest 查询 SQL |
| `88a2279` | semantics 事务写入抽出 `SddWriteRepository` | service 保留事务边界，写 SQL 集中到 repository |
| `f28cd87` | sdd 只读查询抽出 `SddQueryRepository` | 最大 SQL 面完成隔离，controller/service 返回结构不变 |
| `25e2d98` | worker cleaning + outbox 抽出 repository | worker 无 DI 场景下 SQL 集中到普通 class，事务仍由调用方控制 |

当前状态：后续迁移 dal v2 时，主要替换 repository 实现和事务 adapter；controller、Zod contract、service 的业务转换逻辑不需要大改。

### 3. 验证已完成

最近一轮验证结果：

| 验证项 | 结果 |
| --- | --- |
| `rg --hidden "apps/(web|server|worker)|\\.\\/apps/(web|server|worker)|apps/" ...` | 无命中 |
| `pnpm typecheck` | 通过 |
| `pnpm build` | 通过 |
| PR5d1 semantics `POST / PUT / DELETE` | 全 200 |
| PR5d2 `/api/sdd/*` smoke | 19 个调用全 200 |
| `pnpm --filter @sdd-telemetry/worker build` | 通过 |
| `pnpm --filter @sdd-telemetry/worker once` | `claimed=54, succeeded=54, failed=0` |
| 派生表唯一键校验 | `sdd_interactions` / `sdd_skill_usages` / `sdd_errors` / `sdd_work_items` / `sdd_work_item_artifacts` duplicates 全 0 |

## 公司电脑迁移入口建议

### 迁移起点

以 `25e2d98` 作为源端迁移起点，不要从 `origin/main` 的旧状态直接迁。

迁移方需要先拿到：

```text
sdd-telemetry@25e2d98
bk-fe-requirements-trade@ae7016d
```

### 建议迁移顺序

1. 先迁 `packages/api` contract 或映射到 OneAPI 类型体系，保持现有 API 返回结构可回归。
2. 迁 server controller/service 框架层：MidwayJS Controller/Provide/Inject → Chair/tegg 对应装饰器。
3. 迁事务 adapter：`TypeOrmUnitOfWork` → dal v2 transaction scope。
4. 迁 repository 实现：逐个替换 `events`、`ingest-health`、`ops`、`sdd` repository 的 SQL 执行方式。
5. 迁 worker：`CleaningRepository` / `OutboxRepository` 映射为 Chair service 或 dal DAO，调度入口映射到 Chair Schedule/FaaS。
6. 用 `endpoint-baseline.json` 和 worker once 结果做回归。

### 重点关注点

| 关注点 | 当前状态 | 迁移建议 |
| --- | --- | --- |
| MySQL `GET_LOCK` | 已移除 | 不要在目标态恢复命名锁；依赖状态机 + upsert 幂等 |
| BullMQ / Redis | 已清理为非当前路径 | P0 按 Chair Schedule 扫描 outbox，不需要 Redis |
| 动态 WHERE | 仍在 service 组装 | dal v2 迁移时优先保留业务判断，repository/DAO 只承接执行 |
| ops 动态表名 | 保留白名单 raw SQL 模式 | dal v2 若不支持动态表名，ops 可继续作为 raw SQL 特例 |
| worker 无 DI | 已用普通 class repository | 迁移到 tegg 时再决定是否改为可注入 service |
| endpoint baseline | 已生成 | 迁移后必须按 baseline 做结构和关键字段回归 |

## 不在本次交接范围

- 不迁移前端 `web/`。
- 不改数据库表结构。
- 不重新设计 API contract。
- 不引入 Redis / BullMQ。
- 不把 ops 动态表名强行塞进 dal v2 DAO。

## 当前本地遗留状态

代码仓库当前只有一个未跟踪 pnpm 临时目录：

```text
.pnpm-store/v11/.tmp/pnpm-9.12.1-1779200759896/
```

它是本地命令运行产生的缓存临时目录，不属于迁移交付内容，不需要同步给公司电脑。

## 交接判断

迁移准备完成，可以开始迁移。

判断依据：

- SQL 已注册，迁移对象明确。
- 事务边界已标注，adapter 替换点明确。
- 清洗链路已拆分，FaaS 调度风险已收敛。
- GET_LOCK 和 BullMQ 两个高风险依赖已从当前代码路径移除。
- server 与 worker 的 SQL 已集中到 repository 层。
- baseline 与 smoke 验证已可用于迁移后回归。
