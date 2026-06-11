# Profile Source Registry Executor 实施计划（第三阶段-0）

更新时间：2026-06-08
状态：代码已实施；DB 门禁待可访问 MySQL 环境复验
关联文档：

- `docs/design-profile-observability-architecture.md`
- `docs/tasks-profile-observability-mvp.md`
- `docs/tasks-profile-contract-coverage.md`
- `docs/tasks-e2e-monorepo-profile.md`
- `docs/tasks-e2e-monorepo-profile-report.md`
- 在线文档 locator 验证文档

## 1. 结论

第二阶段-2 的 端到端 Monorepo profile 接入实现跑通了非 SDD profile 的演示链路，但它不是合格的通用接入层。

`docs/tasks-e2e-monorepo-profile.md` §4.9 曾允许“端到端 Monorepo profile 专属 operator”作为 MVP 取舍。该取舍到本阶段停止生效。第三阶段完成后，端到端 Monorepo profile 专属 operator 不能继续作为 production 接入路径，也不能成为 在线文档 profile 的复制模板。

当前代码中存在：

```text
profileId === <某个 profile>
  -> profile 专属 matcher
  -> profile 专属 operators
  -> profile 专属 diff gate
```

这说明当时的 `e2e-monorepo` 不是“通过通用配置接入”，而是一个 profile 专属 adapter。继续按这个模式接在线文档 profile，只会复制出下一套 matcher / operators / diff gate，违背 Profile Observability 架构目标和 DIP。

本阶段目标是补上真正的通用接入层：

```text
source_references
  -> Source Registry Executor
      -> source rule matching
      -> projection planning
      -> generic projection operators
      -> generic verify gate
  -> profile_* tables
  -> Profile Observability Contract
```

实施完成后：

- 端到端 Monorepo profile 只作为一份 profile config 存在。
- 本地路径类 profile 可以通过配置表达多个 process doc / knowledge / code source。
- 在线文档 / MCP 文档类 profile 有统一规则模型和 matcher，可用 fixture 证明能覆盖 在线文档 profile 的 locator 模型。
- worker 核心投影路径不再按 `e2e-monorepo` 写专属分支。

这一步完成后，端到端 Monorepo profile 才具备进入公司电脑真实部署验证的架构条件。真实验证通过后，才适合给老板 A 演示。

## 2. 为什么必须先做

### 2.1 当前 端到端 Monorepo profile 实现的问题

当前 端到端 Monorepo profile 代码解决了“有数据能进看板”，但没有解决“新增 profile 只改配置”：

- `worker/src/jobs/profile-projection/operators.ts` 按 `E2E_MONOREPO_PROFILE_ID` 分发算子。
- profile 专属 matcher 把 local path rule 执行逻辑绑定到某一个 profile。
- profile 专属 operators 把 delivery unit、artifact、capability、knowledge、code 投影写成某一个 profile 的私有实现。
- `worker/src/jobs/profile-diff.ts` 内置 profile 专属 diff 分支。
- `packages/api/src/profile-config.ts` 只有 `E2E_MONOREPO_ROOT` 这一套默认路径假设，不能优雅表达“知识库迁出 monorepo”等变化。

这不是 DIP 下的深模块。删除这些 profile 专属模块后，复杂度会重新散落到下一个 profile adapter 中，说明当前边界没有形成真正的 leverage 和 locality。

### 2.2 在线文档 profile 会直接暴露这个缺陷

在线文档 profile 的诉求不是 local path：

- 自定义 skill 工作流，名称不同于 SDD。
- 知识库是在线文档，通过 MCP 读取。
- requirements / 过程文档也是在线文档，通过 MCP 创建或更新。
- 同一个 MCP server 会读取 PRD、知识库、过程文档和其它文档，不能把 MCP server 当语义边界。
- 必须依赖 URL prefix、docId、collectionId、spaceId、docType、action type 等高置信 source rule。

如果没有通用 source registry executor，在线文档 profile 只能继续硬写 `online-*`，这会把平台重新拖回 profile 私有实现。

### 2.3 评审意见取舍记录

本轮文档更新吸收了评审中成立的硬伤：

- `projectionMode` 必须进入 PR-1 schema，并统一 operator / diff 分发。
- `sdd-default` 不再在 operator 分发里按 profile id grandfather，而是配置为 `projectionMode='sdd_bridge'`。
- `E2E_MONOREPO_ROOT` 兼容展开必须通过 `fallbackBaseEnv + relativeRoot` 这种通用字段实现，不能在 resolver 里硬编码 端到端 Monorepo profile 后缀。
- `product_doc` 暂不进入第三阶段 source category。
- generic source-backed diff 只是 internal consistency gate，不是独立真值对账。

部分采纳的点：

- URL / MCP source rule 不删除。原因是 在线文档 profile 的已知诉求就是 online doc / MCP doc，如果第三阶段完全不建 interface，后续仍会被迫写 在线文档 profile 专属 adapter。
- 但 URL / MCP schema 明确标为 provisional readiness。真实 在线文档 profile 日志验证前，它不是冻结接口；字段和规则允许调整。

实施顺序上的取舍：

- 更稳的理想顺序是先拿真实 端到端 Monorepo profile 日志验证本地路径模型，再抽象。
- 现实执行可并行推进：generic 化以 fixture 为开发依据，但 端到端 Monorepo profile 真实抽样必须成为 PR-6 和老板演示前的硬 gate。

## 3. 本阶段目标

### 3.1 产品目标

- 端到端 Monorepo profile 能以配置方式接入总览 + 四大看板。
- 端到端 Monorepo profile 的 knowledge root、plan root、frontend root、backend root 可独立配置，不再被一个 `E2E_MONOREPO_ROOT` 强绑定。
- 如果 端到端 Monorepo profile 未来把知识库迁出 monorepo，只改配置，不改 projection 代码。
- 在线文档 profile 不在本阶段部署，但通用模型必须能表达 在线文档 profile 的 online doc / MCP doc source。

### 3.2 架构目标

形成一个深模块：

```text
Source Registry Executor
```

它的 interface 应足够小：

```ts
executeProfileProjection(ctx, profileConfig) -> operator stats
matchSourceReference(sourceReference, profileConfig.sourceRules) -> matched source
verifyProfileProjection(profileId, runId, profileConfig) -> gate report
```

它的 implementation 可以内部拆分为 matcher、parser、attributor、writer、verifier，但调用方不应该知道 端到端 Monorepo profile、在线文档 profile 的目录结构或 MCP 规则细节。

## 4. 范围

### 4.1 做

- 扩展共享 profile config schema，支持本地路径、URL、MCP 文档三类 source rule。
- 支持同一 profile 下多个独立 root，例如 plan、knowledge、frontend code、backend code 分别配置。
- 实现通用 source rule matcher：
  - `local_path`
  - `url`
  - `mcp_doc`
- 实现通用 projection operators：
  - process document write/update -> delivery unit + artifact + artifact write
  - source-backed capability usage
  - knowledge read -> knowledge recall
  - code read/write -> code activity
  - conservative attribution -> delivery unit linkage
- 实现通用 verify gate，替换 profile 专属 diff 分支。
- 将 端到端 Monorepo profile 改造成普通 profile config。
- 删除或废弃 端到端 Monorepo profile 专属 matcher/operator/diff 分支。
- 用 fixtures 覆盖 端到端 Monorepo profile local path 和 在线文档 profile online/MCP doc 规则。
- 保证 `sdd-default` rebuild/diff 不回归。

### 4.2 不做

- 不做 profile 配置 UI。
- 不做 在线文档 profile 真实部署。
- 不实现 在线文档 profile 在线文档 content adapter。
- 不冻结 在线文档 profile 的 online / MCP source schema；真实日志验证前只做 provisional readiness。
- 不用 prompt/title 关键词作为核心 KPI 分类依据。
- 不做 all-profile 汇总。
- 不做跨 profile conflict。
- 不删除旧 `sdd_*` 表。
- 不删除 `/api/sdd/*` 历史端点。
- 不重做总览和四大看板的信息架构。

## 5. 关键设计

### 5.1 Profile Config 必须成为唯一接入入口

新增 profile 时，核心投影代码不应该新增 `if profileId === xxx`。`sdd-default` 也不能靠 profile id 特判；它应通过 `projectionMode='sdd_bridge'` 走 legacy bridge mode。

允许 profile id 出现的位置：

- profile 配置。
- 测试 fixture。
- 文档。
- 用户可见 profile 展示文案。

不允许 profile id 出现的位置：

- projection operator 分发逻辑。
- source matcher 核心逻辑。
- generic verify gate 核心逻辑。
- server profile query repository。

验收扫描：

```bash
rg "e2e|E2E|e2eMonorepo|端到端 Monorepo profile" worker/src server/src packages/api/src -n
```

实施完成后，命中范围必须只剩：

- `packages/api/src/profile-config.ts` 或后续 profile config 文件。
- 迁移期兼容注释（必须有 TODO 和删除任务）。

测试文件和 docs 可以命中。

### 5.2 Source Rule 统一模型

当前 `LocalPathSourceRule` 太窄，且只有 端到端 Monorepo profile 消费。需要调整成 union。

建议结构：

```ts
type SourceAction = 'read' | 'grep' | 'glob' | 'write' | 'edit' | 'update' | 'delete';
type SourceCategory = 'process_doc' | 'knowledge' | 'code' | 'unknown';

type SourceRuleBase = {
  ruleId: string;
  priority: number;
  confidence: 'high' | 'medium' | 'low';
  enabled: boolean;
  category: SourceCategory;
  actions: SourceAction[];
  description?: string;
};

type LocalPathSourceRule = SourceRuleBase & {
  locatorType: 'path';
  rootEnv?: string;
  rootPath?: string;
  fallbackBaseEnv?: string;
  relativeRoot?: string;
  includeGlobs?: string[];
  excludeGlobs?: string[];
  repoKind?: 'frontend' | 'backend' | 'fullstack' | 'unknown';
};

type UrlSourceRule = SourceRuleBase & {
  locatorType: 'url';
  urlPrefixes?: string[];
  urlRegexes?: string[];
  resourceIdCapture?: string;
  deny?: {
    urlPrefixes?: string[];
    urlRegexes?: string[];
    docTypes?: string[];
  };
};

type McpDocSourceRule = SourceRuleBase & {
  locatorType: 'mcp_doc';
  mcpServers?: string[];
  toolNames?: string[];
  urlPrefixes?: string[];
  docIdPatterns?: string[];
  spaceIds?: string[];
  collectionIds?: string[];
  docTypes?: string[];
  deny?: {
    urlPrefixes?: string[];
    docTypes?: string[];
    titlePatterns?: string[];
  };
};

type SourceRule = LocalPathSourceRule | UrlSourceRule | McpDocSourceRule;
```

规则匹配原则：

- 同 profile 内只选择一个 best match。
- 先按 `confidence`，再按 `priority`，再按稳定 `ruleId` 排序。
- 同 category 同优先级多命中时标记 ambiguous，不进核心 KPI。
- 未命中高置信 source rule 的 source reference 只进入 unknown stats，不进核心 KPI。

### 5.3 端到端 Monorepo profile 配置不能只剩一个 root

端到端 Monorepo profile 第一版可以保留 monorepo 快捷配置，但通用模型必须允许拆分 source root。

目标配置示例：

```ts
{
  profileId: 'e2e-monorepo',
  displayName: '端到端 Monorepo profile Monorepo',
  sourceRules: [
    {
      ruleId: 'e2e-plan-process-doc',
      locatorType: 'path',
      category: 'process_doc',
      rootEnv: 'E2E_PLAN_ROOT',
      fallbackBaseEnv: 'E2E_MONOREPO_ROOT',
      relativeRoot: 'plan',
      actions: ['write', 'edit', 'update'],
      includeGlobs: ['**/*.md', '**/*.mdx', '**/*.docx'],
      priority: 100,
      confidence: 'high',
      enabled: true
    },
    {
      ruleId: 'e2e-knowledge-docs',
      locatorType: 'path',
      category: 'knowledge',
      rootEnv: 'E2E_KNOWLEDGE_ROOT',
      fallbackBaseEnv: 'E2E_MONOREPO_ROOT',
      relativeRoot: 'docs',
      actions: ['read', 'grep', 'glob'],
      includeGlobs: ['**/*.md', '**/*.mdx'],
      priority: 100,
      confidence: 'high',
      enabled: true
    },
    {
      ruleId: 'e2e-frontend-code',
      locatorType: 'path',
      category: 'code',
      rootEnv: 'E2E_FRONTEND_ROOT',
      fallbackBaseEnv: 'E2E_MONOREPO_ROOT',
      relativeRoot: 'frontend_repo',
      repoKind: 'frontend',
      actions: ['read', 'grep', 'glob', 'write', 'edit', 'update'],
      priority: 80,
      confidence: 'high',
      enabled: true
    },
    {
      ruleId: 'e2e-backend-code',
      locatorType: 'path',
      category: 'code',
      rootEnv: 'E2E_BACKEND_ROOT',
      fallbackBaseEnv: 'E2E_MONOREPO_ROOT',
      relativeRoot: 'backend_repo',
      repoKind: 'backend',
      actions: ['read', 'grep', 'glob', 'write', 'edit', 'update'],
      priority: 80,
      confidence: 'high',
      enabled: true
    }
  ]
}
```

为了降低部署成本，可以支持兼容展开，但展开机制必须是通用字段驱动，不能在 resolver 里写死 端到端 Monorepo profile 后缀。

```text
E2E_MONOREPO_ROOT=/repo
```

通用 resolver 规则：

```ts
resolvedRoot =
  env[rootEnv] ??
  (fallbackBaseEnv && relativeRoot ? join(env[fallbackBaseEnv], relativeRoot) : undefined)
```

但 projection implementation 只能看到展开后的 `SourceRule[]`，不能依赖 `E2E_MONOREPO_ROOT`。

换句话说，`E2E_MONOREPO_ROOT` 只是部署便利输入，不是 Source Registry Executor 的 interface。实现时如果发现 matcher/operator 仍需要读取这个环境变量，说明抽象没有完成。

### 5.4 在线文档 profile 模型必须能被配置表达

在线文档 profile 不要求本阶段真实跑通，但必须能用同一套 source rule 表达：

```ts
{
  profileId: 'online-docs',
  displayName: '在线文档 profile Online Docs',
  sourceRules: [
    {
      ruleId: 'online-creditdoc-knowledge',
      locatorType: 'url',
      category: 'knowledge',
      urlPrefixes: ['https://<host>/creditdoc/frontedndoc/'],
      actions: ['read'],
      priority: 100,
      confidence: 'high',
      enabled: true
    },
    {
      ruleId: 'online-requirements-process-doc',
      locatorType: 'mcp_doc',
      category: 'process_doc',
      mcpServers: ['<server-name>'],
      collectionIds: ['<requirements-collection-id>'],
      docTypes: ['requirement', 'process_doc'],
      actions: ['write', 'update'],
      priority: 100,
      confidence: 'high',
      enabled: false
    }
  ]
}
```

注意：

- 本节 URL / MCP schema 是 provisional readiness，不是冻结接口。真实 在线文档 profile 日志回来前，允许调整字段名和匹配条件。
- `enabled=false` 可以用于等待真实 source reference 验证。
- 同 MCP server 下的非知识库文档必须作为负样本，不得误入 knowledge recall。
- 如果 MCP create/update 的稳定 locator 只存在于 tool result，source reference extractor 必须先补齐；本阶段只要求 matcher/operator 的 interface 能承接这类 source reference。

### 5.5 通用 matched source

source rule matcher 输出统一结构，供后续 operators 消费：

```ts
type MatchedSource = {
  profileId: string;
  sourceReferenceId: number;
  sourceReferenceKey: string;
  ruleId: string;
  confidence: 'high' | 'medium' | 'low';
  ambiguous: boolean;
  category: 'process_doc' | 'knowledge' | 'code' | 'unknown';
  actionType: SourceAction;
  locatorType: 'path' | 'url' | 'mcp_doc';
  normalizedLocator: string;
  sourceNamespace: string | null;
  resourceId: string | null;
  relativeLocator: string | null;
  metadata: Record<string, unknown>;
};
```

`sourceNamespace` 示例：

- local path：`ruleId` 或 repo root label。
- URL：host + path prefix。
- MCP doc：`mcpServer / collectionId / spaceId` 的稳定组合。

`resourceId` 示例：

- local path：root 下相对路径。
- URL：URL 后缀 hash 或规范化 URL。
- MCP doc：docId / url / collectionId + docId。

### 5.6 通用 projection 规则

通用 operators 不理解 端到端 Monorepo profile/B，只理解 matched source。

| matched source | action | projection |
| --- | --- | --- |
| `category=process_doc` | write/edit/update | `profile_delivery_units` + `profile_artifacts` + `profile_artifact_writes` |
| `category=process_doc` | read/grep/glob | `profile_capability_usages`，可作为 attribution anchor，但不统计“读 requirements”独立 KPI |
| `category=knowledge` | read/grep/glob | `profile_knowledge_recalls` |
| `category=code` | read/grep/glob/write/edit/update | `profile_code_activities` |
| 任意 high confidence source | 任意 | `profile_capability_usages` |

幂等 key 继续使用稳定 source/reference 身份：

```text
delivery_unit_key = sha256(profile_id + ':du:' + delivery_unit_locator)
artifact_key      = sha256(profile_id + ':artifact:' + delivery_unit_key + ':' + artifact_locator)
write_key         = sha256(profile_id + ':artifact_write:' + source_reference_key)
usage_key         = sha256(profile_id + ':capability:' + source_reference_key)
recall_key        = sha256(profile_id + ':knowledge:' + source_reference_key)
activity_key      = sha256(profile_id + ':code:' + source_reference_key)
```

`source_references.id` 不得进入幂等 key。

### 5.6.1 暂不引入 product_doc

`docs/design-profile-observability-architecture.md` 曾预留 `product_doc`，但当前投影规则没有定义它应该进入哪张 `profile_*` 表，也没有老板 A/B 的必需场景依赖它。

第三阶段先不引入 `product_doc`。在线文档 profile 的 PRD、requirements、过程文档第一期统一归为 `process_doc`；如果后续产品文档需要独立 KPI，再新增 category 和 projection 口径。这样避免 PRD 在 `product_doc` / `process_doc` 之间反复摇摆。

### 5.7 Delivery Unit 解析策略

Delivery unit 解析不能写死 端到端 Monorepo profile 的 `plan/<domain>/<unit>`。

新增配置：

```ts
type DeliveryUnitRule = {
  ruleId: string;
  sourceRuleIds: string[];
  locatorStrategy:
    | { kind: 'path_segment'; stripExtensions: boolean; domainSegment?: number; unitSegment: number }
    | { kind: 'parent_dir'; stripExtensions: boolean }
    | { kind: 'url_resource_id' }
    | { kind: 'mcp_doc_id' };
  titleStrategy?: 'unit_slug' | 'file_name' | 'doc_title' | 'none';
};
```

端到端 Monorepo profile 可配置为：

```text
sourceRuleIds = ['e2e-plan-process-doc']
locatorStrategy = path_segment
domainSegment = 0 可选
unitSegment = 0 或 1，按真实结构 fixture 固化
```

在线文档 profile 可配置为：

```text
locatorStrategy = mcp_doc_id 或 url_resource_id
```

实施时如果规则过多，第一版可以只支持：

- local path：`parent_dir` / `path_segment`
- url/mcp：`resource_id`

但 interface 不能再出现 端到端 Monorepo profile。

注意：固定 `unitSegment` 只适合结构统一的路径。如果 端到端 Monorepo profile 真实 `plan/` 同时存在 `plan/<unit>.md` 和 `plan/<domain>/<unit>/**` 两种深度，不能靠一个固定 segment 糊过去。实现必须二选一：

- 通过多个 `DeliveryUnitRule` 分别覆盖不同路径形态；
- 或新增通用 `orderedStrategies`，按规则顺序尝试 `path_segment / parent_dir / file_stem`。

无论选择哪种，都必须用真实或 fixture 样例覆盖混合深度场景，不能把现有 端到端 Monorepo profile 启发式直接藏进 generic implementation。

### 5.8 Artifact 类型策略

Artifact type 不能只写在 端到端 Monorepo profile matcher 里。

新增配置：

```ts
type ArtifactRule = {
  ruleId: string;
  sourceRuleIds: string[];
  typePatterns: Array<{ artifactType: string; include: string[] }>;
  defaultArtifactType: string;
};
```

端到端 Monorepo profile 示例：

```ts
typePatterns: [
  { artifactType: 'plan', include: ['*plan*', '*proposal*', '*prd*'] },
  { artifactType: 'design', include: ['*design*'] },
  { artifactType: 'task', include: ['*task*', '*todo*'] },
  { artifactType: 'review', include: ['*review*'] }
],
defaultArtifactType: 'process_doc'
```

在线文档 profile 可以通过 docType 映射：

```text
docType=requirement -> artifactType=requirement
docType=design_doc -> artifactType=design
```

### 5.9 Capability 规则

当前 端到端 Monorepo profile capability 是从 source category/action 派生的，这应该通用化。

新增配置：

```ts
type CapabilityRule = {
  ruleId: string;
  sourceRuleIds?: string[];
  sourceCategories?: SourceCategory[];
  actions: SourceAction[];
  capabilityCode: string;
  displayName: string;
  triggerSource?: string | null;
};
```

端到端 Monorepo profile 示例：

```text
process_doc + write/edit/update -> plan-doc-update
knowledge + read/grep/glob -> knowledge-recall
code(repoKind=frontend) + read/grep/glob -> frontend-code-read
code(repoKind=backend) + write/edit/update -> backend-code-change
```

在线文档 profile 示例：

```text
MCP skill alias -> online-design-skill
online process_doc update -> process-doc-update
knowledge URL read -> knowledge-recall
```

如果 在线文档 profile 的 skill invocation 需要通过 tool name / command / alias 识别，可在后续扩展 `CapabilityRule`，但 source-backed capability 必须先通用。

### 5.10 Attribution 策略

上下文归因不能留在某个 profile 的私有 operators 里。

新增通用策略：

```ts
type AttributionPolicy = {
  anchorCategories: SourceCategory[];
  anchorActions: SourceAction[];
  sameInteraction: {
    enabled: boolean;
    preferActions: SourceAction[];
  };
  sameSessionWindow: {
    enabled: boolean;
    minutes: number;
    requireSameUser: boolean;
    preferActions: SourceAction[];
  };
};
```

第一版规则：

- 同 interaction：取不晚于目标 source reference 的最近 anchor，write/edit/update 优先。
- 同 session：窗口内只有唯一 delivery unit 时归因；多个 delivery unit 记 ambiguous。
- ambiguous 不进核心 KPI，但保留 evidence。
- 跨 profile 不判冲突。

### 5.11 Generic Verify Gate

`profile:diff` 要拆成两类：

1. `sdd-default` legacy parity gate：继续保留 key-set 对账。
2. source-backed generic gate：适用于 端到端 Monorepo profile、在线文档 profile 和后续 profile。

通用 gate 输出：

```json
{
  "profileId": "...",
  "runId": 1,
  "sourceReferences": {
    "matchedHighConfidence": 0,
    "unknown": 0,
    "ambiguous": 0,
    "byCategory": {}
  },
  "projection": {
    "deliveryUnits": 0,
    "artifacts": 0,
    "artifactWrites": 0,
    "capabilityUsages": 0,
    "knowledgeRecalls": 0,
    "codeActivities": 0
  },
  "linkage": {
    "artifactWithoutDeliveryUnit": 0,
    "knowledgeOrphanSourceRef": 0,
    "codeOrphanSourceRef": 0,
    "unmappedContext": 0,
    "ambiguousContext": 0
  },
  "gate": "PASS",
  "gateFailures": []
}
```

阻塞项：

- source-backed projection 有 orphan source reference。
- process_doc write/update 未生成 artifact write。
- artifact 无 delivery unit。
- matched high-confidence source 没有进入预期 projection。
- unknown 命中 profile root 且不可解释。

非阻塞但必须报告：

- ambiguousContext。
- unmappedContext。
- pattern / glob 级 source reference 无法落到具体文件。

## 6. 实施切分

建议 6 个 PR。每个 PR 都必须可 typecheck / build。

| PR | 目标 | 主要产物 | 可单独验收 |
| --- | --- | --- | --- |
| PR-1 | Source rule schema | 扩展 profile config union、runtime env resolver、配置校验 | 是 |
| PR-2 | Source Registry Executor | 通用 matcher、matched source 类型、fixture tests | 是 |
| PR-3 | Generic source-backed projection | 通用 local path projection operators，替换 端到端 Monorepo profile operators | 是 |
| PR-4 | Online/MCP doc provisional readiness | URL / MCP matcher fixtures，在线文档 profile 配置样例 disabled，schema 不冻结 | 是 |
| PR-5 | Generic verify gate | source-backed diff gate，替换 profile 专属 diff 分支 | 是 |
| PR-6 | 删除 端到端 Monorepo profile 专属实现 + 部署验收 | 删除/废弃 e2e matcher/operator，端到端 Monorepo profile rebuild/diff + sdd-default 回归 | 是 |

## 7. PR-1：Source Rule Schema

### Task 1.1 扩展共享配置类型

修改：

- `packages/api/src/profile-config.ts`
- `packages/api/src/contracts/profile.contract.ts`
- `server/src/modules/profiles/profile-config.ts`
- 相关测试

要求：

- 新增 `projectionMode: 'sdd_bridge' | 'source_backed'`：
  - `sdd-default` 使用 `sdd_bridge`。
  - 端到端 Monorepo profile 使用 `source_backed`。
  - 在线文档 profile disabled 样例使用 `source_backed`，但默认不参与 rebuild。
- 引入 `SourceRule` union。
- `WorkflowProfileConfig.sourceRules` 改为 `SourceRule[]`。
- 新增 `deliveryUnitRules / artifactRules / capabilityRules / attributionPolicy` 的可执行字段。
- 保持 `sdd-default` 配置兼容。
- 端到端 Monorepo profile 配置改为多 root source，不再只依赖 `E2E_MONOREPO_ROOT`。

验收：

```bash
pnpm typecheck
pnpm build
```

并验证：

- `getProfileConfig('e2e-monorepo')` 能返回展开后的 source rules。
- 只配置 `E2E_MONOREPO_ROOT` 时，通过 `fallbackBaseEnv + relativeRoot` 通用机制兼容展开。
- 单独配置 `E2E_KNOWLEDGE_ROOT` 时，knowledge rule 使用独立 root。
- `sdd-default` 的 operator / diff 分发可通过 `projectionMode='sdd_bridge'` 完成，不依赖 profile id。
- 未配置必需 root 时，profile status 为 `disabled` 或 rebuild 明确失败，不回退 SDD。

### Task 1.2 配置校验

新增配置校验函数：

```ts
validateProfileConfig(config): ValidationResult
resolveRuntimeProfileConfig(config, env): ResolvedWorkflowProfileConfig
```

必须校验：

- ruleId 唯一。
- enabled rule 必须有可解析 root / url / mcp 条件。
- local path rule 至少有 `rootEnv`、`rootPath`，或 `fallbackBaseEnv + relativeRoot`。
- local path rule 如果同时配置 `rootEnv` 和 `fallbackBaseEnv`，resolver 必须优先使用 `rootEnv`。
- url rule 至少有 `urlPrefixes` 或 `urlRegexes`。
- mcp_doc rule 至少有 docId / collection / url / docType 条件之一，不能只靠 mcpServer。
- deliveryUnitRule 引用的 sourceRuleIds 必须存在。
- capabilityRule 引用的 sourceRuleIds 必须存在。

## 8. PR-2：Source Registry Executor

### Task 2.1 新增通用 matcher module

建议新增：

```text
worker/src/jobs/profile-projection/source-registry/
  executor.ts
  matcher.ts
  local-path.ts
  url.ts
  mcp-doc.ts
  types.ts
```

核心 interface：

```ts
loadSourceReferences(pool): SourceReferenceFact[]
matchSourceReference(fact, resolvedProfileConfig): MatchedSource | null
matchSourcesForProfile(facts, resolvedProfileConfig): MatchResult
```

要求：

- 不 import `E2E_MONOREPO_PROFILE_ID`。
- 不 import `sdd-default` 私有算子。
- 不写 `if profileId === ...`。
- 只依赖 `profileConfig.sourceRules`。

### Task 2.2 Fixture tests

新增测试：

```text
worker/test/source-registry-local-path.test.ts
worker/test/source-registry-online-doc.test.ts
worker/test/source-registry-ambiguity.test.ts
```

覆盖：

- 端到端 Monorepo profile plan/doc/code 路径通过通用 matcher 命中。
- 端到端 Monorepo profile knowledge root 迁出 monorepo 后仍能命中。
- 端到端 Monorepo profile monorepo root 兼容展开仍能命中。
- 在线文档 profile `{host}/creditdoc/frontedndoc/<hash>` URL 命中 knowledge。
- 同 MCP 非知识库 URL 不命中 knowledge。
- MCP doc 只有 mcpServer、无 docId/url/collection/docType 时不允许进入 high confidence。
- 同 profile 同 category 同 priority 多命中时 ambiguous。

## 9. PR-3：Generic Source-Backed Projection

### Task 3.1 通用 operators

建议新增：

```text
worker/src/jobs/profile-projection/source-backed-operators.ts
```

或拆成：

```text
worker/src/jobs/profile-projection/source-backed/
  operators.ts
  writers.ts
  delivery-unit.ts
  artifact.ts
  capability.ts
  attribution.ts
```

对外只暴露一个深 module：

```ts
export const SOURCE_BACKED_OPERATORS: ProjectionOperator[];
```

内部可以拆分实现，但 `getProfileOperators()` 不应该知道 delivery/artifact/knowledge/code 的私有步骤。

### Task 3.2 替换 端到端 Monorepo profile operators

`getProfileOperators(profileId)` 目标形态：

```ts
const config = getProfileConfig(profileId);

if (config?.projectionMode === 'sdd_bridge') {
  return [...SDD_BRIDGE_OPERATORS, knowledgeOperator, codeOperator];
}

if (config?.projectionMode === 'source_backed') {
  return SOURCE_BACKED_OPERATORS;
}

return [];
```

这里允许判断 `projectionMode`，不允许判断 `e2e-monorepo` 或 `sdd-default`。`sdd-default` 作为 legacy bridge 通过配置表达，而不是在分发逻辑中 grandfather。

### Task 3.3 Projection 输出

通用 projection 必须写：

- `profile_delivery_units`
- `profile_artifacts`
- `profile_artifact_writes`
- `profile_capability_usages`
- `profile_knowledge_recalls`
- `profile_code_activities`

所有 source-backed 行必须包含：

- `source_reference_key`
- `source_reference_id`
- `matched_rule_id`
- `confidence`
- `evidence_json`
- `rule_version`

## 10. PR-4：Online / MCP Doc Provisional Readiness

本 PR 不要求 在线文档 profile 真实部署，也不冻结 URL / MCP schema。目标只是证明通用 matcher/operator 的 interface 能承接已知 在线文档 profile locator 假设，并把真实日志验证前的不确定性显式保留下来。

### Task 4.1 在线文档 profile disabled profile config

新增 disabled 配置样例：

```text
online-docs
```

要求：

- `/api/profiles` 可以展示为 disabled，或暂不展示但 config test 可加载。
- 不能参与 rebuild，除非显式启用并满足 source reference 验证。
- source rule 能表达 known knowledge URL prefix。
- requirements process_doc rule 用 `mcp_doc` 方式表达，默认 disabled。
- 配置旁必须注释：真实 在线文档 profile source reference 验证前，字段和规则均可调整。

### Task 4.2 URL / MCP source fixtures

用合成 `source_references` fixture 验证：

- URL knowledge read -> matched source -> knowledge recall projection plan。
- MCP process_doc update -> delivery unit + artifact projection plan。
- 同 MCP 非知识库 read -> unknown，不进 KPI。
- tool result 中 URL/docId/sourceNamespace 已归一化时，matcher 不需要读 prompt 文本。

## 11. PR-5：Generic Verify Gate

### Task 5.1 拆分 diff

当前：

```text
profile-diff.ts
  sdd-default diff
  profile 专属 diff 分支
```

目标：

```text
profile-diff.ts
  if projectionMode === 'sdd_bridge': runSddParityDiff()
  if projectionMode === 'source_backed': runSourceBackedDiff()
```

不允许：

```ts
if (profileId === E2E_MONOREPO_PROFILE_ID)
```

### Task 5.2 Source-backed gate

通用 gate 必须按 `profileConfig.sourceRules` 计算 expected source categories，而不是写死 plan/docs/frontend/backend。

这个 gate 是 source-backed projection 的内部一致性检查，不是独立真值对账。它可以证明“命中的 source reference 是否进入了预期 projection、有没有孤儿引用、有没有结构性漏投影”，但不能单独证明 matcher 的语义分类一定正确。比如某条路径被错误归为 knowledge，gate 可能仍然 PASS。

因此 source-backed profile 的语义正确性仍必须依赖真实样例人工抽检；报告中不得把 generic gate PASS 写成“语义分类已完全正确”。

验收输出至少包含：

- matched source count by category。
- expected vs actual projection count。
- orphan source reference count。
- process_doc write missing artifact write。
- artifact without delivery unit。
- knowledge/code unmappedContext。
- ambiguousContext。
- unknown under configured roots。

端到端 Monorepo profile 的旧 gate 项可以映射为通用项：

| 旧 端到端 Monorepo profile gate | 新通用 gate |
| --- | --- |
| `planWriteMissingArtifactWrite` | `processDocWriteMissingArtifactWrite` |
| `artifactWithoutDeliveryUnit` | 同名 |
| `knowledgeOrphanSourceRef` | `knowledgeOrphanSourceRef` |
| `codeOrphanSourceRef` | `codeOrphanSourceRef` |
| `unknownCodeRepoKind` | `codeMissingRequiredMetadata` |
| `unknownInMonorepo` | `unknownUnderConfiguredRoots` |

### Task 5.3 设计文档保鲜

同步更新 `docs/design-profile-observability-architecture.md`：

- 将 `rootPathPattern: '**/plan/**'` 示例改为 root-anchored 配置，避免鼓励过宽 glob。
- 增加 `projectionMode: 'sdd_bridge' | 'source_backed'`，说明 operator / diff 都按 mode 分发。
- 删除或暂缓 `product_doc` category，注明 PRD / requirements 第一阶段归 `process_doc`。
- 标注 URL / MCP source rule 在 在线文档 profile 真实日志验证前属于 provisional readiness。

## 12. PR-6：删除 端到端 Monorepo profile 专属实现与最终验收

### Task 6.1 删除或隔离专属文件

目标删除：

```text
worker/src/jobs/profile-projection/<profile>-matcher.ts
worker/src/jobs/profile-projection/<profile>-operators.ts
```

如果为了审查对比需要短期保留，必须：

- 不被 production import。
- 文件顶部标注 deprecated。
- 文档中写明删除时间点。

测试文件可改名为：

```text
worker/test/source-registry-e2e-fixture.test.ts
worker/test/source-backed-attribution.test.ts
```

### Task 6.2 端到端 Monorepo profile rebuild/diff

在有 端到端 Monorepo profile fixture 或真实 root 的环境运行：

```bash
pnpm profile:rebuild-source-references
pnpm profile:rebuild -- --profile e2e-monorepo
pnpm profile:diff -- --profile e2e-monorepo
```

要求：

- rebuild completed。
- current pointer 切到 completed run。
- generic source-backed diff gate PASS。
- projection stats 中没有 端到端 Monorepo profile 专属 operator 名称。

### Task 6.3 sdd-default 回归

必须运行：

```bash
pnpm profile:rebuild-source-references
pnpm profile:rebuild -- --profile sdd-default
pnpm profile:diff -- --profile sdd-default
```

要求：

- `sdd-default` key-set gate 仍 PASS。
- knowledge old_not_in_new = 0。
- orphan source reference = 0。
- 总览 + 四大看板仍可读。

### Task 6.4 grep gate

必须运行：

```bash
rg "E2E|e2eMonorepo|e2e|端到端 Monorepo profile" worker/src server/src packages/api/src -n
```

验收：

- `worker/src/jobs/profile-projection/operators.ts` 不命中 端到端 Monorepo profile。
- `worker/src/jobs/profile-diff.ts` 不命中 端到端 Monorepo profile。
- source matcher/operator production 代码不命中 端到端 Monorepo profile。
- 允许 profile config 中出现 `e2e-monorepo` 和 ruleId。
- 允许 docs/test 中出现 端到端 Monorepo profile。

## 13. 部署条件

### 13.1 技术部署条件

第三阶段完成后，端到端 Monorepo profile 技术部署条件为：

- `pnpm typecheck` PASS。
- `pnpm build` PASS。
- `pnpm db:verify` PASS。
- `pnpm profile:diff -- --profile sdd-default` PASS。
- `pnpm profile:rebuild -- --profile e2e-monorepo` PASS。
- `pnpm profile:diff -- --profile e2e-monorepo` generic gate PASS。
- 端到端 Monorepo profile profile 的 plan、knowledge、frontend、backend root 可独立配置。
- production code 无 端到端 Monorepo profile 专属 projection 分支。

### 13.2 老板演示条件

技术部署通过后，还需要公司电脑真实数据验证：

1. 用真实 端到端 Monorepo profile monorepo / 独立 docs root 配置环境变量。
2. 跑 source reference rebuild。
3. 跑 端到端 Monorepo profile projection rebuild。
4. 跑 generic source-backed diff。
5. 抽样 5-10 条真实记录：
   - plan write/update -> delivery unit + artifact + artifact write。
   - docs read -> knowledge recall。
   - frontend/backend code read/write -> code activity。
   - 同 interaction / session 归因符合预期。
6. 对 `unknownUnderConfiguredRoots / ambiguousContext / unmappedContext` 给出解释。

未完成这些抽样前，不能宣布“端到端 Monorepo profile 已语义接入完成”。

## 14. 回退策略

- `sdd-default` 保持旧 `legacy_sdd` 回退。
- source-backed profile 不允许回退到 SDD。
- 如果 端到端 Monorepo profile projection 失败，current pointer 不切换，页面继续读上一个 completed run。
- 如果 端到端 Monorepo profile 从未有 completed run，页面返回 typed empty，不展示 SDD 数据。
- 如果第三阶段重构有风险，可暂时隐藏 端到端 Monorepo profile profile，不影响 sdd-default。

## 15. 风险与闸门

### 15.1 配置过度设计

风险：一次性把 profile config 做成低代码平台，实施失控。

控制：

- 只支持当前 A/B 已知需要的 rule 类型。
- 不做 UI。
- 不做多版本配置。
- 不做 prompt/title 低置信分类。

### 15.2 通用 executor 变成浅模块

风险：只是把 端到端 Monorepo profile 代码搬个名字，interface 仍暴露大量细节。

控制：

- 调用方只接触 `SOURCE_BACKED_OPERATORS` 和 `runSourceBackedDiff`。
- matcher/parser/writer/attributor 是内部 seam，不扩散到 `operators.ts`。
- 测试主要打 Source Registry Executor 的 interface，而不是逐个内部函数。

### 15.3 在线文档 profile source reference 不可得

风险：MCP create/update 的稳定 locator 不在 OTel 中。

控制：

- 本阶段只做模型和 fixture readiness。
- 在线文档 profile 真实 projection 仍受在线文档 locator 验证 gate 约束。
- source reference 不可得时，不启动 在线文档 profile projection。

### 15.4 URL / MCP schema 提前冻结

风险：当前真实库里还没有足够 URL / MCP source reference 样本。若把 §5.4 的 URL / MCP schema 当成定稿，真实 在线文档 profile locator 形态一旦不同，会返工。

控制：

- 本阶段 URL / MCP 只做 provisional readiness。
- PR-4 的 在线文档 profile 配置样例默认 disabled。
- 实施报告必须标注 URL / MCP schema 未冻结。
- 真实 在线文档 profile 数据到位后，先更新 source reference 验证文档，再决定是否冻结 schema。

### 15.5 端到端 Monorepo profile 真实日志覆盖不足

风险：真实代码活动通过 Bash/git diff，不进入 `source_references`。

控制：

- diff 报告 matched/unknown/source category 分布。
- 真实验证抽样必须检查 code read/write 来源。
- 不在 projection 中靠 prompt 文本猜代码路径。

## 16. 完成定义

全部满足才算第三阶段完成：

1. Profile config schema 支持 local path / url / mcp_doc source rule。
2. Profile config schema 支持 `projectionMode: 'sdd_bridge' | 'source_backed'`。
3. `sdd-default` 通过 `projectionMode='sdd_bridge'` 分发 operator / diff，不靠 profile id 特判。
4. 端到端 Monorepo profile 可用多个 root 配置，不依赖单一 `E2E_MONOREPO_ROOT`。
5. `E2E_MONOREPO_ROOT` 兼容展开通过 `fallbackBaseEnv + relativeRoot` 通用机制实现，不在 resolver 里硬编码 端到端 Monorepo profile 后缀。
6. 端到端 Monorepo profile knowledge root 迁出 monorepo 的 fixture 通过。
7. 端到端 Monorepo profile plan mixed-depth fixture 通过，或文档明确真实结构不混合。
8. 在线文档 profile online knowledge URL prefix provisional fixture 通过。
9. 在线文档 profile 同 MCP 非知识库负样本 provisional fixture 通过。
10. 文档明确 URL / MCP schema 在真实 在线文档 profile source reference 验证前不冻结。
11. 通用 source matcher 不包含 端到端 Monorepo profile 分支。
12. 通用 source-backed operators 不包含 端到端 Monorepo profile 分支。
13. `getProfileOperators()` 只按 projection mode 分发，不按 端到端 Monorepo profile 或 sdd-default profile id 分发。
14. `profile:diff` 只按 diff mode 分发，不按 端到端 Monorepo profile 或 sdd-default profile id 分发。
15. 端到端 Monorepo profile 专属 matcher/operator 不再被 production import。
16. `pnpm typecheck` PASS。
17. `pnpm build` PASS。
18. `pnpm db:verify` PASS。
19. `pnpm profile:diff -- --profile sdd-default` PASS。
20. `pnpm profile:rebuild -- --profile e2e-monorepo` PASS。
21. `pnpm profile:diff -- --profile e2e-monorepo` generic gate PASS，并在报告中标注它是 internal consistency gate。
22. 总览 + 四大看板选择 端到端 Monorepo profile 不白屏，不展示 SDD legacy 数据。
23. 实施报告列出 grep gate、diff gate、真实/fixture 验证证据。

## 17. 后续文档要求

实施完成后新增：

```text
docs/tasks-profile-source-registry-executor-report.md
```

报告必须包含：

- 删除了哪些 端到端 Monorepo profile 专属 production import。
- 新 Source Registry Executor 的 interface。
- 端到端 Monorepo profile 配置示例。
- 在线文档 profile 配置样例和 disabled 原因。
- URL / MCP schema 的 provisional 范围。
- `rg "e2e|E2E"` 的命中解释。
- `profile:diff` 输出。
- generic source-backed diff 的 internal consistency 边界。
- sdd-default 回归结果。
- 端到端 Monorepo profile 是否达到技术部署条件。
- 端到端 Monorepo profile 是否达到老板演示条件；如果没有，缺的真实验证是什么。
