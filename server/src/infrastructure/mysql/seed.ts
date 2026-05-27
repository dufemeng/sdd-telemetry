import { createAppDataSource } from './data-source';

interface SeedSemantic {
  semanticCode: string;
  displayName: string;
  description: string;
  aliases: string[];
  artifactFilenamePatterns: string[];
}

const seedSemantics: SeedSemantic[] = [
  {
    semanticCode: 'proposal',
    displayName: '技术提案',
    description: '围绕真实需求生成或迭代技术提案文档。',
    aliases: ['bk-fe:proposal', 'bk-fe-proposal'],
    artifactFilenamePatterns: ['proposal.md', 'proposal-*.md'],
  },
  {
    semanticCode: 'design',
    displayName: '系统分析',
    description: '基于提案和上下文生成系统设计、模块设计或专项设计。',
    aliases: ['bk-fe:design', 'bk-fe-desin', 'bk-fe-design'],
    artifactFilenamePatterns: ['design.md', 'design-*.md'],
  },
  {
    semanticCode: 'task',
    displayName: '需求拆分',
    description: '把设计方案拆解成可执行任务清单。',
    aliases: ['bk-fe:task', 'bk-fe-task'],
    artifactFilenamePatterns: ['tasks.md', 'tasks-*.md', 'task.md', 'task-*.md'],
  },
  {
    semanticCode: 'code',
    displayName: '编码实现',
    description: '根据任务和设计进行代码实现或代码修改。',
    aliases: ['bk-fe:code', 'bk-fe-code'],
    artifactFilenamePatterns: ['implementation.md', 'implementation-*.md', 'code.md', 'code-*.md'],
  },
  {
    semanticCode: 'codereview',
    displayName: 'Code Review',
    description: '对实现结果进行代码评审、风险识别和改进建议。',
    aliases: ['bk-fe:codereview', 'bk-fe-code-review', 'bk-fe:code_review'],
    artifactFilenamePatterns: [
      'codereview.md',
      'codereview-*.md',
      'code-review.md',
      'code-review-*.md',
      'review.md',
      'review-*.md',
    ],
  },
  {
    semanticCode: 'help',
    displayName: '帮助',
    description: '查询 SDD 工作流帮助、命令说明和使用建议。',
    aliases: ['bk-fe:help', 'bk-fe-help'],
    artifactFilenamePatterns: [],
  },
  {
    semanticCode: 'designreview',
    displayName: '设计审查',
    description: '以系统 owner 视角审查 design.md，5 维度评审（烟囱检测、模式一致、可维护性、跨域场景、上游完整性）。',
    aliases: [
      'bk-fe-design-review',
      'bk-fe:design-review',
      'bk-fe:designreview',
      'bk-fe:design_review',
      'bk-fe-designreview',
    ],
    artifactFilenamePatterns: [
      'design-review.md',
      'design-review-*.md',
      'designreview.md',
      'designreview-*.md',
      'design_review.md',
      'design_review-*.md',
    ],
  },
  {
    semanticCode: 'test',
    displayName: '测试验证',
    description: '跑测试+补覆盖+输出覆盖报告，前端额外执行 E2E。',
    aliases: ['bk-fe-test', 'bk-fe:test'],
    artifactFilenamePatterns: ['test.md', 'test-*.md'],
  },
  {
    semanticCode: 'legilimency',
    displayName: '知识回补',
    description: '从研发产物提取业务知识回补 Wiki，核心：去重、求真、提纯。',
    aliases: ['bk-fe-legilimency', 'bk-fe:legilimency', 'bk-fe:legilimeny', 'bk-fe-legilimeny'],
    artifactFilenamePatterns: [
      'legilimency.md',
      'legilimency-*.md',
      'legilimeny.md',
      'legilimeny-*.md',
    ],
  },
  {
    semanticCode: 'code-domain-wiki',
    displayName: 'Domain Wiki',
    description: '从 system 文档生成 Wiki 架构知识，覆盖 4 维度。',
    aliases: [
      'bk-fe-code-domain-wiki',
      'bk-fe:code-domain-wiki',
      'bk-fe:code_domain_wiki',
      'bk-fe-code_domain_wiki',
    ],
    artifactFilenamePatterns: [
      'code-domain-wiki.md',
      'code-domain-wiki-*.md',
      'code_domain_wiki.md',
      'code_domain_wiki-*.md',
    ],
  },
  {
    semanticCode: 'code-system-wiki',
    displayName: '系统 Wiki',
    description: '代码仓库分析生成 Wiki 系统文档，支持 React/MiniFish。',
    aliases: [
      'bk-fe-code-system-wiki',
      'bk-fe:code-system-wiki',
      'bk-fe:code_system_wiki',
      'bk-fe-code_system_wiki',
    ],
    artifactFilenamePatterns: [
      'code-system-wiki.md',
      'code-system-wiki-*.md',
      'code_system_wiki.md',
      'code_system_wiki-*.md',
      'deepwiki.md',
      'deepwiki-*.md',
    ],
  },
  {
    semanticCode: 'doctor',
    displayName: '诊断',
    description: '诊断 Skill 执行问题、trace 分析、定位根因。',
    aliases: ['bk-fe-doctor', 'bk-fe:doctor'],
    artifactFilenamePatterns: [],
  },
  {
    semanticCode: 'risk-learn',
    displayName: '事故复盘',
    description: '从复盘文档提取规则入库。',
    aliases: ['bk-fe-risk-learn', 'bk-fe:risk-learn', 'bk-fe:risk_learn', 'bk-fe-risk_learn'],
    artifactFilenamePatterns: [
      'risk-learn.md',
      'risk-learn-*.md',
      'risk_learn.md',
      'risk_learn-*.md',
    ],
  },
];

export async function seedDatabase(dataSource = createAppDataSource()): Promise<void> {
  const shouldOwnDataSource = !dataSource.isInitialized;
  if (shouldOwnDataSource) {
    await dataSource.initialize();
  }

  try {
    for (const semantic of seedSemantics) {
      await dataSource.query(
        `INSERT INTO sdd_skill_semantics
          (semantic_code, display_name, description, artifact_filename_patterns,
           gmt_create, gmt_modified)
        VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3))
        ON DUPLICATE KEY UPDATE
          display_name = VALUES(display_name),
          description = VALUES(description),
          artifact_filename_patterns = VALUES(artifact_filename_patterns),
          gmt_modified = CURRENT_TIMESTAMP(3)`,
        [
          semantic.semanticCode,
          semantic.displayName,
          semantic.description,
          JSON.stringify(semantic.artifactFilenamePatterns),
        ],
      );

      const rows = (await dataSource.query(
        'SELECT id FROM sdd_skill_semantics WHERE semantic_code = ? LIMIT 1',
        [semantic.semanticCode],
      )) as Array<{ id: string }>;
      const semanticId = rows[0]?.id;

      if (!semanticId) {
        throw new Error(`semantic seed failed: ${semantic.semanticCode}`);
      }

      for (const skillName of semantic.aliases) {
        await dataSource.query(
          `INSERT INTO sdd_skill_aliases
            (semantic_id, skill_name, gmt_create, gmt_modified)
          VALUES (?, ?, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3))
          ON DUPLICATE KEY UPDATE
            semantic_id = VALUES(semantic_id),
            gmt_modified = CURRENT_TIMESTAMP(3)`,
          [semanticId, skillName],
        );
      }
    }

  } finally {
    if (shouldOwnDataSource) {
      await dataSource.destroy();
    }
  }
}

async function main(): Promise<void> {
  const dataSource = createAppDataSource();
  await dataSource.initialize();

  try {
    await seedDatabase(dataSource);
  } finally {
    await dataSource.destroy();
  }

  console.info(`[sdd-telemetry] seeded ${seedSemantics.length} SDD semantics`);
}

if (require.main === module) {
  void main();
}
