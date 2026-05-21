# 修复 interaction 聚合 fallback 到 session 维度

更新时间：2026-05-21
作者：limengdufe

## 1. 问题

`sdd_interactions` 的语义是一行代表一次 user prompt 到一次完整响应。旧实现里，
`prompt_id` 缺失时会用 `session_id` 生成 interaction key：

```ts
prompt_id 存在 -> sha256("prompt:" + prompt_id)
prompt_id 缺失 -> sha256("session:" + session_id)
```

这会把同一 Claude Code session 里的多轮 prompt 压成同一行，导致
`cost_usd`、tokens、`llm_call_count`、`tool_call_count`、`duration_ms`、
`prompt_text`、`response_text` 全部失真。`loadScopedEvents` 再按 session 跨 batch
拉历史事件时，这个 session 桶会持续吸附旧事件，污染会越来越大。

## 2. 目标

1. 彻底移除 session fallback，不再生成 `pairing_method='session_window'`。
2. 有可信锚点的缺 `prompt_id` 事件回填到正确 prompt。
3. 没有可信锚点的事件只保留在 `otel_log_events`，标记 orphan，不写入 `sdd_interactions`。
4. 当前代码未上线，不做 legacy 展示和兼容；存量开发数据从 `otel_raw_payloads` 重置派生表后重清洗。

## 3. 分桶规则

优先级如下：

1. `event.prompt_id` 存在：
   - `interaction_key = sha256("prompt:" + prompt_id)`
   - `pairing_method = 'prompt_id'`

2. `event.prompt_id` 缺失，但 `trace_id` 能唯一映射到一个 prompt：
   - 使用该 prompt 的 key
   - `pairing_method = 'anchored_by_user_prompt'`
   - anchor 查询只读取同 trace 且 `prompt_id IS NOT NULL` 的事件，并要求该 trace 只对应一个 prompt。

3. `event.prompt_id` 缺失，且同 session 内存在不晚于该事件的最近 `user_prompt` anchor：
   - 使用 anchor 的 `prompt_id`
   - `pairing_method = 'anchored_by_user_prompt'`
   - anchor 查询只读取同 session 的 `prompt_id IS NOT NULL` 事件，并只把 anchor 用于回填；不会把整段 session events 拉进 interaction group。

4. 找不到 trace 或 user_prompt anchor：
   - 不写入 `sdd_interactions`
   - 在 `otel_log_events.attributes_json` 写入 `sdd.orphan_reason = 'no_prompt_anchor'`

## 4. 实现范围

### worker

- `loadScopedEvents` 只按 `batch_id` 和 `prompt_id IN (...)` 拉完整 prompt，不再按 `session_id` 拉整段历史。
- 新增 `loadTraceAnchorEvents`，仅为缺 `prompt_id` 的 scoped events 查询同 trace 的 prompt anchor。
- 新增 `loadSessionAnchorEvents`，仅为缺 `prompt_id` 的 scoped events 查询同 session 的 prompt anchor。
- `computeInteractionAssignments(events, additionalAnchorEvents)` 生成：
  - `groupsByKey`：真正要写入 `sdd_interactions` 的事件组
  - `eventToKey`：tool calls、skill usages、errors 反链 interaction 时复用
- 只有组内包含直接 `prompt_id` 事件时才 upsert `sdd_interactions` 主行；anchored-only 组只查已有 interaction id 做反链，避免 late tool_result 把 status/text 覆盖成 partial/null。
- orphan events 只标记事件层，不污染派生 interaction。

### API / server / web

- `SddInteractionItem.pairingMethod` 只暴露：
  - `prompt_id`
  - `anchored_by_user_prompt`
- Interactions 列表和 Row Inspector 展示 pairing method。
- 不新增 `includeLegacy`，不做 `session_window_legacy` 过滤；当前阶段通过重清洗消除旧派生数据。

### 本地存量重清洗

新增脚本：

```bash
pnpm db:reset-derived
pnpm --filter @sdd-telemetry/worker once
```

`db:reset-derived` 会保留 `otel_raw_payloads` 和 `otel_ingest_batches`，清空
`otel_log_events` 与 SDD 派生表，重置 batch 状态，并重新写入 `clean_batch` outbox。

## 5. 验收

1. `sdd_interactions.pairing_method` 不再出现 `session_window`。
2. 同一 session 多个 prompt 会生成多行 interaction。
3. 缺 `prompt_id` 但有 trace/user_prompt anchor 的事件挂到正确 interaction。
4. 无 anchor 的事件不会进入 interaction，只在 `otel_log_events` 标记 orphan。
5. `pnpm --filter @sdd-telemetry/worker test -- test/interaction-assignment.test.ts` 通过。
6. `pnpm typecheck` 和 `pnpm build` 通过。

---

## 6. 2026-05-21 追加：覆盖前原文恢复

说明：这一节用于恢复本轮实现前被覆盖掉的原始设计内容。后续对本文档的更新只追加，不删除、不改写既有段落。

# 修复 B1：interaction 聚合 fallback 到 session 维度导致数据失真

更新时间：2026-05-21
作者：limengdufe
关联文档：[Langfuse 对标分析](./proposal-langfuse-comparison.md)（B1 出处）

---

## 1. 背景与目标

### 1.1 现象

清洗 worker 把 OTel events 聚合成 `sdd_interactions` 时，对于 `prompt_id` 缺失的事件，
**会把整个 session 内的所有未配对事件砸成同一行 interaction**，
导致 `cost_usd` / `tokens` / `llm_call_count` / `duration_ms` 跨 prompt 累加，
`prompt_text` 和 `response_text` 错配。

这条 fallback 路径与业界标准（Langfuse 的 trace 模型）不一致：
Langfuse 的 trace 用客户端生成的 `traceId` 强绑定，永远不会退化到 session 维度。

### 1.2 目标

1. 终结 session-fallback 路径，让每行 `sdd_interactions` 严格对应"一次 user prompt → 一次完整响应"
2. 已经被错误聚合的历史数据要么修复要么显式标记，不让用户误用
3. 修复后 dashboard 的核心指标（`cost_usd`、`pairingSuccessRate`、`interactionCount`）回归可信
4. 整个修复过程不引入新破坏：worker 行为变化要可观测、可回滚

### 1.3 非目标

- 不做 trace tree（嵌套 observation）改造 — 留给 B6 单独立项
- 不做 cost 自算兜底 — 留给 B9 单独立项
- 不修 `duration_ms = sum` 的 B2 — 单独 PR 并行，本次不耦合

---

## 2. Bug 原因

### 2.1 触发链路

```
Claude Code OTel payload
  └─ extractOtelLogEvents → 抽出 ExtractedLogEvent[]
       └─ persistCleanedData / upsertInteractions
            └─ groupInteractionEvents
                 └─ interactionKeyForEvent  ← 根因在这里
                      ├─ event.prompt_id 存在 → sha256("prompt:" + prompt_id)
                      └─ event.prompt_id 缺失 → sha256("session:" + session_id)  ← 走这一支就翻车
```

代码：`worker/src/jobs/cleaning-worker.ts:1106-1116`

```ts
function interactionKeyForEvent(event: EventRow): string {
  if (event.prompt_id) {
    return sha256(`prompt:${event.prompt_id}`);
  }

  if (event.session_id) {
    return sha256(`session:${event.session_id}`);  // ← B1 根因
  }

  return '';
}
```

### 2.2 根因

设计上把 `interaction` 定义为"一次 prompt → 一次完整响应"，
但实现却允许 `session` 当 fallback 主键。
两个维度强行共享 `interaction_key`，破坏了表的语义不变量。

Claude Code 的 session 包含多个 user prompt（用户来回提问），
应该对应**多行** interaction，而不是 1 行。

### 2.3 加剧因素

1. **跨 batch 拉历史事件**：`loadScopedEvents` 用 `session_id IN (...)` 把同 session 历史 events 全捞回来重算（`cleaning-worker.ts:240-261`），导致 session 桶持续吸附旧数据
2. **GREATEST upsert 合并策略**：cost/tokens 用 `GREATEST(VALUES, current)` 合并（`cleaning.repository.ts:374-379`），session 桶里的指标只增不减，越跑越大
3. **下游零消费 `pairing_method`**：`pairing_method='session_window'` 字段写了，但 grep 全项目（server/web/worker）零 SQL 引用，dashboard 无法过滤掉低置信度行
4. **某些事件类型天然没有 `prompt_id`**：
   - session start / setup / hook 事件
   - 跨 batch 到达的孤儿 `tool_result`（外层 batch 已 parsed）
   - 旧版 Claude Code 字段名变更导致 `pickString` 双 key 兜底失败的事件

---

## 3. 定位

### 3.1 代码位置

| 文件 | 行号 | 角色 |
| --- | --- | --- |
| `worker/src/jobs/cleaning-worker.ts` | 1106-1116 | `interactionKeyForEvent` — fallback 根源 |
| `worker/src/jobs/cleaning-worker.ts` | 263-380 | `upsertInteractions` — 聚合循环 |
| `worker/src/jobs/cleaning-worker.ts` | 929-965 | `extractTier1Metrics` — sum 计算 |
| `worker/src/jobs/cleaning-worker.ts` | 240-261 | `loadScopedEvents` — 跨 batch 拉取（B3） |
| `worker/src/jobs/cleaning-worker.ts` | 337 | `pairingMethod: promptId ? 'prompt_id' : 'session_window'` |
| `worker/src/jobs/cleaning.repository.ts` | 374-379 | `greatestNullableSql` upsert 合并 |

### 3.2 受污染字段（直接来自聚合）

| `sdd_interactions` 字段 | 计算方式 | 失真模式 |
| --- | --- | --- |
| `cost_usd` | sum(api_request 们) | 高估为"全 session 未配对成本之和" |
| `input_tokens` / `output_tokens` / `cache_*` | sum | 同上 |
| `llm_call_count` | apiRequestEvents.length | 高估到 session 总数 |
| `tool_call_count` | distinct tool_use_id | 跨 prompt 累计 |
| `duration_ms` | sum | 高估（叠加 B2） |
| `started_at` / `completed_at` | min / max | 横跨整个 session 时间窗 |
| `command_name` | pickFirst(user_prompt 们) | 取一个，丢失多 skill 信息 |
| `skill_name` | pickLast | 同上 |
| `status` | 最后一个 terminal event | 多 prompt 时只反映最后一个 turn |

`sdd_interaction_texts` 表：
- `prompt_text` 取第一个 user_prompt 的文本
- `response_text` 取第一个 api_response_body 的文本
- **如果它们来自不同 turn，prompt 和 response 错配**

---

## 4. 影响分析

### 4.1 受影响的 API / 页面

| API / 页面 | 失真指标 | 用户感知 |
| --- | --- | --- |
| `/api/sdd/overview` | 总成本（如后续加入）会高估 | KPI 偏离真值 |
| `/api/sdd/funnel` `callQuality` | `totalInteractions` 偏低；`pairedCount` / `withPromptCount` / `withResponseCount` 失真 | 配对率"看起来低"，实际是数据被压扁 |
| `/api/sdd/skill-analytics` `kpis` | `interactionCount` 低估；`pairingSuccessRate` 失真 | HeroKpiRow 同比/环比错乱 |
| `/api/sdd/interactions` 列表 | 每行 `costUsd` / `llmCallCount` / `durationMs` 失真 | 用户误以为某行是 outlier |
| `/api/sdd/interactions/:id` Row Inspector | `prompt_text` 与 `response_text` 错配 | **最严重**：误导排错 |
| `/api/sdd/interactions/:id/tool-calls` | 时间线包含多 turn 工具调用 | 看起来"一个 turn 调 30 次工具" |
| `/api/sdd/users` | `interactionCount` 严重低估（session 折叠） | 活跃度看不到 |
| `/api/sdd/work-items/:id` | 关联 interactions 数偏低 | 需求维度统计失真 |
| `/api/sdd/errors` | `interaction_id` 挂错到 session 桶 | 错误归因错位 |
| sdd_skill_usages.interaction_id | usage 关联到 session 桶 | 下钻"这次 skill 的 LLM 细节"拿到全 session |

### 4.2 量级评估查询（先跑这套确认严重度）

```sql
-- Q1. fallback 行占比
SELECT pairing_method, COUNT(*) AS n,
       ROUND(100.0 * COUNT(*) / SUM(COUNT(*)) OVER (), 2) AS pct
FROM sdd_interactions
GROUP BY pairing_method;

-- Q2. fallback 行的离群度
SELECT pairing_method,
       COUNT(*) AS rows,
       ROUND(AVG(llm_call_count), 1) AS avg_llm,
       MAX(llm_call_count) AS max_llm,
       ROUND(AVG(tool_call_count), 1) AS avg_tool,
       ROUND(AVG(cost_usd), 4) AS avg_cost,
       ROUND(MAX(cost_usd), 4) AS max_cost,
       ROUND(AVG(TIMESTAMPDIFF(SECOND, started_at, completed_at)), 1) AS avg_wall_secs
FROM sdd_interactions
WHERE started_at IS NOT NULL AND completed_at IS NOT NULL
GROUP BY pairing_method;

-- Q3. session 桶里是否混了多个 prompt_id（错配实锤）
SELECT i.id, i.session_id, COUNT(DISTINCT e.prompt_id) AS distinct_prompt_ids
FROM sdd_interactions i
JOIN otel_log_events e
  ON e.session_id = i.session_id
  AND e.prompt_id IS NOT NULL
  AND e.event_time BETWEEN i.started_at AND i.completed_at
WHERE i.pairing_method = 'session_window'
GROUP BY i.id, i.session_id
HAVING distinct_prompt_ids > 1
LIMIT 20;
```

**判定阈值**：
- Q1 `session_window` 占比 > 5% → 必修
- Q2 `session_window` 行的 `max_cost` 显著高于 `prompt_id` 行 → 失真已生效
- Q3 有非空结果 → prompt/response 错配实锤

---

## 5. 修复方案

### 5.1 目标态

```text
事件分桶决策（优先级从高到低）：

1. event.prompt_id 存在
   → interaction_key = sha256("prompt:" + prompt_id)        【主路径】
   → pairing_method = 'prompt_id'

2. event.prompt_id 缺失 但 session_id 存在
   → 在当前 scopedEvents 内，按 (session_id, event_sequence) 找
     时间上不晚于本事件的最近一个 user_prompt（同 session）
   → 借用该 user_prompt 的 prompt_id 做 key                  【锚点回填】
   → pairing_method = 'anchored_by_user_prompt'

3. 既无 prompt_id，又找不到 user_prompt 锚点
   → 不写入 sdd_interactions                                 【孤儿】
   → 事件仍保留在 otel_log_events（证据基石），
     metadata 加 'sdd.orphan_reason' = 'no_prompt_anchor'

4. event 本身就是 user_prompt 但没有 prompt_id（理论不应发生）
   → 不写入 sdd_interactions
   → 记录 cleanings.last_error 用于排查
```

### 5.2 关键设计取舍

| 取舍点 | 选择 | 理由 |
| --- | --- | --- |
| 孤儿事件是否单独建一行 interaction | **不建** | 避免 dashboard 列表噪声；孤儿事件量通常很小，留在 otel_log_events 可查即可 |
| 锚点回填是否跨 batch | **不跨** | 在 scopedEvents 内回填即可。跨 batch 一并解决 B3 |
| 是否给 `pairing_method` 加新枚举 | **加 `'anchored_by_user_prompt'`** | 让 dashboard 能区分纯净配对 vs 锚点回填的置信度 |
| 历史脏数据是否一律 reprocess | **分两类**：7 天内 reprocess，7 天外打 quarantine tag 不展示 | raw_payloads 7 天 TTL，超出无法重放 |

### 5.3 改动清单

#### 5.3.1 worker 包

**a) `interactionKeyForEvent` 改造**（cleaning-worker.ts:1106-1116）

新签名：`interactionKeyForEvent(event, anchors)`，anchors 来自当前 scopedEvents 预扫一遍得到的 `Map<sessionId, Array<{eventSequence, promptId}>>`。

```ts
type SessionPromptAnchor = { eventSequence: number; promptId: string; eventTime: Date | null };
type SessionAnchorIndex = Map<string, SessionPromptAnchor[]>; // session_id → 升序锚点

function buildSessionAnchorIndex(events: EventRow[]): SessionAnchorIndex {
  // 只收 user_prompt 事件 + 同时有 session_id + prompt_id
  // 按 event_sequence 升序
}

function interactionKeyForEvent(
  event: EventRow,
  anchors: SessionAnchorIndex,
): { key: string; pairingMethod: 'prompt_id' | 'anchored_by_user_prompt' } | null {
  if (event.prompt_id) {
    return { key: sha256(`prompt:${event.prompt_id}`), pairingMethod: 'prompt_id' };
  }


  if (!event.session_id || event.event_sequence == null) return null;
  const sessionAnchors = anchors.get(event.session_id) ?? [];
  // 二分找 ≤ event.event_sequence 的最大锚点
  const anchor = findLatestAnchorBefore(sessionAnchors, event.event_sequence);
  if (!anchor) return null;

  return {
    key: sha256(`prompt:${anchor.promptId}`),
    pairingMethod: 'anchored_by_user_prompt',
  };
}
```

**b) `groupInteractionEvents` 适配**

返回类型变成 `Map<key, { events: EventRow[]; pairingMethod: 'prompt_id' | 'anchored_by_user_prompt' }>`，
丢弃 `key === ''` 的孤儿。

**c) `upsertInteractions` 取 pairingMethod 来源**

不再写死 `promptId ? 'prompt_id' : 'session_window'`，
改为采用 group 里多数事件的 pairingMethod（如果同 key 既有 prompt_id 直绑、又有锚点回填的事件，pairing_method = 'prompt_id'，因为锚点回填的事件本来就属于这个 prompt）。

**d) `loadScopedEvents` 收紧（顺手修 B3）**

去掉 `session_id IN (...)` 子句，只保留 `batch_id = ?` 和 `prompt_id IN (...)`：

```ts
const clauses = ['batch_id = ?'];
const params: Array<string | string[]> = [batchId];

if (promptIds.length > 0) {
  clauses.push(`prompt_id IN (${promptIds.map(() => '?').join(',')})`);
  params.push(...promptIds);
}
// 不再追加 session_id IN (...)
```

**e) 孤儿事件标记**

`upsertLogEvent` 已存 `attributes_json`，在清洗阶段如果识别为孤儿，
往 `attributes_json` 注入 `'sdd.orphan_reason': 'no_prompt_anchor'`，方便 Ops 查询：

```sql
SELECT COUNT(*) FROM otel_log_events
WHERE JSON_EXTRACT(attributes_json, '$."sdd.orphan_reason"') = 'no_prompt_anchor';
```

#### 5.3.2 数据库 schema

**migration `1779000000000-pairing-method-enum-expand.ts`**：

```sql
-- 不强约束（字段已是 VARCHAR(64)），但更新 README/database-model.md 文档
-- 把历史 'session_window' 行标记为 quarantine，方便 dashboard 默认过滤
UPDATE sdd_interactions
SET pairing_method = 'session_window_legacy'
WHERE pairing_method = 'session_window';
```

不引入新字段、不动表结构。

#### 5.3.3 server 包（API 口径调整）

| 接口 | 改动 |
| --- | --- |
| `/api/sdd/funnel` callQuality | WHERE 加 `pairing_method <> 'session_window_legacy'`，让漏斗指标只看新逻辑数据 |
| `/api/sdd/skill-analytics` kpis | 同上 |
| `/api/sdd/interactions` 列表 | 新增 query 参数 `includeLegacy=false`（默认）；前端表格加 "数据质量" 列展示 pairingMethod |
| `/api/sdd/users` | interactionCount 子查询加 `pairing_method <> 'session_window_legacy'` |
| `/api/sdd/work-items/:id` | 关联 interactions 时同上过滤 |

#### 5.3.4 web 包

| 页面 | 改动 |
| --- | --- |
| InteractionsPage 列表 | 加"配对方式"列：`prompt_id` / `anchored_by_user_prompt` / `session_window_legacy`；默认筛掉 legacy |
| HeroKpiRow | KPI 数字下加小字"已排除旧版聚合"（仅当历史有 legacy 数据时显示） |
| Row Inspector | pairingMethod 显示在元数据区，`anchored_by_user_prompt` 时小字提示"该 turn 通过 user_prompt 锚点回填" |

#### 5.3.5 文档

- `docs/database-model.md`：更新 `sdd_interactions.pairing_method` 枚举说明
- `docs/api-contract.md`：funnel/callQuality/skillAnalytics 接口加 legacy 排除说明
- `README.md`：无需改动

### 5.4 数据迁移策略

**前提**：raw_payloads 默认 7 天 TTL，最多回放 7 天内数据。

**步骤**：

1. **新逻辑上线（worker 部署）前**：
   - 在 MySQL dump 一份 `sdd_interactions` / `sdd_interaction_texts` / `sdd_interaction_tool_calls` 现状作为 backup
   - 跑 migration 把存量 `session_window` 改名为 `session_window_legacy`（仅改 tag，不删数据）

2. **新逻辑上线后**：
   - 找出 7 天内所有 `pairing_method = 'session_window_legacy'` 的 batch_id（通过 `source_batch_id` 字段或 evidence_json）
   - 逐个走 `POST /api/ingest/batches/:batchId/reprocess` 重新清洗
   - reprocess 接口已存在（api-contract.md §4.5），需保证它能"先清理旧的派生数据再重写"，不会留脏

3. **reprocess 完之后**：
   - Q1/Q2 查询应显示 `session_window_legacy` 数量大幅下降
   - 残余 legacy 行（来自 7 天外的 batch）保留，但 dashboard 默认不展示

4. **30 天后**：
   - 残余 legacy 行的 `sdd_interaction_texts` 自然过期（30 天 TTL）
   - 可考虑手动 DELETE 残余 legacy `sdd_interactions` 行；或保留作为历史档案，依靠 pairing_method tag 排除即可

### 5.5 兼容性 / 过渡期共存

新旧 `pairing_method` 共存在表里，**通过 tag 严格区分**：

- `prompt_id`（新逻辑产物，正常） ✓ 默认展示
- `anchored_by_user_prompt`（新逻辑产物，置信度稍低） ✓ 默认展示
- `session_window_legacy`（旧逻辑产物） ✗ 默认排除
- `session_window`（不应再出现）→ 上线后此 tag 必须为空，可作为回归监控信号

---

## 6. 测试 / 回归

### 6.1 单元测试（worker/src/jobs/__tests__/cleaning-worker.test.ts，新增 / 扩展）

| 用例 | 期望 |
| --- | --- |
| `interactionKeyForEvent` — event 有 prompt_id | 返回 `{ pairingMethod: 'prompt_id' }` |
| `interactionKeyForEvent` — event 无 prompt_id 但同 session 有 user_prompt 锚点 | 返回锚点的 prompt_id + `'anchored_by_user_prompt'` |
| `interactionKeyForEvent` — event 无 prompt_id 且无锚点 | 返回 null |
| `groupInteractionEvents` — 跨 prompt session 多个 turn | 产出多个 group，每个 group 只含 1 个 prompt 的事件 |
| `groupInteractionEvents` — session 含孤儿事件 | 孤儿事件不进任何 group |
| `extractTier1Metrics` — 对单 prompt 内 N 个 api_request | cost 正确 sum（这部分不变） |
| `loadScopedEvents` 不再用 session_id 跨 batch 拉 | SQL 不含 session_id IN |

### 6.2 集成测试（fixture）

构造三个 OTel payload fixture（放在 `worker/__tests__/fixtures/`）：

1. **single-prompt.json**：1 session × 1 prompt × N api_request × M tool_use
   - 期望：1 行 interaction，cost = sum，tool_call_count = M
2. **multi-prompt.json**：1 session × 3 prompts × 各自 api_request
   - 期望：3 行 interaction，**互不污染**，每行 cost 独立
3. **missing-prompt-id.json**：1 session × 2 prompts，其中第 2 个 prompt 的 tool_result 缺 prompt_id
   - 期望：2 行 interaction，tool_result 被锚点回填到第 2 个 prompt
4. **orphan-only.json**：session 内只有 hook 事件，无 user_prompt
   - 期望：0 行 interaction，事件在 otel_log_events 标记 orphan

跑 `pnpm --filter @sdd-telemetry/worker test`。

### 6.3 在线回归（部署到 dev 后）

按顺序跑：

```bash
# 1. 启动服务
docker compose up -d mysql
pnpm db:migrate
pnpm dev

# 2. 让 Claude Code 跑一段时间，产生新 batch（或者拿历史 7 天内 batch reprocess）
curl -X POST http://localhost:4318/api/ingest/batches/<batchId>/reprocess

# 3. 验证 Q1/Q2/Q3 查询
mysql -e "SELECT pairing_method, COUNT(*) FROM sdd_interactions GROUP BY pairing_method"
# 期望：session_window 数量为 0；session_window_legacy 数量 = 跑 migration 前的值；
#       prompt_id + anchored_by_user_prompt 增加

# 4. 抽查若干 interaction，确认 cost 不再异常
mysql -e "SELECT id, pairing_method, cost_usd, llm_call_count, tool_call_count
          FROM sdd_interactions
          ORDER BY cost_usd DESC LIMIT 20"

# 5. 访问 dashboard
open http://localhost:5173/sdd/interactions
# 检查：列表里没有 pairing_method='session_window_legacy' 行（已被过滤）；
#       每行 cost / llm_call_count / tool_call_count 在合理区间
```

### 6.4 关键 KPI 对比表

reprocess 完之后，从 `Q1` / `Q2` 输出对比：

| 指标 | 修复前 | 修复后期望 |
| --- | --- | --- |
| `interactionCount`（API: skill-analytics.kpis） | 偏低 | **升高**（同 session 多 prompt 不再折叠） |
| `pairingSuccessRate` | 失真（因 session 桶 status 错乱） | 回归到真实水平 |
| `interactions` 最大 `cost_usd` | 异常大（几十美金） | 收敛到单 prompt 合理范围（通常 < $1） |
| `interactions` 平均 `llm_call_count` | 偏高 | 收敛到单 turn 合理值（通常 1-10） |
| `users` 表 `interactionCount` | 严重低估 | **大幅升高** |

### 6.5 性能回归

- 单 batch 清洗耗时：因 `loadScopedEvents` 不再跨 session 拉历史，**应下降** —— 用 `otel_ingest_batches.parse_duration_ms` 对比上线前后均值
- worker tick 吞吐：不应变化

---

## 7. 上线与回滚

### 7.1 上线顺序

1. **PR 1 — schema migration** (`1779000000000-pairing-method-enum-expand.ts`)：
   - 把存量 `session_window` 重命名为 `session_window_legacy`
   - 单独一次 migration，可独立部署
2. **PR 2 — worker 行为变化**：
   - `interactionKeyForEvent` 改造 + `loadScopedEvents` 收紧 + 孤儿事件标记
   - 加单元测试
   - 部署后新 batch 自动走新逻辑
3. **PR 3 — server API 加 legacy 过滤**：
   - funnel / skill-analytics / users / work-items 加 WHERE 子句
   - 加 `/api/sdd/interactions?includeLegacy=true` query 参数
4. **PR 4 — web 加配对方式列 + 默认过滤 legacy**：
   - InteractionsPage 列表
   - Row Inspector 显示 pairingMethod
5. **批量 reprocess**：
   - 7 天内 `session_window_legacy` 的 batch 走 reprocess
   - 监控 ingest queue 健康度

### 7.2 回滚预案

| 触发条件 | 回滚步骤 |
| --- | --- |
| PR 2 上线后 worker 抛错率升高 | revert PR 2，session_window_legacy 行保留不动 |
| reprocess 后某些 batch 数据丢失 | 从 PR 1 之前 dump 的 backup 恢复 3 张表 |
| dashboard 指标突变让团队不适应 | 临时把 server 过滤 WHERE 注掉，回到"展示所有" |

每个 PR 都可独立 revert，不存在多 PR 强耦合。

### 7.3 监控信号

部署后持续观察 7 天：

```sql
-- 信号 1：新逻辑 pairing_method 分布
SELECT pairing_method, COUNT(*) FROM sdd_interactions
WHERE gmt_create > NOW() - INTERVAL 1 DAY
GROUP BY pairing_method;
-- 期望：session_window=0；session_window_legacy 只在 reprocess 期间下降；
-- prompt_id 占绝大多数；anchored_by_user_prompt 占小比例（5-15%）

-- 信号 2：孤儿事件比例
SELECT COUNT(*) FROM otel_log_events
WHERE gmt_create > NOW() - INTERVAL 1 DAY
  AND JSON_EXTRACT(attributes_json, '$."sdd.orphan_reason"') IS NOT NULL;
-- 期望：占日 events 数 < 10%。如果显著高于 10%，说明 Claude Code 端 prompt_id 上报有问题，
-- 不是 sdd-telemetry 的 bug

-- 信号 3：worker tick 健康
SELECT AVG(parse_duration_ms), MAX(parse_duration_ms)
FROM otel_ingest_batches
WHERE parse_completed_at > NOW() - INTERVAL 1 DAY;
-- 期望：avg / max 不上升（因 loadScopedEvents 收紧反而应下降）
```

---

## 8. 验收标准

修复完成的判定：

1. ✅ `SELECT COUNT(*) FROM sdd_interactions WHERE pairing_method = 'session_window'` 为 0（新逻辑下不应再产生）
2. ✅ Q3 错配查询（5.x 节）返回空集
3. ✅ Q2 中 `prompt_id` / `anchored_by_user_prompt` 行的 max_cost、avg_llm_call_count 落到合理区间（max_cost < $1，avg_llm < 10）
4. ✅ Funnel `pairingSuccessRate` 在仪表盘上稳定（不再因 session 桶 status 波动）
5. ✅ InteractionsPage 列表里能看到"配对方式"列，能筛选 legacy
6. ✅ 所有单元测试 + 集成测试 + `pnpm typecheck` + `pnpm build` 通过
7. ✅ 监控信号连跑 7 天稳定

---

## 9. Open Questions

需要在动手前与团队对齐：

1. **legacy 数据保留多久**：本文档默认 30 天后自然消亡（依赖 sdd_interaction_texts TTL），是否需要更激进地 DELETE？
2. **`anchored_by_user_prompt` 是否默认展示**：当前方案是默认展示（因置信度仍较高），但若严苛些可考虑加灰色 tag 提示
3. **reprocess 批量化**：当前 reprocess 接口是单 batch，是否要加 `/api/ops/reprocess-legacy-batches` 一键批量？
4. **是否同步修 B2 (`duration_ms` sum)**：本文档说不耦合 B2，但 B2 修法极小（一行代码），是否顺手在同一 PR 修了？建议**还是分开**，便于回滚定位

---

## 10. 2026-05-21 追加：当前实现口径

用户已明确当前代码未上线，不要求向后兼容，存量数据可以从原始日志重清洗。因此实际实现采用文档开头的无 legacy 方案：

1. 不新增 `session_window_legacy` migration，不提供 `includeLegacy` 查询参数。
2. `pairing_method` 只保留 `prompt_id` / `anchored_by_user_prompt`。
3. 存量开发数据通过 `pnpm db:reset-derived` 保留 raw payload、清空事件层和 SDD 派生表，再跑 worker 重清洗。
4. 本节之前恢复的原文保留为评审上下文，不再删除或改写。

---

## 11. Follow-up TODO（架构评审产出，2026-05-21）

`dfda83a` 修复在原 design 基础上做了 4 处升级（三级锚点 / 跨 batch 精准拉锚点 / 双键比较 / pairingMethod 取置信度下界），整体架构超出原设计预期。评审仍发现 4 个非阻塞瑕疵，挂在这里作为 P2 follow-up：

### TODO 11.1 `pairing_method` 拆分 L2 / L3 两个 tag

**问题**：当前 `anchored_by_user_prompt` 同时覆盖两种来源：

- **L2**：通过 `trace_id` 借用同 trace 唯一的 `prompt_id`（OTel 协议层关联，置信度接近直绑）
- **L3**：通过 `session_id + (sequence, time)` 时序回填（推测时间窗，置信度中等）

两者在 dashboard 上看不出差异，无法区分"高置信度 anchored"和"兜底 anchored"。

**建议**：拆分为：
- `anchored_by_trace`（L2）
- `anchored_by_session_window`（L3）

**影响范围**：
- `worker/src/jobs/cleaning-worker.ts` — `interactionKeyForEvent` 三个分支分别返回不同 tag
- `packages/api/src/contracts/sdd.contract.ts` — `pairingMethod` 枚举扩展
- `web/src/pages/sdd/interactions/InteractionsPage.tsx` — `formatPairingMethod` 加两个 case
- worker 单元测试需要补 L2 路径覆盖

### ~~TODO 11.2 L2 silent fallback 加可观测性~~ ✅ 已完成 2026-05-21

**问题**：`buildTracePromptIndex` 只在"trace 唯一对应一个 prompt_id"时启用 L2 锚，
跨多个 prompt 的 trace 会 silent 退化到 L3，没有日志/metric，排查盲点。

**实现方案**：
- `buildTracePromptIndex` 返回值升级为 `{ index, skippedMultiPromptTraceIds }`，
  纯函数仍然 side-effect-free
- `InteractionAssignments` 透传 `skippedMultiPromptTraceIds: string[]`
- `persistCleanedData` 检测到非空数组时 `logger.warn`，结构化字段：
  `{ batchId, skippedTraceIds, skippedCount }`
- 测试覆盖：`worker/test/interaction-assignment.test.ts` 加 2 个用例
  （同 trace × 多 prompt → 跳过；正常 trace → 列表为空）

**改动落点**：
- `worker/src/jobs/cleaning-worker.ts`：~30 行（含注释）
- `worker/test/interaction-assignment.test.ts`：~60 行（含 2 用例）

**验证**：worker typecheck 通过、测试 18/18（原 16 + 新 2）。

### TODO 11.3 补集成测试 fixture

**问题**：当前 `worker/test/interaction-assignment.test.ts`（304 行）覆盖了核心分桶逻辑的单元测试，但 design §6.2 提议的 4 个端到端 OTel payload fixture 没落地：

1. `single-prompt.json`：1 session × 1 prompt × N api_request × M tool_use
2. `multi-prompt.json`：1 session × 3 prompts × 各自 api_request
3. `missing-prompt-id.json`：1 session × 2 prompts，部分事件缺 `prompt_id` 验证锚点回填
4. `orphan-only.json`：session 内只有 hook 事件、无 user_prompt 验证孤儿路径

**风险**：未来 Claude Code OTel payload 结构变化时（譬如新 event 类型、attribute key rename），单元测试可能仍过但端到端断裂。

**建议**：在 `worker/test/integration/` 下补 4 个 fixture + 端到端集成测试。需要 MySQL，可挂 `test:integration` script。

### TODO 11.4 孤儿事件量级在 dashboard 主路径可见

**问题**：孤儿事件标 `sdd.orphan_reason='no_prompt_anchor'` 在 `otel_log_events.attributes_json`，但 dashboard 主路径看不见。当前只能写 SQL 手动查：

```sql
SELECT COUNT(*) FROM otel_log_events
WHERE JSON_UNQUOTE(JSON_EXTRACT(attributes_json, '$."sdd.orphan_reason"')) = 'no_prompt_anchor';
```

**风险**：Claude Code 上报字段变化时（譬如某次升级让 `prompt_id` 上报覆盖率突降），sdd-telemetry 这边只会看到 anchored / orphan 增多，但没有自动告警。

**建议**：
- 在 `/api/ingest/health` 接口加 `orphanRate` 字段（孤儿事件占该窗口总事件比例）
- 或在 Ops 页加"孤儿事件趋势"卡片
- 阈值告警：日孤儿率 > 10% 时显式标红

---

以上 4 项作为 P2 follow-up，单独立项跟进，不阻塞 B1 修复上线。
