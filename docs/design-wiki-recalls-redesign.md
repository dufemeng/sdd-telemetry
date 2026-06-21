# 知识库分析重构设计（知识资产视角 + 三业务线 + 覆盖率/死知识）

状态：已废弃（覆盖率/filesystem scan/domain 方案已删除；当前口径见 `docs/api-contract.md`）
日期：2026-06-01
可视化示意：`docs/design-wiki-recalls-redesign.html`（暗色终端风，含下钻抽屉 + 内容 Modal 交互；`#drawer` / `#modal` 锚点可深链到打开态）
关联代码：`web/src/pages/sdd/wiki-recalls/*`、`server/src/modules/sdd/*`、`server/src/modules/sdd/wiki-content.ts`、`worker/src/jobs/wiki-path.ts`、`packages/api/src/contracts/sdd.contract.ts`

## 1. 背景与目标

`/sdd/users`、`/sdd/skills`、`/sdd/work-items` 已统一为「老板视角」经营总览（4-section：经营指标 → 趋势/健康度 → 标杆 Top3 → 一览+下钻）。唯独 `/sdd/wiki-recalls`（知识库分析）仍停在旧的工程/排障语言：4 个并排 Panel（用户排行表 / 热度 BarList / 需求×wiki 下钻 / 时间线柱状图），且：

- 「需求×wiki 下钻」与产出分析的链路下钻**职责重叠**（都从需求进，看 artifacts + wiki）。
- 「用户排行」与用户分析**重叠**。
- 仍吃**全局 timeRange**，与其它看板的累计/状态口径不一致。
- **完全没用上**新增的「点 wiki 标签看文档内容」能力。
- 没回答这个看板**独有的经营问题**：知识库作为团队资产，盘子多大、用上了多少、有多少在烂。

**目标**：把知识库分析重构成**知识资产视角**的经营总览——以**知识库（业务线）→ 业务域 → 文档**为主轴，回答「团队沉淀的领域知识健康吗、被有效利用了吗」。

## 2. 范围

**做：**
- 4-section 重构（删旧 4 tab），弃全局 timeRange，改累计 + 服务器快照口径。
- 引入 **repo（业务线）层**：交易 trade / 融资 loan / 理财 wealth。
- 后端新增**知识库目录扫描**（弱依赖、只读、零迁移），算**覆盖率 / 冷热 / 死知识（三态分桶）**。
- 下钻抽屉：库·域 meta + 文档清单（状态徽标，点开看正文，含死知识/未读）+ 关联需求（反向接入 wiki → 产出链路）。
- 内容接口扩展**按 `(repo, relativePath)` 取正文**（给从无召回的死知识/未读文档）。

**不做（YAGNI）：**
- 不改采集、不存「读取时的知识库 git 版本」（数据上没有，跨团队，成本高）。
- 不还原历史版本正文（只在 Modal 诚实标注「当前版本」）。
- 不做知识库全文搜索 / 目录树浏览（扫描只取路径 + mtime，不读正文）。
- 不在本页重做用户排行（属用户分析）、需求 × wiki 链路下钻（属产出分析）。
- 不新增 DB 表 / 列 / 迁移。

## 3. 信息架构与页面结构

层级（数据上以扫描目录结构为权威）：

```
知识库 repo（交易 trade / 融资 loan / 理财 wealth，各一个 git 仓库）
   └ 业务域 domain（domain-cashier → cashier …）
       └ 维度·系统 axis/system（business / system/apps/<sys>）
           └ 文档 .md
```

页面（详见 HTML 示意）：

```
① 经营指标（全局 4 KPI · 三库合计）
   知识库规模 342 | 知识利用率 64%(219/342)▮▮▮▯ | 累计召回 8,432 | 死知识 23⚠
② 三业务线知识资产对比（恰好 3 卡）
   交易 72%(134/186) | 融资 51%(45/88) | 理财 59%(40/68)  各带利用率条·召回·死知识
③ 召回趋势(左·堆叠 by 业务线) + 标杆领域 Top3(右·域名带库前缀 "交易/cashier")
④ 知识资产一览  [分组: 知识库 | 业务域 | 系统模块]  [搜索] [全部 | 有死知识]
   行常驻库徽标(交易/融资/理财)，覆盖列 mini 进度条按阈值变色，点行 → 抽屉
        抽屉: 库·域 meta + 文档清单(热/冷/死/新增未读 + 点开正文) + 关联需求(跳产出分析)
            点文档 → 内容 Modal(markdown + 复制原始路径 + "当前版本"标注)
```

- **弱依赖边界**：① 的规模/利用率/死知识、② 全部、④ 覆盖列依赖扫描；未挂载知识库时这些**降级占位**（"需服务器挂载知识库"），而**累计召回、召回趋势、标杆领域照常**——页面在本机 mock 仍可用。
- **配色语义**：业务线 trade=电黄(bar-fill) / loan=蓝 / wealth=绿；文档状态 热=绿 / 冷=灰 / 死=红 / 新增未读=蓝；利用率条按阈值 ≥65 绿 / 45–64 橙 / <45 红。

## 4. 数据来源与口径

### 4.1 现有数据（只读，不改）

`sdd_wiki_recalls`（每次知识库召回一行）关键列：`tool_call_id`、`interaction_id`、`skill_usage_id`、`work_item_id`、`user_id`、`action_type`(read/glob/grep)、`raw_path`、`wiki_relative_path`、`wiki_domain`、`wiki_axis`、`wiki_system`、`event_time`。

复用现有接口：`/api/sdd/wiki-recalls/{timeline, list, work-items, content/:toolCallId}`。其中 `list` 仍被用户分析页消费，**保留不动**。

### 4.2 repo（业务线）维度 —— 零迁移推导

- repo **未入表**，但可从 `raw_path` 用现成 `deriveRepoName(rawPath, wikiRelativePath)` 推出（basename，如 `bk-fe-knowledge-trade`）。
- **覆盖率匹配本就需要 `(repo, relativePath)` 复合键**（否则两库同名相对路径会串），所以「每条召回 → repo」在覆盖率管线里本来就要算 → repo 维度免费拿到。
- 业务域 → repo 的权威映射来自**扫描目录结构**（`KNOWLEDGE_BASE_ROOT/<repo>/domain-*/…`）。召回侧出现、但当前扫描里没有的域 → repo 记「未知」。
- 库中文名常量映射：`trade→交易`、`loan→融资`、`wealth→理财`（前端 token）。
- **假设**：同一 domain 名不跨库重复（cashier 仅属 trade）；跨库重复时以路径归属为准。

### 4.3 覆盖率 / 冷热 / 死知识口径

匹配键 **`(repo, wiki_relative_path)`**，全部在**路径级**计算（对「读的是哪一版内容」不敏感）。三类集合差：

| 集合 | 含义 | 计入分母? | 呈现 |
|---|---|---|---|
| 交集（被召回 ∩ 当前库内有） | 有效覆盖 | 是（分子） | 利用率 |
| 仅扫描（库内有、从无召回），加入 ≤30 天 | 新增未读（宽限期） | 是 | 蓝徽标，不算死 |
| 仅扫描（库内有、从无召回），加入 >30 天 | **死知识** | 是 | 红徽标 |
| 仅召回（读过、当前库内已无） | 历史路径已不在库（目录漂移） | **否** | orphan 信号，单列 |

- **利用率 = 交集文档数 / 当前库内文档总数**（per repo / per domain / 全局）。
- 「加入时间」取扫描到的文件 mtime（best-effort；若卷含 `.git` 可换 git 首次提交时间，非必须）。宽限期 N 默认 **30 天**（`wikiDeadKnowledgeGraceDays`，可配）。

### 4.4 保鲜（freshness）

- **不落表、不进 DB 缓存**。分母 = 请求时现扫服务器**当前挂载**目录（仅 `.md` 路径 + mtime，**不读正文**），进程内短 TTL 内存缓存（`wikiScanCacheTtlMs` 默认 600s，或按顶层目录 mtime 失效）。分子 = DB `sdd_wiki_recalls` 的 distinct 召回路径聚合。
- 两边都取「当下值」→ 天然保鲜；分母定义收窄为「服务器此刻挂的快照」，UI 标注**快照版本/时间**（best-effort 读各库 `.git` HEAD，读不到则标 `—`）。

### 4.5 版本（versioning）

- 路径级口径已让覆盖率/冷热/死知识对**内容版本**免疫（见 4.3）。
- 唯一受内容版本影响处：**内容 Modal 显示服务器当前版本正文**，可能与用户历史读取版本不同 → **诚实标注**，不还原历史（沿用 wiki-doc-content 既有局限）。

## 5. 后端设计（server，sdd 模块内，弱依赖 / 只读 / 零迁移）

### 5.1 知识库扫描 service（新增）

- 入参：无（扫 `config.knowledgeBaseRoot` 下的 `bk-fe-knowledge-*` 子目录）。
- 行为：对每个 repo 目录递归收集 `.md` 文件 → 用 **`parseWikiPath(repoRoot, absPath)`**（与召回侧同一归一化口径）得 `{relative, domain, axis, system}` + `mtime`；best-effort 读 `.git` HEAD 作快照 ref。
- 缓存：进程内 Map，key=repo，TTL `wikiScanCacheTtlMs`（默认 600s）。
- 降级：`knowledgeBaseRoot` 未配置 / 目录不存在 → 返回空 + `configured:false`，绝不抛错。
- 复用：`deriveRepoName` / `resolveWikiContentPath`（越权守卫）/ `parseWikiPath`。

> **正确性前提**：扫描产出的相对路径必须与 `wiki_relative_path` 同套归一化（复用 `parseWikiPath`），否则交集≈0。列为验证项（§9.1）。

### 5.2 接口（contract 新增）

1. `GET /api/sdd/wiki-recalls/coverage`
   ```ts
   {
     scan: { configured: boolean, repos: Array<{ repo, label, gitRef: string|null, scannedAt }> },
     totals: { totalDocs, recalledDocs, coverageRate, recalls, coldDocs, deadDocs, newUnreadDocs, orphanPaths },
     repos:  Array<{ repo, label, totalDocs, recalledDocs, coverageRate, recalls, deadDocs, newUnreadDocs, distinctUsers }>,
     domains:Array<{ repo, domain, totalDocs, recalledDocs, recalls, deadDocs, newUnreadDocs, distinctUsers, lastRecallAt }>,
   }
   ```
   分母来自 §5.1 扫描，分子/召回/参与人来自 `sdd_wiki_recalls` 聚合，按 `(repo, relativePath)` 合流。

2. `GET /api/sdd/wiki-recalls/docs?repo=&domain=` → 抽屉文档清单
   ```ts
   Array<{
     relativePath, recallCount, lastRecallAt, lastToolCallId: Id|null,
     status: 'hot'|'cold'|'dead'|'new', addedAt
   }>
   ```
   `lastToolCallId` 用于「被召回过的文档」走现有 `/content/:toolCallId`；死知识/未读无 toolCallId → 走下面 by-path。

3. `GET /api/sdd/wiki-recalls/content/by-path?repo=&relativePath=` → 按路径取正文
   响应复用现有 `SddWikiRecallContentSchema`（`found/reason/repoName/relativePath/rawPath/isMarkdown/content/truncated`）。核心复用 `resolveWikiContentPath` + readFile + 大小上限 + 越权守卫；reason 复用既有枚举（`not_configured`/`repo_missing`/`file_missing`/`too_large`/`ok`）。

- 关联需求复用现有 `GET /api/sdd/wiki-recalls/work-items?businessDomain=`（无需新增）。

### 5.3 配置（config.default.ts，全部有默认）

```ts
knowledgeBaseRoot: process.env.KNOWLEDGE_BASE_ROOT ?? null,   // 已存在
wikiContentMaxBytes: Number(process.env.WIKI_CONTENT_MAX_BYTES ?? 512*1024), // 已存在
wikiScanCacheTtlMs: Number(process.env.WIKI_SCAN_CACHE_TTL_MS ?? 600_000),   // 新增
wikiDeadKnowledgeGraceDays: Number(process.env.WIKI_DEAD_GRACE_DAYS ?? 30),  // 新增
```

未配置 `knowledgeBaseRoot` → coverage/docs/by-path 全部降级，不报错。

## 6. 前端结构（web）

```
web/src/pages/sdd/wiki-recalls/
  WikiRecallsPage.tsx          重写：4-section 经营总览（弃 timeRange）
  useWikiRecalls.ts            新增 useWikiRecallCoverage / useWikiRecallDomainDocs / useWikiRecallDocContentByPath
                               保留 useWikiRecallTimeline / useWikiRecallWorkItemRanking / useWikiRecallList(用户分析依赖)
  components/
    BusinessLineCompare.tsx    ② 三业务线对比
    RecallTrendChart.tsx       ③ 趋势（由 TimelineTab 改造，默认 30d + 粒度控件）
    TopDomains.tsx             ③ 标杆领域 Top3（沿用排名色条+角标）
    AssetTable.tsx             ④ 一览（分组 SegmentedControl + 搜索 + 筛选 + 行）
    DomainDrawer.tsx           下钻抽屉（基于 RowInspectorDrawer）
  （KPI 卡可内联或抽 KpiRow，沿用产出分析 CARD_STYLE/ICON_BOX 视觉）
```

**复用**：`RowInspectorDrawer`、`BarList`、`SegmentedControl`/`SoftBadge`/`QueryNotice`（WikiRecallControls）、`WikiDocModal` + `useWikiRecallContent` + `MarkdownView`（`web/src/components/sdd/`）、`useSddWorkItemDetail`、`formatInteger/formatRelativeTime`、产出分析的 KPI/标杆视觉词汇。

**删除（本页私有）**：`tabs/UserRankingTab.tsx`、`tabs/WorkItemRankingTab.tsx`、`tabs/WikiHeatmapTab.tsx`、`tabs/TimelineTab.tsx`（改造为 RecallTrendChart）。
**保留**：`useWikiRecallList`（用户分析页 import），`WikiRecallControls` 的 3 个原子。
**因删 tab 而孤儿、应一并清理的前端 hook**：`useWikiRecallUserRanking`、`useWikiRecallHeatmap`（仅被被删的两个 tab 使用，heatmap 能力被 coverage 取代）→ 删除。对应**服务端端点本次不删**（超范围，无消费方破坏）。

**内容 Modal 取正文分流**：被召回文档（有 `lastToolCallId`）→ 现有 `useWikiRecallContent(toolCallId)`；死知识/未读文档 → `useWikiRecallDocContentByPath(repo, relativePath)`。两者响应同 schema，Modal 同一套渲染 + 降级矩阵。

## 7. 链路接入（孤儿 tab → 链）

知识库分析作为资产入口，反向接入 `prompt → skill → wiki → artifact`：抽屉「关联需求」点击跳 `/sdd/work-items/:id`（wiki → artifact 方向）。不喧宾夺主，主线仍是资产视角。

## 8. 弱依赖降级矩阵

| 情况 | coverage.scan.configured | 页面表现 |
|---|---|---|
| 已挂载、读到 | true | 全功能；KPI/②/④ 覆盖正常；Modal 渲染正文 |
| 未配置 / 未挂载 | false | ①(规模/利用率/死知识)、②、④覆盖列降级占位；③、累计召回、趋势照常；Modal 显 `not_configured` |
| 已挂载但某库缺失 | true（该库 totalDocs=0） | 该业务线卡显「未挂载」；其余正常 |
| 文档读不到（by-path） | — | Modal 按 `file_missing`/`repo_missing` 友好提示 + 显相对/原始路径 |

## 9. 验证清单（可证伪，dev 模式）

1. **扫描口径一致**：`KNOWLEDGE_BASE_ROOT` 指向本机库父目录，抽 `cashier` 域，确认 `scan ∩ recall` 非接近 0（接近 0 说明 `parseWikiPath` 归一化与召回侧不一致）。
2. **覆盖率**：构造库内 N 篇、召回命中 M 篇 → `coverageRate=M/N`；mtime>30 天且无召回的计入 `deadDocs`，≤30 天计 `newUnreadDocs`。能区分「未配置」（`configured:false`）与「已挂载但全未读」（`configured:true, deadDocs>0`）——空集可证伪。
3. **repo 维度**：三库 `totalDocs`/`recalls` 之和 == `totals`；构造一个「库里已删但有历史召回」的路径 → 归 `orphanPaths`，不进分母。
4. **死知识看正文**：对一篇从无召回的库内文档调 `content/by-path` → `found:true` + 内容；故意指向不存在目录 → `not_configured`/`repo_missing`/`file_missing` 各自命中。
5. **前端链路**：领域行 → 抽屉 → 文档清单 → 内容 Modal 无断点；降级态 ①②④ 占位、③ 正常；「关联需求」跳 `/sdd/work-items/:id`。
6. `pnpm typecheck` + `pnpm build`；旧路径残留扫描（CLAUDE.md 指定的 rg 命令）。

## 10. 变更前风险自检（命中 API contract / 共享组件 / env）

- **复用**：内容查看（`WikiDocModal`/`useWikiRecallContent`/`MarkdownView`）、抽屉（`RowInspectorDrawer`）、`deriveRepoName`/`resolveWikiContentPath`/`parseWikiPath`、关联需求（`work-items` 接口）全复用；KPI/标杆沿用产出分析视觉。扫描是「现在没有、且资产视角必须」的新关节，非过早抽象。
- **抽象**：页面级组件留在 `wiki-recalls/`，不跨页抽象；不为单次使用造通用 Modal（已有 `WikiDocModal`）。
- **破坏性**：纯新增**只读**接口 + 现有表聚合，**无迁移 / 无新表 / 无新列**；内容接口为**加法**（新增 by-path，不动 `:toolCallId` 路径与 schema）；新增 env 全有默认、缺失即降级；**保留 `useWikiRecallList`** 不破坏用户分析页；删除的仅本页私有 tab 组件。contract 新增 coverage/docs schema，前后端同步升级。
- **影响**：知识库分析页整体重写；用户分析页仍依赖 `useWikiRecallList`（保留）；内容接口被 `InteractionDetailDrawer` + 本页抽屉共用（加法不破坏）；新增「领域 → 需求」跳转复用产出分析路由；server 扫描依赖既有 `KNOWLEDGE_BASE_ROOT` 只读卷（部署已具备）。

## 11. 已知局限

- 分母 = 服务器当前快照，非各用户历史版本；本机 mock 库不全 → 覆盖率偏低/降级，符合预期。
- recall-only 路径（库里已删/重命名）不计覆盖率，单列 orphan 作目录漂移信号。
- 跨库同名 domain 罕见歧义 → 归「未知」。
- mtime 作「加入时间」是 best-effort（卷无 `.git` 时不区分新增/历史，全部按 mtime）。

## 12. 文档保鲜

落地同步更新：`docs/api-contract.md`（coverage / docs / content/by-path 三接口 + config）、`docs/database-model.md`（无表变更，注明知识库资产口径来自只读扫描 + 现有表，及 repo 推导规则）、`README.md`（扫描弱依赖与快照口径说明；知识库挂载已具备）。
