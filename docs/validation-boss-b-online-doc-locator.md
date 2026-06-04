# Boss-B 在线文档 locator 可得性验证（可执行方案）

更新时间：2026-06-03
状态：待执行（公司电脑）
关联架构文档：`docs/design-profile-observability-architecture.md`（§8.2、§8.3、§10.2、§13.1、§18.2）

> 本文是可直接执行的 SQL 验证方案。按顺序粘贴每段 SQL、看结果、对照「判定」即可。
> 最终产出：第 9 节回填表 + PASS / 降级 / FAIL 结论。

---

## 1. 背景：为什么这一项是地基

profile 观测架构把证据链抽成统一投影：

```
raw/event/tool call -> source reference -> profile projection -> contract -> dashboard
```

最底层是 **source reference**——把「读/写了哪个资源」归一化成稳定引用。本地路径型 profile（`sdd-default`、boss-a）路径天然稳定，没问题。

但 **boss-b 的知识库和过程文档都是在线文档，走 MCP 读写**。它的 source reference 必须从 MCP 调用日志里抽出一个**稳定 locator**（`docId / url / collectionId` 之一）。抽不出来，会连环失效：

- `source_references` 表对 boss-b 无内容可填。
- `profile_delivery_units.delivery_unit_key` 没有稳定锚点 → 同一篇需求文档的「建 + 多次改」被算成多条需求、时间线断链。
- 知识库分析、产出分析、artifact timeline 整条对 boss-b 不成立。

所以这是 boss-b 能否落地的 **go/no-go 闸门**，必须在冻结 `source_references` 表结构前确认。

## 2. 关键前提：验证对象只有一个

验证的唯一对象是：**boss-b 客户端往 OTLP log 里写了什么。** 平台侧不是变量：

- `otel_raw_payloads.payload_json`：`LONGTEXT`，入库**不截断**（`payload_bytes` 记原始大小）。
- `otel_log_events.attributes_json`：`JSON`，保存**完整** tool input；`body_text` 是 `LONGTEXT` 完整正文。
- `sdd_interaction_tool_calls.tool_input_preview`：截断到 **4096 字节**——只是给人看的预览列，**不是数据源**，本验证基本不依赖它（仅第 6 步负样本用它做快速分组）。

> 一句话：只要 locator 进了 raw / event 原文，投影就能拿到。本验证只需确认「客户端发出的原文里有没有稳定 locator」。

## 3. 表与字段速查（写 SQL 用）

| 表 | 关键列 | 作用 |
|---|---|---|
| `sdd_users` | `id, user_name, machine_name, last_seen_at` | 找你自己的 `user_id` |
| `otel_log_events` | `user_id, session_id, prompt_id, event_name, event_time, attributes_json(JSON 完整), body_text(LONGTEXT 完整), batch_id` | **主检查源** |
| `sdd_interaction_tool_calls` | `interaction_id, tool_use_id, tool_name, sequence, mcp_server_scope, tool_input_preview(4096), evidence_json` | 负样本分组 + 链路证明 |
| `sdd_interactions` | `id, interaction_key, user_id, session_id, prompt_id, started_at` | tool_call 经它关联到 user/session |
| `otel_raw_payloads` | `batch_id, payload_json(LONGTEXT 完整), payload_bytes` | 完整原文兜底 |

注意：`sdd_interaction_tool_calls` **本身没有 user_id / session_id / event_time**，要 `JOIN sdd_interactions ON id = interaction_id` 取。

---

## 4. 受控操作（先做这个，再查 SQL）

不要抓真实日志大海捞针（空集分不清「没有」还是「没匹配上」）。做一次**你知道标准答案**的受控操作，覆盖架构文档要的 3 类样本：

| 样本 | 操作 | 先手抄下的「标准答案」 |
|---|---|---|
| ① 知识库 read 正样本 | 通过 MCP 读 1 篇**已知**知识库文档，URL 形如 `{host}/creditdoc/frontedndoc/<hash>` | 真实 URL / hash |
| ② 过程文档写 正样本 | 通过 MCP **创建** 1 篇 requirements / 过程文档，**再更新同一篇** | 创建后 docId/URL、更新时 docId/URL（核对是否同一个）|
| ③ 负样本 | 通过**同一个 MCP server** 读 1 篇 PRD 或其它无关文档 | 它的 URL（应**不**含 creditdoc）|

样本 ②「建 + 改同一篇」是判断 delivery_unit 能否幂等的唯一办法；样本 ③ 是为了证明「不能只按 MCP server 归类」。

记下**实验开始时间**（精确到分即可）。

---

## 5. 执行环境与变量设置（每次会话先跑这一段）

进 MySQL（容器内库名以实际为准，下例 `sdd`）：

```bash
docker compose exec mysql mysql -uroot -p sdd
```

进去后先设两个变量，后面所有 SQL 复用：

```sql
-- 实验开始时间（你做受控操作的时间，留点提前量）
SET @t0 := '2026-06-04 09:00:00';

-- 先看候选用户，挑出你自己的 id
SELECT id, user_name, machine_name, last_seen_at
FROM sdd_users
ORDER BY last_seen_at DESC
LIMIT 20;
```

从结果里认出你自己那行，把 id 填进来：

```sql
SET @uid := 123;   -- ← 换成你的 user_id
```

---

## 6. 验证步骤（逐段执行，每段带判定）

### Step 1 — 数据落库 sanity + 事件分类盘点

确认这次 session 进来了，并看清楚客户端用了哪些 event_name（不同客户端命名不同，后面要据此收窄）。

```sql
SELECT event_name, COUNT(*) AS n,
       MIN(event_time) AS first_at, MAX(event_time) AS last_at
FROM otel_log_events
WHERE user_id = @uid AND event_time >= @t0
GROUP BY event_name
ORDER BY n DESC;
```

**判定**：结果非空，且能看到工具/MCP 相关事件名（如含 `tool` / `mcp` / `api_request` 等）。
若整个结果为空 → 这次操作没进库（采集/账号/时间窗问题），先解决，别往下走。

### Step 2 — Check 0：tool 调用正文到底有没有上报

这是前置闸门。先看工具事件的 JSON 顶层键，确认有没有 input / result 内容（而不只是 tool 名）。

```sql
SELECT event_time, event_name,
       JSON_KEYS(attributes_json) AS attr_keys,
       CHAR_LENGTH(body_text)     AS body_len
FROM otel_log_events
WHERE user_id = @uid AND event_time >= @t0
  AND attributes_json IS NOT NULL
  AND (event_name LIKE '%tool%' OR event_name LIKE '%mcp%')
ORDER BY event_time;
```

再用布尔列直接判断 input/result 是否存在（覆盖几种常见键名）：

```sql
SELECT event_time, event_name,
       (attributes_json->'$.tool_input'        IS NOT NULL
     OR attributes_json->'$.tool_parameters'   IS NOT NULL
     OR attributes_json->'$."tool.parameters"' IS NOT NULL
     OR attributes_json->'$.input'             IS NOT NULL) AS has_input,
       (attributes_json->'$.tool_result'   IS NOT NULL
     OR attributes_json->'$.tool_response' IS NOT NULL
     OR attributes_json->'$.result'        IS NOT NULL)     AS has_result,
       CHAR_LENGTH(body_text) AS body_len
FROM otel_log_events
WHERE user_id = @uid AND event_time >= @t0
  AND (event_name LIKE '%tool%' OR event_name LIKE '%mcp%')
ORDER BY event_time;
```

**判定**：
- `has_input` / `has_result` 至少有一列为 1（或 `attr_keys` 里能看到入参/返回键、`body_len` 较大）→ Check 0 通过，继续。
- 全是 0、`attr_keys` 只有 tool 名/元数据、`body_len` 很小 → 客户端没开 tool content 上报（类似 `OTEL_LOG_TOOL_CONTENT`）。**这是配置问题不是架构问题**，先开内容上报再重做。Check 0 不过，后面不用看。

### Step 3 — 样本①：知识库 read，抽 URL 并命中前缀

直接搜 `creditdoc`，看它落在结构化 `attributes_json` 还是自由文本 `body_text`：

```sql
SELECT event_time, event_name, session_id, prompt_id,
       JSON_PRETTY(attributes_json) AS attrs,
       LEFT(body_text, 2000)        AS body_head
FROM otel_log_events
WHERE user_id = @uid AND event_time >= @t0
  AND (CAST(attributes_json AS CHAR) LIKE '%creditdoc%'
       OR body_text LIKE '%creditdoc%')
ORDER BY event_time;
```

**判定**：
- URL 出现在 `attrs`（结构化字段）里 → Check 1 高置信。
- 只在 `body_head`（自由文本）里 → 低置信，记为「降级」信号。
- 核对真实 URL 是否逐字符命中 `{host}/creditdoc/frontedndoc/`，并确认架构文档里 `frontedndoc` 的拼写与真实一致 → Check 4。

### Step 4 — 样本②：过程文档 create / update，抽 locator 并验稳定性

先把这段时间所有工具/MCP 事件的完整 JSON 按时间列出来，对照你受控操作的顺序认出「创建」和「更新」两条：

```sql
SELECT event_time, event_name, session_id,
       JSON_PRETTY(attributes_json) AS attrs,
       LEFT(body_text, 2000)        AS body_head
FROM otel_log_events
WHERE user_id = @uid AND event_time >= @t0
  AND (event_name LIKE '%tool%' OR event_name LIKE '%mcp%')
ORDER BY event_time;
```

从「创建」那条里读出 docId/collectionId/url（记作 `<DOCID>`），然后验证它在「更新」事件里是否复现——这是稳定性的关键证据：

```sql
-- 把 <DOCID> 换成第②步创建拿到的稳定 id
SELECT event_time, event_name,
       (CAST(attributes_json AS CHAR) LIKE '%<DOCID>%') AS in_attrs,
       (body_text LIKE '%<DOCID>%')                     AS in_body
FROM otel_log_events
WHERE user_id = @uid AND event_time >= @t0
ORDER BY event_time;
```

**判定**：
- `<DOCID>` 同时出现在「创建」和「更新」事件，且是 docId/collectionId（不是会变的 hash/title）→ Check 3 通过，delivery_unit 可幂等。
- 创建和更新拿到的是不同 id / 每次新 hash → Check 3 失败（阻塞项）。
- 同时确认能区分 action 是 create/update（看 event_name、tool_name 或入参里的 action 字段），而不是只读。

### Step 5 — 样本③：负样本，证明不能按 MCP server 归类

读 PRD/无关文档那条，应当**走同一个 MCP server 却不含 creditdoc**。用平台已解析的 `mcp_server_scope` 分组，看同一个 server 是否服务了多种文档：

```sql
SELECT t.mcp_server_scope,
       COUNT(*)                                          AS total_calls,
       SUM(t.tool_input_preview LIKE '%creditdoc%')      AS hits_creditdoc,
       COUNT(*) - SUM(t.tool_input_preview LIKE '%creditdoc%') AS non_knowledge
FROM sdd_interaction_tool_calls t
JOIN sdd_interactions i ON i.id = t.interaction_id
WHERE i.user_id = @uid AND i.started_at >= @t0
  AND t.mcp_server_scope IS NOT NULL
GROUP BY t.mcp_server_scope;
```

逐条看同一 server 下的调用（确认知识库文档和 PRD 出自同一 `mcp_server_scope`）：

```sql
SELECT i.started_at, t.sequence, t.tool_name, t.mcp_server_scope,
       LEFT(t.tool_input_preview, 300) AS input_head
FROM sdd_interaction_tool_calls t
JOIN sdd_interactions i ON i.id = t.interaction_id
WHERE i.user_id = @uid AND i.started_at >= @t0
ORDER BY i.started_at, t.sequence;
```

> 注：`tool_input_preview` 截断到 4096，URL 一般在前部不受影响；若 PRD 的 locator 落在 4096 之后，回到 Step 4 的查询用 `otel_log_events` 全文判断。

**判定**：
- 同一个 `mcp_server_scope` 既有命中 creditdoc 的调用、又有不命中的（`non_knowledge > 0`）→ **负样本成立**：MCP server 不是语义边界，必须按 URL/docId/collection 归类。这正是架构 §4.5 的要求被现实验证。
- 若两类文档恰好走不同 server，也要在结论里写明（此时 server 区分能用，但架构仍应以 URL/docId 为准，避免未来合并 server 时回归）。

### Step 6 — 链路证明：source ref 能回连 interaction / session / tool call

未来的 source_reference 要支持多轮归因，必须能从一次工具调用回连到 interaction / session / prompt / user：

```sql
SELECT t.tool_use_id, t.tool_name, t.mcp_server_scope, t.sequence,
       i.interaction_key, i.session_id, i.prompt_id, i.user_id, i.started_at
FROM sdd_interaction_tool_calls t
JOIN sdd_interactions i ON i.id = t.interaction_id
WHERE i.user_id = @uid AND i.started_at >= @t0
ORDER BY i.started_at, t.sequence;
```

**判定**：每行都能拿到 `session_id` + `prompt_id` + `tool_use_id` 三者关联 → 链路完整，后续可做「写文档前若干轮讨论」归因。若大量 `session_id`/`prompt_id` 为空 → 归因能力受限，记为风险。

### Step 7 — 兜底：导出完整 raw 原文

当上面某字段疑似被截断、或要留 100% 原文存档时用。`otel_raw_payloads` 无 user_id，需 join 过滤：

```sql
SELECT r.id, r.payload_bytes, r.payload_json
FROM otel_raw_payloads r
JOIN otel_log_events e ON e.batch_id = r.batch_id
WHERE e.user_id = @uid AND e.event_time >= @t0
  AND (CAST(e.attributes_json AS CHAR) LIKE '%creditdoc%'
       OR e.body_text LIKE '%creditdoc%')
GROUP BY r.id, r.payload_bytes, r.payload_json
ORDER BY r.id DESC;
```

把 `payload_json` 重定向到文件保存（终端里勿截断）：
```bash
docker compose exec mysql mysql -uroot -p -N -e \
"SELECT r.payload_json FROM sdd.otel_raw_payloads r \
 JOIN sdd.otel_log_events e ON e.batch_id=r.batch_id \
 WHERE e.user_id=<uid> AND e.event_time>='<t0>' \
 AND CAST(e.attributes_json AS CHAR) LIKE '%creditdoc%';" > boss-b-raw-sample.json
```

---

## 7. 验收标准（综合三类样本）

### 🟢 PASS — boss-b 按原架构落地
- Step 2 Check 0 过；且
- Step 3：知识库 read 从结构化字段稳定抽出 URL/hash，高置信命中 `{host}/creditdoc/frontedndoc/`；且
- Step 4：requirements create/update 抽出稳定 locator，create 与 update 是**同一个 docId/collectionId**，且能区分 action；且
- Step 5：同 MCP 的 PRD/其它文档能靠 URL/docId 与知识库区分，不误判；且
- Step 6：source reference 能关联回 interaction / tool call / session；
- 且全程不依赖 prompt 关键词猜测也能分类。
- → §8 / §10.3 的 `source_references` 与 `delivery_unit` 成立，boss-b 全链路可做。

### 🟡 降级 — boss-b 部分能力，架构调整但不推翻
- locator 只在 `body_text` 自由文本里 → 按 §4.4 进下钻证据、不进核心 KPI；或
- 知识库 read 拿得到稳定 locator、但过程文档 write/update 拿不到 → boss-b **只做知识库分析**，delivery_unit / artifact / timeline 整条用 manifest（§15.3）关掉。

### 🔴 FAIL — 架构假设不成立，回设计
- Step 2：tool content 长期开不出 → 连事实层都没有，先解决采集；或
- Step 4：create 与 update 拿不到同一稳定 id（全是新 hash/新 URL）→ `delivery_unit_key` 无法幂等，§6.1/§10.3 立不住；或
- Step 5：同 MCP 的不同文档类型无法靠 URL/docId/collection/docType 区分；或
- URL/docId 只出现在模型自然语言 response 里，且 raw/tool result 没有结构化保留。

---

## 8. 脱敏与留痕约束

导出样本时可脱敏正文、用户名、token、host 域名，但**不要破坏**：

- 字段名（key 名）
- URL 路径结构（`/creditdoc/frontedndoc/<hash>` 的层级）
- hash / docId 的稳定性（create 与 update 必须看得出是否同一个）
- session / prompt / tool_call 的关联关系

不充分的证据：只有页面截图、或只有大段自然语言 response —— 不足以判断清洗可靠性。

---

## 9. 回填表（执行完抄回来即可判定）

```
[Step1] 事件落库？      非空 / 空        看到的工具事件名 = ____________
[Step2] tool 正文上报？ has_input=__  has_result=__  body_len≈__
[Step3①] read locator = ____________  位置 = attrs / body   命中creditdoc前缀? 是/否
[Step4②] create docId = ____________
         update docId = ____________   ← 与create一致? 是/否   能区分create/update? 是/否
[Step5③] 同一 mcp_server_scope = ____________  其下 non_knowledge 调用数 = __（>0 即负样本成立）
[Step6] session_id/prompt_id/tool_use_id 三者齐全? 是/否
[体积]  含 locator 那条 payload_bytes = ____（>4096 没关系，raw 不截断）
```

把这几行填回来，对照第 7 节即可判 PASS / 降级 / FAIL，并据此决定架构文档 §13.1 实施顺序：直接全量做 boss-b，还是先只上知识库分析、把产出链路 manifest 降级。

## 10. 不需要做的事

- 不需要导整库、不需要截图整个会话。
- 不需要关心 4096 截断 / 平台清洗逻辑（验证只看 raw / event 原文）。
- 只要：**一次受控 session（①②③ 三类操作）+ 第 6 节各 Step 的 SQL 结果 + 第 9 节回填表。**
