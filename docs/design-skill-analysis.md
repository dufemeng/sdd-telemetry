# 技能分析看板重构设计

## 背景

现有「技能分析」页面沿用了开发视角：直接展示 capability 调用量、调用趋势、配对率、Top capability 和 raw capability 列表。它能说明清洗链路有数据，但不能直接回答老板关心的问题。

本次重构把该页面统一定位为「技能分析」：观察 profile 下被归类为技能的行为是否被真实使用、是否覆盖交付单元、是否有明确的业务明细。内部 API 和投影表仍使用 capability 作为通用模型，但所有 profile 面向老板统一展示为「技能」。

## 产品目标

老板视角需要回答四个问题：

1. 技能有没有被用起来。
2. 哪些技能在支撑核心流程。
3. 技能调用是否能关联到需求。
4. 技能体系配置有没有缺口。

页面不负责证明技能带来了产出，也不负责排查 OTel 采集链路。因果不清晰的指标不放主视觉。

## 展示口径

### 主页面指标

- 技能调用量：时间范围内进入 `profile_capability_usages` 的 skill/capability usage 数。
- 使用技能人数：同一时间范围内 distinct `user_id`。
- 关联需求数：usage 上存在 `delivery_unit_id` 的 distinct 需求数。该指标只表达关联，不表达贡献或转化。
- 待纳入体系：尚未进入技能语义体系的 raw skill 调用数。这是配置缺口，不是核心技能分类。
- 用户触发 / 自动触发：来自 `trigger_source`，展示用户主动使用和自动触发的结构。

### 主体列表

主列表按语义聚合：

- 所有 profile：按 `capability_code/display_name` 聚合为「技能」。
- 配置缺口项独立展示，不混入核心技能分布。

列表字段：

- 技能语义 / 能力名称
- 调用量
- 使用人数
- 关联需求数
- raw 别名数
- 用户触发 / 自动触发
- 最近调用

### 配置缺口列表

配置缺口列表按 raw skill 聚合，展示：

- 原始技能名
- 调用量
- 使用人数
- 关联需求数
- 最近调用

这部分是配置行动项，用于发现团队已经在使用、但还没有进入当前 profile 技能体系的 raw skill。页面文案不使用兜底业务分类，避免把配置缺口包装成业务技能。

### 二级页面

点击主列表进入二级页面：

- 语义技能详情：按 `capabilityCode` 过滤，展示 raw 别名、调用证据、关联需求和触发来源。
- 配置缺口详情：按 `rawCapabilityName` 过滤，展示具体调用、用户、关联需求和触发来源。

二级页使用页面承接，不使用抽屉。抽屉适合快速扫一条记录，不适合承载老板看板的语义钻取。

## 清洗边界

### 对象定义

- 原始技能：OTel 上报的 raw skill name，写入 `source_references.normalized_locator` 和 `profile_capability_usages.raw_capability_name`。
- 语义技能：profile `capabilityRules` 映射后的 `capability_code/display_name`。
- 配置缺口：没有语义命中，或命中 profile 配置声明为 fallback 的 capability rule。

### 配置约束

所有业务边界必须来自 profile 配置：

- skill 识别来自 `sourceRules(locatorType='skill')`。
- semantic 映射来自 `capabilityRules`。
- fallback 不能靠页面硬编码 `other-skill`，需要由 capability rule 的配置字段声明。

### 不展示的主模块

- 有效配对率：这是采集状态，不是技能质量，不放在技能分析主页面。
- 转化率：不使用该名称。最多展示「调用占比」。
- 多阶段需求：不作为主指标，避免暗示技能导致需求成熟。
- 调用趋势：本次不作为主模块。当前用户量级不大，趋势价值低，占据空间。
- source evidence：属于清洗链路排障，不在老板二级页直接展示。二级页保留最近调用、用户、关联需求和调用链路 ID 作为证据。

## 实施方案

1. 扩展 profile config：为 `CapabilityRule` 增加 `surfaceRole`，支持 `core` 和 `fallback`。
2. 扩展 capability usage summary API：
   - 新增 `groupBy=raw|capability`。
   - 返回 `rawCapabilityCount`、`rawCapabilityNames`、`userTriggeredCount`、`autoTriggeredCount`、`failedCount`、`surfaceRole`。
3. 重构技能分析主页面：
   - 顶部改成判断句和四个核心指标。
   - 主表改为语义聚合。
   - 增加配置缺口列表。
   - 移除采集质量模块。
4. 新增技能详情二级页：
   - 支持 `capabilityCode` 和 `rawCapabilityName` 两种入口。
   - 展示 raw 别名、关联需求、触发结构和最近调用证据。

## 验收标准

- 所有 profile 下导航和页面标题展示「技能分析」。
- 主列表按语义技能聚合，不按 raw skill 拆散。
- 配置缺口不依赖硬编码业务名称。
- 二级页面能查看语义技能或 raw 技能的具体调用证据。
- `pnpm typecheck` 和 `pnpm build` 通过。
