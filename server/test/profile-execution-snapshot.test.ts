import { describe, expect, it } from 'vitest';
import { ProfileProjectionRepository } from '../src/modules/profiles/profile-projection.repository';

describe('ProfileProjectionRepository execution snapshot', () => {
  it('joins one interaction into ordered verification evidence', async () => {
    const repository = new ProfileProjectionRepository();
    repository.mysqlDataSourceManager = {
      getDataSource: async () => ({
        query: async (sql: string, params: unknown[]) => {
          // run 元信息查询按 runId 取数，不含 interactionId
          if (!sql.includes('profile_projection_runs')) {
            expect(params).toContain('42');
          }
          if (sql.includes('FROM sdd_interactions i')) {
            return [
              {
                id: 42,
                status: 'success',
                user_id: 2762,
                session_id: 'session-1',
                prompt_id: 'prompt-1',
                command_name: 'bk-fe-sdd-core',
                model: 'claude',
                skill_name: 'bk-fe-sdd-core',
                started_at: new Date('2026-06-21T10:00:00.000Z'),
                completed_at: new Date('2026-06-21T10:01:00.000Z'),
                duration_ms: 60_000,
                prompt_text: '验证知识库迁移',
                response_text: '完成',
              },
            ];
          }
          if (sql.includes('FROM sdd_skill_usages su')) {
            return [
              {
                id: 7,
                raw_skill_name: 'bk-fe-sdd-core',
                semantic_code: 'code',
                display_name: '编码实现',
                status: 'success',
                observed_version: '1.3.0',
                event_time: new Date('2026-06-21T10:00:01.000Z'),
              },
            ];
          }
          if (sql.includes('FROM profile_knowledge_recalls kr')) {
            return [
              {
                id: 8,
                tool_call_id: 101,
                sequence: 3,
                action_type: 'read',
                source_namespace: 'trade',
                relative_path: 'domain-cashier/system/apps/transfer-h5/innerFlow/转入到活期.md',
                event_time: new Date('2026-06-21T10:00:03.000Z'),
              },
            ];
          }
          if (sql.includes("FROM profile_error_events e") && sql.includes("knowledge_read_failed")) {
            return [
              {
                id: 9,
                tool_call_id: 102,
                sequence: 4,
                tool_name: 'Read',
                error_type: 'not_found',
                message_preview: 'no such file',
                input_preview: '/wiki/dead.md',
                locator: '/wiki/dead.md',
                event_time: new Date('2026-06-21T10:00:04.000Z'),
              },
            ];
          }
          if (sql.includes("FROM profile_error_events e") && sql.includes("model_or_api_failed")) {
            return [
              {
                id: 20,
                error_type: 'api_error',
                message_preview: 'upstream timeout',
                event_time: new Date('2026-06-21T10:00:07.000Z'),
              },
            ];
          }
          if (sql.includes('FROM profile_capability_usages cu')) {
            expect(params).toContain('cap-other-skill');
            return [
              {
                id: 10,
                capability_code: 'other-skill',
                display_name: '未纳入体系',
                raw_capability_name: 'legacy-skill',
                matched_rule_id: 'cap-other-skill',
                event_time: new Date('2026-06-21T10:00:05.000Z'),
              },
            ];
          }
          if (sql.includes('FROM profile_artifact_writes w')) {
            return [
              {
                write_id: 11,
                artifact_id: 12,
                artifact_type: 'implementation',
                artifact_locator: 'docs/implementation.md',
                write_kind: 'write',
                content_preview: '# implementation',
                event_time: new Date('2026-06-21T10:00:06.000Z'),
              },
            ];
          }
          if (sql.includes('FROM sdd_interaction_tool_calls tc')) {
            return [
              {
                id: 101,
                tool_use_id: 'tool-1',
                skill_usage_id: 7,
                tool_name: 'Read',
                sequence: 3,
                decision: 'allow',
                success: 1,
                duration_ms: 10,
                result_size_bytes: 100,
                error_type: null,
                tool_input_preview: '/wiki/ok.md',
              },
              {
                id: 102,
                tool_use_id: 'tool-2',
                skill_usage_id: 7,
                tool_name: 'Read',
                sequence: 4,
                decision: 'allow',
                success: 0,
                duration_ms: 5,
                result_size_bytes: 0,
                error_type: 'file_not_found',
                tool_input_preview: '/wiki/dead.md',
              },
            ];
          }
          if (sql.includes('FROM profile_projection_runs')) {
            return [{ completed_at: new Date('2026-06-21T10:05:00.000Z') }];
          }
          throw new Error(`unexpected query: ${sql}`);
        },
      }),
    } as ProfileProjectionRepository['mysqlDataSourceManager'];

    const knowledgeReasonGroups = [
      {
        reasonCode: 'file_missing',
        displayName: '文件不存在',
        description: '本地知识库文件被移动、删除或路径无法解析。',
        matchErrorTypes: ['file_missing', 'ENOENT', 'not_found'],
        messageIncludes: ['文件不存在', 'not found', 'no such file'],
      },
      {
        reasonCode: 'other_knowledge_error',
        displayName: '其他知识库异常',
        description: '已确认属于知识库读取失败，但不在已配置原因组内。',
        isFallback: true,
      },
    ];

    await expect(
      repository.getExecutionSnapshot(
        'sdd-default',
        1,
        '42',
        ['cap-other-skill'],
        knowledgeReasonGroups,
      ),
    ).resolves.toMatchObject({
      interaction: { id: '42', userId: '2762' },
      skills: [{ rawSkillName: 'bk-fe-sdd-core', observedVersion: '1.3.0' }],
      knowledge: {
        accesses: [
          expect.objectContaining({
            toolCallId: '101',
            relativePath: 'domain-cashier/system/apps/transfer-h5/innerFlow/转入到活期.md',
          }),
        ],
        failures: [
          expect.objectContaining({
            toolCallId: '102',
            errorType: 'not_found',
            reasonCode: 'file_missing',
            reasonLabel: '文件不存在',
          }),
        ],
      },
      fallbacks: [expect.objectContaining({ matchedRuleId: 'cap-other-skill' })],
      artifacts: [expect.objectContaining({ artifactLocator: 'docs/implementation.md' })],
      apiErrors: [expect.objectContaining({ errorType: 'api_error' })],
      projection: { ready: true },
      toolCalls: [
        expect.objectContaining({ id: '101', knowledgeStatus: 'accessed' }),
        expect.objectContaining({ id: '102', knowledgeStatus: 'failed' }),
      ],
      summary: {
        knowledgeAccessCount: 1,
        knowledgeFailureCount: 1,
        fallbackCount: 1,
        artifactWriteCount: 1,
        apiErrorCount: 1,
        toolCallCount: 2,
      },
    });
  });

  it('marks projection not ready when the interaction starts after the serving run completed', async () => {
    const repository = new ProfileProjectionRepository();
    repository.mysqlDataSourceManager = {
      getDataSource: async () => ({
        query: async (sql: string) => {
          if (sql.includes('FROM sdd_interactions i')) {
            return [
              {
                id: 99,
                status: 'success',
                user_id: 1,
                started_at: new Date('2026-06-21T12:00:00.000Z'),
                completed_at: null,
              },
            ];
          }
          if (sql.includes('FROM profile_projection_runs')) {
            return [{ completed_at: new Date('2026-06-21T10:00:00.000Z') }];
          }
          return [];
        },
      }),
    } as ProfileProjectionRepository['mysqlDataSourceManager'];

    const snapshot = await repository.getExecutionSnapshot('sdd-default', 1, '99', [], []);
    expect(snapshot?.projection.ready).toBe(false);
    expect(snapshot?.knowledge.accesses).toEqual([]);
    expect(snapshot?.summary.knowledgeAccessCount).toBe(0);
  });
});
