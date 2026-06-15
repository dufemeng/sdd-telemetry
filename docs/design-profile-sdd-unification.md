# SDD 与 source-backed 配置统一 · 异同分析与接口/页面摸排

> 动工前的摸排文档。目标:把 `sdd_bridge`(SDD 默认)和 `source_backed`(农小宝)两套配置统一成一套,
> 退役 `sdd_*` 桥接。原则:**接口语义清晰优先,不做向后兼容;旧数据走重清洗适配新结构。**
>
> **范围(已确认):一步到位 A+B+C** —— 配置统一 + SDD 看板页并入通用 profile 看板 + 全量重清洗。
> C 不是可选项;本文档第 3、4 节按"看板也要并"来摸排。

## 0. 结论先行

1. **数据库底座已基本统一**:`source_references`(原始事实)+ `profile_*`(投影结果)两侧通吃,知识/代码两类投影已经跨模式共享 operator。不需要大改 DB。
2. **两套"配置"是同一套的两个投影**。统一 = 扩展 `WorkflowProfileConfig`(核心是加 `skill` locator + 把"需求生命周期/阶段"从 SDD 硬编码改成 config 驱动),让 SDD 退化成一个普通 `source_backed` profile,`projectionMode` 收敛、`sdd_*` 桥接退役。
3. **看板页其实已基本统一(代码核查修正)**:`/sdd/*` 看板早已 profile-aware,通过共享 hooks `useProfiles.ts` 读 `/api/profiles/:id/*`。全 web 残留 `/api/sdd/*` 耦合只剩:语义页 CRUD、3 个 knowledge 钻取端点(契约已有、server 未 wired)、1 处 stray `users/:id`,以及原始层 `interactions`(保留)。**工作量大头在后端配置模型统一,不在页面。**

---

## 1. 两套配置的异同

### 1.1 配置载体对照

| 维度 | 农小宝 `source_backed` | SDD `sdd_bridge` |
|---|---|---|
| 配置在哪 | `profile_configs` 的 JSON(`WorkflowProfileConfig`) | 散落:全局 `sdd_semantics`/`sdd_skill_aliases` 表 + `sdd_users.wiki_root_path`/`requirements_root_path` + 清洗管线硬编码 |
| 识别基底 | `source_references`(路径/URL/MCP) | `sdd_*` 派生表(技能/work item/产物)+ `source_references`(仅知识/代码) |
| 匹配时机 | 投影时按 config 规则 rematch | 入库清洗时(skill→semantic、work item 抽取);投影只搬运 |
| 编辑入口 | `/admin/profile-configs`(版本化:draft/publish/serving) | `/sdd/semantics`(即时 CRUD,无版本) |

### 1.2 共有(概念一致,可直接映射)

| 能力 | 农小宝 | SDD | 统一去向 |
|---|---|---|---|
| 知识库读取 | `knowledge` sourceRule(path) | `knowledgeOperator` 硬编码 `knowledge-v1` + 每用户 `wiki_root_path` | knowledge sourceRule(已共享 operator) |
| 代码读写 | `code` sourceRule + `repoKind` | `codeOperator` 硬编码 `code-v1`(排除 doc 根) | code sourceRule(已共享 operator) |
| 过程文档→产物分类 | `artifactRule.typePatterns`(文件名) | `SddSemantic.artifactFilenamePatterns`(文件名) | **同一字段**,合并 |
| 能力统计 | `capabilityRule`(source+action) | `SddSemantic`(skill alias→semanticCode) | capabilityRule + skill locator |
| 交付单元/需求 | `deliveryUnitRule` | `sdd_work_items` | deliveryUnitRule(SDD 版更丰富,见 1.3) |

### 1.3 SDD 有、农小宝没有(你有我没有)

1. **skill 作为识别基底**。SDD 靠技能名(`bk-fe-design` 等)识别活动;农小宝 sourceRule 只有 `path/url/mcp_doc`,**没有 `skill` locator**。→ 必须新增。用户确认:农小宝自定义 skill 也要追踪,所以这是共需。
2. **需求生命周期 / 成熟度阶段 / 漏斗**。SDD 有 `proposal→design→task→codereview` 生命周期 + `/sdd/funnel` + 成熟度(`SDD_PRESENTATION.maturityStages`);农小宝 `maturityStages: []`。→ **config 槽位已存在**(presentation.maturityStages/artifactStageOrder),缺的是:(a) 农小宝把它填上;(b) 把"生命周期/漏斗"的**计算**从 SDD 硬编码改成 config 驱动的 stage 定义。用户原话:"农小宝的 skill 也有自己的生命周期,只是当前还没实现。"——这是统一里最有肉的一块。
3. **触发来源**(user-triggered vs auto-triggered、command_name、skill_source)。SDD 有 invocation 语义;农小宝纯路径无此概念。`capabilityRule.triggerSource` 已留位,随 skill locator 一并生效。
4. **(原始层观测)** interactions / tool-calls / errors / versions。属于原始事件观测,**不算 profile 配置**,与统一正交,单列。

### 1.4 农小宝 有、SDD 没有(我有你没有)

1. **任意多 root + 显式 root 解析**(`rootEnv/rootPath/fallbackBaseEnv/relativeRoot/pathContains/pathRegexes`)+ `include/exclude globs` + `priority/confidence`。SDD 的知识/代码根是写死的每用户列,表达力弱。→ 统一用农小宝的富 locator;SDD 的每用户根变成 locator 的"按用户根解析"模式(或迁成 config + 每用户覆盖)。
2. **`url` / `mcp_doc` locator**(在线文档)。SDD 仅本地 + skill。→ 统一模型保留(`online-docs` profile 已用)。
3. ~~`repoKind`(frontend/backend/fullstack)~~。**核查结论(可证伪):现状只把 `repo_kind` 写入 `profile_code_activities`,无任何查询/接口/页面按三类聚合或展示;唯一读取点是 `profile-diff.ts:316` 的完整性检查(`repo_kind='unknown'` 当"未解析"信号)。** 按"不增复杂度"原则 → **砍掉 `repoKind`,代码追踪统一一份**,连带调整 profile-diff 的完整性判断。
4. **显式 `attributionPolicy`**(可配 anchor + 同会话 120min 窗)。SDD 用 `EMPTY_ATTRIBUTION_POLICY`,归因逻辑埋在 work-item 抽取里。→ 统一用显式策略,SDD 的隐式归因显式化。
5. **版本化发布**(draft/publish/serving + 投影成功才切流,坏配置不致看板全空)。SDD semantics 是裸 CRUD。→ 统一采用版本化发布。

### 1.5 配置层如何兼容(统一模型)

统一后的 `WorkflowProfileConfig` 在现有基础上做**加法**:

- 新增 `locatorType: 'skill'`(技能名 + aliases)→ 吸收 `sdd_skill_aliases`。
- `artifactRule.typePatterns` ← 吸收 `artifactFilenamePatterns`(本就同形)。
- `capabilityRule` ← 吸收 `semanticCode/displayName`,并支持 skill locator + `triggerSource`。
- `presentation` 的生命周期/阶段 → 升级为 config 驱动的 **stage/lifecycle 定义**,SDD 与农小宝各填各的研发工作流阶段。
- 每用户根(`wiki_root_path`/`requirements_root_path`)→ locator 增加"按用户根解析"来源。
- `projectionMode` 收敛为单一 source_backed 引擎;`sdd_bridge` 退役。

**可行性关键**:`source_references` 已可 JOIN 到技能(`tool_call_id → skill_usage_id → skill_name`,见 `knowledge-operator.ts`),所以 skill locator **不需要新管线**;重清洗时把 skill 维度落进 source 层即可。

---

## 2. 接口增删改摸排(原则:语义清晰,不兼容)

### 2.1 删除 / 退役
- `GET/POST/PUT/DEL /api/sdd/semantics` → 并入 `/api/admin/profile-configs`(skill 规则进 config JSON)。
- SDD 的"profile 化视图"端点 → 由 `/api/profiles/:profileId/*` 取代(SDD = `profileId=sdd-default`):
  `/api/sdd/overview`、`/funnel`、`/skill-analytics`、`/skill-timeseries`、`/usage-summary`、`/usages`、`/users`、`/users/:id`、`/work-items`、`/work-items/:id`、`/wiki-recalls/*`。

### 2.2 保留并扩展
- `/api/admin/profile-configs/*`(list/detail/preview/create/draft/publish/disable):**统一配置 API**,schema 扩 skill 规则 + 生命周期定义。
- `/api/profiles/:profileId/*`:**统一视图 API**,SDD 页面改读它;按需补 `funnel`/`lifecycle` 通用端点。

### 2.3 新增
- `POST /api/admin/profile-configs/:id/test-match`:**测试匹配**——拿最近 N 天真实 `source_references` 跑规则,返回每条规则命中数。这是之前定的"用最能验证功能的方式测试"。
- (可选)skill 候选列表端点,供配置时下拉选已观测到的技能名。

### 2.4 不动(原始层观测,与 profile 配置正交)
- `/api/sdd/interactions`、`/interactions/:id/tool-calls`、`/errors`、`/versions`、ingest。
- 建议(非必须)迁到中性命名空间 `/api/events` 或 `/api/ops`,因为它们不属于任何 profile 投影。

---

## 3. 页面增删改摸排

### 3.1 看板页现状(代码核查):绝大多数已在 `/api/profiles/*`

**核查推翻了"两套并行看板"的假设。** `/sdd/*` 看板页(skills/work-items/wiki-recalls/users)实际已 profile-aware(`useShellContext().profileId`),通过共享 hooks `web/src/pages/profiles/useProfiles.ts` 读统一的 `/api/profiles/:id/*`。例:`WorkItemsPage` 直接 `import { useProfileDemands }`,`SkillsPage` 走 `useProfiles` 的 capabilities hooks。`useProfiles.ts` 已覆盖:

`overview / capabilities{analytics,timeseries,usages,usages-summary} / demands(+detail+artifact timeline) / users(+detail+activity) / knowledge{coverage,timeline,recalls,delivery-units} / inspector`

**全 web 仍耦合 `/api/sdd/*` 的残留(穷举,grep 实证):**

| 残留端点 | 用途 | 处理 |
|---|---|---|
| `/api/sdd/semantics`(GET/POST/PUT/DEL) | 语义页 CRUD | 退役 → 并入 profile-config(Layer B) |
| `/api/sdd/wiki-recalls/docs`、`/doc-detail`、`/content/by-path`(+`/content/:id`) | 知识页钻取(域文档/文档详情/正文) | **契约已存在**(`ProfileKnowledgeDomainDocs/DocDetail/Content`,server 端 0 引用=未 wired)→ 补 3 个 profile 端点 + 页面 swap |
| `/api/sdd/users/:id`(1 处) | 某用户详情 stray | swap 到已 wired 的 `/api/profiles/:id/users/:id` |
| `/api/sdd/interactions`(+`/:id`、tool-calls) | **原始层观测** | **保留**,不属于任何 profile |

**结论(修正头号风险):看板层 ~90% 已统一。** 剩余视图层缺口是**有界的 3 个 knowledge 钻取端点(契约已写好、server 未实现)+ 1 处 stray 调用 + 语义页并入**,**不是**"重写知识页"。上一版"wiki-recalls 是头号风险/需反向扩展通用知识页"的判断,经代码核查**撤销**——profile 知识契约本就已定义 docs/doc-detail/content,只差 server 实现。

### 3.2 改造
- `/admin/profile-configs` → **统一配置页**(内容地图 + 能力/产物/skill 识别 + 生命周期),去掉 `projectionMode` 分叉与空表单。
- `/profiles/inspector` → 只读诊断页,泛化覆盖所有 profile,去掉 SDD 特判文案。

### 3.3 真实风险分布(修正)
页面层几乎不是风险——看板已基本统一,只剩"补 3 个 knowledge 端点 + swap 残留 + 语义页并入 + `/sdd/*` 路由更名"这类有界工作。**真正的大头与风险全在后端配置模型统一**(Layer A/B):把 sdd-default 变成真正的 source_backed(skill locator + 生命周期 config)、退役 `sdd_*` 桥接与 SDD 专属清洗、全量 reclean 并保证幂等 key 稳定。

---

## 4. 迁移与重清洗(不向后兼容)

- 旧 `sdd_*` 数据通过 `pnpm db:reclean` 重跑:把 skill / 知识 / 代码统一落进 `source_references`,按统一配置重投影成 `profile_*`。
- `sdd_*` 派生表 + bridge operators 迁移完成后退役。
- **风险**:SDD 历史可追溯性(`semantic_id`、work item key、`alias_id` 等被历史事实引用)在重清洗中重建——需在重清洗逻辑里保证幂等 key 稳定,或显式接受重排。

---

## 5. 建议节奏(分层、统一契约背后增量上线)

| 层 | 内容 | 风险 | 说明 |
|---|---|---|---|
| **A** | 知识 + 代码:硬编码 operator 改 config 驱动 | 低 | 数据层已共享,先跑通"统一"闭环 |
| **B** | skill 成为一等 locator + 生命周期 config 化;`/sdd/semantics` 并入 | 中 | 统一的枢纽;到此用户感知"页面已统一" |
| **C** | 退役 `sdd_*` work-item/产物桥接 + 全量 reclean;补 3 个 knowledge 端点、swap 残留、`/sdd/*` 路由更名 | 高(集中在后端 reclean) | 风险是历史可追溯性(幂等 key);页面侧工作量小,看板已基本统一 |

每层都在统一契约(`profile_*` + 统一视图 API)背后增量、可回滚。Layer C 是唯一真正"大"的部分;A/B 安全且价值立现。

---

## 6. 前置摸排:3 个后端点(代码事实,零模糊)

### 6.1 skill 如何进 source 层 → **管线新增**
- 事实:`source-reference-extractor.ts` 产出 `locator_type ∈ {path, pattern, url, mcp_doc, unknown}`,**无 `skill`**;`source_references` 从 tool call 抽取(资源级:文件/URL/doc)。skill 只在 `sdd_skill_usages`,经 `tool_call_id → skill_usage_id` JOIN 可达。
- 结论:skill-locator **不是单纯加匹配规则,是管线新增**。clean 方案:清洗时为每个 `skill_usage` 额外 emit 一条 `locator_type='skill'` 的 `source_reference`(`normalized_locator = skill_name`,`reference_key` 用 skill_usage 稳定 key)。此后 skill 是一等 source,统一 matcher/operator 通吃。

### 6.2 生命周期/漏斗在哪算 → **查询时,易 config 化**
- 事实:`SDD_MATURITY_STAGES = ['proposal','design','task','codereview']`(`sdd-query.service.ts:71` 常量);stage 在**查询时**由 `GROUP_CONCAT(DISTINCT ss.semantic_code)` 推出——**`semanticCode` 本身就是 stage**;funnel 是按 semantic stage 的查询时聚合。**清洗不写 stage/maturity。**
- 结论:生命周期 = (有序 stage 列)+(capability/semantic→stage 关联),纯查询+配置层。config 化 = `presentation.maturityStages` 填有序阶段 + `capabilityRule` 标注 stage;funnel 从"group by semantic_code"泛化成"group by 配置 stage"。**无需改清洗**;农小宝填自己的研发阶段即可(印证用户"农小宝 skill 也有生命周期,只是没实现")。

### 6.3 per-user 根怎么表达 → **保留为用户上报事实 + locator 加 key**
- 事实:`sdd_users.wiki_root_path` / `requirements_root_path` 由 `POST /api/sdd/user-settings` 上报 upsert(每用户本机根);knowledge/code operator 用它判断"路径是否在该用户根内"。
- 结论:per-user 根是**运行时用户上报事实,不是 config**。统一 = path locator 新增"按用户根解析"模式 `userRootKey: 'wiki' | 'requirements'`,根仍存 `sdd_users`,config 只引用 key。同时覆盖 SDD 的知识(wiki)与过程文档(requirements)两类根。

---

## 7. 迁移计划(A+B+C,不向后兼容,旧数据重清洗)

### 7.0 统一配置模型(最终形态)
sdd-default 变成普通 `source_backed` profile,`sourceRules` =
- `knowledge`:path,`userRootKey=wiki`(替 `knowledge-v1` 硬编码)
- `process_doc`:path,`userRootKey=requirements`(SDD 需求/work item 来源)
- `code`:path,排除 doc 根(替 `code-v1`)
- `skill`:`locatorType='skill'` + aliases(替 `sdd_skill_aliases`/语义表)

\+ `capabilityRules`(skill→能力→**stage**)、`deliveryUnitRules`(process_doc→work item)、`artifactRules`(== `artifactFilenamePatterns`)、`presentation.maturityStages=['proposal','design','task','codereview']`。

**契约增量(精确):** `locatorType` 加 `'skill'`;path locator 加 `userRootKey`;`capabilityRule` 加 `stage`;**砍 `repoKind`**;`projectionMode` 最终收敛为单值。

### 7.A Phase A — 知识 + 代码 config 化(低风险)
- 改 `knowledgeOperator`/`codeOperator`:不再硬编码,改读 config 的 knowledge/code sourceRule(含 `userRootKey` 解析);给 sdd-default 配上对应 path 规则。
- **验证(可证伪):** reclean 后 sdd-default 的 `profile_knowledge_recalls`/`profile_code_activities` 行数与迁移前硬编码口径一致(对比计数,差异在阈内)。

### 7.B Phase B — skill 一等 locator + 生命周期 + 语义页并入(中风险,枢纽)
1. 清洗 emit `locator_type='skill'` 的 source_reference(粒度 = `skill_usage` 级,避免按 tool_call 重复)。
2. sourceRule/capabilityRule 支持 skill;`capabilityRule` 加 `stage`。
3. `presentation.maturityStages` 驱动 funnel/maturity 查询,**替掉 `SDD_MATURITY_STAGES` 常量**。
4. 删 `/sdd/semantics` 页 + `/api/sdd/semantics` CRUD,技能映射并入 `/admin/profile-configs` 的 skill 识别区。
- **验证:** 统一 capability operator 产出的 `profile_capability_usages` 与旧 bridge 口径一致;funnel 数值不变;农小宝能配出自己的 skill + 阶段并在看板可见。

### 7.C Phase C — 退役桥接 + 补端点 + 页面收口 + 全量 reclean(高风险,集中在 reclean)
1. 补 3 个 profile knowledge 端点(`domain-docs`/`doc-detail`/`content`,**契约已存在**,SQL 从 `/api/sdd/wiki-recalls/*` 平移到读 `profile_knowledge_recalls` + scan 表)。
2. swap 知识页 3 处钻取 + 1 处 stray `users/:id` 到 profile 端点;删**已无前端调用**的 `/api/sdd/wiki-recalls/{heatmap,list,users,work-items}`。
3. `/sdd/*` 路由更名为中性(profile 看板);删 `SDD_BRIDGE_OPERATORS` + `SddBridgeProjectionAdapter`;`projectionMode` 收敛单值。
4. 全量 `pnpm db:reclean`:skill/知识/过程文档/代码统一落 `source_references`,统一投影 `profile_*`;`sdd_*` 派生表退役。
- **验证:** `pnpm db:verify` 通过;两 profile 看板均正常;`rg "/api/sdd/"` 仅剩原始层 `interactions`;reclean raw 丢失率 < 5% 阈值。

### 7.D 数据迁移与幂等 key
- 不向后兼容,旧 `sdd_*` 一律重清洗重建。`profile_*` 幂等 key 已是 `sha256(profile_id + 类型 + source_reference_key/稳定 evidence)`,reclean 幂等。
- **关键:** skill source_reference 的 `reference_key` 必须绑 `skill_usage` 稳定 key,否则重排会重复计数。

### 7.E 主要风险
- **skill 去重**:一个 `skill_usage` 跨多 tool_call,emit 粒度定在 skill_usage 级。
- **funnel 口径迁移**:query 改 config 驱动后,迁移前后数值需对比(可证伪)。
- **reclean 一次性、动全历史**:按 `db:reclean` 既有流程(prod 锁 + 5% 阈值 + 交互确认)。

---

## 8. 执行进度

### ✅ Phase 1 — 砍 repoKind(commit `7bd5018`)
从 schema/types/e2e 配置/matcher metadata/两个 code operator 移除 repoKind;profile-diff
完整性检查改为只看 `repo_name`;`repo_kind` 列保留写 NULL,Phase C reclean 物理删。
自检:typecheck 6/6、build 5/5、worker 测试 114 passed。

### ⚠️ 预存红测试(非本次引入,已诊断)
`worker/test/source-backed-projection.test.ts` 5 个用例红——经 `git stash` 在基线
`a292da9` 验证为**预存**,与 repoKind 无关。**根因:测试 fixture 陈旧**,用
`${ROOT}/plan/...`、`${ROOT}/web/...`,而 e2e 配置 `relativeRoot` 已是 `docs/plan` / `src`,
解析根不含这些路径 → match 返回 null。**matcher 本身正确**。这些用例会在 Phase A
(sdd-default 改 source_backed、matcher/config 变更)随之重写,届时一并修;现在不动(手术刀范围)。

### ✅ Phase A.1 — path locator 加 userRootKey 机制(commit `8fca839`)
schema/types 加 `userRootKey:'wiki'|'requirements'`;`resolveRuntimeProfileConfig` 把仅
userRootKey 的 path 规则视为可解析(resolvedRoot=null,延迟到投影);validation 计入合法 root 来源。
自检:profile-config 20/20(含新用例)、typecheck 6/6、build 5/5、worker 无新增红。

### ⛔ Phase A.2(config 驱动桥接 operator)— 读码后决定**不做**
读 `knowledge-operator.ts` / `code-operator.ts` / `runner.ts` 后的两点代码事实改变了判断:
1. **codeOperator 是排除式**("path 不在 wiki/requirements 根下即代码"),**无正根**,无法映射成
   `userRootKey` 的包含式规则——code 的 config 化要等 source_backed flip 设计(届时 code 用正根 `src/`
   或显式 exclude 语义)。
2. **knowledgeOperator 能 config 驱动**(`ProjectionContext` 带 `profileConfig`),但那只是把硬编码的
   actions/root 换成"恰好等价"的 config 规则——**count 是 tautological 相等**,且这俩 operator 在 Phase C
   flip 时整体删除,属**浅层 throwaway 胶水**。按简洁/不做 throwaway 原则,**不值得做**。

**结论:Phase A 收在 A.1**(durable 机制:userRootKey 字段)。真正的知识/代码 config 驱动随 sdd-default
flip 到 source_backed 一次做对(那时用已 config 驱动的 SOURCE_BACKED operator,无 throwaway)。

### ✅ Phase B.1 — skill emit 纯函数(commit,非 reclean)
`extractSkillSourceReference`:`sdd_skill_usages` 行 → 一条 `locator_type='skill'` source_reference,
`reference_key` 绑 `usage_key`(幂等、不按 tool_call 重复),`action_type='invoke'`,
`normalized_locator=skill_name`;`SourceLocatorType` 加 `'skill'`(VARCHAR 列无需迁移)。
纯函数 + 单测(幂等/区分/空值),**未接 writer**。自检:extractor 17/17、worker 119 passed、typecheck/build 全绿。

### ✅ Phase B.2 — writer 接入完成并已验证(commit `9bcd971`)
- **代码**:`SourceReferenceWriter.rebuildSkillReferences`(遍历 `sdd_skill_usages` →
  `extractSkillSourceReference` → 复用 `upsert`)接进 `rebuildAll`;`SourceReferenceWriteStats` 加
  `skillUsages`;修 `rebuild-source-references` 的 `reused` 计算把 skill 计入(破坏性自检)。
- **已验证(用轻量 `pnpm profile:rebuild-source-references`,非 `db:reclean`——它就是 `rebuildAll` 路径,幂等非破坏)**:
  - `source_references WHERE locator_type='skill'` = **81** == `sdd_skill_usages` = 81(**1:1**)。
  - distinct `reference_key` = 81、`action_type` 全 `invoke`、`normalized_locator`=skill_name、`tool_call_id`=NULL、evidence 带 `skillUsageKey`。
  - **幂等已证**:二次 rebuild `inserted=0`、skill_refs 仍 = 81(不重复)——reclean 安全的前提成立。
- **已知缺口(后续)**:增量 `updateForBatch` 的 skill 路径未接,steady-state 新 skill 靠下次全量重建。
- **✅ 全量 `db:reclean` 健壮性验证(test env,已跑)**:7 轮排空、`db:verify` 33 表 27 索引、projection 新 run capability=81(repoKind 移除后口径正常)、`skill_refs=81==skill_usages`(`sdd_skill_usages` 被 truncate+重建 id 全变,`reference_key` 绑 `usage_key` 仍全对上)、新 skill-type refs 不干扰旧投影。**结论:Phase 1 + B.1/B.2 端到端健壮。**
- **⚠️ reclean 照出的真实缺口**:`resetDerivedData` 不 truncate `source_references`,且 reclean 用 per-batch `updateForBatch`(无 skill 路径)→ skill refs 是"存活"而非"被 reclean 重新 emit"。要真正健壮,需把 skill emit 接进 `updateForBatch`(按 batch 经 tool_call→event→batch 作用域,idempotent upsert 容跨 batch)。
- flip 阶段的 reclean 改为做**口径对账**(bridge run vs source_backed run)。

### ⏭️ 之后 — flip(Phase B 配置侧 + Phase C,均 reclean-gated)
config 加 `SkillSourceRule` + `'invoke'` action + `capabilityRule.stage`;sdd-default 切 source_backed;
退役 `sdd_*` 桥接;补 3 个 knowledge 端点;`/sdd/*` 路由收口。**先做 §9 口径对齐,再动 flip。**

---

## 9. flip 口径对齐分析(动手前必须想清楚)

切 source_backed 后,`profile_*` 必须与旧 bridge 数值一致。逐表对比(读 `sdd-bridge-operators.ts`
vs `source-backed-operators.ts` 实证):

| profile_* 表 | bridge 口径(per-usage/直接) | source_backed 现状 | 对齐 | flip 要做 |
|---|---|---|---|---|
| **capability_usages** | `sdd_skill_usages⋈semantics`:每 usage 一行;`capability_code=semantic_code`、`raw_capability_name=raw_skill_name`、`capability_source=skill_source`、`trigger_source=invocation_trigger`、`status`、`delivery_unit←su.work_item_id`(直接) | `insertCapabilityUsage` 写**静态/硬编码**:`capability_source='source_reference'`、`status='observed'`、`trigger_source=rule.triggerSource`(静态)、`raw_capability_name=rule.capabilityCode`、`delivery_unit←attribution`(重导) | ❌ **最大缺口** | 见下「capability 三件事」 |
| **delivery_units** | `sdd_work_items`:`unit_type='requirements_dir'`、slug/domain/title/relative_dir 由 SDD 清洗形成 | process_doc(requirements 根)path → `deliveryUnitRule`(parent_dir) | ⚠️ 待验证 | 确认路径解析能复现 work_item 的 slug/domain/**title**(title 可能来自文档内容,非路径);sdd-default 配 process_doc 规则(`userRootKey=requirements`) |
| **artifacts/_writes/_turns** | `sdd_work_item_artifacts` 等 | process_doc → `artifactRule.typePatterns` | 🟡 较可能 | `artifactFilenamePatterns`==`typePatterns`,逐 artifactType 比对 |
| **knowledge_recalls** | `knowledgeOperator`(源 source_references,per-user wiki 根) | `sourceBackedKnowledgeOperator`(同源,knowledge 规则) | ✅ 同源 | sdd-default 配 knowledge 规则(`userRootKey=wiki`,A.1 机制);口径天然一致 |
| **code_activities** | `codeOperator`(排除 wiki/requirements 根) | `sourceBackedCodeOperator`(code 规则,正根/glob) | ⚠️ 排除式 | code 是"非 doc"语义,无正根 → flip 时改正根(`src/`?)或加 exclude-userRootKey;A.2 已记 |

### capability 三件事(最大缺口,必须先解)
1. **per-usage 字段丢失**。source_backed 把 `trigger_source/capability_source/status/raw_capability_name` 写死成静态值,而 SDD 这些是**每次调用**的(user vs auto-triggered 等)。`SOURCE_BACKED_PRESENTATION` 本来隐藏 `user/autoTriggeredCount`,但 sdd-default 用的是 `SDD_PRESENTATION`(**展示** trigger 指标)→ flip 后这些指标会全空/错。
   → ✅ **已做(commit `0468fcd`)**:skill ref `evidence_json` 现带 `invocationTrigger/skillSource/status`(81/81,幂等,真实值如 `user-slash`)。
   → ⏭️ **待做**:`insertCapabilityUsage` 对 skill 类匹配改为**从 evidence 读 per-usage 值**(trigger/source/status/raw_skill_name),而非静态 rule 值。
2. **skill→capability 映射进 config**。`capability_code` 要 = `semantic_code`(funnel 按它分阶段)。skill→semantic(`sdd_skill_aliases`+`sdd_skill_semantics`)要变成 `capabilityRule`(每 semantic 一条,列其 skill 别名,`capabilityCode=semantic_code` + `stage`)。
3. **delivery_unit 归属口径差异**。bridge 用 `su.work_item_id` **直接**连;source_backed 用 `attributionPolicy`(同 interaction/session 窗)**重导**——两者结果可能不等。需评估:要么 skill ref 带上 work_item 线索,要么接受归属口径变化并验证差异可接受。

### 风险排序与结论
- **capability(per-usage + 归属)= 头号**,直接决定 SDD 看板 user/auto + funnel 是否存活;**先回头给 B.1 的 skill ref 补 evidence 字段**,再谈 flip。
- delivery_unit 的 **title/work_item 形成口径**第二,需读 SDD 清洗看 work_item 怎么形成。
- code 排除式第三;knowledge 已对齐(最低)。
- **flip 不是一次干净的开关**:它依赖「skill ref 富化 + capability operator 读 per-usage + skill→semantic 进 config + 归属口径验证」。这些应在 flip 的 reclean 之前,以可证伪方式逐项对齐(理想:同一份数据,bridge run 与 source_backed run 的 `profile_capability_usages` 按 user/trigger/stage 分组计数一致)。

---

## 10. skill→semantic→config 映射方案(数据实证设计)

**真实数据(本机)**:13 semantics / 40 aliases;**实际用到 4 个 = SDD 工作流**(proposal 17 / code 9 / design 5 / task 3);另有 **47 次调用是非-SDD 技能**(`superpowers:*` / `impeccable` / `grill-me` / `run` / `init`…),bridge 里 `semantic_id=NULL`。

### 映射结构:每 semantic → 1 SkillSourceRule + 1 capabilityRule
- **SkillSourceRule(新 locator)**:`{ ruleId:'skill-<code>', locatorType:'skill', category:'skill', skillNames:[<该 semantic 全部 alias>], actions:['invoke'], confidence:'high', priority, enabled }`
- **capabilityRule**:`{ ruleId:'cap-<code>', sourceRuleIds:['skill-<code>'], actions:['invoke'], capabilityCode:'<semantic_code>', displayName:'<display_name>', stage:<lifecycle code 或 null> }`
- 13 semantics → 13 + 13 条(规模小,可生成后落进 `sdd-default.ts`)。

### artifactFilenamePatterns → process_doc 的 artifactRule(不挂 skill)
semantic 的 `artifact_filename_patterns` 汇总进 **process_doc** 源规则的 `artifactRule.typePatterns`(`artifactType=semantic_code`,`include=patterns`)。因为产物是"工作时写的过程文档文件",来源是 process_doc 路径,不是 skill 本身。

### stage / funnel
- 生命周期阶段 = proposal/design/task/codereview(= `SDD_MATURITY_STAGES`);这 4 条 `capabilityRule.stage`=自身 code,其余 9 个 stage=null。
- `presentation.maturityStages=['proposal','design','task','codereview']`(有序)驱动 funnel。

### 口径决策点:47 个非-SDD 技能
bridge 把它们投成 capability_usages(`code=NULL`)。两个选择:
- **(a) catch-all skill 规则**(最低优先级 matchAny):count 对齐 **81=81**,`code=raw_skill_name`、stage=null——flip 口径中性,**推荐先用 a 便于逐项对账**;
- **(b) 不收**:count=34,SDD 板只显工作流能力——更干净但属口径变更,留产品决定。
- 两者 funnel/stage 都不受影响(这 47 不属任何 stage)。

### 新增 config schema(实现时)
`SkillSourceRule`(`locatorType:'skill'` + `skillNames`)、`SourceCategory += 'skill'`、`SourceAction += 'invoke'`、`capabilityRule += stage?`。

### 生成机制
一次性 generator:读 `sdd_skill_semantics` + `sdd_skill_aliases` → 生成上述 rules → 落进 sdd-default 的 builtin `sdd-default.ts`(13 条小,生成后人工核对)。

### 对账口径(flip 验证,需 reclean)
bridge run vs source_backed run 的 `profile_capability_usages` 按 **user × trigger_source × stage** 分组计数一致(不按 raw `capability_code` 逐一对——47 未分类项 code 不同但 stage 皆空)。

---

## 11. flip prep 全完成 + switch 前的口径现实(材料性发现)

### prep 全部完成并验证(commits Flip-prep A–E)
| 步 | 内容 | 验证 |
|---|---|---|
| A | config schema 支持 skill 规则(`SkillSourceRule` + `capabilityRule.stage`) | 单测 + typecheck/build |
| B | skill emit 接 `updateForBatch`(全量重建) | **reclean 实测**:删空→reclean→确定性 81=81 |
| C | `buildSddSkillConfig` 生成器(§10 映射) | 单测 |
| D | capability 读 skill per-usage evidence | typecheck(口径在 flip reclean 验) |
| E | matcher `userRootKey` 解析(per-user 根) | 单测 |

源层(skill 进 source_references)经全量 reclean 验证健壮(81=81、幂等);capability/knowledge 的 source_backed 通路就绪。

### ⚠️ 硬现实:flip 切 source_backed **无法与 bridge 口径中性一致**(实测数据支撑)
| 表 | bridge | source_backed(当前模型) | 差 | parity 需要 |
|---|---|---|---|---|
| **capability** | **81**(全部 skill_usage) | **34**(仅 13 semantic 的 bk-fe-* 技能) | 47 个非-SDD 技能(`superpowers:*`/`impeccable`…)不匹配 | catch-all skill 匹配(`skillNames` 通配)——现仅精确匹配 |
| **code** | `codeOperator`(排除 wiki/req 根) | **0**(SDD code=非 doc,无正根可表达) | 全丢 | code 规则加 **exclude-userRootKey** 机制 |
| **delivery** | `sdd_work_items`(标题含内容派生) | requirements 路径 `parent_dir` 解析 | 标题/口径可能不同 | `titleStrategy` 对齐 |
| **knowledge** | `knowledgeOperator`(per-user wiki) | knowledge 规则(`userRootKey=wiki`,E 已通) | 应一致 | — |
| **artifact** | `sdd_work_item_artifacts` | `artifactRule.typePatterns`(=`artifactFilenamePatterns`) | 应较接近 | 逐型比对 |

数据实证:`sdd_skill_usages` 81 = 34 SDD 工作流 + 47 非-SDD。直接 switch 会让 SDD 看板 capability 81→34、code →0——**这是行为变更,不是默认参数,故落文档而非静默执行**。

### 两条路(下一步)
- **路 1(口径重定义,简单)**:source_backed sdd-default 只统计 SDD 工作流技能(34)、不要 code 板(本就未在 SDD 看板露出)、delivery 走路径解析。SDD 看板数字会变。
- **路 2(parity,工作量大)**:补三件——① catch-all skill 匹配(`skillNames:['*']` 通配,低优先级,capability_code=raw_skill_name)让 capability 回 81;② code 规则 `excludeUserRootKeys` 复现"非 doc";③ delivery `titleStrategy`。再生成 sdd-default 全量 config(skill via `buildSddSkillConfig` + knowledge `userRootKey=wiki` + process_doc `userRootKey=requirements` + delivery + artifact + `SDD_PRESENTATION`)、切 `projectionMode`、reclean 按 user×trigger×stage 对账。

**推荐路 2 的 ①②(capability/code 是 SDD 看板核心),delivery title 逐步对齐**;switch 在三件就绪后一次做、reclean 对账。

---

## 12. flip 已执行 + reclean 口径对账结果

**flip 已 LIVE**:`sdd-default.ts` 切 `source_backed`(13 semantics→buildSddSkillConfig + catch-all + knowledge/process_doc/code path 规则);seed 修复支持 builtin 重新快照,`db:seed` 后 serving 版本切 source_backed;reclean 用统一 source_backed 投影。

### capability 口径对账(核心,§9 头号风险)— ✅ 基本对上
| | bridge | source_backed | |
|---|---|---|---|
| total | 81 | **81** | ✅ |
| coded(SDD 工作流) | 34 | 34(proposal17/code9/design5/task3) | ✅ 计数一致 |
| 非-SDD | NULL×47 | other-skill×47(catch-all) | ✅ count parity |
| trigger user-slash / nested-skill | 39 / 9 | **39 / 9** | ✅ |
| trigger claude-proactive | 32 | 33 | ~ 差 1(1 例语义归类微差,80/81 精确) |

**§9 头号风险解决**:source_backed 从 skill `evidence_json` 复现了 per-usage trigger(user-slash/claude-proactive/nested-skill)与 stage——这正是 flip 前判定会"全空/错"的指标。

### 其他表 vs bridge 源表(逐表对账,修正版)
| 表 | bridge | source_backed | |
|---|---|---|---|
| delivery_units | 2 | **2**(slug 完全一致:2026-05-27/28-add-delayed-debit) | ✅ |
| artifacts | 2 | **2** | ✅ |
| knowledge_recalls | 23 | **23** | ✅ |
| code_activities | — | 1265(exclude 机制通) | ✅ |
| artifact_writes | 4 | 3 | ⚠️ 差 1 |
| artifact_turns | 1 | **0** | ❌ source_backed 无 turn 算子 |

**⚠️ 重大修正**:之前判"delivery/artifact 偏低=架构缺口"是**误判**——本 dev 库 SDD 数据稀疏(仅 2 个 work_items、3/81 skill 挂 work_item),bridge 也是 2。`parent_dir` 路径解析**已精确复现** bridge work-items(slug 全一致)。**delivery-from-skill 重构不需要做。**

### 真实遗留(都很小)
1. **artifact_turns 0 vs 1**:source_backed 无 artifact_turns 算子(bridge 有)→ 此表空。需补一个 turn 算子。
2. **artifact_writes 3 vs 4**:差 1。
3. **capability 80/81**:1 例 alias 语义归类微差。

### 仍未做(页面层 + 清理,§3,非口径)
补 3 个 knowledge 钻取端点、`/sdd/semantics` 退役、`/sdd/*` 路由收口;删死代码(bridge knowledge/code operator + SDD_BRIDGE_OPERATORS);sdd_* 退役(daily-report 改读 profile_*)。均在统一契约背后,不影响当前口径。
