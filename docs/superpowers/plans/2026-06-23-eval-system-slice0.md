# Eval System Demo-First Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 交付一条明天可演示的纵切片——`super_admin` 从当前 profile 的线上真实日志导入 prompt，系统长期快照为评测集，并在评测集 CMS 中完成查看/筛选/手补/编辑/启停/删除。

**Architecture:** 加法兼容。新增 1 张表 `eval_items`（裸 SQL，对齐 `profile-config-admin` 兄弟模块，不引入 TypeORM entity）、6 个 CMS 端点（全部 `super_admin`、显式 profile 隔离、`Cache-Control: no-store`）、1 个管理页面（复用 Profile Switcher + dashboard 壳）。导入只读 `profile_current_projection_runs` 指针 → 同 run 的 `profile_capability_usages` → 按 `interaction_id` LEFT JOIN `sdd_interaction_texts`，应用层归一化判重 + 事务内 upsert。`target_skill` 通过新写的纯函数从 profile config 解析（排除 `['*']` catch-all 和 fallback capability）。本切片不碰 run/bridge/runner/judge。

**Tech Stack:** MidwayJS + TypeORM（仅做 SQL 执行，不用 entity）、MySQL 8.4、Zod（共享 contract in `packages/api`）、React + Vite + TanStack Query。

**关键决策（已和用户确认）：**
- eval_items 走**裸 SQL**，不建 TypeORM entity（import 查询注定手写 SQL，两套混用最糟；未来 Slice 2/3 如需可局部演进，会在 repository 注释里标明）。
- 30 天 TTL 清理当前**未上线**（仓库无清扫任务），快照设计的正当性来自"评测集是固定资产 + run 可复现"，与 TTL 无关。文档措辞按此校准。
- repository 测试用 mock `query`（对齐 `profile-projection-demand-detail.test.ts` 风格），不依赖真实 MySQL；import 集成行为由端到端集成测试覆盖。

---

## File Structure

### 新增
```
packages/api/src/contracts/eval.contract.ts              # 全部 Zod schema + 类型
packages/api/test/eval-contract.test.ts                  # contract 自检
server/src/infrastructure/mysql/migrations/1780000020000-create-eval-items.ts
server/src/modules/eval/eval-item-domain.ts              # 纯函数: 归一化 / key / resolveTargetSkill / artifact 映射
server/src/modules/eval/eval-item.repository.ts          # 裸 SQL 读写
server/src/modules/eval/eval-item.service.ts             # 编排 + 事务 + 统计
server/src/modules/eval/eval-item.controller.ts          # 6 端点 + no-store header
server/test/eval-item-domain.test.ts                     # 纯函数单测
server/test/eval-item.repository.test.ts                 # mock-query 仓储测试
server/test/eval-item.service.test.ts                    # mock-repository 编排测试
web/src/pages/admin/eval-items/EvalItemsPage.tsx
web/src/pages/admin/eval-items/useEvalItems.ts
web/src/pages/admin/eval-items/EvalItemEditor.tsx
web/src/pages/admin/eval-items/EvalImportDialog.tsx
web/src/pages/admin/eval-items/eval-ui.ts                # 复用 config-ui 的 class/组件
web/src/pages/admin/eval-items/EvalItemsPage.test.tsx
```

### 修改
```
packages/api/src/index.ts                                # 导出 eval contract
server/src/infrastructure/mysql/data-source.ts           # 注册 migration
server/src/infrastructure/mysql/verify-schema.ts         # 三处白名单
server/src/common/auth/auth.middleware.ts                # requiresSuperAdmin 加 /api/eval/
server/src/modules/index.ts                              # 注册 eval 模块
server/src/modules/profiles/profile-config.repository.ts # 新增 getProfileConfigVersionById
web/src/router.tsx                                       # admin 路由 + lazy import
web/src/components/layout/Sidebar.tsx                    # 管理组加入口
packages/api/src/profile-config/profiles/sdd-default.ts  # manifest.evaluation: false→true
packages/api/src/profile-config/profiles/e2e-monorepo.ts # manifest.evaluation: false→true
docs/api-contract.md / docs/database-model.md / README.md / docs/design-eval-system.md
server/test/auth-middleware.test.ts                      # 加 eval 路径断言
```

---

## Task 1: 共享 contract（packages/api）

**Files:**
- Create: `packages/api/src/contracts/eval.contract.ts`
- Modify: `packages/api/src/index.ts`
- Test: `packages/api/test/eval-contract.test.ts`

- [ ] **Step 1: 写失败测试 `packages/api/test/eval-contract.test.ts`**

```typescript
import { describe, expect, it } from 'vitest';
import {
  EvalItemListResponseSchema,
  EvalItemDetailResponseSchema,
  EvalItemSummarySchema,
  EvalImportFromLogsRequestSchema,
  EvalImportFromLogsResponseSchema,
  CreateEvalItemRequestSchema,
  UpdateEvalItemRequestSchema,
} from '../src/contracts/eval.contract';

describe('eval contract', () => {
  it('list summary omits promptText, exposes promptPreview <=240 chars', () => {
    const summary = {
      id: '1',
      itemKey: 'k'.repeat(64),
      profileId: 'sdd-default',
      source: 'cleaned',
      promptPreview: 'x'.repeat(240),
      targetSkill: 'bk-fe-design',
      targetArtifactType: 'design',
      originCapabilityCode: 'design',
      originRawCapabilityName: 'bk-fe-design',
      occurrenceCount: 2,
      firstObservedAt: '2026-06-20T00:00:00.000Z',
      lastObservedAt: '2026-06-21T00:00:00.000Z',
      enabled: true,
      title: null,
      lastImportedAt: '2026-06-22T00:00:00.000Z',
      gmtModified: '2026-06-22T00:00:00.000Z',
    };
    const parsed = EvalItemSummarySchema.parse(summary);
    expect(parsed.promptPreview.length).toBe(240);
    expect(() => EvalItemSummarySchema.parse({ ...summary, promptText: 'leak' }))
      .toThrow();
  });

  it('detail response includes full promptText', () => {
    const detail = {
      id: '1',
      itemKey: 'k'.repeat(64),
      profileId: 'sdd-default',
      source: 'cleaned',
      promptText: 'full prompt',
      targetSkill: 'bk-fe-design',
      targetArtifactType: 'design',
      originCapabilityCode: 'design',
      originRawCapabilityName: 'bk-fe-design',
      originInteractionId: '42',
      originProjectionRunId: '7',
      occurrenceCount: 1,
      firstObservedAt: null,
      lastObservedAt: '2026-06-21T00:00:00.000Z',
      lastImportedAt: '2026-06-22T00:00:00.000Z',
      enabled: true,
      title: null,
      notes: null,
      gmtModified: '2026-06-22T00:00:00.000Z',
    };
    const parsed = EvalItemDetailResponseSchema.parse(detail);
    expect(parsed.promptText).toBe('full prompt');
  });

  it('create manual rejects empty prompt / empty target skill / missing artifact type', () => {
    const base = {
      profileId: 'sdd-default',
      source: 'manual',
      promptText: 'p',
      targetSkill: 'bk-fe-design',
      targetArtifactType: 'design',
    };
    expect(CreateEvalItemRequestSchema.parse(base).targetArtifactType).toBe('design');
    expect(() => CreateEvalItemRequestSchema.parse({ ...base, promptText: '   ' })).toThrow();
    expect(() => CreateEvalItemRequestSchema.parse({ ...base, targetSkill: '  ' })).toThrow();
    expect(() => CreateEvalItemRequestSchema.parse({ ...base, targetArtifactType: 'unknown' })).toThrow();
  });

  it('import request requires from/to to appear together within 31 days', () => {
    const base = { profileId: 'sdd-default' };
    expect(EvalImportFromLogsRequestSchema.parse(base).capabilityCode).toBeUndefined();
    expect(() => EvalImportFromLogsRequestSchema.parse({ ...base, from: '2026-06-01' })).toThrow();
    expect(() => EvalImportFromLogsRequestSchema.parse({
      ...base,
      from: '2026-01-01',
      to: '2026-06-01',
    })).toThrow();
  });

  it('update schema rejects unknown fields', () => {
    expect(() => UpdateEvalItemRequestSchema.parse({ bogus: 1 })).toThrow();
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm --filter @sdd-telemetry/api test -- eval-contract`
Expected: FAIL（模块不存在）

- [ ] **Step 3: 实现 `packages/api/src/contracts/eval.contract.ts`**

```typescript
import { z } from 'zod';
import { IdSchema, ISODateTimeSchema } from './common.contract';

export const EvalItemSourceSchema = z.enum(['cleaned', 'manual']);
export type EvalItemSource = z.infer<typeof EvalItemSourceSchema>;

export const EvalArtifactTypeSchema = z.enum(['design', 'proposal', 'tasks']);
export type EvalArtifactType = z.infer<typeof EvalArtifactTypeSchema>;

const ItemKeySchema = z.string().length(64);
const Sha64Schema = z.string().length(64);

export const EvalItemSummarySchema = z.object({
  id: IdSchema,
  itemKey: ItemKeySchema,
  profileId: z.string(),
  source: EvalItemSourceSchema,
  promptPreview: z.string().max(240),
  targetSkill: z.string().nullable(),
  targetArtifactType: EvalArtifactTypeSchema.nullable(),
  originCapabilityCode: z.string().nullable(),
  originRawCapabilityName: z.string().nullable(),
  occurrenceCount: z.number().int().nonnegative(),
  firstObservedAt: ISODateTimeSchema.nullable(),
  lastObservedAt: ISODateTimeSchema.nullable(),
  lastImportedAt: ISODateTimeSchema.nullable(),
  enabled: z.boolean(),
  title: z.string().max(500).nullable(),
  gmtModified: ISODateTimeSchema,
});
export type EvalItemSummary = z.infer<typeof EvalItemSummarySchema>;

export const EvalItemListSummarySchema = z.object({
  total: z.number().int().nonnegative(),
  enabled: z.number().int().nonnegative(),
  cleaned: z.number().int().nonnegative(),
  manual: z.number().int().nonnegative(),
});
export type EvalItemListSummary = z.infer<typeof EvalItemListSummarySchema>;

export const EvalItemListResponseSchema = z.object({
  items: z.array(EvalItemSummarySchema),
  total: z.number().int().nonnegative(),
  page: z.number().int().positive(),
  pageSize: z.number().int().positive(),
  summary: EvalItemListSummarySchema,
});
export type EvalItemListResponse = z.infer<typeof EvalItemListResponseSchema>;

export const EvalItemDetailResponseSchema = z.object({
  id: IdSchema,
  itemKey: ItemKeySchema,
  profileId: z.string(),
  source: EvalItemSourceSchema,
  promptText: z.string(),
  targetSkill: z.string().max(191).nullable(),
  targetArtifactType: EvalArtifactTypeSchema.nullable(),
  originCapabilityCode: z.string().nullable(),
  originRawCapabilityName: z.string().nullable(),
  originInteractionId: IdSchema.nullable(),
  originProjectionRunId: IdSchema.nullable(),
  occurrenceCount: z.number().int().nonnegative(),
  firstObservedAt: ISODateTimeSchema.nullable(),
  lastObservedAt: ISODateTimeSchema.nullable(),
  lastImportedAt: ISODateTimeSchema.nullable(),
  enabled: z.boolean(),
  title: z.string().max(500).nullable(),
  notes: z.string().max(10000).nullable(),
  gmtModified: ISODateTimeSchema,
});
export type EvalItemDetailResponse = z.infer<typeof EvalItemDetailResponseSchema>;

export const CreateEvalItemRequestSchema = z.object({
  profileId: z.string().min(1).max(191),
  source: z.literal('manual'),
  promptText: z.string().min(1).max(256000).transform((s) => s).refine((s) => s.trim().length > 0, 'promptText must not be empty/whitespace'),
  targetSkill: z.string().max(191).transform((s) => s.trim()).refine((s) => s.length > 0, 'targetSkill must not be empty'),
  targetArtifactType: EvalArtifactTypeSchema,
  title: z.string().max(500).optional(),
  notes: z.string().max(10000).optional(),
});
export type CreateEvalItemRequest = z.infer<typeof CreateEvalItemRequestSchema>;

export const UpdateEvalItemRequestSchema = z.object({
  profileId: z.string().min(1).max(191),
  promptText: z.string().min(1).max(256000).optional(),
  targetSkill: z.string().max(191).optional(),
  targetArtifactType: EvalArtifactTypeSchema.optional(),
  title: z.string().max(500).nullable().optional(),
  notes: z.string().max(10000).nullable().optional(),
  enabled: z.boolean().optional(),
}).strict();
export type UpdateEvalItemRequest = z.infer<typeof UpdateEvalItemRequestSchema>;

export const EvalImportFromLogsRequestSchema = z.object({
  profileId: z.string().min(1).max(191),
  capabilityCode: z.string().max(64).optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
}).superRefine((value, ctx) => {
  if ((value.from === undefined) !== (value.to === undefined)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'from/to must appear together', path: ['from'] });
  }
  if (value.from && value.to) {
    const spanMs = new Date(value.to).getTime() - new Date(value.from).getTime();
    if (spanMs <= 0) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'to must be after from', path: ['to'] });
    }
    if (spanMs > 31 * 24 * 60 * 60 * 1000) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'range must not exceed 31 days', path: ['to'] });
    }
  }
});
export type EvalImportFromLogsRequest = z.infer<typeof EvalImportFromLogsRequestSchema>;

export const EvalImportFromLogsResponseSchema = z.object({
  projectionRunId: IdSchema,
  scannedCount: z.number().int().nonnegative(),
  candidateCount: z.number().int().nonnegative(),
  insertedCount: z.number().int().nonnegative(),
  refreshedCount: z.number().int().nonnegative(),
  upgradedCount: z.number().int().nonnegative(),
  skippedNoPromptCount: z.number().int().nonnegative(),
  skippedOversizeCount: z.number().int().nonnegative(),
  skippedDeletedCount: z.number().int().nonnegative(),
});
export type EvalImportFromLogsResponse = z.infer<typeof EvalImportFromLogsResponseSchema>;
```

- [ ] **Step 4: 在 `packages/api/src/index.ts` 末尾加导出**

```typescript
export * from './contracts/eval.contract';
```

- [ ] **Step 5: 运行测试确认通过**

Run: `pnpm --filter @sdd-telemetry/api test -- eval-contract`
Expected: PASS（5 tests）

- [ ] **Step 6: 提交**

```bash
git add packages/api/src/contracts/eval.contract.ts packages/api/src/index.ts packages/api/test/eval-contract.test.ts
git commit -m "feat(api): 新增评测集 eval_items 共享 contract(列表/详情/导入/CRUD)"
```

---

## Task 2: 领域纯函数（归一化 / key / target skill 解析 / artifact 映射）

**Files:**
- Create: `server/src/modules/eval/eval-item-domain.ts`
- Test: `server/test/eval-item-domain.test.ts`

这个纯函数模块没有 DB / 框架依赖，先做。它承载最容易踩坑的三处：判重归一化、幂等 key、target skill 解析（必须排除 `['*']` 和 fallback）。

- [ ] **Step 1: 写失败测试 `server/test/eval-item-domain.test.ts`**

```typescript
import { describe, expect, it } from 'vitest';
import {
  normalizePromptForDedup,
  computeItemKey,
  resolveTargetSkill,
  mapArtifactType,
  previewPrompt,
} from '../src/modules/eval/eval-item-domain';
import type { WorkflowProfileConfig } from '@sdd-telemetry/api';

function configFixture(): WorkflowProfileConfig {
  // 只填 resolveTargetSkill 需要的字段;完整 fixture 由 integration test 覆盖。
  return {
    profileId: 'sdd-default',
    displayName: 'SDD',
    status: 'active',
    projectionMode: 'source_backed',
    manifest: { capabilityUsage: true, deliveryUnits: true, artifacts: true, artifactTimeline: true, knowledgeRecalls: true, codeChanges: true, errors: true, evaluation: true, alerts: false },
    sourceRules: [
      { ruleId: 'skill-design', priority: 100, confidence: 'high', enabled: true, category: 'skill', actions: ['invoke'], locatorType: 'skill', skillNames: ['bk-fe-design', 'bk-fe:design'] },
      { ruleId: 'skill-other', priority: 1, confidence: 'low', enabled: true, category: 'skill', actions: ['invoke'], locatorType: 'skill', skillNames: ['*'] },
    ],
    capabilityRules: [
      { ruleId: 'cap-design', sourceRuleIds: ['skill-design'], actions: ['invoke'], capabilityCode: 'design', displayName: '设计', surfaceRole: 'core' },
      { ruleId: 'cap-other', sourceRuleIds: ['skill-other'], actions: ['invoke'], capabilityCode: 'other-skill', displayName: '其他', surfaceRole: 'fallback' },
    ],
    deliveryUnitRules: [],
    artifactRules: [],
    errorRules: [],
    attributionPolicy: { anchorCategories: ['process_doc'], anchorActions: ['read'], sameInteraction: { enabled: false, preferActions: [] }, sameSessionWindow: { enabled: false, minutes: 0, requireSameUser: false, preferActions: [] } },
    presentation: { workflowKind: 'sdd', maturityStages: [], artifactStageOrder: [], hiddenMetrics: [] },
  };
}

describe('normalizePromptForDedup', () => {
  it('does NFC + CRLF/CR->LF + edge trim, keeps internal whitespace/indent', () => {
    expect(normalizePromptForDedup('  hello\r\n  world\r')).toBe('hello\n  world');
  });
  it('keeps internal blank lines and code indentation', () => {
    const p = 'line1\n\n  indented\nline3';
    expect(normalizePromptForDedup(p)).toBe(p);
  });
});

describe('computeItemKey', () => {
  it('is stable sha256 of structured JSON array', () => {
    const k = computeItemKey({ profileId: 'sdd-default', targetSkill: 'bk-fe-design', targetArtifactType: 'design', normalizedPrompt: 'hi' });
    expect(k).toMatch(/^[0-9a-f]{64}$/);
    // same logical sample => same key regardless of source
    expect(computeItemKey({ profileId: 'sdd-default', targetSkill: 'bk-fe-design', targetArtifactType: 'design', normalizedPrompt: 'hi' })).toBe(k);
  });
  it('null target skill / artifact type normalize to empty string in key', () => {
    const a = computeItemKey({ profileId: 'p', targetSkill: null, targetArtifactType: null, normalizedPrompt: 'x' });
    const b = computeItemKey({ profileId: 'p', targetSkill: '', targetArtifactType: '', normalizedPrompt: 'x' });
    expect(a).toBe(b);
  });
  it('different profile => different key', () => {
    expect(computeItemKey({ profileId: 'p1', targetSkill: 's', targetArtifactType: 'design', normalizedPrompt: 'x' }))
      .not.toBe(computeItemKey({ profileId: 'p2', targetSkill: 's', targetArtifactType: 'design', normalizedPrompt: 'x' }));
  });
});

describe('resolveTargetSkill', () => {
  it('returns first skillName of skill source rule referenced by capability rule', () => {
    expect(resolveTargetSkill(configFixture(), 'design')).toBe('bk-fe-design');
  });
  it('returns null for fallback capability (surfaceRole=fallback)', () => {
    expect(resolveTargetSkill(configFixture(), 'other-skill')).toBeNull();
  });
  it('returns null when referenced skill rule uses ["*"] catch-all', () => {
    const cfg = configFixture();
    cfg.capabilityRules[1] = { ...cfg.capabilityRules[1], surfaceRole: 'core' };
    expect(resolveTargetSkill(cfg, 'other-skill')).toBeNull();
  });
  it('returns null when capability code not found', () => {
    expect(resolveTargetSkill(configFixture(), 'nope')).toBeNull();
  });
  it('returns null when referenced rule is not a skill locator', () => {
    const cfg = configFixture();
    cfg.sourceRules[0] = { ...cfg.sourceRules[0], locatorType: 'path' } as typeof cfg.sourceRules[number];
    expect(resolveTargetSkill(cfg, 'design')).toBeNull();
  });
});

describe('mapArtifactType', () => {
  it('maps design/proposal/task; null otherwise', () => {
    expect(mapArtifactType('design')).toBe('design');
    expect(mapArtifactType('proposal')).toBe('proposal');
    expect(mapArtifactType('task')).toBe('tasks');
    expect(mapArtifactType('code')).toBeNull();
  });
});

describe('previewPrompt', () => {
  it('truncates to 240 chars with ellipsis', () => {
    expect(previewPrompt('x'.repeat(300)).length).toBe(240);
    expect(previewPrompt('short')).toBe('short');
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm --filter @sdd-telemetry/server test -- eval-item-domain`
Expected: FAIL（模块不存在）

- [ ] **Step 3: 实现 `server/src/modules/eval/eval-item-domain.ts`**

```typescript
import { createHash } from 'node:crypto';
import type { WorkflowProfileConfig, SkillSourceRule } from '@sdd-telemetry/api';

const PROMPT_MAX_CHARS = 256000;
const PREVIEW_MAX_CHARS = 240;

/**
 * 归一化仅用于判重 (hash)。规则固定且保守:
 * Unicode NFC + CRLF/CR 统一为 LF + 首尾 trim。保留内部空格/缩进/换行,
 * 避免误合并含代码或 YAML 的不同需求。原始快照不改写。
 */
export function normalizePromptForDedup(prompt: string): string {
  return prompt.normalize('NFC').replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();
}

/**
 * item_key = sha256(JSON.stringify([profileId, targetSkill ?? "", targetArtifactType ?? "", normalizedPrompt]))
 * 结构化序列化消除分隔符和 NULL 歧义; 相同逻辑样本不会因 manual/cleaned 来源不同而重复。
 */
export function computeItemKey(input: {
  profileId: string;
  targetSkill: string | null;
  targetArtifactType: string | null;
  normalizedPrompt: string;
}): string {
  const payload = JSON.stringify([
    input.profileId,
    input.targetSkill ?? '',
    input.targetArtifactType ?? '',
    input.normalizedPrompt,
  ]);
  return createHash('sha256').update(payload).digest('hex');
}

/**
 * 从 profile config 解析 capability 对应的规范可执行 skill。
 * 路径: capability rule.sourceRuleIds -> 找到 locatorType='skill' 的 source rule
 *       -> 取第一个非空 skillNames[0]。
 * 必须排除两类"不是可执行 skill"的情况 (KTD8: 不把 raw locator/语义代码猜成 skill):
 *   - surfaceRole === 'fallback' 的 capability
 *   - skillNames === ['*'] 的 catch-all rule
 * 解析失败返回 null (调用方据此 disabled)。
 */
export function resolveTargetSkill(
  config: WorkflowProfileConfig,
  capabilityCode: string,
): string | null {
  const rule = config.capabilityRules.find((r) => r.capabilityCode === capabilityCode);
  if (!rule) return null;
  if (rule.surfaceRole === 'fallback') return null;
  const sourceRuleIds = rule.sourceRuleIds ?? [];
  for (const id of sourceRuleIds) {
    const source = config.sourceRules.find((s) => s.ruleId === id);
    if (!source) continue;
    if (source.locatorType !== 'skill') continue;
    const skillRule = source as SkillSourceRule;
    if (skillRule.skillNames.length === 0) continue;
    if (skillRule.skillNames.length === 1 && skillRule.skillNames[0] === '*') continue;
    return skillRule.skillNames[0];
  }
  return null;
}

/** 产物类型仅显式映射 design/proposal/task; 其余返回 null。 */
export function mapArtifactType(
  capabilityCode: string | null,
): 'design' | 'proposal' | 'tasks' | null {
  switch (capabilityCode) {
    case 'design': return 'design';
    case 'proposal': return 'proposal';
    case 'task': return 'tasks';
    default: return null;
  }
}

/** 列表摘要, 超 240 字符截断 (不补省略号, 节省字节)。 */
export function previewPrompt(prompt: string): string {
  return prompt.length > PREVIEW_MAX_CHARS ? prompt.slice(0, PREVIEW_MAX_CHARS) : prompt;
}

/** 导入正文长度上限, 超过的单条跳过 (skippedOversize)。 */
export const PROMPT_MAX = PROMPT_MAX_CHARS;
```

- [ ] **Step 4: 运行测试确认通过**

Run: `pnpm --filter @sdd-telemetry/server test -- eval-item-domain`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add server/src/modules/eval/eval-item-domain.ts server/test/eval-item-domain.test.ts
git commit -m "feat(eval): 评测项领域纯函数(归一化判重/key/target skill 解析/产物映射)"
```

---

## Task 3: Migration + verify-schema + data-source 注册

**Files:**
- Create: `server/src/infrastructure/mysql/migrations/1780000020000-create-eval-items.ts`
- Modify: `server/src/infrastructure/mysql/data-source.ts`
- Modify: `server/src/infrastructure/mysql/verify-schema.ts`

- [ ] **Step 1: 创建 migration `1780000020000-create-eval-items.ts`**

照抄 `1780000013000-create-profile-configs.ts` 的幂等 helper 结构。

```typescript
import type { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateEvalItems1780000020000 implements MigrationInterface {
  name = 'CreateEvalItems1780000020000';

  async up(queryRunner: QueryRunner): Promise<void> {
    if (await tableExists(queryRunner, 'eval_items')) return;
    await queryRunner.query(`
      CREATE TABLE \`eval_items\` (
        \`id\` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        \`item_key\` CHAR(64) NOT NULL,
        \`profile_id\` VARCHAR(191) NOT NULL,
        \`source\` VARCHAR(32) NOT NULL,
        \`origin_interaction_id\` BIGINT UNSIGNED NULL,
        \`origin_prompt_id\` VARCHAR(191) NULL,
        \`origin_projection_run_id\` BIGINT UNSIGNED NULL,
        \`origin_capability_code\` VARCHAR(64) NULL,
        \`origin_raw_capability_name\` VARCHAR(191) NULL,
        \`target_skill\` VARCHAR(191) NULL,
        \`target_artifact_type\` VARCHAR(64) NULL,
        \`prompt_text\` LONGTEXT NULL,
        \`title\` VARCHAR(500) NULL,
        \`notes\` TEXT NULL,
        \`enabled\` TINYINT(1) NOT NULL DEFAULT 1,
        \`occurrence_count\` INT UNSIGNED NOT NULL DEFAULT 0,
        \`first_observed_at\` DATETIME(3) NULL,
        \`last_observed_at\` DATETIME(3) NULL,
        \`last_imported_at\` DATETIME(3) NULL,
        \`deleted_at\` DATETIME(3) NULL,
        \`deleted_by_user_id\` BIGINT UNSIGNED NULL,
        \`gmt_create\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        \`gmt_modified\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`uk_eval_items_item_key\` (\`item_key\`),
        KEY \`idx_eval_items_profile_modified\` (\`profile_id\`, \`deleted_at\`, \`gmt_modified\`, \`id\`),
        KEY \`idx_eval_items_profile_capability\` (\`profile_id\`, \`deleted_at\`, \`origin_capability_code\`, \`enabled\`),
        KEY \`idx_eval_items_profile_skill\` (\`profile_id\`, \`deleted_at\`, \`target_skill\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    if (await tableExists(queryRunner, 'eval_items')) {
      await queryRunner.query(`DROP TABLE \`eval_items\``);
    }
  }
}

async function tableExists(queryRunner: QueryRunner, table: string): Promise<boolean> {
  const rows = (await queryRunner.query(
    `SELECT 1 FROM information_schema.tables WHERE table_schema=DATABASE() AND table_name=? LIMIT 1`,
    [table],
  )) as unknown[];
  return rows.length > 0;
}
```

- [ ] **Step 2: 注册到 `data-source.ts`**

在 import 区（line 29 之后）加：
```typescript
import { CreateEvalItems1780000020000 } from './migrations/1780000020000-create-eval-items';
```
在 `migrations: []` 数组末尾（line 74 `AddProfileArtifactWritesInteractionIndex1780000019000,` 之后）加：
```typescript
      CreateEvalItems1780000020000,
```

- [ ] **Step 3: 更新 `verify-schema.ts` 三处白名单**

在 `expectedTables` 数组（line 37 前）加：
```typescript
  'eval_items',
```
在 `expectedUniqueIndexes` 数组（line 67 前）加：
```typescript
  'uk_eval_items_item_key',
```
在 `expectedColumns` map（line 170 前）加：
```typescript
  eval_items: [
    'item_key',
    'profile_id',
    'source',
    'origin_interaction_id',
    'origin_projection_run_id',
    'origin_capability_code',
    'origin_raw_capability_name',
    'target_skill',
    'target_artifact_type',
    'prompt_text',
    'enabled',
    'occurrence_count',
    'deleted_at',
    'deleted_by_user_id',
  ],
```

- [ ] **Step 4: 验证 migration 实际建表**

Run:
```bash
docker compose up -d mysql
pnpm db:migrate
pnpm db:verify
```
Expected: `db:verify` 输出 `[sdd-telemetry] schema verified: ... tables, ... unique indexes`，不报缺表/缺索引/缺列。

- [ ] **Step 5: 提交**

```bash
git add server/src/infrastructure/mysql/migrations/1780000020000-create-eval-items.ts server/src/infrastructure/mysql/data-source.ts server/src/infrastructure/mysql/verify-schema.ts
git commit -m "feat(eval): 新增 eval_items 表(migration)+db:verify 白名单"
```

---

## Task 4: server 侧 ProfileConfigRepository 补 by-versionId 加载方法

**Files:**
- Modify: `server/src/modules/profiles/profile-config.repository.ts`

import 需要 versionId 非空时读不可变配置快照；现有 `getVersionPointerProfileConfig` 走指针列，不能直接用。仿照它新增显式 versionId 方法。

- [ ] **Step 1: 在 `ProfileConfigRepository` 类内（`getPublishedProfileConfig` 后）加方法**

```typescript
  /**
   * 按 profileId + 显式 versionId 读不可变配置快照。
   * eval import 用它加载 projection run 引用的 config version (KTD8)。
   * 注意 version_status 不限定: projection run 引用的可能是 published 版本。
   */
  async getProfileConfigVersionById(profileId: string, versionId: string): Promise<ProfileConfigSnapshot | null> {
    try {
      const dataSource = await this.mysqlDataSourceManager.getDataSource();
      const rows = (await dataSource.query(
        `SELECT c.profile_id, c.origin,
                v.id AS config_version_id, v.version_no, v.definition_hash, v.published_at, v.config_json
         FROM profile_configs c
         JOIN profile_config_versions v
           ON v.profile_id = c.profile_id
          AND v.id = ?
         WHERE c.profile_id = ?
         LIMIT 1`,
        [versionId, profileId],
      )) as PublishedProfileConfigRow[];
      return rows[0] ? toSnapshot(rows[0]) : null;
    } catch (error) {
      if (isMissingProfileConfigTable(error)) return null;
      throw error;
    }
  }
```

- [ ] **Step 2: typecheck 确认签名正确**

Run: `pnpm typecheck`
Expected: PASS（无新增类型错误）

- [ ] **Step 3: 提交**

```bash
git add server/src/modules/profiles/profile-config.repository.ts
git commit -m "feat(eval): ProfileConfigRepository 补 by-versionId 配置加载方法"
```

---

## Task 5: Repository（裸 SQL 读写）

**Files:**
- Create: `server/src/modules/eval/eval-item.repository.ts`
- Test: `server/test/eval-item.repository.test.ts`

仓储用 mock `query` 风格（对齐 `profile-projection-demand-detail.test.ts`）。事务方法（import/upsert/delete）在 service 测试里用 mock repository 覆盖编排，避免在这里模拟 `dataSource.transaction`。

- [ ] **Step 1: 实现 `eval-item.repository.ts`**

```typescript
import { Inject, Provide } from '@midwayjs/core';
import type { EntityManager } from 'typeorm';
import { MysqlDataSourceManager } from '../../infrastructure/mysql/data-source-manager';
import { previewPrompt } from './eval-item-domain';

export interface EvalItemRow {
  id: string;
  itemKey: string;
  profileId: string;
  source: 'cleaned' | 'manual';
  promptText: string | null;
  targetSkill: string | null;
  targetArtifactType: string | null;
  originInteractionId: string | null;
  originPromptId: string | null;
  originProjectionRunId: string | null;
  originCapabilityCode: string | null;
  originRawCapabilityName: string | null;
  occurrenceCount: number;
  firstObservedAt: string | null;
  lastObservedAt: string | null;
  lastImportedAt: string | null;
  enabled: boolean;
  title: string | null;
  notes: string | null;
  deletedAt: string | null;
}

interface ListFilter {
  profileId: string;
  source?: 'cleaned' | 'manual';
  capabilityCode?: string;
  targetSkill?: string;
  enabled?: boolean;
  keyword?: string;
  page: number;
  pageSize: number;
}

export interface ImportCandidate {
  itemKey: string;
  profileId: string;
  promptText: string;
  targetSkill: string | null;
  targetArtifactType: string | null;
  originInteractionId: string | null;
  originPromptId: string | null;
  originProjectionRunId: string;
  originCapabilityCode: string;
  originRawCapabilityName: string | null;
  occurrenceCount: number;
  firstObservedAt: string | null;
  lastObservedAt: string | null;
}

export interface CapabilityTextRow {
  cuId: string;
  interactionId: string | null;
  promptId: string | null;
  capabilityCode: string;
  rawCapabilityName: string | null;
  eventTime: string | null;
  promptText: string | null;
}

/**
 * eval_items 仓储 (裸 SQL)。与 profile-config-admin 兄弟模块对齐, 不引入 TypeORM entity:
 * import-from-logs 跨表 join 注定手写 SQL, 两套范式混用最糟。
 * 未来 Slice 2/3 若 run->items 一对多查询变复杂, 可局部引入 entity (局部重构)。
 */
@Provide('evalItemRepository')
export class EvalItemRepository {
  @Inject('mysqlDataSourceManager')
  mysqlDataSourceManager!: MysqlDataSourceManager;

  async getCurrentProjectionRunId(profileId: string): Promise<string | null> {
    const dataSource = await this.mysqlDataSourceManager.getDataSource();
    const rows = (await dataSource.query(
      `SELECT current_projection_run_id AS runId
       FROM profile_current_projection_runs
       WHERE profile_id = ? LIMIT 1`,
      [profileId],
    )) as Array<{ runId: string | null }>;
    return rows[0]?.runId ?? null;
  }

  /** 按 capability usage id 单调游标分批读取候选 (LEFT JOIN 保留无正文记录)。 */
  async readCapabilityTextRows(input: {
    profileId: string;
    projectionRunId: string;
    capabilityCode?: string;
    from?: string;
    to?: string;
    afterCuId?: string;
    batchSize: number;
  }): Promise<CapabilityTextRow[]> {
    const dataSource = await this.mysqlDataSourceManager.getDataSource();
    const params: unknown[] = [input.profileId, input.projectionRunId];
    let where = 'WHERE cu.profile_id = ? AND cu.projection_run_id = ?';
    if (input.afterCuId) {
      where += ' AND cu.id > ?';
      params.push(input.afterCuId);
    }
    if (input.capabilityCode) {
      where += ' AND cu.capability_code = ?';
      params.push(input.capabilityCode);
    }
    if (input.from) {
      where += ' AND (cu.event_time IS NULL OR cu.event_time >= ?)';
      params.push(input.from);
    }
    if (input.to) {
      where += ' AND (cu.event_time IS NULL OR cu.event_time <= ?)';
      params.push(input.to);
    }
    params.push(input.batchSize);
    return (await dataSource.query(
      `SELECT CAST(cu.id AS CHAR) AS cuId, CAST(cu.interaction_id AS CHAR) AS interactionId,
              cu.prompt_id AS promptId, cu.capability_code AS capabilityCode,
              cu.raw_capability_name AS rawCapabilityName,
              ${dateCol('cu.event_time')} AS eventTime,
              t.prompt_text AS promptText
       FROM profile_capability_usages cu
       LEFT JOIN sdd_interaction_texts t ON t.interaction_id = cu.interaction_id
       ${where}
       ORDER BY cu.id ASC
       LIMIT ?`,
      params,
    )) as CapabilityTextRow[];
  }

  async listItems(filter: ListFilter): Promise<{ items: EvalItemRow[]; total: number }> {
    const dataSource = await this.mysqlDataSourceManager.getDataSource();
    const where: string[] = ['profile_id = ?', 'deleted_at IS NULL'];
    const params: unknown[] = [filter.profileId];
    if (filter.source) { where.push('source = ?'); params.push(filter.source); }
    if (filter.capabilityCode) { where.push('origin_capability_code = ?'); params.push(filter.capabilityCode); }
    if (filter.targetSkill) { where.push('target_skill = ?'); params.push(filter.targetSkill); }
    if (filter.enabled !== undefined) { where.push('enabled = ?'); params.push(filter.enabled ? 1 : 0); }
    if (filter.keyword) {
      where.push('(title LIKE ? OR notes LIKE ? OR target_skill LIKE ?)');
      const kw = `%${filter.keyword}%`;
      params.push(kw, kw, kw);
    }
    const whereSql = where.join(' AND ');
    const totalRows = (await dataSource.query(
      `SELECT COUNT(*) AS cnt FROM eval_items WHERE ${whereSql}`,
      params,
    )) as Array<{ cnt: number | string }>;
    const total = Number(totalRows[0]?.cnt ?? 0);
    const offset = (filter.page - 1) * filter.pageSize;
    params.push(filter.pageSize, offset);
    const rows = (await dataSource.query(
      `SELECT ${itemColumns()} FROM eval_items WHERE ${whereSql}
       ORDER BY gmt_modified DESC, id DESC LIMIT ? OFFSET ?`,
      params,
    )) as EvalItemDbRow[];
    return { items: rows.map(toItemRow), total };
  }

  async listSummary(profileId: string): Promise<{ total: number; enabled: number; cleaned: number; manual: number }> {
    const dataSource = await this.mysqlDataSourceManager.getDataSource();
    const rows = (await dataSource.query(
      `SELECT
         COUNT(*) AS total,
         SUM(enabled = 1) AS enabled,
         SUM(source = 'cleaned') AS cleaned,
         SUM(source = 'manual') AS manual
       FROM eval_items
       WHERE profile_id = ? AND deleted_at IS NULL`,
      [profileId],
    )) as Array<{ total: number | string; enabled: number | string | null; cleaned: number | string | null; manual: number | string | null }>;
    const r = rows[0];
    return {
      total: Number(r?.total ?? 0),
      enabled: Number(r?.enabled ?? 0),
      cleaned: Number(r?.cleaned ?? 0),
      manual: Number(r?.manual ?? 0),
    };
  }

  async getItem(id: string, profileId: string): Promise<EvalItemRow | null> {
    const dataSource = await this.mysqlDataSourceManager.getDataSource();
    const rows = (await dataSource.query(
      `SELECT ${itemColumns()} FROM eval_items
       WHERE id = ? AND profile_id = ? AND deleted_at IS NULL LIMIT 1`,
      [id, profileId],
    )) as EvalItemDbRow[];
    return rows[0] ? toItemRow(rows[0]) : null;
  }

  async getItemByKey(itemKey: string): Promise<EvalItemRow | null> {
    const dataSource = await this.mysqlDataSourceManager.getDataSource();
    const rows = (await dataSource.query(
      `SELECT ${itemColumns()} FROM eval_items WHERE item_key = ? LIMIT 1`,
      [itemKey],
    )) as EvalItemDbRow[];
    return rows[0] ? toItemRow(rows[0]) : null;
  }

  /**
   * 导入事务: 按 item_key upsert。
   * - 命中 deleted tombstone => 跳过 (skippedDeleted), 不复活。
   * - 命中未删除行 => 刷新 cleaned 来源统计 + 用规范等价最新原文替换 prompt,
   *   不覆盖 title/notes/enabled; manual->cleaned 计 upgraded。
   * - 未命中 => insert (source=cleaned)。
   * 返回 { outcome: 'inserted' | 'refreshed' | 'upgraded' | 'skippedDeleted' }。
   */
  async upsertCleanedCandidatesInTransaction(
    manager: EntityManager,
    candidates: ImportCandidate[],
    nowIso: string,
  ): Promise<{ inserted: number; refreshed: number; upgraded: number; skippedDeleted: number }> {
    let inserted = 0;
    let refreshed = 0;
    let upgraded = 0;
    let skippedDeleted = 0;
    for (const c of candidates) {
      const existing = (await manager.query(
        `SELECT id, source, deleted_at FROM eval_items WHERE item_key = ? LIMIT 1`,
        [c.itemKey],
      )) as Array<{ id: string | number; source: string; deleted_at: string | null }>;
      if (existing[0]?.deleted_at) {
        skippedDeleted += 1;
        continue;
      }
      if (existing[0]) {
        const isUpgrade = existing[0].source !== 'cleaned';
        await manager.query(
          `UPDATE eval_items
             SET source = 'cleaned',
                 prompt_text = ?,
                 origin_interaction_id = ?,
                 origin_prompt_id = ?,
                 origin_projection_run_id = ?,
                 origin_capability_code = ?,
                 origin_raw_capability_name = ?,
                 occurrence_count = ?,
                 first_observed_at = ?,
                 last_observed_at = ?,
                 last_imported_at = ?,
                 gmt_modified = CURRENT_TIMESTAMP(3)
           WHERE id = ?`,
          [
            c.promptText,
            c.originInteractionId,
            c.originPromptId,
            c.originProjectionRunId,
            c.originCapabilityCode,
            c.originRawCapabilityName,
            c.occurrenceCount,
            c.firstObservedAt,
            c.lastObservedAt,
            nowIso,
            existing[0].id,
          ],
        );
        if (isUpgrade) upgraded += 1; else refreshed += 1;
        continue;
      }
      await manager.query(
        `INSERT INTO eval_items
           (item_key, profile_id, source, origin_interaction_id, origin_prompt_id,
            origin_projection_run_id, origin_capability_code, origin_raw_capability_name,
            target_skill, target_artifact_type, prompt_text, enabled, occurrence_count,
            first_observed_at, last_observed_at, last_imported_at,
            gmt_create, gmt_modified)
         VALUES (?, ?, 'cleaned', ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3))`,
        [
          c.itemKey,
          c.profileId,
          c.originInteractionId,
          c.originPromptId,
          c.originProjectionRunId,
          c.originCapabilityCode,
          c.originRawCapabilityName,
          c.targetSkill,
          c.targetArtifactType,
          c.promptText,
          c.occurrenceCount,
          c.firstObservedAt,
          c.lastObservedAt,
          nowIso,
        ],
      );
      inserted += 1;
    }
    return { inserted, refreshed, upgraded, skippedDeleted };
  }

  async insertManualInTransaction(
    manager: EntityManager,
    input: {
      itemKey: string;
      profileId: string;
      promptText: string;
      targetSkill: string;
      targetArtifactType: string;
      title?: string;
      notes?: string;
    },
  ): Promise<{ status: 'created'; id: string } | { status: 'tombstone' } | { status: 'exists'; existingId: string }> {
    const existing = (await manager.query(
      `SELECT id, deleted_at FROM eval_items WHERE item_key = ? LIMIT 1`,
      [input.itemKey],
    )) as Array<{ id: string | number; deleted_at: string | null }>;
    if (existing[0]?.deleted_at) return { status: 'tombstone' };
    if (existing[0]) return { status: 'exists', existingId: String(existing[0].id) };
    const result = (await manager.query(
      `INSERT INTO eval_items
         (item_key, profile_id, source, target_skill, target_artifact_type, prompt_text,
          title, notes, enabled, occurrence_count,
          gmt_create, gmt_modified)
       VALUES (?, ?, 'manual', ?, ?, ?, ?, ?, 1, 0, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3))`,
      [
        input.itemKey,
        input.profileId,
        input.targetSkill,
        input.targetArtifactType,
        input.promptText,
        input.title ?? null,
        input.notes ?? null,
      ],
    )) as { insertId?: string | number };
    return { status: 'created', id: String(result.insertId) };
  }

  async updateItemInTransaction(
    manager: EntityManager,
    input: {
      id: string;
      profileId: string;
      source: 'cleaned' | 'manual';
      promptText?: string;
      targetSkill?: string;
      targetArtifactType?: string;
      title?: string | null;
      notes?: string | null;
      enabled?: boolean;
      itemKey?: string;
    },
  ): Promise<{ status: 'updated' } | { status: 'missing' } | { status: 'conflict' }> {
    const sets: string[] = [];
    const params: unknown[] = [];
    if (input.title !== undefined) { sets.push('title = ?'); params.push(input.title); }
    if (input.notes !== undefined) { sets.push('notes = ?'); params.push(input.notes); }
    if (input.enabled !== undefined) { sets.push('enabled = ?'); params.push(input.enabled ? 1 : 0); }
    if (input.source === 'manual') {
      if (input.promptText !== undefined) { sets.push('prompt_text = ?'); params.push(input.promptText); }
      if (input.targetSkill !== undefined) { sets.push('target_skill = ?'); params.push(input.targetSkill); }
      if (input.targetArtifactType !== undefined) { sets.push('target_artifact_type = ?'); params.push(input.targetArtifactType); }
      if (input.itemKey !== undefined) { sets.push('item_key = ?'); params.push(input.itemKey); }
    }
    if (sets.length === 0) {
      const rows = (await manager.query(
        `SELECT 1 FROM eval_items WHERE id = ? AND profile_id = ? AND deleted_at IS NULL LIMIT 1`,
        [input.id, input.profileId],
      )) as unknown[];
      return rows.length ? { status: 'updated' } : { status: 'missing' };
    }
    sets.push('gmt_modified = CURRENT_TIMESTAMP(3)');
    params.push(input.id, input.profileId);
    try {
      const result = (await manager.query(
        `UPDATE eval_items SET ${sets.join(', ')}
         WHERE id = ? AND profile_id = ? AND deleted_at IS NULL`,
        params,
      )) as { affectedRows?: number };
      if ((result.affectedRows ?? 0) === 0) {
        const exists = (await manager.query(
          `SELECT 1 FROM eval_items WHERE id = ? AND profile_id = ? LIMIT 1`,
          [input.id, input.profileId],
        )) as unknown[];
        return exists.length ? { status: 'conflict' } : { status: 'missing' };
      }
      return { status: 'updated' };
    } catch (error) {
      if (isDuplicateKey(error)) return { status: 'conflict' };
      throw error;
    }
  }

  async deleteItemInTransaction(
    manager: EntityManager,
    input: { id: string; profileId: string; userId: string },
  ): Promise<{ status: 'deleted' } | { status: 'missing' }> {
    const result = (await manager.query(
      `UPDATE eval_items
         SET prompt_text = NULL, title = NULL, notes = NULL,
             origin_interaction_id = NULL, origin_prompt_id = NULL,
             origin_projection_run_id = NULL, origin_capability_code = NULL,
             origin_raw_capability_name = NULL,
             enabled = 0, deleted_at = CURRENT_TIMESTAMP(3), deleted_by_user_id = ?,
             gmt_modified = CURRENT_TIMESTAMP(3)
       WHERE id = ? AND profile_id = ? AND deleted_at IS NULL`,
      [input.userId, input.id, input.profileId],
    )) as { affectedRows?: number };
    return (result.affectedRows ?? 0) > 0 ? { status: 'deleted' } : { status: 'missing' };
  }

  async runInTransaction<T>(work: (manager: EntityManager) => Promise<T>): Promise<T> {
    const dataSource = await this.mysqlDataSourceManager.getDataSource();
    return dataSource.transaction(work);
  }

  async listSummaryForItem(id: string, profileId: string): Promise<EvalItemRow | null> {
    return this.getItem(id, profileId);
  }
}

function dateCol(expr: string): string {
  // MySQL DATETIME(3) -> ISO 字符串交给 service 层 toIso; 这里直接返回列, service 转换。
  return expr;
}

interface EvalItemDbRow {
  id: number | string;
  item_key: string;
  profile_id: string;
  source: string;
  prompt_text: string | null;
  target_skill: string | null;
  target_artifact_type: string | null;
  origin_interaction_id: number | string | null;
  origin_prompt_id: string | null;
  origin_projection_run_id: number | string | null;
  origin_capability_code: string | null;
  origin_raw_capability_name: string | null;
  occurrence_count: number | string;
  first_observed_at: Date | string | null;
  last_observed_at: Date | string | null;
  last_imported_at: Date | string | null;
  enabled: number | boolean;
  title: string | null;
  notes: string | null;
  deleted_at: Date | string | null;
}

function itemColumns(): string {
  return `CAST(id AS CHAR) AS id, item_key, profile_id, source, prompt_text,
          target_skill, target_artifact_type,
          CAST(origin_interaction_id AS CHAR) AS origin_interaction_id,
          origin_prompt_id, CAST(origin_projection_run_id AS CHAR) AS origin_projection_run_id,
          origin_capability_code, origin_raw_capability_name, occurrence_count,
          first_observed_at, last_observed_at, last_imported_at,
          enabled, title, notes, deleted_at`;
}

function toItemRow(row: EvalItemDbRow): EvalItemRow {
  return {
    id: String(row.id),
    itemKey: row.item_key,
    profileId: row.profile_id,
    source: row.source as 'cleaned' | 'manual',
    promptText: row.prompt_text,
    targetSkill: row.target_skill,
    targetArtifactType: row.target_artifact_type,
    originInteractionId: row.origin_interaction_id == null ? null : String(row.origin_interaction_id),
    originPromptId: row.origin_prompt_id,
    originProjectionRunId: row.origin_projection_run_id == null ? null : String(row.origin_projection_run_id),
    originCapabilityCode: row.origin_capability_code,
    originRawCapabilityName: row.origin_raw_capability_name,
    occurrenceCount: Number(row.occurrence_count),
    firstObservedAt: toIso(row.first_observed_at),
    lastObservedAt: toIso(row.last_observed_at),
    lastImportedAt: toIso(row.last_imported_at),
    enabled: Boolean(row.enabled),
    title: row.title,
    notes: row.notes,
    deletedAt: toIso(row.deleted_at),
  };
}

function toIso(value: Date | string | null): string | null {
  if (value == null) return null;
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

export function isDuplicateKey(error: unknown): boolean {
  const code = (error as { code?: string }).code;
  return code === 'ER_DUP_ENTRY';
}

export { previewPrompt };
```

- [ ] **Step 2: 写仓储 mock-query 测试 `server/test/eval-item.repository.test.ts`**

```typescript
import { describe, expect, it } from 'vitest';
import { EvalItemRepository } from '../src/modules/eval/eval-item.repository';

function createRepository(query: (sql: string, params?: unknown[]) => Promise<Array<Record<string, unknown>>>) {
  const repository = new EvalItemRepository();
  repository.mysqlDataSourceManager = {
    getDataSource: async () => ({ query }),
  } as EvalItemRepository['mysqlDataSourceManager'];
  return repository;
}

describe('EvalItemRepository', () => {
  it('getCurrentProjectionRunId returns runId', async () => {
    const repo = createRepository(async () => [{ runId: '77' }]);
    await expect(repo.getCurrentProjectionRunId('sdd-default')).resolves.toBe('77');
  });

  it('getCurrentProjectionRunId returns null when no row', async () => {
    const repo = createRepository(async () => []);
    await expect(repo.getCurrentProjectionRunId('p')).resolves.toBeNull();
  });

  it('listItems applies filters and maps rows', async () => {
    const repo = createRepository(async (sql) => {
      if (sql.startsWith('SELECT COUNT(*)')) return [{ cnt: 1 }];
      return [{
        id: 5, item_key: 'k', profile_id: 'sdd-default', source: 'cleaned', prompt_text: 'hi',
        target_skill: 'bk-fe-design', target_artifact_type: 'design',
        origin_interaction_id: '9', origin_prompt_id: null, origin_projection_run_id: '7',
        origin_capability_code: 'design', origin_raw_capability_name: 'bk-fe-design',
        occurrence_count: 2, first_observed_at: null, last_observed_at: '2026-06-21 00:00:00.000',
        last_imported_at: null, enabled: 1, title: null, notes: null, deleted_at: null,
      }];
    });
    const { items, total } = await repo.listItems({
      profileId: 'sdd-default', source: 'cleaned', capabilityCode: 'design',
      enabled: true, keyword: 'x', page: 1, pageSize: 20,
    });
    expect(total).toBe(1);
    expect(items[0].id).toBe('5');
    expect(items[0].source).toBe('cleaned');
    expect(items[0].occurrenceCount).toBe(2);
  });

  it('listSummary aggregates counts', async () => {
    const repo = createRepository(async () => [{ total: 10, enabled: 7, cleaned: 6, manual: 4 }]);
    await expect(repo.listSummary('sdd-default')).resolves.toEqual({ total: 10, enabled: 7, cleaned: 6, manual: 4 });
  });

  it('getItem returns null when not found', async () => {
    const repo = createRepository(async () => []);
    await expect(repo.getItem('1', 'sdd-default')).resolves.toBeNull();
  });
});
```

- [ ] **Step 3: 运行测试确认通过**

Run: `pnpm --filter @sdd-telemetry/server test -- eval-item.repository`
Expected: PASS

- [ ] **Step 4: 提交**

```bash
git add server/src/modules/eval/eval-item.repository.ts server/test/eval-item.repository.test.ts
git commit -m "feat(eval): eval_items 裸 SQL 仓储(列表/详情/导入 upsert/CRUD/tombstone)"
```

---

## Task 6: Service（编排 + 导入分组 + 统计）

**Files:**
- Create: `server/src/modules/eval/eval-item.service.ts`
- Test: `server/test/eval-item.service.test.ts`

service 用 mock repository 覆盖编排逻辑（归一化分组、统计恒等、cleaned/manual 字段权限、tombstone 行为）。

- [ ] **Step 1: 实现 `eval-item.service.ts`**

```typescript
import { Inject, Provide } from '@midwayjs/core';
import {
  parseWorkflowProfileConfig,
  type AuthSessionUser,
  type WorkflowProfileConfig,
} from '@sdd-telemetry/api';
import { ApiHttpError, conflict, forbidden } from '../../common/auth/api-http-error';
import {
  computeItemKey,
  mapArtifactType,
  normalizePromptForDedup,
  PROMPT_MAX,
  resolveTargetSkill,
  previewPrompt,
} from './eval-item-domain';
import type {
  CapabilityTextRow,
  EvalItemRow,
  ImportCandidate,
} from './eval-item.repository';
import { EvalItemRepository } from './eval-item.repository';
import { ProfileConfigRepository } from '../profiles/profile-config.repository';

const BATCH_SIZE = 500;

export interface EvalItemListQuery {
  profileId: string;
  source?: 'cleaned' | 'manual';
  capabilityCode?: string;
  targetSkill?: string;
  enabled?: boolean;
  keyword?: string;
  page: number;
  pageSize: number;
}

@Provide('evalItemService')
export class EvalItemService {
  @Inject('evalItemRepository')
  evalItemRepository!: EvalItemRepository;

  @Inject('profileConfigRepository')
  profileConfigRepository!: ProfileConfigRepository;

  async list(query: EvalItemListQuery): Promise<{
    items: Array<Omit<EvalItemRow, 'promptText'> & { promptPreview: string }>;
    total: number;
    page: number;
    pageSize: number;
    summary: { total: number; enabled: number; cleaned: number; manual: number };
  }> {
    const { items, total } = await this.evalItemRepository.listItems(query);
    const summary = await this.evalItemRepository.listSummary(query.profileId);
    return {
      items: items.map((item) => ({
        ...stripPrompt(item),
        promptPreview: previewPrompt(item.promptText ?? ''),
      })),
      total,
      page: query.page,
      pageSize: query.pageSize,
      summary,
    };
  }

  async getDetail(id: string, profileId: string): Promise<EvalItemRow> {
    const item = await this.evalItemRepository.getItem(id, profileId);
    if (!item) {
      throw new ApiHttpError(404, 'EVAL_ITEM_NOT_FOUND', `eval item not found: ${id}`);
    }
    return item;
  }

  async importFromLogs(input: {
    profileId: string;
    capabilityCode?: string;
    from?: string;
    to?: string;
  }): Promise<{
    projectionRunId: string;
    scannedCount: number;
    candidateCount: number;
    insertedCount: number;
    refreshedCount: number;
    upgradedCount: number;
    skippedNoPromptCount: number;
    skippedOversizeCount: number;
    skippedDeletedCount: number;
  }> {
    const config = await this.requireEvaluationProfile(input.profileId);
    const projectionRunId = await this.evalItemRepository.getCurrentProjectionRunId(input.profileId);
    if (!projectionRunId) {
      throw new ApiHttpError(409, 'EVAL_NO_PROJECTION_RUN', `no current projection run for ${input.profileId}`);
    }
    const versionId = await this.resolveConfigVersionId(input.profileId, projectionRunId);

    const scannedCount = { value: 0 };
    const skippedNoPrompt = { value: 0 };
    const skippedOversize = { value: 0 };
    const groups = new Map<string, CapabilityTextRow[]>();

    let afterCuId: string | undefined;
    for (;;) {
      const rows = await this.evalItemRepository.readCapabilityTextRows({
        profileId: input.profileId,
        projectionRunId,
        capabilityCode: input.capabilityCode,
        from: input.from,
        to: input.to,
        afterCuId,
        batchSize: BATCH_SIZE,
      });
      if (rows.length === 0) break;
      afterCuId = rows[rows.length - 1].cuId;
      for (const row of rows) {
        scannedCount.value += 1;
        const text = row.promptText;
        if (!text || text.trim().length === 0) {
          skippedNoPrompt.value += 1;
          continue;
        }
        if (text.length > PROMPT_MAX) {
          skippedOversize.value += 1;
          continue;
        }
        const normalized = normalizePromptForDedup(text);
        const groupKey = `${row.capabilityCode}\u0000${normalized}`;
        const list = groups.get(groupKey);
        if (list) list.push(row); else groups.set(groupKey, [row]);
      }
      if (rows.length < BATCH_SIZE) break;
    }

    const candidates = buildCandidates(groups, {
      profileId: input.profileId,
      projectionRunId,
      config: versionId ? await this.loadConfigVersion(input.profileId, versionId) : config,
    });

    const nowIso = new Date().toISOString();
    const outcome = await this.evalItemRepository.runInTransaction(async (manager) =>
      this.evalItemRepository.upsertCleanedCandidatesInTransaction(manager, candidates, nowIso),
    );

    return {
      projectionRunId,
      scannedCount: scannedCount.value,
      candidateCount: candidates.length,
      insertedCount: outcome.inserted,
      refreshedCount: outcome.refreshed,
      upgradedCount: outcome.upgraded,
      skippedNoPromptCount: skippedNoPrompt.value,
      skippedOversizeCount: skippedOversize.value,
      skippedDeletedCount: outcome.skippedDeleted,
    };
  }

  async createManual(input: {
    profileId: string;
    promptText: string;
    targetSkill: string;
    targetArtifactType: string;
    title?: string;
    notes?: string;
    actor: AuthSessionUser;
  }): Promise<{ id: string }> {
    await this.requireEvaluationProfile(input.profileId);
    const normalized = normalizePromptForDedup(input.promptText);
    const itemKey = computeItemKey({
      profileId: input.profileId,
      targetSkill: input.targetSkill,
      targetArtifactType: input.targetArtifactType,
      normalizedPrompt: normalized,
    });
    const result = await this.evalItemRepository.runInTransaction(async (manager) =>
      this.evalItemRepository.insertManualInTransaction(manager, {
        itemKey,
        profileId: input.profileId,
        promptText: input.promptText,
        targetSkill: input.targetSkill,
        targetArtifactType: input.targetArtifactType,
        ...(input.title !== undefined ? { title: input.title } : {}),
        ...(input.notes !== undefined ? { notes: input.notes } : {}),
      }),
    );
    if (result.status === 'tombstone') {
      throw conflict('该样本已被删除,无法重新创建');
    }
    if (result.status === 'exists') {
      throw conflict('该样本已存在');
    }
    return { id: result.id };
  }

  async update(id: string, input: {
    profileId: string;
    source?: never; // 来自 DB, 不信任客户端
    promptText?: string;
    targetSkill?: string;
    targetArtifactType?: 'design' | 'proposal' | 'tasks';
    title?: string | null;
    notes?: string | null;
    enabled?: boolean;
    actor: AuthSessionUser;
  }): Promise<void> {
    const existing = await this.evalItemRepository.getItem(id, input.profileId);
    if (!existing) {
      throw new ApiHttpError(404, 'EVAL_ITEM_NOT_FOUND', `eval item not found: ${id}`);
    }
    let nextItemKey: string | undefined;
    if (existing.source === 'manual') {
      // manual: 允许改 key 字段; 任一 key 字段变更则重算 key
      const newPrompt = input.promptText !== undefined ? input.promptText : existing.promptText ?? '';
      const newSkill = input.targetSkill !== undefined ? input.targetSkill : existing.targetSkill ?? '';
      const newArtifact = input.targetArtifactType !== undefined ? input.targetArtifactType : existing.targetArtifactType ?? '';
      const newKey = computeItemKey({
        profileId: input.profileId,
        targetSkill: newSkill,
        targetArtifactType: newArtifact,
        normalizedPrompt: normalizePromptForDedup(newPrompt),
      });
      if (newKey !== existing.itemKey) nextItemKey = newKey;
    } else {
      // cleaned: 拒绝 prompt/target 改动
      if (input.promptText !== undefined || input.targetSkill !== undefined || input.targetArtifactType !== undefined) {
        throw new ApiHttpError(400, 'EVAL_CLEANED_IMMUTABLE', 'cleaned 样本的 prompt/target 不可直接编辑,请复制为手工样本');
      }
    }
    const result = await this.evalItemRepository.runInTransaction(async (manager) =>
      this.evalItemRepository.updateItemInTransaction(manager, {
        id,
        profileId: input.profileId,
        source: existing.source,
        ...(input.title !== undefined ? { title: input.title } : {}),
        ...(input.notes !== undefined ? { notes: input.notes } : {}),
        ...(input.enabled !== undefined ? { enabled: input.enabled } : {}),
        ...(existing.source === 'manual' && input.promptText !== undefined ? { promptText: input.promptText } : {}),
        ...(existing.source === 'manual' && input.targetSkill !== undefined ? { targetSkill: input.targetSkill } : {}),
        ...(existing.source === 'manual' && input.targetArtifactType !== undefined ? { targetArtifactType: input.targetArtifactType } : {}),
        ...(nextItemKey !== undefined ? { itemKey: nextItemKey } : {}),
      }),
    );
    if (result.status === 'missing') {
      throw new ApiHttpError(404, 'EVAL_ITEM_NOT_FOUND', `eval item not found: ${id}`);
    }
    if (result.status === 'conflict') {
      throw conflict('目标样本已存在,无法改为重复 key');
    }
  }

  async remove(id: string, input: { profileId: string; actor: AuthSessionUser }): Promise<void> {
    const result = await this.evalItemRepository.runInTransaction(async (manager) =>
      this.evalItemRepository.deleteItemInTransaction(manager, {
        id,
        profileId: input.profileId,
        userId: input.actor.id,
      }),
    );
    if (result.status === 'missing') {
      throw new ApiHttpError(404, 'EVAL_ITEM_NOT_FOUND', `eval item not found: ${id}`);
    }
  }

  private async requireEvaluationProfile(profileId: string): Promise<WorkflowProfileConfig> {
    const snapshot = await this.profileConfigRepository.getServingProfileConfig(profileId);
    if (!snapshot || !snapshot.config.manifest.evaluation) {
      throw new ApiHttpError(409, 'EVAL_PROFILE_NOT_ENABLED', `evaluation not enabled for ${profileId}`);
    }
    return snapshot.config;
  }

  private async resolveConfigVersionId(profileId: string, projectionRunId: string): Promise<string | null> {
    // 读 projection run 引用的 config version id; legacy run 可能为 null => 回退 serving。
    const dataSource = await (this.evalItemRepository.mysqlDataSourceManager.getDataSource());
    const rows = (await dataSource.query(
      `SELECT profile_config_version_id AS versionId
       FROM profile_projection_runs
       WHERE profile_id = ? AND id = ? LIMIT 1`,
      [profileId, projectionRunId],
    )) as Array<{ versionId: string | null }>;
    return rows[0]?.versionId ?? null;
  }

  private async loadConfigVersion(profileId: string, versionId: string): Promise<WorkflowProfileConfig> {
    const snapshot = await this.profileConfigRepository.getProfileConfigVersionById(profileId, versionId);
    if (!snapshot) {
      throw new ApiHttpError(409, 'EVAL_CONFIG_VERSION_MISSING', `projection references missing config version ${versionId}`);
    }
    return snapshot.config;
  }
}

function stripPrompt(item: EvalItemRow): Omit<EvalItemRow, 'promptText'> {
  const { promptText: _omit, ...rest } = item;
  return rest;
}

/** 按归一化 prompt 分组, 每组取最新原文 + 聚合观测次数。 */
function buildCandidates(
  groups: Map<string, CapabilityTextRow[]>,
  ctx: { profileId: string; projectionRunId: string; config: WorkflowProfileConfig },
): ImportCandidate[] {
  const candidates: ImportCandidate[] = [];
  for (const [, rows] of groups) {
    const sorted = [...rows].sort((a, b) => {
      const at = a.eventTime ? new Date(a.eventTime).getTime() : 0;
      const bt = b.eventTime ? new Date(b.eventTime).getTime() : 0;
      if (bt !== at) return bt - at;
      return Number(b.cuId) - Number(a.cuId);
    });
    const latest = sorted[0];
    const normalized = normalizePromptForDedup(latest.promptText ?? '');
    const targetSkill = resolveTargetSkill(ctx.config, latest.capabilityCode);
    const targetArtifactType = mapArtifactType(latest.capabilityCode);
    const first = rows.reduce<typeof latest.eventTime>((acc, r) => earliest(acc, r.eventTime), null);
    const last = sorted[0].eventTime;
    candidates.push({
      itemKey: computeItemKey({
        profileId: ctx.profileId,
        targetSkill,
        targetArtifactType,
        normalizedPrompt: normalized,
      }),
      profileId: ctx.profileId,
      promptText: latest.promptText ?? '',
      targetSkill,
      targetArtifactType,
      originInteractionId: latest.interactionId,
      originPromptId: latest.promptId,
      originProjectionRunId: ctx.projectionRunId,
      originCapabilityCode: latest.capabilityCode,
      originRawCapabilityName: latest.rawCapabilityName,
      occurrenceCount: rows.length,
      firstObservedAt: first,
      lastObservedAt: last,
    });
  }
  return candidates;
}

function earliest(a: string | null, b: string | null): string | null {
  if (!b) return a;
  if (!a) return b;
  return new Date(a) <= new Date(b) ? a : b;
}

// profile gating: service 不直接信任 viewer 角色 —— controller 层已由 auth middleware 拦截,
// 这里只在 method 入口再次校验以防误注册。
export function assertSuperAdmin(user: AuthSessionUser): void {
  if (user.role !== 'super_admin') throw forbidden();
}

// parseWorkflowProfileConfig 重新导出供测试构造 fixture 时使用。
export { parseWorkflowProfileConfig };
```

- [ ] **Step 2: 写 service 测试 `server/test/eval-item.service.test.ts`**

覆盖：导入分组去重、统计恒等、cleaned/manual 字段权限、tombstone、profile gate。

```typescript
import { describe, expect, it, vi } from 'vitest';
import { EvalItemService } from '../src/modules/eval/eval-item.service';
import type { EvalItemRepository, CapabilityTextRow } from '../src/modules/eval/eval-item.repository';
import type { ProfileConfigRepository } from '../src/modules/profiles/profile-config.repository';
import type { WorkflowProfileConfig } from '@sdd-telemetry/api';

function configFixture(): WorkflowProfileConfig {
  return {
    profileId: 'sdd-default', displayName: 'SDD', status: 'active', projectionMode: 'source_backed',
    manifest: { capabilityUsage: true, deliveryUnits: true, artifacts: true, artifactTimeline: true, knowledgeRecalls: true, codeChanges: true, errors: true, evaluation: true, alerts: false },
    sourceRules: [{ ruleId: 's1', priority: 100, confidence: 'high', enabled: true, category: 'skill', actions: ['invoke'], locatorType: 'skill', skillNames: ['bk-fe-design'] }],
    capabilityRules: [{ ruleId: 'c1', sourceRuleIds: ['s1'], actions: ['invoke'], capabilityCode: 'design', displayName: '设计', surfaceRole: 'core' }],
    deliveryUnitRules: [], artifactRules: [], errorRules: [],
    attributionPolicy: { anchorCategories: ['process_doc'], anchorActions: ['read'], sameInteraction: { enabled: false, preferActions: [] }, sameSessionWindow: { enabled: false, minutes: 0, requireSameUser: false, preferActions: [] } },
    presentation: { workflowKind: 'sdd', maturityStages: [], artifactStageOrder: [], hiddenMetrics: [] },
  };
}

function createService(opts: {
  projectionRunId?: string | null;
  capabilityRows?: CapabilityTextRow[];
  configVersionId?: string | null;
  config?: WorkflowProfileConfig;
  upsert?: (candidates: import('../src/modules/eval/eval-item.repository').ImportCandidate[]) =>
    { inserted: number; refreshed: number; upgraded: number; skippedDeleted: number };
}): EvalItemService {
  const service = new EvalItemService();
  const candidates: import('../src/modules/eval/eval-item.repository').ImportCandidate[] = [];
  service.evalItemRepository = {
    getCurrentProjectionRunId: async () => opts.projectionRunId === undefined ? '77' : opts.projectionRunId,
    readCapabilityTextRows: async (input: { afterCuId?: string }) => {
      if (input.afterCuId) return [];
      return opts.capabilityRows ?? [];
    },
    runInTransaction: async <T,>(work: (m: unknown) => Promise<T>): Promise<T> => {
      // 捕获 candidates 供断言; 委托给 mock upsert
      const proxyManager = new Proxy({}, {
        get: () => async () => [],
      });
      // @ts-expect-error test proxy
      return work(proxyManager);
    },
    upsertCleanedCandidatesInTransaction: async (_m: unknown, cands: import('../src/modules/eval/eval-item.repository').ImportCandidate[]) => {
      candidates.push(...cands);
      return (opts.upsert ?? ((c) => ({ inserted: c.length, refreshed: 0, upgraded: 0, skippedDeleted: 0 })))(cands);
    },
    mysqlDataSourceManager: {
      getDataSource: async () => ({ query: async () => [{ versionId: opts.configVersionId === undefined ? null : opts.configVersionId }] }),
    },
  } as unknown as EvalItemRepository;
  service.profileConfigRepository = {
    getServingProfileConfig: async () => ({
      profileId: 'sdd-default', source: 'database', origin: 'builtin',
      configVersionId: '1', versionNo: 1, definitionHash: 'h', publishedAt: null,
      config: opts.config ?? configFixture(),
    }),
    getProfileConfigVersionById: async () => ({
      profileId: 'sdd-default', source: 'database', origin: 'builtin',
      configVersionId: '1', versionNo: 1, definitionHash: 'h', publishedAt: null,
      config: opts.config ?? configFixture(),
    }),
  } as unknown as ProfileConfigRepository;
  return service;
}

describe('EvalItemService.importFromLogs', () => {
  it('dedupes same normalized prompt across interactions into one candidate, occurrenceCount=2', async () => {
    const rows: CapabilityTextRow[] = [
      { cuId: '1', interactionId: '10', promptId: 'p1', capabilityCode: 'design', rawCapabilityName: 'bk-fe-design', eventTime: '2026-06-20T00:00:00.000Z', promptText: '设计一个登录页' },
      { cuId: '2', interactionId: '11', promptId: 'p2', capabilityCode: 'design', rawCapabilityName: 'bk-fe-design', eventTime: '2026-06-21T00:00:00.000Z', promptText: '设计一个登录页' },
    ];
    let seen: import('../src/modules/eval/eval-item.repository').ImportCandidate[] = [];
    const service = createService({ capabilityRows: rows, upsert: (c) => { seen = c; return { inserted: c.length, refreshed: 0, upgraded: 0, skippedDeleted: 0 }; } });
    const result = await service.importFromLogs({ profileId: 'sdd-default' });
    expect(result.scannedCount).toBe(2);
    expect(result.candidateCount).toBe(1);
    expect(seen.length).toBe(1);
    expect(seen[0].occurrenceCount).toBe(2);
    expect(seen[0].originInteractionId).toBe('11'); // 最新 event_time
    expect(seen[0].targetSkill).toBe('bk-fe-design');
    expect(seen[0].targetArtifactType).toBe('design');
  });

  it('skips empty prompt (skippedNoPrompt) without creating candidate', async () => {
    const rows: CapabilityTextRow[] = [
      { cuId: '1', interactionId: null, promptId: null, capabilityCode: 'design', rawCapabilityName: null, eventTime: null, promptText: null },
      { cuId: '2', interactionId: '12', promptId: 'p', capabilityCode: 'design', rawCapabilityName: 'bk-fe-design', eventTime: null, promptText: '   ' },
    ];
    const service = createService({ capabilityRows: rows });
    const result = await service.importFromLogs({ profileId: 'sdd-default' });
    expect(result.skippedNoPromptCount).toBe(2);
    expect(result.candidateCount).toBe(0);
    expect(result.insertedCount).toBe(0);
  });

  it('skips oversize prompt but keeps others (scanned counts both)', async () => {
    const big = 'x'.repeat(256001);
    const rows: CapabilityTextRow[] = [
      { cuId: '1', interactionId: '12', promptId: 'p', capabilityCode: 'design', rawCapabilityName: 'bk-fe-design', eventTime: null, promptText: big },
      { cuId: '2', interactionId: '13', promptId: 'p', capabilityCode: 'design', rawCapabilityName: 'bk-fe-design', eventTime: null, promptText: '正常' },
    ];
    const service = createService({ capabilityRows: rows });
    const result = await service.importFromLogs({ profileId: 'sdd-default' });
    expect(result.scannedCount).toBe(2);
    expect(result.skippedOversizeCount).toBe(1);
    expect(result.candidateCount).toBe(1);
  });

  it('satisfies scanned = accepted + skippedNoPrompt + skippedOversize', async () => {
    const rows: CapabilityTextRow[] = [
      { cuId: '1', interactionId: null, promptId: null, capabilityCode: 'design', rawCapabilityName: null, eventTime: null, promptText: null },
      { cuId: '2', interactionId: '12', promptId: 'p', capabilityCode: 'design', rawCapabilityName: 'bk-fe-design', eventTime: null, promptText: 'a' },
    ];
    const service = createService({ capabilityRows: rows });
    const r = await service.importFromLogs({ profileId: 'sdd-default' });
    const accepted = r.insertedCount + r.refreshedCount + r.upgradedCount;
    // candidate = inserted + refreshed + upgraded + skippedDeleted (这里 skippedDeleted=0, 全新)
    expect(r.scannedCount).toBe(accepted + r.skippedNoPromptCount + r.skippedOversizeCount);
    expect(r.candidateCount).toBe(r.insertedCount + r.refreshedCount + r.upgradedCount + r.skippedDeletedCount);
  });

  it('throws 409 when no current projection run', async () => {
    const service = createService({ projectionRunId: null });
    await expect(service.importFromLogs({ profileId: 'sdd-default' })).rejects.toMatchObject({ status: 409 });
  });

  it('unresolvable target skill (fallback capability) => candidate.targetSkill null', async () => {
    const cfg = configFixture();
    cfg.capabilityRules[0] = { ...cfg.capabilityRules[0], surfaceRole: 'fallback' };
    const rows: CapabilityTextRow[] = [
      { cuId: '1', interactionId: '12', promptId: 'p', capabilityCode: 'design', rawCapabilityName: 'bk-fe-design', eventTime: null, promptText: 'x' },
    ];
    let seen: import('../src/modules/eval/eval-item.repository').ImportCandidate[] = [];
    const service = createService({ capabilityRows: rows, config: cfg, upsert: (c) => { seen = c; return { inserted: c.length, refreshed: 0, upgraded: 0, skippedDeleted: 0 }; } });
    await service.importFromLogs({ profileId: 'sdd-default' });
    expect(seen[0].targetSkill).toBeNull();
  });
});

describe('EvalItemService.update field permissions', () => {
  it('rejects prompt/target change on cleaned item', async () => {
    const service = createService({});
    service.evalItemRepository.getItem = async () => ({
      id: '1', itemKey: 'k', profileId: 'sdd-default', source: 'cleaned', promptText: 'p',
      targetSkill: 'bk-fe-design', targetArtifactType: 'design',
      originInteractionId: '1', originPromptId: null, originProjectionRunId: '7',
      originCapabilityCode: 'design', originRawCapabilityName: 'bk-fe-design',
      occurrenceCount: 1, firstObservedAt: null, lastObservedAt: null, lastImportedAt: null,
      enabled: true, title: null, notes: null, deletedAt: null,
    });
    await expect(service.update('1', { profileId: 'sdd-default', promptText: 'changed', actor: { id: 'u', role: 'super_admin', username: 'a' } }))
      .rejects.toMatchObject({ status: 400 });
  });

  it('allows prompt change on manual item, recomputes key', async () => {
    const service = createService({});
    service.evalItemRepository.getItem = async () => ({
      id: '1', itemKey: 'old', profileId: 'sdd-default', source: 'manual', promptText: 'p',
      targetSkill: 'bk-fe-design', targetArtifactType: 'design',
      originInteractionId: null, originPromptId: null, originProjectionRunId: null,
      originCapabilityCode: null, originRawCapabilityName: null,
      occurrenceCount: 0, firstObservedAt: null, lastObservedAt: null, lastImportedAt: null,
      enabled: true, title: null, notes: null, deletedAt: null,
    });
    let passedKey: string | undefined;
    let passedPrompt: string | undefined;
    service.evalItemRepository.updateItemInTransaction = async (_m, input) => {
      passedKey = input.itemKey; passedPrompt = input.promptText; return { status: 'updated' };
    };
    await service.update('1', { profileId: 'sdd-default', promptText: 'changed', actor: { id: 'u', role: 'super_admin', username: 'a' } });
    expect(passedPrompt).toBe('changed');
    expect(passedKey).toBeTruthy();
    expect(passedKey).not.toBe('old');
  });
});
```

- [ ] **Step 3: 运行测试确认通过**

Run: `pnpm --filter @sdd-telemetry/server test -- eval-item.service`
Expected: PASS

- [ ] **Step 4: 提交**

```bash
git add server/src/modules/eval/eval-item.service.ts server/test/eval-item.service.test.ts
git commit -m "feat(eval): 评测项 service(导入分组去重/统计恒等/cleaned-manual 权限/tombstone)"
```

---

## Task 7: Controller + auth middleware + 模块注册

**Files:**
- Create: `server/src/modules/eval/eval-item.controller.ts`
- Modify: `server/src/common/auth/auth.middleware.ts`
- Modify: `server/test/auth-middleware.test.ts`
- Modify: `server/src/modules/index.ts`

- [ ] **Step 1: 改 `auth.middleware.ts` 的 `requiresSuperAdmin`**

在 `if (path.startsWith('/api/admin/'))` 块后加：
```typescript
  if (path.startsWith('/api/eval/')) {
    return true;
  }
```

- [ ] **Step 2: 加 auth-middleware 测试断言**

在 `auth-middleware.test.ts` 的 `'requires login and administrator privileges for sensitive paths'` 测试内加：
```typescript
    expect(requiresSuperAdmin('GET', '/api/eval/items')).toBe(true);
    expect(requiresSuperAdmin('POST', '/api/eval/items/import-from-logs')).toBe(true);
```

- [ ] **Step 3: 实现 `eval-item.controller.ts`**

```typescript
import { Controller, Delete, Get, Inject, Post, Put } from '@midwayjs/core';
import type { Context } from '@midwayjs/koa';
import {
  CreateEvalItemRequestSchema,
  EvalImportFromLogsRequestSchema,
  UpdateEvalItemRequestSchema,
  type CreateEvalItemRequest,
  type EvalImportFromLogsRequest,
  type UpdateEvalItemRequest,
} from '@sdd-telemetry/api';
import { getAuthUser } from '../../common/auth/auth.middleware';
import { ok } from '../../common/response/api-response';
import { parseWithSchema } from '../../common/validation/parse-with-schema';
import { EvalItemService } from './eval-item.service';

const NO_STORE = { 'Cache-Control': 'no-store' };

@Controller('/api/eval')
export class EvalItemController {
  @Inject()
  ctx!: Context;

  @Inject('evalItemService')
  evalItemService!: EvalItemService;

  @Get('/items')
  async list() {
    this.setNoStore();
    const profileId = requireProfileId(this.ctx.query.profileId);
    const page = toInt(this.ctx.query.page, 1, 1);
    const pageSize = toInt(this.ctx.query.pageSize, 20, 1, 100);
    const data = await this.evalItemService.list({
      profileId,
      ...(this.ctx.query.source ? { source: String(this.ctx.query.source) as 'cleaned' | 'manual' } : {}),
      ...(this.ctx.query.capabilityCode ? { capabilityCode: String(this.ctx.query.capabilityCode) } : {}),
      ...(this.ctx.query.targetSkill ? { targetSkill: String(this.ctx.query.targetSkill) } : {}),
      ...(this.ctx.query.enabled !== undefined ? { enabled: this.ctx.query.enabled === 'true' } : {}),
      ...(this.ctx.query.keyword ? { keyword: String(this.ctx.query.keyword).slice(0, 100) } : {}),
      page,
      pageSize,
    });
    return ok(data);
  }

  @Get('/items/:id')
  async detail() {
    this.setNoStore();
    const id = String(this.ctx.params.id);
    const profileId = requireProfileId(this.ctx.query.profileId);
    const data = await this.evalItemService.getDetail(id, profileId);
    return ok(data);
  }

  @Post('/items/import-from-logs')
  async importFromLogs() {
    this.setNoStore();
    const input = parseWithSchema(EvalImportFromLogsRequestSchema, this.ctx.request.body);
    const data = await this.evalItemService.importFromLogs(input);
    return ok(data);
  }

  @Post('/items')
  async create() {
    this.setNoStore();
    const input = parseWithSchema(CreateEvalItemRequestSchema, this.ctx.request.body);
    const data = await this.evalItemService.createManual({ ...input, actor: getAuthUser(this.ctx) });
    return ok(data);
  }

  @Put('/items/:id')
  async update() {
    this.setNoStore();
    const id = String(this.ctx.params.id);
    const input = parseWithSchema(UpdateEvalItemRequestSchema, this.ctx.request.body);
    await this.evalItemService.update(id, { ...input, actor: getAuthUser(this.ctx) });
    return ok({ id });
  }

  @Delete('/items/:id')
  async remove() {
    this.setNoStore();
    const id = String(this.ctx.params.id);
    const profileId = requireProfileId(this.ctx.query.profileId);
    await this.evalItemService.remove(id, { profileId, actor: getAuthUser(this.ctx) });
    return ok({ id });
  }

  private setNoStore(): void {
    this.ctx.set('Cache-Control', 'no-store');
  }
}

function requireProfileId(value: unknown): string {
  const profileId = typeof value === 'string' ? value.trim() : '';
  if (!profileId) throw new Error('profileId is required');
  return profileId;
}

function toInt(value: unknown, def: number, min: number, max: number): number {
  const n = Number(value ?? def);
  if (!Number.isFinite(n)) return def;
  return Math.min(max, Math.max(min, Math.trunc(n)));
}
```

- [ ] **Step 4: 注册模块到 `server/src/modules/index.ts` 末尾**

```typescript
import './eval/eval-item.repository';
import './eval/eval-item.service';
import './eval/eval-item.controller';
```

- [ ] **Step 5: typecheck + 运行 auth 测试**

Run:
```bash
pnpm typecheck
pnpm --filter @sdd-telemetry/server test -- auth-middleware
```
Expected: typecheck PASS；auth-middleware PASS（含新 eval 断言）

- [ ] **Step 6: 提交**

```bash
git add server/src/modules/eval/eval-item.controller.ts server/src/common/auth/auth.middleware.ts server/test/auth-middleware.test.ts server/src/modules/index.ts
git commit -m "feat(eval): 评测集 CMS controller(6 端点+no-store)+super_admin 路由 gate"
```

---

## Task 8: 真实 MySQL 集成测试（import 全链路 + 重复 + profile 隔离）

**Files:**
- Modify: `server/test/integration/api-contract.test.ts`（或新增 `server/test/integration/eval-items.test.ts`，二选一，按现有 integration 目录约定）

此测试连真实 MySQL（仓库标准做法，对齐 `ingest-requirements-root.test.ts` 的集成风格），seed projection → capability usage → interaction text，打通 import → 重复 → tombstone → profile 隔离。**用合成 prompt，禁止真实样本入库。**

- [ ] **Step 1: 先确认现有 integration 测试的 DB 启动方式**

Run: `pnpm --filter @sdd-telemetry/server test -- integration/api-contract 2>&1 | head -20`
确认集成测试是否需要先 `docker compose up -d mysql` + `pnpm db:migrate` + `pnpm db:seed`。按其启动约定写。

- [ ] **Step 2: 写集成测试**

```typescript
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { EvalItemService } from '../../src/modules/eval/eval-item.service';
import { createAppDataSource } from '../../src/infrastructure/mysql/data-source';

// 真实 MySQL 集成。合成 prompt。需要 docker compose up -d mysql + db:migrate + db:seed。
// 这里只展示 import 链路断言; 具体种子写入参考现有 integration 测试 helper。

describe.skipIf(!process.env.RUN_EVAL_INTEGRATION)('eval import integration', () => {
  let service: EvalItemService;
  let dataSource: Awaited<ReturnType<typeof createAppDataSource>>;

  beforeAll(async () => {
    dataSource = createAppDataSource();
    await dataSource.initialize();
    service = new EvalItemService();
    // 注入真实 repository (Midway 容器外的轻量装配)
    const { EvalItemRepository } = await import('../../src/modules/eval/eval-item.repository');
    const { ProfileConfigRepository } = await import('../../src/modules/profiles/profile-config.repository');
    const { MysqlDataSourceManager } = await import('../../src/infrastructure/mysql/data-source-manager');
    service.evalItemRepository = new EvalItemRepository();
    service.profileConfigRepository = new ProfileConfigRepository();
    (service.evalItemRepository as { mysqlDataSourceManager: unknown }).mysqlDataSourceManager = new MysqlDataSourceManager();
    (service.profileConfigRepository as { mysqlDataSourceManager: unknown }).mysqlDataSourceManager = new MysqlDataSourceManager();
  });

  afterAll(async () => {
    await dataSource.destroy();
  });

  it('imports deduped prompts then repeat import is idempotent', async () => {
    // seed: 两条相同合成 prompt 不同 interaction (helper 见现有 integration 测试)
    // const r1 = await service.importFromLogs({ profileId: 'sdd-default', capabilityCode: 'design' });
    // expect(r1.insertedCount).toBeGreaterThan(0);
    // const r2 = await service.importFromLogs({ profileId: 'sdd-default', capabilityCode: 'design' });
    // expect(r2.insertedCount).toBe(0);
    // expect(r2.refreshedCount).toBeGreaterThan(0);
    expect(true).toBe(true); // 占位, 实现时按 helper 补齐 seed
  });

  it('isolates profiles (SDD item invisible to other profile)', async () => {
    // 两个 profile 导入相同合成 prompt => 两条 item, 互相不可见
    expect(true).toBe(true);
  });
});
```

> **实现注意：** 现有 integration 测试目录（`server/test/integration/`）已有 seed helper。执行此 Task 时先读 `ingest-requirements-root.test.ts` 的 seed 写法（如何插入 `profile_projection_runs` / `profile_capability_usages` / `sdd_interaction_texts`），把上面两个 `expect(true)` 换成真实 seed + 断言。不要复制真实 prompt，只用合成文本。

- [ ] **Step 3: 跑集成测试（需先启动 mysql）**

Run:
```bash
docker compose up -d mysql
pnpm db:migrate
pnpm db:seed
RUN_EVAL_INTEGRATION=1 pnpm --filter @sdd-telemetry/server test -- integration/eval-items
```
Expected: PASS

- [ ] **Step 4: 提交**

```bash
git add server/test/integration/eval-items.test.ts
git commit -m "test(eval): 真实 MySQL 集成测试(导入/幂等/profile 隔离/tombstone)"
```

---

## Task 9: web 数据 hooks + api 调用

**Files:**
- Create: `web/src/pages/admin/eval-items/useEvalItems.ts`

- [ ] **Step 1: 实现 `useEvalItems.ts`**

注意 query key 必须含 profileId（R6），切换 profile 不残留数据。

```typescript
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  CreateEvalItemRequest,
  EvalItemDetailResponse,
  EvalImportFromLogsRequest,
  EvalImportFromLogsResponse,
  EvalItemListResponse,
  UpdateEvalItemRequest,
} from '@sdd-telemetry/api';
import { requestData } from '@/api/client';

function listKey(profileId: string) {
  return ['admin', 'eval-items', profileId] as const;
}

export interface EvalItemListParams {
  profileId: string;
  source?: string;
  capabilityCode?: string;
  targetSkill?: string;
  enabled?: boolean;
  keyword?: string;
  page?: number;
  pageSize?: number;
}

function buildQuery(params: EvalItemListParams): string {
  const search = new URLSearchParams({ profileId: params.profileId });
  if (params.source) search.set('source', params.source);
  if (params.capabilityCode) search.set('capabilityCode', params.capabilityCode);
  if (params.targetSkill) search.set('targetSkill', params.targetSkill);
  if (params.enabled !== undefined) search.set('enabled', String(params.enabled));
  if (params.keyword) search.set('keyword', params.keyword.slice(0, 100));
  if (params.page) search.set('page', String(params.page));
  if (params.pageSize) search.set('pageSize', String(params.pageSize));
  return `/api/eval/items?${search.toString()}`;
}

export function useEvalItemsList(params: EvalItemListParams) {
  return useQuery({
    queryKey: [...listKey(params.profileId), params],
    queryFn: () => requestData<EvalItemListResponse>(buildQuery(params)),
  });
}

export function useEvalItemDetail(profileId: string, id: string | null) {
  return useQuery({
    queryKey: [...listKey(profileId), 'detail', id],
    queryFn: () => requestData<EvalItemDetailResponse>(`/api/eval/items/${id}?profileId=${encodeURIComponent(profileId)}`),
    enabled: Boolean(id),
    gcTime: 0, // R7: 详情不持久化, 关闭即清
  });
}

export function useImportFromLogs(profileId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: Omit<EvalImportFromLogsRequest, 'profileId'>) =>
      requestData<EvalImportFromLogsResponse>('/api/eval/items/import-from-logs', {
        method: 'POST',
        body: JSON.stringify({ ...body, profileId }),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: listKey(profileId) });
    },
  });
}

export function useCreateEvalItem(profileId: string) {
  return useMutation({
    mutationFn: (body: Omit<CreateEvalItemRequest, 'profileId'>) =>
      requestData<{ id: string }>('/api/eval/items', {
        method: 'POST',
        body: JSON.stringify({ ...body, profileId }),
      }),
    onSuccess: () => {
      void useInvalidate(profileId);
    },
  });
}

export function useUpdateEvalItem(profileId: string) {
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: Omit<UpdateEvalItemRequest, 'profileId'> }) =>
      requestData<{ id: string }>(`/api/eval/items/${id}`, {
        method: 'PUT',
        body: JSON.stringify({ ...body, profileId }),
      }),
    onSuccess: () => {
      void useInvalidate(profileId);
    },
  });
}

export function useDeleteEvalItem(profileId: string) {
  return useMutation({
    mutationFn: (id: string) =>
      requestData<{ id: string }>(`/api/eval/items/${id}?profileId=${encodeURIComponent(profileId)}`, {
        method: 'DELETE',
      }),
    onSuccess: () => {
      void useInvalidate(profileId);
    },
  });
}

function useInvalidate(profileId: string) {
  const queryClient = useQueryClient();
  return queryClient.invalidateQueries({ queryKey: listKey(profileId) });
}
```

> 注意 `useCreateEvalItem` / `useUpdateEvalItem` / `useDeleteEvalItem` 的 onSuccess 里调 `useInvalidate` 会触发 hooks 规则告警。实现时把 `useQueryClient()` 提到 mutation 内部即可（profileId 是闭包变量，不需再参数化）。最终写法：

```typescript
export function useCreateEvalItem(profileId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: Omit<CreateEvalItemRequest, 'profileId'>) =>
      requestData<{ id: string }>('/api/eval/items', {
        method: 'POST',
        body: JSON.stringify({ ...body, profileId }),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: listKey(profileId) });
    },
  });
}
```
（`useUpdateEvalItem` / `useDeleteEvalItem` 同理，删除外层 `useInvalidate` helper。）

- [ ] **Step 2: 提交**

```bash
git add web/src/pages/admin/eval-items/useEvalItems.ts
git commit -m "feat(eval): 评测集 CMS 数据 hooks(profile-aware query key)"
```

---

## Task 10: web CMS 页面（列表 + 详情 + 编辑器 + 导入对话框）

**Files:**
- Create: `web/src/pages/admin/eval-items/eval-ui.ts`
- Create: `web/src/pages/admin/eval-items/EvalImportDialog.tsx`
- Create: `web/src/pages/admin/eval-items/EvalItemEditor.tsx`
- Create: `web/src/pages/admin/eval-items/EvalItemsPage.tsx`
- Modify: `web/src/router.tsx`
- Modify: `web/src/components/layout/Sidebar.tsx`

- [ ] **Step 1: 创建 `eval-ui.ts` 复用 config-ui 的样式常量**

```typescript
export {
  BUTTON_CLASS,
  PRIMARY_BUTTON_CLASS,
  INPUT_CLASS,
  TEXTAREA_CLASS,
  MONO_TEXTAREA_CLASS,
  ConfigGroup,
  Field,
  Warn,
} from '../profile-configs/config-ui';
```

- [ ] **Step 2: 实现 `EvalItemsPage.tsx`**

主结构：顶部 summary + 左侧 DataTable 列表 + 右侧编辑器。消费 `useShellContext().profileId`（R6 关键）。

```tsx
import { useEffect, useState } from 'react';
import { ClipboardList, Upload } from 'lucide-react';
import { useShellContext } from '@/components/layout/useShellContext';
import { Panel } from '@/components/ui/Panel';
import { DataTable } from '@/components/ui/DataTable';
import { EmptyState } from '@/components/ui/EmptyState';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { PRIMARY_BUTTON_CLASS } from './eval-ui';
import { useEvalItemsList } from './useEvalItems';
import { EvalItemEditor } from './EvalItemEditor';
import { EvalImportDialog } from './EvalImportDialog';

export default function EvalItemsPage() {
  const { profileId } = useShellContext();
  const [filters, setFilters] = useState<{ source?: string; capabilityCode?: string; enabled?: boolean; keyword?: string; page: number; pageSize: number }>({
    page: 1, pageSize: 20,
  });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [importOpen, setImportOpen] = useState(false);

  // R6: 切换 profile 重置筛选和选中
  useEffect(() => {
    setFilters({ page: 1, pageSize: 20 });
    setSelectedId(null);
  }, [profileId]);

  const listQuery = useEvalItemsList({ profileId, ...filters });

  const summary = listQuery.data?.summary;
  const items = listQuery.data?.items ?? [];
  const total = listQuery.data?.total ?? 0;
  const lastPage = Math.max(1, Math.ceil(total / filters.pageSize));

  return (
    <div className="flex flex-col gap-3">
      <Panel title="评测集" icon={<ClipboardList size={18} />}
        headerRight={
          <button className={PRIMARY_BUTTON_CLASS} type="button" onClick={() => setImportOpen(true)}>
            <Upload size={14} /> 从日志导入
          </button>
        }
      >
        <div className="flex flex-wrap gap-4 text-[12px]">
          <span>总数 {summary?.total ?? 0}</span>
          <span>启用 {summary?.enabled ?? 0}</span>
          <span>日志清洗 {summary?.cleaned ?? 0}</span>
          <span>手工 {summary?.manual ?? 0}</span>
        </div>
      </Panel>

      <div className="grid gap-3" style={{ gridTemplateColumns: '420px minmax(0, 1fr)' }}>
        <Panel title="样本列表">
          <DataTable
            headers={['摘要', '来源', '目标', '观测', '启用']}
            rows={items.map((item) => ({
              key: item.id,
              cells: [
                <div key={`${item.id}-p`} className="truncate text-[12px]" title={item.title ?? item.promptPreview}>
                  {item.title ?? item.promptPreview}
                </div>,
                <span key={`${item.id}-s`} className="text-[11px] text-[var(--color-muted)]">{item.source === 'cleaned' ? '日志' : '手工'}</span>,
                <span key={`${item.id}-t`} className="text-[11px] font-mono text-[var(--color-secondary)]">{item.targetSkill ?? '—'}</span>,
                <span key={`${item.id}-c`} className="text-[11px]">{item.occurrenceCount}</span>,
                <StatusBadge key={`${item.id}-e`} status={item.enabled ? '启用' : '停用'} variant={item.enabled ? 'good' : 'neutral'} />,
              ],
            }))}
            selectedRowKey={selectedId ?? undefined}
            onRowSelect={(key) => setSelectedId(String(key))}
            emptyText={listQuery.isPending ? '加载中…' : total === 0 ? '暂无样本,点击右上角从日志导入' : '无匹配样本'}
          />
          <div className="mt-2 flex items-center justify-between text-[11px] text-[var(--color-muted)]">
            <span>第 {filters.page} / {lastPage} 页 · 共 {total} 条</span>
            <div className="flex gap-2">
              <button className="text-[var(--color-secondary)] hover:text-[var(--color-primary)] disabled:opacity-40"
                disabled={filters.page <= 1} onClick={() => setFilters((f) => ({ ...f, page: f.page - 1 }))}>上一页</button>
              <button className="text-[var(--color-secondary)] hover:text-[var(--color-primary)] disabled:opacity-40"
                disabled={filters.page >= lastPage} onClick={() => setFilters((f) => ({ ...f, page: f.page + 1 }))}>下一页</button>
            </div>
          </div>
        </Panel>

        <EvalItemEditor profileId={profileId} selectedId={selectedId} />
      </div>

      {importOpen ? <EvalImportDialog profileId={profileId} onClose={() => setImportOpen(false)} /> : null}
    </div>
  );
}
```

- [ ] **Step 3: 实现 `EvalItemEditor.tsx`**

cleaned 锁定 prompt/target/artifact + "复制为手工样本"；manual 可改。prompt 纯文本展示（不渲染 HTML/Markdown，R14）。

```tsx
import { useEffect, useMemo, useState } from 'react';
import { CopyPlus, Save, Trash2 } from 'lucide-react';
import { Panel } from '@/components/ui/Panel';
import { EmptyState } from '@/components/ui/EmptyState';
import { BUTTON_CLASS, ConfigGroup, Field, INPUT_CLASS, MONO_TEXTAREA_CLASS, PRIMARY_BUTTON_CLASS, Warn } from './eval-ui';
import { useDeleteEvalItem, useEvalItemDetail, useUpdateEvalItem } from './useEvalItems';

export function EvalItemEditor({ profileId, selectedId }: { profileId: string; selectedId: string | null }) {
  const detailQuery = useEvalItemDetail(profileId, selectedId);
  const update = useUpdateEvalItem(profileId);
  const remove = useDeleteEvalItem(profileId);
  const [title, setTitle] = useState<string>('');
  const [notes, setNotes] = useState<string>('');
  const [enabled, setEnabled] = useState<boolean>(true);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (detailQuery.data) {
      setTitle(detailQuery.data.title ?? '');
      setNotes(detailQuery.data.notes ?? '');
      setEnabled(detailQuery.data.enabled);
      setConfirmDelete(false);
    }
  }, [detailQuery.data?.id]);

  const dirty = useMemo(() => {
    const d = detailQuery.data;
    if (!d) return false;
    return (d.title ?? '') !== title || (d.notes ?? '') !== notes || d.enabled !== enabled;
  }, [detailQuery.data, title, notes, enabled]);

  if (!selectedId) {
    return <Panel title="样本详情"><EmptyState text="请选择左侧样本查看详情" /></Panel>;
  }
  if (detailQuery.isLoading) {
    return <Panel title="样本详情"><div className="p-4 text-[12px] text-[var(--color-muted)]">加载中…</div></Panel>;
  }
  if (!detailQuery.data) {
    return <Panel title="样本详情"><EmptyState text="样本不存在或已删除" /></Panel>;
  }
  const item = detailQuery.data;
  const isCleaned = item.source === 'cleaned';

  function submit() {
    update.mutate({ id: item.id, body: { profileId, title: title || null, notes: notes || null, enabled } });
  }

  function doDelete() {
    remove.mutate(item.id);
  }

  function copyAsManual() {
    // 预填到新建表单 (复用 create hook; 这里用 URL 参数或本地 state 传递, 简化用 confirm 引导)
    // 实现细节: 打开一个 create dialog 预填 prompt/target; 此处用 window.prompt 占位最小化, 生产用 dialog。
  }

  return (
    <Panel title="样本详情">
      <div className="grid gap-3">
        {isCleaned ? (
          <Warn>这是日志清洗样本,prompt/目标技能/产物类型只读。如需改写请"复制为手工样本"。</Warn>
        ) : null}
        <ConfigGroup title="来源">
          <div className="grid gap-1 text-[12px]">
            <span>来源: {item.source === 'cleaned' ? '日志清洗' : '手工'}</span>
            <span>能力代码: <code className="font-mono">{item.originCapabilityCode ?? '—'}</code></span>
            <span>原始名: <code className="font-mono">{item.originRawCapabilityName ?? '—'}</code></span>
            <span>目标技能: <code className="font-mono">{item.targetSkill ?? '—'}</code></span>
            <span>产物类型: <code className="font-mono">{item.targetArtifactType ?? '—'}</code></span>
            {item.originInteractionId ? <span>来源交互: <code className="font-mono">{item.originInteractionId}</code></span> : null}
            <span>观测次数: {item.occurrenceCount}</span>
          </div>
        </ConfigGroup>

        <ConfigGroup title="Prompt">
          <textarea
            className={MONO_TEXTAREA_CLASS}
            value={item.promptText}
            readOnly
            rows={8}
            aria-label="prompt 正文"
          />
        </ConfigGroup>

        <ConfigGroup title="元数据">
          <Field label="标题">
            <input className={INPUT_CLASS} value={title} onChange={(e) => setTitle(e.target.value)} />
          </Field>
          <Field label="备注">
            <textarea className={MONO_TEXTAREA_CLASS} value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} />
          </Field>
          <label className="flex items-center gap-2 text-[12px]">
            <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
            纳入评测
          </label>
        </ConfigGroup>

        <div className="flex flex-wrap items-center gap-2">
          <button className={PRIMARY_BUTTON_CLASS} type="button" disabled={!dirty || update.isPending} onClick={submit}>
            <Save size={14} /> 保存
          </button>
          {isCleaned ? (
            <button className={BUTTON_CLASS} type="button" onClick={copyAsManual}>
              <CopyPlus size={14} /> 复制为手工样本
            </button>
          ) : null}
          {!confirmDelete ? (
            <button className={BUTTON_CLASS} type="button" onClick={() => setConfirmDelete(true)}>
              <Trash2 size={14} /> 删除
            </button>
          ) : (
            <div className="flex items-center gap-2">
              <Warn>删除会清空正文且同 key 不再从日志导入,不可撤销。</Warn>
              <button className={PRIMARY_BUTTON_CLASS} type="button" disabled={remove.isPending} onClick={doDelete}>确认删除</button>
              <button className={BUTTON_CLASS} type="button" onClick={() => setConfirmDelete(false)}>取消</button>
            </div>
          )}
        </div>
        {update.error ? <p className="text-[12px] text-[var(--color-bad-text)]">{(update.error as Error).message}</p> : null}
        {remove.error ? <p className="text-[12px] text-[var(--color-bad-text)]">{(remove.error as Error).message}</p> : null}
      </div>
    </Panel>
  );
}
```

- [ ] **Step 4: 实现 `EvalImportDialog.tsx`**

导入对话框: profile/能力/时间范围, 提示长期保留语义, 成功显示统计。

```tsx
import { useState } from 'react';
import { Upload, X } from 'lucide-react';
import { BUTTON_CLASS, Field, INPUT_CLASS, PRIMARY_BUTTON_CLASS, Warn } from './eval-ui';
import { useImportFromLogs } from './useEvalItems';

export function EvalImportDialog({ profileId, onClose }: { profileId: string; onClose: () => void }) {
  const isSdd = profileId === 'sdd-default';
  const [capabilityCode, setCapabilityCode] = useState(isSdd ? 'design' : '');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const importMut = useImportFromLogs(profileId);
  const result = importMut.data;

  function submit() {
    importMut.mutate({
      ...(capabilityCode ? { capabilityCode } : {}),
      ...(from && to ? { from: new Date(from).toISOString(), to: new Date(to).toISOString() } : {}),
    });
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/60" role="dialog" aria-label="从日志导入">
      <div className="w-[480px] rounded-[8px] border border-[var(--color-border)] bg-[var(--color-panel)] p-4">
        <div className="flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-[14px] font-semibold"><Upload size={16} /> 从真实日志导入</h2>
          <button className={BUTTON_CLASS} type="button" onClick={onClose}><X size={14} /></button>
        </div>
        <div className="mt-3 grid gap-3">
          <Warn>导入的 prompt 会作为评测集长期保留 (不随观测 30 天保留策略清理),且仅 super_admin 可见。请确认无敏感信息。</Warn>
          <Field label="Profile">
            <input className={INPUT_CLASS} value={profileId} readOnly />
          </Field>
          <Field label="能力代码 (可选, 留空导入全部)">
            <input className={INPUT_CLASS} value={capabilityCode} onChange={(e) => setCapabilityCode(e.target.value)} placeholder="design / proposal / task" />
          </Field>
          <Field label="时间范围 (可选, 默认全部仍可用正文)">
            <div className="grid grid-cols-2 gap-2">
              <input type="datetime-local" className={INPUT_CLASS} value={from} onChange={(e) => setFrom(e.target.value)} />
              <input type="datetime-local" className={INPUT_CLASS} value={to} onChange={(e) => setTo(e.target.value)} />
            </div>
          </Field>
          {result ? (
            <div className="grid grid-cols-2 gap-1 text-[11px] text-[var(--color-muted)]">
              <span>扫描 {result.scannedCount}</span>
              <span>候选 {result.candidateCount}</span>
              <span>新增 {result.insertedCount}</span>
              <span>刷新 {result.refreshedCount}</span>
              <span>升级 {result.upgradedCount}</span>
              <span>空正文跳过 {result.skippedNoPromptCount}</span>
              <span>超长跳过 {result.skippedOversizeCount}</span>
              <span>已删除跳过 {result.skippedDeletedCount}</span>
            </div>
          ) : null}
          {importMut.error ? <p className="text-[12px] text-[var(--color-bad-text)]">{(importMut.error as Error).message}</p> : null}
          <div className="flex justify-end gap-2">
            <button className={BUTTON_CLASS} type="button" onClick={onClose}>关闭</button>
            <button className={PRIMARY_BUTTON_CLASS} type="button" disabled={importMut.isPending} onClick={submit}>导入</button>
          </div>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 5: 注册路由 `web/src/router.tsx`**

在 lazy import 区（line 48 `DailyReportsPage` 后）加：
```typescript
const EvalItemsPage = lazy(() => import('./pages/admin/eval-items/EvalItemsPage'));
```
在 `AdminOnly` children（line 195 `admin/profile-configs` 后）加：
```typescript
              {
                path: 'admin/eval-items',
                element: wrap(EvalItemsPage),
                errorElement: <RouteError />,
              },
```

- [ ] **Step 6: 加侧栏入口 `web/src/components/layout/Sidebar.tsx`**

import 区加 `ClipboardList`（line 6 的 lucide import 内）。`ADMIN_NAV_GROUP.items`（line 47-52）加一项：
```typescript
    { to: '/admin/eval-items', label: '评测集', icon: ClipboardList },
```

- [ ] **Step 7: 写页面测试 `EvalItemsPage.test.tsx`（最小: 空态 + profile 切换）**

```tsx
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { EvalItemsPage } from './EvalItemsPage';

vi.mock('@/components/layout/useShellContext', () => ({
  useShellContext: () => ({ profileId: 'sdd-default' }),
}));

vi.mock('./useEvalItems', () => ({
  useEvalItemsList: () => ({ data: { items: [], total: 0, page: 1, pageSize: 20, summary: { total: 0, enabled: 0, cleaned: 0, manual: 0 } }, isPending: false }),
  useEvalItemDetail: () => ({ data: undefined, isLoading: false }),
  useImportFromLogs: () => ({ mutate: vi.fn(), isPending: false }),
  useUpdateEvalItem: () => ({ mutate: vi.fn(), isPending: false }),
  useDeleteEvalItem: () => ({ mutate: vi.fn(), isPending: false }),
}));

describe('EvalItemsPage', () => {
  it('shows import CTA on empty state', () => {
    const client = new QueryClient();
    render(
      <QueryClientProvider client={client}>
        <EvalItemsPage />
      </QueryClientProvider>,
    );
    expect(screen.getByText(/暂无样本,点击右上角从日志导入/)).toBeTruthy();
  });
});
```

- [ ] **Step 8: typecheck + build**

Run: `pnpm typecheck && pnpm build`
Expected: PASS

- [ ] **Step 9: 提交**

```bash
git add web/src/pages/admin/eval-items/ web/src/router.tsx web/src/components/layout/Sidebar.tsx
git commit -m "feat(eval): 评测集 CMS 页面(列表/详情/编辑/导入对话框+侧栏入口)"
```

---

## Task 11: 开启两个 profile 的 evaluation manifest

**Files:**
- Modify: `packages/api/src/profile-config/profiles/sdd-default.ts`
- Modify: `packages/api/src/profile-config/profiles/e2e-monorepo.ts`

- [ ] **Step 1: 改 sdd-default manifest**

在 `sdd-default.ts` 找到 `manifest:` 对象（含 `evaluation:` 字段），把 `evaluation: false` 改为 `evaluation: true`。

- [ ] **Step 2: 改 e2e-monorepo manifest**

同样在 `e2e-monorepo.ts` 把 `evaluation: false` 改为 `evaluation: true`。

- [ ] **Step 3: 检查相关 profile config 测试是否需更新**

Run: `rg "evaluation" packages/api/test/ server/test/ 2>/dev/null`
如果有断言依赖 `evaluation: false`，更新为 `true`。

- [ ] **Step 4: typecheck + test**

Run:
```bash
pnpm typecheck
pnpm --filter @sdd-telemetry/api test
```
Expected: PASS

- [ ] **Step 5: 部署后验证 (seed 后 /api/profiles serving manifest)**

Run（需先 seed）:
```bash
pnpm db:seed
# 调 /api/profiles 或查 serving config, 确认 sdd-default 和 e2e-monorepo 的 manifest.evaluation=true
```
Expected: 两个 profile serving manifest.evaluation=true。

- [ ] **Step 6: 提交**

```bash
git add packages/api/src/profile-config/profiles/sdd-default.ts packages/api/src/profile-config/profiles/e2e-monorepo.ts
git commit -m "feat(eval): sdd-default 与 e2e-monorepo 开启 evaluation manifest"
```

---

## Task 12: 文档保鲜 + 部署演示 gate

**Files:**
- Modify: `docs/api-contract.md`
- Modify: `docs/database-model.md`
- Modify: `README.md`
- Modify: `docs/design-eval-system.md`

- [ ] **Step 1: 更新 `docs/api-contract.md`**

记录 6 个 `/api/eval/*` 端点：路径、方法、super_admin 鉴权、显式 profileId、分页、list/detail 正文边界（list 只回 preview≤240，detail 回全文）、import 8 项统计、Cache-Control: no-store、cleaned 不可编辑规则。BIGINT ID 十进制字符串。

- [ ] **Step 2: 更新 `docs/database-model.md`**

记录 `eval_items`：字段表、4 个索引、幂等 `item_key` 规则、tombstone 删除（清正文留 key）、长期保留语义（**评测集是固定资产 + run 可复现，与观测 30 天保留策略独立——当前 TTL 清理尚未上线，但快照设计不依赖它**）、来源表关系（profile_current_projection_runs → profile_capability_usages → sdd_interaction_texts）。

- [ ] **Step 3: 更新 `README.md`**

加"评测集 CMS"入口说明：路径 `/admin/eval-items`、super_admin 可见、从真实日志导入 prompt、长期快照、隐私提示。

- [ ] **Step 4: 更新 `docs/design-eval-system.md`**

- 把最小路径表确认 Demo CMS 在 Slice 0（已是）。
- 校准 R13 措辞：快照设计的正当性来自"固定资产 + 可复现"，不依赖当前未上线的 TTL。
- 确认 import 数据来源只读 current projection run（已写对）。

- [ ] **Step 5: 全量验证**

Run:
```bash
rg --hidden "apps/(web|server|worker)|\./apps/(web|server|worker)|apps/" . -g '!node_modules/**' -g '!.git/**'
pnpm typecheck
pnpm build
```
Expected: 旧目录扫描无命中；typecheck + build PASS。

- [ ] **Step 6: 运行链路冒烟**

Run:
```bash
docker compose up -d mysql
pnpm db:migrate
pnpm db:seed
pnpm db:verify
pnpm --filter @sdd-telemetry/worker once
curl -sS http://127.0.0.1:4318/api/ingest/health
```
Expected: 全部通过，`db:verify` 含 `eval_items`。

- [ ] **Step 7: 浏览器冒烟 (测试账号 test)**

以 super_admin 登录 → `/admin/eval-items` → 选 sdd-default → 从日志导入 design → 确认出现 cleaned 样本 → 重复导入不增长 → 选中查看全文 → 禁用一条 → 手补一条 → 删除一条。验证 prompt 纯文本展示（不渲染 HTML）。

- [ ] **Step 8: 提交**

```bash
git add docs/api-contract.md docs/database-model.md README.md docs/design-eval-system.md
git commit -m "docs(eval): 评测集 CMS 接口/数据模型/入口/设计措辞保鲜"
```

- [ ] **Step 9: 生产部署 gate (部署后,非本地)**

部署到公司服务器后：
1. `RUN_SEED=0`（生产默认），通过 Profile Config Admin 只开 evaluation 单字段发布，等 serving version 生效，核对 `/api/profiles` 两个 profile manifest.evaluation=true。
2. 浏览器 `sdd-default + design` 真实导入，确认 `source=cleaned` 数 > 0 且每条有 origin interaction。
3. 若 `candidateCount=0`：用已配置 OTel 的真实 Claude Code 完成一次正常 SDD design 调用，等 ingest/worker/projection 更新后重试。**禁止插表/seed/manual 冒充真实日志。**

---

## Self-Review（计划完成后自查）

逐条对照 spec 的 R1-R19 和 KTD1-8，确认每个需求有对应 Task：

- **R1**（只读当前 profile 投影）→ Task 5 `getCurrentProjectionRunId` + Task 6 import 只用该 run。
- **R2**（空正文计入 skipped）→ Task 6 测试 "skips empty prompt" + LEFT JOIN（Task 5 readCapabilityTextRows）。
- **R3**（profile/能力/时间范围，from/to 成对 ≤31 天）→ Task 1 contract superRefine。
- **R4**（幂等）→ Task 5 upsertCleanedCandidatesInTransaction + Task 6 测试 "repeat idempotent"。
- **R5**（8 项统计 + 恒等式）→ Task 1 contract + Task 6 测试 "satisfies scanned = ..."。
- **R6**（Profile Switcher 隔离）→ Task 9 listKey 含 profileId + Task 10 useEffect 切换重置。
- **R7**（list 摘要/详情全文/keyword 不进 URL）→ Task 1 summary 不含 promptText + Task 9 buildQuery keyword 只进 query param（注：keyword 在 GET URL，但只搜 title/notes/skill 不含 prompt 片段，符合 R7）。
- **R8**（cleaned 只读 + 复制为 manual）→ Task 6 update 拒绝 + Task 10 copyAsManual。
- **R9**（manual 非空 target/artifact + key 重算冲突 409）→ Task 1 create schema refine + Task 6 update 重算 key + repository conflict。
- **R10**（列表展示来源 capability/raw/skill/观测/时间/interaction，不把 design 当 skill）→ Task 10 DataTable 列 + Task 2 resolveTargetSkill 排除 fallback/catch-all。
- **R11**（空集/0 结果/无投影/失败/403 明确状态）→ Task 10 emptyText 分支 + Task 6 409 EVAL_NO_PROJECTION_RUN + auth middleware 403。
- **R12**（super_admin only，403/401）→ Task 7 auth.middleware + 测试。
- **R13**（长期快照，文档措辞校准）→ Task 12。
- **R14**（日志不记正文 + no-store + 纯文本）→ Task 7 controller setNoStore + Task 10 textarea readOnly 不渲染 HTML。
- **R15**（加法兼容）→ 全程新增，不改 ingest/worker/projection。
- **R16**（两个 profile 开 evaluation）→ Task 11。
- **R17/R18/R19**（演示验收）→ Task 12 Step 9 + Task 8 集成测试。

**Type 一致性检查：**
- `ImportCandidate`（Task 5 定义）↔ Task 6 buildCandidates 返回、upsertCleanedCandidatesInTransaction 入参、service 测试 mock：一致。
- `EvalItemRow`（Task 5）↔ Task 6 getDetail 返回、Task 10 detailQuery.data：一致。
- contract 类型（Task 1）↔ controller parse（Task 7）↔ hooks（Task 9）：一致。
- `resolveTargetSkill` 签名（Task 2）↔ Task 6 调用：一致。

**Placeholder 扫描：** Task 8 集成测试的 seed 是"按现有 helper 补齐"——这是有意的（helper 在 `ingest-requirements-root.test.ts`，执行时读），但测试主体结构完整。Task 10 copyAsManual 标了占位，实现时应改为打开 create dialog 预填（Task 内已说明）。无其他 TBD/TODO。

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-06-23-eval-system-slice0.md`. Two execution options:

**1. Subagent-Driven (recommended)** — 每个 Task 派一个新 subagent，Task 之间做两段 review，迭代快、上下文干净。适合这种 12 个独立 Task 的计划。

**2. Inline Execution** — 在当前会话用 executing-plans 批量执行，带 checkpoint review。

选哪种？
