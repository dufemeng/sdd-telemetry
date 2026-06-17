# Boss A Monorepo Profile 实施报告

日期：2026-06-05

## 结论

按 `docs/tasks-boss-a-monorepo-profile.md` 的第一轮接入目标，代码实现已完成到可进入真实 Boss A 日志验证的状态：

- `boss-a-monorepo` profile 已进入共享 profile registry。
- server / worker 共用同一份 profile config。
- 非 SDD profile 已阻断 legacy SDD fallback 污染；无 current run 时返回空态或 `PROFILE_DATA_NOT_READY`。
- Boss A 本地 monorepo 路径 matcher、projection operators、diff gate 已实现。
- 总览、用户分析、技能分析、产出分析已按 profile presentation 隐藏 SDD 专属指标。
- Profile Switcher 对未配置 `BOSS_A_MONOREPO_ROOT` 的 profile 显示为 disabled，避免误选。

## 本次实现

### 共享契约与配置

- 新增 `packages/api/src/profile-config.ts`：
  - `sdd-default`
  - `boss-a-monorepo`
  - `sourceRules`
  - `presentation.hiddenMetrics`
  - `presentation.knowledgeCoverageMode`
- `ProfileSummary` 增加 `presentation`，前端通过 profile 配置降级展示，不硬编码 `profileId === 'boss-a-monorepo'`。
- server 本地 `profile-config.ts` 改为 re-export API 包，避免 server / worker 配置漂移。

### Server 读路径

- `ProfilesService.resolveReadMode()` 统一控制读源：
  - 有 current projection run：读 `profile_*`。
  - `sdd-default` 无 run：允许 legacy SDD fallback。
  - 非 SDD profile 无 run：返回空态或 `PROFILE_DATA_NOT_READY`，不得查询 SDD 数据。
- 覆盖了 overview、demands、demand detail、artifact timeline、capability analytics/timeseries/usages、users、user detail、knowledge coverage/timeline/recalls/ranking。

### Boss A Worker Projection

- 新增 `boss-a-matcher.ts`：
  - `plan/**` -> 过程文档 / 需求。
  - `docs/**` -> 知识库读取。
  - `frontend_repo/**` -> 前端代码活动。
  - `backend_repo/**` -> 后端代码活动。
- 新增 `boss-a-operators.ts`：
  - plan write -> `profile_delivery_units`、`profile_artifacts`、`profile_artifact_writes`
  - all matched path refs -> `profile_capability_usages`
  - docs read -> `profile_knowledge_recalls`
  - code read/write -> `profile_code_activities`
- 稳定 key 均基于 `source_reference_key`，不依赖自增 id。
- knowledge/code 到 demand 的归因策略：
  - 同 interaction 内最近过程文档 anchor。
  - 同 user + session + 120 分钟窗口内唯一过程文档 anchor。
  - 多个候选 anchor 标记 ambiguous，不强行归因。

### Boss A Diff Gate

- `profile:diff -- --profile boss-a-monorepo` 增加内部一致性 gate：
  - source reference 分类计数。
  - projection row 计数。
  - plan write 是否缺 artifact write。
  - artifact 是否缺 delivery unit。
  - knowledge/code 是否 orphan source reference。
  - code repo kind 是否 unknown。
  - ambiguous context 只报告，不阻塞。

该 gate 不是 sdd-default 那种新旧对账；Boss A 没有独立 legacy 真值，只能做结构一致性校验，语义分类仍需真实路径样例人工抽检。

### 前端降级

- `useProfileHiddenMetrics()` 从 `/api/profiles` 读取当前 profile presentation。
- 总览：
  - Boss A 隐藏“全链路需求”、成员 SDD 深度、SDD 链路覆盖。
  - 最近活跃需求用“产物类型”替代 SDD 阶段点。
- 技能分析：
  - Boss A 隐藏用户触发/自动触发、有效配对率、调用质量、未匹配健康度、全链路需求。
- 用户分析：
  - Boss A 隐藏 SDD 成熟度 KPI、SDD 阶段漏斗、表格 SDD 成熟度列。
- 用户详情：
  - Boss A 不触发旧 SDD activity 下钻 hooks。
- 产出分析：
  - Boss A 隐藏 SDD 阶段漏斗，需求列表用“产物类型”展示。

## 已执行验证

```bash
./node_modules/.bin/tsc --noEmit -p packages/api/tsconfig.json
./node_modules/.bin/tsc --noEmit -p server/tsconfig.json
./node_modules/.bin/tsc --noEmit -p worker/tsconfig.json
./node_modules/.bin/tsc --noEmit -p web/tsconfig.json
```

结果：通过。

```bash
./node_modules/.bin/vitest run worker/test/boss-a-matcher.test.ts worker/test/delivery-link-mapping.test.ts
```

结果：2 个测试文件通过，15 个测试通过。

```bash
./node_modules/.bin/tsc -p packages/api/tsconfig.json
./node_modules/.bin/tsc -p packages/ui/tsconfig.json
./node_modules/.bin/tsc -p server/tsconfig.json
./node_modules/.bin/tsc -p worker/tsconfig.json
cd web && ../node_modules/.bin/vite build
```

结果：通过。

Boss A operator INSERT 静态校验：

```text
profile_delivery_units: columns=16, placeholders=16, staticParams=16
profile_artifacts: columns=14, placeholders=14, staticParams=14
profile_artifact_writes: columns=19, placeholders=19, staticParams=19
profile_capability_usages: columns=19, placeholders=19, staticParams=19
profile_knowledge_recalls: columns=22, placeholders=22, staticParams=22
profile_code_activities: columns=22, placeholders=22, staticParams=22
```

结果：通过。

## 未完成验证

当前环境无法完成本地 MySQL projection 烟测：

```bash
BOSS_A_MONOREPO_ROOT=/tmp/boss-a-monorepo node worker/dist/jobs/profile-rebuild.js --profile boss-a-monorepo
```

原因：沙箱拦截本机 MySQL 连接 `127.0.0.1:3306`；提升权限审批未放行。

因此以下验证必须在公司电脑或可访问本地 MySQL 的环境补跑：

```bash
export PROFILE_DASHBOARD_READ_SOURCE=profile_projection
export BOSS_A_MONOREPO_ROOT=/absolute/path/to/boss-a-monorepo

pnpm db:migrate
pnpm profile:rebuild-source-references
pnpm profile:rebuild -- --profile boss-a-monorepo
pnpm profile:diff -- --profile boss-a-monorepo
```

验收标准：

- `profile:rebuild` completed，并切换 `profile_current_projection_runs.current_projection_run_id`。
- `profile:diff -- --profile boss-a-monorepo` gate 为 `PASS`。
- `sourceReferences.unknownInMonorepo` 为 0 或逐条解释。
- `linkage.planWriteMissingArtifactWrite = 0`。
- `linkage.artifactWithoutDeliveryUnit = 0`。
- `linkage.knowledgeOrphanSourceRef = 0`。
- `linkage.codeOrphanSourceRef = 0`。
- `linkage.unknownCodeRepoKind = 0`。
- `linkage.ambiguousContext` 可非 0，但需抽样确认是否符合“同 session 多需求 anchor”预期。

## 已知边界

- Boss A diff 是内部一致性校验，不是独立真值对账；真实路径语义仍需人工抽样。
- 代码活动依赖 `source_references` 能抽到 code path。如果某些 bash/git 操作不进 source registry，代码概况会低估。
- Boss A 知识库覆盖率当前是 recall facts 口径，不是文件系统扫描覆盖率。
- Boss B 在线 MCP 知识库 / requirements 不在本阶段范围内。
