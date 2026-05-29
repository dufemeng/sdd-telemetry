# 需求链路下钻设计（产出分析 → 文档 → 生成时间线 → prompt 全文）

更新时间：2026-05-29

## 1. 背景与目标

当前左侧各看板（总览 / 用户分析 / 技能分析 / 产出分析 / 知识库分析 / 交互明细）各自做聚合，互相不联动，是一组「孤儿 tab」。用户的核心诉求是看清一条完整的用户链路：

```
用户输入(prompt) → skill 调用 → 知识库(wiki)读取 → 需求文档生成
```

数据层面这条链已经完全打通（join key：`session_id` / `prompt_id` / `interaction_id` / `skill_usage_id` / `work_item_id`），缺的只是 UI 没把它串起来。

本设计是这条链可下钻的**第一版**，选定「**需求为中心**」的入口，合流实现两个诉求：

- 诉求 1：一个需求下面有哪些文档。
- 诉求 2：每篇文档是怎么被一步步生成 / 修改出来的，每一步能回溯到那次 prompt 的全文。

## 2. 范围

**做：** 从产出分析进入需求详情，查看文档列表，查看单篇文档的「生成时间线」，时间线节点回溯到交互全文（复用交互明细详情）。

**不做（YAGNI）：**

- 其它入口下钻（用户 / skill / wiki 切进同一条链）——后续子项目，本版只为其搭骨架（写入表）。
- orphan tab 全局联动。
- 文档正文入库 / 改采集——正文随时会改，去本地 requirements 仓库看，与本平台解耦。
- 跨需求对比。

**正文解耦说明：** 本平台的独特价值是展示「生成过程」，不是复显一份用户本地已有的文件。因此文档层展示的是写入时间线 + 每次写入的预览，不追求还原磁盘最终正文。

## 3. 信息架构与导航

新增独立路由 `/sdd/work-items/:id`（懒加载）。产出分析列表（`/sdd/work-items`）的行变为可点击，跳入需求详情。

```
/sdd/work-items/:id   需求详情
┌───────────────────────────────────────────────────────────────┐
│ ← 产出分析   cashier / 2026-04-10-unfreeze-component            │
│ 文档 4 · 参与 3 人 · 12 turns · 跨 5 session · wiki 读取 23 次    │
│ 阶段覆盖: proposal ✓  design ✓  tasks ✓  codereview —           │
├──────────────┬────────────────────────────────────────────────┤
│ 文档列表       │  design.md 的「生成时间线」                       │
│ ▸ proposal.md │  ● 05-10 14:22  Write  bk-fe:design   wiki×3     │
│ ▸ design.md ◄ │     "帮我设计冻结组件的…"  [展开全文]            │
│ ▸ tasks.md    │  ● 05-10 15:01  Edit   bk-fe:design   wiki×0     │
│ ▸ design-2.md │     "把错误处理那段补上"  [展开全文]            │
│              │  ● 05-11 09:30  Edit   (无 skill)    wiki×1      │
└──────────────┴────────────────────────────────────────────────┘
```

- **左栏**：文档列表（artifact），按阶段 / 时间排。选中态高亮。
- **右栏**：选中文档的生成时间线，每节点 = 一次写入，显示：时间、write 类型、归因 skill 语义、该 turn 的 wiki 读取数、prompt 预览。
- **节点展开全文** → 右侧抽屉，复用交互明细的详情组件渲染全文 prompt + response + 工具时间线。不重写。

## 4. 数据模型（新增派生表）

worker 现在派生 artifact 时按 `artifact_key` 去重 upsert，只保留 `first_seen` / `last_seen`，每一次写入的明细被丢弃。新增一张派生表保留每次写入，作为「文档生成时间线」与整条链下钻的关节。

```sql
CREATE TABLE sdd_work_item_artifact_writes (
  id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  write_key       CHAR(64)        NOT NULL,        -- sha256(event_id + ':' + artifact_key) 幂等
  artifact_id     BIGINT UNSIGNED NOT NULL,
  work_item_id    BIGINT UNSIGNED NOT NULL,
  interaction_id  BIGINT UNSIGNED NULL,            -- 能解析就填，查询兜底用 prompt_id join
  skill_usage_id  BIGINT UNSIGNED NULL,
  user_id         BIGINT UNSIGNED NULL,
  session_id      VARCHAR(191)    NULL,
  prompt_id       VARCHAR(191)    NULL,
  event_id        CHAR(64)        NULL,
  write_kind      VARCHAR(32)     NOT NULL,        -- Write / Edit / MultiEdit / other
  content_preview TEXT            NULL,            -- ≤4KB，best-effort，可截断
  event_sequence  INT UNSIGNED    NULL,
  event_time      DATETIME(3)     NULL,
  rule_version    VARCHAR(32)     NOT NULL,
  gmt_create      DATETIME(3)     NOT NULL,
  gmt_modified    DATETIME(3)     NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uk_write_key (write_key),
  KEY idx_artifact_event_time (artifact_id, event_time),
  KEY idx_work_item_id (work_item_id),
  KEY idx_interaction_id (interaction_id),
  KEY idx_skill_usage_id (skill_usage_id),
  KEY idx_event_time (event_time)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
```

保留周期对齐 `sdd_skill_usages`（至少 6 个月，P0 可不清理）。

`write_key` 生成：`sha256(event_id + ':' + artifact_key)`——一个写入事件对一篇文档至多一行，reclean / 重处理可重复跑不产生重复。

## 5. worker 派生改动

在 `worker/src/jobs/cleaning-worker.ts` 的 `upsertWorkItems` 内、`upsertWorkItemArtifact` 调用之后（约 944 行）顺手 insert 一条写入记录。此刻 `event`、`artifact`、`workItemId`、归因到的 `skillCandidate` 都已在手，几乎零额外计算（现状是白白丢弃）。

- `skill_usage_id`：沿用现有 `linkSkillUsageToWorkItem` 的 session + skill 解析口径。
- `interaction_id`：能由 `prompt_id` / `session_id` 解析到就填，解析不到留空，查询侧用 `prompt_id` join `sdd_interactions` 兜底。
- `write_kind`：从写入事件的工具名 / artifact 信号推断。
- `content_preview`：取写入工具入参中的 `content` / `new_string` 预览，≤4KB。
- 幂等：按 `write_key` upsert（存在即跳过 / 更新）。

新增 `cleaningRepository.upsertArtifactWrite(...)`，与既有 upsert 风格一致。

## 6. 后端 API（contract 新增）

- 复用 `GET /api/sdd/work-items/:id`（`SddWorkItemDetail` 已返回 artifacts），扩展需求级 summary 字段：`turnCount` / `sessionCount` / `contributorCount` / `wikiRecallCount`。
- 新增 `GET /api/sdd/work-items/:workItemId/artifacts/:artifactId/writes` → 生成时间线。每节点字段：

  ```
  id, writeKind, eventTime, eventSequence,
  interactionId, skillSemanticCode, skillDisplayName,
  wikiRecallCount, promptPreview, contentPreview
  ```

- 全文复用现成 `GET /api/sdd/interactions/:interactionId`（已返回 `promptText` / `responseText` / `responseJson` + tool-calls 端点），不新增全文接口。

所有 schema 写进 `packages/api/src/contracts/sdd.contract.ts`，前端类型从 contract 推导。

## 7. 前端结构

```
web/src/pages/sdd/work-items/
  WorkItemsPage.tsx                 (列表，行加跳转)
  WorkItemDetailPage.tsx            (新：两栏布局 + 需求 header)
  components/ArtifactList.tsx        (左栏文档列表)
  components/ArtifactWriteTimeline.tsx (右栏生成时间线)
  components/TurnDetailDrawer.tsx    (薄壳，复用交互明细详情组件渲染全文)
  useWorkItemDetail.ts               (需求详情 + summary)
  useArtifactWrites.ts               (单篇文档生成时间线)
```

- 路由 `web/src/router.tsx` 新增 `sdd/work-items/:id`，懒加载。
- 交互明细详情组件需可被复用：若当前耦合在 `InteractionsPage` 内，抽出一个可独立渲染的 `InteractionDetail` 展示组件（数据靠 `interactionId` 拉取），交互明细页与本抽屉共用。

## 8. 数据流（端到端）

```
客户端写文件
  → otel_log_events 写入事件 (sdd.artifact_path / is_write, prompt_id, session_id)
  → worker cleaning: inferArtifact → upsertWorkItem / upsertWorkItemArtifact
                    → upsertArtifactWrite (新, 一次写入一行)
  → sdd_work_item_artifact_writes

读侧:
  需求详情页
    GET /work-items/:id              → header + 文档列表
    选中文档
    GET /work-items/:id/artifacts/:aid/writes → 生成时间线
    点节点展开
    GET /interactions/:interactionId → 抽屉全文
```

## 9. 回填与保鲜

- **历史回填**：写一次性脚本从 event 层（`otel_log_events`，≈30 天）扫写入事件灌入新表，比 `db:reclean` 走 raw 的约 7 天窗口覆盖更长；之后 worker 前向补全。
- **基础验证**：`pnpm typecheck` + `pnpm build`。
- **链路验证**（动了 worker / 迁移）：`docker compose up -d mysql` → `pnpm db:migrate` → `pnpm --filter @sdd-telemetry/worker once`（循环到 outbox 清空）→ 至少一个 HTTP 查询验证时间线非空。构造可证伪查询，区分「修好 + 无数据」与「未修好 + 错配」。
- **文档保鲜**：同步更新 `docs/database-model.md`（新表）与 `docs/api-contract.md`（新端点 + summary 字段）。

## 10. 已知局限

- 老需求（event 层已过期、回填前）的时间线会偏空，只剩文档列表 + 需求级汇总；新表上线后新增数据完整。
- `content_preview` 是截断预览，Edit 只携带 diff / `new_string`；完整正文去本地 requirements 仓库看。
- `interaction_id` 在派生顺序下可能暂缺，靠 `prompt_id` join 兜底；少数无可信 anchor 的写入回溯不到交互全文。

## 11. 变更前风险自检

- **复用**：全文展示复用 `/interactions/:interactionId` 与交互明细详情组件，不新建全文接口 / 组件；artifact 派生复用现有 `inferArtifact` / `attributeSkillForArtifact` / `linkSkillUsageToWorkItem`。
- **抽象**：新增写入表是「现在被丢弃、且后续多入口都要用」的关节，不是为单次使用预留；交互明细详情组件抽出供两处共用，是第 2 次出现才抽。
- **破坏性**：迁移为新增表，不改既有表结构；worker 仅在 upsert 点追加一条 insert，不改既有派生语义；`/work-items/:id` 为扩展返回字段（增量、可选），前后端同步升级。
- **影响**：影响产出分析列表（行变可点）、新增需求详情路由；交互明细页若抽组件需回归其详情展示。API 新增端点无既有消费方破坏。

## 12. 验证清单（目标驱动）

1. 迁移建表 → 验证：`pnpm db:migrate` 后 `verify-schema` 通过，新表存在。
2. worker 写入 → 验证：跑 worker `once` 后，对一个有多次写入的文档，`sdd_work_item_artifact_writes` 行数 = 写入次数，`write_key` 无重复。
3. 时间线接口 → 验证：`GET …/artifacts/:aid/writes` 返回按 `event_time` 升序的节点，含 skill 语义与 wiki 计数。
4. 前端下钻 → 验证：列表点需求 → 详情两栏 → 选文档出时间线 → 点节点抽屉出全文，链路无断点。
5. 回填脚本 → 验证：对 30 天内的历史需求，回填后时间线非空。
