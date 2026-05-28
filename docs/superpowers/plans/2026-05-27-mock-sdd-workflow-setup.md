# Mock SDD 工作流搭建指南

> **重要：本文档面向 cold-start 会话，假设阅读者没有任何上下文。**
> 完全自包含——不需要回看其他对话历史。
>
> **目标读者**：在新会话里执行此文档的 Sonnet 模型，预算紧、上下文窗口要省着用。
> **执行模式**：边读边做，每步做完报告进度。完成全部步骤约需 1.5-2 小时。
>
> 关联文档：
> - 设计文档：`docs/superpowers/specs/2026-05-27-wiki-recall-dashboard-design.md`
> - 实施计划：`docs/superpowers/plans/2026-05-27-wiki-recall-dashboard.md`

---

## 1. 背景

### 1.1 项目是什么

当前仓库 `/Users/loomisli/Desktop/lm/sdd-telemetry/` 是一个**遥测分析平台**，名为 `sdd-telemetry`（SDD = Skill-Driven Development）。它通过 OTel 协议接收 Claude Code 客户端上报的日志，清洗后展示在 dashboard 上，用于观测、评测一套名为 `bk-fe-sdd` 的 skill 工作流。

详细背景见 `README.md` 与 `CLAUDE.md`。

### 1.2 `bk-fe-sdd` 工作流概览

`bk-fe-sdd` 是一套**业务前端 SDD skill 集合**（共 14 个），在团队成员的 Claude Code 客户端里运行。核心 skill：

| Skill 语义码 | 作用 |
|---|---|
| `proposal` | 围绕需求生成或迭代技术提案文档（proposal.md） |
| `design` | 基于提案生成系统设计（design.md） |
| `task` | 把设计拆解成任务清单（tasks.md） |
| `code` | 编码实现 |
| `codereview` / `designreview` | 代码 / 设计审查 |
| `legilimency` | 需求完成后从研发产物提取业务知识回补 wiki |
| `code-system-wiki` | 从代码仓库生成 wiki 系统文档（冷启动） |
| `code-domain-wiki` | 从 system 文档推导 wiki 域级文档（冷启动） |

完整语义列表见 `server/src/infrastructure/mysql/seed.ts`。

这些 skill 通过 `settings.json` 的 `pathAliases` 引用两个本地 git 仓库：

```
@wiki         → 团队知识库（bk-fe-knowledge-trade）
@requirements → 团队需求过程文档库（bk-fe-requirements-trade）
```

**工作流**：

```
1. 团队成员用 /bk-fe-proposal "<需求描述>" 启动
   → skill 内部 Read @wiki/SUMMARY.md / @wiki/domain-X/architecture/...
     召回相关业务知识
   → 生成 proposal.md 写到 @requirements/<domain>/<date-slug>/proposal.md
2. 用 /bk-fe-design 推进设计（同样召回 wiki，产出 design.md）
3. /bk-fe-task → tasks.md
4. /bk-fe-code → 实际改业务代码（不在 @requirements 里写）
5. 需求完成后 /bk-fe-legilimency 回补 wiki
```

整个过程中 Claude Code 会把每次 `skill_activated` / `tool_decision` / `tool_result` 等事件**通过 OTel 上报**到 `sdd-telemetry` 平台（`POST /api/ingest/otlp-logs`）。

### 1.3 `@wiki` 目录结构（重要）

`@wiki` 是一个按"业务域 × 知识维度 × 系统模块"组织的 markdown 仓库。**Mock wiki 必须严格复刻这个结构**，否则 skill 召回逻辑会失效。

```
bk-fe-knowledge-trade/                  # 根目录
├── .claude/                            # Claude Code 配置（可省）
├── README.md                           # 根级导览
├── SUMMARY.md                          # 根级总目录
├── CLAUDE.md                           # 协作规范
├── LEGAL.md                            # 法律声明（可省）
├── log.md                              # 更新日志（可省）
│
├── domain-cashier/                     # ← L1 业务域：收银台
│   ├── README.md
│   ├── SUMMARY.md
│   │
│   ├── architecture/                   # ← L2 维度：架构
│   │   └── architecture.md
│   │
│   ├── business/                       # ← L2 维度：业务
│   │   ├── INDEX.md
│   │   └── pages/
│   │       ├── bindcard-flow.md
│   │       ├── payment-flow.md
│   │       └── sign-flow.md
│   │
│   ├── config/                         # ← L2 维度：配置
│   │   └── README.md
│   │
│   ├── data/                           # ← L2 维度：数据
│   │   └── model.md
│   │
│   └── system/                         # ← L2 维度：系统
│       └── apps/                       # ← L3：每个 app 一个目录
│           ├── bk-cashier-sdk/
│           │   ├── core.md
│           │   ├── guide.md
│           │   ├── overview.md
│           │   ├── pointcuts.md
│           │   ├── types.md
│           │   └── utils.md
│           ├── bk-cashier-payment/
│           │   └── ... 同上 6 个文件
│           └── ...
│
├── domain-mybank-home/                 # ← L1 业务域：mybank 首页
│   └── ... 同 domain-cashier 结构
│
└── domain-sdd-telemetry/               # ← L1 业务域：sdd-telemetry（自指）
    └── ...
```

**规则总结**：
- L1：`domain-<name>/` 顶层目录（统一 `domain-` 前缀）
- L2：5 个固定维度（架构 / 业务 / 配置 / 数据 / 系统）
- L3 (system 下专有)：`apps/<app-name>/` 每个 app 一个目录
- L4 (system/apps/* 下专有)：6 个标准文档（`core.md` / `guide.md` / `overview.md` / `pointcuts.md` / `types.md` / `utils.md`）

### 1.4 当前 sdd-telemetry 平台为什么需要 mock？

`sdd-telemetry` 平台正在做**任务 A：wiki 召回看板**——观测谁/哪个需求/哪个 skill 召回了哪些 wiki 文件。**已经完成的工作**：

1. brainstorming → 设计文档（`docs/superpowers/specs/2026-05-27-wiki-recall-dashboard-design.md`）
2. 实施计划（`docs/superpowers/plans/2026-05-27-wiki-recall-dashboard.md`，17 个 task）
3. 跑了一组探查 SQL 验证现实数据

**探查发现的关键事实**：当前 sdd-telemetry 生产数据库里，只有 59 条 tool_call 命中过 wiki_root_path 字符串：

- 全部来自同一个用户（sdd-telemetry 平台的开发者本人）
- 全部 `inferred_skill = NULL`（没有 skill 上下文）
- 全部发生在最近 3 天（写 spec/plan 过程中 Claude 探查 wiki 结构的对话）
- **真正的 bk-fe-* skill 调用 wiki 的数据 = 0**

**所以问题**：plan 写好了，但本机没法验证代码工作——因为本机没有真正的 bk-fe-sdd 工作流可以触发 wiki 召回数据。

**部署到公司服务器再验证可行**，但循环很长（编码 → scp → 部署 → 用户使用 → 上报 → 看板），不利于迭代。

**Mock SDD 工作流的目标**：在本机重建一个**简化但完整**的 bk-fe-sdd 工作流，让本机能跑出真实的 wiki 召回 trace 数据，用于验证 plan 实施的代码正确性。

### 1.5 当前 gap

| 模块 | 当前状态 | 需要 |
|---|---|---|
| sdd-telemetry 平台代码 | 完整可跑 | 不动 |
| OTel 上报链路 | 当前 Claude Code → localhost:4318 已可用（见 `README.md`） | 不动 |
| `@wiki` 本地目录 | **空 / 不存在** | **造一个 mock wiki** |
| `@requirements` 本地目录 | 存在（本机已有 sdd-telemetry/docs/ 等）但不是 bk-fe 约定结构 | **造一个 mock requirements 根目录** |
| `bk-fe-*` skills（公司内部） | **全部没有** | **写一个 minimal mock skill** |
| `settings.json` 的 pathAliases / OTEL headers | 已配置但 wiki 路径无内容 | 验证 + 微调 |

## 2. 目标与不在 scope 的事

### 2.1 成功标准

跑完本文档全部步骤后，应满足以下**4 个 hard 指标**：

```sql
-- 在你本机的 sdd-telemetry 数据库执行（DB 名 `sdd-telemetry`）：

-- 指标 1：bk-fe-* skill 调用有数据
SELECT raw_skill_name, COUNT(*) FROM sdd_skill_usages
WHERE raw_skill_name LIKE 'bk-fe%' GROUP BY raw_skill_name;
-- 期望：至少 1 行，raw_skill_name='bk-fe-proposal' count>=1

-- 指标 2：wiki 召回有数据，且能归属到 skill
SELECT COUNT(*) FROM sdd_interaction_tool_calls tc
JOIN sdd_interactions i ON i.id = tc.interaction_id
JOIN sdd_users u ON u.id = i.user_id
WHERE u.wiki_root_path IS NOT NULL
  AND tc.tool_input_preview LIKE CONCAT('%', u.wiki_root_path, '%');
-- 期望：>= 5 条

-- 指标 3：归属推断算法在 mock 数据上有效
SELECT
  (SELECT su.raw_skill_name FROM sdd_skill_usages su
   WHERE su.interaction_id = i.id AND su.event_sequence <= tc.sequence
   ORDER BY su.event_sequence DESC LIMIT 1) AS inferred_skill,
  COUNT(*)
FROM sdd_interaction_tool_calls tc
JOIN sdd_interactions i ON i.id = tc.interaction_id
JOIN sdd_users u ON u.id = i.user_id
WHERE u.wiki_root_path IS NOT NULL
  AND tc.tool_input_preview LIKE CONCAT('%', u.wiki_root_path, '%')
GROUP BY inferred_skill;
-- 期望：至少有一行 inferred_skill = 'bk-fe-proposal' 且 COUNT > 0

-- 指标 4：work_item 链路也通了
SELECT COUNT(*) FROM sdd_work_items WHERE work_item_slug LIKE '2026-%';
-- 期望：>= 1（mock skill 写入 @requirements 触发的）
```

**只有 4 个指标全部满足，模拟器搭建才算完成**。

### 2.2 不在 scope 的事（不要做）

- ❌ 不要补全 bk-fe-sdd 全部 14 个 skill——本期**只需 1 个 mock proposal**
- ❌ 不要写真实业务知识到 mock wiki——stub 内容足够
- ❌ 不要 push mock wiki 到 GitHub（用户后续可能自己做）
- ❌ 不要改 sdd-telemetry 平台代码——平台代码不变
- ❌ 不要实施 `docs/superpowers/plans/2026-05-27-wiki-recall-dashboard.md` 里的任何 task——那是模拟器搭好后的下一阶段
- ❌ 不要给 mock wiki 加 git 历史——纯静态目录够用

---

## 3. 实施步骤

### Step 1：造 mock `@wiki` 目录

#### 1.1 选定路径

**目标路径**（必须与现有 `settings.json` 的 `pathAliases.@wiki` 一致）：

```
/Users/loomisli/Desktop/lm/bk-fe-sdd/bk-fe-knowledge-trade
```

**操作前先确认这个路径是否存在**：

```bash
ls -la /Users/loomisli/Desktop/lm/bk-fe-sdd/bk-fe-knowledge-trade 2>/dev/null
```

- 如果存在但**非空**：先把当前内容备份（`mv` 到 `bk-fe-knowledge-trade.backup`），再创建新目录
- 如果不存在或空：直接创建

#### 1.2 生成目录结构 + stub markdown

**一次性脚本**（命名为 `scripts/generate-mock-wiki.sh`，放在你的工作区临时目录跑一次就行）：

```bash
#!/bin/bash
set -euo pipefail

WIKI_ROOT="/Users/loomisli/Desktop/lm/bk-fe-sdd/bk-fe-knowledge-trade"

# 备份已有 wiki
if [ -d "$WIKI_ROOT" ] && [ -n "$(ls -A "$WIKI_ROOT" 2>/dev/null)" ]; then
  mv "$WIKI_ROOT" "${WIKI_ROOT}.backup.$(date +%Y%m%d-%H%M%S)"
fi

mkdir -p "$WIKI_ROOT"
cd "$WIKI_ROOT"

# === 根级文件 ===
cat > README.md <<'EOF'
# bk-fe-knowledge-trade (Mock)

本仓库是 bk-fe-sdd 工作流的 mock 知识库，用于本机环境的链路验证。

## 业务域

- `domain-cashier/` 收银台域
- `domain-mybank-home/` mybank 首页域
- `domain-sdd-telemetry/` sdd-telemetry 平台自指域

## 知识维度（每个域内）

- `architecture/` 架构层
- `business/` 业务层
- `config/` 配置层
- `data/` 数据层
- `system/apps/` 系统层（按代码仓库切）

## 注意

这是 **mock 内容**，仅用于本机链路验证；不代表真实业务知识。
EOF

cat > SUMMARY.md <<'EOF'
# Wiki 总目录

## 业务域

### domain-cashier
- architecture/architecture.md
- business/INDEX.md
- business/pages/sign-flow.md
- business/pages/payment-flow.md
- business/pages/bindcard-flow.md
- config/README.md
- data/model.md
- system/apps/bk-cashier-sdk/{core,guide,overview,types,utils,pointcuts}.md
- system/apps/bk-cashier-payment/{core,guide,overview}.md

### domain-mybank-home
- architecture/architecture.md
- business/INDEX.md
- system/apps/mybank-home-shell/{core,guide,overview}.md

### domain-sdd-telemetry
- architecture/architecture.md
- system/apps/sdd-telemetry-server/{core,guide,overview}.md
- system/apps/sdd-telemetry-worker/{core,guide,overview}.md
- system/apps/sdd-telemetry-web/{core,guide,overview}.md
EOF

cat > CLAUDE.md <<'EOF'
# 协作规范（Mock）

本仓库是 bk-fe-sdd 工作流的 mock 知识库。

skills 在召回时优先看：
1. 根级 SUMMARY.md（总览）
2. domain-<X>/architecture/architecture.md（架构起点）
3. domain-<X>/business/INDEX.md（业务索引）
4. domain-<X>/system/apps/<app>/overview.md（系统模块入口）
EOF

# === 域生成函数 ===
mkdir_domain() {
  local domain_dir="$1"     # 如 domain-cashier
  local domain_label="$2"   # 如 "收银台"
  local d="$WIKI_ROOT/$domain_dir"
  mkdir -p "$d"/{architecture,business/pages,config,data,system/apps}

  cat > "$d/README.md" <<EOF2
# $domain_label 域 (Mock)

域目录：\`$domain_dir\`
EOF2

  cat > "$d/SUMMARY.md" <<EOF2
# $domain_label 域索引

- architecture/architecture.md
- business/INDEX.md + business/pages/*
- config/README.md
- data/model.md
- system/apps/*
EOF2

  cat > "$d/architecture/architecture.md" <<EOF2
# $domain_label 域 — 架构 (Mock)

本文档描述 $domain_label 域的整体架构（mock 内容）。

## 系统组成
（占位）

## 数据流
（占位）

## 依赖关系
（占位）
EOF2

  cat > "$d/business/INDEX.md" <<EOF2
# $domain_label 域 — 业务索引 (Mock)

## 业务流程
- pages/ 下的各业务页面文档

## 关键业务名词
（占位）
EOF2

  cat > "$d/config/README.md" <<EOF2
# $domain_label 域 — 配置 (Mock)

## 配置项约定
（占位）
EOF2

  cat > "$d/data/model.md" <<EOF2
# $domain_label 域 — 数据模型 (Mock)

## 核心实体
（占位）

## 表结构
（占位）
EOF2
}

# === 系统层 app 文件生成 ===
mkdir_app() {
  local domain_dir="$1"
  local app_name="$2"
  local app_label="$3"
  local d="$WIKI_ROOT/$domain_dir/system/apps/$app_name"
  mkdir -p "$d"

  for doc in core guide overview pointcuts types utils; do
    cat > "$d/$doc.md" <<EOF2
# $app_label — $doc (Mock)

\`$app_name\` 系统模块的 $doc 文档（mock 内容）。
EOF2
  done
}

# === domain-cashier ===
mkdir_domain "domain-cashier" "收银台"
cat > "$WIKI_ROOT/domain-cashier/business/pages/sign-flow.md" <<'EOF'
# 签约流程 (Mock)
描述签约流程的页面级业务文档。
EOF
cat > "$WIKI_ROOT/domain-cashier/business/pages/payment-flow.md" <<'EOF'
# 支付流程 (Mock)
描述支付流程的页面级业务文档。
EOF
cat > "$WIKI_ROOT/domain-cashier/business/pages/bindcard-flow.md" <<'EOF'
# 绑卡流程 (Mock)
描述绑卡流程的页面级业务文档。
EOF
mkdir_app "domain-cashier" "bk-cashier-sdk" "收银台 SDK"
mkdir_app "domain-cashier" "bk-cashier-payment" "收银台支付"

# === domain-mybank-home ===
mkdir_domain "domain-mybank-home" "mybank 首页"
mkdir_app "domain-mybank-home" "mybank-home-shell" "首页主壳"

# === domain-sdd-telemetry ===
mkdir_domain "domain-sdd-telemetry" "sdd-telemetry 平台"
mkdir_app "domain-sdd-telemetry" "sdd-telemetry-server" "Server"
mkdir_app "domain-sdd-telemetry" "sdd-telemetry-worker" "Worker"
mkdir_app "domain-sdd-telemetry" "sdd-telemetry-web" "Web"

echo "Mock wiki 生成完成：$WIKI_ROOT"
find "$WIKI_ROOT" -type f | wc -l
echo "总文件数（含 5 根级 + 3 domain × 各文件）"
```

**执行**：

```bash
chmod +x /tmp/generate-mock-wiki.sh
/tmp/generate-mock-wiki.sh
```

**验证**：

```bash
ls /Users/loomisli/Desktop/lm/bk-fe-sdd/bk-fe-knowledge-trade/
# 期望看到：README.md  SUMMARY.md  CLAUDE.md  domain-cashier  domain-mybank-home  domain-sdd-telemetry

find /Users/loomisli/Desktop/lm/bk-fe-sdd/bk-fe-knowledge-trade -name "*.md" | wc -l
# 期望：约 30-40 个 markdown 文件
```

如果文件数 < 25 或目录结构不对，回去检查脚本。

---

### Step 2：造 mock `@requirements` 目录

**目标路径**（必须与现有 `settings.json` 的 `pathAliases.@requirements` 一致）：

```
/Users/loomisli/Desktop/lm/bk-fe-sdd/bk-fe-requirements-trade
```

#### 2.1 确认 / 创建

```bash
ls -la /Users/loomisli/Desktop/lm/bk-fe-sdd/bk-fe-requirements-trade 2>/dev/null
```

- 如果存在：保留现状（用户可能已有真实需求过程文档）
- 如果不存在：

```bash
mkdir -p /Users/loomisli/Desktop/lm/bk-fe-sdd/bk-fe-requirements-trade/{cashier,mybank-home,sdd-telemetry}
cat > /Users/loomisli/Desktop/lm/bk-fe-sdd/bk-fe-requirements-trade/README.md <<'EOF'
# bk-fe-requirements-trade (Mock root)

需求过程文档库。skill 会把 proposal.md / design.md / tasks.md 写入此处。

## 目录约定

```
<domain>/<YYYY-MM-DD>-<slug>/
  proposal.md
  design.md (可选)
  tasks.md  (可选)
  <system-module>/
    design.md  (可选)
```
EOF
```

**注意**：本机这个目录可能已经有内容（bk-fe-sdd 之前的产物或别的）。**不要清空**——保留现状即可，mock skill 写新文件不会覆盖。

---

### Step 3：写 minimal mock skill `bk-fe-proposal`

#### 3.1 Skill 文件位置

放在 Claude Code 全局 skills 目录：

```
/Users/loomisli/.claude/skills/bk-fe-proposal/SKILL.md
```

如果 `~/.claude/skills/` 不存在，先创建：

```bash
mkdir -p ~/.claude/skills/bk-fe-proposal
```

#### 3.2 SKILL.md 完整内容

写入 `~/.claude/skills/bk-fe-proposal/SKILL.md`：

```markdown
---
name: bk-fe-proposal
description: 用于把模糊需求变成可评审的技术提案（proposal.md）。当需求方向还不清晰、存在多个可选方案需要权衡、或用户在讨论目标和约束时使用——即使用户没有明确说"要写提案"。本 mock 版本用于本机链路验证，会强制召回 @wiki 知识，并写产物到 @requirements。
---

# bk-fe-proposal (Mock for telemetry validation)

> **这是 mock 版本**。用于在本机环境产生完整的 SDD 工作流 trace 数据，包括：
> - skill_activated 事件
> - Read / Bash 工具调用命中 @wiki
> - 写产物 artifact 到 @requirements
>
> 完成后 sdd-telemetry 平台应能识别一次完整链路：bk-fe-proposal → wiki 召回 → work_item → artifact。

## 强制执行步骤

收到用户需求后，**严格按以下顺序**执行（不要跳步、不要省步）：

### 1. 确认 @wiki 与 @requirements 的本地路径

读取 `~/.claude/settings.json`，找到 `pathAliases.@wiki` 与 `pathAliases.@requirements`。
**Bash 工具**列出 wiki 顶层目录确认结构：

```bash
ls -la <@wiki 绝对路径>/ | head -20
```

### 2. 强制召回 wiki 内容（这一步必须发生 Read 工具调用）

**Read 工具**读取 wiki 总览（即使内容是 mock，也要真实读取）：

1. Read `<@wiki>/SUMMARY.md`
2. Read `<@wiki>/CLAUDE.md`

### 3. 根据需求识别业务域

从用户描述中提取业务域关键词。例如"收银台" → `cashier`，"首页" → `mybank-home`。

如果无法识别，**默认用 `sdd-telemetry`**（即把需求归到 sdd-telemetry 域）。

### 4. 召回业务域知识

针对识别出的业务域 `<X>`，**Read 工具**读以下文件：

1. `<@wiki>/domain-<X>/architecture/architecture.md`
2. `<@wiki>/domain-<X>/business/INDEX.md`
3. `<@wiki>/domain-<X>/SUMMARY.md`

任一文件不存在时，**Read 工具**仍尝试读取（让 Read 报错，这是预期的——这条 tool_call 仍会上报 OTel）。

### 5. **Bash 工具**探查域下的系统模块

```bash
ls <@wiki>/domain-<X>/system/apps/ 2>/dev/null
```

### 6. 召回最相关的系统模块知识（如果识别得出）

如果系统模块名能从需求关键词或上一步 ls 输出推断出来：

**Read 工具**读：
- `<@wiki>/domain-<X>/system/apps/<app-name>/overview.md`
- `<@wiki>/domain-<X>/system/apps/<app-name>/core.md`

### 7. 生成 proposal 内容（基于上面召回的知识）

在内部组织一份简短的 proposal markdown，包含：

- 需求背景
- 目标
- 方案
- 风险

内容可以简洁，但必须**引用至少 2 处 wiki 内容**（用 markdown 链接或文字引用）。

### 8. **Write 工具**写产物文件

路径：`<@requirements>/<X>/<YYYY-MM-DD>-<slug>/proposal.md`

- `<X>` 是上面识别的业务域
- `<YYYY-MM-DD>` 是今天日期
- `<slug>` 是需求的英文简短描述（kebab-case，最多 5 个单词，如 `add-delayed-debit`）

**Write 工具**调用是触发 work_item / artifact 上报的关键，必须发生。

### 9. 报告给用户

简短报告：
- 识别出的业务域
- 召回了哪几个 wiki 文件
- 产物文件路径

## 禁止行为

- 不要跳过步骤 2-8 中的任何 Read/Bash/Write 调用——它们是触发 OTel 上报的关键
- 不要把 Read/Write 合并到 Skill 子调用（避免归属推断失效）
- 不要在 proposal 内容里编造业务事实超出 wiki 内容的范围——这是 mock 验证，重点是链路通

## 完成后的验证

skill 结束后，告诉用户：

> Mock skill 执行完成。请到 sdd-telemetry mysql 跑以下查询验证链路：
>
> ```sql
> SELECT raw_skill_name FROM sdd_skill_usages WHERE raw_skill_name = 'bk-fe-proposal' ORDER BY id DESC LIMIT 1;
> SELECT work_item_slug FROM sdd_work_items ORDER BY id DESC LIMIT 1;
> ```
```

#### 3.3 验证 skill 文件可读

```bash
cat ~/.claude/skills/bk-fe-proposal/SKILL.md | head -10
```

期望看到 frontmatter（name / description）+ 正文起始。

---

### Step 4：核对 `settings.json` 配置

#### 4.1 确认 `pathAliases`

读取 `~/.claude/settings.json`，确认有以下条目：

```json
"pathAliases": {
  "@wiki": "/Users/loomisli/Desktop/lm/bk-fe-sdd/bk-fe-knowledge-trade",
  "@requirements": "/Users/loomisli/Desktop/lm/bk-fe-sdd/bk-fe-requirements-trade"
}
```

如果不存在或值不一致，**用 Edit 工具**修改成上面的值。

#### 4.2 确认 OTel 上报配置

`env` 字段下需要有以下变量。**路径必须做 URL 编码**（`/` → `%2F`）：

```json
"env": {
  "CLAUDE_CODE_ENABLE_TELEMETRY": "1",
  "OTEL_LOGS_EXPORTER": "otlp",
  "OTEL_EXPORTER_OTLP_PROTOCOL": "http/json",
  "OTEL_EXPORTER_OTLP_LOGS_ENDPOINT": "http://localhost:4318/api/ingest/otlp-logs",
  "OTEL_EXPORTER_OTLP_HEADERS": "sdd-install-id=sdd-local-mock,sdd-user-name=mock-user,sdd-machine-name=local,sdd-requirements-root-path=%2FUsers%2Floomisli%2FDesktop%2Flm%2Fbk-fe-sdd%2Fbk-fe-requirements-trade,sdd-wiki-root-path=%2FUsers%2Floomisli%2FDesktop%2Flm%2Fbk-fe-sdd%2Fbk-fe-knowledge-trade",
  "OTEL_LOG_USER_PROMPTS": "1",
  "OTEL_LOG_RAW_API_BODIES": "1",
  "OTEL_LOGS_EXPORT_INTERVAL": "5000",
  "OTEL_LOG_TOOL_DETAILS": "1"
}
```

**关键点**：

- `OTEL_EXPORTER_OTLP_LOGS_ENDPOINT` **只是 URL，不带 query params**——身份信息全部走 `OTEL_EXPORTER_OTLP_HEADERS`。OTel SDK 的规范用法（URL query 是历史兼容路径，不要再用）
- `install_id` 用 `sdd-local-mock` 区分开（与生产用户）
- header value 里的路径用 URL 编码：`/` → `%2F`（header value 含 `/` 在某些 HTTP client 里会被规范化掉，编码后更稳）

如果 settings.json 中已有这些变量但值不同，**保留现有非冲突项**，只改 endpoint / headers / install_id。

#### 4.3 启动 sdd-telemetry 平台

在另一个终端确认 sdd-telemetry 在跑：

```bash
cd /Users/loomisli/Desktop/lm/sdd-telemetry

# 如果还没起：
docker compose up -d mysql
pnpm dev   # 三个服务一起跑

# 健康检查
curl http://localhost:4318/api/health  # 期望 200
```

如果 `pnpm dev` 没跑过，先 `pnpm install`、`pnpm db:migrate`、`pnpm db:seed`。具体看 `README.md` "本地启动" 节。

---

### Step 5：跑一次完整链路 + 验证

#### 5.1 在新的 Claude Code 会话里触发 skill

打开 Claude Code，**新会话**（不在当前这个执行 skill 的会话里跑），输入：

```
/bk-fe-proposal 给收银台域加一个延迟扣款功能，用户下单后 24 小时再实际扣款
```

> 注：上面 prompt 里需求是 mock 的，重点不是产物质量，是触发链路。

观察 Claude Code 是否：

1. 激活 `bk-fe-proposal` skill（skill 名出现在 status line / output）
2. 用 Bash 列 wiki 目录
3. 用 Read 读 SUMMARY.md / CLAUDE.md / architecture.md 等
4. 用 Write 写 `@requirements/cashier/2026-MM-DD-<slug>/proposal.md`

#### 5.2 等 OTel 上报与 worker 清洗

OTel 默认每 5 秒导出一次（`OTEL_LOGS_EXPORT_INTERVAL=5000`），worker 大概也每几秒轮询一次。**等 15-30 秒**让数据完整流转。

#### 5.3 跑 4 个 hard 指标验证查询

连到本机 sdd-telemetry mysql：

```bash
docker compose -f /Users/loomisli/Desktop/lm/sdd-telemetry/compose.yml exec mysql \
  mysql -u sdd-telemetry -p'sdd-telemetry' sdd-telemetry
```

逐个跑第 2.1 节的 4 个查询：

**指标 1**：

```sql
SELECT raw_skill_name, COUNT(*) FROM sdd_skill_usages
WHERE raw_skill_name LIKE 'bk-fe%' GROUP BY raw_skill_name;
```

期望：至少 1 行，`raw_skill_name='bk-fe-proposal'`，count >= 1。

❌ 失败可能原因：
- skill 没真正 activate（settings.json 没识别到 skill）→ 检查 `~/.claude/skills/bk-fe-proposal/SKILL.md` 存在 + frontmatter 正确
- OTel 没上报 → curl http://localhost:4318/api/health；看 dashboard `/ingest` 页面是否有 batch
- skill_activated 事件被分类为 `unmatched`（sdd_skill_aliases 表里没 alias）→ 跑 `SELECT * FROM sdd_skill_aliases WHERE skill_name LIKE '%proposal%';` 确认有 `bk-fe-proposal` alias

**指标 2**：

```sql
SELECT COUNT(*) FROM sdd_interaction_tool_calls tc
JOIN sdd_interactions i ON i.id = tc.interaction_id
JOIN sdd_users u ON u.id = i.user_id
WHERE u.wiki_root_path IS NOT NULL
  AND tc.tool_input_preview LIKE CONCAT('%', u.wiki_root_path, '%');
```

期望：>= 5 条。

❌ 失败可能原因：
- sdd_users.wiki_root_path 没记录到 → 检查 OTEL_EXPORTER_OTLP_HEADERS 里 `sdd-wiki-root-path` 是否正确（URL 编码）
- skill 没真正 Read wiki 文件 → 看 sdd-telemetry dashboard `/sdd/interactions` 最新一条 turn 的 tool_calls，应该看到 Read/Bash 调用 + file_path 含 wiki 路径

**指标 3**：

```sql
SELECT
  (SELECT su.raw_skill_name FROM sdd_skill_usages su
   WHERE su.interaction_id = i.id AND su.event_sequence <= tc.sequence
   ORDER BY su.event_sequence DESC LIMIT 1) AS inferred_skill,
  COUNT(*)
FROM sdd_interaction_tool_calls tc
JOIN sdd_interactions i ON i.id = tc.interaction_id
JOIN sdd_users u ON u.id = i.user_id
WHERE u.wiki_root_path IS NOT NULL
  AND tc.tool_input_preview LIKE CONCAT('%', u.wiki_root_path, '%')
GROUP BY inferred_skill;
```

期望：至少有一行 `inferred_skill = 'bk-fe-proposal'` 且 COUNT > 0。

❌ 失败可能原因：
- inferred_skill 全是 NULL → skill_activated 事件没和 tool_calls 共享 interaction → 检查 `event_sequence` 字段是否在 events 里被正确提取

**指标 4**：

```sql
SELECT work_item_slug FROM sdd_work_items WHERE work_item_slug LIKE '2026-%';
```

期望：>= 1 条（含今天日期前缀的 slug）。

❌ 失败可能原因：
- skill 没真正 Write 到 @requirements → 检查产物文件是否落地：
  ```bash
  find /Users/loomisli/Desktop/lm/bk-fe-sdd/bk-fe-requirements-trade -name "proposal.md" -newer /tmp -type f
  ```
- requirements_root_path 没识别 → 检查 OTel header `sdd-requirements-root-path`

#### 5.4 4 个指标全通就完成了

如果 4 个指标都满足，**模拟器搭建完成**。在最后给用户一份**简短报告**：

```
Mock SDD 工作流搭建完成 ✓

完成清单：
- Mock @wiki 目录已建：<wiki 路径> （含 X 个 markdown）
- Mock @requirements 已就绪：<req 路径>
- Mock skill bk-fe-proposal 已安装：~/.claude/skills/bk-fe-proposal/SKILL.md
- settings.json OTel 配置已确认
- 跑了一次 /bk-fe-proposal 验证链路

4 项 hard 指标验证：
- skill_usage bk-fe-proposal：N 行 ✓
- wiki 召回命中：M 条 ✓
- 归属推断 inferred_skill 正确：K 条 ✓
- work_item slug 已写入：J 条 ✓

下一步：
- 用户可以启动 docs/superpowers/plans/2026-05-27-wiki-recall-dashboard.md 的 Task 1
- 真实数据已经有了，能用来验证 Task 1-17 的代码
```

---

## 4. Troubleshooting

### 4.1 OTel 没上报到 sdd-telemetry

检查链路：

```bash
# 1. server 在跑
curl -s http://localhost:4318/api/health
# 期望：返回 200

# 2. settings.json 的 OTEL_EXPORTER_OTLP_LOGS_ENDPOINT 是否指向 localhost:4318
cat ~/.claude/settings.json | grep OTEL_EXPORTER_OTLP_LOGS_ENDPOINT

# 3. 看 server 日志
cd /Users/loomisli/Desktop/lm/sdd-telemetry
# 看 server 日志输出最近的 ingest 请求

# 4. 看 ingest dashboard
# 浏览器打开 http://localhost:5173/ingest
# 期望：能看到最近的 batch
```

### 4.2 skill 没 activate

```bash
# 1. SKILL.md 文件存在且 frontmatter 正确
head -10 ~/.claude/skills/bk-fe-proposal/SKILL.md

# 2. Claude Code 重启
# 关掉 Claude Code 重开

# 3. 看 Claude Code 状态栏 / output 是否显示 skill 激活
```

### 4.3 work_item 没识别

```bash
# 检查产物路径里是否含 YYYY-MM-DD-<slug> 格式
find /Users/loomisli/Desktop/lm/bk-fe-sdd/bk-fe-requirements-trade -name "proposal.md" -type f
# 期望路径：.../cashier/2026-MM-DD-<slug>/proposal.md
```

如果路径里没有 `YYYY-MM-DD-<slug>` 目录段（比如 skill 写到了 `.../cashier/proposal.md` 直接根目录），work_item 推断会失败。
**改 mock skill instruction**（`~/.claude/skills/bk-fe-proposal/SKILL.md`），强调步骤 8 的路径必须含日期-slug 目录。

### 4.4 Bash 工具 LIKE 匹配命中过多 / 误判

预期 Mock skill 的 Bash 调用（`ls /Users/.../bk-fe-knowledge-trade/`）会命中 wiki_root_path——这是想要的。

如果担心其他 Bash 调用误判，可以查看具体命中 sample：

```sql
SELECT tc.tool_input_preview
FROM sdd_interaction_tool_calls tc
JOIN sdd_interactions i ON i.id = tc.interaction_id
JOIN sdd_users u ON u.id = i.user_id
WHERE u.wiki_root_path IS NOT NULL
  AND tc.tool_name = 'Bash'
  AND tc.tool_input_preview LIKE CONCAT('%', u.wiki_root_path, '%')
ORDER BY tc.id DESC LIMIT 5;
```

---

## 5. 完成后做什么

模拟器搭建完成后，**回到用户的主会话**报告完成。然后用户会：

1. 启动 `docs/superpowers/plans/2026-05-27-wiki-recall-dashboard.md` 里的 Task 1（subagent-driven 模式）
2. Plan 的每个 task 都能用 mock 数据验证代码正确性
3. Plan 完成后，先在本机看板验证 ✓，再 scp 到公司部署

**模拟器本身保留**，作为本机持续开发的基础设施——以后改 plan 代码、改 worker 清洗逻辑，都靠它产生测试数据。

如果以后要扩展模拟器（比如加 bk-fe-design / bk-fe-task），按 Step 3 的模式继续写 mock skill 即可。

### 5.1 可选扩展：让 mock skill 触发 subagent（验证 Task 3.5）

Plan 的 **Task 3.5** 引入了 `attachParentSkillUsageToAgentToolCalls`，专门处理 subagent interaction 内 tool_call 的归属继承。这个算法在本机要有真实数据才能集成验证。

**步骤**（如果你想在本机验证 Task 3.5）：

修改 `~/.claude/skills/bk-fe-proposal/SKILL.md` 的步骤 4（"召回业务域知识"）末尾，加：

```markdown
### 4.5 可选：通过 subagent 召回（用于验证 sdd-telemetry 的 subagent 归属算法）

如果用户在 prompt 里明确说"用 subagent"或"派子代理"，则执行：

**Agent 工具** 派一个 Explore 类型 subagent，prompt 为：

> Read 以下三个文件并返回摘要：
> - <@wiki>/domain-<X>/architecture/architecture.md
> - <@wiki>/domain-<X>/business/INDEX.md  
> - <@wiki>/domain-<X>/SUMMARY.md

这会产生一个 `agent_name='Explore'` 的独立 interaction，其内部的 Read 调用会触发 plan Task 3.5 的归属继承逻辑。
```

**验证 SQL**（mock skill 跑完后）：

```sql
-- subagent interaction 内的 Read 应该被归属到父 turn 的 bk-fe-proposal
SELECT i.agent_name, tc.tool_name, tc.skill_usage_id,
       (SELECT su.raw_skill_name FROM sdd_skill_usages su WHERE su.id = tc.skill_usage_id) AS attributed_skill
FROM sdd_interaction_tool_calls tc
JOIN sdd_interactions i ON i.id = tc.interaction_id
WHERE i.agent_name IS NOT NULL
  AND tc.tool_input_preview LIKE '%bk-fe-knowledge-trade%'
ORDER BY tc.id DESC LIMIT 10;
```

预期：`attributed_skill = 'bk-fe-proposal'`（说明继承成功）。

**注意**：本可选扩展只有在 plan Task 3.5 实施完成后才需要做；本期模拟器主目标（链路通）只用 4.1-4 的直接 Read 召回就足够。

---

## 6. 文件清单（执行完后应有的所有文件）

```
/Users/loomisli/Desktop/lm/bk-fe-sdd/bk-fe-knowledge-trade/         ← 新建
  README.md
  SUMMARY.md
  CLAUDE.md
  domain-cashier/
    architecture/architecture.md
    business/INDEX.md
    business/pages/{sign-flow,payment-flow,bindcard-flow}.md
    config/README.md
    data/model.md
    system/apps/bk-cashier-sdk/{core,guide,overview,pointcuts,types,utils}.md
    system/apps/bk-cashier-payment/{core,guide,overview,pointcuts,types,utils}.md
    README.md
    SUMMARY.md
  domain-mybank-home/
    ... (同结构)
  domain-sdd-telemetry/
    ... (同结构，3 个 apps)

/Users/loomisli/Desktop/lm/bk-fe-sdd/bk-fe-requirements-trade/      ← 沿用或新建
  README.md（如果新建）
  cashier/
    2026-MM-DD-add-delayed-debit/
      proposal.md（mock skill 跑完后产生）

/Users/loomisli/.claude/skills/bk-fe-proposal/                       ← 新建
  SKILL.md

/Users/loomisli/.claude/settings.json                                ← 修改
  （pathAliases + env 字段确认或更新）
```

---

## 7. 给 cold-start 执行者的几条原则

1. **每完成一个 Step 后**汇报一行进度（"Step N 完成：<简短说明>"），不需要长篇大论
2. **遇到歧义不要猜**——文档没明说的细节，先停下问用户
3. **不要扩大 scope**——这份文档只做模拟器搭建，不做 plan 实施
4. **每个 Bash 命令跑之前**先检查路径存在性 + 不会覆盖现有数据
5. **写 settings.json 时**用 Edit 工具最小改动，不要 Write 整个文件覆盖
6. 中文回复用户。Commit 也用中文（如果有）
