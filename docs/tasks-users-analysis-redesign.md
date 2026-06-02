# 实施任务：用户分析重构（主语=人 · 个人画像深下钻）

状态：待执行
日期：2026-06-02
设计依据（**唯一事实源，先读**）：`docs/design-users-analysis-redesign.md`
可视化示意（交互/布局/动效以此为准）：`docs/design-users-analysis-redesign.html`
口径依赖：`docs/facts-daily-report.md` §3.6（codeImpact 代码落地）、`docs/design-work-item-chain-drilldown.md`（artifact writes 时间线 + 交互全文复用）

> **全局护栏（每个任务都适用，违反即返工）**
> 1. **零迁移**：不新增 DB 表 / 列 / 索引，不改 worker / 采集 / outbox。全部现有表只读聚合。
> 2. **下钻铁律**：用户分析下钻终点只能是「人」。需求 / 技能 / 知识一律**出链**（跳对应 tab），本页**不就地展开**它们的详情。
> 3. **复用优先**：动手前先 grep，确认不是重造已有能力（详见各任务「复用」清单）。
> 4. **ROI 口径诚实**：代码落地**不反推 work_item、不计入覆盖需求**（沿用 facts §4 第 5 条），UI 必须分列。
> 5. **验证在 dev 模式**（`pnpm dev`），不在 start；构造**可证伪**查询（空集要能区分「修好+无数据」与「没修好+错配」）。
> 6. **中文 commit**（subject + body）。
> 7. 顺序：**后端先行**（T1→T2→T3），前端后（T4→T5→T6），最后全量验证 + 文档保鲜（T7）。

---

## T1：contract 扩展（packages/api）

**文件**：`packages/api/src/contracts/sdd.contract.ts`

1a. 扩 `SddUserItemSchema`（**加法**，现有字段不删；现有唯一消费方是用户分析页）：
```ts
// 追加：
status: z.enum(['live', 'cold', 'churn']),
isNew: z.boolean(),               // first_seen_at 近 14 天
artifactCount: z.number(),
codeWriteCount: z.number(),
codeReadCount: z.number(),
rampDays: z.number().nullable(),  // 走通 4 阶段用了几天；未走通为 null
```

1b. 新增 `SddUserDetailSchema`（个人画像页），对称 `SddWorkItemDetailSchema`：
```ts
export const SddUserDetailSchema = z.object({
  user: SddUserItemSchema,
  summary: z.object({
    workItemCount: z.number(), artifactCount: z.number(),
    turnCount: z.number(), sessionCount: z.number(),
    wikiRecallCount: z.number(), codeWriteCount: z.number(), codeReadCount: z.number(),
  }),
  maturity: z.object({
    stages: z.array(z.object({ stage: z.string(), firstReachedAt: ISODateTimeSchema.nullable() })),
    completionRate: z.number(),
    rampDays: z.number().nullable(),
  }),
  workItems: z.array(z.object({
    workItemId: IdSchema, title: z.string(),
    stageCodes: z.array(z.string()), lastActivityAt: ISODateTimeSchema.nullable(),
  })),
});
export type SddUserDetail = z.infer<typeof SddUserDetailSchema>;
```

**验收**：`pnpm --filter @sdd-telemetry/api build` 通过；类型从 contract 推导，不手写。

---

## T2：后端聚合 + 新接口（server）

**文件**：`server/src/modules/sdd/sdd-query.repository.ts`、`sdd-query.service.ts`、`sdd.controller.ts`、`server/src/config/config.default.ts`（路径以实际为准）

2a. **config 两个 env（全有默认，对称 skill/wiki 死亡阈值）**：
```ts
userColdDays:  Number(process.env.USER_COLD_DAYS ?? 7),
userChurnDays: Number(process.env.USER_CHURN_DAYS ?? 30),
```

2b. **扩 `listUsers()` 行**（repository ~646 + service ~662 的 `UserRow → SddUserItem` 映射）：
- `status`：按 `last_seen_at` 距今 ≤ `userColdDays` = `live`；≤ `userChurnDays` = `cold`；否则 / 从无活动 = `churn`。
- `isNew`：`first_seen_at` 近 14 天。
- `artifactCount`：该用户关联 `work_item_id` 的去重 artifact 数（`sdd_work_item_artifacts`）。
- `codeWriteCount` / `codeReadCount`：**复用 facts §3.6 `codeImpact` 过滤谓词**（`listCodeImpactRows` / `summarizeCodeImpactRows`），按 user 分组（`sdd_interaction_tool_calls` → interaction/skill_usage → `user_id`）。
- `rampDays`：该用户命中第 4 个 distinct SDD 阶段的 `event_time` − `first_seen_at`；未走通 4 阶段为 `null`。
- **性能护栏**：这些聚合**不要**全塞进主 `listUsers()` 的单条 SQL 拖垮全列表（200 用户量级）。用独立子查询合流，ROI/ramp 列可加进程内短 TTL 缓存。列为验证项（§T3.4）。

2c. **新增 `getUserDetail(userId)`**（service）+ repository 查询，对称 `getWorkItemDetail`：
- 返回 `SddUserDetail`（header summary + maturity.stages 各阶段首达时间 + workItems 列表）。
- `maturity.stages.firstReachedAt`：`SELECT semantic_code, MIN(event_time) ... WHERE user_id=? GROUP BY semantic_code`（join `sdd_skill_semantics`）。
- `workItems`：该用户参与/产出的 work items（经 `sdd_skill_usages.work_item_id` 或 `sdd_work_item_artifacts`），含 `stageCodes` 与 `lastActivityAt`。

2d. **controller 新增路由** `GET /api/sdd/users/:userId`（对称 `@Get('/work-items/:workItemId')` ~295），调 `getUserDetail`，404 时友好报错。

> **不新增全文 / 时间线接口**：个人画像右栏的活动时间线复用现成端点——
> `GET /api/sdd/skill-usages?userId=`（已支持 userId）、`GET /api/sdd/work-items/:id/artifacts/:aid/writes`（已落地）、`GET /api/sdd/wiki-recalls/list?userId=`（现页已用）、节点全文 `GET /api/sdd/interactions/:interactionId`（已返回 prompt/response 全文 + tool-calls）。

**复用**：`getWorkItemDetail` / `listArtifactWrites` 查询风格、codeImpact 谓词、现有 `listUsers` 骨架。
**验收**：`pnpm --filter @sdd-telemetry/server build` 通过。

---

## T3：后端验证（dev 模式，可证伪）

`pnpm dev`（或 `dev:server`）后用 curl 验证：

1. **三态可证伪**：构造 40 天前接入、近 35 天无活动 → `status:'churn'`；近 3 天有活动 → `live`；7–30 天 → `cold`。空集能区分「无成员」与「全 churn」。
2. **ROI 可证伪**：某用户 2 篇 artifact + 3 次业务仓库写 → `artifactCount:2, codeWriteCount:3`；确认落地**不进**覆盖需求。
3. **爬坡可证伪**：构造 D0/D3/D5/D12 四阶段首达的用户 → `getUserDetail` 的 `maturity.stages` 时间正确、`rampDays:12`；只有 proposal 的 → `completionRate` 低、`rampDays:null`。
4. **性能**：`/api/sdd/users` 在现有数据量响应可接受（无明显退化对比改造前）。
5. `GET /api/sdd/users/:id` 返回结构符合 `SddUserDetailSchema`；不存在的 id 友好 404。

---

## T4：前端列表页改造（web）

**文件**：`web/src/pages/sdd/users/UsersPage.tsx`、`useSddUsers.ts`（接扩后行 schema）

对照示意 HTML `#screen-list`：
- **① KPI**：团队规模加**活/冷/流失三态条**；流失成员 KPI（red）；保留近 7 天活跃、平均成熟度。
- **② 接入健康 → 升级掉队雷达**：列「曾活跃、近 `userChurnDays` 天掉零」成员，点击跳 `/sdd/users/:id`。
- **能力矩阵 / bus-factor**：四阶段「能做的人数」热力条，distinct 人数 ≤2 标单点风险（阈值用常量，不写死语义在通用组件）。
- **③ 标杆成员**：卡片加 ROI（artifact / 落地）+「看他怎么干的 →」入口（跳画像页）。
- **④ 成员一览**：行加三态徽标 + 成熟度点阵 + 产出转化列；**行点击从「开抽屉」改为跳 `/sdd/users/:id`**（路由跳转）。

**复用**：`StatusBadge`/`UserAvatar`（现页已有）、`Pagination`、`useDebouncedValue`、`useClientPagination`、`formatInteger/formatRelativeTime/formatTime`、产出分析 `CARD_STYLE`/`ICON_BOX` 视觉。
**清理**：现页 `UserWikiRecallPanel`（抽屉内 wiki 召回）能力并入画像页时间线；`RowInspectorDrawer` 的深挖职责移除（如确认无其它消费方，按 CLAUDE.md「孤儿在对话里提、不顺手删」处理）。

**验收**：列表页四区按示意呈现；行点击跳画像页；三态/ROI/成熟度列数据来自扩后接口。

---

## T5：个人画像页（web，基线 A 核心）

**新增文件**（对照示意 HTML `#screen-profile` + 设计 §6）：
```
web/src/pages/sdd/users/
  UserProfilePage.tsx          两栏：header(含采用爬坡) + 左需求 + 右时间线
  useUserProfile.ts            GET /api/sdd/users/:id
  useUserActivity.ts           合并 skill-usages/artifact-writes/wiki-recalls 时间线
  components/UserWorkItemList.tsx   左栏需求（行出链 /work-items/:id）
  components/UserActivityTimeline.tsx 右栏时间线（节点 → 全文抽屉）
  components/AdoptionRamp.tsx        采用爬坡带
  components/CapabilityMatrix.tsx    能力矩阵（列表页用，可放此或 components）
```

- **路由**：`web/src/router.tsx` 新增 `sdd/users/:id`，懒加载（对照 `sdd/work-items/:id` ~61 行写法）。
- **左栏**：他的需求列表，选中高亮；行点击出链 `/sdd/work-items/:id`，**不在本页展开需求详情**。
- **右栏**：选中需求的活动时间线（写入/技能/wiki 节点按时间），顶部方法论完整度徽标；节点点击 → 抽屉渲染 **prompt + response 全文 + 工具时间线**。
- **降级**：事件层过期 / 未配置 requirements 的成员，时间线空态友好提示（示意里 liu.tao/zhou.an 的呈现）。

**复用（关键，避免重写）**：
- 全文抽屉 + 工具时间线：复用产出分析的 `TurnDetailDrawer`（薄壳 → 交互明细详情组件）。若该详情组件仍耦合在 `InteractionsPage`，按 `design-work-item-chain-drilldown.md` §7 抽成可独立渲染组件（本页是第三处消费）。
- 生成时间线节点：复用 `useArtifactWrites` / `ArtifactWriteTimeline` 范式。
- `RowInspectorDrawer`、`BarList`、`formatXxx`、阶段色 token。

**验收**：列表行 → 画像页 → 左栏选需求 → 右栏时间线 → 点节点出全文，链路无断点；出链跳三页正确；ESC 关抽屉。

---

## T6：链路接入（出链闭环）

- 画像页左栏需求 → `/sdd/work-items/:id`；技能节点 → 技能分析；wiki 节点 → 知识库分析。
- 反向：产出/技能/知识库三页出现「用户」处，回跳 `/sdd/users/:id`（本任务只确保用户分析侧出链；反向回跳如不在三页现有实现内，记 TODO，不顺手改三页）。

**验收**：下钻铁律自查——画像页**无任何**就地展开需求/技能详情的入口，全是出链按钮。

---

## T7：全量验证 + 文档保鲜

1. `pnpm typecheck` + `pnpm build` 全绿。
2. 旧路径残留扫描（CLAUDE.md 指定 rg 命令）。
3. 走一遍设计 §9 验证清单（三态 / ROI / 爬坡 / bus-factor / 铁律 / 链路）。
4. **文档保鲜**：更新 `docs/api-contract.md`（`GET /users/:id` + `SddUserItemSchema` 扩字段 + 两个 env）、`docs/database-model.md`（无表变更，注明人才/采用/ROI 口径来自现有表聚合 + 三态阈值对称）、`README.md`（如涉新 env）；本设计文档 §状态 标注「已实施」。

---

## 变更前风险自检（命中 API contract / 共享组件 / env，逐项见设计 §10）

- **复用**：时间线/全文全复用 4 个现成端点 + 交互明细详情组件；ROI 复用 codeImpact 谓词；下钻交互复用产出分析两栏范式。仅 `GET /users/:id` 聚合与三态/爬坡/ROI 列是新关节。
- **抽象**：新组件留在 `users/`，不跨页抽象；`CapabilityMatrix` 仅本页用。
- **破坏性**：纯新增只读接口 + 现有表聚合，无迁移/表/列；`SddUserItemSchema` 加法扩字段前后端同步升级；行点击语义改路由跳转（用户路径变化，与产出分析一致）。
- **影响**：列表页小改 + 新增画像路由；`SddUserItemSchema` 仅本页消费；交互明细详情组件第三处复用需回归；`listUsers()` 聚合关注全列表性能。
