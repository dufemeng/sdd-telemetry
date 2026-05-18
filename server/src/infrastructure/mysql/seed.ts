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
    aliases: ['bk-fe:code'],
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
