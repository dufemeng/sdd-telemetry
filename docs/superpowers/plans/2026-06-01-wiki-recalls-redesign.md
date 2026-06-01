# 知识库分析重构 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 `/sdd/wiki-recalls`（知识库分析）从 4 个工程 Panel 堆叠重构成「知识资产视角」的 4-section 经营总览，引入 repo（业务线）层与覆盖率/三态死知识口径。

**Architecture:** 后端新增**只读、零迁移**的知识库目录扫描（分母）+ 现有 `sdd_wiki_recalls` 聚合（分子），按 `(repo, relativePath)` 合流出覆盖率；前端重写为 KPI → 三业务线对比 → 趋势+标杆领域 → 资产一览+下钻抽屉，复用现有 `WikiDocModal`/`RowInspectorDrawer`，删除与用户/产出分析重叠的旧 tab。覆盖率为弱依赖：未挂载知识库时降级，累计召回/趋势/标杆照常。

**Tech Stack:** Midway.js（server，`@Controller/@Get/@Config/@Inject`）、TypeORM 原始 SQL（`sdd_wiki_recalls`）、Zod contract（`packages/api`）、React + TanStack Query + Tailwind v4（web）、vitest（server/worker 单测，`server/test/`）。

设计依据：`docs/design-wiki-recalls-redesign.md`，示意：`docs/design-wiki-recalls-redesign.html`。

---

## File Structure

**新增（server）**
- `server/src/modules/sdd/wiki-coverage.ts` — 纯函数：`classifyDoc` + `buildCoverage`（合流 + 三态分桶 + orphan）。
- `server/src/modules/sdd/wiki-scan.ts` — 知识库目录扫描（fs 遍历 .md + mtime + `parseWikiPath` 归一化 + best-effort gitRef）。
- `server/test/wiki-coverage.test.ts`、`server/test/wiki-scan.test.ts` — 单测。

**修改（server）**
- `server/src/config/config.default.ts` — `knowledgeBase` 配置扩展两个字段。
- `server/src/modules/sdd/sdd-query.repository.ts` — 新增两个聚合查询。
- `server/src/modules/sdd/sdd-query.service.ts` — 新增 `getWikiRecallCoverage` / `getWikiRecallDomainDocs` / `getWikiRecallContentByPath`，抽出共享 fs 读取助手。
- `server/src/modules/sdd/sdd.controller.ts` — 3 个新路由。

**修改（packages/api）**
- `packages/api/src/contracts/sdd.contract.ts` — coverage / domain-docs 响应 schema（by-path 复用 `SddWikiRecallContentSchema`）。

**重写/新增（web）** — `web/src/pages/sdd/wiki-recalls/`
- `WikiRecallsPage.tsx`（重写）、`useWikiRecalls.ts`（增 3 hook、删 2 孤儿 hook、保留 `useWikiRecallList`）。
- `styles.ts`（新）、`components/{BusinessLineCompare,RecallTrendChart,TopDomains,AssetTable,DomainDrawer}.tsx`（新）。
- 删除 `tabs/{UserRankingTab,WorkItemRankingTab,WikiHeatmapTab,TimelineTab}.tsx`。
- 修改 `web/src/components/sdd/WikiDocModal.tsx` + `useWikiRecallContent.ts`：内容来源支持 `toolCallId` 或 `{repo, relativePath}`。

> 注：web 侧本仓库无单测设施（`find` 仅 server/worker 有 `*.test.ts`），故前端任务用 `pnpm typecheck` + `pnpm build` + 页面检查验收，不写前端单测。后端逻辑核心走 vitest TDD。

---

## Task 1: Contract schemas（packages/api）

**Files:**
- Modify: `packages/api/src/contracts/sdd.contract.ts`（在 `WikiRecallListResponseSchema` 之后、types 导出之前插入）

- [ ] **Step 1: 新增 schema**

在 `WikiRecallListResponseSchema`（约 445 行）之后插入：

```ts
// ── 知识资产覆盖率（redesign）──
export const WikiCoverageRepoSchema = z.object({
  repo: z.string(),            // 短键：trade / loan / wealth
  label: z.string(),           // 中文：交易 / 融资 / 理财
  totalDocs: z.number(),
  recalledDocs: z.number(),
  coverageRate: z.number(),    // 0..1
  recalls: z.number(),
  deadDocs: z.number(),
  newUnreadDocs: z.number(),
  distinctUsers: z.number(),
});
export const WikiCoverageDomainSchema = z.object({
  repo: z.string(),
  domain: z.string(),
  totalDocs: z.number(),
  recalledDocs: z.number(),
  recalls: z.number(),
  deadDocs: z.number(),
  newUnreadDocs: z.number(),
  distinctUsers: z.number(),
  lastRecallAt: ISODateTimeSchema.nullable(),
});
export const WikiCoverageResponseSchema = z.object({
  scan: z.object({
    configured: z.boolean(),
    repos: z.array(z.object({
      repo: z.string(),
      label: z.string(),
      gitRef: z.string().nullable(),
      scannedAt: ISODateTimeSchema,
    })),
  }),
  totals: z.object({
    totalDocs: z.number(),
    recalledDocs: z.number(),
    coverageRate: z.number(),
    recalls: z.number(),
    coldDocs: z.number(),
    deadDocs: z.number(),
    newUnreadDocs: z.number(),
    orphanPaths: z.number(),
  }),
  repos: z.array(WikiCoverageRepoSchema),
  domains: z.array(WikiCoverageDomainSchema),
});

export const WikiDomainDocSchema = z.object({
  relativePath: z.string(),
  recallCount: z.number(),
  distinctUsers: z.number(),
  lastRecallAt: ISODateTimeSchema.nullable(),
  lastToolCallId: IdSchema.nullable(),
  status: z.enum(['hot', 'cold', 'dead', 'new']),
  addedAt: ISODateTimeSchema.nullable(),
});
export const WikiDomainDocsResponseSchema = z.object({
  repo: z.string(),
  domain: z.string(),
  items: z.array(WikiDomainDocSchema),
});
```

- [ ] **Step 2: 新增 type 导出**

在 types 区（`WikiRecallListResponse` 导出附近）追加：

```ts
export type WikiCoverageResponse = z.infer<typeof WikiCoverageResponseSchema>;
export type WikiCoverageRepo = z.infer<typeof WikiCoverageRepoSchema>;
export type WikiCoverageDomain = z.infer<typeof WikiCoverageDomainSchema>;
export type WikiDomainDoc = z.infer<typeof WikiDomainDocSchema>;
export type WikiDomainDocsResponse = z.infer<typeof WikiDomainDocsResponseSchema>;
```

- [ ] **Step 3: build 验证**

Run: `pnpm --filter @sdd-telemetry/api build`
Expected: 构建通过，`packages/api/dist` 更新。

- [ ] **Step 4: Commit**

```bash
git add packages/api/src/contracts/sdd.contract.ts
git commit -m "feat(api): 新增知识资产覆盖率与领域文档清单 contract"
```

---

## Task 2: 扩展 knowledgeBase 配置（server）

**Files:**
- Modify: `server/src/config/config.default.ts`
- Modify: `server/src/modules/sdd/sdd-query.service.ts:68-69`（`@Config('knowledgeBase')` 类型）

- [ ] **Step 1: 配置项**

在 `config.default.ts` 的 `knowledgeBase` 块补两字段（保持已有 `rootPath`/`contentMaxBytes`）：

```ts
knowledgeBase: {
  rootPath: process.env.KNOWLEDGE_BASE_ROOT ?? '',
  contentMaxBytes: Number(process.env.WIKI_CONTENT_MAX_BYTES ?? 512 * 1024),
  scanCacheTtlMs: Number(process.env.WIKI_SCAN_CACHE_TTL_MS ?? 600_000),
  deadKnowledgeGraceDays: Number(process.env.WIKI_DEAD_GRACE_DAYS ?? 30),
},
```

- [ ] **Step 2: 同步 service 注入类型**

`sdd-query.service.ts` 第 68-69 行改为：

```ts
@Config('knowledgeBase')
knowledgeBaseConfig!: { rootPath: string; contentMaxBytes: number; scanCacheTtlMs: number; deadKnowledgeGraceDays: number };
```

- [ ] **Step 3: typecheck**

Run: `pnpm --filter @sdd-telemetry/server typecheck`
Expected: 通过。

- [ ] **Step 4: Commit**

```bash
git add server/src/config/config.default.ts server/src/modules/sdd/sdd-query.service.ts
git commit -m "feat(server): knowledgeBase 配置新增扫描缓存与死知识宽限期"
```

---

## Task 3: 覆盖率纯函数 `wiki-coverage.ts`（TDD）

**Files:**
- Create: `server/src/modules/sdd/wiki-coverage.ts`
- Test: `server/test/wiki-coverage.test.ts`

- [ ] **Step 1: 写失败测试**

`server/test/wiki-coverage.test.ts`：

```ts
import { describe, expect, it } from 'vitest';
import { classifyDoc, buildCoverage, type ScannedDoc, type RecallAgg } from '../src/modules/sdd/wiki-coverage';

const DAY = 86_400_000;
const NOW = Date.UTC(2026, 5, 1); // 2026-06-01

describe('classifyDoc', () => {
  it('召回 >= 热门阈值 → hot', () => {
    expect(classifyDoc(10, NOW - 100 * DAY, NOW, 30)).toBe('hot');
  });
  it('召回 1..阈值-1 → cold', () => {
    expect(classifyDoc(3, NOW - 100 * DAY, NOW, 30)).toBe('cold');
  });
  it('零召回且加入 <= 宽限期 → new', () => {
    expect(classifyDoc(0, NOW - 5 * DAY, NOW, 30)).toBe('new');
  });
  it('零召回且加入 > 宽限期 → dead', () => {
    expect(classifyDoc(0, NOW - 40 * DAY, NOW, 30)).toBe('dead');
  });
});

describe('buildCoverage', () => {
  const scanned: ScannedDoc[] = [
    { repo: 'trade', domain: 'cashier', relativePath: 'domain-cashier/business/INDEX.md', axis: 'business', system: null, mtimeMs: NOW - 100 * DAY },
    { repo: 'trade', domain: 'cashier', relativePath: 'domain-cashier/business/cold.md',  axis: 'business', system: null, mtimeMs: NOW - 100 * DAY },
    { repo: 'trade', domain: 'cashier', relativePath: 'domain-cashier/business/dead.md',  axis: 'business', system: null, mtimeMs: NOW - 40 * DAY },
    { repo: 'trade', domain: 'cashier', relativePath: 'domain-cashier/business/new.md',   axis: 'business', system: null, mtimeMs: NOW - 5 * DAY },
  ];
  const recalls: RecallAgg[] = [
    { repo: 'trade', relativePath: 'domain-cashier/business/INDEX.md', recallCount: 20, distinctUsers: 5, lastRecallAt: '2026-05-30T00:00:00.000Z', lastToolCallId: '111' },
    { repo: 'trade', relativePath: 'domain-cashier/business/cold.md',  recallCount: 2,  distinctUsers: 1, lastRecallAt: '2026-05-20T00:00:00.000Z', lastToolCallId: '222' },
    // 历史读过、当前库已无 → orphan
    { repo: 'trade', relativePath: 'domain-cashier/business/gone.md',  recallCount: 9,  distinctUsers: 3, lastRecallAt: '2026-04-01T00:00:00.000Z', lastToolCallId: '333' },
  ];

  it('利用率 = 被召回 ∩ 库内 / 库内总数', () => {
    const c = buildCoverage(scanned, recalls, NOW, 30);
    expect(c.totals.totalDocs).toBe(4);
    expect(c.totals.recalledDocs).toBe(2);          // INDEX + cold
    expect(c.totals.coverageRate).toBeCloseTo(0.5);
    expect(c.totals.deadDocs).toBe(1);              // dead.md
    expect(c.totals.newUnreadDocs).toBe(1);         // new.md
    expect(c.totals.coldDocs).toBe(1);              // cold.md
    expect(c.totals.orphanPaths).toBe(1);           // gone.md，不计分母
  });

  it('按 repo 汇总与中文 label', () => {
    const c = buildCoverage(scanned, recalls, NOW, 30);
    const trade = c.repos.find((r) => r.repo === 'trade')!;
    expect(trade.label).toBe('交易');
    expect(trade.totalDocs).toBe(4);
    expect(trade.recalls).toBe(22);                 // 20 + 2（orphan 不计）
  });

  it('按 domain 汇总', () => {
    const c = buildCoverage(scanned, recalls, NOW, 30);
    const d = c.domains.find((x) => x.domain === 'cashier')!;
    expect(d.deadDocs).toBe(1);
    expect(d.recalledDocs).toBe(2);
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `pnpm --filter @sdd-telemetry/server exec vitest run test/wiki-coverage.test.ts`
Expected: FAIL（模块不存在）。

- [ ] **Step 3: 实现**

`server/src/modules/sdd/wiki-coverage.ts`：

```ts
export type DocStatus = 'hot' | 'cold' | 'dead' | 'new';

export interface ScannedDoc {
  repo: string;            // 短键 trade/loan/wealth
  domain: string | null;
  relativePath: string;
  axis: string | null;
  system: string | null;
  mtimeMs: number;
}
export interface RecallAgg {
  repo: string;
  relativePath: string;
  recallCount: number;
  distinctUsers: number;
  lastRecallAt: string | null;
  lastToolCallId: string | null;
}
export interface CoverageRepo {
  repo: string; label: string;
  totalDocs: number; recalledDocs: number; coverageRate: number;
  recalls: number; deadDocs: number; newUnreadDocs: number; distinctUsers: number;
}
export interface CoverageDomain {
  repo: string; domain: string;
  totalDocs: number; recalledDocs: number; recalls: number;
  deadDocs: number; newUnreadDocs: number; distinctUsers: number;
  lastRecallAt: string | null;
}
export interface CoverageResult {
  totals: {
    totalDocs: number; recalledDocs: number; coverageRate: number; recalls: number;
    coldDocs: number; deadDocs: number; newUnreadDocs: number; orphanPaths: number;
  };
  repos: CoverageRepo[];
  domains: CoverageDomain[];
}

export const HOT_THRESHOLD = 10;
const REPO_LABEL: Record<string, string> = { trade: '交易', loan: '融资', wealth: '理财' };
export function repoLabel(repo: string): string { return REPO_LABEL[repo] ?? repo; }

export function classifyDoc(recallCount: number, mtimeMs: number, nowMs: number, graceDays: number): DocStatus {
  if (recallCount >= HOT_THRESHOLD) return 'hot';
  if (recallCount >= 1) return 'cold';
  return nowMs - mtimeMs <= graceDays * 86_400_000 ? 'new' : 'dead';
}

const key = (repo: string, rel: string) => `${repo} ${rel}`;

export function buildCoverage(
  scanned: ScannedDoc[],
  recalls: RecallAgg[],
  nowMs: number,
  graceDays: number,
): CoverageResult {
  const recallByKey = new Map<string, RecallAgg>();
  for (const r of recalls) recallByKey.set(key(r.repo, r.relativePath), r);

  const repoAgg = new Map<string, CoverageRepo>();
  const domainAgg = new Map<string, CoverageDomain>();
  const totals = { totalDocs: 0, recalledDocs: 0, coverageRate: 0, recalls: 0, coldDocs: 0, deadDocs: 0, newUnreadDocs: 0, orphanPaths: 0 };

  const repoOf = (repo: string): CoverageRepo => {
    let v = repoAgg.get(repo);
    if (!v) { v = { repo, label: repoLabel(repo), totalDocs: 0, recalledDocs: 0, coverageRate: 0, recalls: 0, deadDocs: 0, newUnreadDocs: 0, distinctUsers: 0 }; repoAgg.set(repo, v); }
    return v;
  };
  const domainOf = (repo: string, domain: string): CoverageDomain => {
    const k = key(repo, domain);
    let v = domainAgg.get(k);
    if (!v) { v = { repo, domain, totalDocs: 0, recalledDocs: 0, recalls: 0, deadDocs: 0, newUnreadDocs: 0, distinctUsers: 0, lastRecallAt: null }; domainAgg.set(k, v); }
    return v;
  };

  for (const doc of scanned) {
    const r = recallByKey.get(key(doc.repo, doc.relativePath));
    const count = r?.recallCount ?? 0;
    const status = classifyDoc(count, doc.mtimeMs, nowMs, graceDays);
    const repo = repoOf(doc.repo);
    const domain = domainOf(doc.repo, doc.domain ?? '(未识别)');

    totals.totalDocs++; repo.totalDocs++; domain.totalDocs++;
    if (count >= 1) {
      totals.recalledDocs++; repo.recalledDocs++; domain.recalledDocs++;
      totals.recalls += count; repo.recalls += count; domain.recalls += count;
      repo.distinctUsers += r!.distinctUsers; domain.distinctUsers += r!.distinctUsers;
      if (status === 'cold') totals.coldDocs++;
      if (r!.lastRecallAt && (!domain.lastRecallAt || r!.lastRecallAt > domain.lastRecallAt)) domain.lastRecallAt = r!.lastRecallAt;
    }
    if (status === 'dead') { totals.deadDocs++; repo.deadDocs++; domain.deadDocs++; }
    if (status === 'new')  { totals.newUnreadDocs++; repo.newUnreadDocs++; domain.newUnreadDocs++; }
  }

  // orphan：召回里有、扫描里无的 (repo, relativePath)
  const scannedKeys = new Set(scanned.map((d) => key(d.repo, d.relativePath)));
  for (const r of recalls) if (!scannedKeys.has(key(r.repo, r.relativePath))) totals.orphanPaths++;

  totals.coverageRate = totals.totalDocs > 0 ? totals.recalledDocs / totals.totalDocs : 0;
  for (const repo of repoAgg.values()) repo.coverageRate = repo.totalDocs > 0 ? repo.recalledDocs / repo.totalDocs : 0;

  return {
    totals,
    repos: [...repoAgg.values()].sort((a, b) => b.recalls - a.recalls),
    domains: [...domainAgg.values()].sort((a, b) => b.recalls - a.recalls),
  };
}
```

- [ ] **Step 4: 运行确认通过**

Run: `pnpm --filter @sdd-telemetry/server exec vitest run test/wiki-coverage.test.ts`
Expected: PASS（7 个用例）。

- [ ] **Step 5: Commit**

```bash
git add server/src/modules/sdd/wiki-coverage.ts server/test/wiki-coverage.test.ts
git commit -m "feat(server): 覆盖率合流纯函数 buildCoverage + classifyDoc（三态分桶）"
```

---

## Task 4: 知识库扫描 `wiki-scan.ts`（TDD，临时目录夹具）

**Files:**
- Create: `server/src/modules/sdd/wiki-scan.ts`
- Test: `server/test/wiki-scan.test.ts`

- [ ] **Step 1: 写失败测试**

`server/test/wiki-scan.test.ts`：

```ts
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { scanKnowledgeBase } from '../src/modules/sdd/wiki-scan';

let root: string;
beforeAll(() => {
  root = mkdtempSync(path.join(tmpdir(), 'kb-'));
  const f = path.join(root, 'bk-fe-knowledge-trade', 'domain-cashier', 'business');
  mkdirSync(f, { recursive: true });
  writeFileSync(path.join(f, 'INDEX.md'), '# index');
  writeFileSync(path.join(f, 'note.txt'), 'ignored'); // 非 .md 不计
});
afterAll(() => rmSync(root, { recursive: true, force: true }));

describe('scanKnowledgeBase', () => {
  it('递归收集 .md，归一化 repo/domain，带 mtime', async () => {
    const result = await scanKnowledgeBase(root);
    expect(result.configured).toBe(true);
    expect(result.docs).toHaveLength(1);
    const doc = result.docs[0]!;
    expect(doc.repo).toBe('trade');
    expect(doc.domain).toBe('cashier');
    expect(doc.relativePath).toBe('domain-cashier/business/INDEX.md');
    expect(doc.mtimeMs).toBeGreaterThan(0);
  });

  it('根不存在 → configured:false，docs 空', async () => {
    const result = await scanKnowledgeBase(path.join(root, 'nope'));
    expect(result.configured).toBe(false);
    expect(result.docs).toEqual([]);
  });

  it('根为空字符串（未配置）→ configured:false', async () => {
    const result = await scanKnowledgeBase('');
    expect(result.configured).toBe(false);
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `pnpm --filter @sdd-telemetry/server exec vitest run test/wiki-scan.test.ts`
Expected: FAIL（模块不存在）。

- [ ] **Step 3: 实现**

`server/src/modules/sdd/wiki-scan.ts`（复用 worker 的归一化口径：把 `parseWikiPath` 同款逻辑内联到 server 端，避免跨包依赖 worker）：

```ts
import { readdir, stat, readFile } from 'node:fs/promises';
import path from 'node:path';
import type { ScannedDoc } from './wiki-coverage';

export interface ScanRepoMeta { repo: string; label: string; gitRef: string | null; scannedAt: string; }
export interface ScanResult { configured: boolean; docs: ScannedDoc[]; repos: ScanRepoMeta[]; }

const REPO_LABEL: Record<string, string> = { trade: '交易', loan: '融资', wealth: '理财' };

// 与 worker/src/jobs/wiki-path.ts parseWikiPath 同口径：L1 domain-<x> / L2 axis / L3 system(apps)
function parseRelative(relative: string): { domain: string | null; axis: string | null; system: string | null } {
  const seg = relative.split('/');
  if (!seg[0]?.startsWith('domain-')) return { domain: null, axis: 'root', system: null };
  const domain = seg[0].slice('domain-'.length);
  const axis = seg[1] ?? null;
  let system: string | null = null;
  if (axis === 'system' && seg[2] === 'apps') system = seg[3] ?? null;
  return { domain, axis, system };
}

async function walkMd(dir: string, repoRoot: string, out: { rel: string; mtimeMs: number }[]) {
  let entries;
  try { entries = await readdir(dir, { withFileTypes: true }); } catch { return; }
  for (const e of entries) {
    if (e.name === '.git' || e.name === 'node_modules') continue;
    const abs = path.join(dir, e.name);
    if (e.isDirectory()) await walkMd(abs, repoRoot, out);
    else if (e.isFile() && e.name.toLowerCase().endsWith('.md')) {
      const s = await stat(abs).catch(() => null);
      if (s) out.push({ rel: path.relative(repoRoot, abs).split(path.sep).join('/'), mtimeMs: s.mtimeMs });
    }
  }
}

async function readGitRef(repoRoot: string): Promise<string | null> {
  const head = await readFile(path.join(repoRoot, '.git', 'HEAD'), 'utf8').catch(() => null);
  if (!head) return null;
  const m = head.trim().match(/^ref:\s*(.+)$/);
  if (!m) return head.trim().slice(0, 12); // detached：直接是 sha
  const sha = await readFile(path.join(repoRoot, '.git', m[1]!), 'utf8').catch(() => null);
  return sha ? sha.trim().slice(0, 12) : null;
}

export async function scanKnowledgeBase(rootPath: string): Promise<ScanResult> {
  if (!rootPath) return { configured: false, docs: [], repos: [] };
  let dirs;
  try { dirs = await readdir(rootPath, { withFileTypes: true }); } catch { return { configured: false, docs: [], repos: [] }; }

  const docs: ScannedDoc[] = [];
  const repos: ScanRepoMeta[] = [];
  const scannedAt = new Date().toISOString();
  for (const d of dirs) {
    if (!d.isDirectory() || !d.name.startsWith('bk-fe-knowledge-')) continue;
    const repo = d.name.replace(/^bk-fe-knowledge-/, '');
    const repoRoot = path.join(rootPath, d.name);
    const files: { rel: string; mtimeMs: number }[] = [];
    await walkMd(repoRoot, repoRoot, files);
    for (const f of files) {
      const { domain, axis, system } = parseRelative(f.rel);
      docs.push({ repo, domain, relativePath: f.rel, axis, system, mtimeMs: f.mtimeMs });
    }
    repos.push({ repo, label: REPO_LABEL[repo] ?? repo, gitRef: await readGitRef(repoRoot), scannedAt });
  }
  return { configured: true, docs, repos };
}
```

- [ ] **Step 4: 运行确认通过**

Run: `pnpm --filter @sdd-telemetry/server exec vitest run test/wiki-scan.test.ts`
Expected: PASS（3 个用例）。

- [ ] **Step 5: Commit**

```bash
git add server/src/modules/sdd/wiki-scan.ts server/test/wiki-scan.test.ts
git commit -m "feat(server): 知识库目录扫描（.md + mtime + 归一化 + gitRef，弱依赖降级）"
```

---

## Task 5: 仓库层聚合查询（server）

**Files:**
- Modify: `server/src/modules/sdd/sdd-query.repository.ts`

- [ ] **Step 1: 新增覆盖率聚合查询**

按 §4.2 假设（同名 domain 不跨库），按 `wiki_relative_path` 分组，`MIN(raw_path)` 用于派生 repo。在 repository class 内新增：

```ts
async aggregateRecallPaths(): Promise<Array<{
  raw_path: string; wiki_relative_path: string; recalls: number; users: number; last_at: string | null;
}>> {
  const ds = await this.mysqlDataSourceManager.getDataSource();
  return ds.query(`
    SELECT MIN(raw_path) AS raw_path,
           wiki_relative_path,
           COUNT(*) AS recalls,
           COUNT(DISTINCT user_id) AS users,
           MAX(event_time) AS last_at
    FROM sdd_wiki_recalls
    WHERE action_type = 'read' AND wiki_relative_path IS NOT NULL AND wiki_relative_path <> ''
    GROUP BY wiki_relative_path
  `);
}
```

- [ ] **Step 2: 新增领域文档召回查询（抽屉用，带最近 tool_call_id）**

```ts
async listDomainDocRecalls(domain: string): Promise<Array<{
  raw_path: string; wiki_relative_path: string; recalls: number; users: number; last_at: string | null; last_tool_call_id: string | null;
}>> {
  const ds = await this.mysqlDataSourceManager.getDataSource();
  return ds.query(`
    SELECT MIN(r.raw_path) AS raw_path,
           r.wiki_relative_path,
           COUNT(*) AS recalls,
           COUNT(DISTINCT r.user_id) AS users,
           MAX(r.event_time) AS last_at,
           SUBSTRING_INDEX(GROUP_CONCAT(r.tool_call_id ORDER BY r.event_time DESC), ',', 1) AS last_tool_call_id
    FROM sdd_wiki_recalls r
    WHERE r.action_type = 'read' AND r.wiki_domain = ? AND r.wiki_relative_path IS NOT NULL
    GROUP BY r.wiki_relative_path
  `, [domain]);
}
```

> 注：`mysqlDataSourceManager` 已是该 repository 的现有注入（其余方法同款用法），无需新增注入。

- [ ] **Step 3: typecheck**

Run: `pnpm --filter @sdd-telemetry/server typecheck`
Expected: 通过。

- [ ] **Step 4: Commit**

```bash
git add server/src/modules/sdd/sdd-query.repository.ts
git commit -m "feat(server): wiki 召回路径聚合查询（覆盖率 + 领域文档清单）"
```

---

## Task 6: 服务层（server）

**Files:**
- Modify: `server/src/modules/sdd/sdd-query.service.ts`

- [ ] **Step 1: 抽出共享 fs 读取助手并改造 getWikiRecallContent**

把 `getWikiRecallContent`（71-122 行）中「root + repoName + relativePath → 读取结果」的部分抽成私有方法，供 by-path 复用。新增：

```ts
private async readWikiContent(
  repoName: string | null,
  relativePath: string | null,
  rawPath: string | null,
): Promise<SddWikiRecallContent> {
  const root = this.knowledgeBaseConfig.rootPath;
  if (!root) return emptyWikiContent('not_configured', repoName, relativePath, rawPath);
  if (!repoName || !relativePath) return emptyWikiContent('file_missing', repoName, relativePath, rawPath);
  const target = resolveWikiContentPath(root, repoName, relativePath);
  if (!target) return emptyWikiContent('file_missing', repoName, relativePath, rawPath);
  const repoStat = await statOrNull(path.resolve(root, repoName));
  if (!repoStat || !repoStat.isDirectory()) return emptyWikiContent('repo_missing', repoName, relativePath, rawPath);
  const fileStat = await statOrNull(target);
  if (!fileStat) return emptyWikiContent('file_missing', repoName, relativePath, rawPath);
  if (!fileStat.isFile()) return emptyWikiContent('not_a_file', repoName, relativePath, rawPath);
  const cap = this.knowledgeBaseConfig.contentMaxBytes;
  return { found: true, reason: 'ok', repoName, relativePath, rawPath, isMarkdown: target.toLowerCase().endsWith('.md'), content: await readUpTo(target, cap), truncated: fileStat.size > cap };
}
```

`getWikiRecallContent` 末段（84-121 行）替换为 `return this.readWikiContent(repoName, relativePath, rawPath);`（保留前面的 `recall_not_found` / `not_readable_action` 分支）。

- [ ] **Step 2: 新增 by-path 内容方法**

```ts
async getWikiRecallContentByPath(repo: string, relativePath: string): Promise<SddWikiRecallContent> {
  const repoName = repo.startsWith('bk-fe-knowledge-') ? repo : `bk-fe-knowledge-${repo}`;
  return this.readWikiContent(repoName, relativePath, null);
}
```

- [ ] **Step 3: 新增覆盖率方法（扫描 + TTL 缓存 + 合流）**

在 class 内加缓存字段与方法（顶部 import 补 `scanKnowledgeBase, type ScanResult` from `./wiki-scan`、`buildCoverage, repoLabel, type RecallAgg` from `./wiki-coverage`）：

```ts
private scanCache: { at: number; result: ScanResult } | null = null;

private async getScan(): Promise<ScanResult> {
  const ttl = this.knowledgeBaseConfig.scanCacheTtlMs;
  if (this.scanCache && Date.now() - this.scanCache.at < ttl) return this.scanCache.result;
  const result = await scanKnowledgeBase(this.knowledgeBaseConfig.rootPath);
  this.scanCache = { at: Date.now(), result };
  return result;
}

async getWikiRecallCoverage(): Promise<WikiCoverageResponse> {
  const scan = await this.getScan();
  const rows = await this.sddQueryRepository.aggregateRecallPaths();
  const recalls: RecallAgg[] = rows.map((r) => ({
    repo: deriveRepoShortKey(r.raw_path, r.wiki_relative_path),
    relativePath: r.wiki_relative_path,
    recallCount: Number(r.recalls),
    distinctUsers: Number(r.users),
    lastRecallAt: r.last_at ? new Date(r.last_at).toISOString() : null,
    lastToolCallId: null,
  }));
  const c = buildCoverage(scan.docs, recalls, Date.now(), this.knowledgeBaseConfig.deadKnowledgeGraceDays);
  return {
    scan: { configured: scan.configured, repos: scan.repos },
    totals: c.totals,
    repos: c.repos,
    domains: c.domains,
  };
}
```

在文件底部 helper 区新增（复用现有 `deriveRepoName`）：

```ts
function deriveRepoShortKey(rawPath: string, relativePath: string | null): string {
  const name = deriveRepoName(rawPath, relativePath) ?? '';
  return name.replace(/^bk-fe-knowledge-/, '') || 'unknown';
}
```

- [ ] **Step 4: 新增领域文档清单方法**

```ts
async getWikiRecallDomainDocs(repo: string, domain: string): Promise<WikiDomainDocsResponse> {
  const scan = await this.getScan();
  const now = Date.now();
  const grace = this.knowledgeBaseConfig.deadKnowledgeGraceDays;
  const rows = await this.sddQueryRepository.listDomainDocRecalls(domain);
  const recallByRel = new Map(rows.map((r) => [r.wiki_relative_path, r]));
  const docs = scan.docs.filter((d) => d.repo === repo && (d.domain ?? '(未识别)') === domain);
  const items = docs.map((d) => {
    const r = recallByRel.get(d.relativePath);
    const count = r ? Number(r.recalls) : 0;
    return {
      relativePath: d.relativePath,
      recallCount: count,
      distinctUsers: r ? Number(r.users) : 0,
      lastRecallAt: r?.last_at ? new Date(r.last_at).toISOString() : null,
      lastToolCallId: r?.last_tool_call_id ? String(r.last_tool_call_id) : null,
      status: classifyDoc(count, d.mtimeMs, now, grace),
      addedAt: new Date(d.mtimeMs).toISOString(),
    };
  }).sort((a, b) => b.recallCount - a.recallCount);
  return { repo, domain, items };
}
```

import 补 `classifyDoc` 与 contract 类型 `WikiCoverageResponse, WikiDomainDocsResponse`。

- [ ] **Step 5: typecheck**

Run: `pnpm --filter @sdd-telemetry/server typecheck`
Expected: 通过。

- [ ] **Step 6: Commit**

```bash
git add server/src/modules/sdd/sdd-query.service.ts
git commit -m "feat(server): 覆盖率/领域文档/按路径取正文 服务方法（扫描 TTL 缓存 + 复用 fs 读取）"
```

---

## Task 7: 控制器路由（server）

**Files:**
- Modify: `server/src/modules/sdd/sdd.controller.ts`（在 `wikiRecallContent`（254-260 行）之后插入）

- [ ] **Step 1: 三个路由**

```ts
@Get('/wiki-recalls/coverage')
async wikiRecallCoverage() {
  const data: WikiCoverageResponse = await this.sddQueryService.getWikiRecallCoverage();
  return ok(parseWithSchema(WikiCoverageResponseSchema, data));
}

@Get('/wiki-recalls/docs')
async wikiRecallDomainDocs() {
  const repo = firstQueryValue(this.ctx.query.repo) ?? '';
  const domain = firstQueryValue(this.ctx.query.domain) ?? '';
  const data: WikiDomainDocsResponse = await this.sddQueryService.getWikiRecallDomainDocs(repo, domain);
  return ok(parseWithSchema(WikiDomainDocsResponseSchema, data));
}

@Get('/wiki-recalls/content/by-path')
async wikiRecallContentByPath() {
  const repo = firstQueryValue(this.ctx.query.repo) ?? '';
  const relativePath = firstQueryValue(this.ctx.query.relativePath) ?? '';
  const data: SddWikiRecallContent = await this.sddQueryService.getWikiRecallContentByPath(repo, relativePath);
  return ok(parseWithSchema(SddWikiRecallContentSchema, data));
}
```

> 路由顺序：`/wiki-recalls/content/by-path` 必须在 `/wiki-recalls/content/:toolCallId` 之后？Midway 按声明匹配——`by-path` 是静态段，`:toolCallId` 是动态段，**把静态 `by-path` 放在动态 `:toolCallId` 之前**以免被吞。将本步的 `content/by-path` 路由声明移到第 254 行 `wikiRecallContent` **之前**。

- [ ] **Step 2: import 补充**

顶部从 `@sdd-telemetry/api` 增补：`WikiCoverageResponse, WikiCoverageResponseSchema, WikiDomainDocsResponse, WikiDomainDocsResponseSchema`（`SddWikiRecallContent(Schema)`、`firstQueryValue`、`ok`、`parseWithSchema` 已在用）。

- [ ] **Step 3: typecheck + build**

Run: `pnpm --filter @sdd-telemetry/server typecheck && pnpm --filter @sdd-telemetry/server build`
Expected: 通过。

- [ ] **Step 4: 链路验证（dev，可证伪）**

```bash
KNOWLEDGE_BASE_ROOT=/Users/loomisli/Desktop/lm/bk-fe-sdd pnpm dev:server
# 另开终端：
curl -s 'http://localhost:7001/api/sdd/wiki-recalls/coverage' | jq '.data.scan.configured, .data.totals'
```
Expected：`configured:true`；`totals.totalDocs > 0`。再故意不带 `KNOWLEDGE_BASE_ROOT` 重启，`configured:false` 且 `totalDocs:0`（区分「未挂载」与「已挂载全未读」）。

- [ ] **Step 5: Commit**

```bash
git add server/src/modules/sdd/sdd.controller.ts
git commit -m "feat(server): 知识资产覆盖率/领域文档/按路径正文 三路由"
```

---

## Task 8: 前端数据层 hooks（web）

**Files:**
- Modify: `web/src/pages/sdd/wiki-recalls/useWikiRecalls.ts`

- [ ] **Step 1: 新增 3 个 hook，删除 2 个孤儿 hook**

删除 `useWikiRecallUserRanking`、`useWikiRecallHeatmap`（仅被将删的 tab 使用）。**保留** `useWikiRecallList`（用户分析页 import）、`useWikiRecallTimeline`、`useWikiRecallWorkItemRanking`。新增：

```ts
import type {
  WikiCoverageResponse, WikiDomainDocsResponse, SddWikiRecallContent,
} from '@sdd-telemetry/api';

export function useWikiRecallCoverage() {
  return useQuery({
    queryKey: ['wiki-recalls', 'coverage'],
    queryFn: () => requestData<WikiCoverageResponse>('/api/sdd/wiki-recalls/coverage'),
  });
}

export function useWikiRecallDomainDocs(repo: string | null, domain: string | null) {
  return useQuery({
    queryKey: ['wiki-recalls', 'docs', repo, domain],
    enabled: !!repo && !!domain,
    queryFn: () =>
      requestData<WikiDomainDocsResponse>(
        `/api/sdd/wiki-recalls/docs?${toQueryString({ repo: repo!, domain: domain! })}`,
      ),
  });
}

export function useWikiRecallDocContentByPath(repo: string | null, relativePath: string | null) {
  return useQuery({
    queryKey: ['wiki-recalls', 'content-by-path', repo, relativePath],
    enabled: !!repo && !!relativePath,
    queryFn: () =>
      requestData<SddWikiRecallContent>(
        `/api/sdd/wiki-recalls/content/by-path?${toQueryString({ repo: repo!, relativePath: relativePath! })}`,
      ),
  });
}
```

- [ ] **Step 2: typecheck**

Run: `pnpm --filter @sdd-telemetry/web typecheck`
Expected: 报错指向 `UserRankingTab`/`WikiHeatmapTab` 仍 import 已删 hook —— 符合预期（下一任务删除这些文件）。

- [ ] **Step 3: Commit**（与 Task 9 一起提交，避免中间不可编译；先不单独 commit）

---

## Task 9: 前端样式常量 + 删除旧 tab（web）

**Files:**
- Create: `web/src/pages/sdd/wiki-recalls/styles.ts`
- Delete: `web/src/pages/sdd/wiki-recalls/tabs/{UserRankingTab,WorkItemRankingTab,WikiHeatmapTab,TimelineTab}.tsx`

- [ ] **Step 1: 共享样式常量**

`styles.ts`：

```ts
export const CARD_STYLE = { border: '1px solid var(--color-border)', background: 'var(--color-surface)' };
export const ICON_BOX = { background: '#141409', color: 'var(--color-primary)' };

export type RepoKey = 'trade' | 'loan' | 'wealth';
export const REPO_LABEL: Record<string, string> = { trade: '交易', loan: '融资', wealth: '理财' };
export const REPO_COLOR: Record<string, string> = {
  trade: 'var(--color-bar-fill)', loan: '#60a5fa', wealth: 'var(--color-good-text)',
};
export function repoTagStyle(repo: string) {
  const color = REPO_COLOR[repo] ?? 'var(--color-secondary)';
  return { color, background: 'rgba(255,255,255,0.06)', border: '1px solid var(--color-border)' };
}
export function coverFillColor(rate: number): string {
  return rate >= 0.65 ? 'var(--color-good-text)' : rate >= 0.45 ? 'var(--color-warn-text)' : 'var(--color-bad-text)';
}
```

- [ ] **Step 2: 删除旧 tab 文件**

```bash
git rm web/src/pages/sdd/wiki-recalls/tabs/UserRankingTab.tsx \
       web/src/pages/sdd/wiki-recalls/tabs/WorkItemRankingTab.tsx \
       web/src/pages/sdd/wiki-recalls/tabs/WikiHeatmapTab.tsx \
       web/src/pages/sdd/wiki-recalls/tabs/TimelineTab.tsx
```

（`components/WikiRecallControls.tsx` 保留：`SegmentedControl`/`SoftBadge`/`QueryNotice` 仍复用。）

- [ ] **Step 3: 暂不验证**（页面 import 待 Task 10 重写后才闭合）

---

## Task 10: 内容来源支持 by-path（web 共享组件）

**Files:**
- Modify: `web/src/components/sdd/useWikiRecallContent.ts`
- Modify: `web/src/components/sdd/WikiDocModal.tsx`

- [ ] **Step 1: hook 支持两种来源**

`useWikiRecallContent` 改为接受 `{ toolCallId } | { repo, relativePath }`，内部分流到 `/content/:toolCallId` 或 `/content/by-path`。保持对现有调用方（`InteractionDetailDrawer` 传 `toolCallId`）向后兼容：保留原签名 `useWikiRecallContent(toolCallId)`，**新增** `useWikiRecallDocContentByPath`（已在 Task 8 建于 wiki-recalls/useWikiRecalls.ts）。本步只需 `WikiDocModal` 能接收「已取到的 content 数据」或「两种 source 之一」。

最小改动方案（不破坏现有抽屉）：`WikiDocModal` 新增可选 prop `source?: { repo: string; relativePath: string }`，当传入时用 `useWikiRecallDocContentByPath`，否则沿用原 `toolCallId` 路径。

```tsx
// WikiDocModal.tsx props
interface WikiDocModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  toolCallId?: string | null;
  source?: { repo: string; relativePath: string } | null;
}
```

组件内：`const byId = useWikiRecallContent(source ? null : toolCallId ?? null);`（其 `enabled` 已是 `!!toolCallId`）`const byPath = useWikiRecallDocContentByPath(source?.repo ?? null, source?.relativePath ?? null);` `const query = source ? byPath : byId;` 其余渲染/降级矩阵不变。

- [ ] **Step 2: typecheck**

Run: `pnpm --filter @sdd-telemetry/web typecheck`
Expected: 仅剩 `WikiRecallsPage` 相关报错（Task 11 解决）。

- [ ] **Step 3: Commit（与 Task 11 合并提交）**

---

## Task 11: 前端 4-section 重写（web）

**Files:**
- Rewrite: `web/src/pages/sdd/wiki-recalls/WikiRecallsPage.tsx`
- Create: `web/src/pages/sdd/wiki-recalls/components/{BusinessLineCompare,RecallTrendChart,TopDomains,AssetTable,DomainDrawer}.tsx`

> 视觉词汇全部对齐产出分析（`WorkItemsPage.tsx`）：KPI 卡用 `CARD_STYLE`/`ICON_BOX`，标杆用排名色条+角标，表格用同款 thead/hover。`RecallTrendChart` 由删除的 `TimelineTab` 图表逻辑迁入，默认 `range='30d'`，保留按日/小时控件（`SegmentedControl`）。

- [ ] **Step 1: AssetTable.tsx**（一览：分组切换 + 搜索 + 筛选 + 行 → 选中 domain）

```tsx
import { useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import type { WikiCoverageDomain, WikiCoverageRepo } from '@sdd-telemetry/api';
import { SegmentedControl } from './../components/WikiRecallControls';
import { CARD_STYLE, REPO_LABEL, repoTagStyle, coverFillColor } from '../styles';
import { formatInteger } from '@/lib/format';

type GroupBy = 'repo' | 'domain' | 'system';
const GROUP_OPTS = [
  { value: 'repo' as const, label: '知识库' },
  { value: 'domain' as const, label: '业务域' },
  { value: 'system' as const, label: '系统模块' },
];

export function AssetTable({
  domains, repos, onSelectDomain,
}: {
  domains: WikiCoverageDomain[];
  repos: WikiCoverageRepo[];
  onSelectDomain: (repo: string, domain: string) => void;
}) {
  const [groupBy, setGroupBy] = useState<GroupBy>('domain');
  const [search, setSearch] = useState('');
  const [onlyDead, setOnlyDead] = useState(false);

  const rows = useMemo(() => {
    let list = domains;
    if (onlyDead) list = list.filter((d) => d.deadDocs > 0);
    if (search) {
      const q = search.toLowerCase();
      list = list.filter((d) => d.domain.toLowerCase().includes(q) || (REPO_LABEL[d.repo] ?? d.repo).includes(q));
    }
    return list;
  }, [domains, onlyDead, search]);
  const deadCount = useMemo(() => domains.filter((d) => d.deadDocs > 0).length, [domains]);

  return (
    <section className="rounded-[6px]" style={CARD_STYLE}>
      <div className="flex items-center gap-3 px-[14px] py-3" style={{ borderBottom: '1px solid var(--color-border)' }}>
        <h3 className="text-[14px] font-semibold text-[#f5f5f5]">知识资产一览</h3>
        <SegmentedControl label="分组" value={groupBy} options={GROUP_OPTS} onChange={setGroupBy} />
        <div className="ml-auto flex items-center gap-2 h-[28px] px-[10px] w-[240px] rounded-[4px]" style={{ border: '1px solid rgba(255,255,255,0.10)', background: 'var(--color-base)' }}>
          <Search size={13} className="text-[var(--color-muted)] shrink-0" />
          <input className="w-full bg-transparent outline-none text-[12px] text-[var(--color-text)] placeholder:text-[var(--color-muted)]"
            placeholder="搜索领域 / 系统名" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
      </div>
      <div className="flex gap-[6px] px-[14px] py-[9px]" style={{ borderBottom: '1px solid var(--color-border)' }}>
        <FilterBtn on={!onlyDead} onClick={() => setOnlyDead(false)} label="全部" count={domains.length} />
        <FilterBtn on={onlyDead} onClick={() => setOnlyDead(true)} label="有死知识" count={deadCount} />
      </div>
      <table className="w-full" style={{ borderCollapse: 'collapse' }}>
        <thead><tr>{['业务域', '覆盖（已读/库内）', '召回', '文档', '参与人', '死知识', '最近召回'].map((h, i) => (
          <th key={h} className={`px-[12px] py-[8px] text-[10px] font-bold uppercase whitespace-nowrap text-[var(--color-muted)] ${i === 0 ? 'text-left' : 'text-right'}`}
            style={{ background: '#141414', borderBottom: '1px solid var(--color-border)' }}>{h}</th>))}</tr></thead>
        <tbody>
          {rows.length === 0 ? (
            <tr><td colSpan={7} className="py-10 text-center text-[12px] text-[var(--color-muted)]">暂无数据</td></tr>
          ) : rows.map((d) => {
            const rate = d.totalDocs > 0 ? d.recalledDocs / d.totalDocs : 0;
            return (
              <tr key={`${d.repo}-${d.domain}`} className="group cursor-pointer" style={{ borderBottom: '1px solid var(--color-border)' }}
                  onClick={() => onSelectDomain(d.repo, d.domain)}>
                <td className="px-[12px] py-[10px] group-hover:bg-[#171717]">
                  <div className="flex items-center gap-[9px]">
                    <span className="text-[10px] px-[7px] py-[2px] rounded-[3px]" style={repoTagStyle(d.repo)}>{REPO_LABEL[d.repo] ?? d.repo}</span>
                    <span className="text-[13px] font-medium text-[#f5f5f5]">{d.domain}</span>
                  </div>
                </td>
                <td className="px-[12px] py-[10px] group-hover:bg-[#171717] text-right">
                  <div className="flex items-center gap-2 justify-end">
                    <span className="w-[54px] h-[5px] rounded-full overflow-hidden" style={{ background: '#202016' }}>
                      <span className="block h-full rounded-full" style={{ width: `${rate * 100}%`, background: coverFillColor(rate) }} />
                    </span>
                    <span className="text-[12px] text-[var(--color-secondary)]" style={{ fontFamily: 'var(--font-mono)' }}>{d.recalledDocs}/{d.totalDocs}</span>
                  </div>
                </td>
                <td className="px-[12px] py-[10px] group-hover:bg-[#171717] text-right text-[13px] text-[#f5f5f5]" style={{ fontFamily: 'var(--font-mono)' }}>{formatInteger(d.recalls)}</td>
                <td className="px-[12px] py-[10px] group-hover:bg-[#171717] text-right text-[13px] text-[var(--color-secondary)]" style={{ fontFamily: 'var(--font-mono)' }}>{d.totalDocs}</td>
                <td className="px-[12px] py-[10px] group-hover:bg-[#171717] text-right text-[13px] text-[var(--color-secondary)]" style={{ fontFamily: 'var(--font-mono)' }}>{d.distinctUsers}</td>
                <td className="px-[12px] py-[10px] group-hover:bg-[#171717] text-right text-[13px]" style={{ fontFamily: 'var(--font-mono)', color: d.deadDocs > 0 ? 'var(--color-bad-text)' : 'var(--color-muted)' }}>{d.deadDocs}</td>
                <td className="px-[12px] py-[10px] group-hover:bg-[#171717] text-[12px] text-[var(--color-secondary)]">{d.lastRecallAt ? new Date(d.lastRecallAt).toLocaleString() : '—'}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}

function FilterBtn({ on, onClick, label, count }: { on: boolean; onClick: () => void; label: string; count: number }) {
  return (
    <button onClick={onClick} className="h-[26px] px-3 rounded-[4px] text-[12px] font-medium"
      style={on ? { background: 'rgba(250,255,105,0.08)', border: '1px solid rgba(250,255,105,0.22)', color: 'var(--color-primary)' }
                : { background: 'transparent', border: '1px solid var(--color-border)', color: 'var(--color-muted)' }}>
      {label}<span className="ml-1.5 text-[10px]" style={{ opacity: 0.65 }}>{count}</span>
    </button>
  );
}
```

> `groupBy='repo'`/`'system'` 的聚合在本期先以 `domain` 视图为主线交付；`repo`/`system` 视图复用同表，分别按 `repos` 数据与 domain.system 维度渲染——若时间紧，`repo`/`system` 切换可仅切换排序/过滤，验收以 `domain` 视图完整为准（见验证 §）。

- [ ] **Step 2: BusinessLineCompare.tsx**（② 三业务线对比）

```tsx
import type { WikiCoverageRepo } from '@sdd-telemetry/api';
import { CARD_STYLE, REPO_COLOR, coverFillColor } from '../styles';
import { formatInteger } from '@/lib/format';

export function BusinessLineCompare({ repos, degraded }: { repos: WikiCoverageRepo[]; degraded: boolean }) {
  return (
    <section className="p-[14px] rounded-[6px]" style={CARD_STYLE}>
      <h3 className="text-[14px] font-semibold text-[#f5f5f5] mb-3">三业务线知识资产对比</h3>
      <div className="grid grid-cols-3 gap-3">
        {repos.map((r) => {
          const rate = r.coverageRate;
          return (
            <div key={r.repo} className="p-3 rounded-[6px] grid gap-[10px]" style={{ background: 'var(--color-hover)', border: '1px solid var(--color-border)' }}>
              <div className="flex items-center justify-between">
                <span className="inline-flex items-center gap-[7px] text-[13px] font-semibold text-[#f5f5f5]">
                  <span className="w-2 h-2 rounded-[2px]" style={{ background: REPO_COLOR[r.repo] }} />{r.label}
                </span>
                <span className="text-[11px] text-[var(--color-muted)]" style={{ fontFamily: 'var(--font-mono)' }}>规模 {r.totalDocs}</span>
              </div>
              {degraded ? <div className="text-[11px] text-[var(--color-warn-text)]">需服务器挂载知识库</div> : (
                <>
                  <div className="flex items-baseline gap-[6px]">
                    <b className="text-[20px] text-[#f5f5f5] font-semibold" style={{ fontFamily: 'var(--font-mono)' }}>{Math.round(rate * 100)}%</b>
                    <span className="text-[12px] text-[var(--color-muted)]" style={{ fontFamily: 'var(--font-mono)' }}>{r.recalledDocs} / {r.totalDocs}</span>
                  </div>
                  <div className="h-[3px] w-full rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.08)' }}>
                    <div className="h-full rounded-full" style={{ width: `${rate * 100}%`, background: coverFillColor(rate) }} />
                  </div>
                </>
              )}
              <div className="flex gap-[14px] text-[11px] text-[var(--color-secondary)]">
                <span>召回 <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--color-text)' }}>{formatInteger(r.recalls)}</span></span>
                <span style={{ color: 'var(--color-bad-text)' }}>死知识 {r.deadDocs}</span>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
```

- [ ] **Step 3: TopDomains.tsx**（③ 右：标杆领域 Top3，排名色条+角标）

```tsx
import { Trophy } from 'lucide-react';
import type { WikiCoverageDomain } from '@sdd-telemetry/api';
import { CARD_STYLE, REPO_LABEL, repoTagStyle } from '../styles';
import { formatInteger } from '@/lib/format';

const RANK_COLORS = ['var(--color-primary)', 'var(--color-secondary)', 'var(--color-muted)'];

export function TopDomains({ domains, onSelectDomain }: { domains: WikiCoverageDomain[]; onSelectDomain: (repo: string, domain: string) => void }) {
  const top = [...domains].sort((a, b) => b.recalls - a.recalls).slice(0, 3);
  return (
    <section className="p-[14px] rounded-[6px]" style={CARD_STYLE}>
      <div className="flex items-center gap-2 mb-3" style={{ color: 'var(--color-primary)' }}>
        <Trophy size={18} /><h3 className="text-[14px] font-semibold text-[#f5f5f5]">标杆领域</h3>
      </div>
      <div className="grid gap-2">
        {top.map((d, i) => (
          <div key={`${d.repo}-${d.domain}`} className="relative p-[10px] pl-[14px] rounded-[6px] overflow-hidden cursor-pointer"
            style={{ background: 'var(--color-hover)', border: '1px solid var(--color-border)' }} onClick={() => onSelectDomain(d.repo, d.domain)}>
            <span className="absolute left-0 top-0 bottom-0 w-[3px]" style={{ background: RANK_COLORS[i] }} />
            <span className="absolute top-0 right-0 text-[10px] font-bold px-2 py-[3px]" style={{ color: i === 0 ? '#0a0a0a' : 'var(--color-surface)', background: RANK_COLORS[i], borderRadius: '0 6px 0 6px' }}>#{i + 1}</span>
            <div className="text-[13px] font-medium text-[#f5f5f5] flex items-center gap-[6px]">
              <span className="text-[10px] px-[6px] py-[1px] rounded-[3px]" style={repoTagStyle(d.repo)}>{REPO_LABEL[d.repo] ?? d.repo}</span>{d.domain}
            </div>
            <div className="mt-[6px] flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-[var(--color-secondary)]" style={{ fontFamily: 'var(--font-mono)' }}>
              <span>召回 {formatInteger(d.recalls)}</span><span>覆盖 {d.recalledDocs}/{d.totalDocs}</span><span>{d.distinctUsers} 人</span>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
```

- [ ] **Step 4: RecallTrendChart.tsx**（③ 左：迁移 TimelineTab 图表逻辑）

把删除的 `TimelineTab.tsx` 的 `buildTimelineChart`/柱状渲染整体迁入本组件，外壳改为 `Panel`/`CARD_STYLE`，调用 `useWikiRecallTimeline('30d', granularity, groupBy)`（`range` 固定 `'30d'`，不再来自 shell）。保留按日/小时与分组（业务域/维度）`SegmentedControl`。代码与原 `TimelineTab` 一致，仅去掉 `range` prop、改默认 `'30d'`。

- [ ] **Step 5: DomainDrawer.tsx**（下钻抽屉，基于 RowInspectorDrawer）

```tsx
import { useState } from 'react';
import { BookOpen, GitBranch } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { RowInspectorDrawer, type RowInspectorField } from '@/components/ui/RowInspectorDrawer';
import { WikiDocModal } from '@/components/sdd/WikiDocModal';
import { useWikiRecallDomainDocs, useWikiRecallWorkItemRanking } from '../useWikiRecalls';
import { REPO_LABEL, repoTagStyle } from '../styles';
import { formatInteger, formatRelativeTime } from '@/lib/format';

const STATUS_BADGE: Record<string, { label: string; cls: string }> = {
  hot: { label: '热', cls: 'good' }, cold: { label: '冷', cls: 'neu' },
  dead: { label: '死', cls: 'bad' }, new: { label: '新增未读', cls: 'info' },
};

export function DomainDrawer({ repo, domain, onClose }: { repo: string; domain: string; onClose: () => void }) {
  const navigate = useNavigate();
  const docsQuery = useWikiRecallDomainDocs(repo, domain);
  const reqQuery = useWikiRecallWorkItemRanking('all', { businessDomain: domain });
  const [doc, setDoc] = useState<{ toolCallId?: string | null; source?: { repo: string; relativePath: string } } | null>(null);

  const items = docsQuery.data?.items ?? [];
  const fields: RowInspectorField[] = [
    { label: '知识库', value: `bk-fe-knowledge-${repo}`, mono: true },
    { label: '库内文档', value: `${items.length} 篇` },
    { label: '死知识', value: String(items.filter((i) => i.status === 'dead').length) },
  ];

  return (
    <>
      <RowInspectorDrawer open onOpenChange={(o) => { if (!o) onClose(); }}
        title={domain} subtitle={REPO_LABEL[repo] ?? repo} icon={<BookOpen size={18} />}
        row={{ id: `${repo}-${domain}` }} fields={fields} rawData={docsQuery.data ?? {}}
        loading={docsQuery.isLoading} error={docsQuery.error ? String(docsQuery.error) : null}>
        <section className="px-5 pb-4">
          <div className="mb-3 flex items-center gap-2 pb-2" style={{ borderBottom: '1px solid var(--color-border)' }}>
            <BookOpen size={14} style={{ color: 'var(--color-primary)' }} /><span className="text-[12px] font-semibold text-[#f5f5f5]">文档清单</span>
            <span className="text-[11px] text-[var(--color-muted)]">· {items.length} 篇</span>
          </div>
          <div className="grid gap-[4px]">
            {items.map((it) => {
              const badge = STATUS_BADGE[it.status]!;
              return (
                <button key={it.relativePath} className="grid items-center gap-2 rounded-[4px] px-2 py-[6px] hover:bg-[#171717] text-left"
                  style={{ gridTemplateColumns: '1fr auto auto' }}
                  onClick={() => setDoc(it.lastToolCallId ? { toolCallId: it.lastToolCallId } : { source: { repo, relativePath: it.relativePath } })}>
                  <span className="truncate text-[12px] text-[var(--color-secondary)]" style={{ fontFamily: 'var(--font-mono)' }} title={it.relativePath}>{it.relativePath}</span>
                  <span className={`badge-${badge.cls}`}>{badge.label}</span>
                  <span className="text-[11px] text-[var(--color-muted)] text-right" style={{ fontFamily: 'var(--font-mono)' }}>{it.recallCount} 次</span>
                </button>
              );
            })}
          </div>
        </section>
        <section className="px-5 pb-4">
          <div className="mb-3 flex items-center gap-2 pb-2" style={{ borderBottom: '1px solid var(--color-border)' }}>
            <GitBranch size={14} style={{ color: 'var(--color-primary)' }} /><span className="text-[12px] font-semibold text-[#f5f5f5]">关联需求</span>
          </div>
          <div className="grid gap-[4px]">
            {(reqQuery.data?.items ?? []).slice(0, 10).map((w) => (
              <button key={w.workItemId} className="flex items-center justify-between rounded-[4px] px-2 py-[6px] hover:bg-[#171717] text-left"
                onClick={() => navigate(`/sdd/work-items/${w.workItemId}`)}>
                <span className="text-[12px] text-[var(--color-secondary)]">{w.workItemSlug}</span>
                <span className="text-[11px] text-[var(--color-muted)]" style={{ fontFamily: 'var(--font-mono)' }}>{formatInteger(w.totalRecalls)} 次</span>
              </button>
            ))}
          </div>
        </section>
      </RowInspectorDrawer>
      <WikiDocModal open={!!doc} onOpenChange={(o) => { if (!o) setDoc(null); }}
        toolCallId={doc?.toolCallId ?? null} source={doc?.source ?? null} />
    </>
  );
}
```

> `badge-good`/`badge-neu`/`badge-bad`/`badge-info` 若无现成类，则改用内联 style（参考 `WikiRecallControls` 的 `SoftBadge` tone）。优先用 `SoftBadge`：把上面 `<span className=badge-*>` 换成 `<SoftBadge tone=...>`，新增 `info` tone 到 `SoftBadge`（一行 style）。

- [ ] **Step 6: WikiRecallsPage.tsx 重写（编排）**

```tsx
import { useState } from 'react';
import { BookOpen, FileText, Gauge, TriangleAlert } from 'lucide-react';
import { useWikiRecallCoverage } from './useWikiRecalls';
import { BusinessLineCompare } from './components/BusinessLineCompare';
import { RecallTrendChart } from './components/RecallTrendChart';
import { TopDomains } from './components/TopDomains';
import { AssetTable } from './components/AssetTable';
import { DomainDrawer } from './components/DomainDrawer';
import { CARD_STYLE, ICON_BOX } from './styles';
import { formatInteger } from '@/lib/format';

export default function WikiRecallsPage() {
  const { data, isLoading } = useWikiRecallCoverage();
  const [sel, setSel] = useState<{ repo: string; domain: string } | null>(null);
  const degraded = !isLoading && data?.scan.configured === false;
  const t = data?.totals;

  return (
    <div className="grid gap-3">
      <header className="flex items-baseline gap-3">
        <h1 className="text-[22px] font-semibold text-[#f5f5f5]" style={{ fontFamily: 'var(--font-mono)' }}>知识库分析</h1>
        <span className="text-[12px] text-[var(--color-muted)]">团队知识资产 · 累计口径 · 分母取服务器当前快照</span>
      </header>

      {/* ① KPI */}
      <div className="grid grid-cols-4 gap-3">
        <Kpi icon={<BookOpen size={18} />} name="知识库规模" value={degraded ? '—' : formatInteger(t?.totalDocs ?? 0)} hint="3 库 .md 合计 · 当前快照" />
        <Kpi icon={<Gauge size={18} />} name="知识利用率" value={degraded ? '—' : `${Math.round((t?.coverageRate ?? 0) * 100)}%`} hint={degraded ? '需服务器挂载知识库' : `${t?.recalledDocs ?? 0} / ${t?.totalDocs ?? 0}`} volt />
        <Kpi icon={<FileText size={18} />} name="累计召回" value={formatInteger(t?.recalls ?? 0)} hint="全团队 wiki 读取次数" volt />
        <Kpi icon={<TriangleAlert size={18} />} name="死知识" value={degraded ? '—' : String(t?.deadDocs ?? 0)} hint=">30 天且从无召回" bad />
      </div>

      {/* ② 三业务线 */}
      <BusinessLineCompare repos={data?.repos ?? []} degraded={!!degraded} />

      {/* ③ 趋势 + 标杆 */}
      <div className="grid gap-3" style={{ gridTemplateColumns: '2fr 1fr' }}>
        <RecallTrendChart />
        <TopDomains domains={data?.domains ?? []} onSelectDomain={(repo, domain) => setSel({ repo, domain })} />
      </div>

      {/* ④ 一览 */}
      <AssetTable domains={data?.domains ?? []} repos={data?.repos ?? []} onSelectDomain={(repo, domain) => setSel({ repo, domain })} />

      {sel && <DomainDrawer repo={sel.repo} domain={sel.domain} onClose={() => setSel(null)} />}
    </div>
  );
}

function Kpi({ icon, name, value, hint, volt, bad }: { icon: React.ReactNode; name: string; value: string; hint: string; volt?: boolean; bad?: boolean }) {
  return (
    <section className="flex gap-3 min-h-[98px] p-[14px] rounded-[6px]" style={CARD_STYLE}>
      <div className="grid w-[34px] h-[34px] flex-none place-items-center rounded-[4px]" style={ICON_BOX}>{icon}</div>
      <div className="flex flex-col justify-between">
        <span className="text-[12px] text-[var(--color-secondary)]">{name}</span>
        <strong className="text-[24px] font-semibold" style={{ fontFamily: 'var(--font-mono)', color: bad ? 'var(--color-bad-text)' : volt ? 'var(--color-primary)' : '#f5f5f5' }}>{value}</strong>
        <em className="text-[11px] not-italic text-[var(--color-muted)]">{hint}</em>
      </div>
    </section>
  );
}
```

- [ ] **Step 7: typecheck + build**

Run: `pnpm --filter @sdd-telemetry/web typecheck && pnpm build`
Expected: 全绿。若 `RowInspectorDrawer`/`SoftBadge` 的 props 名不符，按其真实签名微调（读对应组件文件）。

- [ ] **Step 8: Commit**

```bash
git add web/src/pages/sdd/wiki-recalls web/src/components/sdd/WikiDocModal.tsx web/src/components/sdd/useWikiRecallContent.ts
git commit -m "feat(web): 知识库分析 4-section 资产视角重写（删旧 4 tab + 孤儿 hook）"
```

---

## Task 12: 联调与最终验证

- [ ] **Step 1: 全量构建与残留扫描**

Run:
```bash
pnpm typecheck && pnpm build
rg --hidden "ap""ps/(web|server|worker)|\\.\\/ap""ps/(web|server|worker)|ap""ps/" . -g '!node_modules/**' -g '!.git/**'
```
Expected: 构建全绿；残留扫描无新增命中。

- [ ] **Step 2: 后端可证伪验证（dev）**

```bash
KNOWLEDGE_BASE_ROOT=/Users/loomisli/Desktop/lm/bk-fe-sdd pnpm dev:server
curl -s 'http://localhost:7001/api/sdd/wiki-recalls/coverage' | jq '.data.totals, (.data.repos|map({repo,totalDocs,recalls}))'
# 抽一个域看清单与状态：
curl -s 'http://localhost:7001/api/sdd/wiki-recalls/docs?repo=cashier&domain=cashier' | jq '.data.items[0:5]'
# 死知识/未读看正文（无 toolCallId 路径）：
curl -s 'http://localhost:7001/api/sdd/wiki-recalls/content/by-path?repo=trade&relativePath=domain-cashier/business/INDEX.md' | jq '{found,reason,isMarkdown}'
```
可证伪检查：
- `scan ∩ recall` 非接近 0（口径一致，§9.1）；可对比 `coverage.totals.recalledDocs` 与 `SELECT COUNT(DISTINCT wiki_relative_path) FROM sdd_wiki_recalls WHERE action_type='read'`，差距应主要来自 orphan。
- 三库 `totalDocs`/`recalls` 之和 == `totals`。
- 不配 `KNOWLEDGE_BASE_ROOT` 重启 → `scan.configured:false`、`totalDocs:0`，区分「未挂载」vs「已挂载全未读（configured:true, deadDocs>0）」。

- [ ] **Step 3: 前端页面检查**

`pnpm dev:web`，访问 `/sdd/wiki-recalls`：
- ① KPI 四卡、② 三业务线、③ 趋势+标杆、④ 一览渲染正常。
- 点领域行 → 抽屉出文档清单（热/冷/死/新增未读徽标）+ 关联需求。
- 点文档（被召回的）→ Modal 渲染正文；点死知识/未读文档 → by-path 正文或友好降级。
- 点关联需求 → 跳 `/sdd/work-items/:id`。
- 用户分析页 `/sdd/users` 仍正常（`useWikiRecallList` 未破坏）。

- [ ] **Step 4: 文档保鲜**

更新 `docs/api-contract.md`（coverage / docs / content/by-path 三接口 + 新增 config），`docs/database-model.md`（注明无表变更、知识库资产口径来源），`README.md`（扫描弱依赖与快照口径）。

```bash
git add docs/api-contract.md docs/database-model.md README.md
git commit -m "docs: 同步知识资产覆盖率接口与扫描弱依赖口径"
```

---

## Self-Review

**1. Spec coverage（对照 design 各节）**
- §3 信息架构（4-section + repo 层）→ Task 11（页面 + 5 组件）。
- §4.3 覆盖率/三态/orphan → Task 3（buildCoverage + classifyDoc 单测覆盖全部分支）。
- §4.4 保鲜（不落表、TTL）→ Task 6 `getScan` + Task 2 config。
- §4.5 版本（路径级 + 内容标注）→ 路径级口径在 Task 3；内容「当前版本」标注沿用现有 `WikiDocModal`（Task 10 不改其标注，已存在）。
- §5.1 扫描（parseWikiPath 同口径 + gitRef）→ Task 4。
- §5.2 三接口 → Task 5/6/7。§5.3 config → Task 2。
- §6 复用/删除（保留 useWikiRecallList、删 4 tab + 2 孤儿 hook）→ Task 8/9/11。
- §7 链路接入（领域→需求跳转）→ Task 11 DomainDrawer。
- §8 降级矩阵 → Task 11 `degraded` 分支 + Task 12 验证。
- §9 验证 → Task 12。

**2. Placeholder scan**：无 TBD/TODO；测试含完整断言；`repo`/`system` 分组视图标注为「以 domain 视图为主线交付」是有意的范围收敛，非占位（验收以 domain 视图为准）。

**3. Type consistency**：`ScannedDoc`/`RecallAgg`（Task 3）被 Task 4/6 复用；`buildCoverage`/`classifyDoc`/`repoLabel` 签名一致；contract 类型 `WikiCoverageResponse`/`WikiDomainDocsResponse`/`WikiDomainDoc`（Task 1）在 Task 6/7/8 一致引用；`getScan`/`scanCache` 命名一致。

**一处需实现时确认**：`RowInspectorDrawer` 与 `SoftBadge` 的真实 props（Task 11 Step 7 已标注按真实签名微调，必要时读组件源）。
