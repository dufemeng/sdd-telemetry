# 设计简报 · Profile 配置页极简化重做（impeccable shape）

> 来源:本需求的**根本动机**——`/admin/profile-configs` 把整个 `WorkflowProfileConfig` 原样摊成 747 行表单,反人类。
> 后端统一(source_backed)已是地基;这一步盖"简单配置"的房子。
> impeccable `shape` 产物,实现前需用户确认。

## 1. Feature Summary
把 `/admin/profile-configs` 重做成「**内容地图 + 技能映射**」极简编辑页。用户只描述**内容在哪**(知识/过程文档/代码)与**技能语义**,系统自动编译出底层全部规则(sourceRules / deliveryUnitRules / artifactRules / capabilityRules / 归因 / 展示)。面向内部工程师 / Tech Lead。目标:配一个 profile 不再需要懂 Rule ID、优先级、locatorStrategy、归因策略。

## 2. Primary User Action
一眼看懂「这个 profile 怎么识别我的研发活动」,改三类内容的路径 + 技能映射,然后发布。

## 3. Design Direction
- **策略 Restrained**(product 默认)。沿用 DESIGN.md:深色终端底(`#0a0a0a` / surface `#101010` / panel `#14140b`),electric-volt `#faff69` 只给主操作 / 当前选中 / 校验状态;JetBrains Mono 给路径·code·技能名,Inter 给标签正文。
- **Scene**:工程师在一个开发周期结束后、坐在深色 IDE 旁,顺手来调"我的 SDD 工作流被识别得对不对",专注但不想读文档 → 深色、密、键盘友好。
- **Anchors**:Linear 设置页(克制、即时校验)、Raycast 偏好面板(分组紧凑)、GitHub repo Settings(分区块、危险操作隔离)。
- 不做卡片网格、不做装饰动画;复用现有 `Panel / Section / Field / RuleBox / DataTable / StatusBadge / EmptyState`。

## 4. Scope
Production-ready,**整页替换** `ProfileConfigAdminPage.tsx`。单 surface(左 profile 列表 + 右编辑器)。含:极简编辑器、技能映射区块、带注释高级视图、预览/草稿/发布(复用现有 mutations)。**附带**:删 `/profiles/inspector`(页 + 路由 + 侧边栏入口)。

## 5. Layout Strategy（核心:authoring / compiled 两层）
- **左**:profile 列表(沿用,瘦身)。
- **右编辑器**顶部一行 = 名称 + 状态 + 主操作(预览 / 保存草稿 / 发布)。下面**三块自然流**(非卡片网格):
  1. **内容地图** — 主来源只放两行:📚 知识库读取 / 📝 过程文档(需求·设计·任务)。💻 代码实施范围是补充观测,只有 Profile 已明确声明代码源时才显示;不把"除知识 / 文档外的其余路径"作为新配置入口。
  2. **技能映射** — 列表区块,每条 = `code · 显示名` 折叠头,展开后:显示名 / 描述 / 别名(多行) / 产物文件名(多行);底部 `[+ 新增语义]`。**字段与结构对齐旧 `/sdd/semantics`**。
  3. **高级(带注释)** — 默认折叠。展开 = 编译出的完整 `WorkflowProfileConfig`,但**每字段配一句中文说明 + 示例值**(非裸 JSON)。逃生口 + 透明度,不是日常入口。
- **关键架构**:简单视图编辑的是 **authoring 层**(内容来源 + 技能语义);保存时**编译**成完整 config(复用 `buildSddSkillConfig` + 新增 `buildContentSources`)。authoring 随 config 存(`config.authoring`),重新打开回填简单视图;高级视图展示编译产物。

## 6. Key States
- **default**:选中 profile,内容地图 + 技能映射填好。
- **empty / 新建**:空 authoring,占位示例(`/your-repo/wiki/`),教学式文案。
- **builtin(农小宝 / SDD)**:简单视图**只读**展示 authoring;点「编辑」= 从 builtin 派生草稿(复用现有 createFromCurrent / draft)。
- **loading**:骨架,非 spinner。
- **preview / validation**:发布前预览(校验 + 已解析规则数 + unresolved),沿用 `PreviewStat / IssueList`,**就近**落到对应区块旁报错。
- **warning**:别名为空(该语义不生成规则,黄字)/ 路径无法解析 / 投影零命中。
- **error**:就近 + 顶部。

## 7. Interaction Model
- 改路径 → 即时本地校验(空/明显错行内提示)→ 预览(若 test-match 已实现则跑真实 `source_references` 命中数)。
- 技能映射:折叠/展开每条;`[+ 新增]` 追加空白语义;删除二次确认(沿用旧 `SemanticForm` confirm 模式)。
- 高级视图:展开看编译产物 + 注释;可直接改 JSON(改后无法回填简单视图则提示"已脱离简单模式")。
- 发布:校验通过 + runtime configured 才可点(沿用 `canPublish`)。
- motion:150–250ms,只用于折叠展开 + 状态变化;`prefers-reduced-motion` 静止替代。

## 8. Content Requirements
- 区块标题:内容地图 / 技能映射 / 高级(JSON·带注释)。
- 内容行标签:知识库读取 / 过程文档(需求·设计·任务);代码实施范围仅在 Profile 已配置明确代码源时作为补充行显示。
- 字段注释(高级):每字段"它是什么 + 一个例子",如 `priority: 命中冲突时谁优先,越大越先,例 100`、`locatorStrategy: 从路径里怎么切出"交付单元",parent_dir=取父目录名`。
- 空状态:教学式 + 示例路径占位。
- 警告:别名为空 / 路径无法解析 / 投影零命中。

## 9. Recommended References
`interaction-design.md`(表单密集)、`layout.md`(区块节奏)、`clarify.md`(字段注释/错误文案)、`harden.md`(builtin/empty/error 边界)、`animate.md`(折叠动效,轻)。

## 10. Open Questions（已带默认,确认即可）
1. **authoring 落库**:推荐在 `WorkflowProfileConfig` 加可选 `authoring`(内容来源 + skillSemantics),简单视图读它、发布时编译成规则。替代(从规则反推,脆)→ 放弃。**默认:存 `authoring`**。→ 需 `packages/api` 小幅 schema 加法(向后无破坏:旧 config 无 authoring 时降级为"只读高级视图")。
2. **test-match 预览端点**(设计文档 §2.3)未实现:预览先用现有 validate + runtime,test-match 命中数作后续增强。**默认:先不依赖 test-match**。
3. **SDD 13 条内置语义**(现硬编码 `sdd-default.ts`):简单视图首版**只读展示**,可编辑走"派生草稿 → 发布"。**默认:builtin 只读 + 派生草稿可编辑**。

## 实现完成（2026-06-15）

确认后落地,**比简报更精简**:不加 `authoring` schema 字段,config 仍是唯一事实源,简单视图经
decode/encode 投影。三个 phase 全部 commit:

- **2a `1ae8c47`** — `config-authoring.ts` decode/encode 数据层 + 6 个 round-trip 测试
  (sdd-default 13 语义 / 农小宝无漂移 / catch-all 保留 / validate 全绿)。
- **2b `f08f438`** — 页面重做:`ContentMapSection`(内容地图)+ `SkillMappingSection`(技能映射,
  字段对齐旧 /sdd/semantics)+ `AdvancedConfigSection`(带注释字段表 + JSON 逃生口)+ `config-ui` +
  `field-docs`。747 行原始表单 → 围绕三大诉求的极简页。
- **3 `e7f8e5c`** — 下线 `/profiles/inspector`(页 + 路由 + 侧边栏「配置」组 + 孤儿 hook)。

口径不变:`projectionMode` 等机器概念沉到高级视图;skill 规则经 `buildSddSkillConfig` 重新生成。

## 口径收敛（2026-06-18）

`sdd-default` 不再使用"非知识库 / 非过程文档路径都算代码"的兜底来源,`codeChanges` 默认关闭。代码实施范围保留为补充观测能力,仅适用于像农小宝这类已明确声明代码源边界的 Profile。主配置项只要求知识库来源和过程文档来源,避免把用户本地 n 个无关仓库统计进核心看板。
web typecheck + build + 25 测试全绿,dev HMR 无错。**Open Question 1(authoring 落库)按更精简方案撤销。**

## 四项风险自检（实现阶段,先记下)
- **复用**:编译复用 `buildSddSkillConfig`;UI 复用现有 Panel/Section/Field/RuleBox。
- **抽象**:新增 `buildContentSources`(内容来源→sourceRules/deliveryUnitRules/artifactRules)+ `compileAuthoring`(authoring→完整 config),与 `buildSddSkillConfig` 同层。
- **破坏性**:`authoring` 为**可选**字段,旧 config / builtin 不带也能跑(降级只读高级视图)。API contract 加法不改现有字段。
- **影响**:消费方 = 配置页本身 + 投影编译;sdd-default.ts 后续可改为用 authoring 表达(非首版必须)。
