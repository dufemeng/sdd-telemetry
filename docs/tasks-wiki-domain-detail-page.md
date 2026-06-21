# 实施任务：知识库详情页（主语=知识资产 · 业务域深下钻 · 文档为脊柱）

状态：已废弃（domain/axis/system 与 filesystem scan 机制已删除，不再执行本任务清单）
日期：2026-06-02
设计依据（**唯一事实源，先读**）：`docs/design-wiki-domain-detail-page.md`
可视化示意（交互/布局/动效以此为准）：`docs/design-wiki-domain-detail-page.html`
前置基线：`本域需求` 名字 join 恒空 → 改召回反查的 bug 已修（commit `8bf918d`）；本任务在其基础上推进，并复用已修的 `useWikiRecallWorkItemRanking`。

> **全局护栏（每个任务都适用，违反即返工）**
> 1. **零迁移**：不新增 DB 表 / 列 / 索引，不改 worker / 采集 / outbox。全部现有表只读聚合。
> 2. **下钻铁律**：知识库详情页下钻终点只能是「知识资产（文档）」。需求只出链跳 `/sdd/work-items/:id`，人只出链跳 `/sdd/users/:id`，技能只出链跳技能分析。本页**不就地展开**它们的详情。
> 3. **复用优先**：动手前先 grep。文档清单/正文/趋势/召回需求 Top 全部复用现成（详见各任务「复用」清单），不重造。
> 4. **范围锁 D4=B**：只做「文档为脊柱 + 趋势 + 读者 + 来源需求」，**不做**治理推荐（复活建议/该谁读）。
> 5. **验证在 dev 模式**（`pnpm dev`），不在 start；构造**可证伪**查询（空集要能区分「该文档无召回」与「接口错配」）。
> 6. **类型从 `packages/api` 的 zod contract 推导**，不手写 API 类型。
> 7. 前端遵守仓库 CLAUDE.md：React Router v7 懒加载、Tailwind v4 + design token（不写死颜色/魔法值，沿用 `styles.ts`）、Container/Presentational 分离、避免过早抽象。
> 8. **中文 commit**（subject + body）。顺序：**后端先行**（T1→T2→T3），前端后（T4→T5→T6），最后全量验证 + 文档保鲜（T7）。
>
> ⚠️ **并发提示**：用户分析重构（`docs/tasks-users-analysis-redesign.md`）可能并行改动 `sdd-query.repository.ts`、`sdd-query.service.ts`、`sdd.controller.ts`、`sdd.contract.ts`、`router.tsx`。这些文件本任务也会动——动手前先 `git pull`/看最新，新增代码尽量**追加**到文件末尾相关分区，减少冲突。

---

## T1：contract 新增（packages/api）

**文件**：`packages/api/src/contracts/sdd.contract.ts`

新增 `WikiDocDetailResponseSchema`（右栏用）：
```ts
export const WikiDocDetailResponseSchema = z.object({
  repo: z.string(),
  relativePath: z.string(),
  trend: z.array(z.object({ t: ISODateTimeSchema, count: z.number() })),
  readers: z.array(z.object({
    userId: IdSchema,
    userName: z.string().nullable(),
    recallCount: z.number(),
    lastRecallAt: ISODateTimeSchema.nullable(),
  })),
  sourceWorkItems: z.array(z.object({
    workItemId: IdSchema,
    workItemSlug: z.string(),
    businessDomain: z.string().nullable(),
    recallCount: z.number(),
  })),
});
export type WikiDocDetailResponse = z.infer<typeof WikiDocDetailResponseSchema>;
```
- **`timeline` 无需改 contract**：`WikiRecallTimelineResponseSchema` 响应结构不变，新增的 `wikiDomain` 是 query 参数（后端读，不进 body）。

**验收**：`pnpm --filter @sdd-telemetry/api build` 通过；类型从 contract 推导。

---

## T2：后端聚合 + 新接口 + timeline 过滤（server）

**文件**：`server/src/modules/sdd/sdd-query.repository.ts`、`sdd-query.service.ts`、`sdd.controller.ts`

2a. **新增 `listWikiRecallDocDetail(repo, relativePath)`**（repository），3 个小聚合（WHERE 固定 `wr.wiki_relative_path = ?`，JOIN 风格对照现有 `listWikiRecalls` ~985）：
- **trend**：`SELECT DATE_FORMAT(event_time,'%Y-%m-%dT00:00:00.000Z') t, COUNT(*) count FROM sdd_wiki_recalls WHERE wiki_relative_path=? AND event_time IS NOT NULL GROUP BY t ORDER BY t ASC`。
- **readers**：`SELECT wr.user_id, u.user_name, COUNT(*) recallCount, MAX(wr.event_time) lastRecallAt FROM sdd_wiki_recalls wr LEFT JOIN sdd_users u ON u.id=wr.user_id WHERE wr.wiki_relative_path=? AND wr.user_id IS NOT NULL GROUP BY wr.user_id ORDER BY recallCount DESC`。
- **sourceWorkItems**：`SELECT COALESCE(wr.work_item_id, su.work_item_id) wid, wi.work_item_slug, wi.business_domain, COUNT(*) recallCount FROM sdd_wiki_recalls wr LEFT JOIN sdd_skill_usages su ON su.id=wr.skill_usage_id JOIN sdd_work_items wi ON wi.id=COALESCE(wr.work_item_id, su.work_item_id) WHERE wr.wiki_relative_path=? GROUP BY wid ORDER BY recallCount DESC`。
- 注：`repo` 入参用于 service 回填响应 `repo` 字段；`sdd_wiki_recalls` 无 repo 列，按 `wiki_relative_path` 精确匹配（库内路径带 `domain-*` 前缀，根目录为 `SUMMARY.md` 等，已验证与 `docs` 接口 `relativePath` 同基准）。

2b. **扩 `wikiRecallTimeline` 加可选 `wikiDomain`**（repository ~961）：
- 签名加 `wikiDomain?: string | null`；命中时追加 WHERE：普通域 `AND wiki_domain = ?`；根目录 `wikiDomain === ROOT_DOMAIN_LABEL`（已 import 自 `wiki-coverage`）→ `AND wiki_domain IS NULL`。
- **向后兼容**：不传 = 原行为（总览页 `RecallTrendChart` 不受影响）。

2c. **service**：`getWikiRecallDocDetail(repo, relativePath)` 映射为 `WikiDocDetailResponse`（数字 `toNumber`、日期 `toIsoDate`、id `toStringId`，对照 §799 `getWikiRecallWorkItemRanking` 风格）；`getWikiRecallTimeline` 透传 `wikiDomain`。

2d. **controller**：
- 新增 `@Get('/wiki-recalls/doc-detail')`：读 `firstQueryValue(this.ctx.query.repo)` / `relativePath`，调 `getWikiRecallDocDetail`，`parseWithSchema(WikiDocDetailResponseSchema, ...)`，缺参或空结果友好返回（空数组，不报 500）。
- `/wiki-recalls/timeline`（~241）加读 `firstQueryValue(this.ctx.query.wikiDomain) ?? null` 传入。

**复用**：`listWikiRecalls` 的 JOIN（`sdd_skill_usages`/`sdd_users`/`sdd_work_items`）、`ROOT_DOMAIN_LABEL` 特判（同 bug 修复手法）、service 映射工具。
**验收**：`pnpm --filter @sdd-telemetry/server build` 通过。

---

## T3：后端验证（dev 模式，可证伪）

`pnpm dev`（或 `dev:server`）后 curl 验证（接口需登录态，可用现有鉴权 cookie/token；或直接对照 SQL）：

1. **文档明细可证伪**：`GET /wiki-recalls/doc-detail?repo=trade&relativePath=domain-cashier/...`（取一篇 hot 文档）→ `readers` 人数 = 覆盖表该文档 `distinctUsers`、各 `recallCount` 之和 = 该文档总召回、`trend` 各 count 之和 = 总召回。
2. **根目录可证伪**：`relativePath=SUMMARY.md` → `readers`/`sourceWorkItems` 非空（验证按 `wiki_relative_path` 精确匹配，不受 `wiki_domain IS NULL` 影响）。
3. **空集可证伪**：取一篇 `status='dead'` 文档 → `trend/readers/sourceWorkItems` 全空数组；能区分「该文档无召回」与「错配」（错配会返回别的文档的人/需求）。
4. **timeline 向后兼容**：`/wiki-recalls/timeline`（不传 `wikiDomain`）输出与改造前一致；传 `wikiDomain=cashier` 时点数 ≤ 全量、且只含该域。

---

## T4：前端 hooks + 类型（web）

**文件**：`web/src/pages/sdd/wiki-recalls/useWikiRecalls.ts`

- 新增 `useWikiRecallDocDetail(repo, relativePath)`：`enabled: !!repo && !!relativePath`，`requestData<WikiDocDetailResponse>('/api/sdd/wiki-recalls/doc-detail?...')`，`toQueryString` 拼参。
- 扩 `useWikiRecallTimeline` 增加可选 `wikiDomain` 参数（加进 queryKey 与 query string；不传不影响现有调用方 `RecallTrendChart`）。

**验收**：类型来自 contract；现有调用方编译不破。

---

## T5：详情页（web，核心）

**新增文件**（对照示意 HTML `#screen-detail` + 设计 §3.2 / §6）：
```
web/src/pages/sdd/wiki-recalls/
  WikiDomainDetailPage.tsx          Header + 两栏（左文档清单 + 右文档明细）
  components/DomainDetailHeader.tsx KPI 行 + 召回需求 Top(出链产出分析) + 域级趋势迷你图
  components/DomainDocList.tsx      左栏文档清单（三态徽标 + 召回数，选中高亮）
  components/DocRecallDetail.tsx    右栏：趋势 + 读者榜(→/sdd/users/:id) + 来源需求(→/sdd/work-items/:id) + 查看正文
```
- **路由**：`web/src/router.tsx` 新增 `sdd/wiki-recalls/:repo/:domain`，懒加载（对照 `work-items/:id` ~61）。**参数编码**：`navigate` 时 `encodeURIComponent(domain)`；详情页 `useParams` 后 `decodeURIComponent`（domain 含中文 / `（根目录）`）。
- **Header**：KPI 取 `useWikiRecallCoverage()` 里 `repo+domain` 匹配的 domain 行（`totalDocs/recalledDocs/recalls/deadDocs/distinctUsers`）；召回需求 Top 复用 `useWikiRecallWorkItemRanking('all', { wikiDomain })`（已修 bug，含根目录特判）；域级趋势用扩展后的 `useWikiRecallTimeline('30d','day','domain', domain)`。
- **左栏**：`useWikiRecallDomainDocs(repo, domain)` 现成数据；默认选中召回数最高一篇。
- **右栏**：`useWikiRecallDocDetail(repo, relativePath)`；`status` 为 `dead`/`new` 且无召回 → 空态「该文档暂无召回」；「查看正文」沿用现有逻辑（有 `lastToolCallId` 走 toolCallId，否则 `source:{repo,relativePath}`）。
- **趋势迷你图**：复用 `RecallTrendChart` 内 `buildTimelineChart`——抽到 `wiki-recalls` 工具文件（如 `lib/timelineChart.ts`）供两处用，不新造图表组件（避免过早抽象，仅这一次复用就抽是因为已有第二处真实消费）。

**复用**：`WikiDocModal`、`STATUS_BADGE`/`SoftBadge`（`DomainDrawer` 现有，迁移后保留这两段）、`styles.ts`（`CARD_STYLE`/`ICON_BOX`/`coverFillColor`/`repoTagStyle`/`REPO_LABEL`）、`formatInteger`、产出分析 `work-items/:id` 的 Header + 两栏视觉范式。

**验收**：总览行 → 详情页 → 左栏选文档 → 右栏趋势/读者/来源需求 → 出链跳用户/产出分析正确；正文 Modal 开/ESC 关；根目录域可进、空态正常。

---

## T6：总览页接线 + 删抽屉（web）

**文件**：`WikiRecallsPage.tsx`、`components/AssetTable.tsx`、`components/TopDomains.tsx`、删 `components/DomainDrawer.tsx`

- `AssetTable` 行点击、`TopDomains` 卡点击：`onSelectDomain(repo, domain)` 改为 `navigate('/sdd/wiki-recalls/' + repo + '/' + encodeURIComponent(domain))`（或保持回调签名、由 `WikiRecallsPage` 注入 navigate）。
- `WikiRecallsPage`：移除 `sel` state 与 `<DomainDrawer>` 挂载；KPI / `BusinessLineCompare` / `RecallTrendChart` / `AssetTable` **保持不变**。
- 删除 `DomainDrawer.tsx`（grep 确认唯一挂载点是 `WikiRecallsPage`）；其内 `STATUS_BADGE`/`SoftBadge` 用法已在 T5 迁入详情页组件。
- `RowInspectorDrawer` 若知识库侧无其它消费方仍被别的 tab 用 → **不删**，按 CLAUDE.md「孤儿在对话里提、不顺手删」。

**验收**：下钻铁律自查——详情页**无任何**就地展开需求/个人画像的入口，全是出链按钮；总览页除行点击行为外视觉无变化。

---

## T7：全量验证 + 文档保鲜

1. `pnpm typecheck` + `pnpm build` 全绿。
2. 删 `DomainDrawer` 后无残留 import；旧路径残留扫描（CLAUDE.md 指定 rg 命令）。
3. 走一遍设计 §9 可证伪验证清单（文档明细 / 根目录 / 空集 / timeline 兼容 / 铁律 / 链路无断点）。
4. **文档保鲜**：更新 `docs/api-contract.md`（新接口 `GET /wiki-recalls/doc-detail` + `WikiDocDetailResponseSchema` + `timeline` 加 `wikiDomain` 参数）、`docs/database-model.md`（无表变更，注明文档召回明细口径来自现有表聚合）；`docs/design-wiki-domain-detail-page.md` §状态 标注「已实施」。

---

## 变更前风险自检（命中 API contract / 共享组件 → 见设计 §10）

- **复用**：右栏全复用 `listWikiRecalls` 的 JOIN 解析 + `sdd_users`/`work_item`；趋势复用 `wikiRecallTimeline` + `buildTimelineChart`；Header 复用 `useWikiRecallCoverage` + 已修 `useWikiRecallWorkItemRanking`；正文复用 `WikiDocModal`；样式/徽标复用 `styles.ts`/`DomainDrawer` 迁移段。仅 `doc-detail` 聚合是新关节。
- **抽象**：新组件留 `wiki-recalls/components/`；`buildTimelineChart` 抽到工具文件（第二处真实消费），不造图表组件。
- **破坏性**：纯新增**只读**接口 + 现有表聚合，无迁移/表/列；`timeline` 扩 `wikiDomain` 为可选加法（旧调用方不传=原行为）；新增 contract schema 加法；**行点击语义从「开抽屉」改为「跳路由」**是用户路径变化（与产出/用户分析一致）；删 `DomainDrawer` 需确认唯一挂载点。
- **影响**：总览页小改（行点击 + 去抽屉）+ 新增详情路由；`useWikiRecallTimeline` 签名增可选参数（消费方一处，加法不破坏）；新增「知识 → 人/需求」出链复用既有路由；不触碰 worker/采集/outbox/其它 tab。
