# Tasks:MCP / 远端知识源接入后的可观测性补全

> 背景:当前知识读取的成功/失败口径**只覆盖本地 path 知识库**——
> 投影算子 `worker/src/jobs/profile-projection/knowledge-operator.ts` 只扫
> `locator_type='path'` 且 `isInsideRoot(wiki_root_path)` 的 source reference;
> sdd-default 的知识 source rule(`packages/api/src/profile-config/profiles/sdd-default.ts`)
> 也是 `locatorType:'path', userRootKey:'wiki'`。
>
> 这批待办在「接入远端 MCP 知识源」时触发。此前我们已确认:在纯本地 wiki 下,
> 网络/MCP 类失败 ROI 低、可不修(见 `design-users-analysis-redesign.md` 的归因决策)。
> MCP 一旦接入,以下从 P1 开始按序处理。

## 实测结论(2026-06-22 复测,确定性):失败细分归因是上游限制,接受现状

先在本机用真实遥测跑了 1 成功(`SUMMARY.md`)+ 1 死链,又**在真实交互式 Claude Code 会话**里
复测了一次死链读取(`RETEST-ENOENT-PROBE.md`)。结合 raw payload 与会话 transcript,结论确定:

- **失败工具调用上报的 `error_type = TelemetrySafeError`**(交互式会话与 agent 环境一致,**不是 agent artifact**)。
  这版 Claude Code 把工具错误类型脱敏了;官方文档描述的 `Error:ENOENT`/`ShellError` 在这版**未出现**。
- **没有可用的结构化错误消息**:真实报错文本是 "File does not exist…"(连 `ENOENT`/`no such file` 都不是),
  但它**只存在于 `OTEL_LOG_RAW_API_BODIES` 的整段对话 body 里**,不在 `tool_result` 的任何结构化属性上。
- 所以结构化层面,知识读取失败只能拿到 `error_type=TelemetrySafeError`,**命不中任何 reasonGroup → 落「其他知识库异常」**。

**决定(选项 1):接受现状。** 平台对知识读取失败的天花板 =「成功 / 失败 + 其他知识库异常」,不做死链/权限/网络细分。
> 纠错:本文件早前一版据官方文档写过"平台侧可修(对齐 `Error:ENOENT` + 采集 error 消息)",
> 已被实测推翻——**以实测为准,当前是上游限制**。

**同一约束波及 MCP**:下方 P2 的 `mcp_read_failed`/`network_or_timeout` 在当前 CC 遥测下同样命不中,先别做。

**复测触发(唯一值得回头修的条件)**:升级 Claude Code 后,用同样方法(读一个不存在的 wiki)复测;
若那时 `error_type` 变成 `Error:ENOENT`(且带结构化 `error` 消息),再做"清洗采集 error 消息 +
reasonGroup 兼容 `Error:ENOENT`/`ShellError` + 补 `messageIncludes` 关键词"那套。

## P1 — 前置(不做则 MCP 知识读取根本不进看板)

### 1. 知识 source rule 支持 MCP / 远端 locator
- **触发**:接入 MCP 知识源当天。
- **要确认**:MCP 工具调用(`mcp__<server>__<tool>`)产生的 source_reference 的
  `locator_type` 是什么(很可能不是 `path`,而是 resource/uri)。
- **要做**:给 profile config 增加一条命中 MCP 知识读取的 source rule
  (按 `locatorType` 或 `skillNames/toolNames: ['mcp__*']` + category `knowledge`)。
- **口径**:清晰——"远端知识读取"= 命中该 rule 的 read-class 调用。
- **验收**:一次真实 MCP 文档读取后,`source_references` 里能查到、且 category 归到 knowledge。
- **成本**:中(配置 + 需先确认真实 locator 形态)。

### 2. knowledgeOperator 投影支持非 path locator + source_namespace 口径
- **触发**:同上,#1 之后。
- **要做**:放开 operator 里 `locator_type='path'` + `isInsideRoot(wikiRoot)` 的硬约束,
  让远端 locator 也能投影进 `profile_knowledge_recalls`;并定义远端的
  `source_namespace` / `relative_path` 口径(本地是 `basename(wikiRoot)` + 相对路径,
  远端没有 wikiRoot,需用 MCP server 名 / resource URI 拆解,别再兜底成 `'local'`)。
- **口径**:需新定义——远端"来源空间"和"相对路径"取什么。**这是本批最容易有歧义的一条,先把口径写死再写码。**
- **验收**:MCP 成功读取在快照"知识路径"区出现,namespace 是 MCP server 而非 `local`。
- **成本**:中(operator 改动 + 口径设计)。

## P2 — 失败归因(#1/#2 通了之后才有意义)

### 3. 验证 `mcp_read_failed` reasonGroup 命中真实 MCP 错误
- **触发**:能跑出真实 MCP 读取失败后。
- **现状**:已有 reasonGroup `mcp_read_failed`(`matchErrorTypes: mcp_resource_not_found/
  mcp_error/resource_not_found`,`matchToolNames: ['mcp__*']`,关键词 `MCP resource` 等)。
- **要做**:用真实失败数据验证它命中;不命中就按真实 `error_type`/报错原文调匹配词。
- **口径**:清晰(远端文档不存在/读取失败)。
- **成本**:低(以验证为主,可能微调配置)。

### 4. 新增 `network_or_timeout` reasonGroup(知识失败子原因)
- **触发**:真实出现网络类 MCP 失败、或落进 `other_knowledge_error` 兜底过宽时。
- **要做**:给知识规则加一条 reasonGroup,匹配 `ETIMEDOUT/ECONNREFUSED/ENOTFOUND/
  EAI_AGAIN/getaddrinfo/timeout/network` 等。
- **口径**:清晰——网络层失败,区别于"远端文档不存在"(那是 #3 的 mcp_read_failed)。
- **成本**:极低(~10 行配置 + rebuild api;错误看板一并受益)。

## P3 — 视真实数据再定,别提前建桶

### 5. cleaning 是否需要 error_type 归一化
- **触发**:测试/真实数据显示各 MCP server 的 `error_type` 命名五花八门、
  reasonGroup 靠 `matchErrorTypes` 命不中、全靠 `messageIncludes` 兜。
- **现状**:cleaning 直接透传 raw `error_type`/`error.type`(`cleaning-worker.ts:546`),不归一化。
- **要做**:评估是否在 cleaning 加一层轻量映射(如各类 not-found → `not_found`)。**先看数据再决定,不要提前做。**
- **成本**:中,且仅在确有需要时。

### 6.(可选)非知识工具失败独立区
- **触发**:MCP 工具失败排障确实需要、且不想翻抽屉底部原始"工具调用"列表时。
- **现状**:`tool_execution_failed` 已是独立 category 且已投影进 `profile_error_events`,
  只是快照没单独成区(现只在原始工具列表里以 success=false 露出)。
- **要做**:照搬 `apiErrors` 的模式补一个区(后端一条查询 + 契约字段 + 汇总计数 + 前端一个区)。
- **口径**:清晰(非知识工具失败)。
- **成本**:低中(~1–2h),仍属 borderline,按需。
