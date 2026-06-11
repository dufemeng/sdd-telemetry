# Profile Source Registry Executor 实施报告（第三阶段-0）

更新时间：2026-06-08
状态：代码实施完成；DB 级 rebuild / diff gate 待可访问 MySQL 环境复验

## 1. 结论

第三阶段-0 的核心代码已完成：端到端 Monorepo profile 不再通过 production 专属 matcher / operator / diff 分支接入，而是通过 `projectionMode='source_backed'`、`sourceRules`、通用 matcher、通用 source-backed operators 和通用 diff gate 接入。

当前沙箱无法连接本地 MySQL（`connect EPERM 127.0.0.1:3306`），因此以下 DB 门禁尚未在本环境得到 PASS：

- `pnpm db:verify`
- `pnpm profile:diff -- --profile sdd-default`
- `pnpm profile:rebuild -- --profile e2e-monorepo`
- `pnpm profile:diff -- --profile e2e-monorepo`

代码加载、operator 分发、类型检查、构建和无 DB 单测均已通过。端到端 monorepo profile 是否达到老板演示条件，仍必须等待真实端到端 monorepo 日志和 MySQL 环境完成抽样验证后判断。

## 2. 删除 / 替换的 profile 专属 production 路径

已删除旧的 profile 专属 matcher/operator 文件；当前 production 投影路径只保留通用 source-backed operators，不再为端到端 monorepo 单独分发。

已替换：

- `worker/src/jobs/profile-projection/operators.ts`
  - 由 profile id 分发改为 `projectionMode` 分发。
  - `sdd_bridge` 返回 SDD bridge + knowledge/code legacy operators。
  - `source_backed` 返回通用 `SOURCE_BACKED_OPERATORS`。
- `worker/src/jobs/profile-diff.ts`
  - 删除旧的 profile 专属 diff 分支。
  - `sdd_bridge` 走原 sdd-default parity gate。
  - `source_backed` 走通用 internal consistency gate。

生产代码中端到端 monorepo 的命中范围只剩 profile 配置：

```text
packages/api/src/profile-config.ts
```

这是允许范围；端到端 monorepo 作为配置样本存在，不再是 worker/server 的专属执行分支。

## 3. Source Registry Executor Interface

本阶段落地的核心接口：

```ts
resolveRuntimeProfileConfig(config, env)
matchSourceReference(sourceReferenceFact, resolvedRules, profileId)
SOURCE_BACKED_OPERATORS
runSourceBackedDiff(pool, config, runId)
```

通用 source-backed projection 覆盖：

- `process_doc` write/edit/update -> `profile_delivery_units` + `profile_artifacts` + `profile_artifact_writes`
- matched source -> `profile_capability_usages`
- `knowledge` read/grep/glob -> `profile_knowledge_recalls`
- `code` read/write/edit/grep/glob -> `profile_code_activities`
- conservative attribution -> `delivery_unit_id`

## 4. 端到端 Monorepo Profile 配置

端到端 monorepo profile 现在通过多 root source rule 表达：

```text
E2E_PLAN_ROOT
E2E_KNOWLEDGE_ROOT
E2E_FRONTEND_ROOT
E2E_BACKEND_ROOT
```

也支持兼容展开：

```text
E2E_MONOREPO_ROOT=/repo
  -> /repo/plan
  -> /repo/docs
  -> /repo/frontend_repo
  -> /repo/backend_repo
```

兼容展开由通用字段 `fallbackBaseEnv + relativeRoot` 实现，matcher / operator 不读取 `E2E_MONOREPO_ROOT`。

## 5. 在线文档 profile Provisional Scope

已新增 disabled 的 `online-docs` 配置样例：

- URL knowledge rule：`urlPrefix` 匹配在线知识库。
- MCP process doc rule：`mcpServers + collectionIds + docTypes` 示例，默认 disabled。

URL / MCP source rule 目前是 provisional readiness。真实在线文档 source reference 验证前，字段名、docId / collectionId / docType 的组合规则不冻结。

## 6. Grep Gate

执行：

```bash
rg -n "E2E|e2eMonorepo|e2e|端到端 Monorepo profile|profileId ===|profileId !==" worker/src server/src packages/api/src -g '!node_modules/**'
```

结果解释：

- `worker/src`：无端到端 monorepo 专属命中。
- `server/src`：无端到端 monorepo 专属命中；读源 fallback 已改为 `projectionMode` 判断。
- `packages/api/src/profile-config.ts`：保留端到端 monorepo profile id、ruleId、env 名称和配置内容，这是允许命中。

## 7. 验证结果

已通过：

```bash
./node_modules/.bin/tsc --noEmit -p packages/api/tsconfig.json
./node_modules/.bin/tsc --noEmit -p server/tsconfig.json
./node_modules/.bin/tsc --noEmit -p worker/tsconfig.json
./node_modules/.bin/tsc --noEmit -p web/tsconfig.json
./node_modules/.bin/tsc -p packages/api/tsconfig.json
./node_modules/.bin/tsc -p server/tsconfig.json
./node_modules/.bin/tsc -p worker/tsconfig.json
./node_modules/.bin/vite build
./node_modules/.bin/vitest run worker/test/*.test.ts
```

单测结果：

```text
13 test files passed
102 tests passed
```

operator 分发运行时检查：

```json
{
  "sdd": [
    "deliveryUnit",
    "capability",
    "artifact",
    "artifactWrite",
    "artifactTurn",
    "knowledgeRecall",
    "codeActivity"
  ],
  "e2eMonorepo": [
    "sourceBackedDeliveryArtifact",
    "sourceBackedCapability",
    "sourceBackedKnowledge",
    "sourceBackedCode"
  ],
  "onlineDocs": []
}
```

未通过项说明：

- `./node_modules/.bin/vitest run worker/test` 中 integration tests 连接 `127.0.0.1:3306` 被沙箱拒绝：`connect EPERM 127.0.0.1:3306`。
- `node worker/dist/jobs/profile-rebuild.js --profile e2e-monorepo` 同样因 MySQL 连接被沙箱拒绝。
- `tsx` 命令在本沙箱内创建 IPC pipe 被拒绝：`listen EPERM .../tsx-501/*.pipe`，因此 profile 命令用 build 后 JS 验证到 DB 连接边界。

## 8. Diff Gate 边界

source-backed diff 是 internal consistency gate，不是独立语义真值对账。

它能证明：

- 命中的 source reference 是否进入预期 projection。
- process doc write 是否生成 artifact write。
- projection 行是否存在 orphan source reference。
- code activity 是否缺 repo metadata。

它不能单独证明：

- matcher 语义分类一定正确。
- 端到端 monorepo 真实目录结构一定与 fixture 一致。
- 在线文档 profile URL / MCP 字段一定满足当前 provisional schema。

因此端到端 monorepo profile 演示前必须做真实路径抽样。

## 9. 端到端 Monorepo Profile 部署 / 演示判断

技术部署条件：

- 代码层面：已具备。
- DB rebuild / diff gate：本环境未能跑通，需在可访问 MySQL 的公司电脑复验。

老板演示条件：

- 目前不能宣布已满足。
- 还缺真实端到端 monorepo 日志抽样：
  - plan write 是否生成 delivery unit / artifact / artifact write。
  - knowledge / code 是否按 same interaction / same session 归因到正确需求。
  - `unmappedContext / ambiguousContext / unknownUnderConfiguredRoots` 是否可解释。

## 10. 公司电脑复验命令

在可访问 MySQL 且已配置端到端 monorepo root 的环境执行：

```bash
pnpm db:verify
pnpm profile:rebuild-source-references
E2E_MONOREPO_ROOT=/absolute/path/to/repo pnpm profile:rebuild -- --profile e2e-monorepo
E2E_MONOREPO_ROOT=/absolute/path/to/repo pnpm profile:diff -- --profile e2e-monorepo
pnpm profile:rebuild -- --profile sdd-default
pnpm profile:diff -- --profile sdd-default
```

如果知识库迁出 monorepo，改用独立 root：

```bash
E2E_PLAN_ROOT=/absolute/path/to/plan
E2E_KNOWLEDGE_ROOT=/absolute/path/to/docs-or-online-sync
E2E_FRONTEND_ROOT=/absolute/path/to/frontend_repo
E2E_BACKEND_ROOT=/absolute/path/to/backend_repo
```

复验报告必须贴出 `profile:diff` JSON，并人工抽样 5-10 条真实 source reference。
