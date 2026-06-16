/** 高级视图字段注释:每个字段「是什么 + 一个例子」,给愿意看底层规则的人。 */
export interface FieldDoc {
  desc: string;
  example: string;
}

export const CONFIG_FIELD_DOCS: Record<string, FieldDoc> = {
  profileId: { desc: 'API / URL 用的稳定 ID,中性可见,发布后不改', example: 'sdd-default' },
  displayName: { desc: '页面上展示的名字', example: 'SDD 默认工作流' },
  status: { desc: 'active 才作为正式入口;disabled 用于保留未验证样例', example: 'active' },
  projectionMode: {
    desc: 'worker 用哪套投影算子。source_backed = 通用引擎(从 source_references 重建);sdd_bridge = 旧 sdd_* 桥接',
    example: 'source_backed',
  },
  manifest: { desc: '看板能力开关,决定前端哪些 widget 显示 / 降级', example: 'capabilityUsage, deliveryUnits, artifacts …' },
  sourceRules: { desc: '识别「这条记录是知识库 / 过程文档 / 代码 / 技能」的规则。简单视图的内容地图 + 技能映射就编译成这些', example: '13 条技能 + 知识 + 文档 + 代码' },
  deliveryUnitRules: { desc: '从过程文档路径里切出「需求 / 交付单元」的规则', example: 'parent_dir(取父目录名)' },
  artifactRules: { desc: '把过程文档写入归类成产物(proposal / design / task …)', example: 'design.md → design' },
  capabilityRules: { desc: 'source + 动作 → 一个能力统计项。看板按 capabilityCode 聚合', example: 'skill-design + invoke → design' },
  errorRules: { desc: '失败事件如何进入异常看板。业务归类复用 sourceRules,这里只管分类 / 展示 / 降噪', example: 'knowledge + tool_call → 知识库读取失败' },
  attributionPolicy: { desc: '知识 / 代码事实归因到哪个需求的策略(同 interaction 优先,其次同 session 时间窗)', example: '同会话 120 分钟窗' },
  presentation: { desc: '前端展示降级:工作流类型、阶段顺序、隐藏哪些指标', example: 'workflowKind: sdd' },
};

/** sourceRule 内部字段注释。 */
export const SOURCE_RULE_FIELD_DOCS: Record<string, FieldDoc> = {
  ruleId: { desc: '稳定机器 ID,写进 evidence,改名影响可追溯', example: 'skill-design' },
  locatorType: { desc: '匹配维度:path 路径 / url 网址 / mcp_doc / skill 技能名', example: 'path' },
  category: { desc: '业务类别:process_doc 过程文档 / knowledge 知识 / code 代码 / skill 技能', example: 'knowledge' },
  priority: { desc: '多条规则同时命中时谁优先,数字越大越先', example: '100' },
  confidence: { desc: '可信度;核心 KPI 只采纳 high', example: 'high' },
  pathContains: { desc: '路径里包含这些子串就命中(模糊匹配,适合多用户绝对路径不一致)', example: '/nxb-mono-repo/wiki/' },
  pathRegexes: { desc: '路径正则匹配,适合结构不固定但有模式', example: '.+' },
  userRootKey: { desc: '按用户上报根解析:root 取自每个用户的 wiki / requirements 列', example: 'wiki' },
  excludeUserRootKeys: { desc: '排除落在这些用户根里的路径(代码=非文档)', example: 'wiki, requirements' },
  excludeGlobs: { desc: '排除这些路径(通配符,* 匹配任意)', example: '*.md, dist/**, node_modules/**' },
  skillNames: { desc: '匹配的技能名(含别名),对应 source_reference 的 skill_name', example: 'bk-fe-design, bk-fe:design' },
  actions: { desc: '允许命中的工具动作', example: 'read, write, edit / invoke' },
};
