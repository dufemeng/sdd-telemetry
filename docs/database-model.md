# 数据库模型设计

更新时间：2026-05-19  
数据库：MySQL / InnoDB / `utf8mb4`  
时间约定：所有时间按 UTC 写入，类型使用 `DATETIME(3)`

## 1. 总体原则

1. 每张表主键统一命名为 `id`，类型为 `BIGINT UNSIGNED AUTO_INCREMENT`。
2. 主键只表达数据库身份，业务幂等使用独立唯一键。
3. raw 是证据基石，任何派生数据都必须能追溯到 raw / event / batch。
4. P0 不做分区，使用索引 + 批量清理。
5. raw payload 保留约 7 天，事件和 prompt / response 明文保留约 30 天。
6. SDD 派生指标至少保留 6 个月。
7. 大文本使用 `LONGTEXT`，普通枚举和 key 使用 `VARCHAR`。
8. JSON 字段优先使用 MySQL `JSON`；如果公司环境限制 JSON，可退化为 `LONGTEXT` + 应用层校验。

## 2. 表分层

```text
配置层
  sdd_users
  sdd_skill_semantics
  sdd_skill_aliases

原始层
  otel_ingest_batches
  otel_raw_payloads
  ingest_outbox
  otel_log_events

交互层
  sdd_interactions
  sdd_interaction_texts
  sdd_interaction_tool_calls

SDD 业务层
  sdd_skill_usages
  sdd_work_items
  sdd_work_item_artifacts
  sdd_errors
```

## 3. 配置层

### 3.1 sdd_users

用户表和用户维度 setting 表合并。`setting.json` 是用户维度的，所以不再单独建 `sdd_user_settings`。

| 字段                     | 类型            | 约束             | 说明                                         |
| ------------------------ | --------------- | ---------------- | -------------------------------------------- |
| `id`                     | BIGINT UNSIGNED | PK               | 主键                                         |
| `user_key`               | VARCHAR(191)    | NOT NULL, UNIQUE | 系统内部用户唯一键，优先由 `install_id` 生成 |
| `install_id`             | VARCHAR(191)    | NULL, INDEX      | OTel / 客户端安装标识                        |
| `user_name`              | VARCHAR(191)    | NULL             | 用户展示名，来自 setting 或资源字段          |
| `machine_id`             | VARCHAR(191)    | NULL, INDEX      | 机器标识                                     |
| `machine_name`           | VARCHAR(191)    | NULL             | 机器展示名                                   |
| `os_name`                | VARCHAR(64)     | NULL             | 操作系统                                     |
| `os_version`             | VARCHAR(64)     | NULL             | 系统版本                                     |
| `client_name`            | VARCHAR(64)     | NULL             | 上报客户端名                                 |
| `client_version`         | VARCHAR(64)     | NULL             | 上报客户端版本                               |
| `requirements_root_path` | VARCHAR(1024)   | NULL             | 用户本地 requirements 仓库完整路径           |
| `wiki_root_path`         | VARCHAR(1024)   | NULL             | 用户本地 wiki 仓库完整路径                   |
| `settings_json`          | JSON            | NULL             | setting 原始快照；当前允许完整路径           |
| `settings_reported_at`   | DATETIME(3)     | NULL             | setting 上报时间                             |
| `first_seen_at`          | DATETIME(3)     | NULL, INDEX      | 首次看到该用户                               |
| `last_seen_at`           | DATETIME(3)     | NULL, INDEX      | 最近看到该用户                               |
| `gmt_create`             | DATETIME(3)     | NOT NULL         | 创建时间                                     |
| `gmt_modified`           | DATETIME(3)     | NOT NULL         | 更新时间                                     |

`user_key` 生成规则：

```text
install_id 存在：
  user_key = sha256("install:" + install_id)

install_id 缺失但 machine_id 存在：
  user_key = sha256("machine:" + machine_id)

都缺失：
  user_key = sha256("unknown:" + payload_hash)
```

### 3.2 sdd_skill_semantics

SDD 语义配置表。语义是页面展示、归类、评测、故障排查的稳定概念。

| 字段                         | 类型            | 约束             | 说明                                                              |
| ---------------------------- | --------------- | ---------------- | ----------------------------------------------------------------- |
| `id`                         | BIGINT UNSIGNED | PK               | 主键                                                              |
| `semantic_code`              | VARCHAR(64)     | NOT NULL, UNIQUE | 稳定语义编码，如 `proposal`、`design`、`task`                     |
| `display_name`               | VARCHAR(191)    | NOT NULL         | 展示名，如“技术提案”                                              |
| `description`                | VARCHAR(1000)   | NULL             | 页面小字描述                                                      |
| `artifact_filename_patterns` | JSON            | NULL             | 该语义产出的过程文档文件名 glob，如 `["design.md","design-*.md"]` |
| `gmt_create`                 | DATETIME(3)     | NOT NULL         | 创建时间                                                          |
| `gmt_modified`               | DATETIME(3)     | NOT NULL         | 更新时间                                                          |

不设计 `stage_order` 和 `enabled`。配置存在即生效，流程顺序不在配置层强行定义。

### 3.3 sdd_skill_aliases

一个语义可以匹配多个 raw skill name。

| 字段           | 类型            | 约束             | 说明                               |
| -------------- | --------------- | ---------------- | ---------------------------------- |
| `id`           | BIGINT UNSIGNED | PK               | 主键                               |
| `semantic_id`  | BIGINT UNSIGNED | NOT NULL, INDEX  | 关联 `sdd_skill_semantics.id`      |
| `skill_name`   | VARCHAR(191)    | NOT NULL, UNIQUE | 原始 skill 名，如 `bk-fe:proposal` |
| `gmt_create`   | DATETIME(3)     | NOT NULL         | 创建时间                           |
| `gmt_modified` | DATETIME(3)     | NOT NULL         | 更新时间                           |

P0 只做 exact match，不设计 `match_type`。

## 4. 原始层

### 4.1 otel_ingest_batches

一次 HTTP 上报对应一个 batch。

| 字段                 | 类型            | 约束               | 说明                                                                                     |
| -------------------- | --------------- | ------------------ | ---------------------------------------------------------------------------------------- |
| `id`                 | BIGINT UNSIGNED | PK                 | 主键，也可作为 API 的 `batchId`                                                          |
| `payload_hash`       | CHAR(64)        | NOT NULL, UNIQUE   | raw payload SHA-256，用于重复上报幂等                                                    |
| `user_id`            | BIGINT UNSIGNED | NULL, INDEX        | 关联 `sdd_users.id`                                                                      |
| `status`             | VARCHAR(32)     | NOT NULL, INDEX    | `received` / `queued` / `processing` / `parsed` / `failed_retryable` / `failed_terminal` |
| `status_reason`      | VARCHAR(500)    | NULL               | 状态说明                                                                                 |
| `payload_bytes`      | INT UNSIGNED    | NOT NULL           | payload 字节数                                                                           |
| `raw_log_count`      | INT UNSIGNED    | NOT NULL DEFAULT 0 | 原始日志条数                                                                             |
| `event_count`        | INT UNSIGNED    | NOT NULL DEFAULT 0 | 抽取出的事件数                                                                           |
| `derived_count`      | INT UNSIGNED    | NOT NULL DEFAULT 0 | 派生数据数量                                                                             |
| `duplicate_count`    | INT UNSIGNED    | NOT NULL DEFAULT 0 | 重复上报次数                                                                             |
| `last_duplicate_at`  | DATETIME(3)     | NULL               | 最近重复上报时间                                                                         |
| `received_at`        | DATETIME(3)     | NOT NULL, INDEX    | 接收时间                                                                                 |
| `parse_started_at`   | DATETIME(3)     | NULL               | 清洗开始时间                                                                             |
| `parse_completed_at` | DATETIME(3)     | NULL               | 清洗完成时间                                                                             |
| `parse_duration_ms`  | INT UNSIGNED    | NULL               | 清洗耗时                                                                                 |
| `retry_count`        | INT UNSIGNED    | NOT NULL DEFAULT 0 | 清洗重试次数                                                                             |
| `last_error`         | LONGTEXT        | NULL               | 最近失败原因                                                                             |
| `gmt_create`         | DATETIME(3)     | NOT NULL           | 创建时间                                                                                 |
| `gmt_modified`       | DATETIME(3)     | NOT NULL           | 更新时间                                                                                 |

建议索引：

```text
UNIQUE KEY uk_payload_hash(payload_hash)
KEY idx_status_received(status, received_at)
KEY idx_user_received(user_id, received_at)
```

### 4.2 otel_raw_payloads

保存最原始 payload。

| 字段            | 类型            | 约束             | 说明                          |
| --------------- | --------------- | ---------------- | ----------------------------- |
| `id`            | BIGINT UNSIGNED | PK               | 主键                          |
| `batch_id`      | BIGINT UNSIGNED | NOT NULL, UNIQUE | 关联 `otel_ingest_batches.id` |
| `payload_json`  | LONGTEXT        | NOT NULL         | 原始 JSON 字符串              |
| `payload_bytes` | INT UNSIGNED    | NOT NULL         | 字节数                        |
| `content_type`  | VARCHAR(128)    | NULL             | 请求 `Content-Type`           |
| `expires_at`    | DATETIME(3)     | NOT NULL, INDEX  | raw 过期时间，约接收后 7 天   |
| `gmt_create`    | DATETIME(3)     | NOT NULL         | 创建时间                      |
| `gmt_modified`  | DATETIME(3)     | NOT NULL         | 更新时间                      |

应用层限制：

```text
MAX_OTLP_PAYLOAD_BYTES 默认 16MB
MySQL max_allowed_packet 需大于应用限制
```

### 4.3 ingest_outbox

可靠投递表。保证 raw 写入成功后，清洗任务不会因为定时任务短暂失败或实例重启而丢失。BullMQ / MQ 可用后仍复用该表做可靠投递。

| 字段            | 类型            | 约束                | 说明                                                         |
| --------------- | --------------- | ------------------- | ------------------------------------------------------------ |
| `id`            | BIGINT UNSIGNED | PK                  | 主键                                                         |
| `event_type`    | VARCHAR(64)     | NOT NULL            | 如 `clean_batch`                                             |
| `aggregate_id`  | BIGINT UNSIGNED | NOT NULL            | 通常是 `batch_id`                                            |
| `payload_json`  | JSON            | NULL                | 投递任务参数                                                 |
| `status`        | VARCHAR(32)     | NOT NULL, INDEX     | `pending` / `dispatching` / `dispatched` / `failed_terminal` |
| `attempts`      | INT UNSIGNED    | NOT NULL DEFAULT 0  | 投递尝试次数                                                 |
| `max_attempts`  | INT UNSIGNED    | NOT NULL DEFAULT 20 | 最大投递次数                                                 |
| `next_retry_at` | DATETIME(3)     | NULL, INDEX         | 下次可重试时间                                               |
| `locked_by`     | VARCHAR(191)    | NULL                | dispatcher 实例标识                                          |
| `locked_until`  | DATETIME(3)     | NULL                | 锁过期时间                                                   |
| `last_error`    | LONGTEXT        | NULL                | 最近投递失败原因                                             |
| `dispatched_at` | DATETIME(3)     | NULL                | 投递成功时间                                                 |
| `gmt_create`    | DATETIME(3)     | NOT NULL            | 创建时间                                                     |
| `gmt_modified`  | DATETIME(3)     | NOT NULL            | 更新时间                                                     |

建议索引：

```text
UNIQUE KEY uk_event_aggregate(event_type, aggregate_id)
KEY idx_status_retry(status, next_retry_at)
```

### 4.4 otel_log_events

清洗后的标准事件层。它比 raw 小，是跨 batch 配对和 dashboard 聚合的主要依据。

| 字段              | 类型            | 约束             | 说明                                                   |
| ----------------- | --------------- | ---------------- | ------------------------------------------------------ |
| `id`              | BIGINT UNSIGNED | PK               | 主键                                                   |
| `event_id`        | CHAR(64)        | NOT NULL, UNIQUE | 稳定事件 ID                                            |
| `batch_id`        | BIGINT UNSIGNED | NOT NULL, INDEX  | 来源 batch                                             |
| `user_id`         | BIGINT UNSIGNED | NULL, INDEX      | 用户                                                   |
| `session_id`      | VARCHAR(191)    | NULL, INDEX      | session 标识                                           |
| `prompt_id`       | VARCHAR(191)    | NULL, INDEX      | prompt 标识                                            |
| `trace_id`        | VARCHAR(64)     | NULL, INDEX      | OTel trace id，用于缺 `prompt_id` 事件的 prompt anchor |
| `span_id`         | VARCHAR(64)     | NULL             | OTel span id                                           |
| `event_name`      | VARCHAR(191)    | NOT NULL, INDEX  | 事件名                                                 |
| `display_name`    | VARCHAR(191)    | NULL             | 页面展示名                                             |
| `service_name`    | VARCHAR(191)    | NULL             | OTel service name                                      |
| `service_version` | VARCHAR(64)     | NULL, INDEX      | service version                                        |
| `severity_text`   | VARCHAR(64)     | NULL             | OTel severity text                                     |
| `severity_number` | INT             | NULL             | OTel severity number                                   |
| `event_time`      | DATETIME(3)     | NULL, INDEX      | 事件发生时间                                           |
| `event_sequence`  | INT UNSIGNED    | NULL, INDEX      | Claude Code session 内单调递增序号，用于同毫秒事件排序 |
| `observed_at`     | DATETIME(3)     | NULL             | OTel observed time                                     |
| `attributes_json` | JSON            | NULL             | attributes                                             |
| `resource_json`   | JSON            | NULL             | resource                                               |
| `body_json`       | JSON            | NULL             | body 结构                                              |
| `body_text`       | LONGTEXT        | NULL             | body 文本                                              |
| `expires_at`      | DATETIME(3)     | NOT NULL, INDEX  | 事件过期时间，约 30 天                                 |
| `gmt_create`      | DATETIME(3)     | NOT NULL         | 创建时间                                               |
| `gmt_modified`    | DATETIME(3)     | NOT NULL         | 更新时间                                               |

`event_id` 生成建议：

```text
sha256(
  batch_id + ":" +
  log_record_index + ":" +
  event_name + ":" +
  event_time + ":" +
  prompt_id + ":" +
  session_id
)
```

## 5. 交互层

### 5.1 sdd_interactions

一次 prompt / response 交互的元数据。

| 字段                    | 类型              | 约束               | 说明                                         |
| ----------------------- | ----------------- | ------------------ | -------------------------------------------- |
| `id`                    | BIGINT UNSIGNED   | PK                 | 主键                                         |
| `interaction_key`       | CHAR(64)          | NOT NULL, UNIQUE   | 稳定交互 key                                 |
| `user_id`               | BIGINT UNSIGNED   | NULL, INDEX        | 用户                                         |
| `session_id`            | VARCHAR(191)      | NULL, INDEX        | session                                      |
| `prompt_id`             | VARCHAR(191)      | NULL, INDEX        | prompt                                       |
| `request_event_id`      | CHAR(64)          | NULL               | prompt 来源 event                            |
| `response_event_id`     | CHAR(64)          | NULL               | response 来源 event                          |
| `status`                | VARCHAR(32)       | NOT NULL           | `completed` / `partial` / `failed`           |
| `model`                 | VARCHAR(128)      | NULL               | LLM model                                    |
| `command_name`          | VARCHAR(191)      | NULL               | 命令名                                       |
| `command_source`        | VARCHAR(191)      | NULL               | 命令来源                                     |
| `pairing_method`        | VARCHAR(64)       | NOT NULL           | `prompt_id` / `anchored_by_user_prompt`      |
| `started_at`            | DATETIME(3)       | NULL, INDEX        | 开始时间                                     |
| `completed_at`          | DATETIME(3)       | NULL               | 完成时间                                     |
| `duration_ms`           | INT UNSIGNED      | NULL               | 耗时                                         |
| `cost_usd`              | DECIMAL(10,6)     | NULL, INDEX        | 本 turn LLM 调用总成本                       |
| `input_tokens`          | INT UNSIGNED      | NULL               | 输入 token                                   |
| `output_tokens`         | INT UNSIGNED      | NULL               | 输出 token                                   |
| `cache_read_tokens`     | INT UNSIGNED      | NULL               | 缓存命中 token                               |
| `cache_creation_tokens` | INT UNSIGNED      | NULL               | 缓存创建 token                               |
| `llm_call_count`        | SMALLINT UNSIGNED | NOT NULL DEFAULT 0 | 本 turn LLM 调用次数                         |
| `tool_call_count`       | SMALLINT UNSIGNED | NOT NULL DEFAULT 0 | 本 turn 工具调用次数                         |
| `skill_name`            | VARCHAR(191)      | NULL, INDEX        | 触发本 turn 的 skill                         |
| `agent_name`            | VARCHAR(191)      | NULL               | subagent 名                                  |
| `plugin_name`           | VARCHAR(191)      | NULL               | plugin 名                                    |
| `query_source`          | VARCHAR(64)       | NULL               | 调用来源                                     |
| `effort`                | VARCHAR(16)       | NULL               | 模型思考档位                                 |
| `speed`                 | VARCHAR(16)       | NULL               | 速度档位                                     |
| `source_batch_id`       | BIGINT UNSIGNED   | NULL, INDEX        | 首次触发派生的 batch                         |
| `evidence_json`         | JSON              | NULL               | 配对证据                                     |
| `gmt_create`            | DATETIME(3)       | NOT NULL           | 创建时间                                     |
| `gmt_modified`          | DATETIME(3)       | NOT NULL           | 更新时间                                     |

`interaction_key` 生成建议：

```text
prompt_id 存在：
  sha256("prompt:" + prompt_id)

prompt_id 缺失但可通过 trace_id 或 user_prompt anchor 回填：
  sha256("prompt:" + anchor.prompt_id)

无可信 anchor：
  不写入 sdd_interactions，只在 otel_log_events 标记 orphan
```

### 5.2 sdd_interaction_texts

prompt / response 明文和结构化 response。与元数据拆开，便于 30 天清理。

| 字段             | 类型            | 约束             | 说明                       |
| ---------------- | --------------- | ---------------- | -------------------------- |
| `id`             | BIGINT UNSIGNED | PK               | 主键                       |
| `interaction_id` | BIGINT UNSIGNED | NOT NULL, UNIQUE | 关联 `sdd_interactions.id` |
| `prompt_text`    | LONGTEXT        | NULL             | 用户 prompt                |
| `response_text`  | LONGTEXT        | NULL             | LLM response 文本          |
| `response_json`  | LONGTEXT        | NULL             | response 原始结构          |
| `expires_at`     | DATETIME(3)     | NOT NULL, INDEX  | 明文过期时间，约 30 天     |
| `gmt_create`     | DATETIME(3)     | NOT NULL         | 创建时间                   |
| `gmt_modified`   | DATETIME(3)     | NOT NULL         | 更新时间                   |

### 5.3 sdd_interaction_tool_calls

一次 interaction 内的工具调用时间线。`tool_decision` 和 `tool_result` 可能跨 batch 到达，清洗时按 `tool_use_id` 合并。

| 字段                 | 类型            | 约束             | 说明                             |
| -------------------- | --------------- | ---------------- | -------------------------------- |
| `id`                 | BIGINT UNSIGNED | PK               | 主键                             |
| `interaction_id`     | BIGINT UNSIGNED | NOT NULL, INDEX  | 关联 `sdd_interactions.id`       |
| `tool_use_id`        | VARCHAR(191)    | NOT NULL, UNIQUE | Claude Code 工具调用 ID          |
| `tool_name`          | VARCHAR(128)    | NOT NULL, INDEX  | 工具名                           |
| `sequence`           | INT UNSIGNED    | NOT NULL         | `event.sequence`，用于时间线排序 |
| `decision`           | VARCHAR(16)     | NULL             | allow / deny / accept 等决策     |
| `decision_source`    | VARCHAR(32)     | NULL             | config / hook / user 等来源      |
| `success`            | TINYINT(1)      | NULL             | 工具结果是否成功                 |
| `duration_ms`        | INT UNSIGNED    | NULL             | 工具耗时                         |
| `input_size_bytes`   | INT UNSIGNED    | NULL             | 入参大小                         |
| `result_size_bytes`  | INT UNSIGNED    | NULL             | 结果大小                         |
| `error_type`         | VARCHAR(128)    | NULL             | 错误类型                         |
| `tool_input_preview` | TEXT            | NULL             | 工具入参预览，最多约 4KB         |
| `mcp_server_scope`   | VARCHAR(191)    | NULL             | MCP scope                        |
| `evidence_json`      | JSON            | NULL             | decision/result event id 证据    |
| `gmt_create`         | DATETIME(3)     | NOT NULL         | 创建时间                         |
| `gmt_modified`       | DATETIME(3)     | NOT NULL         | 更新时间                         |

## 6. SDD 业务层

### 6.1 sdd_skill_usages

一次 SDD skill 调用记录。

| 字段                 | 类型            | 约束             | 说明                                                                                                                                |
| -------------------- | --------------- | ---------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `id`                 | BIGINT UNSIGNED | PK               | 主键                                                                                                                                |
| `usage_key`          | CHAR(64)        | NOT NULL, UNIQUE | 稳定 usage key                                                                                                                      |
| `semantic_id`        | BIGINT UNSIGNED | NULL, INDEX      | 匹配到的 SDD 语义                                                                                                                   |
| `alias_id`           | BIGINT UNSIGNED | NULL             | 命中的 alias                                                                                                                        |
| `interaction_id`     | BIGINT UNSIGNED | NULL, INDEX      | 关联交互                                                                                                                            |
| `work_item_id`       | BIGINT UNSIGNED | NULL, INDEX      | 关联需求                                                                                                                            |
| `user_id`            | BIGINT UNSIGNED | NULL, INDEX      | 用户                                                                                                                                |
| `session_id`         | VARCHAR(191)    | NULL, INDEX      | session                                                                                                                             |
| `prompt_id`          | VARCHAR(191)    | NULL, INDEX      | prompt                                                                                                                              |
| `raw_skill_name`     | VARCHAR(191)    | NOT NULL, INDEX  | 原始 skill 名                                                                                                                       |
| `skill_source`       | VARCHAR(191)    | NULL             | skill 来源                                                                                                                          |
| `invocation_trigger` | VARCHAR(191)    | NULL             | 触发方式                                                                                                                            |
| `command_name`       | VARCHAR(191)    | NULL             | 命令名                                                                                                                              |
| `service_version`    | VARCHAR(64)     | NULL, INDEX      | service version                                                                                                                     |
| `observed_version`   | VARCHAR(64)     | NULL, INDEX      | 从日志清洗出的 skill version                                                                                                        |
| `matched_by`         | VARCHAR(64)     | NOT NULL         | `alias_exact` / `heuristic` / `unmatched`（rawSkillName 在 sdd_skill_aliases 中无匹配，此时 `semantic_id` 与 `alias_id` 均为 NULL） |
| `rule_version`       | VARCHAR(32)     | NOT NULL         | 清洗规则版本                                                                                                                        |
| `event_sequence`     | INT UNSIGNED    | NULL             | 同一 prompt 下的事件顺序                                                                                                            |
| `status`             | VARCHAR(32)     | NOT NULL         | `started` / `completed` / `failed` / `unknown`                                                                                      |
| `event_time`         | DATETIME(3)     | NULL, INDEX      | 调用时间                                                                                                                            |
| `gmt_create`         | DATETIME(3)     | NOT NULL         | 创建时间                                                                                                                            |
| `gmt_modified`       | DATETIME(3)     | NOT NULL         | 更新时间                                                                                                                            |

`usage_key` 生成建议：

```text
sha256(
  raw_skill_name + ":" +
  prompt_id + ":" +
  session_id + ":" +
  event_sequence + ":" +
  event_time
)
```

### 6.2 sdd_work_items

需求维度 P0-lite。通过用户上报的 `requirements_root_path` 和 `tool_result.tool_input` 里的写文件路径推断。只有带 `content` / `new_string` 的写入信号会生成 work item，读取文件不会生成。

| 字段                     | 类型            | 约束             | 说明                                           |
| ------------------------ | --------------- | ---------------- | ---------------------------------------------- |
| `id`                     | BIGINT UNSIGNED | PK               | 主键                                           |
| `work_item_key`          | CHAR(64)        | NOT NULL, UNIQUE | 稳定需求 key                                   |
| `requirements_repo_name` | VARCHAR(191)    | NULL             | requirements 仓库目录名                        |
| `business_domain`        | VARCHAR(191)    | NULL, INDEX      | 一级业务域，如 `cashier`                       |
| `work_item_slug`         | VARCHAR(191)    | NOT NULL, INDEX  | 需求目录名，如 `2026-04-10-unfreeze-component` |
| `work_item_title`        | VARCHAR(500)    | NULL             | 可选展示标题，P0 可等于 slug                   |
| `relative_dir`           | VARCHAR(1024)   | NOT NULL         | 相对 requirements root 的需求目录              |
| `first_seen_at`          | DATETIME(3)     | NULL             | 首次出现                                       |
| `last_seen_at`           | DATETIME(3)     | NULL, INDEX      | 最近出现                                       |
| `gmt_create`             | DATETIME(3)     | NOT NULL         | 创建时间                                       |
| `gmt_modified`           | DATETIME(3)     | NOT NULL         | 更新时间                                       |

`work_item_key` 生成建议：

```text
sha256(business_domain + ":" + work_item_slug)
```

### 6.3 sdd_work_item_artifacts

需求目录下的过程文档。

| 字段                     | 类型            | 约束             | 说明                                                                           |
| ------------------------ | --------------- | ---------------- | ------------------------------------------------------------------------------ |
| `id`                     | BIGINT UNSIGNED | PK               | 主键                                                                           |
| `artifact_key`           | CHAR(64)        | NOT NULL, UNIQUE | 稳定 artifact key                                                              |
| `work_item_id`           | BIGINT UNSIGNED | NOT NULL, INDEX  | 关联需求                                                                       |
| `artifact_type`          | VARCHAR(64)     | NOT NULL, INDEX  | `proposal` / `design` / `tasks` / `codereview` / `prd` / `test_case` / `other` |
| `artifact_relative_path` | VARCHAR(1024)   | NOT NULL         | 相对 requirements root 的路径                                                  |
| `artifact_full_path`     | VARCHAR(2048)   | NOT NULL         | 用户本地完整路径                                                               |
| `system_module`          | VARCHAR(191)    | NULL, INDEX      | 需求下的系统模块目录                                                           |
| `first_seen_event_id`    | CHAR(64)        | NULL             | 首次发现来源事件                                                               |
| `first_seen_at`          | DATETIME(3)     | NULL             | 首次出现                                                                       |
| `last_seen_at`           | DATETIME(3)     | NULL             | 最近出现                                                                       |
| `gmt_create`             | DATETIME(3)     | NOT NULL         | 创建时间                                                                       |
| `gmt_modified`           | DATETIME(3)     | NOT NULL         | 更新时间                                                                       |

### 6.4 sdd_errors

强错误表。P0 避免把所有 error 文本都放进错误视图，优先纳入有明确结构或高置信度的异常。

| 字段                 | 类型            | 约束               | 说明                                     |
| -------------------- | --------------- | ------------------ | ---------------------------------------- |
| `id`                 | BIGINT UNSIGNED | PK                 | 主键                                     |
| `error_key`          | CHAR(64)        | NOT NULL, UNIQUE   | 稳定错误 key                             |
| `user_id`            | BIGINT UNSIGNED | NULL, INDEX        | 用户                                     |
| `batch_id`           | BIGINT UNSIGNED | NULL, INDEX        | 来源 batch                               |
| `event_id`           | CHAR(64)        | NULL, INDEX        | 来源 event                               |
| `interaction_id`     | BIGINT UNSIGNED | NULL, INDEX        | 关联交互                                 |
| `usage_id`           | BIGINT UNSIGNED | NULL, INDEX        | 关联 skill usage                         |
| `work_item_id`       | BIGINT UNSIGNED | NULL, INDEX        | 关联需求                                 |
| `error_type`         | VARCHAR(128)    | NOT NULL, INDEX    | 错误类型，如 `api_error`、`tool_failure` |
| `severity`           | VARCHAR(32)     | NOT NULL, INDEX    | `fatal` / `error` / `warn`               |
| `source`             | VARCHAR(128)    | NULL               | 错误来源                                 |
| `retryable`          | TINYINT(1)      | NOT NULL DEFAULT 0 | 是否可重试                               |
| `error_message_hash` | CHAR(64)        | NULL, INDEX        | 错误信息 hash                            |
| `error_message`      | LONGTEXT        | NULL               | 错误信息                                 |
| `stack_hash`         | CHAR(64)        | NULL               | 堆栈 hash                                |
| `stack_trace`        | LONGTEXT        | NULL               | 堆栈                                     |
| `event_time`         | DATETIME(3)     | NULL, INDEX        | 错误发生时间                             |
| `gmt_create`         | DATETIME(3)     | NOT NULL           | 创建时间                                 |
| `gmt_modified`       | DATETIME(3)     | NOT NULL           | 更新时间                                 |

`error_key` 生成建议：

```text
event_id 存在：
  sha256("event:" + event_id + ":" + error_type)

否则：
  sha256(error_type + ":" + session_id + ":" + error_message_hash + ":" + event_time)
```

## 7. Retention

P0 清理不追求秒级准确，允许 7 天变 8 天、30 天变 35 天。

| 数据                    |    保留周期 | 清理方式                 |
| ----------------------- | ----------: | ------------------------ |
| `otel_raw_payloads`     |     约 7 天 | 按 `expires_at` 分批删除 |
| `otel_log_events`       |    约 30 天 | 按 `expires_at` 分批删除 |
| `sdd_interaction_texts` |    约 30 天 | 按 `expires_at` 分批删除 |
| `sdd_interactions`      | 至少 6 个月 | P0 可不清理              |
| `sdd_skill_usages`      | 至少 6 个月 | P0 可不清理              |
| `sdd_errors`            | 至少 6 个月 | P0 可不清理              |
| `sdd_work_items`        |        长期 | P0 不清理                |

Retention 定时任务建议每天执行一次，每批删除 500-2000 行，避免长事务。

## 8. MySQL 配置建议

```text
character_set_server = utf8mb4
collation_server = utf8mb4_0900_ai_ci
max_allowed_packet >= 64M
innodb_flush_log_at_trx_commit = 1
```

应用环境变量：

```text
MAX_OTLP_PAYLOAD_BYTES=16777216
RAW_RETENTION_DAYS=7
EVENT_RETENTION_DAYS=30
TEXT_RETENTION_DAYS=30
```
