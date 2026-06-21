# 知识库详情页设计（主语=知识资产 · 业务域深下钻 · 文档为脊柱 · 谁喂养谁消费）

状态：已废弃（2026-06-21 起不再作为实现依据；当前口径见 `docs/api-contract.md` 的 profile knowledge API）
日期：2026-06-02
产出方式：`/office-hours`（intrapreneurship 口径；脊柱/深度/入口三问已定 A/A/A，范围档定 B 理想版）
关联代码：`web/src/pages/sdd/wiki-recalls/*`、`server/src/modules/sdd/{wiki-coverage,sdd-query.repository,sdd-query.service,sdd.controller}.ts`、`packages/api/src/contracts/sdd.contract.ts`
姊妹文档（对齐其研究纵深与形式）：`docs/design-users-analysis-redesign.md`（用户画像深下钻）、产出分析 `work-items/:id`（链路下钻样板）

> 本次只设计「知识库详情页」。前置 bug（`本域需求` 名字 join 恒空 → 改召回反查）已在 commit `8bf918d` 修复，本设计在其基础上推进。

## 1. 背景与目标

`/sdd/work-items`（产出分析）和 `/sdd/users`（用户分析重构中）都建立了「**总览页保留 + 独立详情页深下钻**」的主轴，能从聚合指标钻到地面真相。`/sdd/wiki-recalls`（知识库分析）的总览页已经很完整（KPI + 业务线对比 + 趋势 + Top 域 + 知识资产一览表），但**下钻终点停在抽屉**（`DomainDrawer`）：

- 点一个业务域，看到的是 4 个字段卡 + 文档清单 + 召回需求（刚修好），是**一屏元数据**，不是「**这个知识域健不健康、谁在喂养它、谁在消费它**」。
- 抽屉容不下「单篇文档的召回明细」——谁读的、哪些需求读的、召回趋势，这正是知识资产的研究价值缺口。

### 1.1 主语与下钻铁律

知识库分析独占主语 = **知识资产**（对称用户分析§1.1 的四主语表）。主语链：`知识库(业务线) → 业务域 → 文档 → 正文`。详情页就是「业务域」这一层的深下钻。

**下钻铁律（划清边界，防止沦为产出分析/用户分析换皮）**：

> **知识库详情页的下钻终点只能是「知识资产（文档）」。需求只出链跳 `/sdd/work-items/:id`，人只出链跳 `/sdd/users/:id`，技能只出链跳技能分析。详情页展示的是「这篇文档/这个域在召回链上的切片」，不在本页重做需求详情 / 个人画像。**

**目标**：把知识库下钻从「抽屉元数据」升级为「**业务域知识资产画像页**」——回答「这个域沉淀了多少知识、被用得怎么样、哪些是热的/沉睡的、每篇文档谁在读、由哪些需求触发」，并能从一篇文档钻到它的召回趋势、读者、来源需求、正文原文。

## 2. 范围

**做（B 理想版）：**
- **总览页保留**：`知识资产一览`表格 + `Top 域`卡的行点击，从「开抽屉」改为「跳详情页路由」（对齐产出/用户分析）。
- **新增独立详情页 `/sdd/wiki-recalls/:repo/:domain`（懒加载，两栏，对称 `work-items/:id`）**：
  - **Header**：业务线/域面包屑 + KPI 行（文档数、覆盖率、累计召回、沉睡、读者数）+「召回本域文档的需求」Top 区（复用已修的 ranking）+ 域级召回趋势迷你图。
  - **左栏**：文档清单（冷/热/沉睡/新增未读三态徽标 + 召回数），选中高亮。
  - **右栏**：选中文档的明细——召回趋势 + 读者榜（出链 `/sdd/users/:id`）+ 来源需求（出链 `/sdd/work-items/:id`）+「查看正文」（复用 `WikiDocModal`）。
- **删除 `DomainDrawer`**（内容全迁入详情页，单一事实源）。
- **新增 2 个只读接口**（零迁移）：① 按文档路径反查召回明细；② `timeline` 加可选 `wikiDomain` 过滤（域级趋势）。

**不做（YAGNI）：**
- 不在本页展开需求详情 / 个人画像（属另外两页），一律出链。
- 不新增 DB 表 / 列 / 索引 / 迁移；不改采集 / worker / outbox。
- 不做「复活建议 / 该谁读」等治理推荐逻辑（D4 选 B 而非 C，保持「纯研究展示」边界）。
- 不还原磁盘最终正文之外的渲染（沿用 `WikiDocModal` 既有「展示召回内容/按路径取内容」的解耦立场）。
- 不做跨域对比大可视化（域级趋势用迷你图，不做大图）。

## 3. 信息架构与页面结构

### 3.1 总览页 `/sdd/wiki-recalls`（保留 + 小改）

四区不变；仅**行点击语义改为路由跳转**：
- `AssetTable` 行 `onClick` → `navigate('/sdd/wiki-recalls/:repo/:domain')`（原 `onSelectDomain` 开抽屉）。
- `TopDomains` 卡点击 → 同上。
- `WikiRecallsPage` 移除 `sel` state 与 `<DomainDrawer>` 挂载。

### 3.2 详情页 `/sdd/wiki-recalls/:repo/:domain`（两栏，对称 `work-items/:id`）

```
/sdd/wiki-recalls/:repo/:domain   知识域画像
┌───────────────────────────────────────────────────────────────┐
│ ← 知识库分析   交易 / cashier                                    │
│ 文档 18 · 覆盖 72%(13/18) · 累计召回 519 · 沉睡 3 · 读者 9       │
│ 召回本域文档的需求 Top: 退款重构 88 · 签约SDK 42 …  [→产出分析]   │
│ 域级召回趋势(近30天) ▁▂▅▇▆▃▂▅▇▆                                 │
├──────────────┬────────────────────────────────────────────────┤
│ 文档清单(18)  │  domain-cashier/flows/refund.md     [查看正文]  │
│ ▸ refund.md◄ │  趋势(近30天) ▁▂▅▇▆▃  88 次                     │
│   热 · 88次   │  读者 9       张三 12 / 李四 8 / 王五 6 … →人    │
│ ▸ signup.md   │  来源需求 6   cashier/退款重构 24 / 签约 11 …→需求│
│   冷 · 4次    │                                                 │
│ ▸ legacy.md   │  （文档无召回时：右栏空态「该文档暂无召回」）     │
│   沉睡 · 0次  │                                                 │
└──────────────┴────────────────────────────────────────────────┘
出链：读者 → /sdd/users/:id ；来源需求 → /sdd/work-items/:id ；正文 → WikiDocModal
```

- **左栏**：`useWikiRecallDomainDocs(repo, domain)` 现成数据（每篇含 `recallCount/status/lastToolCallId/relativePath`）。默认选中召回数最高的一篇。
- **右栏**：选中文档 → `useWikiRecallDocDetail(repo, relativePath)`（新 hook）→ 趋势 + 读者榜 + 来源需求。「查看正文」沿用现有逻辑（有 `lastToolCallId` 走 toolCallId，否则走 `source: {repo, relativePath}`），复用 `WikiDocModal`。
- **配色语义**：文档状态 热=绿(good) / 冷=灰(neutral) / 沉睡=红(bad) / 新增未读=蓝(info)，沿用 `DomainDrawer` 的 `STATUS_BADGE` 与 `SoftBadge`、覆盖率进度条 `coverFillColor`。

## 4. 数据来源与口径（全部现有表聚合，零迁移）

### 4.1 现有数据（只读，已在用）

- 扫描层 `scanKnowledgeBase`：每篇 `.md` 的 `repo/domain/relativePath/mtimeMs`；域由路径首段 `domain-*` 解析，非 `domain-*`（库根）→ `domain=null` → 展示 `（根目录）`（`wiki-scan.ts`）。
- `sdd_wiki_recalls`：`user_id`、`wiki_relative_path`、`wiki_domain`（根目录文档为 NULL）、`action_type`、`event_time`、`work_item_id` / 经 `skill_usage_id` 关联的 `work_item_id`、`tool_call_id`。
- `sdd_users`：`user_name`（读者展示名，`listWikiRecalls` 已 LEFT JOIN）。
- `sdd_work_items`：`work_item_slug` / `business_domain`（来源需求展示）。

### 4.2 Header KPI + 召回需求 Top + 域级趋势（全部复用现成）

- **KPI**：取 `useWikiRecallCoverage()` 的 `domains` 数组里 `repo+domain` 匹配行（`totalDocs/recalledDocs/recalls/deadDocs/distinctUsers/lastRecallAt`）。覆盖率 = `recalledDocs/totalDocs`。
- **召回本域文档的需求 Top**：复用刚修的 `useWikiRecallWorkItemRanking('all', { wikiDomain: domain })`（含根目录 `wiki_domain IS NULL` 特判）。
- **域级趋势迷你图**：`useWikiRecallTimeline` 扩 `wikiDomain` 过滤（§5.1-②），`groupBy` 取 domain、限定本域。

### 4.3 单篇文档召回明细（新接口，核心）

匹配键 = `(repo, wiki_relative_path)`，口径累计（与覆盖表一致）：

| 切片 | 口径 | 出链 |
|---|---|---|
| **趋势** | 该文档按天 `COUNT(*)` of recalls | — |
| **读者榜** | `GROUP BY user_id`：`recallCount`、`userName`、`lastRecallAt`，按 recallCount desc | `/sdd/users/:userId` |
| **来源需求** | `GROUP BY COALESCE(wr.work_item_id, su.work_item_id)`：`recallCount`、`workItemSlug`、`businessDomain` | `/sdd/work-items/:workItemId` |

- **根目录文档**：`relativePath` 形如 `SUMMARY.md`，其 `wiki_domain` 为 NULL，但本接口按 `wiki_relative_path` 精确匹配，不受 domain 影响——根目录文档的读者/来源需求一样查得到。
- **可证伪**：选 `cashier/flows/refund.md`（召回 N 次）→ 读者榜人数 = `distinctUsers`、各人次数之和 = `recallCount`；选一篇 `status='dead'` 的 → 读者榜空、趋势空、右栏空态。空集能区分「该文档无召回」与「接口错配」。

## 5. 后端设计（server，sdd 模块内，只读 / 零迁移）

### 5.1 接口（contract 新增 / 扩展）

1. **新增 `GET /api/sdd/wiki-recalls/doc-detail?repo=&relativePath=`** —— 右栏用：
   ```ts
   export const WikiDocDetailResponseSchema = z.object({
     repo: z.string(),
     relativePath: z.string(),
     trend: z.array(z.object({ t: ISODateTimeSchema, count: z.number() })),
     readers: z.array(z.object({
       userId: IdSchema, userName: z.string().nullable(),
       recallCount: z.number(), lastRecallAt: ISODateTimeSchema.nullable(),
     })),
     sourceWorkItems: z.array(z.object({
       workItemId: IdSchema, workItemSlug: z.string(),
       businessDomain: z.string().nullable(), recallCount: z.number(),
     })),
   });
   ```
   - repository：3 个小聚合查询（trend 按天、readers GROUP BY user、sourceWorkItems GROUP BY 有效 work_item），WHERE 固定 `wr.wiki_relative_path = ?`（repo 维度：`sdd_wiki_recalls` 无 repo 列，按 `relativePath` 精确匹配即可，路径含 `domain-*` 前缀天然区分库内路径；与现有 `listWikiRecalls` 的 LEFT JOIN `sdd_skill_usages` / `sdd_users` 同构）。
   - controller：对称 `@Get('/wiki-recalls/docs')`，`firstQueryValue` 取 `repo` / `relativePath`。

2. **扩 `wikiRecallTimeline` 加可选 `wikiDomain` 过滤** —— Header 域级趋势用：
   - repository `wikiRecallTimeline(..., wikiDomain?: string | null)`：`wikiDomain` 命中时追加 `AND wiki_domain = ?`（根目录 `'（根目录）'` → `AND wiki_domain IS NULL`，复用 `ROOT_DOMAIN_LABEL` 特判，与 bug 修复同一手法）。
   - controller `/wiki-recalls/timeline` 加读 `firstQueryValue(this.ctx.query.wikiDomain)`，向后兼容（不传=全量，现有总览页趋势不受影响）。

> **正确性前提**：两个接口都只读现有表、无新表/列；`doc-detail` 单文档量级查询轻量。`timeline` 加过滤是**加法**，旧调用方（总览页 `RecallTrendChart`）不传该参数，行为不变（§10 破坏性）。

### 5.2 配置

无新增 env（沿用 `wikiDeadKnowledgeGraceDays` 等现有阈值；详情页三态与总览页同源）。

## 6. 前端结构（web）

```
web/src/pages/sdd/wiki-recalls/
  WikiRecallsPage.tsx          小改：移除 sel/DomainDrawer；行点击改 navigate
  useWikiRecalls.ts            +useWikiRecallDocDetail(repo, relativePath)；
                               useWikiRecallTimeline 增加可选 wikiDomain 参数
  WikiDomainDetailPage.tsx     新增：Header + 两栏（左文档清单 + 右文档明细）
  components/
    DomainDetailHeader.tsx     KPI 行 + 召回需求 Top + 域级趋势迷你图
    DomainDocList.tsx          左栏文档清单（迁移 DomainDrawer 文档清单 + 三态徽标）
    DocRecallDetail.tsx        右栏：趋势 + 读者榜(→人) + 来源需求(→需求) + 查看正文
  components/DomainDrawer.tsx   删除（内容全迁入详情页）
  components/AssetTable.tsx     onSelectDomain 改为 navigate（或回调由页面注入 navigate）
  components/TopDomains.tsx     同上
```

- 路由 `web/src/router.tsx` 新增 `sdd/wiki-recalls/:repo/:domain`，懒加载（对照 `work-items/:id` ~61 行写法）。**路由参数编码**：`domain` 含中文 / `（根目录）` 特殊字符，`navigate` 时 `encodeURIComponent`，详情页 `useParams` 后 `decodeURIComponent`。
- **复用**：`WikiDocModal`（正文）、`STATUS_BADGE`/`SoftBadge`（三态徽标）、`coverFillColor`/`repoTagStyle`/`REPO_LABEL`/`CARD_STYLE`/`ICON_BOX`（styles.ts）、`formatInteger`、产出分析详情页 Header/两栏视觉词汇、`RecallTrendChart` 的 `buildTimelineChart` 迷你图逻辑（趋势复用）。
- **收敛**：`DomainDrawer` 内 `useSddWorkItems` 早已在 bug 修复中移除；本次删除整个抽屉文件。`RowInspectorDrawer` 若确认知识库侧无其它消费方，按 CLAUDE.md「孤儿在对话里提、不顺手删」处理（其它 tab 仍在用，预计不删）。

## 7. 链路接入（抽屉 → 详情页，知识资产作为节点主语）

知识库正式接进 `prompt → skill → wiki → artifact` 链：

- 详情页**读者** → 出链 `/sdd/users/:id`（知识 → 人）。
- 详情页**来源需求** → 出链 `/sdd/work-items/:id`（知识 → 需求）。
- 反向：用户画像的 wiki 节点、产出分析的 wiki 读取，均可回跳本详情页 `/sdd/wiki-recalls/:repo/:domain`（如不在三页现有实现内，记 TODO，不顺手改三页）。主线始终是「知识资产」主语，人/需求深挖都是出链。

## 8. 弱依赖 / 降级矩阵

| 情况 | 表现 |
|---|---|
| 正常 | Header + 左右栏 + 趋势 + 读者/来源需求正常 |
| 知识库未挂载（`scan.configured=false`） | 总览页已降级（KPI 显 —）；详情页文档清单空态，不进入 |
| 选中文档无召回（`status='dead'`/`new`） | 右栏趋势/读者/来源需求空态「该文档暂无召回」，正文仍可看（按 path 取内容） |
| 召回有 user_id 但 `sdd_users` 无名 | 读者榜 `userName` 为空 → 显示用户短 ID（沿用 `listWikiRecalls` 既有 LEFT JOIN 行为） |
| 召回未关联 work_item | 来源需求榜偏少（仅统计有 work_item 的召回），不报错 |

## 9. 验证清单（可证伪，dev 模式）

1. **文档明细可证伪**：选 `cashier/flows/refund.md` → 读者榜人数 = 覆盖表该文档 `distinctUsers`、各人次数之和 = `recallCount`；趋势按天和 = `recallCount`。
2. **根目录可证伪**：进 `交易/（根目录）` 详情页 → 选 `SUMMARY.md` → 读者/来源需求查得到（验证按 `wiki_relative_path` 精确匹配，不受 `wiki_domain IS NULL` 影响）；Header「召回需求」非空（复用已修 ranking）。
3. **空集可证伪**：选 `status='dead'` 文档 → 右栏三块全空态；能区分「该文档无召回」与「接口错配」（错配会返回别的文档的人/需求）。
4. **timeline 向后兼容**：不传 `wikiDomain` 时总览页 `RecallTrendChart` 输出与改造前一致；传 `cashier` 时点数 ≤ 全量。
5. **下钻铁律**：详情页**无任何**就地展开需求详情 / 个人画像的入口；读者/来源需求只在出链按钮出现。
6. **链路无断点**：总览行 → 详情页 → 左栏选文档 → 右栏读者/来源需求 → 出链跳用户/产出分析正确；正文 Modal 打开 / ESC 关闭。
7. `pnpm typecheck` + `pnpm build`；旧路径残留扫描（CLAUDE.md 指定 rg）；删除 `DomainDrawer` 后无残留 import。

## 10. 变更前风险自检（命中 API contract / 共享组件 → 显式说明）

1. **复用**：右栏读者/来源需求复用 `listWikiRecalls` 的 JOIN 范式与 `sdd_users`/`work_item` 解析；趋势复用 `wikiRecallTimeline` + `buildTimelineChart`；Header 复用 `useWikiRecallCoverage` + 已修 `useWikiRecallWorkItemRanking`；正文复用 `WikiDocModal`；三态徽标/样式复用 `styles.ts`。仅 `doc-detail` 聚合是「现在没有、且文档主语必须」的新关节，非过早抽象。
2. **抽象**：新组件留在 `wiki-recalls/components/`，不跨页抽象；趋势迷你图若与 `RecallTrendChart` 重复度高，抽 `buildTimelineChart` 为共享 util（已在 `RecallTrendChart` 内，移到 `wiki-recalls` 工具文件供两处用），不新造图表组件。
3. **破坏性**：纯新增**只读**接口 + 现有表聚合，**无迁移 / 表 / 列**；`timeline` 扩 `wikiDomain` 为**可选加法**，旧调用方不传=原行为；新增 contract schema 为加法；**行点击语义从「开抽屉」改为「跳路由」**是用户路径变化，但与产出/用户分析一致、可预期；删除 `DomainDrawer` 需确认其唯一挂载点是 `WikiRecallsPage`（grep 确认无其它 import）。
4. **影响**：知识库总览页小改（行点击 + 去抽屉）+ 新增详情路由；`useWikiRecallTimeline` 签名增可选参数（消费方 `RecallTrendChart` 一处，加法不破坏）；新增「知识 → 人/需求」出链复用既有路由；不触碰 worker / 采集 / outbox / 其它 tab。

## 11. 已知局限

- `sdd_wiki_recalls` 无 repo 列，`doc-detail` 按 `wiki_relative_path` 精确匹配。库内路径带 `domain-*` 前缀天然区分；理论上不同库存在同名根目录文档（如多个库都有 `SUMMARY.md`）时会合并统计——与现有总览侧「召回反查不区分 repo」同源局限，B 版接受，repo 精确化留后续（需 schema 加 repo 维度，破坏零迁移）。
- 来源需求依赖 `work_item_id`（直挂或经 skill_usage）；早于该关联埋点的旧召回来源需求偏少。
- 趋势/读者依赖 `event_time` / `user_id` 质量；OTel 链路中断期的召回会缺失（与总览页同源风险）。
- 正文沿用 `WikiDocModal`「展示召回内容 / 按路径取当前内容」，不还原历史版本。

## 12. 文档保鲜

落地同步更新：`docs/api-contract.md`（新接口 `GET /wiki-recalls/doc-detail` + `timeline` 加 `wikiDomain` 参数 + `WikiDocDetailResponseSchema`）、`docs/database-model.md`（无表变更，注明文档召回明细口径来自现有表聚合）。落地后在本文 §状态 标注「已实施」。
