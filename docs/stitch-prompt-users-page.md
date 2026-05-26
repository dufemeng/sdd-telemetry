# Google Stitch Prompt — 用户维度页 `/sdd/users`（老板视角 v3）

> 复制下面 **Prompt** 部分到 Stitch。后面的 **Reference** 部分是给你/Claude 校对设计稿时的依据，不要一起复制。

---

## Prompt（复制这一整段到 Stitch）

```
Design a dark-mode executive dashboard page titled "用户维度" for an internal platform called "SDD 质量观测台". This page gives a product/engineering leader a full picture of team adoption of an internal AI workflow tool called SDD (Skill-Driven Development). The audience is a business leader, not an engineer — no technical config details. All labels in Chinese. Design only the main content area (right of sidebar, below top bar).

# Product context
SDD is a four-stage AI workflow: 需求撰写 → 系统设计 → 任务拆分 → 代码评审. "使用深度" = how many of the 4 stages a user has invoked. "工作项" = distinct requirement directories a user has contributed to (the primary output metric).

---

# Design system

## Colors
- Page background: #0a0a0a
- Surface (card/panel): #101010
- Surface elevated (hover, highlight): #161616
- Border subtle: rgba(255,255,255,0.08)
- Border medium: rgba(255,255,255,0.12)
- Primary accent: #d4b896
- Text primary: #f5f5f5
- Text secondary: #a0a0a0
- Text muted: #5a5a5a
- Active/good: text #4ade80, bg rgba(74,222,128,0.10), bar #4ade80
- New member: text #60a5fa, bg rgba(96,165,250,0.10)
- Silent/warn: text #f59e0b, bg rgba(245,158,11,0.10)
- Neutral: text #a0a0a0, bg rgba(255,255,255,0.06)
- Mono font: 'JetBrains Mono', monospace
- Page padding: 16px, section gap: 12px, card radius: 6px

---

# Section 1 — KPI Cards (4 equal-width cards in a row)

Card base style: padding 14px, border 1px solid rgba(255,255,255,0.08), background #101010, border-radius 6px, min-height 98px. Each card has a 34×34 icon box (background #1a1a12, radius 4px, icon color #d4b896) on the left, and text content on the right.

## Card 1 — 近7天活跃
- Icon: Activity
- Label: "近7天活跃" in 12px secondary
- Value: "5" in 28px bold #f5f5f5 mono + " / 18" in 16px muted mono (same line)
- Below value: a thin horizontal progress bar, full width, height 3px, radius 2px
  - Track: rgba(255,255,255,0.08)
  - Fill: #4ade80, width 28% (5/18)
- Hint below bar: "按最近操作时间统计" in 11px muted

## Card 2 — 工作项总产出
- Icon: GitBranch
- Label: "工作项总产出"
- Value: "47" in 28px bold #f5f5f5 mono
- Below: "个需求目录" in 11px muted
- Hint: "全团队累计已覆盖" in 11px muted

## Card 3 — 平均使用深度
- Icon: Layers (or BarChart2)
- Label: "平均使用深度"
- Value: "2.4" in 28px bold primary accent (#d4b896) mono + " / 4 阶段" in 13px muted (same line)
- Below value: a row of 4 dots (8px diameter, 5px gap, radius 50%)
  - Dot 1–2: filled #d4b896
  - Dot 3: half-opacity #d4b896 at 50%
  - Dot 4: empty rgba(255,255,255,0.12)
  - These represent the average depth visually
- Hint: "满分 4（完整 SDD 链路）" in 11px muted

## Card 4 — 本月新增
- Icon: UserPlus
- Label: "本月新增成员"
- Value: "3" in 28px bold #60a5fa mono
- Below: small row of 3 avatar initials circles (20px, overlapping -4px, each a different muted dark bg with 11px initials text)
- Hint: "30天内首次接入" in 11px muted

---

# Section 2 — SDD 链路漏斗

Full-width panel. Border 1px solid rgba(255,255,255,0.08), background #101010, padding 16px 20px, border-radius 6px.

Header row: TrendingDown icon (color #d4b896) + "SDD 链路覆盖" in 14px bold #f5f5f5. Right side of header: small note "已使用该阶段的成员人数" in 11px muted.

Below header (margin-top 14px): a horizontal funnel visualization made of 4 connected stage blocks.

Each stage block layout (flex row, 4 blocks with arrows between):
- Stage block: flex-col, align-center, width ~22% of panel
- Top: stage name in 12px secondary (需求撰写 / 系统设计 / 任务拆分 / 代码评审)
- Middle: big count number "14" in 22px bold #f5f5f5 mono; below "人" in 11px muted
- Bottom: a filled bar (height 6px, radius 3px, full width of block)
  - Bar fill color gradient from #d4b896 (left) to rgba(212,184,150,0.4) (right)
  - Bar width is proportional to count: stage 1 = 100% width, stage 4 = narrower
  - Exact widths for sample data: 需求 100%, 设计 71%, 任务 50%, 评审 29%

Between blocks: a right-arrow icon (ChevronRight, 16px, color #5a5a5a)

Sample data: 需求撰写 14人 → 系统设计 10人 → 任务拆分 7人 → 代码评审 4人

Below the funnel (margin-top 10px): a thin note row in 11px muted, right-aligned: "基于 semanticStages 统计，同一成员多次使用仅计一次"

---

# Section 3 — 标杆成员 (Top Contributors, 3 cards in a row)

Section header row: Trophy icon (color #d4b896) + "标杆成员" in 14px bold #f5f5f5 + small badge "TOP 3" (10px, primary accent color, rounded, border 1px solid rgba(212,184,150,0.3), padding 2px 6px).

Three equal-width cards below (gap 12px). Each card: background #101010, border 1px solid rgba(255,255,255,0.08), border-radius 6px, padding 14px 16px.

Card internal layout (flex row, items-center, gap 12px):

Left: avatar circle 40px diameter
- Background: a dark muted color unique to each user (e.g. #1a2a1a, #1a1a2a, #2a1a1a)
- Center: user initials in 16px bold #f5f5f5 (e.g. "张", "王", "陈")
- Small rank badge in top-right corner of avatar: "1" / "2" / "3" in 9px, circle 14px, background #d4b896, text #0a0a0a

Right: flex-col gap-6px
- Row 1: user name in 14px bold #f5f5f5; right side: status badge (活跃 in green pill, same style as table)
- Row 2: depth dots row — 4 dots 7px each, filled = #d4b896, empty = rgba(255,255,255,0.12), with "N / 4 阶段" label in 11px mono muted to the right
- Row 3: two stat chips side by side
  - Chip A: GitBranch icon (10px) + "23 工作项" in 11px mono secondary
  - Chip B: Zap icon (10px) + "142 次使用" in 11px mono secondary
  - Each chip: background rgba(255,255,255,0.04), border 1px solid rgba(255,255,255,0.08), padding 2px 8px, radius 4px

Sample users:
- #1: 张三, 活跃, ●●●● (4/4), 23工作项, 142次
- #2: 王五, 活跃, ●●●○ (3/4), 31工作项, 209次
- #3: 陈七, 活跃, ●●●○ (3/4), 18工作项, 97次

---

# Section 4 — 用户一览 (Full user list panel)

Panel: full-width, border 1px solid rgba(255,255,255,0.08), background #101010, border-radius 6px.

## Panel header row (padding 14px 14px 0 14px)
Left: UserRound icon (color #d4b896) + "用户一览" in 14px bold #f5f5f5
Right: search input (width 240px, height 28px, radius 4px, border 1px solid rgba(255,255,255,0.10), background #0a0a0a, Search icon 14px on left, placeholder "搜索成员名称" in muted)

## Filter tabs row (padding 8px 14px, border-bottom 1px solid rgba(255,255,255,0.06))
Four tab chips in a row (gap 4px):
- 全部 · 18  (selected state: background rgba(212,184,150,0.12), border 1px solid rgba(212,184,150,0.25), text #d4b896)
- 活跃 · 5   (unselected: background transparent, border 1px solid rgba(255,255,255,0.08), text #a0a0a0)
- 新成员 · 3
- 沉默 · 8
Each chip: height 24px, padding 0 10px, font-size 12px, border-radius 4px

## Table (inside panel, no extra padding)
Table rows have a 3px colored left border:
- 活跃 row: left border #4ade80
- 新成员 row: left border #60a5fa
- 沉默 row: left border rgba(255,255,255,0.12)

Row hover state: background rgba(255,255,255,0.03)

### Column headers (12px uppercase muted, padding 10px 14px):
成员 | 状态 | SDD 深度 | 工作项 | 累计使用 | 最近活跃

### Column definitions

Col 1 — 成员 (min-width 160px)
- Avatar circle 28px (same style as top cards but smaller, with initial)
- Right of avatar: user name 13px bold #f5f5f5; below: "接入 47天" in 11px muted

Col 2 — 状态 (width 80px)
- Pill badge, height 20px, 11px font, rounded-full
- 活跃: text #4ade80, bg rgba(74,222,128,0.10)
- 新成员: text #60a5fa, bg rgba(96,165,250,0.10)
- 沉默: text #a0a0a0, bg rgba(255,255,255,0.06)

Col 3 — SDD 深度 (width 120px)
- "N / 4" in 12px mono secondary
- Row of 4 dots below (6px, gap 3px): filled = #d4b896, empty = rgba(255,255,255,0.12)

Col 4 — 工作项 (width 80px)
- Count in 13px mono #f5f5f5; "个" in 11px muted. If 0: "—"

Col 5 — 累计使用 (width 80px)
- Count in 12px mono secondary; "次" in 10px muted below

Col 6 — 最近活跃 (width 100px)
- "3天前" in 12px secondary
- Exact time "05/23 14:21" in 11px mono muted

### Table data (6 rows)
Row 1: 张三 | 接入47天 | 活跃(green border) | ●●●● 4/4 | 23 | 142次 | 今天
Row 2: 李四 | 接入8天  | 新成员(blue border) | ●●○○ 2/4 | 3  | 18次  | 昨天
Row 3: 王五 | 接入120天 | 活跃(green border) | ●●●○ 3/4 | 31 | 209次 | 2天前
Row 4: 赵六 | 接入35天 | 沉默(gray border)  | ●○○○ 1/4 | 0  | 7次   | 22天前
Row 5: 陈七 | 接入3天  | 新成员(blue border) | ●○○○ 1/4 | 1  | 4次   | 今天
Row 6: 刘八 | 接入90天 | 沉默(gray border)  | ●●○○ 2/4 | 8  | 56次  | 18天前

## Table footer (padding 10px 14px, flex space-between)
Left: "共 18 位成员" in 11px muted
Right: pagination "< 上一页  第 1 页  下一页 >" in 12px muted

---

# Section 5 — 接入健康 (only shown when issues exist)

Panel with amber accent:
- Border: 1px solid rgba(245,158,11,0.20)
- Background: rgba(245,158,11,0.04)
- Border-radius: 6px

Header (padding 12px 14px, border-bottom 1px solid rgba(245,158,11,0.10)):
AlertTriangle icon (#f59e0b, 18px) + "接入健康" in 14px bold #f59e0b

Two rows:

Row 1 (warn):
- Pill: "3 人" centered, width 48px, height 20px, rounded-full, text #f59e0b bold, bg rgba(245,158,11,0.12)
- Text: "尚未完成接入配置，工作项数据可能缺失" in 12px #a0a0a0

Row 2 (neutral):
- Pill: "5 人" in neutral gray style (bg rgba(255,255,255,0.06), text #a0a0a0)
- Text: "近14天未使用" in 12px #a0a0a0

Row separator: 1px solid rgba(245,158,11,0.06)
Row padding: 12px 14px

---

Overall page structure (top to bottom, gap 12px):
1. KPI Cards row (4 cards)
2. SDD 链路漏斗 panel
3. 标杆成员 row (3 cards)
4. 用户一览 panel (filter tabs + table)
5. 接入健康 panel (conditional)
```

---

## Reference（校对用，不要复制进 Stitch）

### 后端字段映射

| 设计元素 | API 字段 / 推导逻辑 |
|---|---|
| 成员名 / initials | `userName` |
| 接入 N 天 | `firstSeenAt` → 距今天数 |
| 状态 badge | 新成员: `firstSeenAt` < 14天；活跃: `lastSeenAt` ≤ 7天；沉默: 其余 |
| 使用深度点点（N/4）| `semanticStages.length`，4个点对应4个阶段分类 |
| 工作项 | `workItemCount` |
| 累计使用 | `interactionCount` |
| 最近活跃 | `lastSeenAt` |
| KPI 活跃率进度条 | `active7d / total` |
| KPI 平均深度 | `mean(semanticStages.length)` |
| KPI 本月新增 | `firstSeenAt` 距今 < 30天 |
| KPI 工作项总产出 | `sum(workItemCount)` |
| 漏斗各阶段人数 | 按 `semanticStages` 包含的阶段分类 COUNT DISTINCT 用户 |
| 标杆成员 | 按 `workItemCount DESC + semanticStages.length DESC` 取前3 |
| 未完成配置 | `!requirementsRootPath \|\| !installId` |
| 近14天未使用 | `lastSeenAt` 距今 > 14天 |

### 使用深度 4 个点对应阶段顺序
1. 需求撰写（semantic_code 包含 proposal/requirement 类）
2. 系统设计（design 类）
3. 任务拆分（tasks/breakdown 类）
4. 代码评审（review 类）

实施时需要把 `semanticStages` 的字符串值映射到4个分类，确认具体 semantic_code 枚举值后再对应。
