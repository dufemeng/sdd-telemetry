# 技术提案：交互明细文本保真度修复

更新时间：2026-05-19

## 背景

`/sdd/interactions` 的交互详情存在文本和成本信息失真：`api_response_body` 只取第一段、`response_json` 曾误存 log body 的事件名、`model/tokens/cost` 未从默认上报的 `api_request` 聚合，tool 调用也没有独立时间线。

## 目标

1. 一个 Claude Code 用户 turn（`prompt.id`）聚合成一行 `sdd_interactions`。
2. Tier 1 默认事件（`api_request`、`api_error`、`tool_decision`、`tool_result`、`user_prompt`）提供 model、cost、tokens、状态和工具元数据。
3. Tier 2 可选事件（`api_request_body`、`api_response_body`）提供完整 prompt/response 文本和原始 response JSON。
4. 新增 `sdd_interaction_tool_calls`，按 `tool_use_id` 合并 decision/result。

## 关键修正

- `prompt_id` 不再 fallback 到 Anthropic `request_id`，避免一次 turn 被拆成多行。
- `event.sequence` 抽到 `otel_log_events.event_sequence`，清洗拼接时优先按 sequence 排序。
- 同一 prompt/session 的清洗使用 MySQL named lock 串行化，再读取 scoped events，保证跨 batch 聚合收敛。
- `status` 由最后一个 terminal LLM event 判定：最后是 `api_error` 才是 `failed`，重试成功后回到 `completed`。
- `pairingSuccessRate` 改为 `1 - failed / totalInteractions`。

## 非目标

- 本期不接 metrics 流。
- 本期不接 traces beta，也不落 tool 输出正文。
- 不做全文搜索。
