# sdd-telemetry vs. Langfuse 对标分析

更新时间：2026-05-21
作者：limengdufe
范围：当前 sdd-telemetry 实现 vs. Langfuse 开源最佳实践。聚焦两件事：
1. 当前实现里硬性的逻辑 bug 或路线错位
2. Langfuse 哪些功能贴合 SDD 监控的核心痛点、当前还没有

---

## 一、Langfuse 核心模型速览（对照锚点）

| 概念 | Langfuse | 当前 sdd-telemetry 对照物 |
| --- | --- | --- |
| **Trace** | 一次用户请求（一个 prompt → 多次 LLM/tool/sub-agent 调用），唯一 `traceId` | `sdd_interactions` 一行 |
| **Observation** | trace 内的一个 span（GENERATION/TOOL/SPAN/AGENT/EVALUATOR…），用 `parentObservationId` 形成树 | `sdd_interaction_tool_calls` 拍平表（无 parent） |
| **Session** | 多个 trace 通过 `sessionId` 形成的会话 | `sdd_interactions.session_id` 字段（没有独立表） |
| **Score** | 给 trace/observation 打分（人工 / LLM-as-judge / API），用于评估质量 | **无** |
| **Dataset / Experiment** | 用同一组测试用例多次跑同一 prompt/skill，对比产出 | **无** |
| **Prompt management** | 中心化、版本化、label-based 发布、客户端缓存 | sdd-telemetry 不管理 prompt，本身不需要 |
| **Annotation queue** | 把 trace 派给人工 reviewer 打分 | **无** |
| **Models table** | 内置 model 名→单价映射，服务端自算 cost | **无**，cost 完全依赖 Claude Code 上报 |

> Langfuse 用 ClickHouse 列存做主存储（trace/observation/score），Postgres 存配置；sdd-telemetry 全用 MySQL。规模不是当前痛点，可以不动。

---

## 二、Logs vs Traces：两条 OTel 通路的本质差异

理解为什么 sdd-telemetry 清洗层会踩 B1/B2/B3/B6 这一类坑，需要先看清当前采用的 OTel logs 通路与 Langfuse 接收的 traces 通路在数据模型上的根本差异。

### 数据模型对比

| 维度 | Logs（当前 sdd-telemetry） | Traces（Langfuse 接收） |
| --- | --- | --- |
| OTel signal | `logs` — `LogRecord` 列表 | `traces` — `Span` 树 |
| 单条记录 | `{timestamp, severity, body, attributes}` | `{spanId, parentSpanId, startTime, endTime, attributes, events[]}` |
| 时间模型 | 单时刻 | 内生 `endTime - startTime` = wall-clock duration |
| 父子关系 | 也有 `trace_id` / `span_id`，但 spec 不强制结构，需清洗层重建 | spec 强制 `parentSpanId`，原生树形 |
| 默认 flush | 5 s/批 | 5 s/批（span 在 endTime 时入队） |
| 适合表达 | 离散事件流（"X 发生了"） | 有起止的操作（"X 持续了多久，包含哪些子操作"） |

### Claude Code 上报内容差异

**Logs 通路（默认开）：21 种 event**

```
user_prompt, tool_result, tool_decision, api_request, api_error,
api_request_body, api_response_body,     ← 完整 LLM 请求/响应 JSON 只在这条通路
skill_activated, mcp_server_connection, hook_*, plugin_*,
permission_mode_changed, auth, at_mention, compaction, ...
```

**Traces 通路（需 `CLAUDE_CODE_ENHANCED_TELEMETRY_BETA=1`）：6 种 span**

```
claude_code.interaction              (root: 一次 user prompt)
├── claude_code.llm_request          (每次 Anthropic API 调用)
├── claude_code.tool                 (每次工具调用)
│   ├── claude_code.tool.blocked_on_user   (权限等待)
│   └── claude_code.tool.execution         (实际执行)
└── claude_code.hook                 (hook 执行)
```

关键不对称：

- `api_request_body` / `api_response_body`（完整 LLM 请求响应 JSON）**只在 logs 通路**。Traces 用 GenAI semantic convention 把 prompt/response 拆到 span attributes 和 span events 里，不带 raw body。
- `plugin_*` / `skill_activated` / `auth` / `at_mention` / `permission_mode_changed` / `hook_registered` **只在 logs 通路**。Traces 只覆盖 interaction / llm / tool / hook 执行链。
- 精确父子关系**只在 traces 通路原生可得**；logs 通路虽然每条 event 都有 `trace_id` / `parent_span_id` 字段，但要在清洗层自己拼。

### 对 sdd-telemetry 清洗的影响

把第三节的 bug 按通路重新映射，可以看出哪些是"logs 路线注定要做的工作"，哪些是清洗层做错的：

| Bug | Logs 路线 | Traces 路线 |
| --- | --- | --- |
| B1 interaction key 退化为 session | 必须自己推断 interaction 边界，所以有 fallback；改成 unknown 桶即可 | trace_id 强绑定，没这个概念 |
| B2 duration_ms 用 sum 不是 wall-clock | event 只有点时间，要从多个 event 推 duration | span 内生 wall-clock |
| B3 跨 batch 拉同 session 重算 | event 流水必须跨 batch 配对 | span 在 SDK 里组装完整树才发，服务端不用跨 batch 拼 |
| B6 subagent / 嵌套 tool 父子丢失 | trace_id / parent_span_id 已在 `otel_log_events`，下游表没用上 | 原生父子，Langfuse trace tree 一行代码不写就有 |
| B7 tool_call_count 用 tool_result 计数偏低 | result 异步可能未到 | 一个 tool span = 一次调用 |
| B9 没有 cost 自算兜底 | 一样要做 | 一样要做（Langfuse 用 model registry 兜底） |

### Skill 上报的特例

dashboard 想统计「哪个 bk-fe-xxx skill 被用了多少次 / 哪些是用户主动触发」时，两条通路差异如下：

| 字段 | logs（`skill_activated` event） | traces（`claude_code.tool` span） |
| --- | --- | --- |
| `skill_name` | ✅ | ✅（需 `OTEL_LOG_TOOL_DETAILS=1`） |
| `invocation_trigger`（`user-slash` / `claude-proactive` / `nested-skill`） | ✅ | ❌ |
| Langfuse UI 里 skill 是不是一等概念 | — | ❌ 显示为普通 `tool: Skill` 节点 |

也就是 traces 能告诉你"调用了 bk-fe-task"，但告诉不了你"是用户主动 `/bk-fe-task` 还是 Claude 自主判断要用"。`invocation_trigger` 恰好是 SDD 监控里区分「用户养成 SDD 习惯」vs「Claude 自动帮用户走 SDD 流程」的关键字段。

### 结论：为什么继续走 logs

- **Logs 通路** = 事件流水账，灵活、能塞业务字段（work_item / skill / artifact 都依赖这种灵活），但调用结构要清洗层自己重建。
- **Traces 通路** = 调用树，结构和时序原生正确，LLM 标准语义现成，但表达力被 6 种 span 限制，业务维度（plugin / skill / auth / at_mention 等 event）不可得。

sdd-telemetry 的独特价值在 SDD 业务维度上，logs 路线本身是合理选型。当前问题在清洗层"重新发明了一遍 trace tree"，做得不如 OTel spec 完善。借鉴 Langfuse 的 observation 模型（见 B6），**继续在 logs 通路上做**，比换到 traces 通路更贴合 SDD 监控需求。

如果未来需要现成的 trace tree 可视化 / LLM 观测语义做对照，可以**平行**导出一份 traces 到 Langfuse（见末节客户端配置），不必替换 logs 通路。

---

## 三、硬性 bug / 路线错位（按严重度排序）

### B1【严重】interaction 聚合的 fallback key 是 session，会把整个 session 砸成一行

`worker/src/jobs/cleaning-worker.ts:1106-1116`：

```ts
function interactionKeyForEvent(event: EventRow): string {
  if (event.prompt_id) {
    return sha256(`prompt:${event.prompt_id}`);
  }
  if (event.session_id) {
    return sha256(`session:${event.session_id}`); // ← fallback 退化为 session 维度
  }
  return '';
}
```

**问题链路**：
- 在 Claude Code 里，一个 session 包含**多次 user_prompt**（用户来回提问）。每次 prompt 在 langfuse 里对应一个独立的 trace。
- 当某些事件没采集到 `prompt_id`（hook 事件、init 事件、或部分跨 batch 到达的 tool_result），就走 session fallback。
- 这部分事件**会被合并进 key=session:X 的同一行 interaction**。
- 然后 `extractTier1Metrics` 用 `sumRowNumbers` 对所有 api_request 的 `cost_usd / input_tokens / output_tokens / duration_ms` 累加 → 这一行 interaction 的 cost 实际是"该 session 内所有未配对 prompt 的 cost 之和"。
- 配合 `loadScopedEvents` 用 `session_id IN (...)` 把跨 batch 的同 session 历史事件也拉回来重算 + `GREATEST` 合并 → 这行 session-fallback interaction 会**持续膨胀**，看起来像"一个 turn 跑了几十次 LLM、累计成本几十美金"。

**对照 langfuse**：langfuse 的 trace 是用客户端生成的 `traceId` 强绑定，根本不会出现 fallback 到 session 维度。

**修复方向**：
1. 不再 fallback 到 session。`prompt_id` 缺失就**单独建一行 unknown interaction**（key 用 `event_id` 或 `batch_id + sequence`），让"未配对事件"留在原 batch，不要污染会话维度。
2. 把 `pairing_method` 加上 `unpaired`，让 dashboard 能看到这种数据质量问题。
3. 长期：上报端确保所有 LLM/tool 相关事件都带 `prompt_id`（Claude Code 的 prompt_id 在 user_prompt → api_request → tool_use 链路应是稳定的）。

### B2【严重】interaction.duration_ms 用 sum，不是 wall-clock

`cleaning-worker.ts:956`：

```ts
durationMs: sumRowNumbers(events, ['duration_ms', 'duration.ms']),
```

一个 turn 内 5 个 api_request，每个 1s，**sum = 5s**。但用户体感是 wall-clock（startedAt → completedAt）。

代码下面有 fallback：`tier1Metrics.durationMs ?? fallbackDurationMs`，但只在 sum 是 null 时才用 wall-clock。默认走 sum。

**对照 langfuse**：observation duration = endTime - startTime（单 span 自己的 wall clock）；trace duration = trace 整体 wall clock。从不 sum。

**修复方向**：
- `duration_ms` 改为 `completedAt - startedAt`（wall clock）
- 另加一列 `total_llm_duration_ms` 存 sum，用于"LLM 累计耗时占比"分析
- 两者意义不同，分开存

### B3【严重】跨 batch loadScopedEvents 用 session_id 拉历史事件，污染面太大

`cleaning-worker.ts:240-261`：

```ts
if (sessionIds.length > 0) {
  clauses.push(`session_id IN (${sessionIds.map(() => '?').join(',')})`);
  params.push(...sessionIds);
}
```

清洗 batch X 时，会把数据库里**所有同 session_id 的历史 events** 一起拉进来重算 interaction。

风险：
1. 量级失控：一个长 session 可能有几千条 event，单 batch 清洗时间拉长。
2. 配合 B1，这些历史事件如果有 prompt_id 缺失的，会持续累积到 `session:X` 的 fallback 行。
3. 重算用 `GREATEST` 合并，导致旧 batch 已经写过的 interaction 在新 batch 处理时被反复刷新；如果 cost/token 有了新值，`GREATEST` 取大没问题，但 `tool_call_count = GREATEST(values, current)` 在工具被回滚时会留陈旧值。

**修复方向**：
- loadScopedEvents 只跨 batch 拉 `prompt_id IN (...)`（用于 prompt 跨 batch 配对），**不要用 session_id 跨 batch 拉**。session 在分析层 SQL 里聚合，不在清洗层。
- 或者用 `prompt_id IS NOT NULL` 限制 session 拉取范围（只把同 session 同 prompt 的事件带回来）。

### B4【中】upsertSkillUsages 的 work_item_id update WHERE 太宽

`cleaning.repository.ts:709-730`：

```sql
UPDATE sdd_skill_usages
SET work_item_id = ?
WHERE session_id = ?
  AND raw_skill_name = ?
  AND (work_item_id IS NULL OR work_item_id = ?)
  AND (? IS NULL OR event_time IS NULL OR event_time <= ?)
```

同一 session 内同一 skill 调用多次（譬如 bk-fe-design 在同 session 里跑两次给两个不同需求写 design.md），这条 UPDATE 会**把所有满足条件的行都更新成最新一个 artifact 的 work_item_id**。

**修复方向**：
- WHERE 加上 `prompt_id = ?`（要求 prompt_id 必须存在）
- 或者用 `id = (SELECT id FROM sdd_skill_usages WHERE ... ORDER BY event_time DESC LIMIT 1)`，只更新最近一条
- 长期：从拍平的 link 改为"artifact 写入事件 → 找 prompt_id 同的最近 skill_usage"严绑

### B5【中】MultiEdit / 嵌套工具的 artifact 写入识别会漏

`otel-extractor.ts:213-239` `extractArtifactFromToolResult`：

```ts
function hasWritableContentField(input: Record<string, unknown>): boolean {
  return hasOwn(input, 'content') || hasOwn(input, 'new_string');
}
```

只识别 Write 的 `content` 和 Edit 的 `new_string`。**MultiEdit 工具的 `edits` 数组里每个有 `new_string`，但顶层没有**，会漏识别。

**修复方向**：
- 加 `hasOwn(input, 'edits')` 判定（MultiEdit）
- 加 NotebookEdit 工具的字段判定（`new_source`）
- 长期：跟 Claude Code OTel 字段表对齐，列一份"算作写入"的工具白名单

### B6【中】嵌套 Agent / 子 sub-agent 的父子关系全部丢失

Claude Code 的 `Agent` 工具会 spawn 子 agent；子 agent 又会有 LLM 调用和 tool 调用。当前 sdd-telemetry：
- 子 agent 的事件可能有不同的 `prompt_id`（subagent 自己的 prompt 上下文）
- 但**和父 agent 之间的父子关系没存**

`otel_log_events.trace_id` / `span_id` 字段已经存了，但下游 interaction / tool_call 表里**完全没用 trace_id / span_id / parent_span_id**。

**对照 langfuse**：observation 用 `parent_observation_id` 形成完整树。trace tree view 是 langfuse 的核心可视化。

**修复方向**：
- `sdd_interactions` 加 `parent_interaction_id`（subagent → 主 agent）
- `sdd_interaction_tool_calls` 加 `parent_tool_call_id`（tool 嵌套调用）
- 利用 OTel 已有的 `parent_span_id` 关系做配对（清洗时填）

### B7【小】interaction.tool_call_count 用 tool_result 计数，tool_result 缺失时偏低

`cleaning-worker.ts:1057-1071` `countToolCalls` 只数 `tool_result`。如果 `tool_decision` 已到、`tool_result` 还在路上（异步、跨 batch），这次工具调用就不被统计。

`sdd_interaction_tool_calls` 表是按 `tool_use_id` upsert 的，**实际工具调用数**应该用 `SELECT COUNT(*) FROM sdd_interaction_tool_calls WHERE interaction_id = ?`。

**修复方向**：interaction.tool_call_count 改为按 `tool_use_id` 集合去重计数（不要求 result 必到），或者在 SQL 层直接 join 算。

### B8【小】isNamedEvent 用 `endsWith('_api_request')` 太宽松

`cleaning-worker.ts:1101-1104`：

```ts
function isNamedEvent(event: EventRow, expectedName: string): boolean {
  const normalized = normalizeEventName(event.event_name);
  return normalized === expectedName || normalized.endsWith(`_${expectedName}`);
}
```

`endsWith('_api_request')` 会命中 `something_api_request`、`xxx_yyy_api_request`。当前 Claude Code 事件名都是 `claude_code.<name>`，但任何第三方 OTel 推过来的事件名只要后缀对就被识别。

**修复方向**：白名单 prefix（`claude_code.` 或固定字典），不要 endsWith 兜底。

### B9【小】cost 完全依赖上报，没有自算兜底

当 `OTEL_LOG_RAW_API_BODIES=1` 没开、或 Claude Code 上报字段变化时，cost_usd 拿不到。无 model pricing 表做兜底。

**对照 langfuse**：`models` 表存 model 名 + 单价，cost = input_tokens × input_price + output_tokens × output_price + cache 相关。

**修复方向**：建 `model_pricings` 表，清洗时如果 `cost_usd` 缺失但 tokens 在，自己算。

### B10【路线】没有 score / 评估维度

当前的 `pairingSuccessRate` 是基于"是否 status='failed'"，**不是 SDD 工作流产出质量**。但 SDD 监控的真正价值在于：

- design.md 质量打分（结构完整？覆盖关键决策？）
- tasks.md 质量打分（颗粒度合理？依赖识别准？）
- proposal.md 质量打分（多方案对比？trade-off 清楚？）

这些 langfuse 用 Score 表 + Eval template + Annotation queue 完整支撑。**sdd-telemetry 当前完全没有**，dashboard 看到的"覆盖率 / 漏斗"都是 quantitative，缺 qualitative。

### B11【路线】sessions 不是一等公民

当前 session_id 只是 interactions 表的一个字段，没有独立 `sdd_sessions` 表。

Langfuse 把 session 单独建表，存 session 维度的 metadata（bookmark / tag / annotation queue 关联），并在 UI 里有 "Sessions" tab 让你以会话维度浏览。

**对 SDD 的意义**：一个开发者完成一个需求的整套 SDD 流程（proposal → design → tasks → code → review）是**多个 prompt 的 session**，按 session 看比按 prompt 看更贴近"用户使用 SDD 的工作流"。当前 work_item 是按文档路径推断的，没和 session 强绑定。

---

## 四、Langfuse 中贴合 SDD 监控核心痛点的功能

按"对 SDD 监控的价值"从高到低排：

### 🟢 高价值（建议直接对标实现）

#### 1. Score + Annotation queue → SDD 文档质量评估

**痛点**：当前 dashboard 能看到"用户跑了 50 次 bk-fe-design"，但**完全不知道这 50 个 design.md 写得好不好**。漏斗指标（promptCoverageRate / pairingSuccessRate）是"采集质量"，不是"产出质量"。

**Langfuse 怎么做**：
- `scores` 表：score 挂在 trace/observation 上，多维度（accuracy / faithfulness / structure_completeness 等）
- `annotation_queues`：把 trace 派给 reviewer 人工打分
- `eval_templates` + `job_configurations` + `job_executions`：定义 LLM-as-judge 模板（"这个 design.md 是否覆盖了模块/数据模型/API/状态流/错误处理？逐项打分"），自动跑

**落到 SDD**：
- 加 `sdd_scores` 表：`(interaction_id, work_item_artifact_id, score_name, value, source: human|llm_judge|rule)`
- 配 4-5 个 rubric template：design 完整度、tasks 颗粒度、proposal 方案对比深度…
- 每次 artifact 写入 → 自动 enqueue eval → LLM-as-judge 打分 → 落到 `sdd_scores`
- Dashboard 多一个 tab："SDD 文档质量趋势"

这是 sdd-telemetry **从"采集观测"升级到"质量监控"**的关键一跃。

#### 2. Trace tree（嵌套 observation）→ subagent 调用链可视化

**痛点**：开发者跑 `/ultrareview` 或者 bk-fe-design 调 Plan agent 时，**子 agent 调用细节当前完全不可见**（被拍平在主 interaction 里）。

**Langfuse 怎么做**：observation 用 `parent_observation_id` 形成树；UI 有 "Trace graph view" 把整棵调用树渲染出来。

**落到 SDD**：
- `sdd_interactions` 加 `parent_interaction_id`（subagent 关系）
- `sdd_interaction_tool_calls` 加 `parent_tool_call_id`（嵌套 tool）
- 详情页画树（react-flow / mermaid）

技术上不难，OTel 已经有 trace_id/parent_span_id 信息，只是清洗时没用。

#### 3. Datasets + Experiments → SDD skill 回归测试

**痛点**：当前没法证明"新版 bk-fe-design skill 比旧版好"。改了 skill prompt 之后无法量化对比。

**Langfuse 怎么做**：
- 上传一组 dataset items（输入：需求描述；期望输出：合格 design.md 的 rubric）
- 创建 dataset run（指定 prompt 版本 + model），系统自动对每个 item 跑一遍
- 跑完每个 trace 自动评估，dashboard 对比两个 run 的平均分

**落到 SDD**：
- 收集一组"已确认高质量"的过去需求 → 当 golden dataset
- 改 skill 之后跑 dataset → 对比旧版评分
- 也能做 model A/B（claude-opus-4-7 vs claude-sonnet-4-6 处理 SDD 任务的对比）

这是个**中等优先级**功能：要做但不是 P0，等 score 系统建好之后再叠加。

#### 4. Sessions 一等公民 + work_item 强绑定

**痛点**：work_item（需求）当前是从文档路径反推的，不是从 session 主动绑定。如果某个 session 不写文档（譬如只跑 codereview），就没法挂到 work_item。

**Langfuse 怎么做**：session 单独表，trace 引用 sessionId。UI 有 Sessions 列表，能看到"这个 session 走完了 SDD 哪几步"。

**落到 SDD**：
- 建 `sdd_sessions` 表：`(session_id, user_id, first_seen_at, last_seen_at, primary_work_item_id, primary_business_domain, ...)`
- 推断 primary_work_item：session 内 artifact 写入最多的 work_item
- Dashboard 加 Sessions tab，按会话粒度看 SDD 完整链路（漏斗就有了"个体 session 视角"）

#### 5. Audit logs → semantic 配置变更追溯

**痛点**：`sdd_skill_semantics` 是配置表，谁加了/删了什么 alias 没有记录。多人协作时容易撕。

**Langfuse 怎么做**：`audit_logs` 表统一记录配置变更。

**落到 SDD**：建 `sdd_audit_logs` 表，semantic CRUD 接口的 controller 写日志。Day 1 工作量极小。

### 🟡 中价值（看演进节奏）

#### 6. Comments on traces → SDD 协作

团队里 leader 想对某次 design.md 留言（"这次设计的数据模型有问题"），可以挂到 trace。Langfuse 有 `comments` 表。SDD 当前没有协作维度，但部署到公司后会需要。

#### 7. Tags 系统 → 灵活筛选

Langfuse 的 tag 是字符串数组，filter 可以按任意 tag 组合。当前 sdd-telemetry 的筛选维度都是预定义字段（semantic / status / user）。tag 提供逃生口。

#### 8. Public API + SDK → 客户端规范化

Langfuse 提供 Python/TS SDK 用于自己埋点。SDD 当前完全靠 Claude Code OTel 自然发射，没有自定义 SDK。但如果未来想加"用户主动标记"或"自定义 trace"，需要这层。

### 🔴 低价值或不适用

- **Prompt management**：sdd-telemetry 不管理 prompt（用户的 prompt 由 Claude Code 控制）。跳过。
- **LLM playground**：sdd-telemetry 不是开发工具。跳过。
- **Models registry**：可以借鉴小部分做 cost 兜底（见 B9），但不需要完整 model registry。
- **Batch exports**：当前 dashboard 已经能查看；导出功能不紧急。
- **Multi-tenancy / RBAC**：单租户场景，跳过。
- **Webhook / Slack 集成**：不紧急。

---

## 五、落地建议优先级

按 ROI 排序，建议分三批：

### P0（修 bug，2-3 天）
1. **B1**：interaction 不再 fallback 到 session，建独立 unknown 桶
2. **B2**：duration_ms 改为 wall-clock，sum 改名 total_llm_duration_ms
3. **B3**：loadScopedEvents 不要用 session_id 跨 batch 拉
4. **B4**：linkSkillUsageToWorkItem 收紧 WHERE 条件
5. **B7**：tool_call_count 改用 tool_use_id 集合计数

### P1（功能补齐，1-2 周）
6. **B6** + Langfuse #2：嵌套 observation 模型，trace tree 可视化
7. Langfuse #4：sdd_sessions 独立表 + Sessions tab
8. **B9** + Langfuse 部分 model registry：cost 自算兜底
9. **B5**：MultiEdit / NotebookEdit 写入识别

### P2（核心增值，2-4 周）
10. **Langfuse #1**：Score + Annotation queue + LLM-as-judge eval → SDD 文档质量监控
11. **Langfuse #3**：Datasets + Experiments → SDD skill 回归测试
12. **Langfuse #5**：Audit logs

---

## 六、需要进一步验证的事

跑一遍下面这两个查询，确认 B1 严重程度：

```sql
-- 1. interaction 里有多少是用 session fallback 配对的（pairing_method = 'session_window'）
SELECT pairing_method, COUNT(*) FROM sdd_interactions GROUP BY pairing_method;

-- 2. 用 session fallback 的 interaction 平均聚合了多少 event / 多少 cost / 多少 tool_call
SELECT pairing_method,
       AVG(llm_call_count) avg_llm,
       AVG(tool_call_count) avg_tool,
       AVG(cost_usd) avg_cost,
       MAX(cost_usd) max_cost
FROM sdd_interactions
GROUP BY pairing_method;
```

如果 `session_window` 那行的 avg_llm 和 max_cost 明显高，就是被砸进同一桶的证据。

---

## 七、附：Langfuse 平行上报客户端配置（可选验证用）

如果想用 Langfuse 现成的 trace tree view / GenAI 观测能力对照自家实现，可以让 Claude Code 客户端**同时**导出一份 traces 到 Langfuse，不替换 logs 通路。注意：

- Langfuse 只接 traces 和 metrics，**不接 logs**（看 `web/src/pages/api/public/otel/v1/`：只有 `traces/` 和 `metrics/`，没有 `logs/`）。
- 这条路必须开 `CLAUDE_CODE_ENHANCED_TELEMETRY_BETA=1`，否则 Claude Code 不发 spans。
- logs 通路保持不变，继续上报 sdd-telemetry 自己的 ingest endpoint，两条通路互不冲突。

最小客户端环境变量：

```bash
export CLAUDE_CODE_ENABLE_TELEMETRY=1
export CLAUDE_CODE_ENHANCED_TELEMETRY_BETA=1
export OTEL_TRACES_EXPORTER=otlp
export OTEL_EXPORTER_OTLP_PROTOCOL=http/protobuf      # Langfuse 也支持 http/json
export OTEL_EXPORTER_OTLP_TRACES_ENDPOINT=https://<your-langfuse-host>/api/public/otel/v1/traces

# Basic Auth：pk-lf-... / sk-lf-... 在 Langfuse Project Settings → API Keys 里建
export OTEL_EXPORTER_OTLP_TRACES_HEADERS="Authorization=Basic $(echo -n 'pk-lf-xxx:sk-lf-xxx' | base64)"

# 内容开关（OTEL_LOG_TOOL_CONTENT 必须开 tracing 才生效，logs-only 时无效；
# 见 CLAUDE.md「不要在无 traces ingest 的情况下要求开启 OTEL_LOG_TOOL_CONTENT」）
export OTEL_LOG_USER_PROMPTS=1
export OTEL_LOG_TOOL_DETAILS=1
export OTEL_LOG_TOOL_CONTENT=1
export OTEL_LOG_RAW_API_BODIES=1     # thinking 内容任何配置都无法回来，永久脱敏

export OTEL_RESOURCE_ATTRIBUTES="service.name=claude-code,deployment.environment=dev,user.name=loomisli"
```

Cloud demo 路径：`https://cloud.langfuse.com` 注册免费账号 → 建项目拿 pk/sk → 端点用 `https://cloud.langfuse.com/api/public/otel/v1/traces`。

自托管入口：langfuse 仓库根目录 `docker-compose.yml` 已包含可跑的全栈最小集（Postgres + ClickHouse + Redis + MinIO + web + worker），用于本地起一份 Langfuse 平行接收。
