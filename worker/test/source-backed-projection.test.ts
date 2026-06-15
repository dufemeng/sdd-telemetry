import { describe, expect, it } from 'vitest';
import {
  E2E_MONOREPO_PROFILE_ID,
  getProfileConfig,
  resolveRuntimeProfileConfig,
} from '@sdd-telemetry/api';
import {
  buildCodePlan,
  buildDeliveryPlan,
  sourceBackedArtifactTurnOperator,
} from '../src/jobs/profile-projection/source-backed-operators';
import { matchSourceReference } from '../src/jobs/profile-projection/source-registry/matcher';
import type { SourceReferenceFact } from '../src/jobs/profile-projection/source-registry/types';
import type { ProjectionContext } from '../src/jobs/profile-projection/runner';

const ROOT = '/repo/acme';
const config = getProfileConfig(E2E_MONOREPO_PROFILE_ID)!;
const rules = resolveRuntimeProfileConfig(config, { E2E_MONOREPO_ROOT: ROOT }).rules;

function fact(over: Partial<SourceReferenceFact>): SourceReferenceFact {
  return {
    sourceReferenceId: 1,
    sourceReferenceKey: 'k1',
    toolCallId: null,
    interactionId: null,
    eventId: null,
    userId: null,
    sessionId: null,
    promptId: null,
    actionType: 'write',
    locatorType: 'path',
    normalizedLocator: null,
    eventTime: null,
    mcpServer: null,
    mcpToolName: null,
    docId: null,
    url: null,
    title: null,
    spaceId: null,
    collectionId: null,
    docType: null,
    ...over,
  };
}

describe('source-backed delivery parsing', () => {
  it('maps plan/<unit>/<doc>.md to plan/<unit>', () => {
    const match = matchSourceReference(fact({ normalizedLocator: `${ROOT}/docs/plan/pay-order/design.md` }), rules, E2E_MONOREPO_PROFILE_ID)!;
    const plan = buildDeliveryPlan(E2E_MONOREPO_PROFILE_ID, match, config);
    expect(plan?.unitSlug).toBe('pay-order');
    expect(plan?.businessDomain).toBeNull();
    expect(plan?.normalizedUnitLocator).toBe('plan/pay-order');
  });

  it('maps plan/<unit>.md to plan/<unit>', () => {
    const match = matchSourceReference(fact({ normalizedLocator: `${ROOT}/docs/plan/pay-order.md` }), rules, E2E_MONOREPO_PROFILE_ID)!;
    const plan = buildDeliveryPlan(E2E_MONOREPO_PROFILE_ID, match, config);
    expect(plan?.unitSlug).toBe('pay-order');
    expect(plan?.normalizedUnitLocator).toBe('plan/pay-order');
  });

  it('maps plan/<domain>/<unit>/<doc>.md to plan/<domain>/<unit>', () => {
    const match = matchSourceReference(fact({ normalizedLocator: `${ROOT}/docs/plan/payment/pay-order/tasks.md` }), rules, E2E_MONOREPO_PROFILE_ID)!;
    const plan = buildDeliveryPlan(E2E_MONOREPO_PROFILE_ID, match, config);
    expect(plan?.businessDomain).toBe('payment');
    expect(plan?.unitSlug).toBe('pay-order');
    expect(plan?.normalizedUnitLocator).toBe('plan/payment/pay-order');
  });
});

describe('source-backed code parsing', () => {
  it('uses first path segment as repoName for nested code files', () => {
    const match = matchSourceReference(
      fact({ actionType: 'edit', normalizedLocator: `${ROOT}/src/web/components/App.tsx` }),
      rules,
      E2E_MONOREPO_PROFILE_ID,
    )!;
    const code = buildCodePlan(match);
    expect(code).toEqual({
      repoName: 'web',
      moduleName: 'components',
      codeLocator: 'src/web/components/App.tsx',
    });
  });

  it('does not classify files outside configured implementation globs as code', () => {
    const match = matchSourceReference(
      fact({ actionType: 'edit', normalizedLocator: `${ROOT}/package.json` }),
      rules,
      E2E_MONOREPO_PROFILE_ID,
    );
    expect(match).toBeNull();
  });

  it('does not classify process docs as implementation code even when code root is the monorepo root', () => {
    const match = matchSourceReference(
      fact({ actionType: 'write', normalizedLocator: `${ROOT}/docs/plan/pay-order/design.md` }),
      rules,
      E2E_MONOREPO_PROFILE_ID,
    )!;
    expect(match.category).toBe('process_doc');
    expect(match.ruleId).toBe('e2e-plan-process-doc');
  });
});

describe('source-backed artifact turns', () => {
  it('deduplicates duplicate write rows that produce the same discussion turn', async () => {
    const insertedTurnKeys = new Set<string>();
    const writeTime = new Date('2026-06-11T06:13:49.751Z');
    const turnTime = new Date('2026-06-11T06:13:38.141Z');
    const queries: string[] = [];
    const pool = {
      query: async (sql: string, params: unknown[] = []) => {
        queries.push(sql);
        if (sql.includes('FROM profile_artifact_writes w') && sql.includes('JOIN profile_artifacts a')) {
          return [[
            {
              write_id: 1,
              artifact_id: 10,
              artifact_key: 'artifact-a',
              delivery_unit_id: 20,
              interaction_id: 30,
              user_id: 40,
              session_id: 'session-a',
              event_time: writeTime,
              matched_rule_id: 'process-doc',
              confidence: 'high',
            },
            {
              write_id: 2,
              artifact_id: 10,
              artifact_key: 'artifact-a',
              delivery_unit_id: 20,
              interaction_id: 30,
              user_id: 40,
              session_id: 'session-a',
              event_time: writeTime,
              matched_rule_id: 'process-doc',
              confidence: 'high',
            },
          ], undefined];
        }
        if (sql.includes('FROM sdd_interactions i')) {
          return [[{
            interaction_id: 31,
            started_at: turnTime,
            anchor_event_time: turnTime,
          }], undefined];
        }
        if (sql.includes('FROM profile_capability_usages')) {
          return [[], undefined];
        }
        if (sql.includes('INSERT INTO profile_artifact_turns')) {
          const key = String(params[2]);
          if (insertedTurnKeys.has(key)) {
            throw new Error(`duplicate turn key: ${key}`);
          }
          insertedTurnKeys.add(key);
          return [{ affectedRows: 1 }, undefined];
        }
        throw new Error(`unexpected query: ${sql}`);
      },
    };

    const stats = await sourceBackedArtifactTurnOperator.run({
      pool,
      profileId: E2E_MONOREPO_PROFILE_ID,
      profileConfig: config,
      profileConfigVersionId: '1',
      projectionRunId: 1,
      logger: console,
      registry: { capabilityUsageBySkillUsageId: new Map(), deliveryUnitByWorkItemId: new Map(), artifactByArtifactId: new Map() },
    } as unknown as ProjectionContext);

    expect(stats).toEqual({ source: 2, projected: 1, skipped: 1 });
    expect(insertedTurnKeys.size).toBe(1);
    expect(queries.filter((sql) => sql.includes('INSERT INTO profile_artifact_turns'))).toHaveLength(1);
  });
});
