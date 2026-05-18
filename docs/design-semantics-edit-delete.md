# 系统设计：语义配置编辑与删除

## 目标和约束

**目标**：在「语义配置」页的语义列表中，支持点击行进入编辑、提交修改，以及删除语义。

**约束**：
- `sdd_skill_usages` 以 `semantic_code`（varchar 冗余存储）关联语义，不是外键，删除语义不会触发 FK 报错，但历史 usage 记录里的 `semantic_code` 会变成悬空值（只影响查询展示，不影响数据完整性）
- 当前 `createSemantic` 以 `semanticCode` 为幂等 key（`ON DUPLICATE KEY UPDATE`），编辑需要区分"用 id 找到记录后更新"的语义
- alias 关系存 `sdd_skill_aliases`（`unique(skill_name)`），全量替换最简单

## 总体架构

```
SemanticsPage
  ├── 左侧：DataTable（行可点击，点中高亮）
  └── 右侧：SemanticForm（create 或 edit 模式，由 selectedId 驱动）
            ├── create 模式：新增语义（现有功能）
            └── edit 模式：编辑 + 删除（新增功能）
```

右侧面板不新增独立组件，直接将 `CreateSemanticForm` 改造为受控的 `SemanticForm`，接受 `initialValues` prop 进入编辑模式。

## 模块设计

### 后端（3 个文件）

| 文件 | 改动 |
|------|------|
| `packages/api/src/contracts/sdd.contract.ts` | 新增 `UpdateSddSemanticRequestSchema`、export type |
| `server/src/modules/sdd/sdd-query.service.ts` | 新增 `updateSemantic(id, input)`、`deleteSemantic(id)` |
| `server/src/modules/sdd/sdd.controller.ts` | 新增 `PUT /semantics/:id`、`DELETE /semantics/:id` |

### 前端（3 个文件）

| 文件 | 改动 |
|------|------|
| `web/src/pages/sdd/semantics/useSddSemantics.ts` | 新增 `useUpdateSddSemantic()`、`useDeleteSddSemantic()` |
| `web/src/pages/sdd/semantics/CreateSemanticForm.tsx` | 重命名为 `SemanticForm.tsx`，支持 create/edit 双模式 |
| `web/src/pages/sdd/semantics/SemanticsPage.tsx` | 添加行点击状态，传 `selected` 给 `SemanticForm` |

## API 设计

### PUT `/api/sdd/semantics/:id`

**Request body**（`semanticCode` 不可修改，避免与 `FunnelPage`、`SummaryPage`、`OverviewPage` 的历史数据断链）：
```typescript
export const UpdateSddSemanticRequestSchema = CreateSddSemanticRequestSchema.omit({ semanticCode: true });
// { displayName, description?, aliases: string[] }
```

**Response**：`SddSemantic`（同 create）

**服务实现**：
```
BEGIN TRANSACTION
  UPDATE sdd_skill_semantics SET ... WHERE id = :id
  DELETE FROM sdd_skill_aliases WHERE semantic_id = :id
  INSERT INTO sdd_skill_aliases (...) VALUES (...) [逐条]
COMMIT
```

全量替换 alias 列表。`skill_name` 有 unique 约束，若新 alias 已被其他 semantic 占用则事务回滚，返回错误。

### DELETE `/api/sdd/semantics/:id`

**Response**：`{ deleted: true }`

**服务实现**：
```
BEGIN TRANSACTION
  DELETE FROM sdd_skill_aliases WHERE semantic_id = :id
  DELETE FROM sdd_skill_semantics WHERE id = :id
COMMIT
```

无 cascade FK，必须手动先删 alias。

## 前端状态设计

```
SemanticsPage
  selectedId: string | null   ← 点击行设置，表单关闭/切换 create 后清空

SemanticForm props:
  mode: 'create' | 'edit'
  initialValues?: { id, semanticCode, displayName, description, aliases }
  onSuccess?: () => void      ← edit 成功后回调（用于清空 selectedId）
```

### 行点击 UX

- 点击未选中行 → 选中，右侧面板切换为 edit 模式（表单预填）
- 再次点击已选中行 → 取消选中，右侧面板恢复 create 模式
- edit 模式提交成功 → 保持选中（刷新数据后表单重新预填最新值）
- delete 成功 → 清空选中，面板回到 create 模式

### 删除确认

不用 Modal。delete 按钮首次点击变为"确认删除？"（inline 二次确认），3 秒不操作自动复位。这样不引入新 UI 组件。

## 错误处理

| 场景 | 前端表现 |
|------|------|
| `semanticCode` 已被其他语义使用（edit 时改 code 冲突） | 表单底部显示 API 错误信息 |
| alias 已被其他语义占用 | 同上 |
| 删除时语义不存在（并发删除） | 表单底部显示错误，刷新列表 |
| 网络错误 | 同上，`mutation.error.message` |

## 影响分析

- **改动范围**：6 个文件，均为局部新增，不修改现有 `createSemantic` 路径
- **影响页面**：仅「语义配置」页
- **不影响**：funnel、usage-summary 等读取语义的页面（只读 `semanticCode` 字符串）
- **破坏风险**：`semanticCode` 改名后历史 `sdd_skill_usages.semantic_code` 不会自动更新，漏斗图中该语义的历史数据将无法聚合到新 code 下——这是预期的权衡，不是 bug

## 测试策略

1. `PUT` 正常更新：修改 `displayName`、`description`，alias 全量替换
2. `PUT` alias 冲突：新 alias 已属于另一语义 → 事务回滚，原数据不变
3. `DELETE`：alias 先删、semantic 后删，`listSemantics` 不再返回该条目
4. 前端：点击行 → 表单预填正确；删除成功 → 面板回到 create 模式

## 设计决策记录

- **`semanticCode` 不允许改名**（已确认）：`FunnelPage`、`SummaryPage`、`OverviewPage` 三处均按 `semanticCode` 字符串聚合历史数据，改名会导致历史记录断链、漏斗数据归零。edit 模式下 `semanticCode` 字段 UI 只读置灰，后端 `UpdateSddSemanticRequestSchema` 用 `.omit({ semanticCode: true })`。
