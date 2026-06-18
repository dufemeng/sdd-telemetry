# Profile 化研发观测平台架构设计

更新时间：2026-06-07
状态：架构方案
目标读者：平台设计/实现者，后续 MVP 实施文档以本文为边界

## 1. 背景

当前平台已经围绕 SDD 工作流跑通了完整观测链路：

```text
用户 prompt
  -> skill 调用
  -> 知识库读取
  -> requirements 过程文档写入
  -> 需求 / artifact / wiki recall 派生
  -> 总览、用户分析、技能分析、产出分析、知识库分析、链路下钻
```

这套能力已经被验证有管理价值，但它目前和 SDD 绑定较深：

- 语义映射以 `sdd_skill_semantics / sdd_skill_aliases` 为中心。
- 需求识别依赖 `requirements_root_path`。
- 知识库识别依赖 `wiki_root_path`。
- 核心查询以 `sdd_*` 表为事实来源。
- 页面文案和指标口径默认假设 proposal / design / task / codereview 这套 SDD 阶段。

老板 A 和老板 B 的诉求说明平台需要从“SDD 专用观测台”演进为“可配置研发观测平台”：

- 老板 A：大仓库 / monorepo 形态，根目录有 `docs`、`plan`、`frontend_repo`、`backend_repo`。`plan` 类似当前 requirements，`docs` 类似当前 wiki，前后端代码在不同代码目录下交付。
- 老板 B：有自己的 skill 工作流，名称与当前 SDD 不同；知识库和过程文档都是在线文档，通过 MCP 读取或创建/更新；同一个 MCP 可能同时读取 PRD、知识库、过程文档和其它文档，不能把 MCP server 当作语义边界。

本文的核心设计是引入 profile 观测模型：把 SDD 作为第一套内置 profile，而不是把平台继续写死在 SDD 模型上。

## 2. 目标

### 2.1 产品目标

第一期目标是用同一套 profile 观测架构跑通三类 profile：

- `sdd-default`：当前 SDD 工作流的内置 profile，必须保护现有能力和历史数据。
- `e2e-monorepo`：本地 monorepo + 固定目录约定。
- `online-docs`：在线知识库 + 在线过程文档 + 自定义 skill/MCP 工作流。

第一期不是做任意团队自助接入平台，也不是做低代码配置系统。profile 配置先用版本化配置文件和 seed/migration 初始化，等 A/B 规则稳定后再考虑管理页面。

### 2.2 架构目标

1. 看板、监控、告警、评测等上层能力依赖稳定的 Profile Observability Contract，不直接依赖某个 profile 的私有实现。
2. profile 不是团队、用户或 session 维度，而是对事实事件的投影规则。同一个用户、同一个 session 可以出现多个 profile 的证据链。
3. Dashboard 必须始终处在单 profile 视角，不提供 all-profile 汇总，避免跨 profile 重复计数。
4. `sdd-default` 必须渐进适配新架构，先全量 shadow projection 对账，再切 dashboard 读源，保留旧 `sdd_*` 回退路径。
5. 第一阶段复用现有 raw/event/interaction/tool call 事实层，不重建完整 `canonical_*` 表体系，只补必要的 source reference 和 profile projection。
6. 代码实施环节纳入第一期轻量能力，只回答是否进入代码实施，不做需求级代码落地强归因。

## 3. 非目标

第一期明确不做：

- 不删除或重命名现有 `sdd_*` 主链路表。
- 不把所有历史页面一次性重写成全新信息架构。
- 不做 all-profile 汇总看板。
- 不做跨 profile 冲突判定。
- 不用标题、关键词、prompt 上下文作为核心 KPI 的主要分类依据。
- 不把 MCP server 当作知识库或过程文档的语义边界。
- 不关注“读取 requirements / 过程文档”这个指标。
- 不关注“写 wiki / 维护知识库”这个指标。
- 不做需求级代码改动强归因、PR/commit 闭环、代码质量评测。
- 不提前建设 alert/evaluation 专用业务表，只在字段和 manifest 上为后续扩展留口。

## 4. 核心原则

### 4.1 Profile 是观测口径，不是组织口径

profile 表示一套研发工作流观测规则，例如：

```text
sdd-default
e2e-monorepo
online-docs
```

它不等于团队，也不等于用户。一个用户可以同时使用多个 profile；同一个 session 里也可以出现多套工作流证据。

### 4.2 Dashboard 单 profile 视角

所有 dashboard、下钻、日报、未来监控和评测入口都必须带 `profileId`。全站应有一个 Profile Switcher，和当前 `timeRange` 同级。切换 profile 后：

- 总览
- 用户分析
- 能力分析
- 产出分析
- 知识库分析
- 需求链路下钻
- 代码实施概况

都进入同一个 profile 视角。

不提供“所有 profile 汇总”的老板看板。跨 profile 多投影会导致全局汇总重复计数，除非未来单独设计去重口径，否则不能作为管理指标。

### 4.3 跨 profile 不判冲突

同一个 evidence event 可以被多个 profile 高置信命中。比如同一次工具调用可能既命中 `sdd-default` 的 wiki 规则，也命中另一个 profile 的知识库规则。

第一期不做跨 profile conflict / ambiguous。因为 profile 是不同观测口径的独立投影，跨 profile 互斥会增加误判风险，也不是最简路径。

处理原则：

```text
跨 profile：允许多投影，不判冲突。
同 profile：用规则 priority 单选。
同 profile、同 category、同 priority、同 event 命中多个互斥规则：标记 ambiguous，不进核心 KPI。
```

### 4.4 只统计高置信命中

老板看板只统计 `confidence=high` 且非 ambiguous 的派生数据。

高置信来源包括：

- 本地路径命中明确 root/path glob。
- 在线文档 URL 命中明确 urlPrefix。
- MCP 返回稳定 `docId / url / spaceId / collectionId / docType` 并命中 source registry。
- capability 名称命中显式 alias。
- artifact 文件名命中显式 artifact pattern。

低置信来源，例如标题关键词、prompt 上下文猜测，只能进入下钻证据或待归类队列，不能进入核心 KPI。

### 4.5 MCP 是传输层，不是语义边界

同一个 MCP server 可能读取 PRD、知识库、过程文档、临时文档和其它在线资源。因此不能用“来自某 MCP server”直接判断知识库或过程文档。

在线文档必须通过 source registry 归类：

- URL prefix
- docId pattern
- spaceId / collectionId
- docType
- action type
- 可选 denylist

未命中 source registry 的 MCP 读取，只能进入 unknown source reference，不进入核心 KPI。

## 5. 总体架构

目标分层：

```text
Dashboard / Monitor / Alert / Evaluation
  -> Profile Observability Contract
    -> profile projection tables + reusable projection operators
      -> canonical facts
        -> raw events
```

中文解释：

| 层级 | 职责 | 第一期落地 |
| --- | --- | --- |
| raw events | 保存原始证据，不理解业务工作流 | 复用 `otel_raw_payloads`、`otel_log_events` |
| canonical facts | 平台通用事实语言，不绑定 profile | 复用 `sdd_interactions`、`sdd_interaction_tool_calls`，新增最小 source reference |
| profile projection | 用 profile 规则把事实投影成需求、能力、artifact、知识召回、代码活动 | 新增 `profile_*` 派生表 |
| Profile Observability Contract | 给页面/日报/监控提供稳定 profile 视角 API | 新增 `/api/profiles/*` 或同等 contract |
| Dashboard / Monitor / Alert / Evaluation | 产品能力，只依赖 contract 和 manifest | 第一阶段覆盖现有总览与四大看板，预留监控/告警/评测 |

### 5.1 DIP 在本项目中的含义

这里的 DIP 不是为了做复杂抽象，而是让高层产品功能不依赖低层具体工作流。

当前依赖方向：

```text
Dashboard -> sdd_* tables / SDD fields / SDD stages
```

目标依赖方向：

```text
Dashboard / Monitor / Alert / Evaluation
  -> Profile Observability Contract

sdd-default / e2e / online-docs
  -> Profile Projection
  -> Profile Observability Contract
```

现实边界：

- 改看板布局、筛选、趋势、下钻和展示，不应该感知 A/B/SDD 的清洗细节。
- 新增通用指标时，通常需要扩展 profile projection contract 和通用算子。
- 某些 profile 暂不支持某能力时，通过 manifest 降级，而不是让页面硬编码 `if sdd`。

## 6. 证据链模型

通用证据链：

```text
interaction
  -> capability invocation
  -> evidence event
  -> source reference
  -> delivery unit
  -> artifact / knowledge recall / code change
```

中文定义：

| 概念 | 中文含义 | 当前 SDD 对应物 |
| --- | --- | --- |
| interaction | 一轮用户对话，含 prompt/response/session/user | `sdd_interactions` |
| capability invocation | 一次能力调用，可以是 skill、command、MCP tool、subagent | `sdd_skill_usages` |
| evidence event | 真实观测到的证据事件，如读写文件、MCP 读写在线文档 | `otel_log_events` / tool call |
| source reference | 被读写资源的统一引用，本地路径或在线文档 URL/docId | 当前分散在 tool input / wiki recall / artifact path |
| delivery unit | 通用架构里的交付单元，产品页面仍可叫“需求” | `sdd_work_items` |
| artifact | 过程文档类产出 | `sdd_work_item_artifacts` |
| knowledge recall | 知识库读取 | `sdd_wiki_recalls` |
| code change | 代码读写/实施信号 | 现有日报和用户页的 code impact |

### 6.1 需求 vs delivery unit

架构文档中使用 delivery unit 是为了泛化；产品展示第一期继续叫“需求”，降低理解成本。

不同 profile 的 delivery unit 来源不同：

- `sdd-default`：requirements 目录下的需求目录。
- `e2e-monorepo`：`plan` 目录下的计划/过程文档目录或文件。
- `online-docs`：在线过程文档的稳定 locator，如 URL prefix + doc hash / docId / collectionId。

### 6.2 过程文档 vs 过程产物

第一期可以认为：

```text
过程产物 = 被 profile 规则识别出来的过程文档 artifact
```

当前站点里 artifact 主要以“文档总产出”“文档列表”“阶段覆盖 artifact”出现。它实际统计的是 proposal/design/tasks/codereview 等过程文档。

未来过程产物可以扩展为更宽的研发产出，例如：

- 评审记录
- 验收记录
- 测试报告
- 接口契约
- 代码变更摘要

但第一期产品文案仍可叫“文档”或“文档产出”，不强行引入“过程产物”。

## 7. Profile 配置模型

profile 配置第一期使用代码仓库中的 JSON/TS 配置文件，配合 schema 校验和 seed 数据。不做完整后台配置 UI，也不做多版本 profile 管理。

建议结构：

```ts
type WorkflowProfileConfig = {
  profileId: string;
  displayName: string;
  status: 'active' | 'disabled';
  projectionMode: 'sdd_bridge' | 'source_backed';
  manifest: ProfileCapabilityManifest;
  sourceRules: SourceRule[];
  capabilityRules: CapabilityRule[];
  deliveryUnitRules: DeliveryUnitRule[];
  artifactRules: ArtifactRule[];
  knowledgeRules: KnowledgeRule[];
  attributionPolicy: AttributionPolicy;
};
```

代码目录不再使用独立 `codeSourceRules` 入口；第一期统一由 `sourceRules` 中 `category='code'` 的规则表达，避免代码实施环节绕开 Source Registry。

每条规则至少包含：

```ts
type ProfileRuleBase = {
  ruleId: string;
  priority: number;
  confidence: 'high' | 'medium' | 'low';
  enabled: boolean;
  description?: string;
};
```

派生数据必须记录：

```text
profile_id
projection_run_id
matched_rule_id
confidence
evidence_json
rule_version
```

第一期只有“当前 profile 配置”这一版。`projection_run_id` 用于追溯本行由哪次全量投影生成；`rule_version` 表示 source extraction / projection 算子的实现版本，不表示 profile 多版本。dashboard 读路径永远读取当前 profile 的 projection 结果，不按配置版本选择数据。

幂等 key 不包含 profile 版本。重跑同一个 profile 时，必须按 profile 清理旧 projection 后重建，或通过等价的 current run 机制确保旧行不会参与读路径，避免同一事实被多版规则重复计数。

`projectionMode` 是 worker projection 和 diff gate 的分发键：

- `sdd_bridge`：当前 `sdd-default` 的 legacy bridge / parity 路径。
- `source_backed`：从 `source_references + sourceRules` 投影的通用路径，适用于 端到端 Monorepo profile、本地路径类 profile，以及后续 URL / MCP 文档类 profile。

operator / diff 分发不应按 `e2e-monorepo` 或 `sdd-default` profile id 特判。

### 7.1 Capability Manifest

manifest 声明 profile 当前支持哪些观测能力。页面只读 manifest，不硬编码 profile 类型。

```ts
type ProfileCapabilityManifest = {
  capabilityUsage: boolean;
  deliveryUnits: boolean;
  artifacts: boolean;
  artifactTimeline: boolean;
  knowledgeRecalls: boolean;
  codeChanges: boolean;
  errors: boolean;
  evaluation: boolean;
  alerts: boolean;
};
```

第一期能力边界：

| 能力 | 第一期要求 |
| --- | --- |
| capabilityUsage | 必须 |
| deliveryUnits | 必须 |
| artifacts | 必须 |
| artifactTimeline | 必须覆盖 `sdd-default`，A/B 按 source 能力逐步接入 |
| knowledgeRecalls | 必须 |
| codeChanges | 做轻量概况 |
| errors | 保留现有错误归因能力，profile 化时接入 |
| evaluation | 只预留，不建评测业务表 |
| alerts | 只预留，不建告警业务表 |

## 8. Source Registry

source registry 是 profile 的语义边界。它决定一个 source reference 是知识库、过程文档、代码目录还是其它资源。

### 8.1 本地路径 source

适用于 `sdd-default` 和老板 A。

```ts
type LocalPathSourceRule = ProfileRuleBase & {
  locatorType: 'path';
  category: 'process_doc' | 'knowledge' | 'code';
  rootEnv?: string;
  rootPath?: string;
  fallbackBaseEnv?: string;
  relativeRoot?: string;
  includeGlobs?: string[];
  excludeGlobs?: string[];
  actions: Array<'read' | 'write' | 'update' | 'delete'>;
};
```

示例：老板 A。

```ts
sourceRules: [
  {
    ruleId: 'e2e-plan-docs',
    priority: 100,
    confidence: 'high',
    enabled: true,
    locatorType: 'path',
    category: 'process_doc',
    rootEnv: 'E2E_PLAN_ROOT',
    fallbackBaseEnv: 'E2E_MONOREPO_ROOT',
    relativeRoot: 'plan',
    includeGlobs: ['**/*.md'],
    actions: ['write', 'update']
  },
  {
    ruleId: 'e2e-knowledge-docs',
    priority: 100,
    confidence: 'high',
    enabled: true,
    locatorType: 'path',
    category: 'knowledge',
    rootEnv: 'E2E_KNOWLEDGE_ROOT',
    fallbackBaseEnv: 'E2E_MONOREPO_ROOT',
    relativeRoot: 'docs',
    includeGlobs: ['**/*.md'],
    actions: ['read']
  }
]
```

`fallbackBaseEnv + relativeRoot` 只是部署便利机制。通用 matcher / projection 只能消费解析后的 root，不能在实现中硬编码 端到端 Monorepo profile 目录后缀。

### 8.2 在线文档 source

适用于老板 B。

```ts
type OnlineDocSourceRule = ProfileRuleBase & {
  locatorType: 'url' | 'mcp_doc';
  category: 'process_doc' | 'knowledge' | 'code' | 'unknown';
  mcpServer?: string;
  toolNames?: string[];
  urlPrefix?: string;
  docIdPattern?: string;
  spaceId?: string;
  collectionId?: string;
  docType?: string;
  actions: Array<'read' | 'write' | 'update' | 'delete'>;
  deny?: {
    urlPrefixes?: string[];
    titlePatterns?: string[];
    docTypes?: string[];
  };
};
```

老板 B 的知识库规则根据已知信息可以高置信配置：

```text
category: knowledge
locatorType: url
urlPrefix: {host}/creditdoc/frontedndoc/
resourceId: URL 后缀 hash
actions: read
```

注意：

- 同一个 MCP 读取其它 URL，不进入知识库指标。
- PRD、过程文档和知识库都通过同 MCP 时，必须依赖 URL/docId/collection，而不是 MCP server。
- denylist 和标题/prompt 辅助规则可以存在，但第一期不是必填，也不进入核心高置信口径。
- `product_doc` 暂不作为第一期 category；PRD / requirements / 过程文档先统一归 `process_doc`。URL / MCP schema 在老板 B 真实 source reference 验证前属于 provisional readiness，不冻结。

### 8.3 B profile 待验证项

老板 B 的真实源日志需要补充验证：

- 在线知识库 URL / hash 出现在 tool input、tool result，还是 response 文本。
- 是否有稳定字段：`docId / url / title / collectionId / spaceId / docType`。
- 创建/更新 requirements 在线过程文档时，是否也能稳定拿到 URL/docId/collectionId。
- 当前 OTel 是否保留足够 tool result 结构用于清洗 source reference。

在源日志确认前，架构假设 B 的 requirements 在线文档也有稳定 locator；MVP 实施文档应把该项列为启动前验收。

#### 8.3.1 公司电脑最小验证流程

在公司电脑上跑一组受控流程，目标不是验证业务正确性，而是验证 source reference 的数据可得性。

最少执行四个动作：

1. 通过 MCP 读取一篇知识库文档，URL 命中 `{host}/creditdoc/frontedndoc/<hash>`。
2. 通过同一个 MCP 读取一篇非知识库文档，例如 PRD 或其它普通在线文档，作为负样本。
3. 通过 MCP 创建一篇 requirements / 过程文档。
4. 对第 3 步创建的同一篇 requirements / 过程文档再更新一次。

执行时记录：

- 大致开始/结束时间。
- 相关 session 是否同一个。
- 每一步对应的文档 URL/docId，如果页面或 MCP 返回里能看到。

导出证据优先级：

1. `otel_raw_payloads.payload_json` 原始 payload，优先级最高。
2. 对应时间段的 `otel_log_events` 行，至少包含 `event_name / event_time / event_sequence / session_id / prompt_id / attributes_json / body_json / body_text`。
3. 对应 interaction 的 `sdd_interaction_tool_calls` 行，至少包含 `tool_name / tool_input_preview / evidence_json / sequence`。

如果只能拿到页面截图或模型自然语言 response，不能作为通过依据。

#### 8.3.2 需要确认的字段位置

对四个动作分别确认：

| 动作 | 必须确认 |
| --- | --- |
| 知识库 read | URL/hash 是否在 tool input 或结构化 tool result 中；是否命中知识库 urlPrefix |
| 非知识库 read | 同 MCP 下 locator 是否不会命中知识库或过程文档规则 |
| requirements create | 新文档的稳定 locator 在哪里：tool input、tool result、body_json、body_text 还是 response 文本 |
| requirements update | 是否和 create 命中同一个 docId/url/collectionId；是否能区分 update 动作 |

尤其要验证 tool result。知识库 read 的 URL 往往在 tool input 里；但 create 新文档时，稳定 docId/url 可能只出现在 tool result 里。如果 tool result 没有被当前 OTel 保留下来，B profile 的过程文档 artifact 归因会被阻塞。

#### 8.3.3 编码层数要求

source reference 抽取算子必须支持 double-encoded JSON。OTel 里复杂 tool input/result 可能不是对象，而是“内容本身又是 JSON 的字符串”。

验证时需要判断：

- `tool_input` 是否是一层 JSON 对象，还是 JSON string 里再包一层对象。
- `tool_result` 是否也是同样结构。
- MCP result 是否存在更深层包装，例如 `content: [{ type: "text", text: "<JSON string>" }]`。

架构要求：

- extractor 可以连续解码受控层数，例如最多 2-3 层。
- 解码失败不能中断整次 projection run，只能把该 source reference 标为 unknown / parse_failed。
- extractor 应优先从完整 raw/event 字段读取，不应依赖可能被截断的 preview 字段。

#### 8.3.4 通过标准

B source reference 数据可得性通过条件：

1. 知识库 read 能抽出稳定 URL/hash，并高置信命中 `{host}/creditdoc/frontedndoc/`。
2. 同 MCP 的 PRD/其它文档不会误判为知识库或过程文档。
3. requirements create 能抽出稳定 locator，例如 docId、URL 或 collectionId。
4. requirements update 能命中和 create 相同的 locator，证明 delivery unit / artifact 可以稳定 upsert。
5. create/update 的 locator 来自结构化 tool input/result/raw event，而不是只能靠模型自然语言 response 猜。
6. 每条 source reference 能回连到 tool call、interaction、session 和 event_time。

阻塞条件：

- create/update 没有稳定 locator。
- locator 只出现在自然语言 response，raw/event/tool result 中没有结构化保留。
- tool result 被截断，无法稳定解析 docId/url。
- 同 MCP 的非知识库文档无法通过 URL/docId/collection/docType 与知识库区分。

## 9. 可复用投影算子

“算子”指 worker/server 侧的领域清洗函数，形态接近纯函数：

```ts
operator(inputFacts, profileConfig) => projectedFacts
```

算子要求：

- 输入尽量是 canonical facts 或现有事实层查询结果。
- 配置来自 profile。
- 输出带 `profileId / profileVersion / matchedRuleId / confidence / evidenceIds`。
- 幂等，可全量重跑。
- 不直接知道 SDD、A、B。

第一期需要沉淀的算子：

| 算子 | 输入 | 输出 |
| --- | --- | --- |
| `extractSourceReferences` | tool calls / events | 本地路径或在线文档 source reference |
| `matchSourceByPathGlob` | source reference + path rules | matched source |
| `matchSourceByUrlPrefix` | source reference + URL rules | matched source |
| `matchCapabilityInvocations` | interactions/events + capability rules | profile capability usages |
| `resolveDeliveryUnitsFromPath` | matched process_doc path | delivery unit |
| `resolveDeliveryUnitsFromOnlineDoc` | matched online process_doc locator | delivery unit |
| `matchArtifacts` | write/update process_doc source | artifact |
| `attributeCapabilityBeforeArtifact` | same session facts | artifact -> capability |
| `attributeTurnsBeforeWrite` | same session interactions + write event | artifact timeline discussion nodes |
| `countKnowledgeRecalls` | read knowledge source | knowledge recall |
| `matchCodeActivities` | read/write code source | code activity |

### 9.1 分类和归因分离

分类可以理解为双层扫描：

```ts
for (const profile of profiles) {
  for (const fact of canonicalFacts) {
    const match = matchBestRuleWithinProfile(profile, fact);
    if (match?.confidence === 'high') {
      deriveForProfile(profile, fact, match);
    }
  }
}
```

但归因不能完全忽略 session / interaction，因为当前最有价值的能力依赖上下文：

- 多轮对话归因：某次写文档前的讨论 turn 需要按 `session_id + time window + write event` 归到 artifact。
- 能力调用归因：文档写入需要归到同 session 内写入前最近的 capability/skill/command。
- 知识召回归因：wiki read 需要通过 tool call / interaction / capability / delivery unit 串到链路。

因此第一期应拆为两步：

1. 高置信命中：用 profile 规则识别 source、capability、artifact、knowledge、code。
2. 上下文归因：用 session、interaction、event_time、event_sequence 把周边证据串起来。

## 10. 数据模型演进

### 10.1 一库多层，不是两套数据库

仍然使用同一个 MySQL：

```text
同一个 MySQL
  raw / event / interaction / tool_call 事实层
  旧 SDD 派生表：sdd_skill_usages / sdd_work_items / sdd_wiki_recalls ...
  新 profile 派生表：profile_capability_usages / profile_delivery_units / profile_knowledge_recalls ...
```

旧 `sdd_*` 表先不删，负责：

- 保护现有页面和历史能力。
- 做新旧对账。
- 作为切换失败时的回退。

新 `profile_*` 表负责承接：

- `sdd-default`
- `e2e-monorepo`
- `online-docs`
- 后续 profile

### 10.2 第一期事实层

第一期不新建完整 `canonical_*` 表体系，复用现有事实层：

- `otel_raw_payloads`
- `otel_log_events`
- `sdd_interactions`
- `sdd_interaction_texts`
- `sdd_interaction_tool_calls`

只补一个 profile-free 的 source reference 表，统一本地路径和在线文档 locator。

建议表：`source_references`

核心字段：

| 字段 | 说明 |
| --- | --- |
| `id` | 主键 |
| `reference_key` | 幂等 key |
| `interaction_id` | 关联 interaction |
| `tool_call_id` | 关联 tool call |
| `user_id` | 用户 |
| `session_id` | session |
| `prompt_id` | prompt |
| `action_type` | read / write / update / delete |
| `locator_type` | path / url / mcp_doc / unknown |
| `raw_locator` | 原始路径或 URL |
| `normalized_locator` | 归一化 locator |
| `mcp_server` | MCP server，可空 |
| `mcp_tool_name` | MCP tool，可空 |
| `doc_id` | 在线文档 ID，可空 |
| `url` | 在线文档 URL，可空 |
| `title` | 在线文档标题，可空 |
| `space_id` | 在线空间，可空 |
| `collection_id` | 在线集合，可空 |
| `doc_type` | 文档类型，可空 |
| `event_time` | 事件时间 |
| `evidence_json` | 抽取证据 |
| `rule_version` | source reference 抽取规则版本 |

`reference_key` 生成建议。`tool_call_id` 不存在时，用 `event_id` 或其它稳定 evidence id 兜底：

```text
sha256(
  stable_evidence_id + ":" +
  direction(input|result|event) + ":" +
  action_type + ":" +
  locator_type + ":" +
  normalized_locator
)
```

一条 tool call 可以产生多条 source reference。例如：

- tool input 里有一个待读取 URL。
- tool result 里返回一个新建在线文档 docId。
- grep/glob result 如果能结构化解析出多个文件，可按每个 normalized locator 生成多行；如果只能拿到查询路径或 pattern，则只生成查询级 source reference。

重复 projection 时，同一个 source reference 必须按 `reference_key` 幂等 upsert，不允许重复插入。

### 10.3 第一期 profile projection 表

只建 dashboard + 链路下钻必需表，不提前建 alert/evaluation 专用表。

建议最小表集：

```text
profile_projection_runs
profile_capability_usages
profile_delivery_units
profile_artifacts
profile_artifact_writes
profile_artifact_turns
profile_knowledge_recalls
profile_code_activities
```

#### profile_projection_runs

记录每次投影运行。第一期只实现全量投影，增量和回填只是字段预留：

| 字段 | 说明 |
| --- | --- |
| `profile_id` | profile |
| `run_type` | full / incremental / backfill；第一期只实现 full，其余预留 |
| `status` | running / completed / failed |
| `started_at` / `completed_at` | 运行时间 |
| `source_range_json` | 本次扫描范围 |
| `stats_json` | 派生数量与差异 |
| `error_message` | 错误 |

#### profile_capability_usages

对应当前 `sdd_skill_usages` 的通用版本：

| 字段 | 说明 |
| --- | --- |
| `profile_id` | profile |
| `projection_run_id` | 来源 projection run |
| `usage_key` | 幂等 key |
| `interaction_id` | interaction |
| `delivery_unit_id` | 可空，后续归因 |
| `user_id` / `session_id` / `prompt_id` | 上下文 |
| `raw_capability_name` | 原始 skill/command/tool 名 |
| `capability_code` | profile 内稳定能力编码 |
| `display_name` | 展示名 |
| `capability_source` | skill / command / mcp_tool / subagent |
| `trigger_source` | 用户触发 / 自动触发来源；`sdd-default` 对齐 `sdd_skill_usages.invocation_trigger` |
| `status` | started / completed / failed / unknown |
| `event_time` | 时间 |
| `matched_rule_id` / `confidence` / `evidence_json` / `rule_version` | 证据 |

#### profile_delivery_units

对应当前 `sdd_work_items` 的通用版本，页面仍可叫“需求”：

| 字段 | 说明 |
| --- | --- |
| `profile_id` | profile |
| `projection_run_id` | 来源 projection run |
| `delivery_unit_key` | 幂等 key |
| `source_reference_id` | 主锚点，可空 |
| `unit_type` | local_plan / online_doc / requirements_dir / inferred |
| `business_domain` | 可空 |
| `unit_slug` | 稳定 slug |
| `title` | 展示标题 |
| `relative_dir_or_locator` | 本地相对路径或在线 locator |
| `first_seen_at` / `last_seen_at` | 时间 |
| `matched_rule_id` / `confidence` / `evidence_json` / `rule_version` | 证据 |

#### profile_artifacts

对应当前 `sdd_work_item_artifacts`：

| 字段 | 说明 |
| --- | --- |
| `profile_id` | profile |
| `projection_run_id` | 来源 projection run |
| `artifact_key` | 幂等 key |
| `delivery_unit_id` | 需求 |
| `source_reference_id` | 过程文档引用 |
| `artifact_type` | proposal / design / task / review / plan / other 等 profile 内编码 |
| `artifact_locator` | 路径或在线文档 locator |
| `artifact_title` | 标题 |
| `system_module` | 可空 |
| `first_seen_at` / `last_seen_at` | 时间 |
| `matched_rule_id` / `confidence` / `evidence_json` / `rule_version` | 证据 |

#### profile_artifact_writes / profile_artifact_turns

保留当前文档生成时间线能力：

- `profile_artifact_writes`：一次写入/更新节点。
- `profile_artifact_turns`：写入前讨论 turn，按 session/time window 归因。

字段对齐当前 `sdd_work_item_artifact_writes` 和 `sdd_work_item_artifact_turns`，增加 `profile_id / projection_run_id / matched_rule_id / confidence / evidence_json`。

#### profile_knowledge_recalls

对应当前 `sdd_wiki_recalls`：

| 字段 | 说明 |
| --- | --- |
| `profile_id` | profile |
| `projection_run_id` | 来源 projection run |
| `recall_key` | 幂等 key |
| `source_reference_id` | 知识库 source |
| `tool_call_id` / `interaction_id` / `capability_usage_id` / `delivery_unit_id` | 链路 |
| `user_id` / `session_id` / `prompt_id` | 上下文 |
| `action_type` | read / grep / glob 等 |
| `knowledge_locator` | URL/path/docId |
| `knowledge_domain` / `knowledge_axis` / `knowledge_system` | 可选解析 |
| `event_time` | 时间 |
| `matched_rule_id` / `confidence` / `evidence_json` / `rule_version` | 证据 |

第一期只统计 read knowledge。读取 requirements 不纳入；写 wiki 不纳入。

#### profile_code_activities

第一期轻量代码实施能力：

| 字段 | 说明 |
| --- | --- |
| `profile_id` | profile |
| `projection_run_id` | 来源 projection run |
| `activity_key` | 幂等 key |
| `source_reference_id` | 代码路径引用 |
| `tool_call_id` / `interaction_id` / `capability_usage_id` | 链路 |
| `delivery_unit_id` | 可空，第一期不强求 |
| `user_id` / `session_id` / `prompt_id` | 上下文 |
| `action_type` | read / write / update |
| `code_locator` | 文件或目录路径 |
| `repo_name` | 仓库名 |
| `module_name` | 模块名，可空 |
| `repo_kind` | frontend / backend / service / unknown |
| `event_time` | 时间 |
| `matched_rule_id` / `confidence` / `evidence_json` / `rule_version` | 证据 |

第一期 codeChanges 只回答：

- 是否进入代码实施环节。
- 代码读/写次数。
- 触达代码文件数。
- Top repo / module。
- 用户维度编码参与。

第一期不回答：

- 某次代码改动是否真正完成需求。
- 代码质量好不好。
- 代码是否合并/发布。
- 每个需求的强 PR/commit 闭环。

## 11. Profile Observability Contract

页面和日报应依赖 profile contract，而不是直接依赖 `sdd_*`。

### 11.1 Profile 列表和 manifest

```text
GET /api/profiles
GET /api/profiles/:profileId/manifest
```

返回：

```ts
type ProfileSummary = {
  profileId: string;
  displayName: string;
  status: 'active' | 'disabled';
  manifest: ProfileCapabilityManifest;
};
```

### 11.2 总览

```text
GET /api/profiles/:profileId/overview
```

核心返回：

```ts
type ProfileOverview = {
  activeUserCount: number;
  capabilityUsageCount: number;
  coveredDemandCount: number;
  generatedDocumentCount: number;
  knowledgeRecallCount: number;
  codeWriteCount: number;
  codeReadCount: number;
};
```

页面文案第一期可继续使用“需求”“文档”“知识库”“编码次数”。内部字段使用通用命名。

### 11.3 用户分析

```text
GET /api/profiles/:profileId/users
GET /api/profiles/:profileId/users/:userId
```

用户项包含：

- 活跃状态。
- capability 使用数。
- 覆盖需求数。
- 文档数。
- 知识库读取数。
- 代码读/写数。
- 阶段/能力成熟度。
- 相关需求列表。

### 11.4 能力分析

当前“技能分析”在通用 contract 中应称为 capability analytics。页面名称第一期可不急着改。

```text
GET /api/profiles/:profileId/capabilities/analytics
GET /api/profiles/:profileId/capabilities/timeseries
GET /api/profiles/:profileId/capabilities/usages
```

核心问题：

- 能力调用规模。
- 语义/能力匹配率。
- 调用质量。
- 覆盖需求数。
- 产出转化。
- 代码实施参与。

### 11.5 产出分析

```text
GET /api/profiles/:profileId/demands
GET /api/profiles/:profileId/demands/:demandId
GET /api/profiles/:profileId/demands/:demandId/artifacts/:artifactId/timeline
```

产品继续叫“需求”和“文档”，底层对应 delivery unit 和 artifact。

必须保留当前最有价值的下钻链：

```text
需求
  -> 文档列表
  -> 单篇文档生成时间线
  -> discussion/write 节点
  -> prompt/response/tool calls 全文
  -> wiki recall 标记和内容查看
```

### 11.6 知识库分析

```text
GET /api/profiles/:profileId/knowledge/coverage
GET /api/profiles/:profileId/knowledge/docs
GET /api/profiles/:profileId/knowledge/content
GET /api/profiles/:profileId/knowledge/doc-detail
```

第一期必须支持：

- 本地知识库路径型 profile。
- 在线知识库 URL/docId 型 profile。
- 资产覆盖率可按 source 能力降级。
- 知识库读取必须来自高置信 source rule。

对于 B 的在线知识库，内容读取如果只能通过 MCP 而非服务器本地文件，需要单独实现 content adapter；架构上它仍挂在 knowledge content contract 下。

### 11.7 代码实施概况

```text
GET /api/profiles/:profileId/code/summary
GET /api/profiles/:profileId/code/by-user
GET /api/profiles/:profileId/code/by-repository
```

第一期可并入总览/用户分析/日报，不一定单独做新页面。

## 12. 三类 profile 落位

### 12.1 sdd-default

定位：当前 SDD 工作流的内置 profile。

规则来源：

- capability rules 由现有 `sdd_skill_semantics / sdd_skill_aliases` 转换。
- artifact patterns 由现有 `artifact_filename_patterns` 转换。
- process_doc source 对应 `requirements_root_path`。
- knowledge source 对应 `wiki_root_path`。
- codeChanges 是补充观测项：`sdd-default` 不启用代码兜底统计；后续只有拿到显式代码 root / pathContains 的 Profile 才切到 profile code source rules。

保护策略：

- `sdd-default` 不允许删除核心规则。
- 允许编辑 alias 和 artifact pattern。
- 旧 `sdd_*` 继续保留作为对账和回退。

### 12.2 e2e-monorepo

已知结构：

```text
repo/
  docs/
  plan/
  frontend_repo/
  backend_repo/
```

profile 规则：

- `plan`：过程文档 source，创建/更新进入 artifacts，作为需求主锚点。
- `docs`：知识库 source，读取进入 knowledge recalls。
- `frontend_repo`：代码 source，进入 codeChanges，`repoKind=frontend`。
- `backend_repo`：代码 source，进入 codeChanges，`repoKind=backend`。

归因原则：

- `plan` 下的过程文档负责定义需求。
- `frontend_repo / backend_repo` 的代码活动是交付证据，不把一个需求拆成多个代码仓库需求。
- 第一版不做需求级代码强闭环，只做 profile/user/repo 级代码实施概况。

### 12.3 online-docs

已知事实：

- 知识库是在线文档，通过 MCP 召回。
- requirements / 过程文档也是在线文档，通过 MCP 创建或更新。
- 知识库 URL 规则：`{host}/creditdoc/frontedndoc/<hash>`。
- 同一个 MCP 可能读取多类文档，MCP server 不能作为语义边界。

profile 规则：

- 知识库 source：URL prefix 命中 `{host}/creditdoc/frontedndoc/`，action=read。
- 过程文档 source：暂假设后续能拿到稳定 URL prefix/docId/collectionId，action=write/update。
- capability rules：按老板 B 自己的 skill/command/MCP tool 名称映射。
- 读取 requirements 不纳入核心指标。
- 写 wiki 不纳入核心指标。

待源日志确认：

- 在线过程文档创建/更新是否有稳定 locator。
- locator 在 tool input、tool result 还是 response 文本。
- 当前 OTel 保留信息是否足够。

## 13. Projection 运行模式

### 13.1 全量重跑

由于当前站点只运行了一两周，数据量有限，且 raw/event/派生数据尚未过期清理，第一阶段应选择全量重跑，而不是近期窗口。

流程：

```text
保留现有 sdd_* 作为对账基准
  -> 新增 profile_* projection 表
  -> 从现有 raw/event/interaction/tool_calls 全量投影 sdd-default
  -> 全量对账 sdd_* vs profile_*
  -> 对账通过后，dashboard 通过 profile contract 读取新口径
```

这样避免“部分历史走旧表、部分新数据走新表”导致筛选和分组混乱。

第一期 projection 明细表按当前态设计，不保留 profile 多版本明细。每次 full rebuild 必须满足：

- 以 `profile_id` 为单位清理旧 projection 后重建，或使用等价 current run 机制保证读路径只看本轮结果。
- 幂等 key 不包含配置版本。
- dashboard 不提供按版本读数能力。
- `profile_projection_runs.stats_json` 可以保存本轮与旧 `sdd_*` 的对账摘要，用于解释变化。

`incremental`、`backfill` 只是 `run_type` 预留值，第一期不实现增量投影。

### 13.2 对账目标

核心链路强一致，非核心统计允许有解释差异。

强一致目标：

- capability usage 数量和关键样本。
- delivery unit / 需求数量。
- artifact 数量、类型、路径。
- knowledge recall 数量、路径/URL。
- artifact timeline 的 write/discussion 节点。
- wiki recall 和 interaction/tool call 的链路。

`codeChanges` 不纳入强一致目标。它只作为有明确代码源 Profile 的轻量代码实施概况；`sdd-default` 不使用"非文档路径"兜底口径。

允许解释差异：

- 新规则更严格导致旧误归因被剔除。
- 新 source reference 抽取能修复旧缺失。
- 排序 TopN 因 tie-breaker 变化不同。
- 健康率、展示型衍生指标因统计口径更精确变化。

所有差异必须能通过 `matchedRuleId / evidenceJson / profileVersion` 解释。

### 13.3 读源切换

对账通过后，第一阶段应把总览和四大看板读源切到 profile contract，但保留旧读源回退。

建议开关：

```text
PROFILE_DASHBOARD_READ_SOURCE=legacy_sdd | profile_projection
```

开发环境默认 `profile_projection`；生产演示前可保留回退。

## 14. 代码实施环节设计

代码实施纳入第一期轻量能力 `codeChanges`。

### 14.1 为什么要纳入

老板 A 的工作流强调端到端交付，一个程序员同时交付前后端代码。如果平台只围绕需求和知识库，不观察代码实施，会缺少“是否进入交付”这一层。

当前站点已有辅助代码信号：

- 用户分析展示 artifact / 编码次数。
- 日报展示代码改动、代码读取、触达文件数、Top 代码仓库。
- 后端已能从 tool calls 里统计 Write/Edit/MultiEdit/Read/Grep/Glob。

因此把它纳入 profile contract 成本较低。

### 14.2 第一版能力边界

第一版回答：

- 是否进入代码实施环节。
- 代码读/写次数。
- 触达代码文件数。
- Top repo / module。
- 用户维度编码参与。

第一版不回答：

- 某次代码改动是否真正完成需求。
- 某次代码改动属于哪个需求的强归因。
- 代码质量是否达标。
- 是否合并、发布、上线。
- PR/commit/issue 闭环。

### 14.3 规则约束

不能继续依赖“排除 requirements/wiki 后剩下都算代码”的隐式口径。profile 应通过 Source Registry 显式配置 code source。

老板 A 示例：

```ts
sourceRules: [
  {
    ruleId: 'e2e-frontend-code',
    priority: 100,
    confidence: 'high',
    enabled: true,
    locatorType: 'path',
    category: 'code',
    rootEnv: 'E2E_FRONTEND_ROOT',
    fallbackBaseEnv: 'E2E_MONOREPO_ROOT',
    relativeRoot: 'frontend_repo',
    repoKind: 'frontend',
    includeGlobs: ['**/*'],
    actions: ['read', 'write', 'update']
  },
  {
    ruleId: 'e2e-backend-code',
    priority: 100,
    confidence: 'high',
    enabled: true,
    locatorType: 'path',
    category: 'code',
    rootEnv: 'E2E_BACKEND_ROOT',
    fallbackBaseEnv: 'E2E_MONOREPO_ROOT',
    relativeRoot: 'backend_repo',
    repoKind: 'backend',
    includeGlobs: ['**/*'],
    actions: ['read', 'write', 'update']
  }
]
```

## 15. 页面演进

### 15.1 页面范围

第一期 profile contract 覆盖：

- 总览
- 用户分析
- 能力分析（当前技能分析）
- 产出分析（需求 + 文档）
- 知识库分析
- 需求链路下钻
- 轻量代码实施指标

### 15.2 页面文案

第一期页面文案不强行全部替换：

- `work item / delivery unit` 产品上继续叫“需求”。
- `artifact` 产品上继续叫“文档”或“文档产出”。
- `skill` 可逐步过渡为“能力”，但不阻塞第一期。
- `wiki` 可继续叫“知识库”。

profile vocabulary 可未来再做，不是第一期必要能力。

### 15.3 功能降级

页面根据 manifest 降级：

- `knowledgeRecalls=false`：知识库相关 KPI 和 tab 显示不可用态。
- `artifactTimeline=false`：需求详情仍展示文档列表，但不展示生成时间线。
- `codeChanges=false`：隐藏代码实施指标。
- `evaluation=false`：隐藏评测入口。
- `alerts=false`：隐藏告警配置入口。

这样后续 A/B 接入不会因为某项能力暂缺导致整个平台卡住。

## 16. 后续监控、告警、评测的扩展方向

### 16.1 监控

监控应基于 projection run 和 profile contract：

- 某 profile 最近没有数据。
- projection 失败。
- source reference 抽取失败率升高。
- high-confidence 命中率下降。
- unknown source reference 激增。
- artifact timeline 归因缺失率升高。

### 16.2 告警

告警不应直接绑定 SDD 字段，而应绑定 profile 指标：

- capability usage 突降。
- knowledge recall 异常减少。
- artifact 产出长时间为 0。
- codeChanges 写入突增或突降。
- 某 profile projection 连续失败。

第一期只在 manifest 和字段上预留，不建专门 alert 表。

### 16.3 评测

评测未来依赖：

- artifact 正文或在线文档内容读取能力。
- artifact timeline。
- prompt/response 明文保留策略。
- profile artifact 类型和阶段定义。
- 人工 review 或自动评分结果。

第一期不做评测业务表，但 profile artifact 和 timeline 必须保留足够 evidence，避免未来功能断档。

## 17. 第一阶段架构验收标准

架构层验收：

1. `sdd-default` 可由 profile 配置表达，不再只能靠硬编码 SDD 逻辑解释。
2. `source_references` 能表达本地路径和在线文档 locator。
3. `profile_*` projection 可全量重建，幂等。
4. `sdd-default` 新旧全量对账通过，核心链路强一致。
5. 总览和四大看板可通过 profile contract 读取 `sdd-default`。
6. 全站 Profile Switcher 生效，页面不提供 all-profile 汇总。
7. manifest 控制页面能力展示和降级。
8. `e2e-monorepo` 可通过配置表达独立的 plan / knowledge / frontend / backend roots，并可用通用 `fallbackBaseEnv + relativeRoot` 兼容 monorepo root。
9. `online-docs` 可通过 URL/docId source registry provisional 表达知识库；requirements 在线文档 locator 待真实源日志确认，确认前不冻结 URL / MCP schema。
10. `codeChanges` 作为轻量代码实施能力进入 profile contract。

## 18. 风险与约束

### 18.1 数据口径风险

跨 profile 允许多投影，因此不能做 all-profile 汇总。任何跨 profile 总数都需要单独设计去重口径。

### 18.2 在线文档源风险

B profile 的可靠性取决于 MCP 日志里是否有稳定 locator。如果 URL/docId 只出现在大段 response 文本里，清洗可靠性会下降，不能直接进入核心 KPI。

### 18.3 代码实施噪音风险

代码读写只能说明进入实施环节，不能说明需求完成。第一期不要把 codeChanges 包装成“交付完成率”。

### 18.4 配置复杂度风险

第一期不要做完整配置 UI。规则仍在快速变化时，配置 UI 会把复杂度提前产品化，拖慢核心模型验证。

### 18.5 历史迁移风险

当前数据量有限，适合全量重跑。若未来 raw/event 已过期，再迁移历史 profile projection 时需要单独设计历史补数策略。

## 19. 推荐实施顺序

实施计划另开 `docs/tasks-profile-observability-mvp.md`。本文只给架构顺序：

1. 定义 profile config schema 和 `sdd-default` 配置。
2. 增加 `source_references` 抽取。
3. 增加 `profile_*` projection 表和全量 projection runner。
4. 用 `sdd-default` 全量投影并与 `sdd_*` 对账。
5. 定义 Profile Observability Contract。
6. 用 `sdd-default adapter` 或 `profile_projection` 支撑总览和四大看板。
7. 加全站 Profile Switcher。
8. 接入 `codeChanges` 轻量指标。
9. 配置并验证 `e2e-monorepo`。
10. 等 B 源日志确认后配置并验证 `online-docs`。
11. 后续再扩监控、告警、评测。

## 20. 结论

平台通用化的关键不是把 SDD 字段改成可配置，而是把当前已经证明有价值的证据链抽成 profile 观测架构：

```text
raw/event/interaction/tool call
  -> source reference
  -> profile projection
  -> Profile Observability Contract
  -> dashboard / monitor / alert / evaluation
```

`sdd-default` 是第一套 profile，也是对现有能力的保护基线。A 和 B 不应该成为两套定制 fork，而应该成为同一套 profile projection 机制下的两个配置样本。

第一期必须稳：保留 `sdd_*`，全量投影对账，切 profile contract 读源，避免功能断档。
第一期也必须前瞻：manifest、source registry、projection evidence、codeChanges 和 profile contract 要一次设计到位，让后续看板、监控、告警、评测能继续往上长。
