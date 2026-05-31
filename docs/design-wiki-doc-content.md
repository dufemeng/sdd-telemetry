# 设计：抽屉内查看知识库文档内容 + 部署零摩擦

状态：待评审
日期：2026-05-31
关联代码：`web/src/components/sdd/InteractionDetailDrawer.tsx`、`server/src/modules/sdd/*`、`server/src/infrastructure/mysql/entities/sdd-wiki-recall.entity.ts`、`compose.prod.yml`、`deploy/deploy-docker.sh`

## 1. 背景与目标

需求详情/交互详情的抽屉（共享组件 `InteractionDetailDrawer`）在「工具调用时间线」里，对命中知识库召回的工具调用会打一个 **wiki** 标签（`call.isWikiRecall`）。目前标签只表明「读了某个知识库文件」，但**看不到文件内容**。

目标：点击 wiki 标签 → 在居中 Modal 中展示该知识库文档的内容（markdown 渲染）。

强约束（来自需求方）：

- 知识库是用户本地 clone 的 git 仓库，目前三个：`bk-fe-knowledge-trade`（交易）、`bk-fe-knowledge-wealth`（理财）、`bk-fe-knowledge-loan`（贷款）。
- **本机是 mock 环境**（知识库不全），**公司服务器才有全量知识库**。所以内容展示只能做**弱依赖**：读得到就展示，读不到就友好降级，绝不影响主流程。
- 知识库**不入仓库、不入镜像**，只在运行时由服务器提供。
- 顺带解决部署痛点：换服务器冷启动不要被环境变量卡住。

## 2. 现状与数据来源

清洗 worker 已经把每次知识库召回落到 `sdd_wiki_recalls` 表，关键列：

| 列 | 含义 | 例 |
|---|---|---|
| `tool_call_id` | 关联的工具调用（FK，已建索引 `idx_recalls_tool_call_id`） | |
| `action_type` | `read` / `glob` / `grep` | `read` |
| `raw_path` | **采集那台机器**上的绝对路径 | `/Users/xxx/.../bk-fe-knowledge-trade/domain-cashier/business/INDEX.md` |
| `wiki_relative_path` | 相对知识库仓库根的路径 | `domain-cashier/business/INDEX.md` |
| `wiki_domain` / `wiki_axis` / `wiki_system` | 解析出的领域/轴/系统 | `cashier` / `business` |

工具调用列表接口 `SddInteractionToolCallSchema` 当前只暴露 `id`、`toolUseId`、`toolName`、`isWikiRecall` 等，**不含** `raw_path` / `wiki_relative_path`。即权威的结构化路径数据在 `sdd_wiki_recalls`，按 `tool_call_id` 可查。

前端没有 markdown 渲染库；`RowInspectorDrawer` 用 `createPortal` + `motion/react` 自实现，无第三方 Dialog 库。共享抽屉 `InteractionDetailDrawer` 被 `InteractionsPage` 和 `WorkItemDetailPage` 两处使用——改一处，两处受益。

## 3. 核心逻辑：为什么不能直接用 `raw_path`

`raw_path` 是**采集机**的绝对路径，公司服务器上根本不存在（可能是同事的 `/Users/zhangsan/...`）。所以服务器**只取「仓库名 + 仓库内相对路径」，丢弃绝对路径前缀，再拼到服务器自己配置的知识库根**。

```
1. 前端点 Read 类 wiki 标签 → Modal → GET /api/sdd/wiki-recalls/content/:toolCallId
2. 后端按 tool_call_id 查 sdd_wiki_recalls → raw_path + wiki_relative_path + action_type
3. repoName = raw_path 去掉结尾的 wiki_relative_path 后的最后一段
            = bk-fe-knowledge-trade        （= 采集机 wikiRootPath 的目录名）
4. target = KNOWLEDGE_BASE_ROOT / repoName / wiki_relative_path
5. 越权守卫（target 仍在 KNOWLEDGE_BASE_ROOT/repoName 下）+ 大小上限 → fs.readFile
6. 返回 { found, reason, repoName, relativePath, rawPath, isMarkdown, content, truncated }
```

同一条数据，本机解析到 mock 文件、服务器解析到全量文件，差异只在 `KNOWLEDGE_BASE_ROOT` 指向哪里。

## 4. 用户体验

- **入口**：`InteractionDetailDrawer` 工具调用表格的 wiki 标签。**仅当 `isWikiRecall && toolName === 'Read'` 时可点**（glob/grep 没有单一文件，标签保持不可点原样）。
- **展示**：点击 → 居中 Modal，背后抽屉变暗（更高 z-index 遮罩），`Esc` / 点遮罩关闭。
  - 头部：`库名 / 领域 · 相对路径` + 复制 `rawPath` 按钮。
  - 正文：`.md` 渲染 markdown；非 `.md` 用 `<pre>` 原样。
  - 图片渲染为 alt 文本、知识库内部相对链接渲染但**不可跳转**（服务器上相对路径未必解析得了，避免误导）。
- **降级**：读不到时 Modal 仍打开，正文显示对应提示 + 仍展示 `rawPath`/相对路径（见 §7 降级矩阵）。

## 5. 后端设计（server，sdd 模块内新增只读接口）

### 5.1 接口

`GET /api/sdd/wiki-recalls/content/:toolCallId`（对齐现有 `/wiki-recalls/*` 命名与 `@Controller('/api/sdd')`）。

响应（新增 contract `SddWikiRecallContentSchema`）：

```ts
{
  found: boolean,
  reason: 'ok' | 'recall_not_found' | 'not_readable_action'
        | 'not_configured' | 'repo_missing' | 'file_missing'
        | 'not_a_file' | 'too_large',
  repoName: string | null,        // 推断出的知识库仓库名
  relativePath: string | null,    // wiki_relative_path
  rawPath: string | null,         // 原始采集路径，仅用于展示/复制
  isMarkdown: boolean,
  content: string | null,
  truncated: boolean,             // 超过大小上限时只返回前 N 字节
}
```

### 5.2 解析算法（repository + service）

```
row = findWikiRecallByToolCallId(toolCallId)
if !row                       → { found:false, reason:'recall_not_found' }
if row.actionType !== 'read'  → { found:false, reason:'not_readable_action', repoName, relativePath, rawPath }

repoName = deriveRepoName(row.rawPath, row.wikiRelativePath)
root = config.knowledgeBaseRoot              // process.env.KNOWLEDGE_BASE_ROOT
if !root                      → { found:false, reason:'not_configured', repoName, relativePath, rawPath }

repoDir = path.resolve(root, repoName)
target  = path.resolve(repoDir, row.wikiRelativePath)
if !target.startsWith(repoDir + path.sep)  → { found:false, reason:'file_missing' }   // 越权守卫
if !exists(repoDir)           → { found:false, reason:'repo_missing', ... }
if !exists(target)            → { found:false, reason:'file_missing', ... }
stat = fs.stat(target)
if !stat.isFile()             → { found:false, reason:'not_a_file', ... }

cap = config.wikiContentMaxBytes (默认 512 KB)
content = read(target, 至多 cap 字节, utf8); truncated = stat.size > cap
isMarkdown = target 以 .md 结尾
→ { found:true, reason:'ok', repoName, relativePath, rawPath, isMarkdown, content, truncated }
```

`deriveRepoName(rawPath, relativePath)`：
- 主路径：`rawPath` 以 `/<relativePath>` 结尾时，截掉得到 `wikiRootPath`，取 `basename`。
- 兜底：在 `rawPath` 段里找第一个以 `bk-fe-knowledge` 开头的段。

**假设**：服务器 clone 的目录名 == 采集机仓库目录名（默认 `git clone` 行为，三个库都是 `bk-fe-knowledge-*`）。

### 5.3 安全

- 只读、不暴露目录列表；越权守卫确保最终路径仍在 `KNOWLEDGE_BASE_ROOT/repoName` 内。
- 大小上限避免读超大文件。
- 路径来自本系统清洗后的 DB（已被 `parseWikiPath` 规范化），不接受前端任意路径。

### 5.4 配置项

`server/src/config/config.default.ts` 新增：

```ts
knowledgeBaseRoot: process.env.KNOWLEDGE_BASE_ROOT ?? null,
wikiContentMaxBytes: Number(process.env.WIKI_CONTENT_MAX_BYTES ?? 512 * 1024),
```

`KNOWLEDGE_BASE_ROOT` 未配置 → 接口返回 `not_configured` 降级，不报错。

## 6. 前端设计（web）

- **新依赖**：`react-markdown` + `rehype-sanitize`。
- **`MarkdownView`（薄封装）**：`react-markdown` + `rehype-sanitize`；`components` 覆盖：`img` → 渲染 alt 文本、`a` → 渲染文本但去掉跳转。用现有 design token 设排版样式。
- **`useWikiRecallContent(toolCallId)`**：TanStack Query，`enabled: !!toolCallId`（Modal 打开才取），打 `GET /api/sdd/wiki-recalls/content/:toolCallId`。
- **`WikiDocModal`**：`createPortal` + `motion/react`，风格对齐 `RowInspectorDrawer`，z-index 高于抽屉，遮罩变暗，`Esc`/点遮罩关闭。按 `found`/`reason` 渲染内容或降级提示。**仅此一处使用，不过早抽通用 Modal**。
- **改 `InteractionDetailDrawer`**：在组件内加 `selectedWikiToolCallId` 状态与 `<WikiDocModal>`；wiki 单元格在 `isWikiRecall && toolName==='Read'` 时渲染为可点 `button`，点击 `setSelectedWikiToolCallId(call.id)`。需把回调透传进 `ToolCallsSection` 的行映射（`toToolCallRow` 增加一个 `onOpenWikiDoc` 入参或闭包）。

## 7. 弱依赖降级矩阵（Modal 行为）

| 情况 | reason | Modal 表现 |
|---|---|---|
| 读到 | `ok` | 渲染 markdown / `<pre>` + 头部元信息（超限附「已截断」） |
| 召回记录找不到 | `recall_not_found` | 「未找到该召回记录」 |
| glob/grep 误触 | `not_readable_action` | 「目录/检索，无单文件内容」（正常不可达，标签已禁点） |
| 未配置根目录 | `not_configured` | 「服务器未配置知识库目录」+ 显示 rawPath/相对路径 |
| 仓库未 clone | `repo_missing` | 「未找到知识库 `<repoName>`」 |
| 文件不存在 | `file_missing` | 「文档不在服务器」 |
| 非常规文件 | `not_a_file` | 「该路径不是文件」 |
| 加载/网络异常 | — | spinner / 错误提示 |

## 8. 配置与部署

### 8.1 知识库不入仓、不入镜像（物理隔离）

- docker 构建上下文 = 仓库根 `sdd-telemetry/`；知识库在仓库目录之外（`../bk-fe-sdd/...`），`COPY . .` 够不到——**物理上无法 bake 进镜像**。
- 镜像只含 `server/dist`、`worker/dist`、`packages/api/dist`、`node_modules`、`web/dist`；`.dockerignore` 另排除 `docs`、`dist`、`.env`。
- 知识库内容**运行时**由 docker 只读卷从服务器磁盘注入；同一个镜像在本机（mock）与服务器（全量）通用，差异只在挂载的卷与 `KNOWLEDGE_BASE_ROOT`。

### 8.2 服务器目录结构（知识库与 `deploy-docker.sh` 同级）

```
~/project/sdd-telemetry-deploy/        ← 部署目录（DEPLOY_DIR）
  ├── deploy-docker.sh
  ├── compose.prod.yml
  ├── .env                             脚本自动维护
  ├── releases/                        镜像包
  └── knowledge/                       ← 知识库，和脚本同级
      ├── bk-fe-knowledge-trade/
      ├── bk-fe-knowledge-wealth/
      └── bk-fe-knowledge-loan/
```

### 8.3 compose 改动

`x-app-env` 锚点新增（容器内路径，有默认）：

```yaml
KNOWLEDGE_BASE_ROOT: ${KNOWLEDGE_BASE_ROOT:-/knowledge}
WIKI_CONTENT_MAX_BYTES: ${WIKI_CONTENT_MAX_BYTES:-524288}
```

`server` 服务新增只读卷（相对路径，相对部署目录解析）：

```yaml
server:
    volumes:
      - ${KNOWLEDGE_BASE_HOST_DIR:-./knowledge}:/knowledge:ro
```

未 clone 也只是空目录 → 功能降级，不报错。

### 8.4 本机 mock（dev，不走 docker）

`pnpm dev:server` 直接在 mac 上跑 node，`KNOWLEDGE_BASE_ROOT` 指向本机 mock 库父目录即可：

```bash
KNOWLEDGE_BASE_ROOT=/Users/loomisli/Desktop/lm/bk-fe-sdd pnpm dev:server
```

此时 `target` 恰好 == `raw_path`（采集机就是本机），mock 有的文件读得到、没有的降级——同机即可自测两条路径。

## 9. 部署零摩擦（deploy-docker.sh 增强）

目标：换服务器冷启动不被环境变量卡住。现状：compose 里几乎所有变量都有默认值，真正硬必填的**只有 `AUTH_SESSION_SECRET`**（`${AUTH_SESSION_SECRET:?}`）。

三处增强（均沿用脚本已有的 `set_env_value` upsert）：

1. **自动建知识库目录 + 落盘路径**：部署前 `mkdir -p "$DEPLOY_DIR/knowledge"`，`set_env_value KNOWLEDGE_BASE_HOST_DIR ./knowledge`。挂载永不因缺目录报错。
2. **自动生成 `AUTH_SESSION_SECRET`**：`.env` 无该值且未传入时，`openssl rand -base64 48` 生成并落盘；已有则复用（**绝不轮换**，否则全部登录失效）。
3. **VERSION 自动发现**：未设 `VERSION`/`BUNDLE`/`ARCHIVE` 时，自动在部署目录/`releases/` 选最新的 `sdd-telemetry-deploy-bundle-*.tar.gz`，从文件名反推 VERSION（复用已有 `infer_version_from_bundle`）。

效果（**包已在服务器**时）：

```bash
./deploy/deploy-docker.sh        # 不传 VERSION、不传 secret、不碰环境变量
```

**诚实边界**：若走「服务器从 GitHub Release 按版本下载」那条路，VERSION 仍需显式给出（否则无从判断下哪个版本）；本设计不引入「查最新 release」的网络依赖。

## 10. 范围与影响（四项自检 — 命中 API contract / env / 共享组件 / 部署脚本）

- **复用**：复用 sdd 模块、`sdd_wiki_recalls` 既有权威数据、抽屉的 `createPortal`+`motion` 模式、`deploy-docker.sh` 的 `set_env_value`/`infer_version_from_bundle`。markdown 库无现成 → 必要新增。
- **抽象**：`WikiDocModal` 仅此一处用 → 不过早抽通用 Modal；`MarkdownView` 薄封装（wiki-recalls 看板将来可能复用，先不强抽）。
- **破坏性**：新增**独立只读接口**，不动工具调用列表 schema；只给 wiki 标签加 `onClick`；新增 env 全有默认、卷为只读且缺失即降级 → 不破坏现有编译/行为/未配置环境；无 DB 迁移。部署脚本增强均为「无值才补」，不改既有部署结果。
- **影响**：共享抽屉 → `InteractionsPage` + `WorkItemDetailPage` 两处 wiki 标签同时可点，与「哪里看到 wiki 都能看内容」一致。后端纯只读、无写。

## 11. 不做项（YAGNI）

- 不在 wiki-recalls 看板页加内容查看（本次只做抽屉；未来可扩）。
- 不做 Git 网页地址跳转兜底。
- 不做知识库目录树浏览 / 全文搜索。
- 不为「服务器在线查最新 GitHub Release」做自动版本发现（保留显式 VERSION 兜底）。

## 12. 验证计划（dev 模式、可证伪）

1. **后端**：`KNOWLEDGE_BASE_ROOT` 指向本机 mock 库父目录 → 对一条 `Read INDEX.md` 的召回调接口得 `found:true` + 内容；故意指向不存在目录 → `not_configured`/`repo_missing`/`file_missing` 各自命中（空集要能区分「未配置」vs「文件缺失」）。
2. **前端**：`/sdd/work-items/3` 抽屉里 Read 的 wiki 标签点开出 Modal 并渲染；glob/grep 的 wiki 标签不可点。
3. **部署脚本**：临时空目录跑脚本（指向本地 bundle），验证 `.env` 自动补 `AUTH_SESSION_SECRET`、`KNOWLEDGE_BASE_HOST_DIR`，且 VERSION 能从 bundle 文件名自动识别；二次运行复用既有 secret 不变。
4. `pnpm typecheck` + `pnpm build`。

## 13. 文档保鲜

落地时同步更新：`README.md`（部署目录结构 + 知识库挂载 + 零摩擦冷启动）、`docs/api-contract.md`（新增内容接口）。

## 14. 与「文档生成对话归因」需求的交叉与协同

并行进行中的需求 `docs/design-artifact-conversation-attribution.md` / `docs/tasks-artifact-conversation-attribution.md`。两者**逻辑解耦、可并行**，交叉点如下：

**核心盘子不重叠**：对方重度改 worker + 新增 `sdd_work_item_artifact_turns` 表/迁移/实体；本需求**不碰 worker、无迁移、无新表**（故不会与其迁移序号 `1780000004000` 冲突）。

**同文件不同区域（仅合并协调，无逻辑冲突）**：
- `packages/api/src/contracts/sdd.contract.ts`：对方改 `SddArtifactWriteSchema`；本需求**新增** `SddWikiRecallContentSchema`。
- `server/src/modules/sdd/{sdd-query.repository.ts, sdd-query.service.ts, sdd.controller.ts}`：对方改 `listArtifactWrites`；本需求**新增**内容查询方法 + 路由 `/wiki-recalls/content/:toolCallId`。
- `docs/api-contract.md`：各写各小节。

**`InteractionDetailDrawer`——正向协同（关键）**：对方把抽屉当下钻终点（时间线节点 → `onOpenTurn` → 抽屉看全文），**不改抽屉本身**；本需求**增强抽屉内部**（wiki 标签可点看内容）。对方让更多「讨论 turn」在抽屉里被打开，其中强制召回 wiki 的（`/bk-fe-proposal`、`/bk-fe-design`）正好用上本功能——对方引流、本功能补内容。**约束：本需求对抽屉的改动必须保持纯加法**（只加 `onClick` + Modal，不动现有 props/字段/`interactionId` 行为），因对方依赖抽屉作为下钻终点。

**`sdd_wiki_recalls`——两边只读、概念同源**：对方在时间线节点显示「wiki×N」（只读聚合），本需求按 `tool_call_id` 读单行取路径；都不改表结构。同一份召回数据的两种呈现。

**落地建议**：对方计划更成熟（已到 tasks 级），建议**对方先落、本需求后接**；或本需求独立分支开发，对方合并后 rebase 上述共享文件。两种均低风险。
