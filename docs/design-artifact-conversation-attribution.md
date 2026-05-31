# 文档生成对话归因设计（把产出一篇文档的多轮对话接进生成时间线）

更新时间：2026-05-31

## 1. 背景与目标

需求详情页 `/sdd/work-items/:id` 的「生成时间线」目前**只有写入节点**：一篇文档的时间线 = 它被 Write/Edit 的若干次。但一篇过程文档（proposal / design / tasks）是**多轮对话磨出来的**，往往只有最后一两条是 Write/Edit，前面真正在讨论这篇文档的 prompt/response 在页面上没有任何归宿。

代码层面已证实**当前没有「对话 turn 级」归因**，只有「skill 级 + 写入 turn 级」：

| 现有归因 | 位置 | 归因的是 |
| --- | --- | --- |
| `inferArtifact` | `worker/src/jobs/cleaning-worker.ts:2093` | 路径 → 哪篇文档 / 哪个需求 |
| `attributeSkillForArtifact` | `cleaning-worker.ts:1155` | 写入前最近的 `skill_activated` → 哪个 skill |
| `linkSkillUsageToWorkItem` | `cleaning-worker.ts:995` | skill_usage → work item |

`upsertWorkItems`（`cleaning-worker.ts:875`）只遍历**写入事件**，每个写入 → 一行 `sdd_work_item_artifact_writes`，节点的 `interaction_id` 就是写入 turn 自己的交互（`:971`）。读侧 `listArtifactWrites`（`server/src/modules/sdd/sdd-query.repository.ts:724`）只 `SELECT FROM sdd_work_item_artifact_writes`。

**目标**：把「产出一篇文档的那段对话」接进它的生成时间线。展开任意节点（讨论 turn 或写入 turn）都能看到完整 prompt + response（复用交互明细详情）。

**已具备的数据**：`sdd_interactions` + `sdd_interaction_texts` 已存了每一轮（含 0 工具调用的纯问答 turn）的完整 prompt/response。所缺的只是「哪些 turn 属于哪篇文档」这层归因关系。

## 2. 范围

**做：** 为每篇文档计算一个「归因窗口」，把窗口内的同 session 讨论 turn 物化成派生数据，读侧把讨论 turn 与既有写入节点合并成一条按时间排序的时间线，节点可展开全文。

**不做（YAGNI）：**

- **turn 的语义打分 / 相关性排序**——窗口内全收，不判断「这句是不是真的在聊这篇文档」。
- **跨 session 的对话缝合**（除按时间并集外的智能拼接）。
- **激活前的预备讨论**——窗口下界锚定 `skill_activated`，激活前的铺垫不计入（见 §10）。
- **修 Part 1 的「从不写 requirements 的独立 skill」孤儿问题**——那种没有 work item，需要 skill-usage 中心视图，是另一个子项目。
- 改 `sdd_work_item_artifact_writes` 的写入语义 / 结构（load-bearing，只读不动）。

## 3. 核心概念：归因窗口

> **一篇文档的「生成对话」= 同 `session_id`，从「控制它的 skill 运行的激活 turn」（含）到「该文档写入」（不含）之间、且本身不是写入节点的 interactions。**

- **下界（含）**：`attributeSkillForArtifact` 已为每次写入找出「控制它的 skill 候选」。下界取**该候选所在 interaction 的 `started_at`**（而非裸 `event_time`）——这样会**包含激活 turn 本身**，即用户敲 `/skill` 时的初始请求（往往是最关键的一条 prompt）。若激活 turn 恰好就是写入 turn（激活即写，如单交互产出），它已是写入节点，被排除集兜掉。
- **上界（不含）**：写入事件自身的 `event_time`。窗口纯向后看，处理写入时所有所需 turn 都已落库（`persistCleanedData` 内 interactions 先于 work items 持久化，跨 batch 的更早 turn 也已在前批入库）。
- **多文档切分**：多文档 session 里 skill 基本时间分段（数据已证实：proposal→task→code 等顺序激活）。每篇用各自的 `(激活, 写入]` 窗口，自然不重叠。窗口外、两篇之间的游离 turn v1 不归任何文档（保守）。
- **无锚点写入**（用户没敲 skill 直接让 Claude 写）：`attributeSkillForArtifact` 无候选 → 不产生讨论 turn，退回只显示写入节点（= 现状），不瞎归因。
- **排除写入 turn**：窗口内若包含该文档（或其他文档）的写入 turn，这些 interaction 不重复进讨论集——它们已是写入节点。

### 为何不用「整段 session 全挂这篇文档」

实测客观评估（23 个有 skill 的 session）：

- **39%（9/23）的 session 激活了 ≥2 个产文档 skill**（一个 session 产多篇）。整段挂会让 proposal 错误吞掉 design/tasks/code 的讨论。
- 存在**跨天、超长 session**：`698cf603` 单 session_id、31 turns、跨 3 天，brainstorming→writing-plans→实现全程。整段挂等于让设计文档吞掉整个计划 + 编码对话——**串台级污染，非噪声级**。
- 另外 ~60% 单 skill session 没问题，但这恰是「窗口 ≈ 整段 session」的情形。选「整段」只在那 40% 上换来错误，不换来简单。
- 窗口方案几乎零额外成本：下界已由 `attributeSkillForArtifact` 算出，上界就是写入事件。

## 4. 数据模型（新增派生表）

新增一张派生表存「讨论 turn」，与 `sdd_work_item_artifact_writes` 平行、加法、不耦合其写入语义。

```sql
CREATE TABLE sdd_work_item_artifact_turns (
  id                BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  turn_key          CHAR(64)        NOT NULL,   -- sha256(artifact_id + ':' + interaction_id) 幂等
  artifact_id       BIGINT UNSIGNED NOT NULL,
  work_item_id      BIGINT UNSIGNED NOT NULL,
  interaction_id    BIGINT UNSIGNED NOT NULL,   -- 该讨论 turn 的交互
  skill_usage_id    BIGINT UNSIGNED NULL,       -- 控制这篇文档的 skill 运行（窗口下界来源）
  user_id           BIGINT UNSIGNED NULL,
  session_id        VARCHAR(191)    NULL,
  anchor_event_time DATETIME(3)     NULL,        -- 窗口下界：激活 turn 的 started_at
  write_event_time  DATETIME(3)     NULL,        -- 窗口上界：该文档写入时间
  event_time        DATETIME(3)     NULL,        -- 这个 turn 自己的 started_at（时间线排序用）
  rule_version      VARCHAR(32)     NOT NULL,
  gmt_create        DATETIME(3)     NOT NULL,
  gmt_modified      DATETIME(3)     NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uk_turn_key (turn_key),
  KEY idx_artifact_event_time (artifact_id, event_time),
  KEY idx_work_item_id (work_item_id),
  KEY idx_interaction_id (interaction_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
```

- `turn_key = sha256(artifact_id + ':' + interaction_id)`：一篇文档对一个讨论 turn 至多一行，reclean / 重处理可重复跑不产生重复。
- 保留周期对齐 `sdd_work_item_artifact_writes`。
- 不存正文：正文随时去 `sdd_interaction_texts` 取（与既有时间线一致），表只存归因关系。

## 5. worker 派生改动

在 `upsertWorkItems`（`cleaning-worker.ts:875`）内、`upsertArtifactWrite` 调用之后追加一步：

1. 若 `attribution.skillCandidate` 为空 → 跳过（无锚点，不产生讨论 turn）。
2. `anchorTime = 控制候选所在 interaction 的 started_at`（含激活 turn）；`writeTime = 写入事件 event_time`。
3. 查同 session、`anchorTime <= started_at < writeTime`、排除写入节点 interaction 的 interactions：
   - 新增 `cleaningRepository.listSessionInteractionsInWindow(connection, sessionId, anchorTime, writeTime)`——直接查 `sdd_interactions`（讨论 turn 可能来自更早 batch，不能只看内存里当前 batch 的 `interactions` map）。
   - 排除集：该 session 在 `sdd_work_item_artifact_writes` 中的 `interaction_id`。
4. 对每个讨论 turn `upsertArtifactTurn`（按 `turn_key` 幂等），填 `artifact_id / work_item_id / interaction_id / skill_usage_id / session_id / anchor_event_time / write_event_time / event_time`。

新增 `cleaningRepository.upsertArtifactTurn(...)` 与既有 `upsertArtifactWrite` 风格一致。`rule_version = 'doc-conversation-v1'`。

> 注：一篇文档多次写入时，每次写入各自算窗口、各自补讨论 turn，按 `turn_key` 去重并集，不重复。

## 6. 后端 API（contract 扩展）

复用现有端点 `GET /api/sdd/work-items/:workItemId/artifacts/:artifactId/writes`（保持路径，避免破坏前端），其返回从「写入节点列表」升级为「时间线节点列表」：

- 节点新增判别字段 `nodeKind: 'write' | 'discussion'`。
- `write` 节点：保持现有字段（`writeKind / skillSemanticCode / contentPreview / wikiRecallCount` …）。
- `discussion` 节点：`nodeKind='discussion'`，`writeKind=null`，复用 `interactionId / eventTime / promptPreview / wikiRecallCount`。

读侧查询 = 两表按时间合并：

```sql
SELECT ... , 'write' AS node_kind FROM sdd_work_item_artifact_writes WHERE work_item_id=? AND artifact_id=?
UNION ALL
SELECT ... , 'discussion' AS node_kind FROM sdd_work_item_artifact_turns WHERE work_item_id=? AND artifact_id=?
ORDER BY event_time, FIELD(node_kind,'discussion','write'), id
```

> 排序**以 `event_time` 为主**：两表的 `event_sequence` 不可跨类型比较（写入节点是事件级序号，讨论 turn 是交互级、无单一序号），必须按时间交错排列，不能用 `event_sequence` 先排——否则讨论 turn 会被整段甩到写入节点之后。同一时刻的并列让讨论 turn 排在写入前（同一 turn 内「先讨论后落盘」的直觉）。

`wikiRecallCount` 维持现有口径（按 `interaction_id` 子查 `sdd_wiki_recalls`），discussion 节点同样适用——这样「这一轮读了几次 wiki」也顺带显示。

全文仍复用 `GET /api/sdd/interactions/:interactionId`，不新增全文接口。所有 schema 写进 `packages/api/src/contracts/sdd.contract.ts`，前端类型从 contract 推导。

## 7. 前端结构

改动集中在右栏时间线，不动左栏文档列表：

- `web/src/pages/sdd/work-items/components/ArtifactWriteTimeline.tsx`：按 `nodeKind` 区分渲染——`write` 节点维持现状（write 类型标签 + 归因 skill），`discussion` 节点用更轻的样式（仅 prompt 预览 + wiki 数），让「写入」在视觉上仍是关键节点。
- `useArtifactWrites.ts`：类型从 contract 推导，自动带上 `nodeKind`，无需改 hook 逻辑。
- 节点展开仍走 `InteractionDetailDrawer`（`interactionId` 拉全文），两类节点共用，不重写。

## 8. 数据流（端到端）

```
worker cleaning（处理写入事件时）
  → inferArtifact / attributeSkillForArtifact（已有）
  → upsertWorkItem / upsertWorkItemArtifact / upsertArtifactWrite（已有）
  → 计算窗口 (skillCandidate.event_time, write.event_time]
  → listSessionInteractionsInWindow → upsertArtifactTurn(×N)（新）
  → sdd_work_item_artifact_turns

读侧 需求详情页（右栏时间线）
  GET /work-items/:id/artifacts/:aid/writes
    → writes ∪ turns 按时间合并，节点带 nodeKind
  点任意节点 → GET /interactions/:interactionId → 抽屉全文
```

## 9. 回填与保鲜

- **历史回填**：一次性脚本（仿 `server` 现有 artifact 回填脚本），遍历存量 `sdd_work_item_artifact_writes`（带 `skill_usage_id`），用 `skill_usage.event_time` 作下界、写入 `event_time` 作上界，枚举 `sdd_interactions` 灌入新表。无 `skill_usage_id` 的写入跳过（与前向口径一致）。
- **reclean**：新表必须进 `db:reset-derived` / reclean 的 `derivedTables` 列表（参考 `wiki_recalls` 回归 derivedTables 的处理），否则 reclean 会丢这张表的数据。
- **文档保鲜**：同步更新 `docs/database-model.md`（新表）、`docs/api-contract.md`（端点节点新增 `nodeKind` 与 discussion 字段）。
- **基础验证**：`pnpm typecheck` + `pnpm build`。
- **链路验证**：`docker compose up -d mysql` → `pnpm db:migrate` → `pnpm --filter @sdd-telemetry/worker once`（循环到 outbox 清空）→ HTTP 查一个多轮产出的文档，时间线含 discussion 节点。

## 10. 已知局限

- **下界 = skill_activated**：激活前的预备讨论不计入。对 `/bk-fe-*` 这类「先激活、后问答」的 skill 影响小；对「先聊很多、再激活写」的 ad-hoc 流会漏前段。
- **窗口内无关话题**会被收进来（少见，且无语义过滤是 v1 的明确取舍）。
- **无 skill 锚点的写入**：无讨论 turn，退回纯写入节点。
- **跨 session Edit**：各写入各自窗口按时间并入；纯讨论、从不写入的 session 仍无归宿。
- **不解决 Part 1**：从不写 requirements 的独立 skill 仍是孤儿，需另做 skill-usage 中心视图。

## 11. 变更前风险自检

- **复用**：窗口下界复用 `attributeSkillForArtifact`；turn 正文复用 `sdd_interactions`/`sdd_interaction_texts` + `InteractionDetailDrawer`；回填复用既有 artifact 回填脚本范式；读侧沿用 `listArtifactWrites` 模式。不新建全文接口 / 组件。
- **抽象**：归因窗口是新关系事实（对标 `artifact_writes`），值得一张派生表，非过早抽象；窗口计算抽成 worker 内 helper，单一消费方。
- **破坏性**：新增表 + worker 追加 insert + 读侧 UNION + API 增量字段 `nodeKind`，全加法；不改 `artifact_writes` 结构 / 写入语义，不破坏既有消费方；迁移为新建表。前后端同步升级。
- **影响**：worker cleaning（新 insert）、reclean（新表进 derivedTables）、需求详情时间线（多出 discussion 节点）、API 节点结构（增量字段）、需回填历史。`ArtifactWriteTimeline` 需回归两类节点渲染。

## 12. 验证清单（目标驱动）

1. 迁移建表 → 验证：`pnpm db:migrate` 后 `verify-schema` 通过，`sdd_work_item_artifact_turns` 存在。
2. worker 派生 → 验证：对一个「多轮问答 + 最后一次写入」的文档，跑 worker `once` 后 `sdd_work_item_artifact_turns` 行数 = 窗口内讨论 turn 数，`turn_key` 无重复；无锚点写入不产生行。
3. 多文档切分 → 验证：构造一个 session 内 proposal→design 两篇，验证两篇的讨论 turn 各归各窗口、无交叉（可证伪：故意查另一篇的 interaction 不应出现）。
4. 时间线接口 → 验证：`GET …/artifacts/:aid/writes` 返回按时间升序、`nodeKind` 含 `write` 与 `discussion` 的合并列表。
5. 前端下钻 → 验证：选文档 → 时间线出现讨论节点 + 写入节点 → 点讨论节点抽屉出该轮全文。
6. 回填脚本 → 验证：对存量带 skill_usage 的写入，回填后时间线 discussion 节点非空。
