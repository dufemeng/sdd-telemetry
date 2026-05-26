# Claude 协作规范

## 语言

- 回复用中文。用户正在学习中文。
- **git commit 消息也用中文**。包括 subject 和 body。

## 变更前四项风险自检

四项自检是动手前的风险门禁，不是每轮对话都要逐项汇报。Claude 应始终在心里检查，但只有命中下列场景时才需要在对话中显式说明结果：

- 新增或修改设计文档、任务清单、提案、实施记录等过程文档。
- 修改 API contract、数据库迁移、worker/outbox 语义、启动脚本、环境变量或跨端依赖方向。
- 修改共享组件、hook、util、service、schema、配置包等会影响多个调用方的代码。
- 单次改动跨多个模块，或可能改变用户路径、运行时行为、数据结构、类型边界。
- Claude 准备新增抽象、迁移目录、重命名公开字段 / 路由 / 包名。

未命中以上场景时，不要求显式输出四项分析；可以直接处理问题。低风险单文件改动可用一句话合并说明风险判断。

需要显式说明时，回答这四个问题。任何一项的答案都可能让你不写这段代码/方案、或者改变写法。

1. **复用分析**：将要写的代码或方案是否已经实现？能不能直接 import 或复用？
   - 例：写 fetch 包装前先看 `web/src/api/client.ts` 是否已有 `requestData<T>`
   - 例：设计新增一个 service 方法前，先 grep 确认 service 里是否已有等效实现
2. **抽象分析**：将要写的代码（或方案）在项目里是否出现过类似形态？grep 确认后，要不要先抽成一个 util/hook/组件/方法，再让多处复用？
   - 例：3 个 hook 都写了 `Number(timeRange.replace('h', ''))`，第 4 次出现时就该抽出 `timeRangeToHours` 函数
   - 警惕过早抽象：只出现 1 次时不要抽
3. **破坏性分析**：本次改动会不会破坏现有功能？
   - 类型层面：原来能编译的现在还能编译吗？
   - 运行时层面：原来正确的行为现在还正确吗？
   - 契约层面：API 响应结构有变化吗？前后端都升了吗？
4. **影响分析**：本次改动对哪些页面、哪些用户路径、哪些 API 调用方有影响？这个影响是否和目标对齐？
   - 改 hook 签名 → 列出所有调用点
   - 改组件 props → 列出所有消费方
   - 改 API → 列出所有前端消费方，确认行为变化符合预期

显式说明的结果应该在本次会话的对话里讲清楚，再动手；不需要写到代码注释里。除非用户要求详细展开，否则保持简短。

## Karpathy 行为准则（试用中，发现不合理再删）

来自 Andrej Karpathy 团队公开的 Cursor rules，作为「四项风险自检」之外的通用行为补充。和 Claude Code 系统 prompt、项目其他规则有部分重叠，但故意保留——试用期内观察是否真的改善 Claude 的行为；如果只是制造噪音或与既有规则冲突，再删除。

**总体倾向**：这套准则偏向「谨慎慢」而不是「快」。对琐碎任务自行判断，不必逐条机械执行。

### 1. 动手前先思考

不要假设、不要藏疑惑、把权衡摆出来。

- 假设要说出来；不确定就问。
- 用户请求有多种合理解读时，**列出来让用户选**，不要默默挑一种跑下去。
- 看到更简单的方案要直说；必要时主动 push back。
- 有不清楚的地方就停下，**点名是什么让你困惑**，再问。

### 2. 简洁优先

只写解决问题所需的最少代码。

- 不做未被请求的功能。
- 不为单次使用做抽象。
- 不为「将来可能要灵活/可配置」预留接口。
- 不为不可能发生的场景写错误处理。
- 写了 200 行才发现能 50 行搞定时，**重写**。
- 自问：「资深工程师会不会说这写得太复杂？」如果会，简化。

### 3. 手术刀式改动

只动必须动的；只清理自己制造的烂摊子。

编辑现有代码时：
- **不要「顺手改善」邻居代码、注释、格式**。
- **不要重构没坏的东西**。
- **匹配现有风格**，即使你会写得不一样。
- 发现无关的 dead code，**在对话里提一下，不要顺手删**。

改动产生孤儿时：
- 清理因本次改动而失去引用的 import / 变量 / 函数。
- 项目里原本就存在的死代码不要碰，除非用户要求。

判定标准：**每一行 diff 都能直接追溯到用户的请求**。

### 4. 目标驱动执行

把任务转化成可验证的目标，便于循环执行直到通过。

- 「加校验」→「写覆盖非法输入的测试，让它通过」
- 「修 bug」→「写复现 bug 的测试，让它通过」
- 「重构 X」→「确保重构前后测试都通过」

多步任务先列简要计划：

```
1. [步骤] → 验证：[检查]
2. [步骤] → 验证：[检查]
3. [步骤] → 验证：[检查]
```

强成功标准让 Claude 能独立循环；弱标准（「让它能用」）会反复要求澄清。

**这套准则起作用的信号**：diff 里无关改动变少、因过度复杂被推翻重写变少、澄清问题出现在动手之前而不是出错之后。

## 前端硬性约束（不是参考，是必须遵守）

1. **Vercel React 最佳实践** — 组件单一职责、feature-based 目录结构、自定义 hooks 分离数据层、懒加载、TypeScript 严格模式
2. **用户的架构设计方法论** — SOLID 原则（SRP/OCP/DIP）、Container/Presentational 分离、关注点分离、组合优于继承、避免过早抽象（AHA）
3. **消除不必要的硬编码** — 颜色/尺寸用 design token；魔法字符串提常量；表现规则不要写死在通用组件里（用 props 注入）

## 前端架构决策（已确认）

- **路由**：React Router v7，每个视图为独立路由，懒加载
- **CSS**：Tailwind CSS v4，design token 配置到主题，不写全局样式文件
- **目录命名**：顶层路由页面目录叫 `pages/`（不叫 `features/`）
- **数据层**：TanStack Query（已安装）
- **类型**：从 `packages/api` Zod contract 推导，不手写 API 类型

## 本地开发

- 默认 `pnpm dev` 起全部三个 app（watch 模式）；单服务用 `pnpm dev:web` / `dev:server` / `dev:worker`
- 强制重启用 `pnpm restart`（等价于 `pnpm stop && pnpm start`，pnpm 生命周期命令）；单服务用 `restart:web` / `restart:server` / `restart:worker`
- watch 模式下改 `src/` 自动生效；改 `.env` / `vite.config.ts` / `tsconfig.json` / 装依赖 / 进程崩 需手动重启
- 不要用 `node dist/`（start 脚本等价于 dev，不是编译产物）
- 离线 Docker 部署入口以 `README.md` 为准：默认发布版本使用上海时区时间戳；本地可用 `pnpm docker:publish` 一键打包单文件 deployment bundle 并上传 Release（底层仍为 `docker:package` + `docker:release`），无法访问 Release 时可将 bundle 经 IM / scp 转发，无 Docker 的中转机用 `pnpm docker:relay` 下载 Release bundle 并 scp，服务器用 `deploy/deploy-docker.sh`

## 过程文档存放规则（硬性约束）

所有过程文档——包括但不限于 bk-fe-design、bk-fe-task、bk-fe-proposal、Plan、ultrareview 等 skill 或工具产生的设计文档、实施文档、任务清单——**必须保存在当前项目的 `docs/` 目录下**。

- 禁止保存在 Claude 根目录（`~/.claude/` 或任何全局路径）
- 禁止只输出在对话里而不落盘
- 文件命名格式：`design-<topic>.md`、`tasks-<topic>.md`、`proposal-<topic>.md`

## 文档保鲜机制

- 目录结构、workspace glob、包名、启动脚本变化时，同步更新 `README.md`、`CLAUDE.md`、`AGENTS.md` 和相关 `docs/`。
- API contract、统一响应、数据库迁移、worker/outbox 语义变化时，同步更新 `docs/api-contract.md`、`docs/implementation-plan.md` 或对应专题文档。
- 提交前检查旧路径残留：

```bash
rg --hidden "ap""ps/(web|server|worker)|\\.\\/ap""ps/(web|server|worker)|ap""ps/" . -g '!node_modules/**' -g '!.git/**'
```

- 基础验证固定跑 `pnpm typecheck` 和 `pnpm build`；影响运行链路时补跑 `docker compose up -d mysql`、`pnpm db:migrate`、`pnpm db:seed`、`pnpm db:verify`、`pnpm --filter @sdd-telemetry/worker once` 和至少一个 HTTP health 请求。需要保留 raw payload 并重建事件层 / SDD 派生表时，使用 `pnpm db:reset-derived` 后再跑 worker once。
- Claude Code 客户端 OTel 推荐配置以 `README.md` 为准；当前服务只接 logs 通路 `/api/ingest/otlp-logs`，不要在无 traces ingest 的情况下要求开启 `OTEL_LOG_TOOL_CONTENT`。

## 后端验证

- 在 dev 模式下验证，不在 start 模式
- 构造可证伪查询：空集结果分不清"修好+无数据"和"未修好+错配"
- monorepo 构建边界：`pnpm --filter X build` 只 build X 包
