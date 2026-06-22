import { describe, expect, it } from 'vitest';
import { ProfileProjectionRepository } from '../src/modules/profiles/profile-projection.repository';

describe('ProfileProjectionRepository execution snapshot', () => {
  it('joins one interaction into ordered verification evidence', async () => {
    const repository = new ProfileProjectionRepository();
    repository.mysqlDataSourceManager = {
      getDataSource: async () => ({
        query: async (sql: string, params: unknown[]) => {
          expect(params).toContain('42');
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
          if (sql.includes('FROM profile_error_events e')) {
            return [
              {
                id: 9,
                tool_call_id: 102,
                sequence: 4,
                tool_name: 'Read',
                error_type: 'file_not_found',
                message_preview: 'No such file',
                input_preview: '/wiki/dead.md',
                locator: '/wiki/dead.md',
                event_time: new Date('2026-06-21T10:00:04.000Z'),
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
          throw new Error(`unexpected query: ${sql}`);
        },
      }),
    } as ProfileProjectionRepository['mysqlDataSourceManager'];

    await expect(
      repository.getExecutionSnapshot('sdd-default', 1, '42', ['cap-other-skill']),
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
        failures: [expect.objectContaining({ toolCallId: '102', errorType: 'file_not_found' })],
      },
      fallbacks: [expect.objectContaining({ matchedRuleId: 'cap-other-skill' })],
      artifacts: [expect.objectContaining({ artifactLocator: 'docs/implementation.md' })],
      toolCalls: [
        expect.objectContaining({ id: '101', knowledgeStatus: 'accessed' }),
        expect.objectContaining({ id: '102', knowledgeStatus: 'failed' }),
      ],
      summary: {
        knowledgeAccessCount: 1,
        knowledgeFailureCount: 1,
        fallbackCount: 1,
        artifactWriteCount: 1,
        toolCallCount: 2,
      },
    });
  });
});
