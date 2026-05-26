# Google Stitch Prompt — 工作项产出页 `/sdd/work-items`（老板视角）

> 复制下面 **Prompt** 部分到 Stitch。后面的 **Reference** 部分是给你/Claude 校对设计稿时的依据，不要一起复制。

---

## Prompt（复制这一整段到 Stitch）

```
Design a bold, dark-mode executive dashboard page for a page called "工作项产出" inside an internal platform "SDD 质量观测台". The audience is a business leader. This page answers one question: "What has the team shipped through the SDD AI workflow?" All labels in Chinese. Design only the main content area (right of sidebar, below top bar).

# Product context
SDD (Skill-Driven Development) is a 4-stage AI-assisted engineering workflow:
  需求撰写 (proposal) → 系统设计 (design) → 任务拆分 (task) → 代码评审 (review)
A "工作项" (work item) is a distinct requirement directory — the atomic unit of output.
Each work item can produce multiple artifact documents; each artifact has a type matching one of the 4 stages.
"阶段覆盖" = which of the 4 stages have produced at least one artifact for a given work item.

---

# Design system

## Colors
- Page background: #0a0a0a
- Surface (card background): #101010
- Surface warm (panel tint): #14140b
- Hover / elevated: #171717
- Border default: rgba(255,255,255,0.08)
- Border medium: rgba(255,255,255,0.12)
- Primary accent: #faff69  ← bright yellow-green, use boldly but purposefully
- Text primary: #f5f5f5
- Text secondary: #c9c8af
- Text muted: #93927c
- Active/good: text #22c55e, bg rgba(34,197,94,0.10)
- Warn: text #f59e0b, bg rgba(245,158,11,0.10)
- Error/bad: text #ffb4ab, bg rgba(239,68,68,0.16)
- Artifact badge colors:
  - proposal: text #60a5fa, bg rgba(96,165,250,0.10)
  - design: text #22c55e, bg rgba(34,197,94,0.10)
  - task: text #faff69, bg rgba(250,255,105,0.10)
  - review: text #a78bfa, bg rgba(167,139,250,0.10)
  - other: text #93927c, bg rgba(255,255,255,0.06)
- Rank colors: #faff69 (gold), #c9c8af (silver), #93927c (bronze)
- Mono font: 'JetBrains Mono', monospace
- Page padding: 18px, section gap: 12px, card radius: 6px

## Animation hints (describe them in spec form, Stitch will render the static state)
- KPI numbers: count-up from 0 on mount, 600ms ease-out
- Funnel trapezoids: height grows from 0 upward, stagger 80ms each stage
- Table rows: stagger-fade-in on filter change, 20ms between rows, translateY(-4px) → 0
- Left-border on table rows: color flash on first render (0.3s)
- Filter tab indicator: sliding underline that moves to active tab (200ms ease)
- Card hover: scale(1.015), border brightens to rgba(255,255,255,0.18), 150ms

---

# Section 1 — Hero KPI (asymmetric 2-column layout)

Left column (60% width): one large "spotlight" card
Right column (40% width): two stacked smaller cards

## Spotlight card — 需求总数 + 活跃率
Card style: padding 20px 24px, min-height 120px, border 1px solid rgba(255,255,255,0.10), background linear-gradient(135deg, #101010 0%, #14140b 100%), border-radius 6px.

Content layout (flex-col, justify-between, full height):
- Top row: small label "需求总数" in 12px secondary + right-aligned small label "近 14 天活跃" in 11px muted
- Middle: giant number "47" in 52px bold #f5f5f5 mono, letter-spacing -1px
  Below the number: a horizontal segmented progress bar (full width, height 8px, radius 4px)
  - Track: rgba(255,255,255,0.08)
  - Fill segment: #22c55e, width 66% (31 active / 47 total)
  - A small white tick mark at the fill boundary, with a floating chip above it: "31 活跃" in 10px #22c55e bold, background rgba(34,197,94,0.12), border 1px solid rgba(34,197,94,0.25), radius 4px, padding 1px 6px
- Bottom row: left = "全团队累计覆盖需求目录" in 11px muted; right = "66% 活跃率" in 12px bold #22c55e

## Stacked right cards (2 cards, gap 12px)

### Card A — 文档总产出
- Padding 14px 16px, min-height 52px, border 1px solid rgba(255,255,255,0.08), background #101010, radius 6px
- Left: FileText icon (16px, color #faff69) in a 28×28 icon box (background rgba(250,255,105,0.08), radius 4px)
- Right: label "文档总产出" in 11px secondary; value "128" in 24px bold #faff69 mono + " 篇" in 12px muted
- Below value: "全团队 artifact 累计" in 11px muted

### Card B — 本月新增
- Same card style as Card A
- Left: Sparkles icon (16px, color #60a5fa) in icon box (background rgba(96,165,250,0.08))
- Right: label "本月新增需求" in 11px secondary; value "6" in 24px bold #60a5fa mono
- Below value: three tiny work item title chips in a row
  - Each chip: max-width 80px truncated text in 10px #60a5fa, background rgba(96,165,250,0.08), border 1px solid rgba(96,165,250,0.15), radius 3px, padding 1px 5px
  - Sample: [payment-r…] [auth-over…] [onboard…]

---

# Section 2 — 需求健康度 (2-column, col-span 2:1)

## Left panel — 阶段覆盖漏斗 (col-span 2)

Panel style: padding 16px 20px, border 1px solid rgba(255,255,255,0.08), background #14140b, radius 6px.

Header row: TrendingDown icon (color #faff69, 18px) + "阶段覆盖漏斗" in 14px bold #f5f5f5. Right side: note "包含该阶段 artifact 的需求数" in 11px muted.

Below header (margin-top 16px): a proper funnel visualization using 4 TRAPEZOID shapes connected side by side.

Each stage trapezoid:
- Shape: trapezoid — wider at top, narrower at bottom (use a div with clip-path: polygon(0 0, 100% 0, 85% 100%, 15% 100%) or similar, each subsequent stage narrower)
- Width: each trapezoid takes ~22% of panel, gap 3px between
- Stage 1 height: 80px (100%)
- Stage 2 height: 64px (80%)
- Stage 3 height: 46px (58%)
- Stage 4 height: 28px (35%)
- Fill color: rgba(250,255,105, decreasing opacity): stage1=1.0, stage2=0.75, stage3=0.50, stage4=0.30
- Inside each trapezoid (centered, flex-col items-center justify-center):
  - Count in 20px bold #0a0a0a mono (dark text on bright fill)
  - Stage name in 10px #0a0a0a (dark on bright)

Between each two trapezoids: a small downward-arrow "dropout" annotation:
- "-24%" in 10px muted, positioned between the two shapes, centered
- A tiny ChevronRight icon in 10px #93927c

Below all shapes: stage labels in 11px muted centered under each shape (需求撰写 / 系统设计 / 任务拆分 / 代码评审)

Sample data: 47 → 38 (-19%) → 27 (-29%) → 17 (-37%)

## Right panel — 业务域分布 (col-span 1)

Panel style: same as left.

Header: Grid2x2 icon (color #faff69, 18px) + "业务域分布" in 14px bold #f5f5f5.

Below header: a vertical list of business domain rows (gap 8px, margin-top 12px).

Each row:
- Domain name in 12px #c9c8af, left-aligned
- Right side: count in 12px mono #f5f5f5 bold
- Below domain row: a thin progress bar (height 4px, radius 2px, full width)
  - Track: rgba(255,255,255,0.06)
  - Fill: rgba(250,255,105,0.55), width proportional to count

Sample data (5 rows):
- cashier         18  ██████████████████░░░░
- mybank-home      9  █████████░░░░░░░░░░░░░
- sdd-telemetry    5  █████░░░░░░░░░░░░░░░░░
- bkfin            4  ████░░░░░░░░░░░░░░░░░░
- 未分类           11  ███████████░░░░░░░░░░░

---

# Section 3 — 标杆需求 (podium layout, 3 cards)

Section header row (padding-bottom 10px): Trophy icon (color #faff69) + "标杆需求" in 14px bold #f5f5f5 + TOP 3 badge (10px, primary accent, border rgba(250,255,105,0.22), bg rgba(250,255,105,0.06), radius 20px, padding 2px 8px).

Three cards below in a grid-cols-3 (gap 12px). Each card: relative, overflow-hidden, background #101010, border 1px solid rgba(255,255,255,0.08), border-radius 6px, padding 14px 16px.

**Card #1 (gold rank)**:
- Left edge: a 3px vertical bar, color #faff69, full card height (absolute positioned)
- Top-right corner: "# 1" in 11px bold, color #faff69, background rgba(250,255,105,0.08), radius 0 6px 0 6px, padding 3px 8px (corner badge)
- Content (padding-left 10px to clear the rank bar):
  - Title: "2026-05-15-payment-refund" in 13px bold #f5f5f5, truncate after 28 chars
  - Business domain badge below title: [cashier] in 10px, proposal badge color (blue), background rgba(96,165,250,0.08), border rgba(96,165,250,0.15), radius 3px, padding 1px 6px
  - Stage dots row (margin-top 8px): 4 dots × 8px diameter, gap 4px
    - proposal dot: #60a5fa (filled)
    - design dot: #22c55e (filled)
    - task dot: #faff69 (filled)
    - review dot: #a78bfa (filled — all 4 for #1)
    - Label to right: "4 / 4" in 10px muted mono
  - Stat chips row (margin-top 8px, gap 6px):
    - [📄 8 篇] chip: FileText icon 10px + count in 11px mono secondary; bg rgba(255,255,255,0.04), border rgba(255,255,255,0.08), radius 4px, padding 2px 7px
    - [⚡ 24 次] chip: Zap icon 10px + count; same chip style
  - Footer: "最近 2天前" in 11px muted, right-aligned

**Card #2 (silver rank)**: same structure, left bar color #c9c8af, corner badge "# 2" in silver. Stage dots: ● ● ● ○ (3/4). 6 篇文档, 18次, 最近 5天前. Title: "2026-05-10-auth-overhaul", domain [mybank-home].

**Card #3 (bronze rank)**: left bar color #93927c, corner "# 3" in bronze. Stage dots: ● ● ○ ○ (2/4). 4 篇文档, 9次, 最近 12天前. Title: "2026-04-28-onboarding", domain [未分类].

---

# Section 4 — 需求一览 (full-width interactive panel)

Panel: full-width, border 1px solid rgba(255,255,255,0.08), background #101010, border-radius 6px.

## Panel header (padding 12px 16px, border-bottom rgba(255,255,255,0.06))
Left: GitBranch icon (color #faff69, 18px) + "需求一览" in 14px bold #f5f5f5
Right: search input (width 240px, height 28px, border-radius 4px, border 1px solid rgba(255,255,255,0.10), background #0a0a0a, Search icon 13px on left in muted, placeholder "搜索需求标题 / slug / 业务域" in muted, 12px)

## Filter tabs row (padding 8px 16px, border-bottom 1px solid rgba(255,255,255,0.06))
Four tab chips, gap 6px. Active tab style: background rgba(250,255,105,0.08), border 1px solid rgba(250,255,105,0.22), color #faff69. Inactive: background transparent, border rgba(255,255,255,0.08), color muted. Height 26px, padding 0 12px, font 12px, radius 4px.

Chips: [全部 47] [活跃 31] [沉默 12] [有错误 4]
"全部" is the active state in the design.

## Table

Column headers: 12px uppercase muted, background #141414, padding 8px 12px, border-bottom rgba(255,255,255,0.08)
Columns: 需求标题 | 业务域 | 阶段覆盖 | 文档数 | 调用次数 | 最近更新

### Row design

Each row has a 3px left border (absolute, full row height) encoding status:
- Active (≤14 days): #22c55e
- Silent (>14 days): rgba(255,255,255,0.10)
- Has errors: #ffb4ab (highest priority, shown even if active)

Row hover: background #171717, left border brightens. Cursor pointer.

### Col: 需求标题 (min-width 220px, padding-left 18px)
- Work item title in 13px bold #f5f5f5, max 30 chars, ellipsis
- Below: slug in 11px mono muted (smaller, de-emphasized)

### Col: 业务域 (width 100px)
- Small badge: domain name in 10px, background rgba(255,255,255,0.06), border rgba(255,255,255,0.10), radius 3px, padding 1px 7px, text secondary

### Col: 阶段覆盖 (width 120px)
- Horizontal mini pipeline: 4 segments connected, each 18px wide × 6px tall, radius 2px, gap 2px
  - proposal segment: filled #60a5fa OR empty rgba(96,165,250,0.12)
  - design segment: filled #22c55e OR empty rgba(34,197,94,0.12)
  - task segment: filled #faff69 OR empty rgba(250,255,105,0.12)
  - review segment: filled #a78bfa OR empty rgba(167,139,250,0.12)
- Below pipeline: "N / 4 阶段" in 10px mono muted

### Col: 文档数 (width 64px, right-align)
- Count in 13px mono #f5f5f5; "篇" in 10px muted. Zero: "—"

### Col: 调用次数 (width 72px, right-align)
- Count in 12px mono secondary; "次" in 10px muted. Zero: "—"

### Col: 最近更新 (width 108px)
- Relative time "2天前" in 12px secondary
- Exact timestamp "05-24 18:32" in 11px mono muted

### Table data (6 rows)

Row 1 [active / green border]:
- 2026-05-15-payment-refund / [cashier] / ████ (4/4) / 8篇 / 24次 / 2天前

Row 2 [active / green border]:
- 2026-05-10-auth-overhaul / [mybank-home] / ███░ (3/4) / 6篇 / 18次 / 5天前

Row 3 [has errors / red border]:
- 2026-05-18-deploy-pipeline / [cashier] / ███░ (3/4) / 5篇 / 11次 / 8天前

Row 4 [active / green border]:
- 2026-05-20-refactor-hooks / — / ██░░ (2/4) / 2篇 / 7次 / 1天前

Row 5 [silent / gray border]:
- 2026-04-10-legacy-cleanup / [bkfin] / █░░░ (1/4) / 1篇 / 3次 / 32天前

Row 6 [silent / gray border]:
- 2026-04-28-onboarding-v2 / [未分类] / ██░░ (2/4) / 4篇 / 9次 / 12天前

## Panel footer (padding 10px 16px, flex space-between, border-top rgba(255,255,255,0.06))
Left: "共 47 个需求" in 11px muted
Right: pagination "< 上一页  第 1 / 3 页  下一页 >" in 12px muted (prev disabled state shown faded)

---

# Section 5 — 详情抽屉 (right-side drawer, shown on row click)

Show the drawer in the design as if the first row was clicked. The drawer overlays the right 45% of the page content area, with a subtle backdrop.

Drawer: background #101010, border-left 1px solid rgba(255,255,255,0.10), full viewport height.

## Drawer header (padding 16px 20px, border-bottom rgba(255,255,255,0.08))
- Title row: FileStack icon (color #faff69) + "2026-05-15-payment-refund" in 15px bold #f5f5f5 + [3/4 阶段] badge (10px, muted, border, radius 20px)
- Subtitle: "sdd-telemetry:cashier:2026-05-15-payment-refund" in 11px mono muted, single line, ellipsis
- Close button (X icon, 18px, top-right corner, muted)

## Drawer meta fields (padding 12px 20px, grid-cols-2, gap 8px, border-bottom rgba(255,255,255,0.06))
Each field: label in 10px uppercase muted, value in 12px secondary.
- 业务域: cashier
- 需求库: bk-fe-requirements-trade
- 相对路径: cashier/2026-05-15-payment-refund
- 首次活跃: 2026-05-15
- 调用次数: 24 次
- 错误数: 0（show "—" in muted if zero）

## Drawer artifacts section (padding 12px 20px)
Section label row: "Artifacts  · 8篇" — "Artifacts" in 12px bold #f5f5f5, "· 8篇" in 11px muted.

Artifact rows (margin-top 8px, gap 4px). Each row (flex, align-center, gap 8px, padding 6px 8px, radius 4px, hover bg #171717):
- Type badge (left): artifact type in 10px bold, padded badge (proposal=blue, design=green, task=yellow, review=purple). Width fixed 64px.
- File path: in 12px mono secondary, flex-1, ellipsis
- Module: in 11px muted (if null show "—"), width 80px
- Date: in 11px mono muted, "05-15", right-aligned, width 44px

Sample artifact rows:
1. [proposal]  proposal.md                    —        05-15
2. [design]    design-payment-core.md         core     05-16
3. [design]    design-refund-flow.md          refund   05-17
4. [task]      tasks-payment-core.md          core     05-18
5. [task]      tasks-refund-flow.md           refund   05-19
6. [review]    review-notes.md                —        05-22
7. [test]      test-scenarios.md              core     05-23
8. [document]  changelog.md                   —        05-24

---

# Overall page structure (top-to-bottom, gap 12px, all sections visible)
1. Hero KPI row (asymmetric: spotlight card 60% + 2 stacked cards 40%)
2. 需求健康度 row (funnel 2/3 width + domain list 1/3 width)
3. 标杆需求 row (3 podium cards)
4. 需求一览 panel (filter + table)
5. 详情抽屉 (overlay, shown as if first row clicked)
```

---

## Reference（校对用，不要复制进 Stitch）

### 后端字段映射

| 设计元素 | API 字段 / 推导逻辑 |
|---|---|
| 需求总数 | `data.length` |
| 活跃需求 / 活跃率 | `data.filter(i => lastSeenAt ≤ 14天前).length / total` |
| 文档总产出 | `data.reduce((s,i) => s + i.artifactCount, 0)` — 需后端新增聚合字段 |
| 本月新增 | `data.filter(i => firstSeenAt ≥ 本月1日)` |
| 阶段覆盖漏斗 | `data.filter(i => i.coverageStages.includes(stage)).length`，只统计 proposal/design/task/review，test/document 不计 |
| 业务域分布 | `groupBy(businessDomain ?? '未分类')` 前端计算 |
| 标杆需求 Top 3 | `[...data].sort((a,b) => b.artifactCount - a.artifactCount).slice(0,3)` |
| 阶段 dots / pipeline | `coverageStages` 数组，包含该阶段名即为亮色 |
| 活跃/沉默/有错误状态 | 活跃: `lastSeenAt 距今 ≤ 14天`；有错误: `errorCount > 0`（优先级高于活跃/沉默）；沉默: 其余 |
| 左侧竖条颜色 | 有错误=#ffb4ab（最高优先）> 活跃=#22c55e > 沉默=rgba(255,255,255,0.10) |
| 详情抽屉 artifacts | `GET /api/sdd/work-items/:id` 的 `artifacts` 数组 |
| 调用次数（列表） | `usageCount` — 需后端新增聚合字段 |
| 错误数（列表） | `errorCount` — 需后端新增聚合字段 |

### 后端改动前提

列表展示依赖 4 个后端新增聚合字段（`SddWorkItemSchema` 扩展）：
- `artifactCount: number`
- `usageCount: number`
- `errorCount: number`
- `coverageStages: string[]`

详情抽屉直接复用现有 `GET /api/sdd/work-items/:id`（已有 artifacts / usageCount / errorCount）。
