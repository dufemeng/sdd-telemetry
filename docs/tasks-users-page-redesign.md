# 实施计划：用户维度 Tab 重设计

参考设计 prompt：`docs/stitch-prompt-users-page.md`

---

## 核心设计思路

旧设计是"电话本"——把字段堆出来。新设计围绕**每个用户的 SDD 采用成熟度**：
1. **配置是否正确**（requirementsRootPath 有没有设 → 决定工作项功能能不能用）
2. **链路覆盖多完整**（用了哪些语义阶段 → 是全链路用户还是只用了一个 skill）
3. **工作项产出多少**（实际关联了多少需求目录）
4. **是新人还是老用户**（firstSeenAt → lastSeenAt 生命周期）

---

## 现状速查

| 文件 | 状态 |
|---|---|
| `web/src/pages/sdd/users/UsersPage.tsx` | 需重写 |
| `web/src/pages/sdd/users/useSddUsers.ts` | 需更新（接新字段） |
| `server/src/modules/sdd/sdd-query.repository.ts` | 需改 `listUsers()` SQL |
| `packages/api/src/contracts/sdd.contract.ts` | 需扩展 `SddUserItemSchema` |
| `web/src/lib/format.ts` | 需追加3个工具函数 |
| `web/src/components/ui/StatCard.tsx` | 直接用 |
| `web/src/components/ui/DataTable.tsx` | 直接用 |
| `web/src/components/ui/Pagination.tsx` | 直接用 |
| `web/src/lib/useClientPagination.ts` | 直接用 |
| `web/src/lib/useDebouncedValue.ts` | 直接用 |

---

## Task 1：后端扩展 `listUsers()` + contract

### 1a. 修改 `server/src/modules/sdd/sdd-query.repository.ts`

`listUsers()` 新 SQL：

```sql
SELECT
  u.id, u.user_key, u.install_id, u.user_name,
  u.machine_id, u.machine_name,
  u.requirements_root_path, u.wiki_root_path,
  u.first_seen_at,
  u.last_seen_at,
  COUNT(DISTINCT su.id)               AS skill_usage_count,
  COUNT(DISTINCT i.id)                AS interaction_count,
  COUNT(DISTINCT su.work_item_id)     AS work_item_count,
  JSON_ARRAYAGG(DISTINCT ss.semantic_code) AS semantic_stages_json
FROM sdd_users u
LEFT JOIN sdd_skill_usages su ON su.user_id = u.id
LEFT JOIN sdd_interactions i  ON i.user_id  = u.id
LEFT JOIN sdd_skill_semantics ss ON ss.id   = su.semantic_id
GROUP BY u.id, u.user_key, u.install_id, u.user_name,
         u.machine_id, u.machine_name,
         u.requirements_root_path, u.wiki_root_path,
         u.first_seen_at, u.last_seen_at
ORDER BY u.last_seen_at DESC, u.id DESC
LIMIT 200
```

注意：`JSON_ARRAYAGG(DISTINCT ss.semantic_code)` 在 MySQL 8 支持，但包含 NULL 时需过滤：
后端在映射 `UserRow → SddUserItem` 时，把 `semantic_stages_json` parse 后过滤掉 null。

### 1b. 更新 `UserRow` 类型（repository 内部 interface）

```ts
interface UserRow {
  // ...原有字段...
  first_seen_at: string | null;
  work_item_count: string | number;
  semantic_stages_json: string | null;  // JSON array string
}
```

### 1c. 扩展 `packages/api/src/contracts/sdd.contract.ts`

```ts
export const SddUserItemSchema = z.object({
  id: IdSchema,
  userKey: z.string(),
  installId: z.string().nullable(),
  userName: z.string().nullable(),
  machineId: z.string().nullable(),
  machineName: z.string().nullable(),
  requirementsRootPath: z.string().nullable(),
  wikiRootPath: z.string().nullable(),
  firstSeenAt: ISODateTimeSchema.nullable(),   // 新增
  lastSeenAt: ISODateTimeSchema.nullable(),
  skillUsageCount: z.number(),
  interactionCount: z.number(),
  workItemCount: z.number(),                   // 新增
  semanticStages: z.array(z.string()),         // 新增（已过滤 null）
});
```

### 1d. 更新 controller 的 mapping（如有手动 mapping）

`sdd-query.service.ts` 或 repository 返回的 row 需要把 `semantic_stages_json` parse 成 `string[]`，过滤 null：

```ts
semanticStages: JSON.parse(row.semantic_stages_json ?? '[]').filter(Boolean)
```

**验收：**
- `pnpm typecheck` 通过
- `curl http://localhost:4318/api/sdd/users` 返回包含 `firstSeenAt`、`workItemCount`、`semanticStages` 的 JSON

---

## Task 2：`format.ts` 追加工具函数

**文件：** `web/src/lib/format.ts`

追加到文件末尾：

```ts
export function formatRelativeTime(value: string | null | undefined): string {
  if (!value) return '—';
  const ms = Date.now() - new Date(value).getTime();
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 1) return '刚刚';
  if (minutes < 60) return `${minutes}分钟前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}小时前`;
  const days = Math.floor(hours / 24);
  return `${days}天前`;
}

export function lastTwoPathSegments(path: string | null | undefined): string {
  if (!path) return '—';
  const parts = path.replace(/\\/g, '/').split('/').filter(Boolean);
  if (parts.length === 0) return path;
  return parts.slice(-2).join(' / ');
}

export function truncateId(
  id: string | null | undefined,
  prefix = 5,
  suffix = 4,
): string {
  if (!id) return '—';
  if (id.length <= prefix + suffix + 3) return id;
  return `${id.slice(0, prefix)}…${id.slice(-suffix)}`;
}
```

---

## Task 3：重写 `UsersPage.tsx`

**文件：** `web/src/pages/sdd/users/UsersPage.tsx`

### 3.1 KPI 区（4 张 StatCard）

全部从 `useSddUsers()` 数组前端计算，无额外请求：

| 卡片 | 计算 | icon |
|---|---|---|
| 用户总数 | `data.length` | `UserRound` |
| 近7天活跃 | `data.filter(u => lastSeenAt 在7天内).length` | `Activity` |
| 完整配置 | 分数格式：`configured / data.length`（configured = `requirementsRootPath != null`） | `ShieldCheck` |
| 工作项参与者 | `data.filter(u => u.workItemCount > 0).length`，value 用 `color: var(--color-primary)` (#faff69) | `GitBranch` |

"完整配置"卡的 value 渲染：
```tsx
<strong style={{ fontFamily: 'var(--font-mono)' }}>
  <span style={{ color: '#f5f5f5', fontSize: 24 }}>{configured}</span>
  <span style={{ color: 'var(--color-muted)', fontSize: 16 }}> / {data.length}</span>
</strong>
```

### 3.2 搜索 + 表格区（Panel）

Panel title："用户一览" + `UserRound` icon

右上角 search input（28px 高，260px 宽，`Search` icon 左嵌），`useDebouncedValue(search, 300)` 过滤，搜索词变化时 `reset()` 分页。

过滤逻辑（忽略大小写）：
```ts
const q = debouncedSearch.toLowerCase();
const filtered = data.filter(u =>
  (u.userName ?? '').toLowerCase().includes(q) ||
  (u.installId ?? '').toLowerCase().includes(q) ||
  (u.machineName ?? '').toLowerCase().includes(q)
);
```

### 3.3 表格列

用 `DataTable` 的 `ReactNode[]` cells：

| # | header | 内容 |
|---|---|---|
| 1 | `用户` | 双行：上行 userName（`#f5f5f5`，null → italic muted "未知用户"）；下行 `truncateId(installId)` mono `#93927c` |
| 2 | `配置状态` | pill badge（高20px，rounded-full，11px 字）：完整配置=good / 缺requirements=warn / 未配置=bad |
| 3 | `SDD 链路` | `semanticStages` 数组渲染为小 chip pill（18px高，4px圆角，`rgba(255,255,255,0.06)` 背景，10px `#c9c8af`），无数据显示 "—" |
| 4 | `工作项` | `workItemCount > 0`：双行（count 13px mono `#f5f5f5` + "个需求" 10px muted）；0：显示 "—" muted |
| 5 | `使用量` | 双行：`interactionCount + " 次交互"` / `skillUsageCount + " 次Skill"`，count 用 mono |
| 6 | `接入时长` | 双行：`formatRelativeTime(firstSeenAt) + "接入"` / `formatTime(firstSeenAt)` mono `#93927c` |
| 7 | `最近活跃` | 双行：`formatRelativeTime(lastSeenAt)` / `formatTime(lastSeenAt)` mono `#93927c` |

配置状态判断函数：
```ts
function configStatus(u: SddUserItem): 'complete' | 'missing-req' | 'unconfigured' {
  if (!u.installId && !u.requirementsRootPath) return 'unconfigured';
  if (!u.requirementsRootPath) return 'missing-req';
  return 'complete';
}
```

### 3.4 表格 footer

```tsx
<div className="flex items-center justify-between pt-2">
  <span className="text-[11px] text-[var(--color-muted)]">
    共 {filtered.length} 位用户
    {missingReqPath.length > 0 && ` · ${missingReqPath.length} 人未配置 requirements`}
  </span>
  {/* Pagination 仅在 >1 页时渲染 */}
  {(hasNext || hasPrev) && <Pagination ... />}
</div>
```

### 3.5 诊断面板（Section 3）

在表格 Panel 下方，新建一个 Panel，title "配置诊断"，icon `AlertTriangle`（颜色 `#f59e0b`，不用 primary yellow）。

Panel 背景：`background: 'rgba(245,158,11,0.04)'`（区分普通 Panel）

内部：3 条诊断项，`grid gap-3`，每条 `flex items-start gap-3`：

```
[warn pill "N 人"] [描述文字 12px secondary] [code hint 11px mono muted]
```

| 诊断项 | pill | 描述 | hint |
|---|---|---|---|
| 缺 requirementsRootPath | warn badge `missingReqPath.length + " 人"` | "未配置本地需求目录路径，工作项识别对这些用户完全失效" | `sdd-requirements-root-path=<path>` |
| 无 installId | warn badge `missingInstallId.length + " 人"` | "未配置 installId，跨机器活动无法合并为同一用户" | `sdd-install-id=<stable-id>` |
| 近14天未活跃 | neutral pill `inactive14d.length + " 人"` | "近14天未上报数据，可能停止使用或 OTel 链路中断" | 无 hint（纯观察信息） |

诊断数据（前端计算）：
```ts
const missingReqPath  = data.filter(u => !u.requirementsRootPath);
const missingInstallId = data.filter(u => !u.installId);
const inactive14d     = data.filter(u => {
  if (!u.lastSeenAt) return true;
  return Date.now() - new Date(u.lastSeenAt).getTime() > 14 * 86400_000;
});
```

诊断面板仅在有问题时渲染（若3项均为0，整个 Section 3 不渲染）。

---

## Task 4：验收 checklist

运行 `pnpm typecheck` 无报错，启动 dev server 手动验证：

- [ ] **后端**：`/api/sdd/users` 返回 `firstSeenAt`、`workItemCount`、`semanticStages`
- [ ] **KPI**：4 张卡片数据正确；"完整配置"显示 "N / M" 分数格式
- [ ] **表格列2**：配置状态 badge 判断逻辑正确（warn 当 requirementsRootPath 为 null）
- [ ] **表格列3**：SDD 链路 chip 来自 semanticStages 数组，空时显示 "—"
- [ ] **表格列4**：工作项来自 workItemCount，0 显示 "—"
- [ ] **表格列6**：接入时长使用 firstSeenAt，非 lastSeenAt
- [ ] **搜索**：过滤 userName / installId / machineName，变化时分页 reset
- [ ] **诊断面板**：3 条数据前端计算，均为0时面板不渲染
- [ ] `pnpm typecheck` 无报错

---

## 不在本次范围内

- 行点击展开详情 drawer
- costUsd 成本维度（数据库有，留后续扩展）
- osName / clientName / clientVersion 列（数据库有，留后续扩展）
- 时间范围筛选（users 接口无该参数）
