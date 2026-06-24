# 定位:在线文档 profile（online-docs）process_doc 看板恒为 0

## 背景症状

`online-docs` profile 的 `process_doc`（过程文档）看板对 m-loan（yuque / skylark MCP）文档恒为 0 条。

## 一句话根因

Claude Code 上报 MCP 调用时把 `tool_name` 匿名成 `"mcp_tool"`，真实工具名与服务器名藏在 **tool_result 事件**的 `tool_parameters`（**双重编码 JSON 字符串**）里。source-reference 链路既没解析这个字段（真名/真服务器名丢失），又把所有在线文档动作硬编码成 `read`；下游 `process_doc` 写入计数只认 `isWriteAction`（write/edit/update），`read` 被过滤 → 写入动作永远不计 → 看板 0。

## 生产数据实证（已抽样确认）

同一 `tool_use_id` 的两条事件：

| 字段 | tool_decision | tool_result |
|---|---|---|
| `tool_name` | `mcp_tool` | `mcp_tool` |
| `tool_input` | 无 | `{"doc_id":509472326}` / `{"url":"https://yuque.antfin.com/..."}` |
| `tool_parameters` | **无** | `"{\"mcp_server_name\":\"skylarkmcpserver\",\"mcp_tool_name\":\"skylark_doc_detail\"}"`（双重编码字符串） |
| `mcp_server_scope` | 无 | `user`（是**作用域**，不是服务器名） |

已观察到的真实 skylark 工具：`skylark_resolve_url`（input `{url:...}`）、`skylark_doc_detail`（input `{doc_id:...}`）。服务器真名 `skylarkmcpserver`。

要点：
1. 真名只在 **tool_result** 事件，不在 decision；且是 **double-encoded** JSON 字符串，要再 parse 一层。
2. 顶层 `mcp_server_scope = "user"` 是 scope，真服务器名 `skylarkmcpserver` 只在 `tool_parameters.mcp_server_name`。
3. `tool_input` 携带 locator（`url` / `doc_id`），字段名已被现有 extractor 覆盖。

## 代码层逐跳定位

### 跳 1 —— cleaning 写入 tool_call 时丢真名（`worker/src/jobs/cleaning-worker.ts`）
- `:528-531` `toolName` 取自 `tool_name`，即 `"mcp_tool"`。
- `:548-551` `mcpServerScope` 取自 `mcp_server_scope`，即 `"user"`（scope，不是服务器名）。
- `:2020-2037` `extractToolInputPreview` 虽然读了 `tool_parameters`，但只是拼 preview，不抽结构化的 `mcp_tool_name` / `mcp_server_name`。
- 结论：`sdd_interaction_tool_calls` 行里没有真名、没有真服务器名。

### 跳 2 —— source-reference writer 没把真名透传给 extractor（`worker/src/jobs/source-reference/writer.ts`）
- `:198-202` JOIN `otel_log_events` 时 `COALESCE(toolResultEventId, toolDecisionEventId)` **优先取 result 事件** → `row.attributes_json` 恰好就是带 `tool_parameters` 的那条。**数据已经在手里。**
- `:249-250` 但 fact 只填 `toolName = row.tool_name`（"mcp_tool"）、`mcpServer = row.mcp_server_scope`（"user"）。
- `:364-368` `extractToolInputFromAttributes` 回退链 `tool_input ?? tool_parameters ?? ...`：result 事件上 `tool_input` 非空 → **返回 tool_input，`tool_parameters`（含真名）被短路吃掉**。
- 结论：真名 load 到了，但既没进 fact、又被 `??` 遮掉，extractor 看不到。

### 跳 3 —— extractor 硬编码 read（`worker/src/jobs/source-reference-extractor.ts`）
- `:22-35` `ToolCallFact` 没有「真 mcp 工具名」字段。
- `:187` 和 `:200` `extractOnlineDoc` 两个出口都写死 `actionType: 'read'`。
- `:262` reference 的 `mcpServer = fact.mcpServer`（"user"）。
- `:263` reference 的 `mcpToolName = isMcpTool(fact) ? fact.toolName : null`（"mcp_tool"）。
- `:13-14` 文件头注释已**明确**：在线文档 create/update（result direction）抽取留待后续——这是已知 Slice-0 边界，不是隐藏回归。

### 跳 4 —— matcher / 下游写入计数把它挡死
- `matcher.ts:51` 动作门：reference 恒 `read`，规则要 `write/update` → 整条拒。
- `matcher.ts:275` 服务器门：`rule.mcpServers`（应为 `['skylarkmcpserver']`）比 `fact.mcpServer = "user"` → 必挂。
- `matcher.ts:276` 工具名门：`rule.toolNames` 比 `fact.mcpToolName = "mcp_tool"` → 若规则配了 toolNames 必挂。
- `source-backed-operators.ts:111` 写入计数：`!isWriteAction(item.match.actionType)` 跳过；`isWriteAction`（`projection.ts:17`，集合 `{write,edit,update}`）对 `read` 恒 false → process_doc 交付单元/写入永不计。

## 公司大模型定位结算

| 论点 | 评判 |
|---|---|
| tool_name 匿名成 mcp_tool，真名在 tool_result.tool_parameters（双重编码） | ✅ 与生产数据一致 |
| writer 没解析该字段，真名丢失 | ✅ 正确（`writer.ts:367` 只当 input blob，从不抽 mcp_tool_name） |
| extractor 硬编码 read，下游 isWriteAction 过滤 → 0 | ✅ 正确（`:200` + `source-backed-operators.ts:111`） |
| **server 名也丢了**（`user` ≠ `skylarkmcpserver`，配 mcpServers 必挂） | ⚠️ **遗漏**，必须一并修 |
| v9 配置 process_doc actions 加上 write/update | ⚠️ 源码默认 `online-docs.ts:48` 已是 `['write','update']`；仅当 DB 配置被改窄才需要，**不是代码根因** |
| pnpm db:reclean 重建 | ✅ 正确（真名在 raw `otel_log_events`，重抽即可恢复） |
| **写操作是否真实存在** | ⚠️ **未证实**：抽样里 skylark 调用全是读（resolve_url / doc_detail）。若生产无 create/update 调用，则 0 条**不是 bug**。定性依赖「写调用确实存在」 |

## 修复方案（最小、不加表列）

1. **writer**（`source-reference/writer.ts`）：新增解析 `attributes_json.tool_parameters`（double-encode 先 parse 一层），取 `mcp_tool_name`、`mcp_server_name`。在 `collectToolCallRefs`（`:246`）填：
   - `fact.mcpToolName = parsed.mcp_tool_name`（新字段）
   - `fact.mcpServer = parsed.mcp_server_name ?? row.mcp_server_scope`（**改用真服务器名**做匹配）
   - 保持 `extractToolInputFromAttributes` 不动（locator 仍取 `tool_input` 的 url/doc_id，已覆盖）。
2. **extractor**（`source-reference-extractor.ts`）：
   - `ToolCallFact` 增 `mcpToolName: string | null`。
   - `extractOnlineDoc` 用 `deriveAction(fact.mcpToolName)` 取代 `:187/:200` 的硬编码 `'read'`。
   - `:263` reference `mcpToolName` 改存真名 `fact.mcpToolName ?? fact.toolName`。
   - `deriveAction`：默认 `read`；命中写词集合 → `write/update`。写词集合**不要**用窄正则 `(create|update|delete)`，至少含 `create|update|delete|save|submit|publish|edit|modify|append|move|rename|remove`；按项目「source rule 在线配置」方向，最终应做成**可配置**而非算子硬编码。
3. **配置**：确认 DB 内 online-docs 配置 `mcpServers=['skylarkmcpserver']`、`process_doc.actions` 含 `write/update`、`collectionIds/docTypes/docIdPatterns` 对得上 m-loan 真值。
4. **重建**：`pnpm db:reclean`。

## 动手前唯一未决前提

抽样未见任何 skylark 写操作（仅 resolve_url / doc_detail，皆读）。落地前需确认生产存在 `skylark_doc_create/update`：

```sql
SELECT JSON_UNQUOTE(JSON_EXTRACT(
         JSON_UNQUOTE(JSON_EXTRACT(attributes_json,'$.tool_parameters')),
         '$.mcp_tool_name')) AS mcp_tool_name, COUNT(*) c
FROM otel_log_events
WHERE event_name='tool_result'
  AND JSON_UNQUOTE(JSON_EXTRACT(attributes_json,'$.tool_parameters')) LIKE '%mcp_tool_name%'
GROUP BY mcp_tool_name ORDER BY c DESC;
```

若结果里没有任何写词工具，则本问题应重新定性为「当前无在线文档写入数据」，上述修复对看板数字不会有任何改变。

## 已实现（代码层）

| 文件 | 改动 |
|---|---|
| `worker/src/jobs/source-reference-extractor.ts` | `ToolCallFact` 增 `mcpToolName`；新增 `deriveOnlineDocAction`（按真名派生 read/write/update/delete）；`extractOnlineDoc` 用派生动作取代两处硬编码 `read`；reference 存真名 `mcpToolName ?? toolName` |
| `worker/src/jobs/source-reference/writer.ts` | 新增 `extractMcpToolMeta`（解析双重编码 `tool_parameters` 取 `mcp_server_name`/`mcp_tool_name`）；`collectToolCallRefs` 用真服务器名覆盖 `fact.mcpServer`、填 `fact.mcpToolName` |
| `worker/test/*` | extractor + writer 新增单测/wiring 测试（`skylark_doc_update→update`、`skylark_doc_detail→read`、真名/真服务器名落库断言） |

未加表列（`sdd_interaction_tool_calls` schema 不变），无迁移。验证：`pnpm --filter @sdd-telemetry/worker test`（158 passed）、`pnpm typecheck`、`pnpm build` 均通过。

### 生产落地剩余步骤（本地无 MCP 数据，需在生产执行）
1. 确认上面那条 SQL 里存在写词工具（否则定性改为「无写入数据」）。
2. DB 内 online-docs 配置：`mcpServers=['skylarkmcpserver']`、`process_doc.actions` 含 `write/update`、`collectionIds/docTypes/docIdPatterns` 对齐 m-loan 真值。
3. `pnpm db:reclean` 重建 source_references（真名在 raw `otel_log_events`，重抽即恢复）。
4. 跑可证伪查询确认看板非 0。
