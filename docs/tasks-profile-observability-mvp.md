# Profile 化研发观测 MVP-1 实施计划

更新时间：2026-06-04  
状态：待实施  
关联设计：`docs/design-profile-observability-architecture.md`

## 1. 目标

MVP-1 的目标是用当前站点已有数据跑通 `sdd-default` 的 profile projection 闭环：

```text
现有 raw/event/interaction/tool_call
  -> source_references
  -> profile_* projection
  -> sdd-default 新旧全量对账
  -> Profile Observability Contract
  -> 总览和四大看板具备 profile 读源
```

MVP-1 不直接接入老板 A / 老板 B。它先证明新模型可以无损承接当前 SDD 能力，再进入 A/B profile 配置和验证。

关键约束：MVP-1 不能把所有 projection 都做成旧 `sdd_*` 表复制，否则新旧对账会变成自证。第一期允许部分低风险域采用桥接 projection 打通链路，但 `knowledgeRecalls` 必须走：

```text
tool calls / event raw
  -> source_references
  -> profile_knowledge_recalls
  -> 对账 sdd_wiki_recalls
```

这样才能验证 source registry 的可用性，并提前消化老板 B 在线知识库依赖的最大风险。

## 2. 范围

### 2.1 做

- 定义 profile 配置 schema，并内置 `sdd-default`。
- 新增 `source_references`，从现有事件和 tool calls 抽取本地路径、URL、在线文档 locator。
- 新增第一期 `profile_*` projection 表。
- 实现 `sdd-default` full rebuild projection runner，采用 current-pointer 避免半截数据被看板读取。
- `knowledgeRecalls` 从 `source_references` 投影，其它域第一期可桥接旧 `sdd_*` 表。
- 实现新旧全量对账工具。
- 定义 Profile Observability Contract 的 MVP schema。
- 让总览和四大看板具备通过 profile contract 读取 `sdd-default` 的路径。
- 增加全站 Profile Switcher 的最小能力，默认只有 `sdd-default`。
- 保留旧 `sdd_*` 读源回退。

### 2.2 不做

- 不接入 `boss-a-monorepo`。
- 不接入 `boss-b-online-docs`。
- 不做配置 UI。
- 不做多版本 profile 管理。
- 不实现 incremental / backfill projection。
- 不做 all-profile 汇总。
- 不做跨 profile 冲突判定。
- 不做告警、评测业务表。
- 不做需求级代码改动强归因、PR/commit 闭环、代码质量评测。
- 不把 B 的 source reference 验证混进 MVP-1 的通过条件；B 验证是后续 profile 接入前置。

## 3. 核心决策

### 3.1 当前态 projection

第一期只有当前 profile 配置，不做 profile 多版本读数。

- projection 明细表不保存配置版本字段。
- 明细表保存 `projection_run_id`、`matched_rule_id`、`confidence`、`evidence_json`、`rule_version`。
- full rebuild 新建独立 `projection_run_id` 写入，完成后切换 current pointer。
- dashboard 读路径只读 current pointer 指向的 completed run，不读取 running / failed run。
- 旧 run 可异步清理，但不得在新 run completed 前删除当前可读数据。
- 幂等 key 不包含配置版本。
- `profile_projection_runs.stats_json` 保存本轮对账摘要和差异解释。
- `knowledgeRecalls` 是 MVP-1 的非自证链路，必须从 `source_references` 投影。
- `capability / delivery / artifact / timeline` 第一阶段可作为桥接 projection，从旧 `sdd_*` 表映射到新表并服务 contract 接入。

### 3.2 sdd-default 保护

现有 `sdd_*` 表不删除、不重命名、不作为第一期迁移对象。

旧表用途：

- 对账基准。
- 运行回退。
- 保护历史页面和已验证链路。

新表用途：

- 承接 profile projection。
- 支撑新的 Profile Observability Contract。
- 后续接 A/B profile。

### 3.3 codeChanges 对账边界

`codeChanges` 纳入 profile contract，但不纳入 `sdd-default` 强一致对账。

原因：

- 当前 SDD code impact 使用“排除 requirements/wiki 后剩余业务代码”的隐式口径。
- 新架构目标是 profile 显式 code source rules。
- MVP-1 可先复用现有 code impact adapter 展示，但必须标注为已知口径差异项。

## 4. 数据模型任务

### Task 1: 新增 source_references 表

新增 migration，表名：`source_references`。

建议字段：

| 字段 | 类型建议 | 说明 |
| --- | --- | --- |
| `id` | BIGINT UNSIGNED PK | 主键 |
| `reference_key` | CHAR(64) UNIQUE | 幂等 key |
| `interaction_id` | BIGINT UNSIGNED NULL, INDEX | 关联 interaction |
| `tool_call_id` | BIGINT UNSIGNED NULL, INDEX | 关联 tool call |
| `event_id` | CHAR(64) NULL, INDEX | 兜底 evidence id |
| `user_id` | BIGINT UNSIGNED NULL, INDEX | 用户 |
| `session_id` | VARCHAR(191) NULL, INDEX | session |
| `prompt_id` | VARCHAR(191) NULL, INDEX | prompt |
| `action_type` | VARCHAR(32) NOT NULL, INDEX | read / write / update / delete / unknown |
| `locator_type` | VARCHAR(32) NOT NULL, INDEX | path / url / mcp_doc / unknown |
| `direction` | VARCHAR(16) NOT NULL, INDEX | input / result / event |
| `raw_locator` | VARCHAR(2048) NULL | 原始 locator |
| `normalized_locator` | VARCHAR(2048) NULL | 归一化 locator，不直接建索引 |
| `normalized_locator_hash` | CHAR(64) NULL, INDEX | `sha256(normalized_locator)`，用于去重和 join |
| `mcp_server` | VARCHAR(191) NULL | MCP server |
| `mcp_tool_name` | VARCHAR(191) NULL | MCP tool |
| `doc_id` | VARCHAR(191) NULL, INDEX | 在线文档 ID |
| `url` | VARCHAR(2048) NULL | 在线文档 URL |
| `title` | VARCHAR(500) NULL | 标题 |
| `space_id` | VARCHAR(191) NULL | 在线空间 |
| `collection_id` | VARCHAR(191) NULL | 在线集合 |
| `doc_type` | VARCHAR(64) NULL | 文档类型 |
| `event_time` | DATETIME(3) NULL, INDEX | 时间 |
| `evidence_json` | JSON NULL | 抽取证据 |
| `rule_version` | VARCHAR(32) NOT NULL | 抽取规则版本 |
| `gmt_create` / `gmt_modified` | DATETIME(3) | 时间戳 |

`normalized_locator` 不能直接建普通索引。MySQL utf8mb4 下 `VARCHAR(2048)` 单列索引会超过 InnoDB 索引长度限制；去重和 join 统一走 `normalized_locator_hash`。

`reference_key`：

```text
sha256(
  stable_evidence_id + ":" +
  direction(input|result|event) + ":" +
  action_type + ":" +
  locator_type + ":" +
  normalized_locator_hash
)
```

`stable_evidence_id` 定义（load-bearing，必须钉死）：

- `stable_evidence_id` 是**每次调用粒度**的稳定证据 id：优先 `sdd_interaction_tool_calls.tool_use_id`，无 tool call 时回退 `otel_log_events.event_id`。
- 它决定 source reference 的计数粒度：同一篇文档被读两次产生两条 source reference，**与旧 `sdd_wiki_recalls` 按 tool call 计数的口径对齐**，保证 knowledge 对账的 `old_not_in_new = 0` 可达成。
- 禁止取更粗的粒度（如只到 locator），否则同文档多次读取会被折叠，knowledge recall 系统性少于旧表，对账必然阻塞。

验证：

```bash
pnpm db:migrate
pnpm db:verify
```

验收：

- 表存在。
- `reference_key` 唯一索引存在。
- `session_id / prompt_id / interaction_id / tool_call_id / normalized_locator_hash / event_time` 有可用索引。
- `direction` 是显式列，可从行数据复现 `reference_key`。

### Task 2: 新增 profile projection 表

新增 migration，第一期表：

```text
profile_projection_runs
profile_current_projection_runs
profile_capability_usages
profile_delivery_units
profile_artifacts
profile_artifact_writes
profile_artifact_turns
profile_knowledge_recalls
profile_code_activities
```

`profile_current_projection_runs` 最小字段：

| 字段 | 类型建议 | 说明 |
| --- | --- | --- |
| `profile_id` | VARCHAR(191) PK | profile |
| `current_projection_run_id` | BIGINT UNSIGNED NOT NULL, INDEX | 当前可读 completed run |
| `gmt_create` / `gmt_modified` | DATETIME(3) | 时间戳 |

通用字段：

```text
profile_id
projection_run_id
matched_rule_id
confidence
evidence_json
rule_version
gmt_create
gmt_modified
```

source-backed projection 额外字段：

```text
source_reference_key CHAR(64) NOT NULL, INDEX
source_reference_id BIGINT UNSIGNED NOT NULL, INDEX
```

适用表：

- `profile_knowledge_recalls`
- `profile_code_activities`，仅在第一期选择写表时适用

强制约束：

- 所有业务幂等 key 都包含 `profile_id`，但不包含配置版本。
- 幂等 key 只能使用稳定业务 key，不得使用自增代理主键，例如 `source_references.id`、`sdd_skill_usages.id`。
- projection 明细表必须能按 `profile_id + projection_run_id` 查询和清理。
- `profile_projection_runs.run_type` 第一阶段只允许写 `full`。
- `incremental / backfill` 只作为枚举预留，不实现执行路径。
- `profile_current_projection_runs` 保存每个 `profile_id` 当前可读的 `projection_run_id`。
- 读路径必须 join / filter current completed run，不允许读取 running / failed run。
- 新 run completed 前不得删除 current run 的明细数据。

建议幂等 key：

| 表 | key |
| --- | --- |
| `profile_capability_usages` | `sha256(profile_id + ':capability:' + sdd_skill_usages.usage_key)` |
| `profile_delivery_units` | `sha256(profile_id + ':du:' + stable_unit_locator)` |
| `profile_artifacts` | `sha256(profile_id + ':artifact:' + delivery_unit_key + ':' + artifact_locator)` |
| `profile_artifact_writes` | `sha256(profile_id + ':artifact_write:' + event_id + ':' + artifact_key)` |
| `profile_artifact_turns` | `sha256(profile_id + ':artifact_turn:' + artifact_id + ':' + interaction_id)` |
| `profile_knowledge_recalls` | `sha256(profile_id + ':knowledge:' + source_reference_key)` |
| `profile_code_activities` | `sha256(profile_id + ':code:' + source_reference_key)` |

说明：

- `source_reference_key` 指 `source_references.reference_key`，是下游 source-backed projection 的稳定身份。
- `source_reference_id` 可以作为 join / 下钻列保留，但不得进入 `profile_knowledge_recalls` 或 `profile_code_activities` 的幂等 key。
- `profile_knowledge_recalls.source_reference_key` 和 `source_reference_id` 必须来自 `source_references`，不能从旧 `sdd_wiki_recalls` 复制时伪造。
- `profile_code_activities` 第一阶段是可选表；只有当实现路径也能拿到 `source_reference_key` 时才写入该表。若只复用现有 code impact adapter，则不写 `profile_code_activities`，只在 contract 层返回 adapter metric。

验证：

```bash
pnpm db:migrate
pnpm db:verify
```

验收：

- 表结构全部存在。
- 按 `profile_id + projection_run_id` 查询 current projection 和清理旧 run 的 SQL 有索引支撑。
- 重复插入同 key 不产生重复行。

## 5. 配置任务

### Task 3: 定义 profile config schema

新增 profile config schema，建议放在 `packages/api` 或 server/worker 共享位置，避免前后端重复定义。

最小结构：

```ts
type WorkflowProfileConfig = {
  profileId: string;
  displayName: string;
  status: 'active' | 'disabled';
  manifest: ProfileCapabilityManifest;
  sourceRules: SourceRule[];
  capabilityRules: CapabilityRule[];
  deliveryUnitRules: DeliveryUnitRule[];
  artifactRules: ArtifactRule[];
  knowledgeRules: KnowledgeRule[];
  codeSourceRules: CodeSourceRule[];
  attributionPolicy: AttributionPolicy;
};
```

manifest 字段全部 required：

```ts
type ProfileCapabilityManifest = {
  capabilityUsage: boolean;
  deliveryUnits: boolean;
  artifacts: boolean;
  artifactTimeline: boolean;
  knowledgeRecalls: boolean;
  codeChanges: boolean;
  errors: boolean;
  evaluation: boolean;
  alerts: boolean;
};
```

验证：

```bash
pnpm typecheck
```

验收：

- 缺少 manifest 字段时报类型或 schema 校验错误。
- `profileId` 唯一。
- 不包含 `version` 字段。

### Task 4: 内置 sdd-default profile

新增 `sdd-default` 配置，先用代码/seed 生成。

映射规则：

- capability rules 由 `sdd_skill_semantics / sdd_skill_aliases` 转换。
- artifact rules 由 `artifact_filename_patterns` 转换。
- process doc source 对应 `requirements_root_path`。
- knowledge source 对应 `wiki_root_path`。
- codeChanges 先通过现有 code impact adapter 展示，不参加强一致对账。

manifest：

```ts
{
  capabilityUsage: true,
  deliveryUnits: true,
  artifacts: true,
  artifactTimeline: true,
  knowledgeRecalls: true,
  codeChanges: true,
  errors: false,
  evaluation: false,
  alerts: false
}
```

说明：

- manifest 字段必须完整，但值必须表达 MVP-1 实际可承诺能力。
- `errors` 第一阶段没有 profile projection / legacy adapter 任务，因此设为 `false`；后续监控告警 PR 再打开。

验证：

```bash
pnpm typecheck
```

验收：

- `/api/profiles` 后续能返回 `sdd-default`。
- `sdd-default` 规则能覆盖现有 seeded semantics。
- 不允许删除 `sdd-default` 核心配置。

## 6. Source Reference 抽取任务

### Task 5: 实现 source reference extractor

输入：

- `otel_log_events`
- `sdd_interaction_tool_calls`
- interaction 上下文

输出：

- `source_references`

抽取规则：

- 支持 `Read / Grep / Glob / Write / Edit / MultiEdit` 本地路径。
- 支持 MCP tool input/result 中的 URL、docId、collectionId、spaceId、docType。
- 支持 double-encoded JSON，最多受控解码 2-3 层。
- 解码失败记录 `parse_failed` evidence，不中断整次 run。
- 优先使用完整 raw/event 字段，不依赖可能截断的 preview。

实现建议：

- 先复用现有 wiki recall 里解析 `tool_input_preview` 的思路，但不要只依赖 preview。
- 新增一个小模块，例如 `worker/src/jobs/source-reference-extractor.ts`。
- 抽取函数尽量纯函数化，便于 fixture 测试：

```ts
extractSourceReferences(eventOrToolCall, context): SourceReferenceInput[]
```

验证：

```bash
pnpm --filter @sdd-telemetry/worker test
pnpm typecheck
```

最低测试：

- JSON object input。
- double-encoded JSON string input。
- invalid JSON 降级。
- Write/Edit file path。
- Read/Grep/Glob path。
- MCP URL。
- 一个 tool call 产生多条 locator。

### Task 6: 实现 source reference full rebuild

新增 workspace 根命令：

```bash
pnpm profile:rebuild-source-references
```

根命令转发到 server 包脚本：

```bash
pnpm --filter @sdd-telemetry/server profile:rebuild-source-references
```

行为：

1. 扫描现有 facts。
2. 按 `reference_key` 幂等 upsert `source_references`。
3. 更新已存在行的 locator 元数据、上下文和 `gmt_modified`。
4. 输出统计：input events、tool calls、extracted references、inserted、updated、parse failed、unknown。

约束：

- 常规 rebuild 按 `reference_key` 幂等 upsert，不 `TRUNCATE`，保证按 `source_reference_id` 下钻的连续性。
- 但 `rule_version` 变更时必须全清重建（`TRUNCATE` 后重抽）。原因：`normalized_locator_hash` 进入 `reference_key`，归一化逻辑一变会对同一次读取产生新 `reference_key` 的新行，旧归一化行若不清理会残留并被下游重复计数。下游已按稳定 `reference_key` 幂等，且 §12 是先 rebuild-source-references 再 profile:rebuild，全清重建对下游身份安全。
- MVP-1 不做按时间过期的硬删除；当前源日志未过期清理，全量 upsert（或 rule_version 变更时全清重建）足够。
- 下游 projection 可以保存 `source_reference_id` 供 join，但身份和幂等必须基于稳定的 `reference_key`。

验收 SQL：

```sql
SELECT locator_type, action_type, COUNT(*) AS cnt
FROM source_references
GROUP BY locator_type, action_type
ORDER BY cnt DESC;

SELECT COUNT(*) AS duplicates
FROM (
  SELECT reference_key
  FROM source_references
  GROUP BY reference_key
  HAVING COUNT(*) > 1
) t;
```

验收：

- `duplicates = 0`。
- 当前本地 SDD 数据里 requirements 写入和 wiki 读取能抽到 source reference。
- parse failed 不会中断 rebuild。

### Task 6.5: 统一 profile 脚本宿主

profile 相关命令第一期统一由 `@sdd-telemetry/server` 承载，workspace 根 `package.json` 只暴露转发脚本。

原因：

- profile projection 表、contract 查询和 diff 都属于服务端数据模型。
- worker 里的抽取逻辑可以作为模块被 server 命令复用，但命令入口不要分散。
- 总体验收命令必须避免 `command not found`。

根脚本：

```json
{
  "profile:rebuild-source-references": "pnpm --filter @sdd-telemetry/server profile:rebuild-source-references",
  "profile:rebuild": "pnpm --filter @sdd-telemetry/server profile:rebuild",
  "profile:diff": "pnpm --filter @sdd-telemetry/server profile:diff"
}
```

server 包脚本：

```json
{
  "profile:rebuild-source-references": "...",
  "profile:rebuild": "...",
  "profile:diff": "..."
}
```

验收：

```bash
pnpm profile:rebuild-source-references --help
pnpm profile:rebuild --help
pnpm profile:diff --help
```

- 三个根命令都不能出现 `command not found`。
- `--profile sdd-default` 参数能透传到 server 命令。

## 7. Projection Runner 任务

### Task 7: 实现 full projection run 框架

新增 full rebuild runner：

```bash
pnpm profile:rebuild -- --profile sdd-default
```

行为：

1. 创建 `profile_projection_runs` 行，`run_type=full`，`status=running`。
2. 获取 profile 级 rebuild 锁，保证同一 profile 同时只有一个 running run。
3. 执行各 projection operator，所有明细写入新的 `projection_run_id`。
4. 写入 `stats_json`。
5. 成功标记 `completed`。
6. 在同一事务中更新 `profile_current_projection_runs.current_projection_run_id`。
7. 失败标记 `failed`，保留错误，不切换 current pointer。
8. 旧 run 明细可在切换完成后异步清理，MVP 可先保留。

约束：

- 第一阶段不实现 incremental。
- 读路径只读 current pointer 指向的 completed run。
- running / failed run 永远不进入 dashboard 查询。
- 失败时保留 run 记录和错误，不影响旧 current run。
- 同一时间同 profile 只能有一个 running run；可用数据库锁或应用层 guard。

验证：

```bash
pnpm profile:rebuild -- --profile sdd-default
```

验收：

- run 状态完整。
- 重复执行不会产生重复 projection 行。
- 失败时不留下半截被 dashboard 读到的当前态数据。
- 人为制造一个 projection operator 抛错后，`profile_current_projection_runs.current_projection_run_id` 不变。

### Task 8: capability projection

目标：从现有 `sdd_skill_usages` 或等价事件投影到 `profile_capability_usages`。

MVP 可先以 `sdd_skill_usages` 为输入，降低风险；后续再下沉到 canonical facts。

性质：桥接 projection。它证明新表和 profile contract 能承接旧能力分析口径，不证明 capability 抽取算子已经能从 raw facts 独立重建。

key 规则：桥接输入使用 `sdd_skill_usages.usage_key`，不得使用 `sdd_skill_usages.id`。

映射：

| `sdd_skill_usages` | `profile_capability_usages` |
| --- | --- |
| `raw_skill_name` | `raw_capability_name` |
| `semantic_code` | `capability_code` |
| `interaction_id` | `interaction_id` |
| `work_item_id` | 后续映射为 `delivery_unit_id` |
| `status` | `status` |
| `event_time` | `event_time` |

验收：

```sql
SELECT COUNT(*) FROM sdd_skill_usages;
SELECT COUNT(*) FROM profile_capability_usages WHERE profile_id = 'sdd-default';
```

目标：

- 数量强一致，差异必须逐条解释。
- 随机抽样 raw skill / semantic / interaction 能对上。

### Task 9: delivery unit projection

目标：从 `sdd_work_items` 投影到 `profile_delivery_units`。

MVP 先以旧表为输入，保证需求口径和历史页面一致。

性质：桥接 projection。它用于保护现有需求链路和总览/产出分析迁移，不作为新事实层重建能力的证明。

验收：

```sql
SELECT COUNT(*) FROM sdd_work_items;
SELECT COUNT(*) FROM profile_delivery_units WHERE profile_id = 'sdd-default';
```

目标：

- 0 差异。
- `business_domain / work_item_slug / relative_dir` 对齐。
- `delivery_unit_key` 稳定，重复 rebuild 不变。

### Task 10: artifact projection

目标：从 `sdd_work_item_artifacts` 投影到 `profile_artifacts`。

性质：桥接 projection。它先保证产物分析页面能切到 profile contract，后续再把 artifact operator 下沉到 source reference / canonical facts。

验收：

```sql
SELECT artifact_type, COUNT(*)
FROM sdd_work_item_artifacts
GROUP BY artifact_type
ORDER BY artifact_type;

SELECT artifact_type, COUNT(*)
FROM profile_artifacts
WHERE profile_id = 'sdd-default'
GROUP BY artifact_type
ORDER BY artifact_type;
```

目标：

- artifact 总量和按类型分布强一致。
- artifact 与 delivery unit 关联一致。
- artifact locator / relative path 能对上。

### Task 11: artifact timeline projection

目标：投影现有：

- `sdd_work_item_artifact_writes`
- `sdd_work_item_artifact_turns`

到：

- `profile_artifact_writes`
- `profile_artifact_turns`

性质：桥接 projection。它保护当前多轮归因、session 下钻和 artifact timeline 能力，不在 MVP-1 里重写归因算法。

验收：

```sql
SELECT COUNT(*) FROM sdd_work_item_artifact_writes;
SELECT COUNT(*) FROM profile_artifact_writes WHERE profile_id = 'sdd-default';

SELECT COUNT(*) FROM sdd_work_item_artifact_turns;
SELECT COUNT(*) FROM profile_artifact_turns WHERE profile_id = 'sdd-default';
```

抽样验收：

- 选 3 个有多轮讨论的 artifact。
- 对比旧/新 timeline 节点数量、顺序、interaction_id、wiki recall count。

目标：

- write / turn 数量强一致。
- 时间线顺序一致。
- 可跳回 interaction 详情。

### Task 12: knowledge recall projection

目标：从 `source_references` 投影到 `profile_knowledge_recalls`，再对账旧 `sdd_wiki_recalls`。

这是 MVP-1 必须跑通的非自证链路，不能从 `sdd_wiki_recalls` 复制生成。

输入：

- `source_references`
- `sdd-default.knowledgeRules`
- interaction / tool call 上下文
- 必要时通过旧 `sdd_wiki_recalls` 做 id 映射和差异解释，但不能作为主输入

核心规则：

- 只统计 `action_type = read` 的知识库引用。
- 同一 `stable_evidence_id` + locator 身份若存在多条 source reference（历史 `rule_version` 残留），只取最新 `rule_version` 的一条投影，避免归一化变更导致重复计数。
- locator 必须命中 `sdd-default` 的 wiki source rule，例如 `wiki_root_path` 或后续 URL prefix。
- `source_reference_key` 必须写入 `profile_knowledge_recalls`，值来自 `source_references.reference_key`。
- `source_reference_id` 必须写入 `profile_knowledge_recalls`，用于 join / 下钻，但不进入幂等 key。
- `knowledge_key = sha256(profile_id + ':knowledge:' + source_reference_key)`。
- 如果 source reference 命中多个知识规则，取最高置信规则；同分时按规则顺序稳定选择，并在 `evidence_json` 记录候选。
- 仅靠标题、关键词、prompt 上下文猜出来的，不进入核心 `profile_knowledge_recalls`；可进入后续待归类能力，MVP 不做。

验收：

```sql
SELECT action_type, COUNT(*)
FROM sdd_wiki_recalls
GROUP BY action_type
ORDER BY action_type;

SELECT action_type, COUNT(*)
FROM profile_knowledge_recalls
WHERE profile_id = 'sdd-default'
GROUP BY action_type
ORDER BY action_type;

-- source_reference_id / source_reference_key 由 NOT NULL 约束在 schema 层保证非空，
-- 这里查真正的完整性问题：投影出的 source_reference_key 是否都能在 source_references 中找到（无悬挂引用）。
SELECT COUNT(*) AS orphan_source_ref
FROM profile_knowledge_recalls k
LEFT JOIN source_references s ON s.reference_key = k.source_reference_key
WHERE k.profile_id = 'sdd-default'
  AND s.reference_key IS NULL;
```

目标：

- `orphan_source_ref = 0`（每条 knowledge recall 都能反查到真实 source reference）。
- 旧 `sdd_wiki_recalls` 命中的 knowledge recall，新的 `profile_knowledge_recalls` 不得漏掉。
- 新 `profile_knowledge_recalls` 多于旧 `sdd_wiki_recalls` 是允许的，但必须归因到完整 raw/event 抽取、规则差异或 locator 归一化差异。
- `tool_call_id / interaction_id / skill_usage_id / work_item_id` 链路能映射到 profile ids；没有映射时必须进入 diff 解释。
- 随机抽样 wiki path 一致。
- 抽样必须能从 `profile_knowledge_recalls.source_reference_key` 反查到 `source_references.normalized_locator` 和原始 evidence。

### Task 13: code activity projection

目标：轻量纳入 `codeChanges`，但不参与强一致对账。

MVP 可先复用现有日报 code impact 聚合逻辑，提供 profile contract 所需的 code read/write 概况。

最低实现：

- profile overview 返回 `codeWriteCount / codeReadCount`。
- 用户分析返回 `codeWriteCount / codeReadCount`。
- 标注来源为 existing code impact adapter。

可选实现：

- 写入 `profile_code_activities`。

约束：

- 如果只复用现有 code impact adapter，则不写 `profile_code_activities`，避免生成缺少 `source_reference_key` 的伪 projection 行。
- 只有当 code read/write 也来自 `source_references.reference_key` 时，才允许写入 `profile_code_activities`。
- A 的 `frontend_repo / backend_repo` 后续接入时，可以通过 code source rules + path prefix 低成本生成 `profile_code_activities`。

验收：

- 页面或 API 能展示与现有用户页/日报同量级的 code read/write。
- 不作为 projection 对账失败条件。

## 8. 对账任务

### Task 14: 新增 sdd-default 对账脚本

新增命令：

```bash
pnpm profile:diff -- --profile sdd-default
```

输出：

```text
capability usage: old=... new=... diff=...
delivery units:  old=... new=... diff=...
artifacts:       old=... new=... diff=...
artifact writes: old=... new=... diff=...
artifact turns:  old=... new=... diff=...
knowledge:       old=... new=... old_not_in_new=... new_not_in_old=...
knowledge source_refs: extracted=... projected=... missing_source_ref=...
codeChanges:     skipped strong diff, known adapter metric
```

差异输出必须包含：

- old id / new id。
- stable key。
- matched rule。
- evidence。
- 解释字段或待人工确认标签。

验收：

- delivery unit：0 差异。
- artifact：0 差异。
- artifact writes/turns：0 差异。
- capability usage：目标 0 差异；若非 0，必须逐条解释。
- knowledge recall 采用非对称门槛：`old_not_in_new = 0` 必须满足。
- `new_not_in_old` 允许非 0，但每条必须归因到完整 raw/event 抽取、规则差异或 locator 归一化差异。
- knowledge recall 必须来自 `source_references`，`orphan_source_ref = 0`（无悬挂引用）。
- `old_not_in_new` 若非 0，必须阻塞通过，并区分是 source reference 未抽到、knowledge rule 未命中、还是映射 bug。
- codeChanges：不参与强一致。

### Task 15: 抽样链路对账

新增脚本或 SQL checklist，抽样 3-5 个需求：

链路：

```text
需求
  -> artifact 列表
  -> artifact timeline
  -> interaction detail
  -> tool calls
  -> wiki recall
```

验收：

- 旧 `/api/sdd/work-items/:id` 与新 profile demand detail 可找到同一需求。
- artifact 列表一致。
- timeline 节点一致。
- 节点能打开 interaction 全文。
- wiki recall 标签和数量一致。

## 9. Profile Contract 任务

### Task 16: 新增 profile contract schema

在 `packages/api` 新增 profile contract，或在现有 contract 中新增 profile 域。

MVP 端点：

```text
GET /api/profiles
GET /api/profiles/:profileId/manifest
GET /api/profiles/:profileId/overview
```

后续四大看板端点可逐步补：

```text
GET /api/profiles/:profileId/users
GET /api/profiles/:profileId/capabilities/analytics
GET /api/profiles/:profileId/demands
GET /api/profiles/:profileId/knowledge/coverage
```

命名要求：

- contract 内部使用 `deliveryUnitCount / artifactCount / capabilityUsageCount / knowledgeRecallCount`。
- 页面文案可以继续显示“需求 / 文档 / 能力 / 知识库”。
- 不在 contract 字段中使用 `sdd`、`demand` 作为通用模型字段名。

验证：

```bash
pnpm typecheck
```

验收：

- schema 可被前后端共享。
- manifest 字段 required。
- `sdd-default` 能返回 overview。

### Task 17: server profile query adapter

实现 profile query service。

读源策略：

```text
PROFILE_DASHBOARD_READ_SOURCE=legacy_sdd | profile_projection
```

第一阶段：

- `legacy_sdd`：用现有 `sdd_*` 查询填充 profile contract。
- `profile_projection`：用 `profile_*` 查询填充 profile contract。

验收：

```bash
pnpm typecheck
pnpm build
```

API 验收：

```bash
curl -sS http://127.0.0.1:4318/api/profiles
curl -sS http://127.0.0.1:4318/api/profiles/sdd-default/manifest
curl -sS http://127.0.0.1:4318/api/profiles/sdd-default/overview
```

预期：

- `sdd-default` 存在。
- manifest 正确。
- overview 和旧 `/api/sdd/overview` 数量一致，codeChanges 除外。

## 10. 前端任务

### Task 18: 全站 Profile Switcher

在 shell context 中加入 `profileId`。

要求：

- 默认 `sdd-default`。
- 第一阶段只有一个选项，也要保留 UI/状态结构。
- 与 `timeRange` 同级。
- 后续切 A/B profile 时不需要重做页面状态模型。

验收：

- 刷新页面后仍使用 `sdd-default`。
- 所有 profile contract 请求都带 profileId。

### Task 19: 总览接入 Profile Contract

先让总览使用 profile overview contract。

要求：

- 页面文案可保持原样。
- API client 使用 `packages/api` schema 推导类型。
- 读源开关切换时页面指标保持一致。

验收：

- `PROFILE_DASHBOARD_READ_SOURCE=legacy_sdd` 可用。
- `PROFILE_DASHBOARD_READ_SOURCE=profile_projection` 可用。
- 总览核心 KPI 与旧页面一致。

### Task 20: 四大看板逐步接入

顺序建议：

1. 产出分析：最能验证 delivery unit / artifact / timeline。
2. 知识库分析：验证 knowledge recall 和 source reference。
3. 能力分析：验证 capability usage 和语义映射。
4. 用户分析：整合 capability / artifact / knowledge / codeChanges。

每个页面接入时都必须保留旧数据路径回退，直到对账通过。

验收：

- 页面现有核心功能不退化。
- 链路下钻不断。
- manifest 降级逻辑存在，即使当前 `sdd-default` 全部支持。

## 11. B source reference 验证前置

这不是 MVP-1 的阻塞项，但必须作为接入 `boss-b-online-docs` 前的前置验收。

公司电脑受控流程：

1. MCP 读取知识库文档，URL 命中 `{host}/creditdoc/frontedndoc/<hash>`。
2. 同 MCP 读取 PRD 或其它非知识库文档。
3. MCP 创建 requirements / 过程文档。
4. MCP 更新第 3 步同一篇文档。

需要导出：

- raw payload，优先 `otel_raw_payloads.payload_json`。
- 对应 `otel_log_events` 行。
- 对应 `sdd_interaction_tool_calls` 行。

验收：

- knowledge read 能抽出 URL/hash。
- non-knowledge read 不误判。
- requirements create 能抽出稳定 locator。
- requirements update 与 create 命中同一个 locator。
- tool result 编码层数清楚。
- locator 来自结构化 raw/tool input/tool result，不是只靠 response 文本。

阻塞：

- create/update 没稳定 locator。
- tool result 未保留或被截断。
- 同 MCP 文档类型无法区分。

## 12. 总体验收命令

基础：

```bash
pnpm typecheck
pnpm build
```

数据库：

```bash
docker compose up -d mysql
pnpm db:migrate
pnpm db:verify
```

重建和对账：

```bash
pnpm profile:rebuild-source-references
pnpm profile:rebuild -- --profile sdd-default
pnpm profile:diff -- --profile sdd-default
```

运行链路：

```bash
pnpm dev
curl -sS http://127.0.0.1:4318/api/profiles
curl -sS http://127.0.0.1:4318/api/profiles/sdd-default/overview
```

如果改动影响 worker 清洗或重清洗链路，还需要：

```bash
pnpm db:reclean
```

## 13. 完成定义

MVP-1 完成必须同时满足：

1. 新表 migration 和 schema verify 通过。
2. `sdd-default` config 可加载，manifest 完整。
3. source references 可全量重建，幂等，无重复 key。
4. `sdd-default` projection 可全量重建，重复跑不重复计数。
5. projection read path 使用 current pointer，failed run 不影响当前看板数据。
6. `knowledgeRecalls` 从 `source_references` 投影，`orphan_source_ref = 0`，无悬挂引用。
7. 新旧对账通过；桥接链路差异为 0 或逐条解释。
8. knowledge recall 对账满足 `old_not_in_new = 0`，`new_not_in_old` 全部有归因。
9. Profile Contract 至少支撑 profiles / manifest / overview。
10. 总览可通过 profile contract 展示 `sdd-default`。
11. 旧 `sdd_*` 读源可回退。
12. `codeChanges` 作为已知口径差异项展示，不参与强一致。
13. 文档保鲜完成：如实际实现与本文不同，必须更新本文和架构文档。

## 14. 风险控制

### 14.1 半截 projection 被读取

风险：full rebuild 写入新 run 过程中失败，dashboard 读到空数据或半截数据。

处理：

- rebuild 期间加 profile 级锁。
- 采用 current-pointer 模式：新 run 全部写入独立 `projection_run_id`，completed 后再切换 current pointer。
- 读路径只读 `profile_current_projection_runs.current_projection_run_id` 指向的 completed run。
- failed / running run 永远不可被 dashboard 查询到。
- 旧 current run 在新 run completed 前不得删除。

这是 MVP-1 的固定方案，不再保留“先删后写”的实现分支。

### 14.2 source reference 抽取依赖 preview

风险：preview 被截断，B 的在线文档 docId/url 丢失。

处理：

- MVP-1 对 SDD 可先用现有字段，但 extractor 设计必须支持从 raw/event 完整字段读取。
- B 接入前必须用公司电脑日志验证 tool result。

### 14.3 对账失败无法解释

风险：新旧数据差异没有 evidence，无法判断是 bug 还是口径优化。

处理：

- projection 明细必须记录 `matched_rule_id / confidence / evidence_json / rule_version / projection_run_id`。
- diff 输出必须列出差异样本。

### 14.4 过早接 A/B

风险：`sdd-default` 没对账通过就接 A/B，问题来源不清。

处理：

- A/B profile 只在 MVP-1 完成后进入实施。
- B 的 source reference 验证不通过时，不启动 B projection。

## 15. 推荐 PR 切分

建议拆成小 PR：

1. PR-1：profile config schema + `sdd-default` config + profile list/manifest contract。
2. PR-2：`source_references` 表 + extractor + rebuild source references + profile 根脚本。
3. PR-3：`profile_*` 表 + `profile_current_projection_runs` + current-pointer projection run 框架。
4. PR-4：`sdd-default` capability/delivery/artifact/timeline 桥接 projection。
5. PR-5：`knowledgeRecalls` 从 `source_references` 投影 + 对账脚本和抽样链路验证。
6. PR-6：Profile overview contract + server adapter + 总览接入。
7. PR-7：Profile Switcher + 四大看板逐步接入。

每个 PR 都必须能独立通过 `pnpm typecheck` 和 `pnpm build`。涉及 migration/worker 的 PR 额外跑数据库验证。

## 16. 实施记录（2026-06-04）

### 16.1 已完成并在真实库验证

- **PR-1~6 后端全闭环**：source_references 抽取 + 重建（幂等、duplicates=0）、profile_* 9 表 + current-pointer 框架（失败不切 pointer 实测）、桥接 projection（对账 0 差异）、knowledge 非自证投影（`profile:diff` gate PASS：`old_not_in_new=0`、`orphan_source_ref=0`）、读源开关 + overview 读 projection（parity 一致）。
- **PR-7 前端**：全站 Profile Switcher + ShellContext.profileId（localStorage 持久化）；overview headline KPI（技能调用/活跃用户/覆盖需求）接入 Profile Contract；manifest 降级机制（`useProfileManifest` + `FeatureGate`）。
- **Task 13** code activity 算子 + overview code 概况（read/write 计数，不参与对账）；overview 已补 知识库/代码 卡片（DoD §13#12 可视闭合）。
- **Task 15** `profile:link-check` 抽样链路对账（gate PASS）。
- **Task 20 产出分析（部分）**：`GET /api/profiles/:id/demands` 端点（读 profile_delivery_units + artifacts，current run，legacy 可回退）+ `useProfileDemands` hook 已就位、已验证。

### 16.2 实现决策 / 与本文的偏差（已确认）

1. **profile 命令挂 worker**（`profile:rebuild-source-references` / `rebuild` / `diff` / `link-check`），不是 Task 6.5 的「全部 server」。理由：source reference 抽取与 projection 属清洗域，高内聚低耦合，避免 server→worker 反向依赖；worker 写 profile_*、server 读 profile_*。根 `package.json` 仍提供转发脚本，§12 验收命令照常可用。
2. **桥接算子幂等 key 复用上游 sdd 稳定 key**（`usage_key` / `work_item_key` / `artifact_key` / `write_key` / `turn_key`，加 profile 前缀 sha256），不是 §10.3 的事实层 composite key。桥接从 sdd_* 映射，sdd 自身 key 更直接、稳定性等价；事实层 key 留待下沉到 raw facts 时使用。
3. **source reference 抽取数据源**：`tool_input` 实际在 `tool_result` 事件的 `attributes_json` 上（非 tool_decision），且为 double-encoded JSON string。抽取从完整 `attributes_json` 读、受控解码，不依赖 4096 preview。
4. **knowledge 对账 scope**：限「pipeline 数据」（`tool_call_id ∈ source_references` 的 wiki recall）。seed/demo 用户（无底层 tool calls / source_references，约 4106 条）不属 pipeline，可解释排除，不计入 `old_not_in_new`。
5. **code 口径**（Task 13）：sdd-default 第一版 = 本地 path 且不在 `wiki_root_path` / `requirements_root_path` 下；只在有 `source_reference_key` 时写 `profile_code_activities`。
6. **读源默认值**：`PROFILE_DASHBOARD_READ_SOURCE` 默认 `legacy_sdd`（安全回退，非 §13.3 的 dev=projection）；切 `profile_projection` 后若无 current pointer 自动回退 legacy。
7. **upsert 计数**：mysql2 连接带 `CLIENT_FOUND_ROWS`，`affectedRows` 对 no-op upsert 也返回 1；source-references rebuild 改用全表行数差算 inserted，幂等以 duplicates=0 + 行数稳定佐证。

### 16.3 未完成（增量，不阻塞主干）

- **Task 20 四大看板取数（进行中）**：产出分析 `/demands` 端点 + hook 已就位（上面）；但 WorkItemsPage 全量接入需「调用次数」按 delivery_unit 聚合，依赖 **capability→delivery 链路**（桥接当前 `profile_capability_usages.delivery_unit_id` 为空），属前置增量。知识库/能力/用户三大看板端点（`/knowledge/coverage`、`/capabilities/analytics`、`/users`）尚未做。需求详情 + artifact timeline 下钻端点（§11.5）尚未做。按「逐步接入」推进。
- **§13 完成定义**：第 1–9、11 项已满足；第 10 项部分（后端可提供、前端仅 headline 接入）；第 12 项已补（code 概况展示）。
