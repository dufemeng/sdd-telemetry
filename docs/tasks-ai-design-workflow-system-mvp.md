# AI Design Workflow System MVP 实施方案

更新时间：2026-06-04  
状态：待实施  
关联设计：`docs/design-ai-design-workflow-system.md`

## 1. 实施结论

MVP 不先做完整网页平台，也不只做纯聊天 skill。第一版交付形态是：

```text
skill / agent workflow
  -> 编排仓库扫描、提问、产物生成、Impeccable 调用、gap 验证和代码 patch

local HTML workbench
  -> 承载用户看、选、评审、确认和 live review 入口
```

核心工程目标不是一次性生成漂亮页面，而是把一条需求 flow 的状态、产物、门禁和修复历史串起来，保证它能中断、续跑、复盘和重复执行。

MVP 必须跑通：

```text
已有项目 retrospective
  -> 确认 / 生成 Product Context 和 DESIGN.md
  -> 一句话需求
  -> 苏格拉底式探索循环
  -> 2-3 个 HTML 原型方向
  -> 用户选择 / 合并
  -> docs/design-<flow>.md + docs/design-<flow>.html
  -> 设计稿审查门
  -> 代码实现
  -> token / state / DOM / detector 阻塞检查
  -> interaction / a11y 提醒
  -> 自动修复确定性问题
  -> Impeccable live 人工局部修复
  -> FlowRun 通过记录
```

## 2. MVP 默认决策

| 问题 | MVP 默认 | 原因 |
| --- | --- | --- |
| 用户入口 | Codex / Claude / CLI 中的 skill 或 agent workflow | 最快验证流程，不先做平台 |
| 用户界面 | 本地 HTML workbench | 原型、设计稿、gap report 都需要可视化决策 |
| live 修改 | 复用 Impeccable live | 当前可用，先记录数据，不提前重构 |
| Flow 状态 | `docs/design-<flow>.workflow.json` | 把一条 flow 的状态和产物绑住 |
| 需求级设计文档 | `docs/design-<flow>.md` | 需求权威记录，不污染根 `DESIGN.md` |
| 正式 HTML 设计稿 | `docs/design-<flow>.html` | 用户审阅载体和 gap baseline |
| Proposal HTML | `docs/proposal-<flow>.html` | 方案发散和选择页 |
| gap report | `docs/assets/<flow>/gap-report-<runId>.json/html` + latest 摘要 | 每轮独立保存，机器消费和用户审阅分离 |
| `PRODUCT.md` | 短期保留根目录兼容文件 | 直接复用 Impeccable |
| `DESIGN.md` 更新 | 只允许 delta proposal + 当前操作者确认 | 防止 agent 后台污染全局设计语言 |
| MVP 阻塞检查 | token / state / DOM / detector | 工程上可落地，误杀风险可控 |
| MVP 提醒检查 | interaction / a11y | 先记录噪声，阶段 2 再升级稳定规则 |
| screenshot | visual evidence | 不作为默认阻塞标准 |

## 3. 范围

### 3.1 做

- 定义 FlowRun 状态机和产物台账。
- 定义 artifact layout 和配置。
- 接入可配置 HTML 模板 registry，不硬编码本机路径。
- 先用本仓库已有 `DESIGN.md`、`PRODUCT.md`、`.impeccable/` 和 `docs/design-<flow>.md/html` 做 Stage 0 retrospective。
- 实现项目上下文扫描：README、AGENTS、CLAUDE、docs、package、routes、CSS、tokens、组件、现有页面。
- 复用 Impeccable 生成或刷新 `PRODUCT.md` / `DESIGN.md`。
- 生成 `DESIGN.md` HTML 可视化确认页。
- 实现 Proposal / Prototype 的苏格拉底探索循环和 HTML 原型发散。
- 生成需求级 `docs/design-<flow>.md` 和 `docs/design-<flow>.html`。
- 实现设计稿审查门：deterministic rules + judgment review。
- 实现 Code 工作台的最小 gap loop。
- 自动修复确定性问题，最多三轮。
- 将 Impeccable live 作为人工局部修复入口。
- 记录 PatchIntent、gap history 和 resume pointer。

### 3.2 不做

- 不做完整 SaaS / Web 平台。
- 不做团队权限、审批流、资产商城。
- 不做 Sketch adapter。
- 不做 Figma / Sketch 替代编辑器。
- 不做多 design profile UI。
- 不做任意页面像素级自动还原。
- 不把 interaction / a11y 在 MVP 中直接作为全部阻塞检查。
- 不把 live 当成纯静态 HTML 能力。
- 不让 agent 后台静默改根 `DESIGN.md`。

## 4. 目录和产物约定

```text
docs/
  proposal-<flow>.html                 # Proposal 阶段 HTML 原型集合
  design-<flow>.md                     # 需求级正式设计产物
  design-<flow>.html                   # 正式 HTML 设计稿
  design-<flow>.workflow.json          # FlowRun 状态和产物台账
  tasks-<flow>.md                      # 可选的具体实现任务
  assets/<flow>/
    gap-report-<runId>.json            # 单轮机器可读 gap report
    gap-report-<runId>.html            # 单轮用户可读 gap report
    gap-report-latest.json             # 指向最新一轮的机器可读摘要
    gap-report-latest.html             # 指向最新一轮的用户可读摘要
    screenshots/                       # visual evidence
    patches/                           # 独立 diff、patch 摘要或引用

DESIGN.md                              # 根目录全局设计语言，低频更新
PRODUCT.md                             # MVP 兼容 Impeccable
.impeccable/design.json                # Impeccable sidecar
```

命名规则：

- `<flow>` 使用短横线 slug，例如 `mobile-checkout-onboarding`。
- 创建 flow 前必须查重；如果 `docs/design-<flow>.workflow.json` 或同名核心产物已存在，必须提示用户换名、复用已有 flow，或自动追加短后缀。
- Markdown 是权威记录，HTML 是主要审阅载体。
- HTML workbench 负责展示决策上下文；MVP 中不要求静态页面自动回写状态，用户决策由对话口述给 agent，再由 orchestrator 落 action。
- 真正改运行页面的 live 路径复用 Impeccable live。
- `docs/design-<flow>.workflow.json` 是内部控制面，不要求用户理解字段。

## 5. FlowRun 状态机和产物台账

### 5.1 用户感知

用户只需要看到：

```text
当前在哪一步
现在需要我决定什么
已经有哪些产物
为什么不能继续
```

不要把 `flowId`、`resumePointer`、`artifactRefs` 等字段暴露成用户必须学习的概念。它们可以出现在高级详情里，但默认以人话展示。

### 5.2 内部状态

`docs/design-<flow>.workflow.json` 至少包含：

| 字段 | 用途 |
| --- | --- |
| `flowId` | 绑定同一需求下的所有产物 |
| `title` | 用户可读标题 |
| `currentStage` | `proposal` / `design` / `code` / `done` |
| `currentGate` | 当前阻塞门禁，例如 `prototype-selection`、`design-review`、`gap-blocking-check`、`live-review` |
| `artifactRefs` | proposal HTML、design md/html、gap report、PatchIntent、patch 等路径 |
| `designVersion` | 进入设计稿审查门时使用的 `DESIGN.md` version 或 hash |
| `reviewStatus` | 设计稿审查门状态和阻塞原因 |
| `gapHistory` | 每轮 gap 检查、自动修复前后、剩余提醒项和 report refs |
| `patchIntentHistory` | 每次自动修复或 live 修改的目的、范围和复验要求 |
| `resumePointer` | 中断后下一步要执行的 action |
| `eventLog` | append-only 关键事件 |

### 5.3 状态推进 action

大模型不能直接“凭记忆”推进阶段。orchestrator 必须通过显式 action 推进：

| Action | 允许前置条件 | 结果 |
| --- | --- | --- |
| `createFlow` | 有需求输入和项目上下文 | 创建 workflow ledger |
| `recordQuestionAnswer` | 当前在 Proposal 探索循环 | 更新假设和未解决分歧 |
| `attachPrototype` | 已生成 proposal HTML | 记录候选方向 |
| `approvePrototype` | 用户选择 / 合并方向 | 进入 Design |
| `attachDesignArtifact` | 已生成 design md/html | 记录正式设计产物 |
| `runDesignReview` | design md/html 存在，`DESIGN.md` version 已记录 | 写入 review status |
| `approveDesign` | 审查门通过，用户确认 | 进入 Code |
| `attachImplementationTarget` | 有目标 route / URL 和已登录会话 | 准备 gap loop |
| `attachGapReport` | gap report schema 通过 | 写入 gap history |
| `recordPatchIntent` | 有 patch 或 live 修改 | 写入 patchIntentHistory |
| `markDone` | 阻塞检查通过，用户接受剩余提醒 | 完成 flow |

每个 action 前都要跑 invariant check。缺产物、缺状态清单、`DESIGN.md` 版本不一致、审查门未过或 gap report schema 不合法时，必须阻塞并给用户人话原因。

## 6. 核心模块

```text
Design Workflow Orchestrator
  -> Flow Ledger Store
  -> Project Scanner
  -> Template Registry Adapter
  -> Product Context Adapter
  -> DESIGN.md Bootstrapper
  -> Proposal / Prototype Engine
  -> Design Artifact Engine
  -> Review Gate Engine
  -> Code Gap Engine
  -> Auto Fix Engine
  -> Live Repair Bridge
```

| 模块 | 职责 | MVP 实现方式 |
| --- | --- | --- |
| Orchestrator | 执行 action、跑 invariant、推进 stage/gate | 本地命令或 skill 编排 |
| Flow Ledger Store | 读写 `docs/design-<flow>.workflow.json` | JSON schema + append-only event log |
| Project Scanner | 读取仓库上下文和现有设计信号 | 本地文件扫描 + 可选浏览器采样 |
| Template Registry Adapter | 提供 HTML 模板清单和示例 | 路径或 package 可配置 |
| Product Context Adapter | 维护产品调性上下文 | MVP 读写 `PRODUCT.md` |
| DESIGN.md Bootstrapper | 生成/确认全局设计语言 | 包装 Impeccable `init/document` |
| Proposal Engine | 苏格拉底探索、发散、收敛 | 会话状态 + 决策树 + HTML 候选页 |
| Design Artifact Engine | 生成需求级设计文档和正式 HTML | `docs/design-<flow>.md/html` |
| Review Gate Engine | 设计稿审查门 | deterministic rules + Impeccable critique/detector |
| Code Gap Engine | 设计稿和实现页面比对 | token/state/DOM/detector 阻塞，interaction/a11y 提醒 |
| Auto Fix Engine | 修复确定性问题 | 最多三轮，patch 可回滚 |
| Live Repair Bridge | 人工局部修复 | Impeccable `live` + PatchIntent |

## 7. 任务拆分

### T0：配置和 artifact 协议 `[Stage 1 | depends: none]`

交付：

- 定义 `ai-design-workflow.config.json` 或等价配置。
- 配置字段至少包括：
  - `artifactDir`，默认 `docs/`。
  - `templateRegistry`，支持 path 或 package id。
  - `designMdPath`，默认 `DESIGN.md`。
  - `productContextMode`，MVP 为 `product-md-compatible`。
  - `defaultViewports`，至少包含 H5 mobile。
  - `gap.blockingChecks`，默认 `token/state/dom/detector`。
  - `gap.warningChecks`，默认 `interaction/a11y`。
  - `gap.maxAutoFixRounds`，默认 3。
  - `htmlWorkbenchMode`，MVP 默认为 `static-decision-via-agent`。
  - `flowSlugConflictPolicy`，默认 `prompt-or-append-suffix`。
  - `gap.runIdFormat`，默认按时间戳或递增轮次生成。

验收：

- 不出现本机绝对路径硬编码。
- 配置缺失时给出可执行的修复提示。
- 产物路径全部落在 `docs/` 或仓库根的明确兼容文件。
- 创建 flow 时执行 slug 查重，不能覆盖已有 flow 核心产物。

### T1：Flow Ledger Store `[Stage 1 | depends: T0]`

交付：

- `docs/design-<flow>.workflow.json` schema。
- FlowRun 创建、读取、更新、续跑。
- append-only `eventLog`。
- action 前 invariant check。
- gap history 记录每轮 `gap-report-<runId>.json/html`，并维护 latest ref。
- 用户可读状态摘要：
  - 当前步骤。
  - 当前需要决策。
  - 已有产物。
  - 阻塞原因。

验收：

- 同一 flow 中断后能从 `resumePointer` 继续。
- 第二条 flow 不会覆盖第一条 flow 的产物。
- 缺关键产物时不能靠模型继续编造下一步。
- gap report 历史可追踪，不被最新一轮覆盖。

### T2：模板 registry 接入 `[Stage 1 | depends: T0]`

交付：

- 读取模板列表：id、name、scenario、surface、description、example HTML。
- 支持按场景推荐：
  - H5 单屏：`mobile-app`
  - H5 多屏：`mobile-onboarding` + `mobile-app`
  - PRD / 需求说明：`pm-spec`
  - gap report：`data-report` / `dashboard`
  - 技术交接：`eng-runbook` / `docs-page`
- 生成 HTML 前必须选择模板或显式声明 fallback shell。

验收：

- 模板来源可配置。
- 用户可以覆盖系统推荐模板。
- 生成 HTML 可作为静态文件打开，不依赖模板仓库运行时服务。
- MVP 的静态 HTML workbench 只负责展示和辅助决策，不负责把点击事件自动写回 Flow Ledger；真实状态推进由用户在对话中确认，再由 orchestrator 执行 action。

### T3：项目扫描和 Stage 0 retrospective `[Stage 0 | depends: none]`

交付：

- 扫描 README、AGENTS、CLAUDE、docs、package、routes、CSS、tokens、组件、已有页面。
- 输出 `ProjectContextSnapshot`：
  - 项目目的和用户假设。
  - 技术栈和本地启动方式。
  - 已有设计信号。
  - 现有 `DESIGN.md` / `PRODUCT.md` / `.impeccable/` 状态。
  - 已有 `docs/design-<flow>.md/html` 质量样本。
- Stage 0 先抽样回顾本仓库已有设计产物，不先另选绿地仓库。

验收：

- 能判断已有设计产物是否缺目标 route、状态清单、验收规则。
- 能发现当前设计产物对 gap loop 的缺口。
- retrospective 形成可执行的改进清单。

### T4：Product Context 和 DESIGN.md 冷启动 `[Stage 0/1 | depends: T0,T3]`

交付：

- 缺 `PRODUCT.md` 时生成或确认 Product Context。
- 缺 `DESIGN.md` 时包装 Impeccable `document` 的 scan / seed 流程。
- 已有 `DESIGN.md` 时不静默覆盖。
- 生成 `docs/design-system-confirmation.html`：
  - 产品调性摘要。
  - 色板、字体、组件样例。
  - H5 屏幕片段。
  - Do / Don't。
  - 从代码 / 截图抽取的证据。

验收：

- 用户确认前不写最终根 `DESIGN.md`，或只写明确标记的 draft。
- 确认页美观，基于模板或设计系统 shell。
- 写入后记录 `designVersion`。

### T5：Proposal / Prototype 探索循环 `[Stage 1 | depends: T1,T3,T4]`

交付：

- 支持一次只问一个问题。
- 每问提供推荐答案，并解释为什么影响方案。
- 维护：
  - 当前假设。
  - 已确认决策。
  - 未解决分歧。
  - 下一问。
  - 收敛条件。
- 通过 Flow Ledger 记录关键问答和决策。

验收：

- 一句话需求不会直接进入生码。
- 探索循环不变成长问卷。
- 信息足够时能主动收敛到原型发散。

### T6：HTML 原型发散 workbench `[Stage 1 | depends: T1,T2,T5]`

交付：

- 生成 `docs/proposal-<flow>.html`。
- 页面包含 2 到 3 个候选方向，每个方向说明：
  - 探索主轴。
  - 适合场景。
  - 取舍。
  - H5 原型。
- 用户可以选择、合并、否决或要求下一轮变体。
- `approvePrototype` 写入 Flow Ledger。

验收：

- HTML 候选方向美观，基于模板 registry。
- 移动端关键 viewport 不溢出、不遮挡。
- 用户能从 HTML 中判断方向差异。
- MVP 不要求用户点击 HTML 后自动写回；用户在对话里说出选择、合并或否决结果，agent 调用 `approvePrototype` 或继续发散。

### T7：需求级正式设计产物 `[Stage 1 | depends: T1,T2,T6]`

交付：

- 生成 `docs/design-<flow>.md`，包含：
  - 背景和目标。
  - 用户和场景。
  - 被选方向和取舍。
  - 信息架构和主路径。
  - 机器可读的屏幕清单。
  - 机器可读的状态清单：空、加载、错误、成功、边界数据。
  - 每个状态的驱动方式：mock 响应、query 参数、fixture、feature flag、seed data 或人工不可测说明。
  - 目标 route / URL。
  - H5 约束：safe-area、键盘、底部操作区、tap target。
  - 验收规则清单。
  - 引用的 `DESIGN.md` version 或 hash。
  - HTML 设计稿路径。
- 生成 `docs/design-<flow>.html`，作为正式设计稿和 gap baseline。

验收：

- 需求级文档不复制根 `DESIGN.md` 的全部内容。
- 如果设计稿偏离根 `DESIGN.md`，必须记录偏离理由。
- 没有机器可读状态清单时，不能进入 Code。
- 声明为可检查的状态必须有状态驱动方式；没有驱动方式的状态只能在 gap report 中标记为 `not-testable`，不能算通过。

### T8：设计稿审查门 `[Stage 1 | depends: T1,T7]`

交付：

- deterministic rules：
  - `DESIGN.md` token 使用。
  - H5 viewport。
  - safe-area。
  - tap target。
  - 关键状态覆盖。
  - overflow。
  - 设计稿 a11y。
  - detector 反模式。
- judgment review：
  - 信息架构。
  - 主路径。
  - 产品命题。
  - 关键文案和状态。
  - 每条致命意见必须绑定屏幕、元素、文本或交互证据。
- 评审结论写回 `docs/design-<flow>.md` 和 Flow Ledger。

验收：

- deterministic rules 未通过时直接阻塞。
- judgment review 只有带证据的致命问题能阻塞。
- 评分不作为唯一阻塞条件。
- 设计稿 a11y 阻塞是有意策略；实现页面 a11y 在 MVP 先提醒。

### T9：Code 工作台接入 `[Stage 1 | depends: T1,T8]`

交付：

- Code 工作台读取：
  - `docs/design-<flow>.workflow.json`
  - `docs/design-<flow>.md`
  - `docs/design-<flow>.html`
  - `DESIGN.md`
- 生成或修改代码。
- 启动页面并用浏览器自检。
- 目标 route / URL 来自 `docs/design-<flow>.md`。
- 读取 `docs/design-<flow>.md` 中声明的状态驱动方式，并在进入 gap loop 前确认哪些状态可测。

验收：

- 实现 agent 不直接改根 `DESIGN.md`。
- 如果实现发现设计产物矛盾，回到 Design 修订。
- gap 检查默认复用已登录浏览器会话；不把登录流程作为本地 gap loop 责任。
- 无法驱动的状态必须回写为 `not-testable` 或回到 Design 补驱动方式，不能静默跳过。

### T10：最小 gap engine `[Stage 1 | depends: T1,T7,T9]`

交付：

- 输入：
  - Flow Ledger。
  - Design HTML baseline。
  - implementation page URL。
  - `DESIGN.md` version。
  - viewport 列表。
  - 状态驱动方式清单。
- 可比区域准备：
  - HTML 设计稿必须标记可比主体区域，例如 `data-design-surface="main"`。
  - 手机壳、状态栏、注释、标尺、候选说明等审阅 chrome 必须标记为不可比区域，例如 `data-design-chrome`。
  - implementation page 需要通过 route、selector 或 main landmark 定位对应主体区域。
  - 没有可比区域标记时，DOM / token diff 只能降级为提醒或要求回到 Design 补标记。
- 状态驱动：
  - `empty`：fixture、query 参数或 mock 空响应。
  - `loading`：延迟 mock、loading flag 或可控 suspense 状态。
  - `error`：mock 500、rejected promise 或错误 fixture。
  - `success`：默认成功 fixture。
  - `boundary`：长文本、大列表、零值、最大值、异常字符等 fixture。
  - 无法驱动的状态标记为 `not-testable`，并进入提醒项或 Design 修订建议。
- 阻塞检查：
  - token / rule diff。
  - state coverage。
  - DOM / semantic diff。
  - detector。
- 提醒检查：
  - interaction diff。
  - accessibility diff。
- 证据：
  - Playwright screenshot。
  - optional masked diff。
- 输出：
  - `docs/assets/<flow>/gap-report-<runId>.json`
  - `docs/assets/<flow>/gap-report-<runId>.html`
  - `docs/assets/<flow>/gap-report-latest.json`
  - `docs/assets/<flow>/gap-report-latest.html`

实现口径：

- DOM diff 不做逐节点像素级或源码级对齐，只比较语义层：关键文本、role、主要区块、可交互元素、状态容器和验收选择器。
- token diff 先 normalize 再比较：颜色统一成 RGBA，单位统一成 px，数值允许小数舍入，字体允许 fallback 族，line-height / letter-spacing / opacity 允许配置容差。
- chrome 剥离和 token 容差必须写入 gap report，方便判断误杀来源。

验收：

- gap report schema 通过后才能写入 Flow Ledger。
- screenshot 不作为默认阻塞标准。
- interaction / a11y 在 MVP 只提醒，不自动挡住 flow。
- 明显 token、状态、DOM、detector 问题能阻塞。
- 可比区域缺失时不会强行做高置信 DOM / token 阻塞判断。
- 每轮 gap report 有独立 `runId`，历史不被覆盖。

### T11：自动修复 loop `[Stage 1 | depends: T1,T10]`

交付：

- 根据 gap report 自动修复确定性问题。
- 默认最多 3 轮。
- 每个 patch 只处理一类问题。
- 每轮重新跑 deterministic checks。
- 写入 gap history 和 patch intent。
- 每个 patch 保存为独立 diff 文件或独立 patch ref；是否创建 git commit 由用户或仓库策略决定，不强制污染 git 历史。

验收：

- 修复后阻塞问题数量必须下降。
- 不下降、出现新高风险问题或需要猜产品意图时立即停止。
- patch 必须可单独回滚。
- 自动修复不会改根 `DESIGN.md`。
- 主观问题进入人工 live。

### T12：Human Live Review `[Stage 1 | depends: T1,T10,T11]`

交付：

- HTML workbench 提供 live review 入口、问题列表、区域选择和确认动作。
- MVP 中 HTML workbench 的确认动作可以由用户在对话里口述完成，再由 agent 执行 `recordPatchIntent`；不要求静态页直接写状态。
- 真正修改运行页面时复用 Impeccable live。
- 每次 live patch 记录 `PatchIntent`：
  - 改动目标。
  - 关联设计规则。
  - 影响范围。
  - 是否需要重新跑 gap。
  - 耗时和结果。

验收：

- live 不作为第一道调试入口。
- 接受 patch 后必须重新跑相关 gap。
- 记录 live 耗时、成功率、返工次数和用户放弃点。
- 不提前重构 live 链路；MVP 后用数据决定优化方向。

### T13：DESIGN.md 更新门禁 `[Stage 1 | depends: T1,T8,T10]`

交付：

- 只生成 `DESIGN.md delta proposal`，不后台静默写入。
- delta proposal 包含：
  - provenance。
  - 变更前后差异。
  - 影响的 token / 组件 / 规则。
  - HTML 可视化确认页。
- 当前操作者显式确认后才写根 `DESIGN.md` 和 sidecar。

验收：

- 未批准的变化只留在 `docs/design-<flow>.md`。
- 根 `DESIGN.md` 更新频率保持低频。
- 需求级文档引用更新后的 version 或 hash。

## 8. 阶段计划

### Stage 0：手动编排验证

目标：用本仓库已有产物验证链路和风险，少写新工程。

顺序：

1. 抽样读取已有 `DESIGN.md`、`PRODUCT.md`、`.impeccable/` 和多组 `docs/design-<flow>.md/html`。
2. 检查需求级文档是否有机器可读状态清单、目标 route、验收规则。
3. 用现有产物手工跑一次设计稿审查门。
4. 对一个已有实现页跑最小 gap：token / state / DOM / detector 阻塞，interaction / a11y 提醒，截图做证据。
5. 手工记录一个 Flow Ledger 样例。
6. 用 Impeccable critique / live / polish 完成一轮修复。
7. 记录误判、噪声、修复耗时、产物缺口。

通过标准：

- 能证明 Flow Ledger 需要记录哪些字段。
- 能发现已有设计产物对 gap loop 的缺口。
- 能区分阻塞检查和提醒检查的噪声。
- live 可用，并有耗时和成功率记录。

### Stage 1：MVP

目标：把 Stage 0 手动步骤固化成可重复命令或最小 UI。

新增：

- 统一 orchestrator 入口。
- Flow Ledger Store。
- 模板 registry 配置。
- HTML workbench 生成。
- 设计稿审查门。
- gap report 标准格式。
- 自动修复安全 loop。
- live PatchIntent 记录。

通过标准：

- 同一套命令可在第二个 flow 上重复跑通。
- 中断后能续跑。
- 产物命名稳定，历史可追踪。
- `DESIGN.md` 不被日常需求污染。

### Stage 2：增强版

目标：提高可靠性和速度。

新增：

- token / state / DOM / detector 检查降噪和扩大覆盖。
- 稳定的 interaction / a11y 规则从提醒升级为阻塞。
- H5-first knobs 和本地 deterministic patch。
- Product Context adapter。
- 多 design profile 预留。
- 图片 / HTML 输入解析增强。

### Stage 3：平台化

目标：团队级设计流程平台。

新增：

- 统一网页产品。
- 设计产物 registry。
- 多 design profile。
- 审批和版本历史。
- 评审 overlay。
- CI design gap gate。

注意：CI 不能复用人工已登录浏览器会话，需要程序化登录、测试账号或预置 session。

## 9. 验收清单

MVP 验收必须满足：

- [ ] 无本机绝对路径硬编码。
- [ ] 有 `docs/design-<flow>.workflow.json` 记录 flow 状态和产物台账。
- [ ] 中断后可以续跑。
- [ ] 没有把需求级内容写进根 `DESIGN.md`。
- [ ] 没有跳过 Proposal / Prototype 探索循环。
- [ ] HTML 原型和设计稿美观，可用于认真评审。
- [ ] 用户至少在原型选择、正式设计批准、人工 live 修复中有明确决策点。
- [ ] Impeccable 能力被复用，而不是重造 critique / live / detector。
- [ ] 设计稿审查门有 deterministic rules 和 judgment review。
- [ ] gap report 使用阻塞 / 提醒 / 证据三档。
- [ ] 自动修复不会越权改全局设计语言。
- [ ] 自动修复 patch 可回滚，且每轮阻塞问题数量必须下降。
- [ ] `DESIGN.md` 只有经当前操作者确认的 delta 才会更新。

## 10. 风险与缓解

| 风险 | 表现 | 缓解 |
| --- | --- | --- |
| 模型漏执行约束 | 跳阶段、编造产物、忘记记录 | orchestrator action + invariant check + Flow Ledger |
| Flow 产物散落 | 第二条 flow 开始后无法复盘 | `docs/design-<flow>.workflow.json` 绑定产物 |
| 探索循环变成长问卷 | 用户被连续追问 | 一次只问一个问题，每问给推荐答案，信息足够即发散 |
| HTML 产物丑 | 用户不信任方案 | 强制模板 registry + 浏览器截图检查 |
| `DESIGN.md` 腐化 | 每个需求都改全局规则 | delta proposal + 当前操作者确认 |
| Impeccable 被绕开 | 自建重复能力 | 明确 critique/live/detector/polish 复用边界 |
| gap 误判 | 响应式差异或 a11y 噪声误杀 | 阻塞 / 提醒 / 证据三档 |
| screenshot 误导 | 手机壳和状态栏造成大量噪声 | screenshot 只做 visual evidence |
| live 太慢 | 高频修改都等模型 | MVP 先复用并记录数据，阶段 2 加 knobs 和 deterministic patch |
| Product Context 冲突 | README/AGENTS/PRODUCT 各说各话 | MVP 兼容，后续 adapter 化 |
| CI 登录失败 | CI 没有人工浏览器会话 | 阶段 3 引入程序化登录、测试账号或预置 session |

## 11. 仍需确认但不阻塞

1. Stage 0 抽样哪几组已有 `docs/design-<flow>.md/html`。
2. 模板 registry 是 vendoring 模板，还是作为独立 package 依赖。
3. `docs/design-<flow>.workflow.json` 是否需要单独 JSON schema 文件。
4. gap report 可读摘要优先 HTML 还是 Markdown。
5. Stage 1 的 orchestrator 是先做 CLI 命令，还是作为 Codex skill 脚本。

## 12. 变更前风险自检

- **复用分析**：Impeccable 的 `init/document/critique/audit/live/polish/detector` 直接复用；HTML 模板体系作为 registry 参考；superpowers brainstorming 和 grill-me 的问答协议作为 Proposal 工作台参考。
- **抽象分析**：Flow Ledger 是必要控制面，不是平台级过度抽象；没有它无法续跑、复盘和并行跑多条 flow。
- **破坏性分析**：本文档不改现有 API、数据库、worker、启动脚本或代码实现。后续实现写入根 `DESIGN.md` 必须走确认门禁。
- **影响分析**：影响后续 AI Design Workflow MVP 的实施顺序、产物路径和验收口径；不影响当前 SDD telemetry 运行链路。
