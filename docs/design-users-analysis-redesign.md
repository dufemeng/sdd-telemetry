# 用户分析重构设计（主语=人 · 个人画像深下钻 · 活/冷/流失 · 采用成熟度/ROI）

状态：待评审
日期：2026-06-02
产出方式：`/plan-ceo-review`（老板视角，SELECTIVE EXPANSION：基线=个人画像页，再 cherry-pick 四个人维度独占视角）
关联代码：`web/src/pages/sdd/users/*`、`server/src/modules/sdd/*`、`packages/api/src/contracts/sdd.contract.ts`
姊妹文档：`docs/design-work-item-chain-drilldown.md`（产出分析下钻）、`docs/design-wiki-recalls-redesign.md`（知识库资产）、`docs/design-skills-analysis-redesign.md`（技能/方法论主语）

## 1. 背景与目标

`/sdd/work-items`（产出分析）与 `/sdd/wiki-recalls`（知识库分析）已经做到很深的研究纵深，老板认可。它们各自建立了一条**深下钻的主轴**，能从聚合指标钻到地面真相：

- 产出分析：`需求 → SDD 阶段 → artifacts → 生成时间线 → prompt 全文`。
- 知识库分析：`知识库(业务线) → 业务域 → 文档 → 正文 Modal` + 覆盖率/冷热/死知识三态。

`/sdd/users`（用户分析）的处境很特殊：它**结构上已经是 4-section 老板视角**（KPI → 漏斗+健康 → 标杆 Top3 → 一览+抽屉），事实上是另外几页抄它（wiki 文档明说「`/sdd/users`、`/sdd/skills`、`/sdd/work-items` 已统一为老板视角」）。**但它停在了壳，被反超得最浅**：

- **下钻终点是一张扁平字段卡**（`RowInspectorDrawer`：用户 ID / 安装 ID / 机器 / 路径 / 计数 / 时间戳）+ 20 行近期 wiki 召回。点进一个人，看到的是**元数据**，不是**这个人干了什么**。
- **人没被接进链路**：全页只有 1 个「查看排行」弱链，没有「这个人的需求 / 技能 / 知识消费」的出链。
- **active/new/silent 有三态，但不是脊柱**：没回答「采用是在涨还是在烂」这个经营问题。

### 1.1 关键定调：人是唯一触达所有其它主语的主语

四个 tab 各独占一个主语（技能分析 §1.1）：

| Tab | 主语 | 回答 |
|---|---|---|
| **用户分析（本次）** | **人** | 谁活跃、谁掌动产出、谁掉队、新人多快上手 |
| 产出分析 | 需求 / 产物 | 产出了什么、落地没 |
| 知识库分析 | 知识资产 | 沉淀的知识健不健康 |
| 技能分析 | 技能 / 方法论本身 | 这套生产方式被用得怎么样 |

**人产出需求、人调用技能、人消费知识**——人是唯一触达所有其它主语的主语，所以「个人画像」本该是全平台**信息最富**的下钻，现在却是**最空的**。这正是研究价值缺口的根因：**用户分析把人当花名册条目，没当成可研究的对象。**

**下钻铁律（对称技能分析 §1.1，划清边界、防止沦为产出分析换皮）**：

> **用户分析的下钻终点只能是「人」。需求只出链跳 `/sdd/work-items/:id`，技能只出链跳技能分析，知识只出链跳知识库分析。人画像里展示的是「这个人在这条链上的切片」，不在本页重做需求详情 / 技能详情。**

**目标**：把用户分析重构成**「人才 / 采用资产」视角**的老板总览 + **个人画像深下钻页**——回答「团队在多大程度上真的用起了 SDD、谁是标杆值得复制、谁在掉队、新人爬坡多快、谁用 AI 撬动了最多真产出」，并能从一个人钻到他亲手写的需求、文档、那一次 prompt 的原话。

## 2. 范围

**做：**
- 列表页保留 4-section，做**口径与叙事对齐**：① KPI 加采用成熟度 / 流失；② 接入健康升级为**采用健康 + 掉队雷达**；③ 标杆卡加 ROI + 「看他怎么干的」入口；④ 一览行加三态徽标 / ROI / 成熟度列。
- **新增独立个人画像页 `/sdd/users/:id`（懒加载，基线 A）**：单列（互动记录 10 条预览 + 最近执行入口 + 关联交付单元摘要卡），节点回溯 prompt 全文（复用执行快照）。**行点击从「开抽屉」改为「跳画像页」**，对齐产出分析交互。
- **活 / 冷 / 流失三态 + 掉队雷达**（对称死知识/死技能口径）。
- **个人 ROI / AI 杠杆**：每人 artifact 产出 + 代码落地（复用日报 `codeImpact` 口径）。
- **采用成熟度 + 爬坡曲线**：首次接入 → 走到 4/4 用了多少天；新人 vs 老手对比。
- **人 × 阶段能力矩阵 / bus-factor**：谁能做哪个阶段 + 单点风险（如只有 1 人会 code-review）。

**不做（YAGNI）：**
- 不在本页做需求详情 / 技能详情下钻（属另外两页），一律出链。
- 不新增 DB 表 / 列 / 迁移（全部用现有表聚合）。
- 不改采集、不改 worker、不改 outbox 语义。
- 不做跨用户对比矩阵的重可视化（能力矩阵用轻量热力条，不做大图）。
- 不还原文档磁盘最终正文（沿用产出分析「展示生成过程、不复显本地文件」的解耦立场）。
- 不做成本（costUsd）维度（数据有，留后续）。

## 3. 信息架构与页面结构

### 3.1 列表页 `/sdd/users`（4-section，保留 + 小改）

```
① 经营指标（4 KPI · 累计/周期对比）
   团队规模(活/冷/流失分解) | 近7天活跃 | 平均采用成熟度(进度条) | 流失成员 N⚠
② 采用漏斗(左·SDD 链路覆盖, 保留) + 采用健康/掉队雷达(右·升级原"接入健康")
   掉队雷达 = 曾活跃、近 N 天掉零的成员预警（采用侵蚀信号）
③ 标杆成员 Top3（沿用排名色条+角标）
   每卡：工作项 · 成熟度 N/4 · 产出转化(artifact/落地代码) · [看他怎么干的→ /users/:id]
④ 成员一览  [筛选: 全部 | 活 | 冷 | 流失 | 新成员]  [搜索]
   行常驻 活/冷/流失 徽标 · SDD 成熟度 · 工作项 · 产出转化 · 接入时长 · 最近活跃
   点行 → 跳 /sdd/users/:id（个人画像，不再开扁平抽屉）
```

### 3.2 个人画像页 `/sdd/users/:id`（单列 IA：互动预览 + 最近执行入口 + 交付单元摘要卡）

```
/sdd/users/:id   个人画像
┌───────────────────────────────────────────────────────────────┐
│ ← 用户分析   张三 · 活跃 · 接入 42 天 · 成熟度 4/4               │
│ 需求 8 · 文档 23 · 124 turns · 跨 9 session · wiki 96 · 落地 31  │
├───────────────────────────────────────────────────────────────┤
│ 互动记录（89）                          [最近一次执行]          │
│ ● 最近 10 条预览（不渲染全部，避免首屏超长）                     │
│ 查看完整记录（89 条）→             （跳 /sdd/users/:id/activity）│
├───────────────────────────────────────────────────────────────┤
│ 关联交付单元（2）                                                │
│ ┌──────────────────────────────────────┐ ┌─────────────────────┐│
│ │ 2026-05-28-add-delayed-debit       › │ │ 2026-05-27-...     ││
│ │ 文档 1 · 0 turns · wiki 0 · 1 人     │ │ ...                 ││
│ └──────────────────────────────────────┘ └─────────────────────┘│
│ （点击卡片进 /sdd/work-items/:id）                               │
└───────────────────────────────────────────────────────────────┘
出链：交付单元卡片 → /work-items/:id ；互动节点 → 执行快照；技能 → 技能分析
```

- **互动记录（预览 + 入口，不从属交付单元）**：用户维度的独立执行史，合并该用户的技能调用 / artifact 写入 / wiki 召回 / 代码活动，按时间倒序排。**不从属任何交付单元，不提供「按交付单元过滤」**——互动与交付单元是两个独立集合，只有部分互动恰好关联某个交付单元。本页只渲染**最近 10 条**作为预览，底部「查看完整记录 →」跳内页 `/sdd/users/:id/activity`。顶部「最近一次执行」直接打开最新一条 interaction 的执行快照。
- **关联交付单元（摘要卡，非纯链接）**：该用户参与/产出的 work items。**不再是只有标题的跳转列表**——每张卡片直接展示该交付单元的内容摘要（文档数 / turns / wiki 读取 / 参与人 + 阶段点 + 最近活动时间），让用户在用户页就能看到「这个人产出了什么、做到哪一步」，点击卡片才进 `/sdd/work-items/:id` 看完整详情。这避免「用户页 → 链接 → 详情页」的空跳转中间层。
- **配色语义**：成员状态 活=绿 / 冷=灰 / 流失=红 / 新成员=蓝（沿用现页 + 对称死知识/死技能）；成熟度进度条按阈值变色。

> **IA 纠错记录**：
> - 2026-06-21：早期版本曾规定「左栏需求 / 右栏选中需求的活动时间线」两栏主从结构。实测会让用户误读为「交付单元是互动记录的父级/筛选器」，且 `deliveryUnitId=null` 的互动被隐藏。已改为单列。
> - 2026-06-22：互动记录从「手风琴折叠整段」改为「10 条预览 + 内页完整列表」。预览保留主入口的可见性，内页 `/sdd/users/:id/activity` 承载完整历史。关联交付单元从「纯跳转链接列表」升级为「摘要卡」，去掉无信息密度的中间跳转层。

## 4. 数据来源与口径（全部现有表聚合，零迁移）

### 4.1 现有数据（只读）

- `sdd_users`：`user_name`、`install_id`、`machine_name`、`requirements_root_path`、`wiki_root_path`、`first_seen_at`、`last_seen_at`。
- `sdd_skill_usages`：`user_id`、`semantic_id`、`session_id`、`prompt_id`、`work_item_id`、`event_time`。→ 谁在用、覆盖需求、采用成熟度/爬坡、活冷流失。
- `sdd_skill_semantics`：`semantic_code`、`display_name`。→ 阶段标签 + 能力矩阵列。
- `sdd_work_item_artifacts` / `sdd_work_item_artifact_writes`：→ 他的需求、文档数、生成时间线（已落地，含 prompt 回溯）。
- `sdd_wiki_recalls`：`user_id`、`wiki_relative_path`、`action_type`、`event_time`。→ 知识消费时间线（现页 `useWikiRecallList(userId)` 已在用）。
- `sdd_interaction_tool_calls`：→ 个人 ROI 代码落地（复用日报 `codeImpact` 口径，facts §3.6）。

复用现有接口：`/api/sdd/users`（扩行）、`/api/sdd/skill-usages?userId=`、`/api/sdd/wiki-recalls/list?userId=`、`/api/sdd/work-items/:id`、`/api/sdd/work-items/:id/artifacts/:aid/writes`、`/api/sdd/interactions/:id`（全文）。

### 4.2 活 / 冷 / 流失三态 + 掉队雷达（对称死知识/死技能）

匹配键 = `user_id`，分母 = `sdd_users` 全集：

| 集合 | 含义 | 呈现 |
|---|---|---|
| `last_seen_at` 近 N 天内 | **活跃** | 绿徽标 |
| 近 N..M 天有活动 | **转冷** | 灰徽标 |
| `last_seen_at` > M 天，或从无活动 | **流失** | 红徽标，计入 ① 流失 KPI |
| `first_seen_at` 近 14 天 | **新成员** | 蓝徽标（与三态正交，叠加显示） |

- 阈值 N 默认 **7 天**、M 默认 **30 天**（`userColdDays` / `userChurnDays`，可配，对称 `skillColdDays`/`skillDeadDays`/`wikiDeadKnowledgeGraceDays`）。
- **掉队雷达** = 「`first_seen_at` 距今 > 30 天（非新人）且曾有 ≥1 次活动，但近 M 天掉零」的成员集——采用侵蚀的早期信号，区别于「从没接入成功」。
- **可证伪**：构造一个 40 天前接入、近 35 天无活动的用户 → `churn` 且进掉队雷达；近 3 天有活动的 → `live`；空集能区分「无成员」与「全流失」。

### 4.3 个人 ROI / AI 杠杆（复用日报 codeImpact，诚实标注）

- 每人：`artifactCount`（关联 work_item 的去重 artifact 数）+ `codeWriteCount` / `codeReadCount`（该用户 SDD 会话里业务代码仓库读写的工具调用数，复用 facts §3.6 过滤条件）。
- **诚实标注（沿用日报既有局限 facts §4 第 5 条）**：代码落地**不反推 `work_item_id`**、不计入「覆盖需求」；ROI 的「落地」与「覆盖需求」是两个口径，UI 需分列、不混淆。
- **可证伪**：某用户 2 篇 artifact + 3 次业务仓库写 → `artifactCount:2, codeWriteCount:3`；落地不进覆盖需求。

### 4.4 采用成熟度 + 爬坡曲线（人维度独占）

- **成熟度** = 该用户 distinct 命中的 SDD 阶段数 / 4（现页 `semanticStages` 已有，列表页够用）。
- **爬坡** = 每阶段**首次**命中时间：`SELECT user_id, semantic_code, MIN(event_time) FROM sdd_skill_usages JOIN sdd_skill_semantics GROUP BY user_id, semantic_code`。通链天数 = 命中第 4 个阶段时间 − `first_seen_at`。
- **新人 vs 老手**：按 `first_seen_at` 分组对比中位爬坡天数（画像页 header 一行结论，不做大图）。
- **可证伪**：构造 D0 proposal、D3 design、D5 task、D12 code 的用户 → 爬坡 `[0,3,5,12]`、通链 12 天；只有 proposal 的 → 成熟度 1/4、无通链天数。

### 4.5 人 × 阶段能力矩阵 / bus-factor（可选切片，列表页 ④ 之上的轻量热力）

- 阶段 × 「会做该阶段的人数」：`COUNT(DISTINCT user_id)` per `semantic_code`（阶段维度）。
- **bus-factor 预警**：某阶段 distinct 人数 ≤ 1 → 单点风险高亮（如只有 1 人会 code-review）。
- 形态：列表页顶部或 ② 区一条**轻量热力条**（每阶段一格，色深=人数，≤1 人描警示边），不做交叉大矩阵。
- **可证伪**：seed 一个只有 1 人用过 codereview 的数据 → 该阶段标 bus-factor=1 警示。

### 4.6 保鲜（freshness）

- 全部累计 / 周期口径，不吃全局 timeRange「死控件」（对齐三页已弃 timeRange 的整改方向）。活动时间线自带粒度。
- 活/冷/流失、成熟度、ROI 均为请求时现算（现有表聚合 + 进程内短 TTL 可选），天然保鲜。

## 5. 后端设计（server，sdd 模块内，只读 / 零迁移）

### 5.1 接口（contract 新增 / 扩展）

1. `GET /api/sdd/users`（**扩行 schema**，加法）——③④① 用：
   `SddUserItemSchema` 追加 `status: 'live'|'cold'|'churn'`、`isNew: boolean`、`artifactCount`、`codeWriteCount`、`codeReadCount`、`rampDays: number|null`（通链天数）。现有字段不删，前端旧消费方（仅本页）同步升级。

2. `GET /api/sdd/users/:id`（**新增**，对称 `getWorkItemDetail`）——个人画像 header + 左栏 + 成熟度：
   ```ts
   {
     user: SddUserItem,                          // 复用扩后的行 schema
     summary: { workItemCount, artifactCount, turnCount, sessionCount,
                wikiRecallCount, codeWriteCount, codeReadCount },
     maturity: { stages: Array<{ stage, firstReachedAt: ISO|null }>,
                 completionRate, rampDays: number|null },
     workItems: Array<{ workItemId, title, stageCodes: string[], lastActivityAt }>,
   }
   ```

3. **活动时间线复用现成端点，不新建全文接口**：
   - 技能调用：`GET /api/sdd/skill-usages?userId=:id`（已支持 `userId`）。
   - 文档写入：`GET /api/sdd/work-items/:id/artifacts/:aid/writes`（已落地，按需求维度；画像页从左栏选中需求进入）。
   - wiki 召回：`GET /api/sdd/wiki-recalls/list?userId=:id`（现页已用）。
   - 节点全文：`GET /api/sdd/interactions/:interactionId`（已返回 prompt/response 全文 + 工具时间线）。

> **正确性前提**：`status`/`rampDays`/ROI 的聚合若放进 `listUsers()` 会让全列表 SQL 变重——列为性能验证项（§9.6）。可在 repository 内用单独子查询合流，或对 ROI 列做进程内短 TTL 缓存。

### 5.2 配置（config.default.ts，全部有默认）

```ts
userColdDays:  Number(process.env.USER_COLD_DAYS ?? 7),    // 新增：活→冷
userChurnDays: Number(process.env.USER_CHURN_DAYS ?? 30),  // 新增：冷→流失
```

## 6. 前端结构（web）

```
web/src/pages/sdd/users/
  UsersPage.tsx              小改：④ 行点击改为跳 /users/:id；三态/ROI/成熟度列；
                             ② 接入健康升级掉队雷达；③ 标杆卡加 ROI + 入口
  UserProfilePage.tsx        新增：单列（互动记录 10 条预览 + 最近执行入口 + 关联交付单元摘要卡）
  UserActivityPage.tsx       新增：/sdd/users/:id/activity 完整互动记录内页
  useSddUsers.ts             保留（列表，接扩后行 schema）
  useUserProfile.ts          新增（GET /users/:id）
  useUserActivity.ts         新增（合并 skill-usages/writes/wiki-recalls 时间线，复用现有 hook）
  components/
    UserWorkItemList.tsx     关联交付单元摘要卡（文档数/turns/wiki/参与人 + 阶段点，点击进 /sdd/work-items/:id）
    UserActivityTimeline.tsx 活动时间线（节点 → 复用执行快照抽屉）
    AdoptionRamp.tsx         成熟度 / 爬坡带
    CapabilityMatrix.tsx     人×阶段能力热力条 + bus-factor（列表页用）
```

- 路由 `web/src/router.tsx` 新增 `sdd/users/:id`，懒加载（与 `work-items/:id` 同构）。
- **复用**：`RowInspectorDrawer`（画像页时间线节点抽屉，或直接复用产出分析的 `TurnDetailDrawer`）、交互明细详情组件（产出分析已抽出供复用，本页第三处消费）、`BarList`/`SegmentedControl`/`StatusBadge`/`Pagination`/`UserAvatar`、`formatInteger`/`formatRelativeTime`/`formatTime`、产出分析的 KPI(`CARD_STYLE`/`ICON_BOX`) 与标杆 Top3 视觉词汇、日报 `codeImpact` 展示词汇。
- **收敛**：现页 `UserWikiRecallPanel`（抽屉内 wiki 召回）能力并入画像页活动时间线，不再单列扁平抽屉。

## 7. 链路接入（孤儿 tab → 链，人作为入口主语）

用户分析作为「人」入口，正式接进 `prompt → skill → wiki → artifact`：

- 画像页**关联交付单元摘要卡** → 出链 `/sdd/work-items/:id`（人 → 需求方向）。
- 时间线**技能节点** → 出链技能分析（人 → 技能）。
- 时间线 **wiki 节点** → 出链知识库分析（人 → 知识资产）。
- 反向：产出分析 / 技能分析 / 知识库分析里凡出现「用户」处，均可回跳 `/sdd/users/:id`，形成闭环。主线始终是「人」主语，需求/技能/知识级深挖都是出链。

## 8. 弱依赖 / 降级矩阵

| 情况 | 表现 |
|---|---|
| 正常 | 全功能；画像页单列（互动记录预览 + 交付单元摘要卡）+ 成熟度 + ROI 正常 |
| `sdd_interaction_tool_calls` 无业务代码命中 | ROI 落地列显 0（非报错），artifact/覆盖需求照常 |
| 老用户（event 层已过期、artifact_writes 回填前） | 时间线偏空，只剩需求列表 + 汇总；新数据完整（沿用产出分析既有局限） |
| `requirements_root_path` 未配置 | 工作项识别失效 → 该用户 workItemCount 偏低，掉队雷达/接入诊断照旧提示 |

## 9. 验证清单（可证伪，dev 模式）

1. **三态可证伪**：40 天前接入、近 35 天无活动 → `churn` 且进掉队雷达；近 3 天有活动 → `live`；空集区分「无成员」与「全流失」。
2. **ROI 可证伪**：某用户 2 篇 artifact + 3 次业务仓库写 → `artifactCount:2, codeWriteCount:3`；落地不进覆盖需求。
3. **爬坡可证伪**：构造 D0/D3/D5/D12 四阶段首达 → 爬坡 `[0,3,5,12]`、通链 12 天；只有 proposal → 成熟度 1/4、无通链天数。
4. **bus-factor 可证伪**：seed 仅 1 人用过 codereview → 该阶段 bus-factor=1 警示。
5. **下钻铁律**：画像页**无任何**直达「需求详情 / 技能详情」内嵌展开；需求/技能/wiki 只在出链按钮出现。
6. **性能**：扩 `listUsers()` 后 `/api/sdd/users` 在 200 用户量级响应可接受；ROI/三态聚合不拖垮全列表（必要时子查询合流 + 短 TTL）。
7. **链路无断点**：列表行 → 画像页 → 左栏选需求 → 右栏时间线 → 点节点抽屉出 prompt 全文；出链跳三页正确。
8. `pnpm typecheck` + `pnpm build`；旧路径残留扫描（CLAUDE.md 指定 rg）。

## 10. 变更前风险自检（命中 API contract / 共享组件 / env / 跨端 → 显式说明）

1. **复用**：个人画像时间线全复用 `skill-usages?userId` / `artifacts/:aid/writes` / `wiki-recalls/list?userId` / `interactions/:id` 四个现成端点 + 交互明细详情组件，**不新建全文接口**；ROI 复用日报 `codeImpact` 已验证口径；下钻交互复用产出分析 `/work-items/:id` 两栏 + `TurnDetailDrawer` 范式。仅 `GET /users/:id` 聚合与三态/爬坡/ROI 列是「现在没有、且人主语必须」的新关节，非过早抽象。
2. **抽象**：新组件留在 `users/`，不跨页抽象；`CapabilityMatrix` 仅本页用，不做通用矩阵组件；交互明细详情组件是第三处复用（产出分析已抽出），不再新抽。
3. **破坏性**：纯新增**只读**接口 + 现有表聚合，**无迁移 / 无新表 / 无新列**；`SddUserItemSchema` 为**加法**扩字段（status/isNew/ROI/rampDays），前后端同步升级，唯一消费方是本页；新增 env 全有默认、缺失即降级；**行点击语义从「开抽屉」改为「跳路由」**是用户路径变化（§4 影响），但与产出分析一致、可预期。
4. **影响**：用户分析列表页小改 + 新增画像路由；`SddUserItemSchema` 仅本页消费（加法不破坏）；新增「人 → 需求/技能/知识」出链复用既有路由；产出分析的交互明细详情组件被第三处复用（需回归其渲染）；server 扩 `listUsers()` 聚合需关注全列表性能（§9.6）。不触碰 worker / 采集 / outbox。

## 11. 已知局限

- ROI 落地代码不反推 work_item，「落地」与「覆盖需求」两个口径，UI 须诚实分列（沿用日报局限）。
- 老用户时间线依赖 `sdd_work_item_artifact_writes` 回填窗口；回填前只剩需求列表 + 汇总。
- 爬坡天数依赖 `event_time` 质量；早于埋点上线的阶段首达时间不可得，标 `—`。
- 三态/掉队雷达依赖 `last_seen_at` 保鲜；OTel 链路中断会让在用成员误判为冷/流失（与现页「近 14 天未活跃」同源风险）。
- bus-factor 是阶段级粗粒度信号，不替代真正的能力评估。

## 12. 文档保鲜

落地同步更新：`docs/api-contract.md`（`GET /users/:id` 新接口 + `SddUserItemSchema` 扩字段 + 两个 env）、`docs/database-model.md`（无表变更，注明人才/采用/ROI 口径来自现有表聚合 + 三态阈值对称技能/知识库）、`README.md`（如涉及新 env）。落地后在本文 §状态 标注「已实施」。
