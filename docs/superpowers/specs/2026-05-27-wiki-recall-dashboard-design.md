---
title: Wiki 召回看板 — 设计文档
status: Draft（待评审）
created: 2026-05-27
author: loomisli
brainstormed_with: Claude (Opus 4.7, /superpowers:brainstorming)
related:
  - 任务 B（评测有/无 wiki 对 proposal & design 产物的影响）路线图见 §8
---

# Wiki 召回看板 — 设计文档

## 1. 背景与目标

### 1.1 背景

`bk-fe-sdd` 工作流由十几个 skill 组成。其中 `bk-fe-proposal` / `bk-fe-design` / `bk-fe-task` / `bk-fe-code` 等 skill 在执行时会从 `@wiki` 别名指向的本地知识库（git 仓库 `bk-fe-knowledge-trade` 的 clone）召回内容辅助推理。需求完成后由 `bk-fe-legilimency` skill 把研发产物回补到知识库，形成知识循环。

`sdd-telemetry` 平台已经能采集 Claude Code 的 OTel 日志、清洗派生 `sdd_skill_usages` / `sdd_interactions` / `sdd_work_items` / `sdd_work_item_artifacts` 等核心实体，但**目前没有专门表征"知识库召回"这件事的派生数据**。

老板提出两个观测需求：

- **任务 A**（本期）：在 dashboard 加知识库召回看板，让团队看到谁/哪个需求/哪个 skill 在召回 wiki，召回了哪些内容
- **任务 B**（下一期）：评测**有 wiki 召回 vs 无 wiki 召回**对 proposal/design 产物的影响

本文档只覆盖**任务 A**。任务 B 的路线图作为本期设计的附属展望放在 §8。

### 1.2 本期目标

在 sdd-telemetry 看板里新增"知识库召回"模块，回答以下核心问题：

- 谁在用 wiki？用得多深？（用户使用排行）
- 哪个需求在消费 wiki？消费了什么？（需求 × wiki 下钻）
- wiki 库里哪些知识最被消费？（按 domain / axis / system 聚合）
- 最近召回趋势如何？有没有异常波峰？（召回时间线）

同时**顺手**做一个通用基础能力：把 `sdd_interaction_tool_calls.skill_usage_id` 落地，未来"skill 工具画像"、"错误归属下沉"等都能 incremental 加。

### 1.3 本期明确不做的事项

防止 scope 漂移，一次性列清：

| 不做的事 | 留给 |
|---|---|
| 召回**效用**（产物是否真正引用了召回内容） | 任务 B |
| wiki **死文件清单 / 利用率**（被读过文件占总数的比例） | 不做（与老板对齐过 ROI 低） |
| wiki 内容预览（dashboard 点击不展开 markdown） | 不做（会变成另一个产品） |
| `sdd_errors.usage_id` 归属算法统一 | 不做（现有算法稳定，没坏不修） |
| skill 工具画像视图 | 未来 incremental，1-3 天 |
| 错误归属 UI 下沉到具体 skill_usage | 未来 incremental |
| Skill 子调用作为 `action_type='skill_subcall'` 入库 | 预留 enum 值，本期不实际写入 |
| wiki 文件 rename detection | 不做（极低频，手动 case 处理） |
| 实时推流 / websocket | 不做 |
| 服务端定时 `git clone @wiki` | 不做（ROI 低；与老板对齐过） |

## 2. 架构与数据流

### 2.1 端到端数据流

```
Claude Code 客户端
  bk-fe-design 等 skill 调用
    Read("@wiki/domain-cashier/system/apps/bk-cashier-sdk/core.md")
        │
        │ OTel
        ▼
POST /api/ingest/otlp-logs                                  [现有，不动]
        ▼
otel_raw_payloads + ingest_outbox (事务)                    [现有，不动]
        ▼
worker 轮询 outbox → 触发 cleanBatch                         [现有，不动]
        │
        ├─ upsertEvents          → otel_log_events           [现有，不动]
        ├─ upsertInteractions    → sdd_interactions          [现有，不动]
        ├─ upsertToolCalls       → sdd_interaction_tool_calls[★ 加 skill_usage_id 列]
        ├─ upsertSkillUsages     → sdd_skill_usages          [现有，不动]
        │
        ├─ ★ attachSkillUsageToToolCalls (新增)
        │    扫描本 interaction 的 tool_calls 与 skill_usages
        │    按 event_sequence 范围推断归属，回填 skill_usage_id
        │
        ├─ upsertWorkItems       → sdd_work_items + artifacts[现有，不动]
        ├─ upsertErrors          → sdd_errors                [现有，不动]
        │
        └─ ★ upsertWikiRecalls (新增)
             遍历本批 tool_calls，命中用户 wiki_root_path 前缀的
             写 sdd_wiki_recalls
                                          ↓
                                Dashboard 查询派生表（4 个 tab）
```

### 2.2 改动点总览

| 类别 | 改动 | 风险等级 |
|---|---|---|
| 数据库 | `sdd_interaction_tool_calls` 加列 `skill_usage_id`；新建 `sdd_wiki_recalls` 表 | 中（动了核心表 schema，但只加列，不改语义） |
| worker | 在现有 cleanBatch 中追加 `attachSkillUsageToToolCalls` / `attachParentSkillUsageToAgentToolCalls` / `upsertWikiRecalls` **三个** step | 中（追加，不动现有逻辑） |
| server | 新增 wiki recall 查询 service / controller / Zod contract | 低 |
| web | 新增"知识库召回"页面（4 个 tab）+ 用户/需求详情页加入口 | 低 |
| db:reclean | 自动跑新逻辑；只需把 `sdd_wiki_recalls` 加进现有 reset-derived-data 清表列表 | 0 |

### 2.3 与现有看板的关系

- **不替代**：现有 skills / users / work_items / interactions / errors 页面照旧
- **联动**：用户详情、需求详情页加 wiki 召回区域
- **基础能力溢出**：`skill_usage_id` 通用化后，未来 "skill 工具画像"、"错误归属下沉" 等都能 incremental 加，不需要再动表

## 3. Schema 设计

### 3.1 现有表的小手术：`sdd_interaction_tool_calls` 加列

| 字段 | 类型 | 约束 | 说明 |
|---|---|---|---|
| `skill_usage_id` | BIGINT UNSIGNED | NULL, INDEX | 直接归属的 skill_usage；按 (interaction_id, event_sequence) 推断 |

```sql
ALTER TABLE sdd_interaction_tool_calls
  ADD COLUMN skill_usage_id BIGINT UNSIGNED NULL AFTER interaction_id,
  ADD KEY idx_tool_calls_skill_usage_id (skill_usage_id);
```

**约束**：NULL 是合法状态——极早期 tool_call 出现在第一个 `skill_activated` 之前时，无前置 skill_usage 时填 NULL。

**与已有功能的影响**：

- 现有唯一查询点 `listInteractionToolCalls` 的 SELECT 列固定，新列不影响 ✅
- 现有 interactions 详情页 UI 不展示新列，零影响 ✅
- 老数据 `skill_usage_id` 都是 NULL：跑一次 `pnpm db:reclean` 全量重清洗回填 ⚠️
- 与 `sdd_errors.usage_id`（已有，用 `(session_id, event_time)` 推断）**并存**：两套归属算法精细度不同，本期不统一。spec 注释并存事实即可。
- **subagent 内 tool_call 的特殊归属**：subagent interaction（`agent_name` 不为 NULL）内通常没有 `skill_activated` 事件——skill 在父 turn 触发，subagent 是独立 prompt 的子代理执行。当前 `(interaction_id, event_sequence)` 推断对它们会全部归 NULL。归属需要从父 turn 继承，详见 §4.2.1。生产数据已验证：subagent interaction 与父 turn **共享 session_id**（见 §6.4 验证查询）。

### 3.2 新建 `sdd_wiki_recalls` 表

#### 设计思路

- **一个 tool_call 最多写一行 wiki_recall**：不展开 Glob/Grep 命中的多文件（`tool_result` 的解析不可靠）
- **`action_type` 区分四种动作**：`read` 是强信号、`glob` / `grep` 是探查意图、`skill_subcall` 预留
- **只有 `action_type='read'` 才一定能解析出可信的 4 维字段**；其余 action 4 维字段可为 NULL
  - 看板"按文件聚合"统计只取 `read`
  - "按动作分布"统计取全部
- **wiki 4 维只物化 3 个稳定维度**（domain / axis / system），其余在前端从 `wiki_relative_path` 解析

#### 表结构

| 字段 | 类型 | 约束 | 说明 |
|---|---|---|---|
| `id` | BIGINT UNSIGNED | PK AUTO_INCREMENT | 主键 |
| `recall_key` | CHAR(64) | NOT NULL, UNIQUE | 幂等键：`sha256(tool_call_id + ":" + raw_path)` |
| `tool_call_id` | BIGINT UNSIGNED | NOT NULL, INDEX | 来源 tool_call，1:1 |
| `interaction_id` | BIGINT UNSIGNED | NOT NULL, INDEX | 来源 interaction |
| `skill_usage_id` | BIGINT UNSIGNED | NULL, INDEX | 直接归属 skill_usage（不递归子 skill） |
| `work_item_id` | BIGINT UNSIGNED | NULL, INDEX | 关联需求（从 skill_usage 反查） |
| `user_id` | BIGINT UNSIGNED | NULL, INDEX | 用户 |
| `action_type` | VARCHAR(32) | NOT NULL, INDEX | `read` / `glob` / `grep` / `skill_subcall` |
| `raw_path` | VARCHAR(2048) | NOT NULL | 原始绝对路径（read）/ pattern（glob/grep）/ 子 skill 名（skill_subcall） |
| `wiki_relative_path` | VARCHAR(1024) | NULL, INDEX(255) | source of truth；只有 `action_type=read` 必填 |
| `wiki_domain` | VARCHAR(191) | NULL, INDEX | 派生加速：去 `domain-` 前缀的顶层目录名 |
| `wiki_axis` | VARCHAR(64) | NULL, INDEX | 派生加速：path 第二段，典型值 `architecture` / `business` / `config` / `data` / `system` / `root` / NULL |
| `wiki_system` | VARCHAR(191) | NULL, INDEX | 派生加速：仅 `wiki_axis=system` 时填，path `system/apps/{X}` 中的 X |
| `event_id` | CHAR(64) | NULL, INDEX | 来源 event |
| `event_sequence` | INT UNSIGNED | NULL | 同 session 内序号 |
| `event_time` | DATETIME(3) | NULL, INDEX | 召回时间 |
| `rule_version` | VARCHAR(32) | NOT NULL | 清洗规则版本，规则变更时区分 |
| `gmt_create` | DATETIME(3) | NOT NULL | 创建时间 |
| `gmt_modified` | DATETIME(3) | NOT NULL | 更新时间 |

#### 索引

```text
PRIMARY KEY (id)
UNIQUE KEY uk_recall_key (recall_key)
KEY idx_recalls_tool_call_id (tool_call_id)
KEY idx_recalls_interaction_id (interaction_id)
KEY idx_recalls_skill_usage_id (skill_usage_id)
KEY idx_recalls_work_item_id (work_item_id)
KEY idx_recalls_user_event_time (user_id, event_time DESC)
KEY idx_recalls_relative_path (wiki_relative_path(255))
KEY idx_recalls_domain (wiki_domain)
KEY idx_recalls_axis (wiki_axis)
KEY idx_recalls_system (wiki_system)
KEY idx_recalls_action_type (action_type)
KEY idx_recalls_event_time (event_time)
```

#### 字段语义示例

**示例 1**：bk-fe-design 内部 Read 一个 system 维度的 wiki 文件

```
原始 tool_input:
  Read(file_path="/Users/.../bk-fe-knowledge-trade/
                  domain-cashier/system/apps/bk-cashier-sdk/core.md")

写入 wiki_recalls:
  action_type        = "read"
  raw_path           = "/Users/.../domain-cashier/system/apps/bk-cashier-sdk/core.md"
  wiki_relative_path = "domain-cashier/system/apps/bk-cashier-sdk/core.md"
  wiki_domain        = "cashier"           # 去掉 domain- 前缀
  wiki_axis          = "system"
  wiki_system        = "bk-cashier-sdk"
```

**示例 2**：Glob 探查 wiki

```
原始 tool_input:
  Glob(pattern="**/sign-flow.md", path="<wiki_root>/domain-cashier")

写入 wiki_recalls:
  action_type        = "glob"
  raw_path           = "<wiki_root>/domain-cashier/**/sign-flow.md"
  wiki_relative_path = NULL                 # pattern 非具体文件
  wiki_domain        = "cashier"            # 可从 path 参数解析
  wiki_axis          = NULL                  # pattern 跨多个 axis
  wiki_system        = NULL
```

**示例 3**：路径在 wiki_root_path 下，但不在 `domain-*` 子目录里（如读根目录 SUMMARY.md）

```
wiki_relative_path = "SUMMARY.md"
wiki_domain        = NULL                   # 不在某个域下
wiki_axis          = "root"                 # 标记为根维度
wiki_system        = NULL
```

### 3.3 Retention

| 数据 | 保留周期 | 清理方式 |
|---|---|---|
| `sdd_wiki_recalls` | 至少 6 个月 | P0 不清理，参考 `sdd_skill_usages` 档位 |
| `sdd_interaction_tool_calls.skill_usage_id` 字段 | 同 tool_calls 表本身 | 跟随 tool_calls |

## 4. Worker 清洗逻辑

### 4.1 cleanBatch 主流程调整

在现有 `cleanBatch` 末尾追加两步（其余步骤不动）：

```
cleanBatch
├── upsertLogEvents
├── upsertInteractions
├── upsertToolCalls
├── upsertSkillUsages
├── ★ attachSkillUsageToToolCalls               ← 新增（interaction 内推断）
├── ★ attachParentSkillUsageToAgentToolCalls    ← 新增（subagent 从父继承）
├── upsertWorkItems
├── upsertErrors
└── ★ upsertWikiRecalls                         ← 新增
```

**顺序设计**：

- `attachSkillUsageToToolCalls` 必须在 `upsertToolCalls + upsertSkillUsages` 都完成后，才能做归属推断
- `attachParentSkillUsageToAgentToolCalls` 必须在 `attachSkillUsageToToolCalls` 之后，**只**对 `agent_name` 不为 NULL 的 interaction 中 `skill_usage_id IS NULL` 的 tool_call 做继承
- `upsertWikiRecalls` 必须在两步归属之后 + `upsertWorkItems` 之后，才能拿到 `skill_usage_id` 和 `work_item_id` 一起写

### 4.2 `attachSkillUsageToToolCalls` 算法

**输入**：本批次涉及的所有 interactions

**算法**（每个 interaction 独立处理）：

```text
for interaction in batch:
  usages = SELECT id, event_sequence FROM sdd_skill_usages
           WHERE interaction_id = interaction.id
           ORDER BY event_sequence ASC, id ASC

  tool_calls = SELECT id, sequence FROM sdd_interaction_tool_calls
               WHERE interaction_id = interaction.id

  for tc in tool_calls:
    nearest = max(u for u in usages if u.event_sequence <= tc.sequence)
    UPDATE sdd_interaction_tool_calls
       SET skill_usage_id = nearest.id (or NULL)
     WHERE id = tc.id
```

**关键决策**：

- **不递归子 skill**：tc 归属于"事件序号在它之前、最近的"那个 skill_activated 事件，即使该 skill 是另一个 skill 的子调用，也归到自己头上
- **NULL 是合法状态**：极早期 tool_call 出现在第一个 `skill_activated` 之前时，无前置 skill_usage 填 NULL
- **重清洗友好**：UPDATE 写入是幂等的

### 4.2.1 `attachParentSkillUsageToAgentToolCalls` 算法（subagent 继承）

针对 `agent_name` 不为 NULL 的 subagent interaction：上一步 §4.2 算法因为 subagent 内通常没有 `skill_activated` 而归 NULL；这一步从父 turn 继承。

**生产数据已验证**（探查 2026-05-28）：

- subagent dispatcher tool 真名是 `Agent`（不是 `Task`，后者已废弃）
- 但 **`Agent` tool 在数据库中并不可靠**：68 次全局调用中，大量分布在 subagent 自身内（自派子代理）；父 turn 内的 Agent 调用数远低于预期，部分 subagent 的父 turn 在 orphan 桶
- subagent interaction 与父 turn **共享 session_id**，是更稳健的关联依据

**算法**（每个 subagent interaction 独立处理）：

```text
for interaction in batch where agent_name IS NOT NULL:
  # 1. 找父 interaction
  parent = SELECT i' FROM sdd_interactions
           WHERE i'.session_id = subagent.session_id
             AND i'.agent_name IS NULL
             AND i'.started_at < subagent.started_at
           ORDER BY i'.started_at DESC LIMIT 1

  if parent IS NULL:
    continue  # 孤儿 subagent（父 turn 缺失或在 orphan 桶）；保持 skill_usage_id = NULL

  # 2. 找父 turn 在 subagent 触发时刻的归属 skill_usage
  parent_skill_usage = SELECT su FROM sdd_skill_usages
                       WHERE su.interaction_id = parent.id
                         AND su.event_time <= subagent.started_at
                       ORDER BY su.event_sequence DESC LIMIT 1

  if parent_skill_usage IS NULL:
    continue  # 父 turn 在该时刻没有 active skill，无法继承

  # 3. 应用到 subagent 内所有 skill_usage_id IS NULL 的 tool_call
  UPDATE sdd_interaction_tool_calls
     SET skill_usage_id = parent_skill_usage.id
   WHERE interaction_id = subagent.id
     AND skill_usage_id IS NULL
```

**关键决策**：

- **不依赖 Agent tool_call 关联**：用 `(session_id, started_at)` 时序，更稳健
- **孤儿 subagent**（父 turn 找不到）：保持 NULL，dashboard 优雅降级。生产观察约占少数 subagent 实例
- **嵌套 subagent**（subagent 内再派 subagent）：链式继承。第二层 subagent 按算法找父，可能找到第一层 subagent（同 session 中 agent_name 不为 NULL 但 started_at 更早的也可能是父）；本期算法只找 `agent_name IS NULL` 的父，所以第二层 subagent 如果第一层 subagent 是它的真父，会跳过第一层直接继承到第一层的父（顶层）。**这是有意的简化** —— 顶层 skill_usage 仍是正确归属
- **只覆盖 NULL 行**：上一步 §4.2 已给出归属的 tool_call 不再被这一步覆盖



worker 在 `upsertWikiRecalls` step 加载一次用户表（`sdd_users.id → wiki_root_path` 的 map），遍历本批次的 `sdd_interaction_tool_calls`，按 `tool_name` 分支提取候选 path：

| tool_name | 提取规则 | action_type | raw_path 内容 |
|---|---|---|---|
| `Read` | `tool_input.file_path` | `read` | 绝对路径 |
| `Glob` | `tool_input.path` ?? `tool_input.pattern` | `glob` | path 或 pattern |
| `Grep` | `tool_input.path` ?? `tool_input.glob` | `grep` | path 或 glob |
| `Skill` | （本期不识别） | （不写） | — |
| 其他 | — | — | 不写 wiki_recall |

**命中判定**：

```text
1. 从 sdd_interaction_tool_calls.tool_input_preview 解析 JSON
2. 按上表提取候选 path
3. path 归一化：trim 尾部 '/'，resolve '..' 段（path.normalize）
4. 取 tool_call 对应 user 的 wiki_root_path（NULL 则跳过此 tool_call）
5. 判定 path.startsWith(wiki_root_path + '/') 或 path == wiki_root_path：
   - 命中 → 写 sdd_wiki_recalls 行
   - 不命中 → 跳过
```

**注意**：本期 **Skill 子调用** 不写入。原因：子 skill 触发的 wiki Read 已经在子 skill 自己 skill_usage 名下的 Read tool_call 里被记录了，再补一条 skill_subcall 会重复计数。`action_type` 枚举里**预留** `skill_subcall` 值，未来扩展时不动 schema。

### 4.4 `parseWikiPath` 函数

```text
function parseWikiPath(wikiRootPath, rawPath):
  if not rawPath.startsWith(wikiRootPath):
    return { relative: null, domain: null, axis: null, system: null }

  relative = rawPath.slice(wikiRootPath.length).replace(/^\/+/, '')
  segments = relative.split('/')

  # L1: domain
  if segments[0]?.startsWith('domain-'):
    domain = segments[0].slice('domain-'.length)
  else:
    domain = null
    axis = 'root'        # 顶层文件如 SUMMARY.md / CLAUDE.md
    return { relative, domain, axis, system: null }

  # L2: axis
  axis = segments[1] ?? null
  # 不在 schema 层硬约束枚举值，约定值：architecture/business/config/data/system

  # L3: system（仅 axis=system 下有意义）
  if axis == 'system' and segments[2] == 'apps':
    system = segments[3] ?? null
  else:
    system = null

  return { relative, domain, axis, system }
```

**容错策略**：解析任何一步失败都不报错——把该层及之后的字段填 NULL，仍写入 wiki_recall 行（保留 raw_path 以排查）。

### 4.5 `work_item_id` 反查

```text
for each tool_call in batch (matched wiki recall):
  if tool_call.skill_usage_id is not null:
    work_item_id = SELECT work_item_id FROM sdd_skill_usages
                   WHERE id = tool_call.skill_usage_id
  else:
    work_item_id = null
```

**不做更复杂反查**：work_item 已经在 `upsertWorkItems` 里通过 artifact 路径推断；如果 skill_usage 没关联到 work_item，wiki_recall 也保留 NULL 而不硬猜。

### 4.6 `rule_version` 与重清洗

**字段值**：本期写死 `'wiki_recall_v1'`。

**触发重清洗的场景**：

- wiki 目录结构调整（如顶层加 `quality/` axis）→ 改 `parseWikiPath` → 升 `wiki_recall_v2` → 跑 `pnpm db:reclean`
- 新增 wiki_root_path 形态 → 同上
- 添加新工具类型识别（如未来识别 Skill 子调用）→ 同上

**db:reclean 改造**：在 `server/src/infrastructure/mysql/reset-derived-data.ts` 现有清表列表中追加 `sdd_wiki_recalls`。`sdd_interaction_tool_calls.skill_usage_id` 不需要单独清——重清洗会全表重写 tool_calls。

### 4.7 边界情况

| 情况 | 处理 |
|---|---|
| `wiki_root_path` 为 NULL | 跳过该 user 的所有 tool_calls，不写 wiki_recall。dashboard 上这部分用户召回数自然为 0 |
| `tool_input_preview` 被截断（>4KB） | JSON 解析失败 → 跳过该 tool_call，worker 打 warn log |
| `tool_input` 不是合法 JSON | 同上 |
| `Read` 但 `file_path` 是相对路径 | 跳过——Claude Code Read 要求绝对路径，相对路径属于异常上报 |
| 同一 tool_call 重清洗多次 | `recall_key` UNIQUE 幂等 |
| wiki 文件被重命名 | 历史行存老路径、新行存新路径——dashboard 显示成"两个独立文件"。本期不做 rename detection |
| `Agent` dispatcher tool 在父 turn 数据反常（数量远低于预期） | 不依赖该信号；用 `(session_id, started_at)` 父子关联（§4.2.1） |
| `Skill` tool 触发的子 skill | 子 skill 自身仍上报 `skill_activated`；按自身 skill_usage 归属，不需要继承机制 |
| 嵌套 subagent（subagent 派 subagent） | 算法只找 `agent_name IS NULL` 的父；第二层 subagent 会跳过第一层 subagent 直接继承到顶层（有意简化） |
| subagent 的父 turn 在 orphan 桶 | subagent 内 tool_call `skill_usage_id` 保持 NULL；dashboard 优雅降级 |
| `tool_input.file_path` 命中 wiki 但 parseWikiPath 4 维全失败 | 仍写 wiki_recall 行，`wiki_axis='root'`，`wiki_domain/wiki_system` NULL |

### 4.8 性能预算

- 假设：30 人团队、每周 100 work_items、每个 work item 50-200 个 wiki 召回
- 周写入量：5000-20000 行 `sdd_wiki_recalls`
- 年量：25 万-100 万行（轻量级，索引开销可控）
- worker 每 batch 多两步，预计延迟增加 < 10ms

## 5. Dashboard 视图设计

### 5.1 页面位置与路由

新增一级页面，挂在 `sdd/` namespace 下：

```
路由：sdd/wiki-recalls
sidebar 位置：sdd 分组下，放在 sdd/work-items 之后
```

页面内用 **4 个 tab** 组织。每个 tab 独立数据源、独立 query key、独立 loading 状态。Tab 选择 + 时间范围用 React Router `search param` 持久化（`?tab=ranking&range=30d`）。

### 5.2 四个 Tab 视图

#### Tab 1：用户使用排行（默认 tab）

**回答**：谁在用 wiki？用得多深？

| 列 | 字段 |
|---|---|
| 用户名 | `sdd_users.user_name` |
| 召回总次数 | `COUNT(*)` |
| 不同 wiki 文件数 | `COUNT(DISTINCT wiki_relative_path) WHERE action_type='read'` |
| 覆盖 domain 数 | `COUNT(DISTINCT wiki_domain)` |
| 覆盖 system 数 | `COUNT(DISTINCT wiki_system)` |
| 最近召回 | `MAX(event_time)` |
| 是否配 wiki_root_path | `sdd_users.wiki_root_path IS NOT NULL` |

**筛选**：时间范围（7d / 30d / 90d / 全部）；排序键（总次数 / 不同文件数 / 最近活跃）。

**联动**：点击行 → `sdd/users/:id` 用户详情页 + wiki 召回区域（见 5.3）。

#### Tab 2：需求 × wiki 下钻

**回答**：哪个需求在消费 wiki？消费了什么？

| 列 | 字段 |
|---|---|
| 需求 slug / 业务域 | `sdd_work_items.work_item_slug` / `business_domain` |
| 召回总次数 | `COUNT(*)` |
| 覆盖 wiki domain 数 | `COUNT(DISTINCT wiki_domain)` |
| 覆盖 wiki system 数 | `COUNT(DISTINCT wiki_system)` |
| 参与人数 | `COUNT(DISTINCT user_id)` |

**筛选**：时间范围、业务域、参与人。

**特别洞察**：高亮"召回 wiki domain ≠ work_item 业务域"的需求——跨域知识引用信号，说明知识有溢出。

**联动**：点击行 → `sdd/work-items/:id` 详情页 + wiki 召回区域。

#### Tab 3：Wiki 热度榜（资产视角，附属）

**回答**：wiki 库里哪些知识最被消费？

三个并列图表：

| 区域 | 图表 | 数据 |
|---|---|---|
| 上 | 横向柱状图 | 按 `wiki_domain` GROUP BY，按召回次数倒序 |
| 中 | 饼图 + toggle | 按 `wiki_axis` GROUP BY；toggle "按召回次数 / 按读者数" |
| 下 | TOP 10 列表 | 按 `wiki_system` GROUP BY 倒序 |

**只看 `action_type='read'`**：热度榜统计排除 glob/grep 探查事件。

**不做文件级 TOP N**：容易被高频小文件（如 SUMMARY.md）污染。

#### Tab 4：召回时间线

**回答**：最近召回趋势如何？

- X：时间（默认按日，可切按小时）
- Y：召回次数
- 多 series 叠加（chip 切换）：按 `wiki_domain` 或按 `wiki_axis`
- 时间范围筛选

**联动**：点击某一日柱子 → 弹层显示当日该 series 的明细行（user × work_item × wiki_relative_path）。

### 5.3 跨页联动

| 页面 | 改动 |
|---|---|
| `sdd/users/:id`（用户详情页） | 加一个区域"wiki 召回"——展示该用户的 3 维热力（domain × axis × system）+ 最近召回明细列表 |
| `sdd/work-items/:id`（需求详情页） | 加一个区域"wiki 召回"——展示该需求召回的全部 wiki 文件、按 skill_usage 分组 |
| `sdd/interactions`（交互详情的 tool_calls 表格） | 加一列"wiki 召回"标记（icon），命中的 tool_call 标记为"📚"；点击 icon 弹出 wiki_recall 详情 |

跨页联动**不新增页面**，全部是已有页面的 incremental 扩展。

### 5.4 API contract 雏形

放在 `packages/api/src/sdd/wiki-recalls.ts`（新文件），用 Zod 定义：

```text
GET /api/sdd/wiki-recalls/users
  query: { range: '7d' | '30d' | '90d' | 'all', sortBy, page?, pageSize? }
  → { items: UserRankingItem[], total }

GET /api/sdd/wiki-recalls/work-items
  query: { range, businessDomain?, userId?, page?, pageSize? }
  → { items: WorkItemRankingItem[], total }

GET /api/sdd/wiki-recalls/heatmap
  query: { range, groupBy: 'domain' | 'axis' | 'system', metric: 'count' | 'distinct_users' }
  → { buckets: HeatmapBucket[] }

GET /api/sdd/wiki-recalls/timeline
  query: { range, granularity: 'day' | 'hour', groupBy: 'domain' | 'axis' }
  → { points: TimelinePoint[] }

GET /api/sdd/wiki-recalls/list
  query: { workItemId?, userId?, skillUsageId?, range, page?, pageSize? }
  → { items: WikiRecallRow[], total }

GET /api/sdd/wiki-recalls/by-user/:userId/summary       （用于 sdd/users/:id 嵌入）
GET /api/sdd/wiki-recalls/by-work-item/:workItemId      （用于 sdd/work-items/:id 嵌入）
```

所有 list 端点必须支持 server-side 分页。

### 5.5 默认筛选与时间范围

- 默认 range = `30d`
- `range='all'` 直接走 wiki_recalls 全表；后端保护：max page 限制、单次查询 timeout

### 5.6 不做的 UI

- ❌ "wiki 利用率"曲线
- ❌ "死文件清单"
- ❌ "效用"指标（任务 B）
- ❌ wiki 内容预览
- ❌ 实时召回流

## 6. 前置探查、错误处理、观测性、测试

### 6.1 前置数据探查（上线前必跑）

**这步是实施计划的 task 0**。在公司电脑的生产数据库上跑（本地无意义）。

| 探查目标 | SQL 雏形 | 期望 |
|---|---|---|
| @wiki 路径都出现在哪些 tool_name 下 | `SELECT tool_name, COUNT(*) FROM sdd_interaction_tool_calls tc JOIN sdd_interactions i ON i.id=tc.interaction_id JOIN sdd_users u ON u.id=i.user_id WHERE tc.tool_input_preview LIKE CONCAT('%', u.wiki_root_path, '%') GROUP BY tool_name` | 主要分布在 Read/Glob/Grep；如出现意料外的 tool_name 要扩展 matcher |
| Read 的 tool_input 字段名 | `SELECT tool_input_preview FROM sdd_interaction_tool_calls WHERE tool_name='Read' LIMIT 20` | 确认是 `tool_input.file_path` |
| Glob/Grep 在 wiki 下的占比 | 同上 | 评估 glob/grep 在总召回中的比例 |
| `wiki_root_path` NULL 的用户占比 | `SELECT COUNT(*) FROM sdd_users WHERE wiki_root_path IS NULL` | 评估被跳过用户的体量 |
| 单 interaction 内 tool_call 极大数 | `SELECT interaction_id, COUNT(*) FROM sdd_interaction_tool_calls GROUP BY interaction_id ORDER BY 2 DESC LIMIT 10` | 估归属推断的算法复杂度 |

如果探查发现某个工具用了意料外字段名，**先把现实数据补进 spec，再写代码**。

### 6.2 Worker 容错策略

**核心原则**：单条 wiki_recall 失败不影响整批清洗。已有 outbox 机制保证 batch 级幂等，新增 step 只需保证**单行级别的容错**。

| 错误类型 | 处理 |
|---|---|
| `tool_input_preview` JSON 解析失败 | 跳过该 tool_call，worker 打 warn log，continue |
| `wiki_root_path` NULL | 直接跳过该 user 的所有 tool_calls（不打 warn，预期常态） |
| 路径前缀匹配失败 | 静默跳过（绝大多数 tool_call 不命中 wiki） |
| `parseWikiPath` 任一段解析失败 | 写 wiki_recall 行，对应字段 NULL，不报错 |
| `attachSkillUsageToToolCalls` 找不到前置 usage | 写 `skill_usage_id = NULL`，不报错 |
| `sdd_wiki_recalls` INSERT 失败 | 抛出，让 outbox 重试整个 batch |

**事务边界**：`upsertWikiRecalls` 和现有 step 共用同一 batch 事务。新 step 抛出 → 整个 batch rollback → outbox 重排队。

### 6.3 可观测性

worker 每个 batch 处理完后打一行结构化 log：

```json
{
  "batchId": "...",
  "wikiRecallStats": {
    "candidateToolCalls": 42,
    "wikiHits": 8,
    "inserted": 8,
    "parseFailedPartial": 1,
    "skippedWikiRootMissing": 5,
    "skippedInputParseError": 0
  },
  "skillUsageAttachStats": {
    "toolCallsScanned": 42,
    "attached": 38,
    "noPriorUsage": 4
  }
}
```

用现有 logger（pino），不引入新 metric 系统。本期不做专门 worker metric 页面。

### 6.4 测试覆盖

#### 单元测试（worker）

| 测试单元 | 关键 case |
|---|---|
| `parseWikiPath` | 完整 system 文件 / business/pages 文件 / 根目录 SUMMARY.md / 路径不在 wiki 下 / 路径在 wiki 下但首段不是 `domain-*` / 只有 `domain-X` 没下层 / 含 `../` / 尾部带 `/` / 空字符串 |
| `extractCandidatePath`（按 tool_name 提取 path） | Read / Glob / Grep 各种 tool_input 形态；缺字段、空字符串、相对路径 |
| `attachSkillUsageToToolCalls` 范围推断 | 单 skill_usage / 两个 skill_usage 切换 / 没有 skill_usage / tool_call 序号在首个 skill_usage 之前 |
| `upsertWikiRecalls` 幂等 | 同一 tool_call 两次 cleanBatch 结果一致 |

#### 集成测试

- 跑 fixture batch end-to-end 验证 `sdd_wiki_recalls` 写入
- 验证 `pnpm db:reclean` 跑两次结果完全一致（重清洗幂等）

#### 可证伪查询（部署后验证）

| 查询 | 期望 | 失败意味着 |
|---|---|---|
| `SELECT COUNT(*) FROM sdd_wiki_recalls WHERE wiki_system IS NOT NULL AND wiki_axis != 'system'` | 0 | parseWikiPath 一致性 bug |
| `SELECT COUNT(*) FROM sdd_wiki_recalls WHERE action_type='read' AND wiki_relative_path IS NULL` | 0 | Read 必须解析出 relative path |
| `SELECT COUNT(*) FROM sdd_wiki_recalls r LEFT JOIN sdd_interaction_tool_calls t ON r.tool_call_id=t.id WHERE t.id IS NULL` | 0 | 孤儿 wiki_recall（理论不可能） |
| `SELECT COUNT(*) FROM sdd_users WHERE wiki_root_path IS NOT NULL AND id NOT IN (SELECT user_id FROM sdd_wiki_recalls)` | 越小越好 | 有 wiki_root_path 但没召回的用户 |
| `SELECT i.agent_name, COUNT(*) FROM sdd_interaction_tool_calls tc JOIN sdd_interactions i ON i.id=tc.interaction_id WHERE i.agent_name IS NOT NULL AND tc.skill_usage_id IS NULL GROUP BY i.agent_name` | 越小越好 | subagent 父子归属算法失效 |
| `SELECT i.agent_name, COUNT(DISTINCT i.session_id) AS sessions FROM sdd_interactions i WHERE i.agent_name IS NOT NULL GROUP BY i.agent_name` | 显示当前生产 subagent 类型与数量分布 | 验证 subagent 类型符合预期 |

### 6.5 部署顺序与回滚

```
1. 写 migration（加列 + 建新表）→ deploy
2. server / worker 升级到带新 step 的版本 → 重启
3. 跑探查 SQL（6.1），确认数据形态符合假设
4. 跑 pnpm db:reclean 回填历史 wiki_recalls
5. 部署 web 端 dashboard 新页面
6. 跑 6.4 可证伪查询确认数据正确
```

**回滚**：

- worker 新 step 出问题 → 加 env var `WIKI_RECALL_ENABLED=0` 软关闭新 step
- schema 出问题 → `sdd_interaction_tool_calls.skill_usage_id` nullable，不动即可；`sdd_wiki_recalls` 可 truncate
- dashboard 页面有问题 → 路由独立，删除 nav 入口即可

### 6.6 不做的安全措施（避免过度防御）

- ❌ 不做 wiki_root_path SQL 注入防护（已 sanitize，且只用在 LIKE 前缀比较）
- ❌ 不做 wiki 内容敏感性过滤（dashboard 只展示路径）
- ❌ 不做 multi-tenancy 路径隔离（团队内部工具，所有登录成员可见）

## 7. 风险与本期不做事项

### 7.1 已知风险

| 风险 | 影响 | 缓解 |
|---|---|---|
| 数据形态假设错误（Claude Code 不同版本字段名变化） | matcher 漏判，看板数字偏低 | 6.1 前置探查必须先跑 |
| `tool_input_preview` 4KB 截断 | 极端长路径丢失，极小概率 | 监控 `parseFailedPartial` log，若数字大再考虑 |
| `skill_usage_id` 归属在子代理场景下不直观 | "bk-fe-design 召回数"显示为直接调用 + 不含子 skill | spec 已明确：本期只算直接归属 |
| 大量用户 `wiki_root_path` 为 NULL | 看板显示为 0，被误读 | Tab 1 加列"是否配置 wiki_root_path"明示数据状态 |
| wiki 文件重命名 | 历史 + 新行显示为两个独立文件 | 本期不做 rename detection |
| `pnpm db:reclean` 跑历史数据时间 | 数据量大可能要几小时 | 按现有流程操作 |
| schema 与 wiki 结构弱耦合 | wiki 顶层结构若大改需 reclean | spec 已明确 rule_version + reclean 流程 |
| subagent 内 wiki 召回归属（§4.2.1） | 依赖父 turn 与 subagent 共享 session_id；如果 Claude Code 未来改变 subagent 上报机制（不再共享 session_id），算法失效 | spec 已通过 §6.4 可证伪查询监控；失效时 `agent_name IS NOT NULL AND skill_usage_id IS NULL` 计数会显著上升 |

### 7.2 本期明确不做的事项

参见 §1.3，已经一次性列清。

## 8. 任务 B 路线图（展望）

任务 B：**评测有/无 wiki 对 proposal & design 产物的影响**。本期不实施，但在本设计文档里展望路线，避免任务 A 设计阶段做出阻碍 B 的决定。

### 8.1 为什么 B 难——先承认

老板要的是**因果推断**："有 wiki 比没 wiki 产物质量好多少"。生产环境下做不到金标准 RCT：

- **不能强制 A/B**：不可能让某些用户禁用 wiki 来对照
- **confounder 太多**：用户经验、需求难度、prompt 质量、模型版本、skill 版本 全都同时在变
- **"质量"无客观刻度**：proposal 好不好没有 ground truth；评测员之间也会分歧
- **样本量小**：团队 30 人 × 几个月最多几百个需求，做不了高功效的统计检验

**结论**：B 不可能"金标准 RCT 论文级"，能做的是**多策略叠加，给出可信的趋势性证据**。

### 8.2 三种可执行的评测方法（按 ROI 排序）

#### 方法 B-1：生产侧代理指标（持续监控，最快出图）

**核心思路**：在真实生产数据上跑**自动化打分**，不评比"主观质量"，而评比"产物的可观测属性"，配合任务 A 的召回数据做相关性分析。

**候选指标**（不全做，挑 2-3 个）：

| 指标 | 计算方法 | 直觉含义 |
|---|---|---|
| wiki 术语覆盖率 | proposal/design 文本提到的领域术语中，多少出现在用户当时召回的 wiki 内容里 | 召回内容是否被产物吸收 |
| wiki 文件引用追溯 | 文本直接引用 wiki 文件名的次数 | 召回是否变成"看得见的引用" |
| 具体度 | 提到具体函数名 / 文件路径 / 组件名的密度 | 召回多的产物是否更具体 |
| 架构 vs 业务平衡 | 产物涵盖 architecture/business/data/system 4 维的均衡度 | 召回多维 wiki 的产物是否更全面 |

**分析方法**：把"召回了 wiki 的需求"和"没召回 wiki 的需求"分两组比较指标分布。这是相关性，不是因果——但相关性也能给老板一份"我们看到了 X 的趋势"。

**工程量**：3-4 周

**优点**：N 大；持续跑；指标稳定可重复
**缺点**：相关性 ≠ 因果性；指标本身的可解释性需要解释

#### 方法 B-2：离线 counterfactual replay 评测集（最严格的因果识别）

**核心思路**：挑 10-30 个已完成需求，**重新跑两次** proposal/design skill：

- **实验组**：带 wiki context（恢复历史召回的 wiki 文件作为 context）
- **对照组**：不带 wiki context（mock @wiki 召回为空）
- 两组用同一 prompt、同一模型、同一 skill 版本
- 用 LLM-judge 评分（多维 rubric）

**这是 B 唯一能控制 confounder 的方法**：同一 prompt × 同一模型 × 仅"wiki 在不在"这一个变量切换。

**关键依赖**：

- 任务 A 的派生表提供"当时召回了哪些 wiki 文件"
- 一个评测 runner（脚本，跑 skill + 收集产物）
- LLM-judge prompt 工程（多维评分 rubric，需要试错）

**工程量**：4-6 周

- 评测集挑选 + 人工预审：1-2 周
- 评测 runner 工程化：1 周
- LLM-judge prompt + 多轮迭代：1-2 周
- 评测结果可视化看板：1 周

**优点**：confounder 控制；可重复；可纳入 CI 持续跑
**缺点**：N 小（10-30）；LLM-judge 有偏；评测集挑选本身是个 small project

#### 方法 B-3：人工评分（定性补充）

**核心思路**：选 5-10 个真实需求，找 2-3 个资深工程师对产物按统一 rubric 打分（不告诉评测员 wiki 召回情况），事后对照该需求的召回数据。

**工程量**：5-8 周（主要是评测员投入）

**ROI 一般**，建议作为 B-1/B-2 的补充验证。

### 8.3 推荐的 B 阶段化执行顺序

```
B-0：召回 × 产物关联展示（2 周，无评分，纯数据展示）
  └─ 在任务 A 看板上加一个 tab："召回 → 产物"
     展示每个 work_item 的召回内容 + 该需求最终 artifact 的并列视图
     让老板/用户定性看，是 B-1/B-2 的数据基础

B-1：生产侧代理指标（3-4 周）
  └─ 在 B-0 基础上加自动化打分
     可上线后持续运行，给老板看趋势

B-2：离线 counterfactual replay 评测集（4-6 周）
  └─ 严格因果识别
     产出"N 个对照 case 中，有 wiki 在 X 维度得分高 Y%"
     对老板最强的交代

（可选）B-3：人工评分（5-8 周）
  └─ 高成本，作为补充验证
```

**老板沟通策略建议**：先承诺 B-0 + B-1（5-6 周内能出图），把 B-2 作为"严格论证"放到下一季度。

### 8.4 任务 B 对任务 A 的数据依赖

| B 用到的数据 | 来自哪里 | 本期 A 是否提供 |
|---|---|---|
| 每次召回的 wiki 文件路径 + 时间 + 用户 + 需求 + skill | `sdd_wiki_recalls` | ✅ |
| 哪个 skill 召回 → 哪个 artifact 产出 | `skill_usage_id` + `work_item.artifacts` | ✅ |
| proposal / design 产物文本 | `sdd_interaction_texts.response_text` | ⚠️ **30 天后被清** |
| @requirements 仓库里的最终 markdown | git 仓库本身 | ❌ 服务端没有副本 |

### 8.5 任务 B 启动前必须解决的前置

**问题**：`sdd_interaction_texts` 30 天清理。B-2 若用历史 6 个月需求做评测集，**文本已丢**。

三个可选方案（不在本期实施，B 启动时第一个问题就要解决）：

| 方案 | 实施成本 | 长期影响 |
|---|---|---|
| (a) 服务端 git clone @requirements 仓库读 markdown | 中（需要仓库访问权限） | 一劳永逸 |
| (b) 改 retention，把 proposal/design 类 artifact 关联的 interaction text 长期保留 | 小 | 数据库增长 |
| (c) `sdd_work_item_artifacts` 加 `content_snapshot LONGTEXT` 字段 | 中（worker 改造） | 与 git 后续修改不一致 |

### 8.6 任务 B 下一轮 brainstorming 该问什么

留给 B brainstorming 解决：

1. 评测哪些 skill 的产物：proposal 和 design？还是包括 task / codereview？
2. "质量"维度的 rubric：业务正确性 / 工程一致性 / 完整度 怎么权衡？
3. 代理指标 vs 严格评测的优先级：B-1 先还是 B-2 先？
4. artifact 文本保留方案：8.5 三选一
5. LLM-judge 用哪个模型 + 是否引入第二个 judge 做交叉验证

## 附录 A：术语表

| 术语 | 含义 |
|---|---|
| @wiki | Claude Code `settings.json` 中 `pathAliases.@wiki` 指向的本地知识库目录（git 仓库 `bk-fe-knowledge-trade` 的 clone） |
| @requirements | 同上，指向 `bk-fe-requirements-trade`，存放各需求过程文档（proposal.md / design.md / tasks.md） |
| wiki_root_path | `sdd_users.wiki_root_path` 字段，存放上报用户的 @wiki 绝对路径 |
| 召回（recall） | bk-fe 系列 skill 通过 Read/Glob/Grep 等工具读取 @wiki 下文件的行为 |
| 召回宽度 | 召回了多少次 / 多少不同文件 / 跨多少 domain（本期目标） |
| 召回效用 | 召回内容是否真正影响了产物质量（本期不做，任务 B 处理） |
| work_item | 一个需求，对应 @requirements 下日期-slug 命名的目录 |
| artifact | 需求目录下的过程文档，如 proposal.md / design.md / tasks.md |
| skill_usage | 一次 SDD skill 调用（如一次 `bk-fe-design`） |
| interaction | 一次 prompt/response 交互（一个 turn） |
| axis | wiki 的二级维度：architecture / business / config / data / system / root |
| system | wiki 第三级维度，仅 `axis=system` 下有，对应一个代码仓库（如 `bk-cashier-sdk`） |

## 附录 B：本设计的关键决策回顾

brainstorming 过程中讨论过的关键决策点：

| 决策点 | 选择 | 理由 |
|---|---|---|
| 任务 A 和 B 排期 | A 先做扎实，B 留下一轮 | B 方法论模糊，需要单独 brainstorming |
| 看板叙事视角 | 用户/需求维度 + 召回质量与效用 主导，wiki 资产冷热附属 | 老板想看人/需求；wiki 资产冷热作为补充 |
| 效用判定 | 本期不做，整体留给 B | 现有数据基础先建好 |
| "召回"工具范围 | Read / Glob / Grep / Skill 都算（用 action_type 字段区分） | 覆盖完整 |
| 数据架构 | 派生表 + 通用化 `tool_calls.skill_usage_id` | 性能、扩展性；通用基础设施溢出价值 |
| wiki 4 维物化 | 物化 3 个稳定维度（domain / axis / system），其余前端解析 | 平衡耦合与查询性能 |
| 子 skill 归属 | 只算直接召回，不递归累计 | 简单、可解释；未来需要时加 parent_usage_id |
| git clone wiki 仓库 | 不做 | 死文件 ROI 低；高频热点不依赖 |
| 通用化是否做完整 incremental 应用（如 skill 工具画像） | 只做字段，不做新视图 | scope 控制；未来 1-3 天/项 incremental |

---

**下一步**：本设计完成后，使用 `superpowers:writing-plans` skill 把本 spec 转成可执行的实施计划。
