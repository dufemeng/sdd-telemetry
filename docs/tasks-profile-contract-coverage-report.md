# Profile Contract 覆盖补齐 — 实施报告

完成时间：2026-06-04
分支：`codex/profile-observability-mvp-doc`
基础 commit：`160c9bb` → 阶段提交：`0ce8765` / `139a6fe`；后续审查修复见 §3.1 / §3.2

## 1. 变更摘要

35 个文件变更，+2937 / -461 行。

| 层 | 变更 |
|---|---|
| Contract | `profile.contract.ts` +496 行，新增 30+ schema |
| Worker | bridge operator 顺序重排 + delivery_unit_id 链路补齐 + 11 条索引 + diff gate + 8 个 vitest 用例（Map helper 测试） |
| Server | controller 14 个路由，repository ~1050 行，service ~585 行（含 legacy 回退） |
| Web | 4 个页面换源 + useProfiles.ts +280 行，删除 7 个死代码 hook |

## 2. 各 PR 完成项

### PR-1：Contract、链路和对账基础

| Task | 产物 | 状态 |
|---|---|---|
| 1.1 | Profile Contract schema 扩展（30+ 类型） | 完成 |
| 1.2 | capability → delivery 链路（bridge 顺序重排） | 完成 |
| 1.3 | knowledge/code → delivery 链路 | 完成 |
| 1.4 | 11 条查询索引 migration | 完成 |
| 1.5 | profile:diff linkage gate（4 个新 gate） | 完成 |
| 1.6 | delivery_unit_id 映射测试（8 个 vitest 用例，Map helper 级） | 完成 |

### PR-2：产出分析换源

| Task | 产物 | 状态 |
|---|---|---|
| 2.1 | demands detail + artifact timeline API | 完成 |
| 2.2 | WorkItemsPage / WorkItemDetailPage 换源 | 完成 |

字段映射：`workItemTitle→title`、`workItemSlug→unitSlug`、`usageCount→capabilityUsageCount`

### PR-3：技能分析换源

| Task | 产物 | 状态 |
|---|---|---|
| 3.1 | capabilities analytics / timeseries / usages/summary / usages API | 完成 |
| 3.2 | SkillsPage + TrendChart 换源 | 完成 |

字段映射：`skillUsageCount→capabilityUsageCount`、`topSemantics→topCapabilities`、`semanticCode→capabilityCode`

### PR-4：用户分析换源

| Task | 产物 | 状态 |
|---|---|---|
| 4.1 | users list + user detail API | 完成 |
| 4.2 | UsersPage + UserProfilePage + AdoptionRamp + UserWorkItemList 换源 | 完成 |

字段映射：`userName→displayName`、`semanticStages→capabilityStages`、`workItemCount→deliveryUnitCount`

### PR-5：知识库分析换源

| Task | 产物 | 状态 |
|---|---|---|
| 5.1 | knowledge coverage / timeline / recalls / delivery-units API | 完成 |
| 5.2 | WikiRecalls 页面换源（coverage/timeline/list/workItemRanking） | 完成 |

字段映射：`sourceNamespace→repo`、`deliveryUnitId→workItemId`、`capabilityUsageId→skillUsageId`

### PR-6：总览收口 + 验收

| Task | 产物 | 状态 |
|---|---|---|
| 6.1 | OverviewPage 全量换源 | 完成 |
| 6.2 | 死代码清理 + 全站静态检查 | 完成 |
| 6.3 | 本实施报告 | 完成 |

## 3. 审查修复（commit `0ce8765`）

### P0 修复

| 问题 | 修复 |
|---|---|
| `profile_users` 表不存在 | `listUsers`/`getUserDetail` 改为 `sdd_users` + `profile_capability_usages` 聚合 |
| `trigger_source` 列不存在 | 新增 `1780000009000` migration，`profile_capability_usages.trigger_source` 承载 `sdd_skill_usages.invocation_trigger` |
| `knowledge_relative_path`/`raw_locator`/`event_sequence` 列不存在 | 改为 `knowledge_locator`（对齐 migration），`event_sequence` 置 null |
| timeseries `params.slice(2)` 丢掉 profileId/runId | 改为 `...params` |

### P1 修复

| 问题 | 修复 |
|---|---|
| users legacy 回退直接 501/404 | 从 `sddQueryService.listUsers`/`getUserDetail` 读取并映射字段 |
| `errorCount` 硬编码 0 | 经 `profile_delivery_units.evidence_json.sourceId` 反查旧 `work_item_id` 后聚合 |
| knowledge list 过滤参数被 controller 丢弃 | controller 透传 `range`/`deliveryUnitId`/`userId`/`capabilityUsageId` |
| knowledge timeline 参数被忽略 | contract schema 扩展支持 `granularity`/`groupBy`/`wikiDomain` |
| UsersPage 默认 pageSize=50 截断 | 改为 `pageSize: 200`（对齐 contract max=200） |
| 用户状态阈值 14/60/30 天（硬编码） | 改为 7/30/14 天（对齐 `config.default.ts`） |
| maturity stage 返回 `first_capability_use` 等新名 | 改为 `proposal`/`design`/`task`/`codereview`（对齐前端 `AdoptionRamp`） |

### 3.1 追加审查修复（Codex 续修）

| 问题 | 修复 |
|---|---|
| `1780000008000-add-profile-query-indexes` 存在但未注册 | 补入 `data-source.ts`，并把 up/down 改成索引存在性检查，避免重复 ADD/DROP 失败 |
| `trigger_source` 承载旧 `invocation_trigger` 但列长过短 | `1780000009000` 使用 `VARCHAR(191)`，并兼容半成品环境中已存在的短列自动放宽 |
| 能力分析 user/auto 触发统计误用 `capability_source` | bridge 写入 `trigger_source=invocation_trigger`，analytics 按 `user-slash` / `claude-proactive,nested-skill` 聚合 |
| `multiStageDeliveryUnitCount` 与旧口径不一致 | 改为 `proposal/design/task/review` 中覆盖 `>=3` 阶段，并按 artifact `first_seen_at` 应用当前时间窗口 |
| knowledge ranking 未透传 range | `knowledge/delivery-units` contract、controller、service、web hook 全链路透传 `range` |

### 3.2 重建阻断修复

| 问题 | 修复 |
|---|---|
| `code-operator.ts` 的 `profile_code_activities` INSERT 为 22 列 / 22 参数 / 23 个占位符，导致有 code activity 时 `profile:rebuild` 失败，current pointer 不切换 | 占位符修正为 22 个。此问题修复前的 `profile:rebuild` / `profile:diff` PASS 结论不可复现；验收必须以修复后重新 rebuild 的 current run 为准 |

## 4. 页面换源证据

### 静态检查结果

主数据页面（overview / skills / work-items / wiki-recalls 主页面）无 `/api/sdd` 调用。

仍有 SDD 调用的路径（有明确原因）：

| 路径 | 原因 |
|---|---|
| `useWikiRecalls.ts` domain-docs/doc-detail/content | profile 无对应端点，领域详情页的文档列表/内容读取走 SDD |
| `useUserSkillUsages.ts` | 用户详情 activity 下钻，profile 无对应端点 |
| `useUserArtifactWrites.ts` | 用户详情 artifact writes，profile 无对应端点 |

### 各页面数据源

| 页面 | Profile Hook | API 路径 |
|---|---|---|
| OverviewPage | `useProfileOverview` / `useProfileCapabilityAnalytics` / `useProfileUsers` / `useProfileDemands` | `/api/profiles/:pid/overview` `/capabilities/analytics` `/users` `/demands` |
| WorkItemsPage | `useProfileDemands` | `/api/profiles/:pid/demands` |
| WorkItemDetailPage | `useProfileDemandDetail` | `/api/profiles/:pid/demands/:id` |
| ArtifactTimeline | `useProfileArtifactTimeline` | `/api/profiles/:pid/demands/:did/artifacts/:aid/timeline` |
| SkillsPage | `useProfileCapabilityAnalytics` / `useProfileCapabilityTimeseries` / `useProfileCapabilityUsageSummary` / `useProfileCapabilityUsages` | `/api/profiles/:pid/capabilities/*` |
| UsersPage | `useProfileUsers` | `/api/profiles/:pid/users` |
| UserProfilePage | `useProfileUserDetail` | `/api/profiles/:pid/users/:id` |
| WikiRecallsPage | `useWikiRecallCoverage` / `useWikiRecallTimeline` / `useWikiRecallWorkItemRanking` / `useWikiRecallList` | `/api/profiles/:pid/knowledge/*` |
| WikiDomainDetailPage | `useWikiRecallDomainDocs` / `useWikiRecallDocDetail` / `useWikiRecallDocContentByPath` | `/api/sdd/wiki-recalls/*`（见未完成项） |

## 5. typecheck / build 结果

### 5.1 阶段验证记录

```text
./node_modules/.bin/tsc --noEmit -p packages/api/tsconfig.json ✅
./node_modules/.bin/tsc --noEmit -p packages/ui/tsconfig.json ✅
./node_modules/.bin/tsc --noEmit -p server/tsconfig.json ✅
./node_modules/.bin/tsc --noEmit -p worker/tsconfig.json ✅
./node_modules/.bin/tsc --noEmit -p web/tsconfig.json ✅
./node_modules/.bin/tsc -p packages/api/tsconfig.json ✅
./node_modules/.bin/tsc -p packages/ui/tsconfig.json ✅
./node_modules/.bin/tsc -p server/tsconfig.json ✅
./node_modules/.bin/tsc -p worker/tsconfig.json ✅
./node_modules/.bin/vite build（web）✅
./node_modules/.bin/vitest run worker/test/delivery-link-mapping.test.ts：8 passed ✅
pnpm typecheck / pnpm build：当前沙箱内 `turbo` 层报 `fetch failed`，未能作为根级命令完成；已用各 package 直接编译替代验证。
```

### 5.2 重建阻断修复后复验

本轮修复 `code-operator.ts` INSERT 占位符数量后，重新执行：

```text
./node_modules/.bin/tsc --noEmit -p worker/tsconfig.json ✅
./node_modules/.bin/vitest run worker/test/delivery-link-mapping.test.ts：8 passed ✅
./node_modules/.bin/tsc -p worker/tsconfig.json ✅
node worker/dist/jobs/profile-rebuild.js --profile sdd-default ✅ runId=13 completed，current pointer switched
node worker/dist/jobs/profile-diff.js --profile sdd-default ✅ gate=PASS
```

`profile:rebuild` 关键统计：

```json
{
  "runId": 13,
  "status": "completed",
  "stats": {
    "deliveryUnit": { "source": 17, "inserted": 17 },
    "capability": { "source": 73, "inserted": 73 },
    "artifact": { "source": 2, "inserted": 2 },
    "artifactWrite": { "source": 14, "inserted": 14 },
    "artifactTurn": { "source": 0, "inserted": 0 },
    "knowledgeRecall": { "source": 1280, "projected": 23, "skippedNoWikiRoot": 0 },
    "codeActivity": { "source": 2118, "projected": 2118 }
  }
}
```

`profile:diff` 关键 gate：

```json
{
  "runId": 13,
  "gate": "PASS",
  "capabilityDeliveryMissing": 0,
  "knowledgeDeliveryMissing": 0,
  "codeDeliveryMissing": 0,
  "knowledge": {
    "new": 23,
    "orphanSourceRef": 0,
    "oldPipelineScope": 23,
    "oldNotInNew": 0,
    "newNotInOld": 0,
    "oldSeedExcluded": 4106
  }
}
```

注意：`pnpm --filter @sdd-telemetry/worker typecheck/test` 在当前沙箱内仍报 `fetch failed`，本轮验证改用本地二进制和编译后的 Node 入口执行。该失败属于 pnpm 启动层问题，不是 TypeScript、测试或 projection 运行失败。

## 6. 未完成项

| 项 | 原因 | 影响老板演示 |
|---|---|---|
| Knowledge domain-docs / doc-detail / content 端点 | profile API 未实现这 3 个端点，服务端需要 filesystem 扫描能力 | 否 — WikiRecalls 主页面 KPI/趋势/排行可用，领域详情页的文档列表/内容读取走 SDD 回退 |
| User activity 下钻链路（useUserSkillUsages / useUserArtifactWrites） | 用户详情页 activity tab 的细粒度数据，profile 无对应端点 | 否 — 用户详情主卡已走 profile，activity 细节是辅助信息 |
| Interactions 页面 | 不在本次换源范围 | 否 |
| Semantics CRUD | 不在本次换源范围 | 否 |
| Knowledge coverage `scan.configured=false` | profile_projection 无 filesystem scan；当前 `totalDocs` 是 recall 事实数，不是知识库文档总数 | 是 — 不应作为真实知识覆盖率演示；只可说明为“召回事实去重概况”或在 UI 上降级 |
| User list 查询 N+1 correlated subquery | listUsers 在 `profile_capability_usages` 上 GROUP BY user_id，另有 3 个 correlated subquery 补充 artifact/knowledge/code 指标 | 数据量小时可接受（<100 用户），大量时需优化为预聚合物化视图 |

## 7. 回退方式

```text
PROFILE_DASHBOARD_READ_SOURCE=legacy_sdd
```

- 所有 profile endpoint 都包含 legacy_sdd 适配层（users 已补齐）
- `/api/sdd/*` 端点未被删除
- current pointer 不需要回滚

## 8. 命名分层验证

- `profile.contract.ts` 不引入新的 `Sdd*` 类型 ✅
- Contract 内部字段使用 `capability` / `deliveryUnit` / `knowledge` 通用命名 ✅
- 页面文案继续使用「技能」「需求」「知识库」产品命名 ✅
- `sourceNamespace→repo` 等旧字段映射只在 page-local adapter 层（`useWikiRecalls.ts`） ✅

## 9. 已知限制

- Repository 查询直接拼 SQL 字符串，未使用 query builder。后续需考虑用 TypeORM 或 Knex 管理查询。
- User list 的 correlated subquery 在数据量增长后需要优化。
- 知识库 coverage 的 `totalDocs` 来自 `COUNT(*)` on `profile_knowledge_recalls`（即 recall 事实数），`recalledDocs` 来自 `COUNT(DISTINCT knowledge_locator)`。这不是“文档数 / 文档数”的真实覆盖率，而是“去重召回文档 / 召回事件”的临时降级口径。SDD 旧版的 `totalDocs` 来自实际文件扫描，两者量纲不同；切换 `profile_projection` 后不要把该字段作为真实知识覆盖率对外展示。
