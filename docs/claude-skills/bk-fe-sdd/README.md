# bk-fe SDD Claude Skills 草案

这组 skill 用于把日常 `superpower` 工作流拆成更贴近 SDD 规格驱动开发的 Claude Code skills。当前目录仅用于评审草案，不会被 Claude Code 自动加载。

| Skill | 中文名 | 典型产物 | 用途 |
| --- | --- | --- | --- |
| `bk-fe:proposal` | 技术提案 | `proposal.md` | 从模糊需求澄清目标、约束、方案和验收口径 |
| `bk-fe:design` | 系统分析 | `design.md` | 基于提案或明确目标做架构、模块、接口、数据和验证设计 |
| `bk-fe:task` | 需求拆分 | `tasks.md` | 把设计拆成可执行任务、验收点、测试命令和提交顺序 |
| `bk-fe:code` | 编码实现 | 代码改动、验证结果 | 按任务编码、修复、验证和整理交付说明 |
| `bk-fe:codereview` | Code Review | Review 结论 | 审查改动中的 bug、风险、回归和测试缺口 |
| `bk-fe:help` | 帮助 | 使用建议 | 解释 SDD 工作流、skill 区别和下一步选择 |

## 设计原则

- 默认中文沟通和产出，代码标识符、接口路径、字段名、日志事件名和必要技术术语保持原文。
- 每个 skill 对应一个清晰阶段，但工作流允许回退和跳步，例如编码后发现设计问题，可以重新进入 `bk-fe:proposal` 或 `bk-fe:design`。
- `bk-fe:proposal`、`bk-fe:design`、`bk-fe:task` 以分析和文档为主，不直接编码。
- `bk-fe:code` 才进入实现，要求先读代码和任务，再最小必要改动。
- `bk-fe:codereview` 默认采用审查视角，先列问题，再给总结。

## 建议触发顺序

```text
bk-fe:proposal -> bk-fe:design -> bk-fe:task -> bk-fe:code -> bk-fe:codereview
```

这个顺序不是强制流程。真实需求可以从任意阶段开始，关键是每次输出都要可追溯、可验证，并且能沉淀到需求文档库。
