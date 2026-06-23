# 系统设计：SDD 产出质量评测系统（评测 CMS）

> 状态：已评审通过（2026-06-23）；实施顺序已按老板演示目标调整为 Demo-first。
> 一句话：用"真实 + 手补"的 prompt 评 SDD skill 的**产出质量**；**线上**管评测集 / rubric / 发起 / 进度，**本地**只做"执行 prompt"和"LLM 判分"两件必须本地的事。

## 目标和约束

### 目标

1. 把 dashboard 从"采集观测"升级到"产出质量监控"：能回答"我们 skill 写出来的 `design.md` 到底好不好、在变好还是变差"。
2. 评测集从**生产日志里清洗的真实 prompt** 起步，不够时人工补；不依赖历史产物。
3. 给评测做一个**线上 CMS**：评测集（增删改）、评分标准 rubric（在线可配、版本化）、发起一次评测并看到从评测集 → 本地执行 → 判分 → 结果的全程进度。

### 硬约束（来自部署现实，不可妥协）

- **服务器禁放私人 token**，走公司资源要申请——所以**任何调模型的动作只能在本地**（本地 Claude 执行 prompt、本地 `claude -p` 判分）。
- **Langfuse 产品出局**：依赖 Docker，公司内部装不起来。复用已部署的 sdd-telemetry 现有栈（MySQL + MidwayJS + worker + React），不引入新部署。
- **仓库在用户本地**：`@requirements`（design.md 所在）不在服务器；服务器只有 ≤4KB 预览 + Edit diff，**拿不到产物全文**。判分必须在文件所在地（本地）做。
- **产物全文永不出本地**：线上会长期保存管理员明确导入的 prompt 快照；本地产出的 `design.md` 全文不上行，只上传分数、内容指纹和短证据引文。

### 设计取舍（v1 已拍板，评审可推翻）

- **A+B 结合**：评测集 = 真实 prompt（日志洗）+ 手补 prompt；**本地重跑**产出文档，再判分。因为重跑，所以只需要 prompt、不需要历史产物——"多数调用没产物"不再是问题。
- **人工驱动执行**：prompt 由人在自己 Claude Code 里跑（交互式反问当场答），runner 不做无头自动化。小规模（10–30 条）足够，且天然解决交互问题。
- **判分仅文档（intrinsic）**：v1 judge 只读文档本身。"复用 claim 真不真 / 是否贴合本仓"这种要懂代码的判断，留作后续 **rubric 可配的 context-aware 升级**（本地 judge 天然能拿到代码，不是重构）。
- **v1 只铺 `design.md` 的 rubric**：rubric 是在线配置，系统天生支持 proposal/tasks，但 v1 只作者化 + 校准 design 一种。
- **评测集 CMS 先于执行脊柱**：真实 prompt 的 profile 化清洗、长期快照和人工整理本身可独立交付；先满足线上演示，再以 judge 校准结果作为 bridge/runner 的开工 gate。

### 非目标（v1 明确不做）

- 无头重跑 harness（driving Claude Code headlessly）。
- 自动 skill 版本 A/B 对比（可手动：跑两个 run 比平均分）。
- 知识召回评测、代码产物评测。
- design 以外（proposal/tasks）的 rubric 作者化。
- context-aware 判分（留作 rubric 升级项）。

## 总体架构

**线上控制面 + 本地执行面**，桥接只走**出站** HTTPS（穿透公司防火墙，本地无需被入站访问）。

```
线上控制面 (已部署 sdd-telemetry, 无模型 token)          本地执行面 (开发者机器: 有 Claude + 仓库)
──────────────────────────────────────────            ──────────────────────────────────────
评测集 eval_items     (profile 维度, 增删改) ◀── 从日志洗 / 手动补
评分标准 eval_rubric  (在线可配, 版本化)
发起评测 eval_runs + eval_run_items (进度)
      │                                     ① 出站拉取待跑项 (bridge/claim)
      │ ◀──────────────────────────────────────────  sdd-eval 本地 runner
      │                                     ② 本地 Claude 执行 prompt → 产出 design.md
      │                                     ③ 本地 `claude -p` 按 rubric 判分
      │ ◀──────── ④ 回报结果 (bridge/result) ─────────────────
      ▼
评测结果页 (进度条 + 分维度结果 + 证据钻取)
```

它本质就是 **Langfuse 的"工作流 A（production scoring）"**——给产出配 LLM-judge、打分、看趋势——只为约束改了两处部署：judge 挪本地、产出从磁盘读。

## 模块设计

| 模块 | 位置 | 职责 |
| --- | --- | --- |
| eval CMS 后端 | server（新 `modules/eval`） | eval_items / rubric / runs 的 CRUD 与编排；import-from-logs；进度聚合 |
| eval 桥接入口 | server（新 `modules/eval/bridge`） | 出站鉴权入口：claim / result，不依赖浏览器 session |
| eval CMS 前端 | web（新 `pages/admin/eval-items/*`，后续扩展 eval run/rubric 页面） | 评测集管理页、rubric 编辑页、发起 + 进度 + 结果页 |
| `sdd-eval` 本地 runner | 仓库内 `tools/eval-runner` | `next` 取一条、`judge` 本地判分上报；持有 bridge token。`next` 把 claim 返回的 `{runItemId, claimVersion, promptText, targetSkill, artifactType, rubric}` 写入权限受限的**本地状态文件**，`judge` 读取用户显式传入的产物路径，无需重取 |

**复用既有，不新造**（这是"最小"的根据）：

| 要的能力 | 复用现有 |
| --- | --- |
| profile 维度（sdd / 农小宝） | 全库已贯穿的 `profile_id` |
| rubric 在线配 + 版本化 | `profile_config_versions` 的 published/draft 版本模式（§7.0） |
| 异步跑 + 进度状态机 | `ingest_outbox` + worker 轮询的心智 |
| 本地 runner 出站鉴权 | OTLP ingest 那个"不依赖浏览器 session"的入口模式 |
| 全部页面 | dashboard 壳 + 现有图表组件 |

## 数据设计

4 张新表，全部挂 `profile_id`。命名 `eval_*`，与既有 `sdd_*` / `profile_*` 分层并行，不耦合。

### eval_items —— 评测集（CRUD，prompt 快照）

| 字段 | 类型 | 约束 | 说明 |
| --- | --- | --- | --- |
| `id` | BIGINT UNSIGNED | PK | |
| `item_key` | CHAR(64) | NOT NULL, UNIQUE | 幂等 key，见 API 设计中的结构化 hash 规则 |
| `profile_id` | VARCHAR(191) | NOT NULL, INDEX | 挂 profile |
| `source` | VARCHAR(32) | NOT NULL | `cleaned`（日志洗）/ `manual`（手补） |
| `origin_interaction_id` | BIGINT UNSIGNED | NULL | 溯源 `sdd_interactions.id`（cleaned 时） |
| `origin_prompt_id` | VARCHAR(191) | NULL | 溯源 prompt |
| `origin_projection_run_id` | BIGINT UNSIGNED | NULL | cleaned 样本来源的当前 profile projection run |
| `origin_capability_code` | VARCHAR(64) | NULL | profile 归一后的来源能力代码 |
| `origin_raw_capability_name` | VARCHAR(191) | NULL | 观测到的原始 skill/locator 名称 |
| `target_skill` | VARCHAR(191) | NULL | 从 serving profile 的 skill source rule 解析出的规范可执行 skill |
| `target_artifact_type` | VARCHAR(64) | NULL | `design` / `proposal` / `tasks`，决定用哪份 rubric |
| `prompt_text` | LONGTEXT | NULL | **prompt 快照**（评测集是固定资产 + run 可复现的依据，独立于观测层保留策略长期保留；当前 30 天 TTL 清理任务尚未上线，但快照设计的正当性来自"固定资产 + 可复现"，不依赖 TTL 是否存在）；仅删除 tombstone 可为 NULL |
| `title` | VARCHAR(500) | NULL | 列表可读标题 |
| `notes` | TEXT | NULL | 人工备注 |
| `enabled` | TINYINT(1) | NOT NULL DEFAULT 1 | 是否纳入 run |
| `occurrence_count` | INT UNSIGNED | NOT NULL DEFAULT 0 | 最近一次导入范围内的观测次数；manual 为 0，cleaned 至少为 1 |
| `first_observed_at` / `last_observed_at` | DATETIME(3) | NULL | 来源时间范围 |
| `last_imported_at` | DATETIME(3) | NULL | 最近一次来源刷新 |
| `deleted_at` | DATETIME(3) | NULL | 删除 tombstone；非空时默认列表不可见且导入不复活 |
| `deleted_by_user_id` | BIGINT UNSIGNED | NULL | 执行删除的管理员 |
| `gmt_create` / `gmt_modified` | DATETIME(3) | NOT NULL | |

索引至少包括 `UNIQUE(item_key)`、`INDEX(profile_id, deleted_at, gmt_modified, id)`、`INDEX(profile_id, deleted_at, origin_capability_code, enabled)` 和 `INDEX(profile_id, deleted_at, target_skill)`。

### eval_rubric_versions —— 评分标准（在线配、版本化）

套 `profile_config` 模式：版本化、published 不可变。**活动版本** = 该 `(profile_id, artifact_type)` 下 `version_status='published'` 的最大 `version_no`；run 创建时解析并快照，不另设指针表（保持最小）。

| 字段 | 类型 | 约束 | 说明 |
| --- | --- | --- | --- |
| `id` | BIGINT UNSIGNED | PK | |
| `profile_id` | VARCHAR(191) | NOT NULL, INDEX | |
| `artifact_type` | VARCHAR(64) | NOT NULL | `design` / `proposal` / `tasks` |
| `version_no` | INT UNSIGNED | NOT NULL | |
| `version_status` | VARCHAR(32) | NOT NULL | `draft` / `published` |
| `rubric_json` | JSON | NOT NULL | 维度数组 + judge 设置（见下） |
| `definition_hash` | CHAR(64) | NOT NULL | config hash，复现/比较用 |
| `created_by` | BIGINT UNSIGNED | NULL | `auth_users.id` |
| `published_at` | DATETIME(3) | NULL | |
| `gmt_create` / `gmt_modified` | DATETIME(3) | NOT NULL | |

UNIQUE(`profile_id`, `artifact_type`, `version_no`)。

`rubric_json` 结构：

```json
{
  "judge": { "temperature": 0, "evidenceRequired": true, "context": "intrinsic" },
  "dimensions": [
    { "code": "D1", "name": "覆盖", "weight": 1,
      "anchors": { "0": "缺多个承重环节或只剩标题", "1": "有结构但部分空泛/缺 1-2 承重项", "2": "承重环节都在且有实质内容" } }
  ]
}
```

`judge.context` 预留 `intrinsic` | `with_code`，v1 只实现 `intrinsic`。

### eval_runs —— 一次评测

| 字段 | 类型 | 约束 | 说明 |
| --- | --- | --- | --- |
| `id` | BIGINT UNSIGNED | PK | |
| `run_key` | CHAR(64) | NOT NULL, UNIQUE | |
| `profile_id` | VARCHAR(191) | NOT NULL, INDEX | |
| `title` | VARCHAR(500) | NULL | 本次评测命名 |
| `rubric_snapshot_json` | JSON | NOT NULL | **快照**本次 rubric，旧 run 永远可复现 |
| `rubric_version_id` | BIGINT UNSIGNED | NULL | 溯源 |
| `status` | VARCHAR(32) | NOT NULL | `queued` / `running` / `completed` / `canceled`；单项失败仍汇总为 completed |
| `created_by` | BIGINT UNSIGNED | NULL | |
| `started_at` / `completed_at` | DATETIME(3) | NULL | |
| `gmt_create` / `gmt_modified` | DATETIME(3) | NOT NULL | |

进度计数不落表，**查询时从 `eval_run_items` 聚合**，避免计数漂移。

### eval_run_items —— 每条状态 + 结果（驱动进度条）

| 字段 | 类型 | 约束 | 说明 |
| --- | --- | --- | --- |
| `id` | BIGINT UNSIGNED | PK | |
| `run_item_key` | CHAR(64) | NOT NULL, UNIQUE | `sha256(run_id:eval_item_id)`，幂等 |
| `run_id` | BIGINT UNSIGNED | NOT NULL, INDEX | |
| `eval_item_id` | BIGINT UNSIGNED | NOT NULL, INDEX | |
| `profile_id` | VARCHAR(191) | NOT NULL | 冗余，便于鉴权过滤 |
| `prompt_text` | LONGTEXT | NOT NULL | run 创建时从 item 拷贝快照（run 可复现） |
| `target_artifact_type` | VARCHAR(64) | NULL | |
| `target_skill` | VARCHAR(191) | NULL | run 创建时从 item 拷贝快照 |
| `status` | VARCHAR(32) | NOT NULL, INDEX | `pending` / `executing` / `scored` / `failed` |
| `claimed_by` | VARCHAR(191) | NULL | 认领的本地 runner（machine label） |
| `claim_version` | INT UNSIGNED | NOT NULL DEFAULT 0 | 每次 claim 原子 +1；拒绝旧认领的晚到结果 |
| `claimed_at` / `claimed_until` | DATETIME(3) | NULL | 认领时间 + 锁过期（超时可重认领） |
| `skill_version` | VARCHAR(128) | NULL | 本次实际执行的 skill 版本 |
| `execution_model` | VARCHAR(128) | NULL | 本次实际生成产物的模型 |
| `judge_model` | VARCHAR(128) | NULL | 本次实际判分模型 |
| `artifact_ref` | VARCHAR(500) | NULL | 本地生成的非敏感标签或相对引用；禁止上传绝对路径 |
| `artifact_sha256` | CHAR(64) | NULL | 判分输入内容指纹，复现/防篡改 |
| `scores_json` | JSON | NULL | `[{dimensionCode, score, evidence}]` |
| `total_score` | DECIMAL(5,2) | NULL | 加权总分，排序/趋势用 |
| `judge_excerpt` | TEXT | NULL | judge 简短理由（短证据引文，非全文） |
| `error_stage` | VARCHAR(32) | NULL | `execute` / `judge` / `report` |
| `error_message` | TEXT | NULL | |
| `executed_at` / `scored_at` | DATETIME(3) | NULL | |
| `gmt_create` / `gmt_modified` | DATETIME(3) | NOT NULL | |

## API 设计

### 控制面（浏览器 session 鉴权，`super_admin`，对齐现有语义配置权限）

```
# 评测集
GET    /api/eval/items?profileId=&source=&capabilityCode=&targetSkill=&enabled=&keyword=&page=&pageSize=
GET    /api/eval/items/:id?profileId=       # 单条详情，含完整 prompt
POST   /api/eval/items                      # 手动新增
PUT    /api/eval/items/:id?profileId=
DELETE /api/eval/items/:id?profileId=       # 清空正文并保留 key tombstone，阻止重导
POST   /api/eval/items/import-from-logs     # {profileId, capabilityCode?, from?, to?}；from/to 成对出现

# 评分标准
GET    /api/eval/rubrics?profileId=&artifactType=
POST   /api/eval/rubrics                    # 新建 draft / 新版本
PUT    /api/eval/rubrics/:id                # 改 draft
POST   /api/eval/rubrics/:id/publish

# 评测
POST   /api/eval/runs                       # {profileId, evalItemIds?, title} 默认全部 enabled；快照 items + active rubric
GET    /api/eval/runs?profileId=
GET    /api/eval/runs/:id                   # 状态 + 聚合进度
GET    /api/eval/runs/:id/items             # 每条状态 + 分数
POST   /api/eval/runs/:id/cancel
POST   /api/eval/runs/:id/items/:itemId/requeue
```

`import-from-logs`：先从 `profile_current_projection_runs` 解析该 profile 的当前 projection run，再从同 run 的 `profile_capability_usages` 按 `interaction_id` **LEFT JOIN** `sdd_interaction_texts`。LEFT JOIN 用于统计正文已清理的记录；只有非空且不超过 256,000 字符的 prompt 才进入应用层归一化和分组。通过结构化 key `sha256(JSON.stringify([profileId, targetSkill ?? "", artifactType ?? "", normalizedPrompt]))` 幂等 upsert 到 `eval_items`（`source='cleaned'`），返回 scanned/candidate/inserted/refreshed/upgraded/skippedNoPrompt/skippedOversize/skippedDeleted 和 projection run ID。命中 deleted tombstone 的 key 只计数、不复活；不能直接从无 `profile_id` 的基础表全量 join。

cleaned 样本分别保存 `originCapabilityCode=capability_code` 与 `originRawCapabilityName=raw_capability_name`。`targetSkill` 优先从当前 projection run 的 `profile_config_version_id` 对应配置解析，只有 legacy run 缺失版本时才回退 serving config：由 capability rule 的 `sourceRuleIds` 找到 skill source rule，取第一个非空 `skillNames` 作为规范可执行名；无法解析时为 NULL、默认 disabled，不把语义代码或 raw locator 当成 skill。manual target skill trim 后不能为空且 artifact type 必填。artifact type 仅显式映射 `design→design`、`proposal→proposal`、`task→tasks`。导入时间范围可选但必须成对出现，UI 默认读取全部尚未清理的正文；显式时间范围单次跨度上限 31 天。

归一化只用于判重：prompt 依次做 Unicode NFC、CRLF/CR 统一为 LF、首尾 trim；保留内部空格、缩进和换行，避免误合并包含代码或 YAML 的不同需求。原始快照不改写。cleaned 的 prompt、target skill 和 artifact type 均不可原地编辑；需要改写或重定向时复制为 manual。所有 prompt 在 CMS 中只按不可信纯文本展示。

列表响应只返回最多 240 字符的 `promptPreview`，完整 `promptText` 只由单条详情接口返回。关键字只搜索 title、notes 和 target skill，避免 prompt 片段进入 GET URL 与访问日志。列表 `total` 表示当前筛选命中数，`summary` 表示当前 profile 的全量 total/enabled/cleaned/manual；默认按 `gmt_modified DESC, id DESC` 稳定分页。列表、详情、更新和删除都显式携带 `profileId` 并在服务端与 item 的 profile 对照，不能仅靠前端切换器隔离。BIGINT ID 统一序列化为十进制字符串；所有评测项响应设置 `Cache-Control: no-store`。

### 桥接面（出站，token 鉴权，不依赖 session）

```
POST /api/eval/bridge/claim                 # {machine, runId?} 原子取一条可认领项并递增 claimVersion，返回 {runItemId, claimVersion, promptText, targetSkill, artifactType, rubric}
POST /api/eval/bridge/run-items/:id/result  # {machine, claimVersion, scores[], skillVersion, executionModel, judgeModel, judgeExcerpt, artifactSha256, artifactRef?} → scored；或 {error} → failed
```

**鉴权说明**：桥接用一个**服务端 ingress 密钥**（`EVAL_BRIDGE_TOKEN`，env 配置），本地 runner 持有该密钥（本地配置，不入仓）。它是**接口入口密钥，不是模型 token**——不违反"服务器不放私人 token"（服务器侧只有一个入口密钥，不调任何模型）。

## 流程设计

1. **线上**：admin `import-from-logs` 洗出 prompt + 手动补 → 在评测集页增删改，curate profile `sdd-default` 的 `eval_items`。
2. **线上**：admin 在 rubric 编辑页确认/改 design rubric → publish v1。
3. **线上**：admin 点"发起评测" → 建 `eval_run`（快照 enabled items + active rubric）→ 生成 `eval_run_items`（pending），status=queued。
4. **本地**：dev `sdd-eval next` → claim 一条 → 服务端标 executing、run→running。dev 把 prompt 贴进自己 Claude Code 跑出 `design.md`。dev `sdd-eval judge <runItemId> <path>` → 本地读全文 + `claude -p` 判分 → 上报 result → 标 scored。逐条重复。
5. **线上**：run 页轮询显示实时进度（pending/executing/scored 计数、逐条状态）。全部终态 → run completed。
6. **线上**：结果页——逐条分数、分维度拆解、total 分布、证据钻取；跨 run 对比（Slice 3）。

## 状态设计

- `eval_run_items`：v1 只保留 `pending →(claim) executing →(result) scored|failed`；`produced`/`judging` 留到 headless 自动化后再引入。
- `eval_runs`：`queued → running → completed | canceled`；item 全部终态时进入 completed，并单独聚合失败数，不把部分失败伪装成 run 级基础设施失败。

## 错误处理

- **claim 竞争**：复用仓库 MySQL 8.4，在短事务内 `SELECT ... FOR UPDATE SKIP LOCKED LIMIT 1` 选择 pending 或 lease 已过期项，再更新 executing/owner/lease/claim_version；多 runner 不双发且能返回确定行。
- **认领超时**：`claimed_until` 过期的 executing 项可被重新 claim；或 admin `requeue`。
- **结果归属**：result 必须以 `status=executing + claimed_by + claim_version` 做 compare-and-set；重新 claim 后旧版本结果返回 409，scored 项收到同版本同 payload 的重试返回当前成功结果，不重复写入。
- **空 run**：创建时没有 enabled item 或没有可用 published rubric 直接返回 409，不生成永远 queued 的 run。
- **judge JSON 解析失败**：runner 通过结构化 schema 解析并重试一次，仍失败标 `failed(judge)`。
- **产物路径不存在**：runner 本地报错，标 `failed(execute)` 或不上报（保持 executing 待 requeue）。
- **桥接鉴权失败**：401，runner 显式提示。
- **部分失败**：各 item 独立；run 在所有 item 终态时 completed；失败项列出可 requeue。

## 观测和排障

- run 结果页是主排障面：逐条状态 + `error_stage` + `error_message`。
- 服务端只记录桥接元数据，不记录 prompt、文档正文、证据全文或未清洗的命令错误。
- `artifact_sha256` 用于核对"判的就是这份产物"。

## 兼容和迁移

- **加法兼容**：新增表、端点、CLI、页面和共享 API contract；只给现有 router/sidebar/profile manifest 增加入口与能力开关，不改变已有 ingest、清洗、worker、查询和页面语义。
- Demo CMS 先用独立 migration 建 `eval_items`；执行脊柱再用后续 migration 建 run/rubric 表，避免明日演示被 bridge 依赖阻塞。
- 执行脊柱新增 env：`EVAL_BRIDGE_TOKEN`（server）；本地 runner 配置（server URL、token、machine），均不入仓。Demo CMS 不新增 env。
- `eval_*` 自有保留策略：评测集/run **长期保留**（curate 内容 + 可复现），不随 30 天明文清理。

## 测试策略

- **可证伪单测**（对齐项目"空集要能区分修好/错配"）：
  - `import-from-logs`：seed 两个 profile 的 current projection、capability usage 和 interaction text，断言 profile 隔离、空正文跳过、distinct prompt 与重复导入幂等。
  - claim 原子性：并发 claim 不双发。
  - rubric 版本：draft→publish→active 解析正确；旧 run 快照不受新 publish 影响。
  - 总分聚合与趋势查询。
- **集成**：假 runner 打通 claim→result，run 到 completed、分数落库；并发 claim 不双发，晚到结果不覆盖终态。
- **本地 runner**：stdin 读取全文、固定模型与无工具模式、结构化 JSON 解析 + 重试；错误上报清洗和限长。
- 固定跑 `pnpm typecheck` + `pnpm build`；在 **dev 模式**验证（非 start）。

## 最小路径（4 纵切片，Demo-first）

| 切片 | 做什么 | 验收 |
| --- | --- | --- |
| **0 Demo CMS** | `eval_items` + profile-aware `import-from-logs` + CRUD API + 管理页面 | 公司服务器从真实日志导入至少一条 cleaned prompt；页面可查看来源、筛选、启停、删除和手工补充 |
| **1 judge 校准 gate** | 本地固定模型对 3–5 篇手标文档各跑 3 次，检查人工一致性与方差 | 校准门槛通过后才允许建设 bridge/runner；未通过则只迭代 rubric/judge prompt |
| **2 执行脊柱** | `eval_runs`/`eval_run_items` + claim/result + 安全幂等 bridge + `sdd-eval` + 极简 run 页 | 线上发起 run → 本地执行与判分 → run 页见状态和分数；全文及绝对路径不上行 |
| **3 rubric/结果** | rubric 在线版本化、结果看板、run 对比、requeue 和错误处理 | 新旧 rubric 可复现，结果可钻取，两 run 可比较 |

## rubric：design.md（v1 作者化）

每维 **0/1/2 锚定 + 强制引用文档原文作证据**；headline = 加权和（0–10）看趋势，看板展开看分维度。

| 维度 | 2（充分） | 1（部分） | 0（缺） |
| --- | --- | --- | --- |
| **D1 覆盖** | 承重环节（数据/API/状态流/错误处理/兼容迁移）都在且有实质内容 | 有结构但部分空泛 / 缺 1-2 承重项 | 缺多个承重环节或只剩标题 |
| **D2 可落地** | 关键路径具体到字段/接口/边界，可直接被 `bk-fe:task` 拆 | 方向对但关键处停在"待定/示意" | 泛泛而谈无法实施 |
| **D3 取舍** | 关键取舍都有备选 + 放弃原因 | 部分决策有理由 | 只有结论无理由 |
| **D4 克制** | 明显复用现有架构且克制，无 YAGNI 违例 | 基本克制但有个别过度设计 | 明显过度抽象 / 造轮子 / 预留无用扩展 |
| **D5 一致** | 自洽 + 待确认问题明确 | 个别不一致 | 自相矛盾或漏关键开放问题 |

judge prompt 明写：**不为长度加分、不为文档无法控制的事（如需求本身烂）扣分**；满分锚点 = "本团队资深工程师直接接受、不返工"。

**稳定性校准**（信任趋势之前先做）：手标 3–5 篇比对 judge；每篇跑 3 次看方差，专挑会晃的维度改锚点。

**其他类型骨架（后补，机制已支持）**：proposal = 方案选项与取舍 / 目标边界 / 验收可验证 / 衔接一致；tasks = 颗粒度具体 / 验收可执行 / 依赖排序 / 优先级 MVP 切分。共享"覆盖·可落地·取舍·克制·一致"五主题骨架。

## 风险和应对

| 风险 | 应对 |
| --- | --- |
| judge 不稳/没区分度（核心风险） | 锚定 rubric + 强制引证 + 校准集 + 方差检查；信任趋势前先验 |
| profile 导入混入其他工作流 | 只读当前 profile projection run；不直接从基础事实表全量导入 |
| 评测集样本太小 | 重跑 + 人工补 prompt；只需 prompt 不需历史产物 |
| 人工驱动吞吐低 | 小规模可接受；headless 留后续 |
| bridge token 泄漏 | 本地持有、不入仓；它是 ingress 密钥非模型 token |
| 重跑时 skill / 模型版本漂移 | run item 快照 target skill，并记录实际 skill version、执行模型和 judge 模型；缺少这些字段的结果不得进入可比较趋势 |

## 四项风险自检

1. **复用**：profiles / `profile_id`、`profile_config` 版本化模式、ingest 免 session 鉴权入口、worker/outbox 状态机心智、dashboard 壳——全复用，未重复造。
2. **抽象**：rubric 做成配置（非硬编码）→ 不改码支持多 `artifact_type`，这是必要抽象（≥3 类文档）；不预造 A/B、不造 headless harness（YAGNI）。
3. **破坏**：以新增能力为主，只扩展共享 contract、router/sidebar 和 profile manifest；不改 cleaning / worker / 既有 API 语义，破坏性低。
4. **影响**：新增 eval 模块 + admin 页面，并为两个 profile 开启 evaluation；现有页面和遥测链路不变，新增消费方仅 `super_admin`。

## 评审已定（2026-06-23，按默认）

1. **bridge token 粒度**：单部署一个 `EVAL_BRIDGE_TOKEN`（不做 per-profile）。
2. **scores 存储**：`eval_run_items.scores_json` 内联（趋势查询慢再拆 `eval_scores` 子表，局部重构）。
3. **`produced`/`judging` 中间态**：省略，只留 `pending→executing→scored|failed`（headless 化后再补细状态）。
4. **runner 形态**：仓库内 `tools/eval-runner`，随仓库分发、与桥接 API 同版本演进。
