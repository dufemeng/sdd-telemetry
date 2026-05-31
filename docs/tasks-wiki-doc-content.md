# 抽屉内查看知识库文档内容 + 部署零摩擦 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 点击交互抽屉里 Read 类 wiki 标签，在居中 Modal 渲染该知识库文档内容；并让换服务器冷启动不被环境变量卡住。

**Architecture:** 后端新增只读接口 `GET /api/sdd/wiki-recalls/content/:toolCallId`，按 `tool_call_id` 查 `sdd_wiki_recalls` 取「仓库名+相对路径」，重映射到 `KNOWLEDGE_BASE_ROOT` 后 `fs` 读取（越权守卫 + 大小上限，读不到分级降级）。前端共享抽屉 wiki 标签可点 → `WikiDocModal` 用 `react-markdown` 渲染。知识库不入仓不入镜像，运行时挂只读卷；部署脚本自动建知识库目录、自动生成 `AUTH_SESSION_SECRET`、从本地 bundle 自动识别 VERSION。

**Tech Stack:** TypeScript / MidwayJS（server，mysql2 raw SQL via TypeORM dataSource）/ Zod contract（`packages/api`）/ React 19 + TanStack Query + motion/react + react-markdown（web）/ vitest / docker compose + bash 部署脚本。

**设计依据：** `docs/design-wiki-doc-content.md`。

**关联现状：** 并行需求「文档生成对话归因」已于本分支落地（commit `3775aba`→`8e17bd9`），其改过的共享文件（`sdd.contract.ts`、`sdd-query.repository.ts` / `.service.ts`）已在 `main`；本计划在其之上做增量，无合并冲突。**本需求对 `InteractionDetailDrawer` 的改动必须保持纯加法**（对方依赖抽屉作为下钻终点）。

**测试取向：** 纯逻辑（仓库名推断 / 路径解析越权守卫）走 vitest 单测（TDD）；接口 / SQL / 接线走「typecheck + build + 可证伪 curl」；前端走 typecheck + build + 目视；部署脚本走 `bash -n` 语法校验 + 本地 dry-run。

**SQL 速记（验证用）：**
```bash
SQL() { docker exec -i sdd-telemetry-mysql mysql -usdd-telemetry -psdd-telemetry sdd-telemetry -t -e "$1"; }
```

---

### Task 1: 后端配置 `knowledgeBase`

**Files:**
- Modify: `server/src/config/config.default.ts`

- [ ] **Step 1: 在 config.default.ts 末尾追加 knowledgeBase 配置块**

在 `redis: { ... },` 之后、对象闭合 `};` 之前，加：

```ts
  knowledgeBase: {
    rootPath: process.env.KNOWLEDGE_BASE_ROOT ?? '',
    contentMaxBytes: Number(process.env.WIKI_CONTENT_MAX_BYTES ?? 512 * 1024),
  },
```

- [ ] **Step 2: typecheck**

Run: `pnpm --filter @sdd-telemetry/server lint`
Expected: 无类型错误。

- [ ] **Step 3: 提交**

```bash
git add server/src/config/config.default.ts
git commit -m "feat(server): 新增 knowledgeBase 配置（KNOWLEDGE_BASE_ROOT + 大小上限）"
```

---

### Task 2: 纯函数 `deriveRepoName` / `resolveWikiContentPath`（TDD）

**Files:**
- Create: `server/src/modules/sdd/wiki-content.ts`
- Test: `server/test/wiki-content.test.ts`

- [ ] **Step 1: 写失败的单测**

`server/test/wiki-content.test.ts`：

```ts
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { deriveRepoName, resolveWikiContentPath } from '../src/modules/sdd/wiki-content';

describe('deriveRepoName', () => {
  it('rawPath 以 relativePath 结尾时，取仓库根目录名', () => {
    expect(
      deriveRepoName(
        '/Users/zhangsan/dev/bk-fe-knowledge-trade/domain-cashier/business/INDEX.md',
        'domain-cashier/business/INDEX.md',
      ),
    ).toBe('bk-fe-knowledge-trade');
  });

  it('relativePath 为空时，回退匹配 bk-fe-knowledge-* 段', () => {
    expect(
      deriveRepoName('/Users/x/bk-fe-knowledge-wealth/domain-fund/INDEX.md', null),
    ).toBe('bk-fe-knowledge-wealth');
  });

  it('两者都判不出时返回 null', () => {
    expect(deriveRepoName('/tmp/random/file.md', null)).toBeNull();
  });
});

describe('resolveWikiContentPath', () => {
  it('正常拼接得到仓库内绝对路径', () => {
    const root = '/knowledge';
    expect(resolveWikiContentPath(root, 'bk-fe-knowledge-trade', 'domain-cashier/business/INDEX.md')).toBe(
      path.resolve('/knowledge/bk-fe-knowledge-trade/domain-cashier/business/INDEX.md'),
    );
  });

  it('相对路径越权（../）返回 null', () => {
    expect(resolveWikiContentPath('/knowledge', 'bk-fe-knowledge-trade', '../../etc/passwd')).toBeNull();
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `pnpm --filter @sdd-telemetry/server exec vitest run test/wiki-content.test.ts`
Expected: FAIL —— 模块/导出不存在。

- [ ] **Step 3: 实现纯函数**

`server/src/modules/sdd/wiki-content.ts`：

```ts
import path from 'node:path';

/**
 * 从采集机绝对路径推断知识库仓库目录名。
 * 主路径：rawPath 以 '/'+relativePath 结尾 → 截掉得仓库根 → 取最后一段。
 * 兜底：在路径段里找第一个 bk-fe-knowledge* 段。
 */
export function deriveRepoName(rawPath: string, relativePath: string | null): string | null {
  if (relativePath && rawPath.endsWith(relativePath)) {
    const root = rawPath.slice(0, rawPath.length - relativePath.length).replace(/\/+$/, '');
    const base = root.split('/').pop();
    if (base) return base;
  }
  const seg = rawPath.split('/').find((s) => s.startsWith('bk-fe-knowledge'));
  return seg ?? null;
}

/**
 * 把仓库内相对路径拼到服务器知识库根，带越权守卫。
 * 解析后仍须落在 {root}/{repoName} 内，否则返回 null。
 */
export function resolveWikiContentPath(
  root: string,
  repoName: string,
  relativePath: string,
): string | null {
  const repoDir = path.resolve(root, repoName);
  const target = path.resolve(repoDir, relativePath);
  if (target !== repoDir && !target.startsWith(repoDir + path.sep)) return null;
  return target;
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `pnpm --filter @sdd-telemetry/server exec vitest run test/wiki-content.test.ts`
Expected: PASS（5 passed）。

- [ ] **Step 5: 提交**

```bash
git add server/src/modules/sdd/wiki-content.ts server/test/wiki-content.test.ts
git commit -m "feat(server): wiki 内容路径纯函数（仓库名推断 + 越权守卫）+ 单测"
```

---

### Task 3: 仓库方法 `findWikiRecallForContent`

**Files:**
- Modify: `server/src/modules/sdd/sdd-query.repository.ts`

- [ ] **Step 1: 新增 row 接口**

在 `sdd-query.repository.ts` 的 `WikiRecallListRow` 接口（约 `:277`）之后，加：

```ts
export interface WikiRecallContentSourceRow {
  raw_path: string;
  wiki_relative_path: string | null;
  action_type: string;
}
```

- [ ] **Step 2: 新增查询方法**

在 `SddQueryRepository` 类里、`listInteractionToolCalls`（约 `:591`）之后，加：

```ts
  async findWikiRecallForContent(toolCallId: string): Promise<WikiRecallContentSourceRow | null> {
    const dataSource = await this.mysqlDataSourceManager.getDataSource();
    const rows = (await dataSource.query(
      `SELECT raw_path, wiki_relative_path, action_type
       FROM sdd_wiki_recalls
       WHERE tool_call_id = ?
       ORDER BY id ASC
       LIMIT 1`,
      [toolCallId],
    )) as WikiRecallContentSourceRow[];
    return rows[0] ?? null;
  }
```

- [ ] **Step 3: typecheck**

Run: `pnpm --filter @sdd-telemetry/server lint`
Expected: 无类型错误。

- [ ] **Step 4: 提交**

```bash
git add server/src/modules/sdd/sdd-query.repository.ts
git commit -m "feat(server): 按 tool_call_id 查 wiki 召回内容来源行"
```

---

### Task 4: contract `SddWikiRecallContentSchema`

**Files:**
- Modify: `packages/api/src/contracts/sdd.contract.ts`

- [ ] **Step 1: 新增 schema**

在 `SddInteractionToolCallListResponseSchema`（约 `:250-252`）之后，加：

```ts
export const SddWikiRecallContentSchema = z.object({
  found: z.boolean(),
  reason: z.enum([
    'ok',
    'recall_not_found',
    'not_readable_action',
    'not_configured',
    'repo_missing',
    'file_missing',
    'not_a_file',
  ]),
  repoName: z.string().nullable(),
  relativePath: z.string().nullable(),
  rawPath: z.string().nullable(),
  isMarkdown: z.boolean(),
  content: z.string().nullable(),
  truncated: z.boolean(),
});
```

- [ ] **Step 2: 新增类型导出**

在类型导出区，`SddInteractionToolCallListResponse`（约 `:451-453`）之后，加：

```ts
export type SddWikiRecallContent = z.infer<typeof SddWikiRecallContentSchema>;
```

- [ ] **Step 3: build contract**

Run: `pnpm --filter @sdd-telemetry/api build`
Expected: 构建通过。

- [ ] **Step 4: 提交**

```bash
git add packages/api/src/contracts/sdd.contract.ts
git commit -m "feat(api): 新增 wiki 召回内容响应 schema"
```

---

### Task 5: 服务方法 `getWikiRecallContent`

**Files:**
- Modify: `server/src/modules/sdd/sdd-query.service.ts`

- [ ] **Step 1: 顶部补 import 与依赖**

1. 在文件顶部 Node 内置 import 区加（与现有风格一致，放在第一行）：

```ts
import { promises as fs } from 'node:fs';
import path from 'node:path';
```

2. 在从 `@sdd-telemetry/api` 解构导入的类型里追加 `type SddWikiRecallContent,`。
3. 在从 `../query-utils` 的导入下方，加：

```ts
import { deriveRepoName, resolveWikiContentPath } from './wiki-content';
```

4. 从 `@midwayjs/core` 的导入里确保含 `Config`（该文件已 `import { Inject, Provide } from '@midwayjs/core';`，改为 `import { Config, Inject, Provide } from '@midwayjs/core';`）。

- [ ] **Step 2: 类内加配置注入与内联配置类型**

在 `SddQueryService` 类体内（紧跟现有 `@Inject('sddQueryRepository')` 之后），加：

```ts
  @Config('knowledgeBase')
  knowledgeBaseConfig!: { rootPath: string; contentMaxBytes: number };
```

- [ ] **Step 3: 加服务方法 + 文件读取辅助**

在 `SddQueryService` 类体内、`listInteractionToolCalls` 方法之后（找不到精确锚点就放在类的最后一个方法之后），加：

```ts
  async getWikiRecallContent(toolCallId: string): Promise<SddWikiRecallContent> {
    const row = await this.sddQueryRepository.findWikiRecallForContent(toolCallId);
    if (!row) {
      return emptyWikiContent('recall_not_found', null, null, null);
    }

    const rawPath = row.raw_path;
    const relativePath = row.wiki_relative_path;
    const repoName = deriveRepoName(rawPath, relativePath);

    if (row.action_type !== 'read') {
      return emptyWikiContent('not_readable_action', repoName, relativePath, rawPath);
    }
    const root = this.knowledgeBaseConfig.rootPath;
    if (!root) {
      return emptyWikiContent('not_configured', repoName, relativePath, rawPath);
    }
    if (!repoName || !relativePath) {
      return emptyWikiContent('file_missing', repoName, relativePath, rawPath);
    }

    const target = resolveWikiContentPath(root, repoName, relativePath);
    if (!target) {
      return emptyWikiContent('file_missing', repoName, relativePath, rawPath);
    }

    const repoDir = path.resolve(root, repoName);
    const repoStat = await statOrNull(repoDir);
    if (!repoStat || !repoStat.isDirectory()) {
      return emptyWikiContent('repo_missing', repoName, relativePath, rawPath);
    }
    const fileStat = await statOrNull(target);
    if (!fileStat) {
      return emptyWikiContent('file_missing', repoName, relativePath, rawPath);
    }
    if (!fileStat.isFile()) {
      return emptyWikiContent('not_a_file', repoName, relativePath, rawPath);
    }

    const cap = this.knowledgeBaseConfig.contentMaxBytes;
    const content = await readUpTo(target, cap);
    return {
      found: true,
      reason: 'ok',
      repoName,
      relativePath,
      rawPath,
      isMarkdown: target.toLowerCase().endsWith('.md'),
      content,
      truncated: fileStat.size > cap,
    };
  }
```

并在 `SddQueryService` 类**外**（文件末尾、其它顶层辅助函数旁），加：

```ts
function emptyWikiContent(
  reason: SddWikiRecallContent['reason'],
  repoName: string | null,
  relativePath: string | null,
  rawPath: string | null,
): SddWikiRecallContent {
  return {
    found: false,
    reason,
    repoName,
    relativePath,
    rawPath,
    isMarkdown: false,
    content: null,
    truncated: false,
  };
}

async function statOrNull(p: string): Promise<import('node:fs').Stats | null> {
  try {
    return await fs.stat(p);
  } catch {
    return null;
  }
}

async function readUpTo(file: string, cap: number): Promise<string> {
  const handle = await fs.open(file, 'r');
  try {
    const buf = Buffer.alloc(cap);
    const { bytesRead } = await handle.read(buf, 0, cap, 0);
    return buf.subarray(0, bytesRead).toString('utf8');
  } finally {
    await handle.close();
  }
}
```

- [ ] **Step 4: typecheck + build server**

Run: `pnpm --filter @sdd-telemetry/server lint && pnpm --filter @sdd-telemetry/server build`
Expected: 通过。

- [ ] **Step 5: 提交**

```bash
git add server/src/modules/sdd/sdd-query.service.ts
git commit -m "feat(server): getWikiRecallContent 服务（路径重映射 + 分级降级 + 大小上限）"
```

---

### Task 6: controller 路由 + 可证伪验证

**Files:**
- Modify: `server/src/modules/sdd/sdd.controller.ts`

- [ ] **Step 1: 补 import**

在 contract 的解构 import 里：
1. schema 区加 `SddWikiRecallContentSchema,`
2. 类型区加 `type SddWikiRecallContent,`

- [ ] **Step 2: 加路由**

在 `@Get('/wiki-recalls/list')` 一组路由附近（任意 `/wiki-recalls/*` 路由之后），加：

```ts
  @Get('/wiki-recalls/content/:toolCallId')
  async wikiRecallContent() {
    const toolCallId = this.ctx.params.toolCallId as string;
    const data: SddWikiRecallContent =
      await this.sddQueryService.getWikiRecallContent(toolCallId);
    return ok(parseWithSchema(SddWikiRecallContentSchema, data));
  }
```

- [ ] **Step 3: typecheck + build**

Run: `pnpm --filter @sdd-telemetry/server lint && pnpm --filter @sdd-telemetry/server build`
Expected: 通过。

- [ ] **Step 4: 起服务，配本机 mock 库，可证伪验证**

先找一条 Read 类 wiki 召回的 `tool_call_id`：
```bash
SQL "SELECT tool_call_id, action_type, raw_path, wiki_relative_path
     FROM sdd_wiki_recalls WHERE action_type='read' ORDER BY id DESC LIMIT 3;"
```

A）指向真实 mock 库根 → 期望 `found:true`：
```bash
KNOWLEDGE_BASE_ROOT=/Users/loomisli/Desktop/lm/bk-fe-sdd pnpm --filter @sdd-telemetry/server dev &
# 待启动后（端口 4318）：
curl -s "http://localhost:4318/api/sdd/wiki-recalls/content/<TOOL_CALL_ID>" | head -c 600
```
Expected: `success:true`，`data.found` 为 `true`（mock 库存在该文件时）、`data.isMarkdown:true`、`data.content` 非空；或在 mock 缺该文件时 `found:false` 且 `reason:"file_missing"`。

B）**可证伪**——指向不存在目录 → 必须 `not_configured` / `repo_missing` 区分清楚：
```bash
# 不设 KNOWLEDGE_BASE_ROOT 重启服务后：
curl -s ".../content/<TOOL_CALL_ID>" | grep -o '"reason":"[a-z_]*"'   # 期望 not_configured
# 设 KNOWLEDGE_BASE_ROOT=/tmp/empty（不含 bk-fe-knowledge-* 目录）重启后：
curl -s ".../content/<TOOL_CALL_ID>" | grep -o '"reason":"[a-z_]*"'   # 期望 repo_missing
# 用一个 glob/grep 召回的 tool_call_id：
curl -s ".../content/<GREP_TOOL_CALL_ID>" | grep -o '"reason":"[a-z_]*"' # 期望 not_readable_action
```
Expected: 三种 reason 各自命中（空集能区分「没配」「没 clone」「不是单文件」）。

- [ ] **Step 5: 提交**

```bash
git add server/src/modules/sdd/sdd.controller.ts
git commit -m "feat(server): 新增 wiki 召回内容只读接口"
```

---

### Task 7: 前端引入 markdown 依赖

**Files:**
- Modify: `web/package.json`（由 pnpm 写入）

- [ ] **Step 1: 安装依赖**

Run:
```bash
pnpm --filter @sdd-telemetry/web add react-markdown rehype-sanitize
```
Expected: `web/package.json` 的 `dependencies` 新增 `react-markdown`（^9）与 `rehype-sanitize`（^6）；lockfile 更新。React 19 peer 提示（若有）可忽略。

- [ ] **Step 2: 验证可被解析**

Run: `pnpm --filter @sdd-telemetry/web build`
Expected: 构建通过（尚未引用，仅验证装上）。

- [ ] **Step 3: 提交**

```bash
git add web/package.json pnpm-lock.yaml
git commit -m "build(web): 引入 react-markdown + rehype-sanitize"
```

---

### Task 8: `MarkdownView` 组件

**Files:**
- Create: `web/src/components/sdd/MarkdownView.tsx`

- [ ] **Step 1: 写组件**

`web/src/components/sdd/MarkdownView.tsx`：

```tsx
import ReactMarkdown from 'react-markdown';
import rehypeSanitize from 'rehype-sanitize';

/**
 * 渲染知识库 markdown。图片渲染为占位文本、链接渲染但不可跳转
 * （服务器上相对路径未必解析得了，避免误导）。
 */
export function MarkdownView({ content }: { content: string }) {
  return (
    <div className="text-[13px] leading-6 text-[var(--color-secondary)]">
      <ReactMarkdown
        rehypePlugins={[rehypeSanitize]}
        components={{
          h1: ({ children }) => <h1 className="mb-2 mt-3 text-[18px] font-semibold text-[#f5f5f5]">{children}</h1>,
          h2: ({ children }) => <h2 className="mb-2 mt-3 text-[16px] font-semibold text-[#f5f5f5]">{children}</h2>,
          h3: ({ children }) => <h3 className="mb-1.5 mt-2.5 text-[14px] font-semibold text-[#f5f5f5]">{children}</h3>,
          p: ({ children }) => <p className="mb-2">{children}</p>,
          ul: ({ children }) => <ul className="mb-2 list-disc pl-5">{children}</ul>,
          ol: ({ children }) => <ol className="mb-2 list-decimal pl-5">{children}</ol>,
          li: ({ children }) => <li className="mb-1">{children}</li>,
          blockquote: ({ children }) => (
            <blockquote className="mb-2 border-l-2 border-[var(--color-border)] pl-3 text-[var(--color-muted)]">{children}</blockquote>
          ),
          code: ({ children }) => (
            <code className="rounded-[3px] px-1 py-[1px] text-[12px]" style={{ background: 'var(--color-base)', fontFamily: 'var(--font-mono)' }}>{children}</code>
          ),
          pre: ({ children }) => (
            <pre className="mb-2 overflow-auto rounded-[4px] p-3 text-[12px]" style={{ background: 'var(--color-base)', border: '1px solid var(--color-border)', fontFamily: 'var(--font-mono)' }}>{children}</pre>
          ),
          a: ({ children }) => <span className="text-[var(--color-primary)] underline decoration-dotted">{children}</span>,
          img: ({ alt }) => <span className="text-[var(--color-muted)]">[图片：{alt ?? ''}]</span>,
          table: ({ children }) => <table className="mb-2 w-full border-collapse text-[12px]">{children}</table>,
          th: ({ children }) => <th className="border border-[var(--color-border)] px-2 py-1 text-left">{children}</th>,
          td: ({ children }) => <td className="border border-[var(--color-border)] px-2 py-1">{children}</td>,
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
```

- [ ] **Step 2: typecheck**

Run: `pnpm --filter @sdd-telemetry/web lint`
Expected: 无类型错误。

- [ ] **Step 3: 提交**

```bash
git add web/src/components/sdd/MarkdownView.tsx
git commit -m "feat(web): MarkdownView（sanitize + 图片/链接不可跳）"
```

---

### Task 9: `useWikiRecallContent` hook

**Files:**
- Create: `web/src/components/sdd/useWikiRecallContent.ts`

- [ ] **Step 1: 写 hook**

`web/src/components/sdd/useWikiRecallContent.ts`：

```ts
import { useQuery } from '@tanstack/react-query';
import type { SddWikiRecallContent } from '@sdd-telemetry/api';
import { requestData } from '@/api/client';

export function useWikiRecallContent(toolCallId: string | null) {
  return useQuery({
    queryKey: ['sdd-wiki-recall-content', toolCallId],
    queryFn: () =>
      requestData<SddWikiRecallContent>(`/api/sdd/wiki-recalls/content/${toolCallId}`),
    enabled: Boolean(toolCallId),
    staleTime: 60_000,
  });
}
```

- [ ] **Step 2: typecheck**

Run: `pnpm --filter @sdd-telemetry/web lint`
Expected: 无类型错误（`SddWikiRecallContent` 已由 Task 4 + api build 导出）。

- [ ] **Step 3: 提交**

```bash
git add web/src/components/sdd/useWikiRecallContent.ts
git commit -m "feat(web): useWikiRecallContent 数据层 hook"
```

---

### Task 10: `WikiDocModal` 组件

**Files:**
- Create: `web/src/components/sdd/WikiDocModal.tsx`

- [ ] **Step 1: 写组件**

`web/src/components/sdd/WikiDocModal.tsx`：

```tsx
import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'motion/react';
import { BookOpen, Copy, X } from 'lucide-react';
import type { SddWikiRecallContent } from '@sdd-telemetry/api';
import { MarkdownView } from './MarkdownView';
import { useWikiRecallContent } from './useWikiRecallContent';

const REASON_HINT: Record<Exclude<SddWikiRecallContent['reason'], 'ok'>, string> = {
  recall_not_found: '未找到该召回记录。',
  not_readable_action: '这是目录浏览 / 检索操作，没有单一文件内容可展示。',
  not_configured: '服务器未配置知识库目录（KNOWLEDGE_BASE_ROOT）。',
  repo_missing: '服务器上未找到该知识库仓库（未 clone）。',
  file_missing: '该文档不在服务器知识库中。',
  not_a_file: '该路径不是一个文件。',
};

export function WikiDocModal({
  toolCallId,
  open,
  onOpenChange,
}: {
  toolCallId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const query = useWikiRecallContent(open ? toolCallId : null);
  const data = query.data;

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onOpenChange(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onOpenChange]);

  if (typeof document === 'undefined') return null;

  return createPortal(
    <AnimatePresence>
      {open ? (
        <motion.div
          key="wiki-doc-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.16 }}
          onClick={() => onOpenChange(false)}
          className="z-[60] grid place-items-center backdrop-blur-sm"
          style={{ position: 'fixed', inset: 0, background: 'rgba(0 0 0 / 0.62)' }}
        >
          <motion.div
            key="wiki-doc-panel"
            initial={{ opacity: 0, scale: 0.97, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: 8 }}
            transition={{ type: 'spring', stiffness: 260, damping: 26 }}
            onClick={(e) => e.stopPropagation()}
            className="flex max-h-[80vh] w-[min(760px,calc(100vw-80px))] flex-col rounded-[8px] shadow-2xl"
            style={{ background: 'var(--color-panel)', border: '1px solid var(--color-border)' }}
            role="dialog"
            aria-modal="true"
          >
            <Header data={data} onCopy={copyText} onClose={() => onOpenChange(false)} />
            <div className="flex-1 overflow-y-auto p-4" style={{ background: 'var(--color-surface)' }}>
              {query.isLoading ? (
                <div className="text-[12px] text-[var(--color-muted)]">正在加载文档…</div>
              ) : query.error ? (
                <div className="text-[12px] text-[var(--color-bad-text)]">
                  加载失败：{query.error instanceof Error ? query.error.message : '未知错误'}
                </div>
              ) : data && data.found && data.content != null ? (
                data.isMarkdown ? (
                  <MarkdownView content={data.content} />
                ) : (
                  <pre className="whitespace-pre-wrap break-words text-[12px] leading-5 text-[var(--color-secondary)]" style={{ fontFamily: 'var(--font-mono)' }}>
                    {data.content}
                  </pre>
                )
              ) : data ? (
                <Degraded data={data} />
              ) : null}
              {data?.truncated ? (
                <div className="mt-3 text-[11px] text-[var(--color-muted)]">（文档较大，已截断显示）</div>
              ) : null}
            </div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>,
    document.body,
  );
}

function Header({
  data,
  onCopy,
  onClose,
}: {
  data: SddWikiRecallContent | undefined;
  onCopy: (v: string) => void;
  onClose: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3 p-4" style={{ borderBottom: '1px solid var(--color-border)' }}>
      <div className="flex min-w-0 items-center gap-2">
        <BookOpen size={16} className="text-[var(--color-primary)]" />
        <div className="min-w-0">
          <div className="truncate text-[13px] font-semibold text-[#f5f5f5]">
            {data?.repoName ?? '知识库文档'}
          </div>
          <div className="truncate text-[11px] text-[var(--color-muted)]" style={{ fontFamily: 'var(--font-mono)' }}>
            {data?.relativePath ?? data?.rawPath ?? ''}
          </div>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        {data?.rawPath ? (
          <button
            type="button"
            title="复制原始路径"
            onClick={() => onCopy(data.rawPath ?? '')}
            className="grid h-8 w-8 place-items-center rounded-[4px] text-[var(--color-muted)] hover:bg-[#222] hover:text-[#f5f5f5]"
          >
            <Copy size={15} />
          </button>
        ) : null}
        <button
          type="button"
          title="关闭"
          onClick={onClose}
          className="grid h-8 w-8 place-items-center rounded-[4px] text-[var(--color-muted)] hover:bg-[#222] hover:text-[#f5f5f5]"
        >
          <X size={18} />
        </button>
      </div>
    </div>
  );
}

function Degraded({ data }: { data: SddWikiRecallContent }) {
  const hint = data.reason === 'ok' ? '' : REASON_HINT[data.reason];
  return (
    <div className="space-y-2 text-[12px]">
      <div className="text-[var(--color-muted)]">{hint}</div>
      {data.rawPath ? (
        <div className="text-[var(--color-muted)]">
          原始路径：<span style={{ fontFamily: 'var(--font-mono)' }}>{data.rawPath}</span>
        </div>
      ) : null}
    </div>
  );
}

function copyText(value: string): void {
  if (!value) return;
  void navigator.clipboard?.writeText(value);
}
```

- [ ] **Step 2: typecheck**

Run: `pnpm --filter @sdd-telemetry/web lint`
Expected: 无类型错误。

- [ ] **Step 3: 提交**

```bash
git add web/src/components/sdd/WikiDocModal.tsx
git commit -m "feat(web): WikiDocModal（居中弹窗 + 分级降级 + 复制路径）"
```

---

### Task 11: 抽屉 wiki 标签可点（纯加法接线）

**Files:**
- Modify: `web/src/components/sdd/InteractionDetailDrawer.tsx`

- [ ] **Step 1: 顶部加 import 与状态**

1. 在文件第一行加：
```ts
import { useState } from 'react';
```
2. 在末尾既有 import 之后加：
```ts
import { WikiDocModal } from './WikiDocModal';
```

- [ ] **Step 2: 组件内加状态、包裹返回、透传回调**

把 `InteractionDetailDrawer` 函数体改为（在 `const toolCallsQuery = ...` 之后加状态；把 `return (<RowInspectorDrawer ...>...</RowInspectorDrawer>)` 包进 Fragment 并追加 Modal；给 `ToolCallsSection` 传 `onOpenWikiDoc`）：

```tsx
  const [wikiDocToolCallId, setWikiDocToolCallId] = useState<string | null>(null);
```

把现有的 `return (` 起、到 `</RowInspectorDrawer>` 止替换为：

```tsx
  return (
    <>
      <RowInspectorDrawer
        open={open}
        onOpenChange={onOpenChange}
        title={inspectorRow?.interactionKey ?? interactionId ?? '交互详情'}
        subtitle={
          inspectorRow?.sessionId
            ? `session ${inspectorRow.sessionId}`
            : interactionId
              ? `row ${interactionId}`
              : undefined
        }
        icon={<TerminalSquare size={18} />}
        badge={inspectorRow ? <StatusBadge status={inspectorRow.status} /> : null}
        row={inspectorRow ?? fallbackRow}
        overview={inspectorRow ? toOverviewFields(inspectorRow) : []}
        fields={inspectorRow ? toDetailFields(inspectorRow) : []}
        textBlocks={inspectorRow ? toTextBlocks(inspectorRow) : []}
        rawData={inspectorRow ?? fallbackRow}
        loading={detailQuery.isLoading}
        error={detailQuery.error instanceof Error ? detailQuery.error.message : null}
      >
        <ToolCallsSection
          calls={toolCallsQuery.data?.items ?? []}
          loading={toolCallsQuery.isLoading}
          error={toolCallsQuery.error instanceof Error ? toolCallsQuery.error.message : null}
          onOpenWikiDoc={setWikiDocToolCallId}
        />
      </RowInspectorDrawer>
      <WikiDocModal
        toolCallId={wikiDocToolCallId}
        open={Boolean(wikiDocToolCallId)}
        onOpenChange={(o) => {
          if (!o) setWikiDocToolCallId(null);
        }}
      />
    </>
  );
```

- [ ] **Step 3: `ToolCallsSection` 接收并透传回调**

把 `ToolCallsSection` 的参数与行映射改为：

```tsx
function ToolCallsSection({
  calls,
  loading,
  error,
  onOpenWikiDoc,
}: {
  calls: SddInteractionToolCall[];
  loading: boolean;
  error: string | null;
  onOpenWikiDoc: (toolCallId: string) => void;
}) {
  return (
    <section className="space-y-2">
      <div className="flex items-center gap-2 text-[13px] font-semibold text-[#f5f5f5]">
        <Wrench size={16} className="text-[var(--color-muted)]" />
        <span>工具调用时间线</span>
      </div>
      {loading ? (
        <div className="text-[12px] text-[var(--color-muted)]">正在加载工具调用...</div>
      ) : null}
      {error ? <div className="text-[12px] text-[#f87171]">工具调用加载失败：{error}</div> : null}
      {!loading && !error ? (
        <DataTable
          headers={['#', '工具', 'wiki', '决策', '状态', '耗时', '入参', '结果']}
          rows={calls.map((call) => toToolCallRow(call, onOpenWikiDoc))}
          emptyText="暂无工具调用"
        />
      ) : null}
    </section>
  );
}
```

- [ ] **Step 4: `toToolCallRow` 渲染可点 wiki 标签（仅 Read）**

把 `toToolCallRow` 改为接收回调，并把 wiki 单元格按 `toolName === 'Read'` 渲染为按钮（其余分支保持原样）：

```tsx
function toToolCallRow(
  call: SddInteractionToolCall,
  onOpenWikiDoc: (toolCallId: string) => void,
): DataTableRow {
  const wikiBadgeClass =
    'inline-flex items-center gap-1 rounded-[4px] px-2 py-[2px] text-[11px] text-[var(--color-primary)]';
  const wikiBadgeStyle = {
    background: 'rgba(250,255,105,0.08)',
    border: '1px solid rgba(250,255,105,0.18)',
  };
  return {
    key: call.toolUseId,
    cells: [
      call.sequence,
      call.toolName,
      call.isWikiRecall ? (
        call.toolName === 'Read' ? (
          <button
            type="button"
            onClick={() => onOpenWikiDoc(call.id)}
            className={`${wikiBadgeClass} cursor-pointer hover:brightness-125`}
            style={wikiBadgeStyle}
            title="查看知识库文档内容"
          >
            <BookOpen size={12} />
            wiki
          </button>
        ) : (
          <span
            className={wikiBadgeClass}
            style={wikiBadgeStyle}
            title={call.skillUsageId ? `skill_usage_id: ${call.skillUsageId}` : '召回 wiki 文件'}
          >
            <BookOpen size={12} />
            wiki
          </span>
        )
      ) : (
        '—'
      ),
      call.decision ?? '—',
      call.success == null ? '—' : <StatusBadge status={call.success ? 'success' : 'failed'} />,
      call.durationMs == null ? '—' : `${call.durationMs} ms`,
      truncate(call.toolInputPreview, 120),
      call.resultSizeBytes == null ? '—' : `${formatInteger(call.resultSizeBytes)} B`,
    ],
  };
}
```

- [ ] **Step 5: typecheck + build web**

Run: `pnpm --filter @sdd-telemetry/web lint && pnpm --filter @sdd-telemetry/web build`
Expected: 通过。

- [ ] **Step 6: 目视验证**

起 `KNOWLEDGE_BASE_ROOT=/Users/loomisli/Desktop/lm/bk-fe-sdd pnpm dev:server` 与 `pnpm dev:web`，打开 `http://localhost:5173/sdd/work-items/3`，进入任一交互抽屉：
- Read 类 wiki 标签可点 → 弹出 Modal，命中则渲染 markdown，未命中显示对应降级文案；
- Glob/Grep 的 wiki 标签不可点（无 hover、无弹窗）。

- [ ] **Step 7: 提交**

```bash
git add web/src/components/sdd/InteractionDetailDrawer.tsx
git commit -m "feat(web): 抽屉 Read 类 wiki 标签可点查看文档内容"
```

---

### Task 12: compose 挂载知识库只读卷

**Files:**
- Modify: `compose.prod.yml`

- [ ] **Step 1: x-app-env 增加两个变量**

在 `x-app-env: &app-env` 块内、`LOG_LEVEL: ${LOG_LEVEL:-info}` 之后，加：

```yaml
  KNOWLEDGE_BASE_ROOT: ${KNOWLEDGE_BASE_ROOT:-/knowledge}
  WIKI_CONTENT_MAX_BYTES: ${WIKI_CONTENT_MAX_BYTES:-524288}
```

- [ ] **Step 2: server 服务挂只读卷**

在 `server:` 服务块内（`depends_on:` 之前或之后），加：

```yaml
    volumes:
      - ${KNOWLEDGE_BASE_HOST_DIR:-./knowledge}:/knowledge:ro
```

- [ ] **Step 3: 校验 compose 语法**

Run: `docker compose -f compose.prod.yml config >/dev/null && echo OK`
Expected: 打印 `OK`（卷与变量解析无误；相对路径 `./knowledge` 相对部署目录解析）。

> 注：本机若无 `./knowledge` 目录，`config` 校验不报错（仅在 `up` 时按需创建）；部署脚本会 `mkdir -p`（Task 13）。

- [ ] **Step 4: 提交**

```bash
git add compose.prod.yml
git commit -m "feat(deploy): server 挂载知识库只读卷 + KNOWLEDGE_BASE_ROOT 默认值"
```

---

### Task 13: 部署脚本零摩擦（建目录 + 自动 secret + 自动 VERSION）

**Files:**
- Modify: `deploy/deploy-docker.sh`

- [ ] **Step 1: 顶部变量加 KNOWLEDGE_BASE_HOST_DIR**

在顶部变量区（`API_PUBLISHED_PORT="${API_PUBLISHED_PORT:-4318}"` 附近）加：

```bash
KNOWLEDGE_BASE_HOST_DIR="${KNOWLEDGE_BASE_HOST_DIR:-./knowledge}"
```

- [ ] **Step 2: 加本地 bundle 自动发现函数**

在 `infer_version_from_bundle()` 函数之后，加：

```bash
discover_local_bundle() {
  # 未显式指定版本/包时，在部署目录与 releases/ 下挑最新的部署 bundle
  ls -t "$DEPLOY_DIR"/sdd-telemetry-deploy-bundle-*.tar.gz \
        "$ARTIFACT_DIR"/sdd-telemetry-deploy-bundle-*.tar.gz 2>/dev/null | head -n1 || true
}
```

- [ ] **Step 3: 在分发前插入自动发现**

在 `BUNDLE="${BUNDLE:-}"` 这一行之后、`if [[ -n "$BUNDLE" ]]; then` 之前，加：

```bash
if [[ -z "$BUNDLE" && -z "$ARCHIVE" && -z "$VERSION" ]]; then
  BUNDLE="$(discover_local_bundle)"
  if [[ -n "$BUNDLE" ]]; then
    printf '自动发现本地部署包：%s\n' "$BUNDLE"
  fi
fi
```

- [ ] **Step 4: 自动建知识库目录并落盘路径**

在已有的 `set_env_value DEPLOY_VERSION "$VERSION"` 之后，加：

```bash
mkdir -p "$KNOWLEDGE_BASE_HOST_DIR"
set_env_value KNOWLEDGE_BASE_HOST_DIR "$KNOWLEDGE_BASE_HOST_DIR"
```

- [ ] **Step 5: 首次部署自动生成 AUTH_SESSION_SECRET**

在现有的：

```bash
if [[ -n "${AUTH_SESSION_SECRET:-}" ]]; then
  set_env_value AUTH_SESSION_SECRET "$AUTH_SESSION_SECRET"
fi
```

之后，加：

```bash
if [[ -z "${AUTH_SESSION_SECRET:-}" ]] && ! grep -q '^AUTH_SESSION_SECRET=' "$ENV_FILE" 2>/dev/null; then
  require_cmd openssl
  set_env_value AUTH_SESSION_SECRET "$(openssl rand -base64 48)"
  printf '已自动生成 AUTH_SESSION_SECRET 并写入 %s（后续复用，不轮换）\n' "$ENV_FILE"
fi
```

- [ ] **Step 6: 语法校验**

Run: `bash -n deploy/deploy-docker.sh && echo OK`
Expected: 打印 `OK`（无语法错误）。

- [ ] **Step 7: 本地 dry-run 验证 set_env_value 行为（不起容器）**

在临时目录验证「自动建目录 + secret 落盘 + 复用不变」逻辑：
```bash
tmp="$(mktemp -d)"; cp deploy/deploy-docker.sh "$tmp/"; cd "$tmp"
# 取出 set_env_value + openssl 片段手动跑一遍核心断言：
touch .env
grep -q '^AUTH_SESSION_SECRET=' .env || echo "AUTH_SESSION_SECRET=$(openssl rand -base64 48)" >> .env
first="$(grep '^AUTH_SESSION_SECRET=' .env)"
grep -q '^AUTH_SESSION_SECRET=' .env || echo "AUTH_SESSION_SECRET=$(openssl rand -base64 48)" >> .env
second="$(grep '^AUTH_SESSION_SECRET=' .env | head -1)"
[ "$first" = "$second" ] && echo "复用不变 OK"
mkdir -p ./knowledge && [ -d ./knowledge ] && echo "建目录 OK"
cd - >/dev/null; rm -rf "$tmp"
```
Expected: 打印 `复用不变 OK` 与 `建目录 OK`（证明已有 secret 不被覆盖、知识库目录可建）。

> 完整 e2e（含 `docker compose up`）只能在有 Docker 的服务器/本机跑：`./deploy/deploy-docker.sh`（包已在部署目录时，不传 VERSION/secret 即可起）。

- [ ] **Step 8: 提交**

```bash
git add deploy/deploy-docker.sh
git commit -m "feat(deploy): 冷启动零摩擦（自动建知识库目录 + 自动 secret + 本地 bundle 自动识别 VERSION）"
```

---

### Task 14: 文档保鲜

**Files:**
- Modify: `README.md`
- Modify: `docs/api-contract.md`

- [ ] **Step 1: README 补部署目录结构与零摩擦冷启动**

在「离线 Docker 部署」相关章节补：
1. 部署目录下新增 `knowledge/`，与 `deploy-docker.sh` 同级，内含 `bk-fe-knowledge-trade/`、`bk-fe-knowledge-wealth/`、`bk-fe-knowledge-loan/` 三个 clone；`server` 容器以 `:ro` 挂载为 `/knowledge`，`KNOWLEDGE_BASE_ROOT=/knowledge`。
2. 知识库**不入仓、不入镜像**（构建上下文之外），仅运行时挂卷；本机 dev 用 `KNOWLEDGE_BASE_ROOT=<本机知识库父目录> pnpm dev:server`。
3. 包已在部署目录时，冷启动 `./deploy/deploy-docker.sh` 即可（自动建 `knowledge/`、自动生成 `AUTH_SESSION_SECRET`、从本地 bundle 文件名自动识别 VERSION）；走 GitHub Release 在线下载仍需显式 `VERSION=<版本>`。

- [ ] **Step 2: api-contract.md 补新接口**

在 SDD 接口区补 `GET /api/sdd/wiki-recalls/content/:toolCallId`：入参 `toolCallId`；返回 `SddWikiRecallContent`（`found / reason / repoName / relativePath / rawPath / isMarkdown / content / truncated`）；`reason` 枚举与各降级语义；说明只读、越权守卫、大小上限、弱依赖降级。

- [ ] **Step 3: 旧路径残留检查（保鲜硬约束）**

Run:
```bash
rg --hidden "ap""ps/(web|server|worker)|\./ap""ps/(web|server|worker)|ap""ps/" . -g '!node_modules/**' -g '!.git/**'
```
Expected: 无新增命中（本次未动目录结构）。

- [ ] **Step 4: 提交**

```bash
git add README.md docs/api-contract.md
git commit -m "docs: 同步知识库内容接口与零摩擦部署说明"
```

---

## 最终验证（对照设计 §12）

- [ ] `pnpm typecheck && pnpm build` 全绿。
- [ ] 后端可证伪：`found:true`（指向 mock 库且文件存在）；`not_configured` / `repo_missing` / `file_missing` / `not_readable_action` 各自命中（空集能区分原因）。
- [ ] 前端：work-items/3 抽屉里 Read 的 wiki 标签弹 Modal 渲染 markdown；glob/grep 的不可点。
- [ ] 部署脚本：`bash -n` 通过；dry-run 证明 secret 复用不变、知识库目录可建。
- [ ] 知识库不入镜像：确认 `docs/`、`../bk-fe-sdd` 不在构建上下文（`.dockerignore` 排除 docs，知识库本就在仓库外）。

---

## Self-Review（计划对照设计 spec）

- **Spec 覆盖**：§3 核心重映射→Task 2/5；§4 用户体验入口/Modal/降级→Task 10/11；§5 后端接口/解析/安全/配置→Task 1/3/4/5/6；§6 前端 hook/Modal/MarkdownView/抽屉→Task 7/8/9/10/11；§7 降级矩阵→Task 5(reason)+Task 10(REASON_HINT)；§8 配置部署/不入镜像→Task 12/14；§9 零摩擦→Task 13；§13 保鲜→Task 14。全部有任务承接。
- **Placeholder 扫描**：无 TBD/TODO；每步给完整代码 + 可执行命令 + 预期。
- **类型一致性**：`SddWikiRecallContent`（Task 4 定义）= 服务返回（Task 5）= 控制器返回（Task 6）= hook 泛型（Task 9）= Modal 消费（Task 10）；`reason` 枚举七值在 contract（Task 4）、`emptyWikiContent`（Task 5）、`REASON_HINT`（Task 10）一致（Modal 的 `REASON_HINT` 用 `Exclude<…,'ok'>` 覆盖其余六值）；`WikiRecallContentSourceRow`（Task 3）字段 `raw_path/wiki_relative_path/action_type` 与服务读取（Task 5）一致；`onOpenWikiDoc(call.id)`（Task 11）传的是 tool_call `id`，与接口 `:toolCallId`、仓库 `WHERE tool_call_id=?`（Task 3）一致。
- **已知取舍**：设计 §5.1 列了 `too_large` reason，本计划改用 `truncated:true`（reason 仍 `ok`），故枚举不含 `too_large`——更干净，无死值。`InteractionDetailDrawer` 改动纯加法（仅加 state/Modal/onClick），不动既有 props 与 `interactionId` 行为，满足与对话归因需求的协同约束。
