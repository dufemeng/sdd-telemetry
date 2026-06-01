---
name: SDD 质量观测台
description: SDD 工作流全链路可观测平台——终端信号风格的工程师内部数据仪表盘
colors:
  electric-volt: "#faff69"
  base: "#0a0a0a"
  surface: "#101010"
  panel: "#14140b"
  hover-bg: "#171717"
  active-bg: "#222222"
  text-primary: "#e5e3d3"
  text-secondary: "#c9c8af"
  text-muted: "#93927c"
  text-bright: "#f5f5f5"
  border: "rgba(255, 255, 255, 0.08)"
  good-text: "#22c55e"
  good-bg: "rgba(34, 197, 94, 0.10)"
  warn-text: "#f59e0b"
  warn-bg: "rgba(245, 158, 11, 0.10)"
  bad-text: "#ffb4ab"
  bad-bg: "rgba(239, 68, 68, 0.16)"
  icon-well: "#202016"
  nav-active-bg: "#2b2b20"
  bar-fill: "#c9ce3c"
typography:
  display:
    fontFamily: "'JetBrains Mono', ui-monospace, monospace"
    fontSize: "24px"
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: "-0.01em"
  title:
    fontFamily: "Inter, 'PingFang SC', system-ui, sans-serif"
    fontSize: "18px"
    fontWeight: 700
    lineHeight: 1.33
    letterSpacing: "normal"
  headline:
    fontFamily: "Inter, 'PingFang SC', system-ui, sans-serif"
    fontSize: "14px"
    fontWeight: 600
    lineHeight: 1.43
    letterSpacing: "normal"
  body:
    fontFamily: "Inter, 'PingFang SC', system-ui, sans-serif"
    fontSize: "13px"
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: "normal"
  label:
    fontFamily: "Inter, 'PingFang SC', system-ui, sans-serif"
    fontSize: "12px"
    fontWeight: 400
    lineHeight: 1.33
    letterSpacing: "normal"
  caption:
    fontFamily: "Inter, 'PingFang SC', system-ui, sans-serif"
    fontSize: "10px"
    fontWeight: 700
    lineHeight: 1.4
    letterSpacing: "0.05em"
rounded:
  sm: "4px"
  md: "6px"
  pill: "9999px"
spacing:
  xs: "10px"
  sm: "14px"
  md: "18px"
components:
  stat-card:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.md}"
    padding: "14px"
  panel:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.md}"
    padding: "14px"
  status-badge-good:
    backgroundColor: "{colors.good-bg}"
    textColor: "{colors.good-text}"
    rounded: "{rounded.pill}"
    padding: "2px 8px"
  status-badge-warn:
    backgroundColor: "{colors.warn-bg}"
    textColor: "{colors.warn-text}"
    rounded: "{rounded.pill}"
    padding: "2px 8px"
  status-badge-bad:
    backgroundColor: "{colors.bad-bg}"
    textColor: "{colors.bad-text}"
    rounded: "{rounded.pill}"
    padding: "2px 8px"
  ghost-button:
    backgroundColor: "{colors.hover-bg}"
    textColor: "{colors.text-secondary}"
    rounded: "{rounded.sm}"
    size: "32px"
  ghost-button-hover:
    backgroundColor: "{colors.active-bg}"
    textColor: "{colors.electric-volt}"
  segment-button:
    backgroundColor: "transparent"
    textColor: "{colors.text-secondary}"
    rounded: "3px"
    padding: "0 10px"
    height: "24px"
  segment-button-active:
    backgroundColor: "{colors.active-bg}"
    textColor: "{colors.text-bright}"
---

# Design System: SDD 质量观测台

## 1. Overview

**Creative North Star: "终端信号 / The Terminal Signal"**

本设计系统是一条穿透噪声的信号——一道电子黄色频率扫过纯黑底面，每一个数据点都是一次播报。它不是界面，是仪器。工程师坐在这块屏幕前，读取数字，做决策，离开。没有欢迎词，没有引导动画，没有装饰性插图。

视觉语言起点是终端美学：近黑的底面三层堆叠（base → surface → panel），全部带有极微弱的暖黄色调——电子黄主色的余温渗进了整个中性色调栈。这不是"深色主题"，是一套完整的发光体系：背景吸光，数字发光。当 #faff69 出现时，它不是装饰，是信号。

本系统明确拒绝：SaaS 营销系的渐变堆砌与五彩斑斓；厚重企业感（SAP / Oracle）的蓝灰主色与四平八稳；任何"白纸极简"风格与浅色底面的诱惑。这是一个工程师为工程师构建的工具，视觉语言应该让使用者觉得"这是我们自己做的"，而非"这来自某个 SaaS 模板库"。

**Key Characteristics:**
- 近黑三层底面，带统一的暖黄余温
- 单一主色频率：#faff69 用于信号，不用于装饰
- 信息密度优先，余白服务于扫读而非审美
- 数值永远用等宽字体（JetBrains Mono），文字永远用 Inter
- 交互有重量感：hover/active 状态明确，不让用户猜

## 2. Colors: The Terminal Palette

近黑底面 + 单一高频主色 + 语义三色：整个系统只有一个"噪声"，其余全是信号。

### Primary

- **电子黄 / Electric Volt** (`#faff69`): 系统的唯一主色。用于当前导航激活状态、icon 前景色、交互元素 hover 后的文字变色、数据条指示，以及一切需要"这里需要注意"的视觉提示。在 `#0a0a0a` 底面上对比度约 16:1，远超 WCAG AA。禁止用于装饰目的。

- **条形填充 / Bar Fill** (`#c9ce3c`): Electric Volt 的亚光版本，用于 BarList 进度条填充。比主色略暗、略低饱和，在密集图表环境中减少视觉张力。

### Neutral

- **虚空 / Void** (`#0a0a0a`): 页面底面。接近纯黑，带极微弱的暖色调（非纯 #000000）。它是吸光体，让所有其他层次发光。

- **浮层 / Surface** (`#101010`): 卡片、Panel 的背景色。比底面亮约一档，与 border 配合构成视觉边界。

- **暖板 / Panel** (`#14140b`): 侧边栏、顶栏的背景色。带明显的暖黄偏色（0b vs 14 的 B 通道差异），把导航区与内容区从色调上区分开来。

- **悬停态 / Hover** (`#171717`): 交互元素的 hover 背景，以及 DataTable 的表头背景。

- **激活态 / Active** (`#222222`): 按钮 active 状态背景，Segment 已选项背景。

- **图标井 / Icon Well** (`#202016`): StatCard icon 容器背景，BarList 进度轨道背景。带暖黄偏色，比 hover 深但比 surface 略暖。

- **导航激活底 / Nav Active** (`#2b2b20`): 侧边栏当前激活项的背景，animated layout 动画锚点。

- **主文字 / Text Primary** (`#e5e3d3`): 主要阅读文字。略带暖色，避免纯白在暗底上产生的刺眼感。

- **次文字 / Text Secondary** (`#c9c8af`): 次要信息、标签文字、导航默认态。

- **静音文字 / Text Muted** (`#93927c`): 辅助信息、时间戳、描述性文字、表格列标题。

- **高亮数字 / Text Bright** (`#f5f5f5`): 统计数值、高对比度强调数字。接近纯白，与 mono 字体配合。

- **边界线 / Border** (`rgba(255, 255, 255, 0.08)`): 全局唯一的分隔线。不用实心颜色，用透明度叠加，在任何深色表面上都能保持一致的视觉重量。

### Semantic

- **成功 / Good**: 文字 `#22c55e`，背景 `rgba(34, 197, 94, 0.10)`。用于 ingest 成功、数据质量正常等积极状态。
- **警告 / Warn**: 文字 `#f59e0b`，背景 `rgba(245, 158, 11, 0.10)`。用于降级、延迟、阈值临界等状态。
- **异常 / Bad**: 文字 `#ffb4ab`（偏粉的错误红，在深色底上比纯红更易读），背景 `rgba(239, 68, 68, 0.16)`。用于 ingest 失败、数据缺失等错误状态。

### Named Rules

**The Single Frequency Rule.** Electric Volt (`#faff69`) 在任意屏幕上的覆盖面积不超过 5%。它的稀缺性是它作为信号的原因。出现在三个以上视觉区域时必须审查：可能有一处是装饰，不是信号。

**The Warm Stack Rule.** 所有中性色（底面 → 浮层 → 暖板 → 导航激活底）都带有对齐 Electric Volt 色调的微量暖偏色。新增中性色层次时，必须沿这条暖轴插值，不得添加冷灰或蓝灰色。

## 3. Typography

**UI Font:** Inter（配 PingFang SC 回退，覆盖中文字符）
**Data / Code Font:** JetBrains Mono（配 ui-monospace 回退）

**Character:** Inter 的工整无衬线处理大量中文混排，JetBrains Mono 的等宽字形让数值在密集表格中对齐如仪器刻度。两者对比清晰——文字是语境，数字是读数。

### Hierarchy

- **Display** (JetBrains Mono, 600, 24px, lh 1.2): 统计数值（StatCard 的核心数字）。永远等宽，永远是最重要的数字。不用于标题文字。
- **Title** (Inter, 700, 18px, lh 1.33): 侧边栏品牌名称。全局只出现一次。
- **Headline** (Inter, 600, 14px, lh 1.43): Panel 标题、页面区块标题。密度高的仪表盘中最重的文字层级。
- **Body** (Inter, 400, 13px, lh 1.5): 主要阅读内容、表格单元格、导航项目标签、描述文字。
- **Label** (Inter, 400, 12px, lh 1.33): StatCard 的指标名称、次要信息行、Badge 文字。
- **Caption** (Inter, 700, 10px, lh 1.4, tracking 0.05em, uppercase): 表格列标题、导航分组标签。全大写，追踪加宽，明确区别于普通文字。

### Named Rules

**The Mono-for-Numbers Rule.** 任何数值（统计数字、行数、百分比、时间戳中的数字部分）都使用 JetBrains Mono 渲染。不因为"看起来一致"而把数字改为 Inter。等宽是数字可读性的前提。

**The Fixed Scale Rule.** 字号固定（px），不使用 clamp() 或 vw 单位。仪表盘视图的用户在固定 DPI 下操作，流式字号在侧边栏或窄面板中会产生视觉噪声。

## 4. Elevation

本系统严格使用**色调分层**替代阴影——没有任何 `box-shadow`。深度通过底面色阶和 border 传达，而非投影。

三层结构（由深到浅）：

1. **底面层 Void** (`#0a0a0a`): 页面画布，永远在最底层。
2. **内容层 Surface** (`#101010`): 卡片、Panel、数据容器。比底面亮一级。
3. **导航层 Panel** (`#14140b`): 侧边栏、顶栏。带暖色偏移，从色调上与内容区域分离。

`rgba(255,255,255,0.08)` 边界线是唯一的视觉分隔工具，在三层任意组合中保持一致重量。

### Named Rules

**The No-Shadow Rule.** 禁止使用任何 `box-shadow`。不因为"有层次感"而添加投影；本系统的层次感来自底面色阶，投影会破坏终端美学的纯净感。

**The Flat-By-Default Rule.** 表面在静止状态完全平坦。唯一的状态变化来自背景色切换（hover: `#171717`；active: `#222222`），不通过投影或模糊表示激活。

## 5. Components

组件哲学：**沉稳有力**。静止时几乎消隐在底面中，激活后用 Electric Volt 切割出存在感。没有悬浮感，没有圆润感，没有任何向用户"示好"的设计语言。

### StatCard

仪表盘的基本读数单元。98px 最小高度，横向布局：左侧 34×34 图标井（`#202016` 背景，4px 圆角，Electric Volt 前景），右侧标签 + 数值 + 辅助信息纵向排列。

- **容器**: Surface 背景，6px 圆角，`rgba(255,255,255,0.08)` 边框，14px 内边距
- **图标**: 34×34，4px 圆角，`#202016` 背景，Electric Volt 前景
- **指标名**: Label 规格（12px, Inter 400），Text Secondary 色
- **数值**: Display 规格（24px, JetBrains Mono 600），Text Bright 色
- **辅助信息**: 11px, not-italic `<em>`，Text Muted 色

### Panel

通用数据容器。固定的标题行（图标 + 标题 + 可选右侧插槽），下方为自由内容区。

- **容器**: Surface 背景，6px 圆角，边框，14px 内边距
- **标题行**: flex，gap 8px，下方 12px margin
- **标题图标**: Electric Volt 色
- **标题文字**: Headline 规格（14px semibold），Text Bright 色

### StatusBadge

内联状态标签，pill 形（rounded-full），三种语义变体 + neutral。

- **Shape**: 11px, font-weight 500，5px 上下 padding，8px 左右 padding，`rounded-full`
- **Good**: `#22c55e` 文字，`rgba(34,197,94,0.10)` 背景
- **Warn**: `#f59e0b` 文字，`rgba(245,158,11,0.10)` 背景
- **Bad**: `#ffb4ab` 文字，`rgba(239,68,68,0.16)` 背景
- **Neutral**: Text Secondary 文字，`rgba(255,255,255,0.08)` 背景

### DataTable

高密度数据表。sticky 列标题，行 hover 态，可选行点击/选中。

- **容器**: 4px 圆角，边框
- **列标题**: Caption 规格（10px bold uppercase），Text Muted 色，`#171717` sticky 背景，底部边框
- **数据行**: Body 规格，12px 上下 + 10px 左右 cell padding，hover: `rgba(255,255,255,0.03)` 背景
- **选中行**: `rgba(250,255,105,0.06)` 背景（Electric Volt 极低透明度）
- **分隔线**: 行之间无显式分隔线；依赖行 hover 态区分

### BarList

横向比较图，三列 grid 布局（标签 / 进度条 / 数值）。

- **标签列**: 12px Text Primary 主标签 + 11px Text Muted 副标签
- **进度轨道**: 8px 高，`rounded-full`，`#202016` 背景（Icon Well 色）
- **进度填充**: `#c9ce3c`（Bar Fill），`rounded-full`，最小宽度 4%
- **数值列**: 13px JetBrains Mono 600，Text Bright，右对齐

### Ghost Button

工具性操作按钮（刷新、图标动作等）。32×32 正方形，grid 居中图标。

- **默认态**: `#171717` 背景，边框，4px 圆角，Text Secondary 图标
- **Hover**: `#222` 背景，Electric Volt 图标，120ms 颜色过渡
- **Disabled**: 40% opacity，not-allowed cursor

### Sidebar Nav Item

导航激活状态是系统中动画最丰富的元素，也是 Electric Volt 使用最密集的地方。

- **默认态**: 13px Text Secondary，34px 最小高度，6px 圆角，`mx-2` 侧边距
- **Hover**: Text Bright 文字，`#202016` 背景（120ms）
- **激活态**: Electric Volt 文字；`#2b2b20` 背景（`motion.span layoutId` 动画）；左侧 4px 宽 Electric Volt 竖条 pill（`motion.span layoutId`）；右侧 6px Electric Volt 脉冲圆点（`animate-pulse`）；图标 scale 110%
- **过渡**: `type: spring, stiffness: 300, damping: 30`（layoutId 动画）

### Time Range Segment

顶栏时间范围切换器，segment 组合而非独立按钮。

- **容器**: `#171717` 背景，边框，4px 圆角，2px padding，4px gap
- **按钮单元**: 24px 高，3px 内圆角，12px 字号，0 边框
- **未选中**: 透明背景，Text Secondary 文字
- **选中**: `#222` 背景，Text Bright 文字
- **过渡**: 120ms 颜色变化

## 6. Do's and Don'ts

### Do:

- **Do** 用 Electric Volt (`#faff69`) 表示信号：激活状态、交互 hover、需要注意的读数。
- **Do** 数值永远用 JetBrains Mono（统计数字、百分比、行号、时间戳数字）。
- **Do** 新增中性色时沿暖黄色轴插值（参考 base `#0a0a0a` → panel `#14140b` 的暖偏方向）。
- **Do** 状态变化通过背景色切换表达（hover → `#171717`；active → `#222`）；不用阴影或模糊。
- **Do** 错误状态比成功状态更醒目——bad-text (`#ffb4ab`) 在深色底上比 good-text 更刺眼，这是对的。
- **Do** 页面切换使用 opacity + translate + blur 组合过渡（300ms，ease-out-expo），并响应 `prefers-reduced-motion`。
- **Do** 用 `rgba(255,255,255,0.08)` 作为唯一边框颜色，不用实心颜色。

### Don't:

- **Don't** 使用 SaaS 营销系设计语言（渐变堆砌、五彩斑斓插图、大面积圆角卡片网格）。本系统的反参照是 HubSpot、Intercom 风格。
- **Don't** 使用厚重企业感设计元素（SAP / Oracle 风格的蓝灰主色、多层 Tab 嵌套、宽实线边框）。
- **Don't** 用浅色或白色底面。任何 L > 0.2 的背景色都背离终端信号美学。
- **Don't** 添加任何 `box-shadow`。深度来自色阶，不来自投影。
- **Don't** 在三个以上位置同时使用 Electric Volt——审查其中是否有装饰性用法，将其还原为中性色。
- **Don't** 为装饰目的使用 backdrop-filter / 毛玻璃效果。本系统无玻璃态。
- **Don't** 用 `border-left > 1px` 的彩色竖条做卡片或列表的视觉强调。
- **Don't** 用渐变文字（`background-clip: text` + gradient）。
- **Don't** 在 UI 标签、按钮、数据单元格中使用 Display 字体。Inter 承担所有文字排版；JetBrains Mono 只用于数字读数。
- **Don't** 在任何不表示数据序列的地方用编号标记（01 / 02 / 03 眉头样式）。
