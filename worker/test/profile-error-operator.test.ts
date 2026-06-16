import { describe, expect, it } from 'vitest';
import {
  E2E_MONOREPO_PROFILE_ID,
  getProfileConfig,
} from '@sdd-telemetry/api';
import { profileErrorOperator } from '../src/jobs/profile-projection/error-operator';
import type { ProjectionContext } from '../src/jobs/profile-projection/runner';

const config = getProfileConfig(E2E_MONOREPO_PROFILE_ID)!;

describe('profileErrorOperator', () => {
  it('projects matched business tool failures, unmatched tool failures, and same-interaction model errors', async () => {
    const insertedCategories: string[] = [];
    const insertedSourceKinds: string[] = [];
    const pool = {
      query: async (sql: string, params: unknown[] = []) => {
        if (sql.includes('FROM (') && sql.includes('profile_capability_usages')) {
          return [[{
            interaction_id: 10,
            delivery_unit_id: 20,
            capability_usage_id: 30,
          }], undefined];
        }
        if (sql.includes('FROM sdd_interaction_tool_calls')) {
          return [[
            {
              tool_call_id: 1,
              interaction_id: 10,
              skill_usage_id: null,
              tool_use_id: 'toolu-1',
              tool_name: 'Read',
              success: 0,
              error_type: 'File does not exist',
              tool_input_preview: '{"file_path":"/repo/acme/wiki/pay.md"}',
              mcp_server_scope: null,
              tool_evidence_json: null,
              interaction_user_id: 100,
              interaction_session_id: 's1',
              interaction_prompt_id: 'p1',
              interaction_started_at: new Date('2026-06-01T00:00:00Z'),
              source_reference_id: 1000,
              source_reference_key: 'sr-knowledge',
              source_event_id: 'event-1',
              source_user_id: 100,
              source_session_id: 's1',
              source_prompt_id: 'p1',
              source_event_time: new Date('2026-06-01T00:01:00Z'),
              source_normalized_locator: '/repo/acme/wiki/pay.md',
              matched_rule_id: 'e2e-knowledge-docs',
              match_category: 'knowledge',
              match_action_type: 'read',
              match_locator_type: 'path',
              match_normalized_locator: 'wiki/pay.md',
              relative_locator: 'wiki/pay.md',
              resource_id: null,
              source_namespace: 'wiki',
              confidence: 'high',
              match_metadata_json: null,
            },
            {
              tool_call_id: 2,
              interaction_id: 10,
              skill_usage_id: null,
              tool_use_id: 'toolu-2',
              tool_name: 'Bash',
              success: 0,
              error_type: 'ShellError',
              tool_input_preview: 'pnpm test',
              mcp_server_scope: null,
              tool_evidence_json: null,
              interaction_user_id: 100,
              interaction_session_id: 's1',
              interaction_prompt_id: 'p1',
              interaction_started_at: new Date('2026-06-01T00:02:00Z'),
              source_reference_id: null,
              source_reference_key: null,
              source_event_id: null,
              source_user_id: null,
              source_session_id: null,
              source_prompt_id: null,
              source_event_time: null,
              source_normalized_locator: null,
              matched_rule_id: null,
              match_category: null,
              match_action_type: null,
              match_locator_type: null,
              match_normalized_locator: null,
              relative_locator: null,
              resource_id: null,
              source_namespace: null,
              confidence: null,
              match_metadata_json: null,
            },
          ], undefined];
        }
        if (sql.includes('FROM sdd_errors')) {
          return [[{
            sdd_error_id: 3,
            error_key: 'err-3',
            user_id: 100,
            event_id: 'event-3',
            interaction_id: 10,
            usage_id: null,
            work_item_id: null,
            error_type: 'api_error',
            severity: 'ERROR',
            source: 'client',
            retryable: 0,
            error_message_hash: 'hash',
            error_message: 'upstream failed',
            stack_hash: null,
            stack_trace: null,
            event_time: new Date('2026-06-01T00:03:00Z'),
          }], undefined];
        }
        if (sql.includes('INSERT INTO profile_error_events')) {
          insertedCategories.push(String(params[3]));
          insertedSourceKinds.push(String(params[6]));
          return [{ affectedRows: 1 }, undefined];
        }
        throw new Error(`unexpected query: ${sql}`);
      },
    };

    const stats = await profileErrorOperator.run({
      pool,
      profileId: E2E_MONOREPO_PROFILE_ID,
      profileConfig: config,
      profileConfigVersionId: '1',
      projectionRunId: 1,
      logger: console,
      registry: { capabilityUsageBySkillUsageId: new Map(), deliveryUnitByWorkItemId: new Map(), artifactByArtifactId: new Map() },
    } as unknown as ProjectionContext);

    expect(stats).toEqual({ toolFailures: 2, modelErrors: 1, projected: 3, skipped: 0 });
    expect(insertedCategories).toEqual([
      'knowledge_read_failed',
      'tool_execution_failed',
      'model_or_api_failed',
    ]);
    expect(insertedSourceKinds).toEqual(['tool_call', 'tool_call', 'sdd_error']);
  });
});
