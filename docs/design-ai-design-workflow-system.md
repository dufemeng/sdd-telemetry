# AI Design Workflow System 架构设计

更新时间：2026-06-04  
状态：架构方案草案  
目标读者：AI Design Workflow 设计者、实现者、后续 MVP 规划者

## 1. 结论

本方案不再把系统定义为传统 Design System，也不直接沿用 proposal、design、review、task、code、test 这套研发阶段。

更合适的产品形态是 **AI Design Workflow System**：用三个工作台串起需求澄清、HTML 原型、正式设计产物、代码实现、gap 验证和 live 修复。

三个工作台：

```text
Proposal / Prototype
  把方案和交互聊清楚，发散多个 HTML 原型方向，收敛出被选方案

Design
  产出正式需求级设计产物，生成 HTML 设计稿，完成设计评审和审批

Code
  生成或修改代码，自动做设计 gap 验证和自修复，再进入人工 live 局部修复
```

核心资产分层：

```text
DESIGN.md
  全局设计语言，遵循 Google DESIGN.md 格式

docs/design-<flow>.md
  面向某个需求或 H5 流程的正式设计产物

HTML prototype / HTML design artifact
  给用户、设计师、开发和 agent 共同审阅的可视化产物

gap report
  设计产物和代码实现之间的差异证据
```

Impeccable 不应被重造。它应该作为底座复用，承担 `init/document/critique/audit/live/polish/detector` 等设计质量能力。本系统在它上层增加需求级编排、HTML 方案选择、设计产物管理和 gap 验证闭环。

## 2. 背景

目标用户不应被强行分成产品经理、设计师和开发三个互斥角色。一个人可以独立完成完整流程，也可以在某一步交接给其他角色。

系统要解决的问题不是“按钮、颜色、组件长什么样”，而是：

- 一句话需求如何变成专业、可评审的 H5 原型。
- 设计语言如何从已有仓库冷启动，而不是每次从 prompt 猜测。
- 正式设计产物如何不绑定 Sketch、截图或某个单一文件格式。
- 代码实现后如何自动发现和修复与设计产物的 gap。
- 人工 live 修改如何保持高频、低延迟，并能回写设计语义。

## 3. 目标

### 3.1 产品目标

第一阶段目标是跑通一个端到端薄闭环：

```text
冷启动仓库
  -> 扫描代码和文档
  -> 生成产品调性假设
  -> 用户确认
  -> 生成全局 DESIGN.md
  -> 一句话需求
  -> 苏格拉底式 brainstorming
  -> 2 到 3 个 HTML H5 原型方向
  -> 用户选择或合并
  -> docs/design-<flow>.md + HTML 设计稿
  -> 代码实现
  -> 自动 gap 验证和自修复
  -> 人工 live 局部修复
  -> 通过记录
```

### 3.2 架构目标

1. 全局设计语言和需求级设计产物分离，避免根 `DESIGN.md` 膨胀。
2. HTML 是主要审阅载体，Markdown 是权威记录，二者互相引用；HTML 必须具备可展示的设计质量，不能是裸排版页面。
3. 流程步骤不因为缺少某个角色而跳过，只由当前操作者和 AI 共同完成。
4. Impeccable 作为设计质量和 live 底座复用，不重复实现已有能力。
5. gap 验证先由 agent 自动完成和修复，再把主观或难修问题交给人工 live。
6. 前期支持自然语言、HTML、图片/截图、已有代码页面；Sketch 只保留扩展接口，不进入 MVP。

## 4. 非目标

第一阶段不做：

- 不做 Sketch adapter 的真实解析和编辑。
- 不做 Figma/Sketch 替代品。
- 不做完整设计资产管理平台。
- 不做多团队权限、发布审批、设计资产商城。
- 不追求任意页面像素级自动还原。
- 不把所有需求设计都写入根 `DESIGN.md`。
- 不把 live 作为第一道调试工具，live 是自动 gap loop 之后的人工评审入口。

## 5. 核心概念

### 5.1 全局 DESIGN.md

根目录 `DESIGN.md` 是全局设计语言权威，遵循 Google DESIGN.md 格式。

职责：

- 品牌和产品视觉方向。
- 颜色、字体、圆角、间距、组件语义。
- Do's and Don'ts。
- 可被 Impeccable、Stitch-aware 工具和未来 agent 读取。

不承载：

- 某个具体需求的完整用户路径。
- 某个 H5 流程的状态图。
- 单次评审结论。
- 每次 code gap 的修复记录。

### 5.2 需求级 design 文档

`docs/design-<flow>.md` 是面向某个需求或 H5 流程的正式设计产物。

职责：

- 本需求的目标、用户路径、关键交互、屏幕状态。
- 屏幕、状态、目标 route 和验收项必须列成可检查清单，不能只散落在正文叙述中。
- 原型方向和最终选择。
- HTML 设计稿路径。
- 设计评审结论。
- 与代码实现的验收规则。

它引用根 `DESIGN.md`，但不复制全局设计系统。

### 5.3 HTML 原型和 HTML 设计稿

HTML 是人机共看的设计载体。

两类 HTML：

- **探索原型**：Proposal / Prototype 阶段，用于展示 2 到 3 个方向，允许粗糙但必须能看出交互。
- **正式设计稿**：Design 阶段，用于评审和代码实现对齐，必须覆盖关键状态、H5 viewport、交互说明和验收标记。

### 5.4 HTML 审阅载体质量

HTML 产物务求美观。用户看到的不是调试页面，而是可以认真评审的设计物。

生成 HTML 原型或正式设计稿时，应优先从模板注册表中选择一个或多个模板作为视觉和结构底座，再按当前 `DESIGN.md` 和需求内容改写。当前可参考 `html-anything` 的模板体系，但实现时必须通过可配置的模板 registry 或 package 接入，不能硬编码本机路径。

推荐模板映射：

| 场景 | 推荐模板 | 用途 |
| --- | --- | --- |
| H5 单屏设计 | `mobile-app` | iPhone 15 Pro frame、safe-area、状态栏、底部导航 |
| H5 多屏流程 | `mobile-onboarding` + `mobile-app` | 并排展示多屏 flow、关键转场和登录/引导路径 |
| Web 原型方向 | `prototype-web`、`web-proto-editorial`、`web-proto-soft`、`web-proto-brutalist` | Proposal 阶段做风格和结构发散 |
| 需求说明页 | `pm-spec` | 把问题、指标、范围、user stories、设计说明整合成可读页面 |
| 技术/实现交接 | `eng-runbook`、`docs-page` | 给开发和 agent 消费的实现说明和验收路径 |
| 数据和验证报告 | `data-report`、`dashboard` | 展示 gap report、diff、检测结果和修复状态 |

约束：

- Proposal 阶段可以用多个模板并排发散，但每个方向必须说明它探索的主轴：信息架构、交互路径、视觉气质、密度或转化路径。
- Design 阶段的正式 HTML 设计稿必须套用或派生自模板，不能只把 Markdown 转成普通 HTML。
- 模板只是起点，不是品牌权威。最终视觉必须服从根 `DESIGN.md`，并在需求级 `docs/design-<flow>.md` 中记录偏离理由。
- HTML 产物需要通过浏览器截图检查：移动端关键 viewport 不溢出、不遮挡、tap target 合理、视觉层级清楚。

### 5.5 Product Context

Impeccable 使用 `PRODUCT.md` 表达战略层：register、用户、目的、品牌个性、反面参考、设计原则。

本系统不应长期把 `PRODUCT.md` 作为与 `README.md`、`CLAUDE.md`、`AGENTS.md` 并列的第二套产品事实来源。更稳妥的处理：

- 短期：为了复用 Impeccable，保留或生成根 `PRODUCT.md`。
- 长期：将战略层沉淀为 `docs/design-product-context.md` 或系统内部 Product Context，再通过 adapter 生成 Impeccable 兼容的 `PRODUCT.md` 视图。

### 5.6 产品承载形态

MVP 不先做完整网页平台，也不只做纯聊天 skill。更合适的承载形态是：

```text
skill / agent workflow
  -> 编排仓库扫描、提问、产物生成、Impeccable 调用、gap 验证和代码 patch

local HTML workbench
  -> 承载用户看、选、评审、确认和 live review 入口
```

用户入口：

- 在 Codex / Claude / CLI 中用 skill 或 agent workflow 发起需求，例如一句话需求、截图、HTML 或已有页面。
- agent 负责读写仓库、生成 Markdown / HTML / JSON / patch 产物，并在关键决策点打开或更新 HTML workbench。
- 用户在 HTML workbench 中完成选择、合并、否决、评审、确认，并从 gap report 进入 live review。
- MVP 中 HTML workbench 可以是静态展示页。用户决策通过对话口述给 agent，agent / orchestrator 再执行 `approvePrototype`、`approveDesign`、`recordPatchIntent` 等 action。
- 用户决策由 orchestrator 回写到 Flow Ledger、需求级设计文档、gap report、PatchIntent 或代码 patch 中，继续推动下一阶段。

三个工作台在 MVP 中可以都是本地 HTML 页面，不要求一开始有账号、团队空间、权限模型或服务端数据库。平台化阶段再把它们升级成统一网页产品。

live review 不是纯静态 HTML 能力。HTML workbench 负责展示入口、区域选择、修复建议和确认动作；真正对运行中页面做局部修改时，MVP 复用 Impeccable live 的注入脚本、本地服务或浏览器会话。

交付产物分两层：

- **用户可见交互层**：HTML prototype、HTML design artifact、`DESIGN.md` 可视化确认页、gap report 页面、live review 页面。
- **权威记录和机器消费层**：根 `DESIGN.md`、Product Context 兼容文件、`docs/design-<flow>.md`、结构化 sidecar、gap report、PatchIntent、代码 patch。

因此，HTML 是主要交互界面，Markdown / sidecar / patch 是可追踪的权威产物。skill 负责流程编排，HTML workbench 负责人机协同决策。

## 6. 三工作台架构

### 6.1 Proposal / Prototype 工作台

目标：把方案和交互聊清楚。

输入：

- 一句话需求。
- 自然语言补充。
- 截图、图片、HTML 片段。
- 已有代码页面。
- 已有根 `DESIGN.md` 和 Product Context。

流程：

1. 扫描当前项目上下文。
2. 形成对用户、场景、约束、设计语言的初始假设。
3. 进入苏格拉底式探索循环：一次只问一个问题，但不预设一两轮结束；沿着决策树追问到关键分歧被解决。
4. 基于已确认的约束发散 2 到 3 个 H5 HTML 原型方向。
5. 用 HTML companion 或内置预览页让用户选择、合并或否决。
6. 根据用户反馈继续发散、变体比较或收敛，直到方案、交互和验收意图足够清楚。
7. 收敛成被选方向和原型说明。

产物：

- `prototype-<flow>.html` 或等价预览地址。
- 原型决策记录。
- 待进入 Design 工作台的 brief。

复用能力：

- superpowers brainstorming 的“发散、收敛、一次一个问题、HTML companion 选择”交互模式。
- grill-me 的“沿决策树逐枝追问，给推荐答案，直到共享理解成立”的问法。
- Impeccable `shape` 的 UX/UI 规划能力。

### 6.2 Design 工作台

目标：产出正式设计产物并完成设计评审。

输入：

- Proposal / Prototype 选定方向。
- 根 `DESIGN.md`。
- Product Context。
- HTML 探索原型。

流程：

1. 如果缺少根 `DESIGN.md`，先进入冷启动设计语言流程。
2. 生成需求级 `docs/design-<flow>.md`。
3. 生成正式 HTML 设计稿，覆盖关键屏、状态和 H5 viewport。
4. 运行设计稿审查门：deterministic rules + judgment review。
5. 审查未通过时回到正式设计稿修订，不进入 Code 工作台。
6. 将评审结论写回需求级设计文档。
7. 用户确认后标记为可进入 Code 工作台。

产物：

- `docs/design-<flow>.md`。
- HTML 设计稿。
- 设计评审报告。
- 验收规则。

复用能力：

- Impeccable `document` 生成根 `DESIGN.md`。
- Impeccable `critique` 做设计评审。
- Impeccable detector 做 deterministic anti-pattern 检测。

#### 6.2.1 设计稿审查门可信契约

Code 工作台默认信任 Design 工作台产出的“正式 HTML 设计稿”。因此设计稿审查门必须是可解释、可复查、可校准的 gate，而不是一次泛泛的 AI critique。

审查门分两层：

| 层级 | 判断方式 | 失败后动作 |
| --- | --- | --- |
| deterministic rules | 程序化检查 `DESIGN.md` token 使用、H5 viewport、安全区、tap target、关键状态、overflow、a11y、detector 反模式 | 直接阻塞，不进入 Code |
| judgment review | AI 只判断设计稿是否解决需求问题：信息架构、主路径、产品命题、关键文案和状态是否成立 | 只有带屏幕、元素、文本或交互证据的致命问题才阻塞 |

通过线：

- deterministic rules 全部通过。
- judgment review 找不到带证据的致命问题。
- 评分只能作为参考，不能替代阻塞条件。

校准方式：

- 阶段 0 记录审查门的 false positive / false negative：系统放过但人会否决的问题、系统阻塞但人会放行的问题。
- MVP 中由当前操作者兜底确认；平台化后再引入团队级抽样和校准机制。
- 审查报告必须保留证据，不能只保留结论。

### 6.3 Code 工作台

目标：实现并对齐设计产物。

输入：

- 需求级设计文档。
- HTML 设计稿。
- 根 `DESIGN.md`。
- 目标代码仓库和技术栈。

流程：

1. 根据设计产物生成或修改代码。
2. 启动本地页面，用 browser use / computer use 自检视觉效果。
3. 运行自动 gap 验证。
4. 对确定性问题自动修复 1 到 3 轮。
5. 产出 gap report。
6. 将主观问题或难修问题交给人工 live。
7. 用户通过 live 做局部修复。
8. 最终运行 polish / audit，并记录通过状态。

产物：

- 代码 patch。
- gap report。
- 自动修复记录。
- live 修改记录。
- 最终通过记录。

复用能力：

- Impeccable `craft` 或普通 coding agent 生码。
- Impeccable `audit` 做技术质量检查。
- Impeccable `live` 做人工局部修复。
- Impeccable `polish` 做最终收口。

## 7. 用户生命周期与决策点

一个完整需求中，用户看到的是三个工作台的连续体验，而不是后台的 agent 执行细节。

```text
进入需求（一句话 / 截图 / HTML / 已有页面）
  |
  v
系统扫描仓库和上下文
  |
  v
Proposal / Prototype 工作台
  |
  +-- 苏格拉底式探索循环
  |     |
  |     +-- 系统一次只问一个问题，并给推荐答案
  |     |        |
  |     |        v
  |     |      用户回答后，系统更新假设和决策树
  |     |
  |     +-- 关键分歧还没解决？
  |     |        |
  |     |        +-- 是：继续追问下一枝
  |     |        |
  |     |        +-- 否：进入原型发散
  |
  v
用户看到 2-3 个美观 HTML 原型方向
  |
  +-- 否决：回到探索循环，重新发散
  |
  +-- 需要调整：基于反馈生成下一轮变体
  |
  +-- 选择 / 合并 / 收敛
        |
        v
Design 工作台
  |
  +-- 已有可信 DESIGN.md？
  |     |
  |     +-- 否：用户看到 DESIGN.md HTML 确认页，确认全局设计语言
  |     |        |
  |     |        v
  |     |      回到 Design 工作台
  |     |
  |     +-- 是
  |
  v
用户看到正式 HTML 设计稿和 docs/design-<flow>.md 摘要
  |
  +-- 设计评审未通过：回到 Design 工作台修订
  |
  +-- 设计评审通过
        |
        v
Code 工作台
  |
  v
agent 生成/修改代码，并用浏览器自动看页面
  |
  v
用户看到 gap report：已自动修复项 + 待人工判断项
  |
  +-- 需要人工 live 修复
  |     |
  |     v
  |   用户在页面选择局部区域，通过 live 接受 patch
  |     |
  |     v
  |   回到 agent 自动看页面和 gap 验证
  |
  +-- 不需要
        |
        v
最终通过记录：设计产物和实现页面完成对齐
```

用户决策点：

| 阶段 | 用户看到什么 | 用户需要决策什么 | 系统必须避免 |
| --- | --- | --- | --- |
| 需求进入 | 系统从仓库推断出的目标、约束、产品调性假设 | 是否接受初始假设，或指出最重要的不确定点 | 一开始连续追问 |
| 探索循环 | 每轮一个问题、推荐答案、当前假设变化 | 逐步解决目标、用户、交互、约束、成功标准中的关键分歧 | 预设一两轮对话就能聊清楚 |
| 原型发散 | 2 到 3 个美观 HTML 方向 | 选择、合并、否决，或要求下一轮变体 | 输出低保真丑页面让用户脑补 |
| 全局设计语言 | `DESIGN.md` 的 HTML 可视化确认页 | 是否确认全局视觉语言 | 把需求细节写进根 `DESIGN.md` |
| 正式设计 | HTML 设计稿、需求级设计文档摘要、评审结论 | 是否批准进入实现 | 只给 Markdown，不给可看设计物 |
| 自动 gap | 实现页面、阻塞检查结果、提醒项、visual evidence 和自动修复记录 | 是否接受自动修复结果，或把提醒项转入人工 live | 把明显确定性问题交给用户手改 |
| 人工 live | 页面局部区域、可选 patch 或参数化修改 | 接受、拒绝或继续局部修改 | 每个小改动都等大模型重生成 |

探索循环的收敛条件不是“问完固定轮数”，而是：

- 目标用户、核心场景、主路径、关键状态、约束和成功标准已经足够明确。
- 至少 2 个有意义的设计方向可以被清楚区分。
- 用户能说出选择某个方向的理由，或明确要求合并哪些方向。
- 剩余问题不会改变原型主结构，只会影响 Design 工作台的细节。

## 8. 冷启动设计语言流程

冷启动是指仓库没有可信的根 `DESIGN.md`，或者已有文件明显过时。

流程：

```text
扫描仓库
  -> 读取 README / docs / 组件 / CSS / tokens / assets / routes
  -> 生成 Product Context 假设
  -> 用户确认产品调性
  -> 生成 DESIGN.md 草稿
  -> 生成 HTML 可视化确认页
  -> 用户确认或修改
  -> 写入根 DESIGN.md
```

HTML 可视化确认页必须展示：

- 产品调性摘要。
- 色板和语义角色。
- 字体层级。
- 按钮、输入、卡片、导航等基础组件。
- H5 屏幕片段。
- Do / Don't。
- 与现有代码截图或样式的证据关联。

这个确认页不是 Markdown 预览，而是设计语言的可视化审稿台。

## 9. DESIGN.md 保鲜与防腐化

`DESIGN.md` 的更新频率应该非常低。它是全局设计语言，不是每个需求的设计记录。

客观判断：

- 对成熟项目，根 `DESIGN.md` 只应在品牌、产品调性、基础组件语义、token 体系或主要视觉规则变化时更新。
- 普通需求、一次性页面、某个 H5 flow 的特殊交互，应写入 `docs/design-<flow>.md`。
- 单次 live 修复、局部布局调整、文案调整，不应直接推动根 `DESIGN.md` 改动。

### 9.1 Impeccable 的处理方式

Impeccable 的默认策略可以理解为：**平时不更新 `DESIGN.md`，只读取它；只有 `init/document` 或用户显式要求刷新时才写它。**

具体机制：

- `PRODUCT.md` 和 `DESIGN.md` 分层：`PRODUCT.md` 管战略和语气，`DESIGN.md` 管视觉和组件。
- 所有命令启动时读取这两个文件，避免每次从 prompt 重新猜品牌。
- `DESIGN.md` 使用 Google DESIGN.md 固定格式：frontmatter 是机器可读 token，正文是固定六节。
- `document` 从真实代码、tokens、组件和渲染输出扫描生成，不鼓励凭空编造完整设计系统。
- 已有 `DESIGN.md` 时不会静默覆盖，必须确认刷新、覆盖或合并。
- `document` 会生成 `.impeccable/design.json` sidecar，承载 Stitch schema 放不下的组件 HTML/CSS、色调阶梯、motion、breakpoints 等扩展信息。
- `live` 默认进入 identity lock：优先保持当前 `DESIGN.md` 和页面现有身份，只有用户明确要求或 `PRODUCT.md` anti-reference 指向当前页面时才 departure。
- `critique`、detector、`polish` 用于发现设计偏移和质量问题，但它们本身不更新 `DESIGN.md`。

这套机制适合保护 `DESIGN.md` 不被日常操作污染，但它不解决“需求级设计产物如何沉淀”和“局部决策何时能提升为全局规则”。因此本系统要补一层权威更新规则和变更门禁。

### 9.2 DESIGN.md 权威更新规则

当前阶段不引入固定角色矩阵。一个产品经理、设计师或开发都可以独立跑完整流程，系统不应因为缺少某个角色而跳过专业步骤。

真正需要固化的是权威更新规则：

1. `DESIGN.md` 不能由 agent 在后台自动改。
2. agent 可以发现漂移、提出 delta proposal、生成 HTML 可视化确认页、运行校验和执行写入。
3. 写入必须由当前操作者显式确认；单人模式下当前操作者就是批准者。
4. 未确认的变化只能停留在 `docs/design-<flow>.md` 的局部决策中。
5. 平台化后可以把“当前操作者确认”扩展成团队级 steward / owner 权限模型，但这不是 MVP 的关键路径。

更新权威性的保证方式：

- 所有 `DESIGN.md` 变更都以 delta proposal 形式出现，而不是整文件静默重写。
- delta 必须说明 provenance：来自哪个需求、哪个评审、哪个 gap report、哪次代码扫描。
- 用户必须看到 HTML 可视化确认页，确认变更对色板、字体、组件和 H5 样例的影响。
- 写入后记录版本或 hash，需求级设计文档引用对应版本。
- 如果没有明确批准，变更只能停留在 `docs/design-<flow>.md` 的局部决策里。

### 9.3 DESIGN.md 更新门禁

允许更新根 `DESIGN.md` 的触发条件：

1. 产品定位、目标用户或品牌个性变化，且会影响多个后续需求。
2. 全局 token 变化：颜色、字体、圆角、间距、阴影、组件状态语义。
3. 基础组件体系变化：按钮、输入、导航、卡片、表格、弹层等跨页面组件发生规则变化。
4. 至少两个需求级设计产物重复出现同类偏离，且团队决定把它提升为全局规则。
5. `critique` / gap report 多次发现同一类系统性问题，例如低对比、H5 安全区、tap target、组件状态缺失。
6. 从已有代码扫描发现根 `DESIGN.md` 与真实实现长期漂移。

禁止更新根 `DESIGN.md` 的场景：

- 单个需求的探索方向。
- 单个页面为了业务目标做出的局部特例。
- 一次 live patch。
- 只影响某个 flow 的交互状态或验收规则。
- 还没有通过用户确认的视觉实验。

### 9.4 更新流程

```text
发现可能的全局变更
  -> 先写入 docs/design-<flow>.md 的局部决策
  -> 判断是否命中 DESIGN.md 更新门禁
  -> 生成 DESIGN.md delta proposal
  -> 渲染 HTML 可视化确认页
  -> 跑 DESIGN.md schema / lint / detector / 关键样例截图
  -> 用户确认
  -> 更新 DESIGN.md 和 sidecar
  -> 记录变更原因和影响范围
```

防腐化规则：

- `DESIGN.md` 只记录稳定规则，不记录临时实验。
- 更新必须带 provenance：来自哪个需求、哪个评审、哪个 gap report 或哪次代码扫描。
- 需求级文档可以引用 `DESIGN.md` 版本或 hash，便于后续判断设计稿是否基于旧规则。
- 当代码实现和 `DESIGN.md` 冲突时，不默认改 `DESIGN.md`；先判断是实现漂移还是设计语言确实升级。
- 对多品牌或多产品线，不扩写根 `DESIGN.md`，而是引入 design profile。

## 10. Impeccable 集成

### 10.1 直接复用

| Impeccable 能力 | 本系统用途 |
| --- | --- |
| `init` | 冷启动上下文访谈和 Product Context 生成参考 |
| `document` | 根 `DESIGN.md` 生成和 `.impeccable/design.json` sidecar |
| `shape` | Proposal / Prototype 中的 UX/UI 规划 |
| `craft` | Code 工作台中的端到端构建候选 |
| `critique` | Design 工作台中的设计评审 |
| `audit` | Code 工作台中的技术质量检查 |
| `live` | 人工 live 局部修复 |
| `polish` | 最终设计和实现收口 |
| detector | deterministic anti-pattern 和 overlay |

### 10.2 需要包装

Impeccable 原生命令以页面和元素为中心，本系统以需求和 H5 flow 为中心。因此需要加一层编排器：

```text
Design Workflow Orchestrator
  -> 调用 Impeccable command
  -> 读写 DESIGN.md / Product Context / docs/design-<flow>.md
  -> 生成 HTML 原型和正式设计稿
  -> 管理 gap report 和修复状态
```

编排器不能依赖大模型记忆来推进流程。它至少需要维护一条需求 flow 的内部状态和产物台账，作为后台控制面。

最小 FlowRun / Flow Ledger：

| 字段 | 用途 | 用户是否直接感知 |
| --- | --- | --- |
| `flowId` | 绑定同一需求下的原型、设计稿、评审、gap、patch | 否；用户只看到需求名称或工作台标题 |
| `currentStage` | 标记当前在 Proposal / Design / Code 哪个工作台 | 是；以“当前步骤”展示 |
| `currentGate` | 标记卡在哪个门禁，例如 design-review、gap-blocking-check、live-review | 是；以“为什么不能继续”的人话展示 |
| `artifactRefs` | 记录 prototype HTML、design md/html、gap report、PatchIntent、patch 等产物路径 | 部分；用户看到产物列表，不看内部字段名 |
| `designVersion` | 记录进入设计稿审查门时使用的 `DESIGN.md` 版本或 hash | 部分；高级详情可展示 |
| `reviewStatus` | 记录设计稿审查门是否通过，以及阻塞原因 | 是；以评审结论展示 |
| `gapHistory` | 记录每轮 gap 检查、自动修复前后和剩余提醒项 | 部分；用户看摘要和历史 |
| `patchIntentHistory` | 记录每次 live / 自动修复为什么改、改了哪里、是否需复验 | 部分；用户看 patch 说明 |
| `resumePointer` | 中断后恢复到下一步需要执行的动作 | 否；用户只看到“继续当前 flow” |

用户不需要学习这些字段。用户只需要看到：

```text
当前在哪一步
现在需要我决定什么
已经有哪些产物
为什么不能继续
```

约束执行原则：

- 大模型生成 proposal、design、review、patch 等候选内容。
- orchestrator 负责校验状态、检查产物是否存在、推进 gate、记录历史和决定能否进入下一步。
- 每个阶段推进必须通过明确 action，例如 `approvePrototype`、`approveDesign`、`attachGapReport`、`recordPatchIntent`。
- action 执行前跑 invariant check；缺产物、缺状态清单、`DESIGN.md` 版本不一致或审查门未通过时，必须阻塞。
- 关键事件 append-only 记录，出错时可以回到上一个稳定点。

### 10.3 不直接复用的部分

以下能力需要自建或重构：

- 需求级设计产物管理。
- HTML 多方案选择工作台。
- 设计稿和实现页面的 gap 验证。
- H5-first live 参数化局部修复。
- Product Context 和 README / AGENTS / CLAUDE 的保鲜策略。

## 11. Gap 验证设计

gap 验证分为自动 loop 和人工 live 两段。

### 11.1 Auto Gap Loop

目标：在用户介入前，agent 先自己看效果、找问题、修复明显差异。

输入：

- HTML 设计稿。
- 实现页面 URL。
- 根 `DESIGN.md`。
- `docs/design-<flow>.md` 验收规则。

前置条件：

- `docs/design-<flow>.md` 记录实现页面的目标 route 或 URL，例如 `/sdd/skills`。不需要额外维护复杂映射表。
- `docs/design-<flow>.md` 记录每个关键状态的驱动方式，例如 mock 响应、query 参数、fixture、feature flag、seed data；无法驱动的状态只能标记为 `not-testable`。
- HTML 设计稿标记可比主体区域和不可比审阅 chrome，例如 `data-design-surface` 和 `data-design-chrome`，避免把手机壳、状态栏、注释和候选说明拿去和真实实现比。
- gap 检查复用已经登录的浏览器会话；系统不把登录、SSO、2FA 或扫码当成 gap loop 的责任。
- HTML 设计稿中的手机壳、状态栏、注释标尺等审阅 chrome 不参与实现页面差异判断。

检查维度：

| 维度 | 方法 | MVP 判定 | 说明 |
| --- | --- | --- | --- |
| token / rule diff | computed style vs `DESIGN.md` tokens | 阻塞 | 颜色、字体、圆角、间距、阴影、组件状态是否偏移 |
| state coverage | `docs/design-<flow>.md` states + Playwright checks | 阻塞 | 空、加载、错误、成功、边界数据等状态是否覆盖；如果设计文档没有机器可读状态清单，先回到 Design 补齐 |
| DOM / semantic diff | DOM tree / role / text / key selector | 阻塞 | 结构、文本、关键元素、语义角色是否缺失 |
| detector | Impeccable deterministic rules | 阻塞 | AI slop 和质量反模式 |
| interaction diff | Playwright flow and state checks | 提醒 | 点击、输入、展开、滚动、键盘、安全区、状态切换；阶段 1 先记录和提示，阶段 2 降噪后再把稳定规则升级为阻塞 |
| accessibility diff | ARIA tree / contrast / tap target | 提醒 | 可访问性、对比度、H5 点击区域；阶段 1 先记录和提示，阶段 2 降噪后再把稳定规则升级为阻塞 |
| visual evidence | Playwright screenshot + optional masked diff | 证据 | 给人看布局、遮挡和视觉层级；不作为默认阻塞标准 |

设计稿审查门中的 a11y 可以阻塞，因为它检查的是设计产物本身的静态质量，例如对比度、字号、tap target、安全区和状态覆盖。实现页面的 a11y 在 MVP 中先做提醒，因为运行时 DOM、第三方组件、浏览器差异和动态状态会引入噪声；阶段 2 再把稳定规则升级为阻塞。

自动修复范围：

- 低风险样式偏差：自动 patch。
- 文案错漏：自动 patch，但记录。
- 布局遮挡、overflow、H5 安全区问题：自动 patch。
- 信息架构、视觉方向、主观审美：不自动 patch，进入人工 live。

自动修复安全契约：

1. 只自动修复 deterministic rules 能明确验证的问题。
2. 每个 patch 只处理一类问题，必须能单独回滚。
3. 每轮 patch 后重跑 deterministic rules，未通过问题数量必须下降。
4. 如果问题数量不降、出现新高风险问题，或 patch 需要猜测产品意图，则停止自动修复并交给人工 live。
5. 自动修复最多三轮，到顶仍未通过则停止。
6. 信息架构、产品命题、视觉方向和主观取舍不能自动改，只能生成建议和证据。

### 11.2 Human Live Review

目标：只处理自动 loop 无法可靠判断的问题。

入口：

- gap report 中的高影响问题。
- 用户在页面上选择区域。
- 设计评审中被标记的主观问题。

要求：

- H5-first：默认手机 viewport，关注安全区、键盘、底部固定操作区、滚动容器、tap target。
- MVP 继续复用 Impeccable live；live 当前可用，不因为速度问题阻塞阶段 0 和 MVP。
- 高频修改优先本地 patch 和参数 knobs，例如间距、字号、颜色、圆角、固定区高度、safe-area padding，不把所有操作都交给大模型。
- 模型自由修改路径继续保留，用于复杂局部重构和无法参数化的设计判断。
- 每次 live 修改都记录 PatchIntent：改动目的、关联设计规则、是否需要重新验证。
- 接受修改后重新跑局部 gap。

已知未解决问题：

- Impeccable live 原生体验更偏桌面端，H5 审阅需要更适合手机 viewport 的选择、预览和操作面板。
- live 慢链路不只来自注入方式，还可能来自模型往返、区域定位、源码映射、patch 生成、写文件、HMR 和浏览器复检。
- MVP 先记录每次 live 的耗时、patch 成功率、返工次数和用户放弃点；等有真实数据后再决定优化注入链路、模型链路还是本地 deterministic patch。

## 12. 产物关系

```text
Product Context
  -> 指导 DESIGN.md

DESIGN.md
  -> 指导所有需求级设计产物
  -> 指导 Impeccable live / critique / polish

docs/design-<flow>.md
  -> 引用 DESIGN.md
  -> 引用 HTML 设计稿
  -> 提供 Code 工作台验收规则

HTML prototype
  -> Proposal / Prototype 阶段探索

HTML design artifact
  -> Design 阶段权威可视化设计稿
  -> Code 阶段 gap 验证 baseline

implementation page
  -> Code 阶段实现目标
  -> 与 HTML design artifact 做 gap 验证
```

## 13. 边界 case

### 13.1 只有一句话需求

从 Proposal / Prototype 进入。系统先做项目扫描和少量高杠杆问题，再展示 2 到 3 个 HTML 原型方向。

### 13.2 有代码但没有 DESIGN.md

先进入冷启动设计语言流程。生成根 `DESIGN.md` 并用 HTML 确认页让用户确认，再回到当前需求。

### 13.3 有 DESIGN.md 但需求风格想突破

Proposal / Prototype 可以提出“沿用设计语言”和“有意突破”的方案，但突破必须写入需求级设计文档，并标记是否需要更新全局 `DESIGN.md`。

### 13.4 只有截图或图片

截图作为 evidence，不作为权威。系统从截图抽取视觉和结构假设，生成 HTML 原型，并在 Design 工作台转化为正式设计产物。

### 13.5 只想修一个现有页面

直接进入 Code 工作台。先用当前 `DESIGN.md` 和页面生成 gap report，再决定是否需要回到 Design 工作台补正式设计产物。

### 13.6 多品牌或多产品线

不能强行共用一个根 `DESIGN.md`。需要引入 design profile，例如：

```text
DESIGN.md
docs/design-profiles/admin.md
docs/design-profiles/consumer-h5.md
```

MVP 先不做多 profile，只预留扩展点。

## 14. MVP 实施路径

### 阶段 0：手动编排验证

目标：不用平台化 UI，先用本仓库已有产物验证链路和风险。

- 回顾本仓库已有的 `DESIGN.md`、`PRODUCT.md`、`.impeccable/` 和多组 `docs/design-<flow>.md` / HTML 产物。
- 抽样判断现有 HTML 设计稿是否能通过“设计稿审查门可信契约”。
- 抽样判断现有需求级设计文档是否明确记录目标 route、关键状态和验收规则。
- 用 token / state / DOM / detector 做最小阻塞检查；interaction / a11y 先只记录提醒和噪声；截图只作为人工佐证。
- 用 Impeccable critique / live / polish 手工完成一轮修复。
- 记录审查门误判、gap 检查噪声、自动修复候选、live 耗时和返工点。
- 如果 retrospective 通过，再补跑一个新的一句话 H5 flow，验证冷启动到 code 的完整链路。

### 阶段 1：MVP

目标：三个工作台有最小 UI 或 CLI 入口。

- Proposal / Prototype：一句话需求到 2 到 3 个 HTML 方案。
- Design：生成需求级设计文档和正式 HTML 设计稿。
- Code：自动 gap loop + 人工 live 入口；token / state / DOM / detector 作为阻塞检查，interaction / a11y 作为提醒项。
- 所有产物写入 `docs/` 或受控 artifact 目录。

### 阶段 2：增强版

目标：提高可靠性和速度。

- 把 token / state / DOM / detector 检查做稳、降噪并扩大覆盖；将稳定的 interaction / a11y 规则从提醒项逐步升级为阻塞检查。
- H5-first live 加入 knobs 和本地 deterministic patch。
- Product Context 从 `PRODUCT.md` 兼容层演进为系统上下文。
- 支持 HTML / 图片输入的更稳定解析。

### 阶段 3：平台化

目标：团队级设计流程平台。

- 设计产物 registry。
- 多 design profile。
- 审批和版本历史。
- 评审 overlay。
- 与 SDD telemetry 或其它 observability 系统对接。
- CI 中的 design gap gate；CI 不复用人工已登录会话，需另行提供程序化登录、测试账号或预置 session。

## 15. 风险与反模式

### 15.1 把 DESIGN.md 写成需求仓库

根 `DESIGN.md` 一旦承载所有需求，就会失去可读性和工具兼容性。需求级内容必须写入 `docs/design-<flow>.md`。

### 15.2 只做 prompt-to-UI

一次性生成页面无法减少返工。必须保留发散、收敛、评审、gap 验证和 live 修复。

### 15.3 live 全靠模型

高频修改如果每次都等模型，会退化成慢速聊天。H5-first live 必须优先支持本地 patch 和参数 knobs。

### 15.4 把截图当权威

截图没有语义、状态、约束和交互。截图只能作为 evidence，不能作为正式设计产物。

### 15.5 跳过设计评审

即使只有一个开发者独立完成全流程，也不能跳过 Design 工作台。角色可以模糊，专业步骤不能消失。

### 15.6 重造 Impeccable

Impeccable 已经覆盖大量设计质量、detector、live 和 polish 能力。自建系统应编排和扩展它，而不是复制命令体系。

### 15.7 HTML 产物不够美观

如果 HTML 只是把 Markdown 包一层，它会削弱用户对整套系统的信任。HTML 产物必须以模板和设计规则为底座，并通过截图检查确认视觉质量。

## 16. 自审结论

### 16.1 已消除的模糊点

- 根 `DESIGN.md` 与需求级 `docs/design-<flow>.md` 已明确分层：前者是全局设计语言，后者是单个需求的正式设计产物。
- HTML 的角色已明确：它是主要审阅载体，不是权威文本本身；正式 HTML 必须基于模板库和浏览器检查，不能输出丑陋裸页面。
- 三工作台不是削减流程，而是把评审、测试、修复收进更自然的用户界面中。
- `DESIGN.md` 更新频率已定义为低频，并通过门禁限制，避免每个需求都污染全局规则。
- `DESIGN.md` 更新责任已明确：agent 只能提出 delta 和执行经批准的写入，权威确认必须来自当前操作者；团队级 steward / owner 可在平台化后再引入。
- Impeccable 的复用边界已明确：复用质量、detector、live、polish 和 document 能力，自建需求级编排和 gap 验证。

### 16.2 仍需警惕的逻辑风险

- 如果 Product Context 长期同时存在于 `PRODUCT.md`、README、AGENTS、CLAUDE，会产生保鲜冲突；需要尽早决定兼容层策略。
- 如果 HTML 原型和正式 HTML 设计稿存放目录不固定，后续 gap baseline 会难以追踪。
- 如果模板 registry 没有成为可配置依赖，而是落成硬编码路径，方案会失去跨项目复用性。
- 如果 gap report 只做 screenshot diff，会误把合理响应式差异当成错误，也会漏掉语义和交互问题；MVP 的阻塞检查从 token、state、DOM 和 detector 开始，interaction / a11y 先做提醒，截图只做证据。
- 如果 live 修改不能回写 PatchIntent，系统会失去“为什么这样改”的设计记忆。

### 16.3 尚未验证的关键假设

- 设计稿审查门能否稳定区分“确定性不合规”和“产品命题不成立”，需要阶段 0 用已有产物校准。
- 自动改代码是否能做到问题数下降、patch 可回滚、不引入新风险，需要 MVP 数据验证。
- H5-first live 目前可用，但速度和移动端操作效率还没有真实指标支撑，需要先记录数据再优化。
- gap baseline 能否稳定对齐 HTML 设计稿和实现页面，需要通过 route、状态、选择器和 evidence 规范验证。
- 根 `DESIGN.md` 低频更新与需求级文档高频更新原则上不冲突，但需要通过 delta proposal 和显式确认机制防止腐化。

## 17. 待确认问题

以下问题不阻塞架构方案，但会影响 MVP 实现顺序：

1. `PRODUCT.md` 短期是否作为根目录兼容文件保留，还是从第一版就改成 adapter 生成。
2. HTML 原型和正式设计稿的存放目录，是 `docs/` 直放，还是新建 `.design/` artifact 目录。
3. HTML 模板选择是由系统自动推荐，还是在 Proposal / Prototype 工作台里让用户显式选择模板风格。
4. MVP 的第一个验证场景，是内部 dashboard H5 flow，还是独立新仓库的一句话需求冷启动。

## 18. 外部参考

- Impeccable GitHub：https://github.com/pbakaus/impeccable
- Impeccable Getting Started：https://impeccable.style/tutorials/getting-started/
- Impeccable Live Mode：https://impeccable.style/tutorials/iterate-live/
- Impeccable Critique Overlay：https://impeccable.style/tutorials/critique-with-overlay/
- Google DESIGN.md：https://github.com/google-labs-code/design.md
- HTML Anything 模板体系：作为可配置模板 registry 的参考实现
