# 技能分析重构设计（主语=技能本身 · 方法论完整度漏斗 · 活/冷/死 · 接续/产出转化）

状态：待评审
日期：2026-06-02
产出方式：`/office-hours`（老板视角，先对齐主语再定结构）
关联代码：`web/src/pages/sdd/skills/*`、`server/src/modules/sdd/*`、`packages/api/src/contracts/sdd.contract.ts`
取代：`docs/design-skills-redesign.md`（2026-05-26 的旧重构，已严重不保鲜，见 §1）

## 1. 背景与目标

`/sdd/work-items`（产出分析）与 `/sdd/wiki-recalls`（知识库分析）已经做到很深的研究纵深，老板认可。它们的共同点是各自建立了一条**深下钻的主轴**：

- 产出分析：`需求(work item) → SDD 阶段 → artifacts → 代码落地`，能从一个需求钻到它产出的 design.md/tasks.md，再到代码有没有落地。
- 知识库分析：`知识库(业务线) → 业务域 → 文档` + 覆盖率/冷热/死知识三态，能钻到单篇文档正文。

唯独 `/sdd/skills`（技能分析）还停在**工程/排障语言**：4 KPI + 调用趋势 + **语义有效配对率** + 标杆技能 + 技能目录表 + 抽屉看最近调用。问题：

- **「有效配对率/未匹配」是埋点管线自检**（raw skill name 有没有映射到 semantic code），不是老板关心的经营结论，老板看不懂也不关心。
- **没有主轴、不下钻到产物、没有健康度**，研究纵深远浅于另外两页。
- **没用上**技能侧唯一独占的一张牌：这些 skill 的 `semanticCode` 就是 SDD 方法论本身的阶段（proposal→design→task→code→review…）。

### 1.1 关键定调：主语之争（本次重构的根）

四个 tab 各应独占一个**主语**，否则就是互相翻版：

| Tab | 主语 | 回答 |
|---|---|---|
| 用户分析 | **人** | 谁活跃、谁贡献多 |
| 产出分析 | **需求 / 产物** | 产出了什么、落地没 |
| 知识库分析 | **知识资产** | 沉淀的知识健不健康 |
| 技能分析 | **技能 / 方法论本身**（本次抢占） | 这套生产方式被用得怎么样 |

**踩坑预警（评审已确认）**：任何「漏斗」都需要一个流过漏斗的载体，能把 proposal→design→task→code 串起来的载体只有**需求**或**会话**。若用需求当下钻载体，数据与产出分析**同源**、主语还是需求 → 技能分析会沦为产出分析的换皮。

**结论**：漏斗保留为顶部**只读结论带**，下钻主轴换成**技能本身**。一条铁律划清边界：

> **技能分析的下钻终点只能是「技能」或「人」，绝不是「需求详情」；需求只作为出链跳 `/sdd/work-items/:id`。**

**目标**：把技能分析重构成**「技能/方法论本身」视角**的老板总览——回答「团队有没有在按 SDD 方法论干活、在哪一步掉链子、每个技能被用得怎么样、哪些技能在烂」。

## 2. 范围

**做：**
- 与用户/产出/知识库三页同构的 **4-section 重构**（页面结构方案 A）。
- 顶部 **SDD 方法论完整度漏斗**（proposal→design→task→code→review 接续断崖），只读、不下钻需求。
- 下钻主轴换成**技能**：技能一览表（活/冷/死徽标 + 调用后最常接续技能 + 产出转化）→ 单技能画像抽屉。
- **活/冷/死技能**三态（对称知识库死知识口径）：把 seeded 全集纳入分母，长期没人用的技能 = 死技能。
- 把旧页的「语义配对率/未匹配」从主视觉**收敛进抽屉/调试角**，不再当经营指标。
- 其余三视角（ROI 杠杆、人方法论成熟度、技能资产健康）作为**低优先级切片**塞进 KPI 角标 / 表格列 / 抽屉，不抢主轴。

**不做（YAGNI）：**
- 不在本页做需求级下钻（属产出分析），需求只出链。
- 不做 funnel-first / catalog-first 的重可视化（方案 B/C 已否决）。
- 不新增 DB 表 / 列 / 迁移（全部用现有表聚合）。
- 不改采集、不改 worker、不改 outbox 语义。
- 不重做用户排行（属用户分析）。

## 3. 信息架构与页面结构（方案 A：与三页同构 4-section）

```
① 经营指标（4 KPI · 累计/周期对比）
   技能调用量(带"方法论完整度"进度条) | 活跃用户 | 覆盖需求 | 死技能 N⚠
② 方法论完整度漏斗(hero, 左) + 调用趋势(右, 堆叠 by 阶段)
   proposal ▮▮▮▮ 100% → design ▮▮▮ 78% → task ▮▮ 61% → code ▮▮ 55% → review ▮ 32%
   断崖高亮在转化率最低的相邻台阶；漏斗只读，"看具体需求"出链产出分析
③ 标杆技能 Top3（沿用三页排名色条+角标）
   每卡：调用量 · 用户数 · 覆盖需求 · 产出转化(artifact/落地)
④ 技能一览表  [分组: 全部 | 按方法论阶段]  [搜索] [筛选: 全部 | 仅死/冷]
   行常驻 活/冷/死 徽标 · 调用量 · 用户数 · 覆盖需求 · 最常接续技能 · 产出转化 · 最近调用
   点行 → 单技能画像抽屉（主轴=技能，绝不跳需求详情）
        抽屉: 技能 meta + 调用趋势 + 谁在用(Top 用户) + 接续分布(调用后下一个技能 Top)
              + 产出转化(产了多少 artifact / 多少落地代码) + [调试角: 语义代码/原始名/配对方式]
```

- **配色语义**：技能状态 活=绿 / 冷=灰 / 死=红；漏斗各阶段沿用产出分析阶段色；断崖台阶用警示色描边。
- **「方法论完整度」**（① KPI 进度条 + ② 漏斗）= 起步 proposal 的需求里走到 code 落地的比例，是全页一句话结论。

## 4. 数据来源与口径（全部现有表聚合，零迁移）

### 4.1 现有数据（只读）

- `sdd_skill_usages`（每次技能调用一行）：`semantic_id`、`raw_skill_name`、`user_id`、`session_id`、`prompt_id`、`work_item_id`、`event_time`、`matched_by`。→ 调用量、谁在用、接续、活冷死、覆盖需求。
- `sdd_skill_semantics`（seeded 语义全集）：`semantic_code`、`display_name`。→ **活/冷/死的分母**（全集，含从没人用的）。
- `sdd_work_item_artifacts`：`work_item_id`、`artifact_type`。→ 方法论完整度漏斗（stageCodes 聚合）、产出转化分子。
- `sdd_interaction_tool_calls`：`interaction_id`、`skill_usage_id`、`tool_name`。→ 代码落地（复用日报 `codeImpact` 口径，见 `docs/facts-daily-report.md` §3.6）。

复用现有接口：`/api/sdd/skills/{analytics, timeseries}`、`/api/sdd/usage-summary`、`/api/sdd/skill-usages`。

### 4.2 活 / 冷 / 死技能（对称知识库死知识三态）

匹配键 = `semantic_code`，分母 = `sdd_skill_semantics` 全集（**含从无调用的 seeded 技能**）：

| 集合 | 含义 | 呈现 |
|---|---|---|
| 近 N 天内有调用 | **活** | 绿徽标 |
| 有历史调用但近 N 天无（N..M 天） | **冷** | 灰徽标 |
| 从无调用，或最近调用 >M 天 | **死技能** | 红徽标，计入 ① 死技能 KPI |
| 调用里出现但 seeded 全集没有的 raw skill | 未登记技能 | orphan，单列调试角，不进分母 |

- 活跃阈值 N 默认 **7 天**、死亡阈值 M 默认 **30 天**（`skillColdDays` / `skillDeadDays`，可配，对称 `wikiDeadKnowledgeGraceDays`）。
- **利用率（方法论侧）= 活技能数 / seeded 全集**（全局口径），与「方法论完整度」区分：前者是技能资产健康，后者是流程走通率。

### 4.3 方法论完整度漏斗（只读，substrate=work item，但不下钻）

- 用 `sdd_work_item_artifacts` 按 `work_item_id` 聚合 stageCodes（`codereview`→`review`，沿用日报口径），算**相邻阶段接续率**：到 design 的 / 到 proposal 的，到 task 的 / 到 design 的 …
- **与产出分析的物理隔离靠下钻边界，不靠数据源**：漏斗数据源可与产出分析同源，但本页**只给聚合比例 + 断崖位置，不可点进单个需求**；要看具体需求 → 出链 `/sdd/work-items`（带阶段过滤）。
- **可证伪**：构造 5 个需求只有 proposal、3 个走到 design、1 个到 code → 漏斗台阶 5→3→1，断崖在 design→code。

### 4.4 接续分布（技能侧独占能力，产出分析给不出）

- 在同一 `session_id` 内按 `event_time` 排序，取每次技能调用的**下一次技能调用的 semantic_code**，按当前技能聚合 Top 接续。
- 回答「proposal 之后团队实际最常去哪个技能」——真实工作流 vs 理想 SDD 流程的偏差，这是**主语=技能**才有的视角。
- 边界：跨 session 不接续；session 内最后一个技能无下一跳，计入「链路终点」。

### 4.5 产出转化（per 技能）

- 产出 artifact 数 = 该技能调用关联的 `work_item_id` 在 `sdd_work_item_artifacts` 里、`artifact_type` == 该技能对应阶段 的去重数（用 seed 的 `artifactFilenamePatterns`/阶段映射对齐）。
- 落地代码 = 该技能调用经 `skill_usage_id → sdd_interaction_tool_calls` 命中业务代码仓库读写的工具调用数（复用日报 `codeImpact` 过滤条件，§3.6）。
- 诚实标注：落地代码**不反推 work_item**、不计入覆盖需求（沿用日报既有局限，facts §4 第 5 条）。

### 4.6 保鲜（freshness）

- 全部累计/周期口径，不吃全局 timeRange 的"死控件"问题（对齐三页已弃 timeRange 的整改方向）。趋势图自带粒度控件。
- 活/冷/死、漏斗均为请求时现算（现有表聚合 + 进程内短 TTL 缓存可选），天然保鲜。

## 5. 后端设计（server，sdd 模块内，只读 / 零迁移）

### 5.1 接口（contract 新增 / 扩展）

1. `GET /api/sdd/skills/methodology`（新增）——① 完整度 KPI + ② 漏斗
   ```ts
   {
     funnel: Array<{ stage: 'proposal'|'design'|'task'|'code'|'review', workItems: number, fromPrevRate: number|null }>,
     completionRate: number,        // proposal 起步 → code 落地 占比
     biggestDropStage: string|null, // 断崖台阶
   }
   ```
2. `GET /api/sdd/skills/health`（新增）——④ 表的活/冷/死 + ① 死技能 KPI
   ```ts
   {
     totals: { seededSkills, liveSkills, coldSkills, deadSkills, orphanRawSkills },
     skills: Array<{ semanticCode, displayName, status:'live'|'cold'|'dead',
                     usageCount, userCount, workItemCount, lastSeenAt,
                     topNextSkill: string|null, artifactCount, codeLandingCount }>,
   }
   ```
   分母含 seeded 全集；从无调用的技能 `usageCount:0, status:'dead'`。
3. `GET /api/sdd/skills/:semanticCode/profile`（新增）——单技能画像抽屉
   ```ts
   {
     trend: Array<{ bucket, count }>,
     topUsers: Array<{ userId, count }>,
     nextSkills: Array<{ semanticCode, displayName, count }>,  // 接续分布
     transition: { totalNextHops, terminalCount },
     output: { artifactCount, codeLandingCount },
     debug: { rawSkillNames: string[], matchedBy: string },     // 配对自检收敛到这里
   }
   ```
- **复用**：现有 `skills/analytics`（KPI 三项）、`skills/timeseries`（趋势）、`usage-summary`（已有分页表，可作 ④ 的底，扩 status/topNextSkill/转化列）、`skill-usages`（抽屉最近调用）。优先扩 `usage-summary` 行 schema 而非另起炉灶，避免重复建设。

### 5.2 配置（config.default.ts，全部有默认）

```ts
skillColdDays: Number(process.env.SKILL_COLD_DAYS ?? 7),   // 新增：活→冷
skillDeadDays: Number(process.env.SKILL_DEAD_DAYS ?? 30),  // 新增：冷→死
```

## 6. 前端结构（web）

```
web/src/pages/sdd/skills/
  SkillsPage.tsx              重写：4-section（漏斗 hero + 技能主轴）
  hooks/
    useSkillAnalytics.ts      保留（KPI 三项）
    useSkillTimeseries.ts     保留（趋势）
    useSddUsageSummary.ts     保留并扩（④ 表加 status/接续/转化列）
    useSkillUsages.ts         保留（抽屉最近调用）
    useSkillMethodology.ts    新增（漏斗）
    useSkillHealth.ts         新增（活冷死 + 死技能 KPI）
    useSkillProfile.ts        新增（单技能画像）
  components/
    TrendChart.tsx            保留（趋势改堆叠 by 阶段）
    MethodologyFunnel.tsx     新增（② 漏斗，只读，断崖高亮）
    SkillHealthTable.tsx      新增（④ 一览，活冷死徽标 + 分组 SegmentedControl）
    SkillProfileDrawer.tsx    新增（基于 RowInspectorDrawer 的单技能画像）
```

**复用**：`RowInspectorDrawer`、`BarList`、`SegmentedControl`/`SoftBadge`/`StatusBadge`、`Pagination`、`DataTable`、`formatInteger/formatPercent/formatRelativeTime`、产出/知识库页的 KPI(`CARD_STYLE`/`ICON_BOX`)与标杆 Top3 视觉词汇。

**删除（本页私有、随旧叙事下线）**：`CallQualityFunnel`（四级配对漏斗 → 被方法论漏斗取代）、`MatchHealthDonut`、`UnmatchedTopList`、`VersionMiniBar`、`DetailTableToolbar` 等旧 5-26 重构留下的组件（以仓库实际存在为准，落地时 grep 确认无其它消费方再删）。
**保留**：`TrendChart` 与四个查询 hook。
**收敛不删除能力**：语义配对率/未匹配/原始技能名 → 移入 `SkillProfileDrawer` 的「调试角」，仍可追查，只是退出主视觉。

## 7. 其余三视角的安放（低优先级，不抢主轴）

| 视角 | 安放位置 | 形态 |
|---|---|---|
| ROI / AI 杠杆 | ④ 表「产出转化」列 + 抽屉 `output` | 每技能 artifact 数 / 落地代码数 |
| 人方法论成熟度 | 抽屉 `topUsers` + 出链用户分析 | 谁在用这个技能 Top N；深挖跳用户分析 |
| 技能资产健康 | ① 死技能 KPI + ④ 活/冷/死徽标 | 三态，本就是主结构一部分 |

## 8. 链路接入（技能 → 链，但不喧宾夺主）

- 漏斗台阶 → 出链 `/sdd/work-items?stage=X`（看该阶段的需求，去产出分析）。
- 抽屉 `topUsers` → 出链 `/sdd/users/:id`（去用户分析）。
- 主线始终是技能主语；所有需求级、用户级深挖都是**出链**，不在本页展开。

## 9. 验证清单（可证伪，dev 模式）

1. **活/冷/死可证伪**：seeded 一个从没人用的技能 → `status:'dead', usageCount:0` 且计入死技能 KPI；构造一个近 3 天有调用的 → `live`；空集能区分「无数据」与「全死」。
2. **漏斗可证伪**：构造 5 需求仅 proposal、3 到 design、1 到 code → 台阶 5/3/1、断崖 design→code、completionRate=1/5。
3. **接续可证伪**：同 session 内 proposal→design→code 三连 → proposal 的 `topNextSkill='design'`；跨 session 不串。
4. **产出转化可证伪**：某技能关联 work_item 有 2 篇对应阶段 artifact、3 次业务仓库写 → `artifactCount:2, codeLandingCount:3`；落地不进覆盖需求。
5. **隔离铁律**：技能表/抽屉**无任何**直达「需求详情」的入口；需求只在出链按钮出现。
6. **配对自检收敛**：主视觉无「有效配对率」；抽屉调试角仍能看到 `rawSkillNames`/`matchedBy`。
7. `pnpm typecheck` + `pnpm build`；旧路径残留扫描（CLAUDE.md 指定 rg）。

## 10. 变更前风险自检（命中 API contract / 共享组件 / env → 显式说明）

1. **复用**：KPI 三项/趋势/分页表/最近调用全复用现有四个接口与 hook；漏斗 stageCodes 与落地 codeImpact 复用日报已验证口径（facts §3.4/§3.6）；下钻抽屉复用 `RowInspectorDrawer`。仅「活/冷/死全集分母」「接续分布」「单技能画像」是现在没有、且技能主语必须的新关节，非过早抽象。
2. **抽象**：新组件留在 `skills/`，不跨页抽象；不为单次造通用漏斗组件（`MethodologyFunnel` 仅本页用）。
3. **破坏性**：纯新增**只读**接口 + 现有表聚合，**无迁移/无新表/无新列**；`usage-summary` 行 schema 为**加法**扩列（status/topNextSkill/转化），前后端同步升级，旧消费方（若有）字段不删；新增 env 全有默认。
4. **影响**：技能分析页整体重写；`usage-summary` 被本页消费（扩列加法不破坏）；新增「阶段→需求」「用户→用户分析」出链复用既有路由；不触碰用户/产出/知识库三页数据层。

## 11. 已知局限

- 漏斗 substrate 与产出分析同源，差异仅在主语与下钻边界——靠 §1.1 铁律与 §9.5 验证守住，不靠数据隔离。
- 接续分布依赖 `session_id` 质量；session 缺失的调用不计入接续。
- 落地代码不反推 work_item，产出转化的「落地」与「覆盖需求」是两个口径，UI 需诚实区分。
- 活/冷/死的分母依赖 seed 全集保鲜；新增 SDD 技能未 seed 时会落进 orphan 调试角而非死技能。

## 12. 文档保鲜

落地同步更新：`docs/api-contract.md`（methodology / health / profile 三接口 + usage-summary 扩列 + 两个 env）、`docs/database-model.md`（无表变更，注明技能资产/漏斗/接续口径来自现有表聚合 + 活冷死分母取 seed 全集）、`README.md`（如涉及新 env）。旧文档 `docs/design-skills-redesign.md` 标注被本文取代。
