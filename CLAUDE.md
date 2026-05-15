# Claude 协作规范

## 语言

- 回复用中文。用户正在学习中文。
- **git commit 消息也用中文**。包括 subject 和 body。

## 前端硬性约束（不是参考，是必须遵守）

1. **Vercel React 最佳实践** — 组件单一职责、feature-based 目录结构、自定义 hooks 分离数据层、懒加载、TypeScript 严格模式
2. **用户的架构设计方法论** — SOLID 原则（SRP/OCP/DIP）、Container/Presentational 分离、关注点分离、组合优于继承、避免过早抽象（AHA）

## 前端架构决策（已确认）

- **路由**：React Router v7，每个视图为独立路由，懒加载
- **CSS**：Tailwind CSS v4，design token 配置到主题，不写全局样式文件
- **目录命名**：顶层路由页面目录叫 `pages/`（不叫 `features/`）
- **数据层**：TanStack Query（已安装）
- **类型**：从 `packages/api` Zod contract 推导，不手写 API 类型
