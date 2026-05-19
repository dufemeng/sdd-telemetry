# Google Stitch Prompt — 技能分析页 `/sdd/skills`

> 复制下面 **Prompt** 部分到 Stitch。后面的 **Reference** 部分是给你/Claude 校对设计稿时的依据，不要一起复制。

---

## Prompt（复制这一整段到 Stitch）

```
Design a dark-mode dashboard page titled "技能分析" (Skill Analytics) for an internal data observability platform called "SDD 质量观测台". The page is one of several views in a left-sidebar shell layout; only design the main content area to the right of the sidebar and below the top bar. Render in Chinese.

# Design system (must follow exactly, no deviations)

## Colors (CSS custom properties, hex values shown)
- Background base: #0a0a0a (page body)
- Surface (card/panel background): #101010
- Panel (sidebar/topbar background): #14140b
- Hover: #171717
- Active/selected: #222222
- Inner chip background: #202016 (used for icon tiles, progress track)
- Primary accent: #faff69 (vivid yellow-green; used for icons, active labels, key highlights — used sparingly)
- Bar/chart fill: #c9ce3c (slightly muted version of primary, for bars and chart fills)
- Text primary: #e5e3d3 (off-white, slightly warm)
- Text emphasis: #f5f5f5 (pure near-white for numeric values and headings)
- Text secondary: #c9c8af
- Text muted: #93927c
- Border: rgba(255, 255, 255, 0.08) — extremely subtle 1px hairline
- Status good: text #22c55e on background rgba(34,197,94,0.10)
- Status warn: text #f59e0b on background rgba(245,158,11,0.10)
- Status bad:  text #ffb4ab on background rgba(239,68,68,0.16)

## Typography
- UI font: Inter (fallback: PingFang SC, system-ui)
- Monospace font: JetBrains Mono — USE FOR ALL NUMERIC VALUES (KPI numbers, table cells, counts, percentages, timestamps)
- Type scale:
  - Section/panel title: 14px, font-weight 600, color #f5f5f5
  - KPI number (large): 24px, font-weight 600, line-height 28px, JetBrains Mono, color #f5f5f5
  - Body text: 13px, color var(--color-text)
  - Secondary text/labels: 12px, color #c9c8af
  - Muted/hint: 11px, color #93927c (often italic-style but use `not-italic`)
  - Table header: 10px UPPERCASE bold, letter-spacing 0.05em, color #93927c
  - Sidebar group label: 10px UPPERCASE bold

## Shapes
- Border radius small: 4px (chips, tiny tiles, table corners)
- Border radius medium: 6px (cards, panels, KPI cards)
- All cards: 1px hairline border using rgba(255,255,255,0.08), no shadow

## Card pattern (Panel)
- 14px padding all sides
- 6px radius
- 1px border in rgba(255,255,255,0.08)
- Background #101010
- Title row: icon (18px, primary yellow #faff69) + title (14px / 600 / #f5f5f5), 8px gap, 12px bottom margin

## KPI card pattern (StatCard)
- 14px padding, 6px radius, min-height 98px
- 1px border, background #101010
- Layout: 34x34px square icon tile (background #202016, icon color #faff69, 4px radius) on the left, vertical stack on the right
- Right stack: 12px secondary label → 24px monospace value (top margin 8px) → 11px muted hint (top margin 8px)

## Iconography
- All icons from lucide-react, default stroke width 2, 18px size
- Page-level/section icons render in primary yellow #faff69
- Sidebar/navigation icons: 18px

## Spacing
- Grid gap between cards/panels: 12px (gap-3 in Tailwind)
- Page outer padding: 16px

# Layout (only the main content area — NOT the sidebar/topbar)

The page contains FOUR vertical sections stacked top to bottom with 12px gaps:

## Section 1 — Hero KPI row (6 cards in a single horizontal row, equal width)

Six StatCards using the pattern above. Each card shows:
- Icon (left tile)
- Label (top right)
- Large monospace number (middle right)
- Hint or delta line (bottom right) — use status-good green with up-arrow for positive deltas, status-bad red with down-arrow for negative

Cards in order:
1. icon Workflow,    label "交互总数",     value "12,847",  hint "↑ 12.3% 较上周期" (good)
2. icon Layers3,     label "技能调用数",   value "38,209",  hint "↑ 8.1% 较上周期" (good)
3. icon UserRound,   label "活跃用户",     value "247",     hint "↑ 3.2% 较上周期" (good)
4. icon GitBranch,   label "覆盖工作项",   value "89",      hint "↑ 15.4% 较上周期" (good)
5. icon CheckSquare, label "配对成功率",   value "92.4%",   hint "→ 0.2pp 持平" (muted)
6. icon Tag,         label "语义匹配率",   value "78.6%",   hint "↓ 2.1pp 较上周期" (warn)

## Section 2 — Trends row (two panels, left 2fr, right 1fr, total width 100%)

### Left panel (2fr wide) — "调用量趋势"
- Panel title "调用量趋势" with Activity icon (18px primary yellow)
- Top-right of panel header: small legend with two dots — yellow #faff69 dot "已触发", muted dot "已配对"
- Inside: a smooth area+line chart, height ~240px
- X-axis: 24 hourly tick labels (00:00, 02:00, … 22:00) in 11px muted, no gridlines
- Y-axis: 4-5 ticks, monospace 11px muted, hairline horizontal gridlines in rgba(255,255,255,0.04)
- Two stacked-area lines:
  - Outer: "已触发" filled area in rgba(201,206,60,0.18), stroke #c9ce3c 1.5px
  - Inner: "已配对" filled area in rgba(250,255,105,0.25), stroke #faff69 2px
- The triggered line is always ≥ paired line. Show peaks around 10:00 and 15:00.

### Right panel (1fr wide) — "调用质量漏斗"
- Panel title "调用质量漪斗" with Workflow icon
- Four horizontal funnel rows stacked vertically, 12px gaps:
  - Each row: label on left (12px secondary), large monospace count + percentage on right
  - Bar below each row, height 8px, background #202016, fill #c9ce3c, width proportional to ratio
  - Row 1: "已触发"   12,847  100.0%   bar 100%
  - Row 2: "有提示词" 12,489   97.2%   bar 97%
  - Row 3: "有回答"   11,932   92.9%   bar 93%
  - Row 4: "已配对"   11,873   92.4%   bar 92%
- Below the four rows, a small footnote in 11px muted: "整体配对率 92.4%"

## Section 3 — Structure + Health row (two panels, equal width 50/50)

### Left panel — "语义 TOP 10"
- Panel title "语义 TOP 10" with Layers3 icon
- Top-right of header: small text "按调用次数排序"  (11px muted)
- 10 horizontal bar rows, each row has 3 columns laid out via grid:
  - Column 1 (180px-ish): two-line label
    - Line 1 (12px var(--color-text)): semantic displayName, e.g. "需求撰写"
    - Line 2 (11px muted italic-styled but not italic): "requirement_authoring · 84 users"
  - Column 2 (flex-grow ~140px): horizontal bar — height 8px, track #202016 rounded-full, fill #c9ce3c rounded-full, width proportional to value (max=100%)
  - Column 3 (64px right-aligned): monospace 13px white count, e.g. "8,432"
- Sample 10 rows (use these displayName / code / users / count):
  1. 需求撰写        requirement_authoring   84 users   8,432
  2. 代码评审        code_review             62 users   6,108
  3. 测试用例生成    test_case_authoring     47 users   4,985
  4. 接口设计        api_design              51 users   4,221
  5. 数据建模        data_modeling           38 users   3,604
  6. 部署清单        deployment_checklist    29 users   2,872
  7. 任务拆分        task_breakdown          44 users   2,591
  8. 文档总结        doc_summarization       33 users   1,930
  9. 错误排查        error_diagnostics       27 users   1,488
  10. 提交说明      commit_message          58 users     989

### Right panel — "语义匹配健康"
- Panel title "语义匹配健康" with Tag icon
- Top half: a horizontal split layout
  - Left: a donut/ring chart, ~120px diameter, stroke 14px
    - 78.6% arc in #faff69 (matched)
    - 21.4% arc in rgba(255,180,171,0.6) (unmatched)
    - Center text: monospace 22px "78.6%" + 11px muted "已匹配" below
  - Right: vertical legend
    - Row 1: dot #faff69 + "已匹配" (12px secondary) + monospace count "30,032" right aligned
    - Row 2: dot rgba(255,180,171,0.6) + "未匹配" (12px secondary) + monospace count "8,177" right aligned
- Divider: 1px border line
- Bottom half: header "未匹配技能 TOP 5" (12px muted UPPERCASE 10px actually) + 5 rows
  - Each row: monospace 12px rawSkillName on left, monospace 13px count on right, badge "缺配置" (bad status colors) on far right
  - Sample rows:
    - claude-code-helper-zh    2,841   缺配置
    - sdd-doc-writer-v3        1,902   缺配置
    - smart-pr-reviewer        1,124   缺配置
    - quick-fix-suggester        892   缺配置
    - kpi-summarizer-internal    418   缺配置
- Bottom: small text-link styled row "去「语义配置」补充 →" (13px primary #faff69, hover underline)

## Section 4 — Detail table (full width)

- Outer container: Panel with title "技能 × 语义明细" + Workflow icon
- Top-right of panel header: a horizontal row containing
  - A 240px wide search input — height 28px, background #0a0a0a, 1px border, 4px radius, placeholder "搜索技能名 / 语义 / 用户" in 12px muted, with a Search lucide icon 14px on the left
  - 12px gap
  - A segmented control with 3 segments — height 28px, background #171717, 1px border, 4px radius, 2px inner padding
    - Segment "全部" (active, background #222, text #f5f5f5)
    - Segment "已匹配" (text muted)
    - Segment "未匹配" (text muted)
- Inside the panel, the DataTable:
  - 1px border around table, 4px corner radius, sticky header
  - Header row: 10px UPPERCASE bold #93927c, background #171717, bottom border 1px
  - Columns (left to right):
    1. 技能 / 语义              — multi-line cell, line 1 white 12px (rawSkillName), line 2 muted 11px ("→ 语义 displayName" or "→ 未匹配" in bad-text color)
    2. 调用                     — monospace right-ish 12px white
    3. 用户                     — monospace 12px secondary
    4. 会话                     — monospace 12px secondary
    5. 工作项                   — monospace 12px secondary
    6. 版本分布                 — small horizontal stacked bar (3 segments, total width 120px, height 6px) with mini-legend below: "v2.1 (62%) · v2.0 (28%) · v1.9 (10%)" in 10px muted
    7. 首次出现                 — monospace 11px muted, e.g. "2026-04-12 09:18"
    8. 最近调用                 — monospace 11px secondary, e.g. "2026-05-18 14:33"
  - Row body: 12px padding-x 10px, padding-y 8px, monospace font for cells, hover background #171717
  - Render 6 sample rows. Mix matched + unmatched so the unmatched-line is visible:
    Row 1: claude-code-helper-zh / → 未匹配 (red)  | 2,841 | 39 | 412 | 18 | v3.2 60% · v3.1 40% | 2026-04-22 11:05 | 2026-05-18 14:33
    Row 2: requirements-writer-v2 / → 需求撰写    | 4,820 | 76 | 1,209 | 41 | v2.4 70% · v2.3 30% | 2026-03-12 08:44 | 2026-05-18 13:58
    Row 3: code-reviewer-zh / → 代码评审          | 3,612 | 58 | 902 | 33 | v1.8 100% | 2026-02-28 10:22 | 2026-05-18 14:11
    Row 4: sdd-doc-writer-v3 / → 未匹配 (red)     | 1,902 | 22 | 308 | 9 | v3.0 100% | 2026-04-30 16:01 | 2026-05-17 18:40
    Row 5: test-case-builder / → 测试用例生成    | 3,108 | 47 | 754 | 19 | v4.1 55% · v4.0 32% · v3.9 13% | 2026-01-15 09:10 | 2026-05-18 12:09
    Row 6: api-designer-pro / → 接口设计          | 2,221 | 51 | 588 | 22 | v2.0 85% · v1.9 15% | 2026-02-02 14:50 | 2026-05-18 11:47
  - Below the table: simple pagination on the right — "共 84 项" left muted, "‹ 1 2 3 … 8 ›" right
  - Footer note: clicking a row will open a drawer (do not render the drawer, just note this in the design intent)

# Visual style requirements

- Pure dark mode, no glassmorphism, no shadows, no gradients except subtle area-chart fills
- Hairline 1px borders, never thicker
- The primary yellow #faff69 is precious — use only for: panel icons, KPI deltas-good (no, use green), accent lines, active sidebar pill, key highlight numbers. Do NOT flood the page with yellow.
- Numbers everywhere should use JetBrains Mono — this is non-negotiable
- Chinese labels are first-class; do not show English fallbacks except for technical identifiers (rawSkillName, semanticCode) which are intentionally English/snake_case
- Density-first: information-dense layout, this is an internal tool for power users, not a marketing page
- No emoji, no decorative illustrations, no avatars
- All cards same elevation (flat, border-only)

# Out of scope (do NOT render)

- Do not design the left sidebar (it exists in the shell, I will plug this content in)
- Do not design the top bar (search/time-range/refresh exist in the shell)
- Do not render light mode
- Do not include onboarding tooltips, modals, or empty states
- Do not include mobile/responsive variants — minimum viewport is 1180px wide, design at 1440px
```

---

## Reference（不要复制到 Stitch，是给 Claude/你对设计稿用的）

### 当前代码里实际存在的 design token 与组件

来源 / 校对点：

| 项 | 文件 | 备注 |
|---|---|---|
| 全部色值 | `web/src/styles/tokens.css` | 任何色值偏差都按这里为准 |
| Panel 组件规范 | `web/src/components/ui/Panel.tsx` | 14px padding / 6px radius / 1px hairline / 14px 600 title |
| StatCard 组件规范 | `web/src/components/ui/StatCard.tsx` | 34x34 icon tile / 24px mono value |
| BarList 组件规范 | `web/src/components/ui/BarList.tsx` | grid 模板 `minmax(180px,0.9fr) minmax(140px,1fr) 64px`，bar fill `#c9ce3c` |
| DataTable 组件规范 | `web/src/components/ui/DataTable.tsx` | 10px UPPERCASE bold header / 12px mono cell / hover #171717 |
| TopBar 时间范围 | `web/src/components/layout/TopBar.tsx` | 全局时间范围只有 `6h / 24h / 72h` 三档（**注意**：不是 1h / 7d，prompt 里描述 24h 即可） |
| Sidebar 风格 | `web/src/components/layout/Sidebar.tsx` | 「观测」分组的尺寸/动效，新 tab 接进去 |

### 数据来源现状

- `/api/sdd/funnel` 提供：totalInteractions / totalSkillUsages / callQuality (4 步) / stages（按 semantic）
- `/api/sdd/usage-summary` 提供：rawSkillName × semantic 的明细 + version + first/last seen
- 缺：**调用量时间序列**（折线图需要新加 API，如 `/api/sdd/skills-timeseries?bucket=hour&from=...`）
- 缺：**语义匹配率**（funnel 里 stages 只有 matched 的；unmatched 需要新加，建议复用 usage-summary 把 semantic 为 null 的也返回，或新加 `/api/sdd/match-health`）
- 缺：**环比 delta**（需要后端再算一份上一周期数据返回，建议复用现有接口加 `compare=prev` 参数）

### 设计稿验收 checklist（拿到稿之后用）

- [ ] 所有数字字体是 JetBrains Mono（看是否等宽）
- [ ] 主色 #faff69 没有滥用（只在 panel icon / KPI 强调 / 命中状态）
- [ ] 卡片是 hairline 边框 + 平面，没有阴影/渐变
- [ ] 中文字体看上去像 PingFang SC（不是宋体/楷体）
- [ ] 表格 header 是 10px UPPERCASE
- [ ] 漏斗/BarList 进度条颜色是 #c9ce3c（不是 #faff69 本身）
- [ ] 「未匹配」是 bad-text 红色 #ffb4ab，不是普通灰
- [ ] 没有圆角 > 6px 的卡片
- [ ] 没有 emoji / 头像 / 装饰图
- [ ] 折线图区域填充够淡（rgba 0.18-0.25），不是实色
- [ ] 整体信息密度高，看着像内部仪表板而不是 SaaS 着陆页
