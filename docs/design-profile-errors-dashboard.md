# Profile 异常分析看板设计

## 背景

现有四个 profile 看板已经从 OTel 日志清洗到 `profile_*` 投影表读取业务事实，但异常只停留在描述和局部详情里。老板视角需要看到“用户在真实工作流里哪里失败了”，优先覆盖知识库读取失败、过程文档读写失败、代码操作失败、工具调用失败、模型/API 异常。

## 决策

1. 异常看板放在 profile 看板组内，顶部 profile 切换会改变异常面板数据。
2. 看板只展示当前 profile 内用户可行动失败；平台 ingest、worker、projection 自身异常不进入本页。
3. 所有业务归类走 `profile.errorRules` 配置，禁止按具体 profileId 或业务路径硬编码。
4. `errorRules` 只描述异常分类、展示和启用范围；来源语义复用现有 `sourceRules` 和 `profile_source_matches`。
5. 不做模糊/session-window 异常归因。工具失败只允许同 tool_call 的 source match 归类；模型/API 失败只允许同 interaction 已被当前 profile facts 覆盖。
6. 不展示失败率，避免不清楚分母。看板只展示数量、影响用户、影响交互、最新时间和证据。

## 异常分类

首期固定五类 category，displayName/severity 可配置：

- `knowledge_read_failed`：失败工具调用关联的 source match 命中 `category=knowledge`。
- `process_doc_access_failed`：失败工具调用关联的 source match 命中 `category=process_doc`。
- `code_operation_failed`：失败工具调用关联的 source match 命中 `category=code`。
- `tool_execution_failed`：工具调用失败但未命中业务 source，作为“工具层失败/未命中业务来源”展示。
- `model_or_api_failed`：来自 `sdd_errors` 的 `api_error`、`internal_error`、`exception` 等强错误，且同 interaction 已进入当前 profile facts。

## 配置契约

`WorkflowProfileConfig` 新增 `errorRules`：

- `ruleId`：稳定规则 ID。
- `category`：固定五类之一。
- `displayName`：页面文案。
- `enabled`：是否启用。
- `severity`：`error` / `warning` / `info`。
- `failureSources`：`tool_call` / `sdd_error`。
- `sourceCategories`：可选，引用 `sourceRules.category`。
- `sourceScope`：`matched` / `unmatched` / `profile_interaction`。
- `includeToolNames`、`excludeToolNames`：可选，工具名降噪。
- `includeErrorTypes`、`excludeErrorTypes`：可选，错误类型降噪。
- `reasonGroups`：可选，当前用于 `knowledge_read_failed` 的原因诊断。每个原因包含 `reasonCode`、`displayName`、`description`、`matchErrorTypes`、`matchToolNames`、`locatorIncludes`、`messageIncludes`、`inputIncludes`、`isFallback`。原因归类必须来自 profile 配置，不在前端硬编码业务路径或错误类型。

内置 `sdd-default` 和 `e2e-monorepo` 默认启用上述五类；配置 CRUD 通过高级 JSON 编辑保存和发布。

## 数据模型

新增投影明细表 `profile_error_events`，跟随 current-run 模型：

- 关键字段：`profile_id`、`projection_run_id`、`error_key`、`category`、`display_name`、`severity`。
- 关联字段：`tool_call_id`、`event_id`、`interaction_id`、`delivery_unit_id`、`capability_usage_id`、`user_id`、`session_id`、`prompt_id`。
- 证据字段：`tool_name`、`error_type`、`message_preview`、`input_preview`、`locator`、`source_category`、`matched_rule_id`、`confidence`、`evidence_json`、`rule_version`。
- 时间字段：`event_time`。

索引：

- `(profile_id, projection_run_id, event_time)`
- `(profile_id, projection_run_id, category, event_time)`
- `(profile_id, projection_run_id, delivery_unit_id)`
- `(profile_id, projection_run_id, tool_name)`
- unique `(projection_run_id, error_key)`

## 投影逻辑

source-backed profile：

1. 先运行已有 delivery、capability、artifact、knowledge、code 算子。
2. 工具失败从 `sdd_interaction_tool_calls` 读取 `success=false OR error_type IS NOT NULL`。
3. 如果同 tool_call 在当前 config version 的 `profile_source_matches` 命中 `errorRules.sourceCategories`，按对应业务类写 `profile_error_events`。
4. 如果未命中业务 source，且 `tool_execution_failed` 规则启用，按工具层失败写入。
5. `sdd_errors` 只在同 interaction 出现在当前 run 的 `profile_capability_usages`、`profile_artifact_writes`、`profile_knowledge_recalls` 或 `profile_code_activities` 中时写入 `model_or_api_failed`。

sdd-bridge profile 也复用同一个 error operator；profile 内归属来自当前 run facts，不从旧 SDD 业务字段做模糊推断。

## API

新增 profile errors API：

- `GET /api/profiles/:profileId/errors/overview`
- `GET /api/profiles/:profileId/errors`
- `GET /api/profiles/:profileId/errors/:errorEventId`

概览和列表都支持 `range`、`category`、`reasonCode`。列表额外支持 `severity`、`toolName`、`errorType`、`userId`、`deliveryUnitId`、`keyword`、`page`、`pageSize`。

概览返回：

- `kpis`：异常总数、知识库读取失败、工具调用失败、影响用户、影响交互、最新时间。
- `categories`：按配置类目补齐的分类总览，包含异常数、影响用户、影响交互、关联需求、最新时间。
- `knowledgeDiagnostics`：知识库异常原因分布，来自 `errorRules.reasonGroups`，包含原因、次数、影响用户、影响交互、关联需求、最新时间、示例 locator。

列表支持 `reasonCode`，用于知识库原因二级页。`reasonCode` 的匹配规则由 profile 配置定义；fallback 原因通过“未命中其他原因”的 SQL 条件实现。

## 页面

新增左侧「看板 / 异常分析」。页面结构：

- 决策摘要：异常总数、影响范围、知识库读取失败、工具调用失败、最新异常时间，并提供“优先处理分类”“知识库重点原因”“最新证据”三个直接下钻入口。
- 异常分类总览：五类异常表格，展示异常数、影响用户、影响交互、关联需求、最新时间；点击进入分类二级页。
- 知识库异常诊断：按配置原因分布展示空链接、文件不存在、MCP 文档读取失败、读取 token 超限等问题；点击进入知识库分类页并带 `reasonCode`。
- 最新异常事件：展示具体事件，不做聚合；点击进入单事件详情页。
- 分类二级页：展示当前语义分类的 KPI、知识库原因筛选（仅知识库分类）、具体事件列表。
- 事件详情页：承接单条异常的上下文、工具输入、消息/栈摘要、profile 匹配证据，不使用抽屉。

视觉遵循 `impeccable` 当前产品约束：深色高密度、异常状态醒目、电黄只用于当前筛选和可点击信号，不做营销式卡片堆叠。
