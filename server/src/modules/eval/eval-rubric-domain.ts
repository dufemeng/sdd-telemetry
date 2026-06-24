import { createHash } from 'node:crypto';
import type { EvalArtifactType, Rubric } from '@sdd-telemetry/api';

/**
 * 内置默认评分标准 (D1-D5 等)。仅作为 profile 尚无 rubric 时的"从默认初始化"模板,
 * 不是运行时唯一真相——一旦管理员保存/发布,以 DB 版本为准。
 * design 取自 docs/design-eval-system.md 的承重示例; proposal/tasks 按五主题骨架实例化。
 */
const DESIGN_RUBRIC: Rubric = {
  judge: { temperature: 0, evidenceRequired: true, context: 'intrinsic' },
  dimensions: [
    {
      code: 'D1',
      name: '覆盖',
      weight: 1,
      anchors: {
        '0': '缺多个承重环节或只剩标题',
        '1': '有结构但部分空泛 / 缺 1-2 承重项',
        '2': '承重环节(数据/API/状态流/错误处理/兼容迁移)都在且有实质内容',
      },
    },
    {
      code: 'D2',
      name: '可落地',
      weight: 1,
      anchors: {
        '0': '泛泛而谈无法实施',
        '1': '方向对但关键处停在"待定/示意"',
        '2': '关键路径具体到字段/接口/边界,可直接被 bk-fe:task 拆',
      },
    },
    {
      code: 'D3',
      name: '取舍',
      weight: 1,
      anchors: {
        '0': '只有结论无理由',
        '1': '部分决策有理由',
        '2': '关键取舍都有备选 + 放弃原因',
      },
    },
    {
      code: 'D4',
      name: '克制',
      weight: 1,
      anchors: {
        '0': '明显过度抽象 / 造轮子 / 预留无用扩展',
        '1': '基本克制但有个别过度设计',
        '2': '明显复用现有架构且克制,无 YAGNI 违例',
      },
    },
    {
      code: 'D5',
      name: '一致',
      weight: 1,
      anchors: {
        '0': '自相矛盾或漏关键开放问题',
        '1': '个别不一致',
        '2': '自洽 + 待确认问题明确',
      },
    },
  ],
};

const PROPOSAL_RUBRIC: Rubric = {
  judge: { temperature: 0, evidenceRequired: true, context: 'intrinsic' },
  dimensions: [
    {
      code: 'P1',
      name: '方案选项与取舍',
      weight: 1,
      anchors: {
        '0': '只有一个方案或无取舍',
        '1': '有多方案但取舍含糊',
        '2': '2-3 个可选方案且 tradeoff 讲清',
      },
    },
    {
      code: 'P2',
      name: '目标边界',
      weight: 1,
      anchors: {
        '0': '目标/非目标都不清',
        '1': '目标清但非目标缺失',
        '2': '目标与非目标都明确、范围收住',
      },
    },
    {
      code: 'P3',
      name: '验收可验证',
      weight: 1,
      anchors: {
        '0': '验收/风险空泛不可追踪',
        '1': '部分验收点可验证',
        '2': '每个验收点和风险都可追踪/可验证',
      },
    },
    {
      code: 'P4',
      name: '衔接一致',
      weight: 1,
      anchors: {
        '0': '结论自相矛盾、无法进入设计',
        '1': '基本自洽但衔接不顺',
        '2': '自洽且结论能被 design 直接使用',
      },
    },
  ],
};

const TASKS_RUBRIC: Rubric = {
  judge: { temperature: 0, evidenceRequired: true, context: 'intrinsic' },
  dimensions: [
    {
      code: 'T1',
      name: '颗粒度具体',
      weight: 1,
      anchors: {
        '0': '泛化任务如"实现接口",无文件/输入输出',
        '1': '部分任务具体',
        '2': '每个任务有目标、涉及文件、输入输出',
      },
    },
    {
      code: 'T2',
      name: '验收可执行',
      weight: 1,
      anchors: {
        '0': '验收空泛、不可运行',
        '1': '部分验收可执行',
        '2': '验收含可运行命令/页面检查点/数据 SQL',
      },
    },
    {
      code: 'T3',
      name: '依赖与排序',
      weight: 1,
      anchors: {
        '0': '无序、强依赖未标注',
        '1': '大致有序但依赖不全',
        '2': '按依赖排序(先基础/契约)、强依赖明确',
      },
    },
    {
      code: 'T4',
      name: '优先级与 MVP 切分',
      weight: 1,
      anchors: {
        '0': 'MVP 与增强混在一起、无优先级',
        '1': '有优先级但 MVP 边界模糊',
        '2': 'P0/P1/P2 或 Milestone 清晰、MVP 与增强分开',
      },
    },
  ],
};

const BUILTIN_RUBRICS: Record<EvalArtifactType, Rubric> = {
  design: DESIGN_RUBRIC,
  proposal: PROPOSAL_RUBRIC,
  tasks: TASKS_RUBRIC,
};

export function builtinRubric(artifactType: EvalArtifactType): Rubric {
  return BUILTIN_RUBRICS[artifactType];
}

/**
 * rubric 内容指纹,用于复现/比较。对同一逻辑 rubric 稳定:
 * 维度顺序、judge 设置都参与 hash(顺序是展示语义的一部分,不排序)。
 */
export function computeRubricHash(rubric: Rubric): string {
  return createHash('sha256').update(JSON.stringify(rubric)).digest('hex');
}

/** 满分 = 各维度 weight * 2 之和(供 UI 展示量纲,不强制 0-10)。 */
export function rubricMaxScore(rubric: Rubric): number {
  return rubric.dimensions.reduce((sum, d) => sum + d.weight * 2, 0);
}
