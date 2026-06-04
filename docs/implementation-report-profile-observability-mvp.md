# Profile 化研发观测 MVP-1 实施报告

日期：2026-06-04
关联：`docs/tasks-profile-observability-mvp.md`（实施计划）、`docs/design-profile-observability-architecture.md`（架构）
分支：`codex/profile-observability-mvp-doc`

## 1. 结论先行

**后端管线 MVP 完成；全站/四大看板换源未完成，属增量。**
- §13 完成定义按**字面**满足（第 10 项「总览可通过 contract 展示」已做 headline + 知识库/代码卡片；但四大看板尚未真正换源——这是 §13 字面与意图的差距）。
- Task 20 验收 3 条（页面不退化 / 下钻不断 / manifest 降级逻辑存在）满足，但「看板从 contract 取数」的意图仅产出分析 `/demands` 端点就位，前端未换源。

后端数据管线 + 读 API + 前端 shell 全贯通，最高风险的「非自证链路」在真实数据上对账 **PASS（key/locator 级）**。

## 2. 做了什么（按 commit）

| commit | 内容 |
|---|---|
| `3abfdaf` | doc 修复：钉死 stable_evidence_id 粒度、rule_version 重建语义、orphan 校验 |
| `f005656` | PR-1 profile 契约 + sdd-default 配置 + `/api/profiles`、`/manifest`、`/overview` |
| `8207c92` | PR-2 `source_references` 表 + 纯函数抽取算子（双解码/降级）+ 全量重建命令 |
| `7820b6e` | PR-3 `profile_*` 9 表 + current-pointer 运行框架（锁/run/切指针/失败不切） |
| `c9e425a` | PR-4 sdd-default 桥接 projection（capability/delivery/artifact/writes/turns） |
| `d7649cd` | PR-5 knowledge 从 source_references 非自证投影 + `profile:diff` 对账 |
| `c3b68bc` | PR-6 `PROFILE_DASHBOARD_READ_SOURCE` 开关 + overview 读 projection（无指针回退 legacy） |
| `8d5b0ea` | PR-7 全站 Profile Switcher + ShellContext.profileId + profile hooks |
| `c74ac7d` | Task 13 code activity 算子 + overview code 概况 |
| `03179af` | Task 15 `profile:link-check` 抽样链路对账 |
| `cbff666` | Task 19 总览 headline KPI 接 Profile Contract（受开关，fallback 旧值） |
| `7bccc2b` | Task 20 manifest 降级机制（`useProfileManifest` + `FeatureGate`） |
| `24bb21c` | overview 补 知识库/代码 卡片（DoD #12 可视闭合） |
| `2105f00` | Task 20 产出分析 `/demands` 端点 + `useProfileDemands` hook |
| `1141f12` / 同步 | DoD-13 文档保鲜（tasks 文档 §16 实施记录） |

实现要点 / 与文档的偏差（均记于 tasks §16）：
- profile 命令挂 **worker**（非 Task 6.5 的全 server），高内聚、避免 server→worker 反向依赖；根脚本转发。
- 桥接幂等 key 复用上游 sdd 稳定 key（非事实层 composite key）。
- 抽取数据源：`tool_input` 在 `tool_result` 事件、double-encoded string，从完整 `attributes_json` 读。
- knowledge 对账限 pipeline scope（tool_call ∈ source_references），seed/demo 数据可解释排除。
- 读源默认 `legacy_sdd`，切 projection 无 current pointer 时自动回退。

## 3. 验证了什么（真实库，可证伪）

| 项 | 结果 |
|---|---|
| migrate + verify | 28 表 / 25 唯一索引（含 hash 列索引，2048 原文列不建索引） |
| source_references 重建 | 2054 条，`duplicates=0`；重复跑 reused=2050/inserted=4（仅新事实入库）= 幂等 |
| 双解码 | 真实 `tool_result.attributes_json.tool_input` 解码成功（验证公司电脑那条结论） |
| current-pointer 失败语义 | 注入失败算子 → run=failed，**current pointer 不变**（Task 7） |
| 桥接对账（`profile:diff`，**key-set 级**） | rebuild→diff 背靠背：五域 `oldNotInNew/newNotInOld` 全 0（含 capability/delivery/artifact/writes/turns） |
| knowledge 非自证（gate，**(tool_call_id, locator) 级**） | **PASS**：new=23、`old_not_in_new=0`、`new_not_in_old=0`、`orphan_source_ref=0`；seed 4106 可解释排除 |
| 对账时效 | diff 比对 live `sdd_*`；run 后有新数据入库会如实 FAIL（提示重建），需 rebuild→diff 背靠背 |
| 抽样链路（`profile:link-check`） | **PASS**：真实需求 artifact/writes/turns 链路新旧一致 |
| overview 读源 parity | 4 个重叠字段 legacy==projection；knowledge 真实 23 |
| code 概况 | read 1241 / write 786 |
| `/demands` | 17 条与 delivery units 一致，真实需求带 artifactCount/stage；路由注册、boot 干净 |
| 工程基线 | typecheck 6/6、build 5/5、worker 测试 59 passed（含 12 个抽取单测） |

## 4. 范围边界（哪些不属 MVP-1）

文档明确推迟、**不在 MVP-1 验收内**的：
- **capability→delivery 链路**：Task 8 映射表标注 `work_item_id 后续映射为 delivery_unit_id`（「后续」）。当前 `profile_capability_usages.delivery_unit_id` 为空。
- **四大看板全量从 contract 取数**：Task 20 验收不要求换数据源；目前仅产出分析 `/demands` 端点 + hook 就位，WorkItemsPage 未换源（其「调用次数」列依赖上面的链路）。
- **需求详情 / artifact timeline 下钻端点**（§11.5）：属架构长期愿景，未做。
- **boss-a / boss-b profile 接入**：明确非 MVP-1。

## 5. 若继续（需你圈定范围，均属 MVP-1 之外的增量）

建议顺序（每步独立可验、保留 legacy 回退）：
1. capability→delivery 链路（解锁产出分析页「调用次数」聚合）。
2. WorkItemsPage 接 `/demands`（产出分析看板真正换源）。
3. `/knowledge/coverage`、`/capabilities/analytics`、`/users` 端点 + 逐页接入。
4. 需求详情 + artifact timeline 下钻端点。

> 注：以上 1–4 均超出 tasks 文档 MVP-1 的验收标准，属「逐步接入」增量，建议明确纳入后再做。
