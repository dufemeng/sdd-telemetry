# 系统设计：交互明细文本保真度修复

更新时间：2026-05-19

## 数据层

- `otel_log_events` 新增 `event_sequence INT UNSIGNED NULL` 和 `(session_id, event_sequence)` 索引。
- `sdd_interactions` 新增 `cost_usd`、4 类 token、`llm_call_count`、`tool_call_count`、`skill_name`、`agent_name`、`plugin_name`、`query_source`、`effort`、`speed`。
- 新增 `sdd_interaction_tool_calls`，用 `tool_use_id` 唯一键把 `tool_decision` 和 `tool_result` 合成一行。

## Worker 清洗

1. 解析 OTLP 时抽取 `attributes."event.sequence"` 到 `event_sequence`，`prompt_id` 只取 `prompt_id` / `prompt.id`。
2. 写入本 batch 的 raw events 后，按 prompt/session 获取 MySQL named lock，再读取 scoped events。
3. 每个 interaction 按 `event_sequence IS NULL, event_sequence, event_time, id` 排序。
4. Tier 1 从 `api_request` 聚合 model、cost、tokens、duration、归因字段。
5. Tier 2 从所有 `api_response_body.attributes.body` 拼接 content blocks，并把 parsed body 写入 `response_json`。
6. tool calls 按 `tool_use_id` upsert，字段用 `COALESCE` 防止跨 batch 的 decision/result 互相用 NULL 覆盖。

## API 和前端

- `/api/sdd/interactions` 和 `/api/sdd/interactions/:id` 返回新增成本、token、调用次数和归因字段。
- 新增 `GET /api/sdd/interactions/:interactionId/tool-calls`，返回按 sequence 排序的工具调用时间线。
- `/sdd/interactions` 表格新增成本、tokens、LLM 调用列，抽屉新增工具调用时间线。
- `/api/sdd/funnel` 响应结构不变，但 `pairingSuccessRate` 口径改为无 `api_error` 的 interaction 占比。

## 回填注意

历史回填不能只重置 `ingest_outbox`。必须先确认 `otel_raw_payloads.payload_json` 仍存在，停 worker，清空派生表，重置 `otel_ingest_batches.status='received'`，再重置 outbox。超过 raw retention 的 batch 无法完整回填。
