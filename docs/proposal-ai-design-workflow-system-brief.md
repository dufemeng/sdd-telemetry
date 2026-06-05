# AI Design Workflow System 汇报简版

更新时间：2026-06-04  
目标读者：项目汇报、决策沟通

## 一句话定位

我们做的不是传统设计系统，而是一套 **AI Design Workflow System**。

它解决的是：需求、原型、正式设计稿、设计评审、代码实现、gap 校验和 live 修复之间如何不漂移，减少“设计说一套、代码做一套”的返工。

## 核心方案

### 1. 三个工作台

```text
Proposal / Prototype
  一句话需求进入
  -> 苏格拉底式提问
  -> 发散 2-3 个 HTML 原型方向
  -> 用户选择、合并或否决

Design
  -> 生成正式设计产物
  -> docs/design-<flow>.md
  -> HTML 设计稿
  -> 设计稿审查门

Code
  -> 按设计产物生码
  -> 自动 gap 检查
  -> 自动修复确定性问题
  -> Impeccable live 人工局部修复
```

### 2. 产物分层

| 产物 | 作用 |
| --- | --- |
| `DESIGN.md` | 全局设计语言，低频更新 |
| `docs/design-<flow>.md` | 单个需求的权威设计产物 |
| HTML 原型 / HTML 设计稿 | 用户可视化审阅和决策 |
| `docs/design-<flow>.workflow.json` | 每条需求 flow 的状态和产物台账 |
| gap report | 设计稿和实现页面的差异证据 |
| PatchIntent / patch | 每次自动修复或 live 修改的意图和记录 |

### 3. 交互形态

MVP 不做完整平台，先做：

```text
skill / agent workflow + local HTML workbench
```

- 用户在 Codex / Claude / CLI 发起需求。
- agent 负责扫描仓库、提问、生成产物、调用 Impeccable、跑 gap、改代码。
- HTML workbench 负责让用户看原型、看设计、看 gap、做决策。
- MVP 中 HTML workbench 可以是静态展示页；用户决策通过对话口述，agent / orchestrator 落 action。

### 4. 复用 Impeccable

不重造 Impeccable。

直接复用：

- `document`：生成 / 刷新 `DESIGN.md`
- `critique`：设计评审
- `detector`：确定性设计反模式检测
- `live`：人工局部修复
- `polish`：最终收口

我们补的是上层编排：需求 flow、设计产物生命周期、gap 校验、状态台账和 H5-first 的使用体验。

## 简单用户生命周期

```text
用户输入一句话需求
  |
  v
系统扫描项目上下文
  |
  v
用户看到 2-3 个 HTML 原型方向
  |
  +-- 选择 / 合并 / 否决
  |
  v
用户看到正式 HTML 设计稿和设计文档摘要
  |
  +-- 批准 / 要求修改
  |
  v
系统生成或修改代码
  |
  v
用户看到 gap report：阻塞项、提醒项、截图证据、自动修复记录
  |
  +-- 接受自动修复 / 进入 live 局部修复
  |
  v
最终通过：设计产物和实现页面完成对齐
```

用户只需要理解四件事：

```text
当前在哪一步
现在需要我决定什么
已经有哪些产物
为什么不能继续
```

内部的 `flowId`、`currentStage`、`artifactRefs`、`resumePointer` 等由 Flow Ledger 记录，不增加用户理解成本。

## 质量门禁

### 设计稿审查门

分两层：

1. **deterministic rules**  
   检查 token、H5 viewport、安全区、tap target、关键状态、a11y、detector 反模式。

2. **judgment review**  
   AI 判断产品命题、信息架构、主路径和关键文案是否成立。每条致命意见必须有屏幕、元素、文本或交互证据。

### Code gap 检查

分三档：

| 档位 | 内容 |
| --- | --- |
| 阻塞 | token / state / DOM / detector |
| 提醒 | interaction / a11y |
| 证据 | screenshot / masked diff |

截图只作为证据，不作为默认阻塞标准。

## 如何控制大模型不乱跑

不依赖模型记忆流程。

模型只生成候选内容：

- proposal
- design
- review
- patch

orchestrator 负责：

- 校验状态
- 检查产物是否存在
- 推进 gate
- 记录历史
- 判断能否进入下一步

每条需求都有 Flow Ledger，记录当前阶段、门禁、产物、gap 历史、patch 历史和续跑点。缺产物、缺状态清单、审查门未过或 gap report 不合法时，系统必须阻塞。

## 一周 MVP 目标

先不做大平台，一周跑通薄闭环：

```text
已有项目 retrospective
  -> 一句话需求
  -> HTML 原型多方案
  -> 正式设计稿
  -> 设计审查门
  -> 代码实现
  -> gap report
  -> 自动修复确定性问题
  -> Impeccable live 人工修复
  -> 完成记录
```

一周内证明的不是完整平台能力，而是：

- 用户能通过 HTML 原型做设计方向决策。
- 需求级设计产物能作为 code 和 gap 的权威输入。
- gap report 能发现真实偏差。
- 自动修复能处理确定性问题。
- live 能处理剩余局部问题。
- Flow Ledger 能支撑中断、续跑和复盘。

## 项目价值

- PM、设计师、开发任一角色都能独立跑完整流程。
- 设计不再是一次性 prompt 输出，而是可审查、可追踪、可验证的 contract。
- 代码实现后能自动发现与设计产物的偏差。
- live 修改有意图、有记录、有复验，不靠聊天记忆。
- 先用轻量本地方案验证价值，再决定是否平台化。
