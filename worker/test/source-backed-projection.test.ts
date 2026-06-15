import { describe, expect, it } from 'vitest';
import {
  E2E_MONOREPO_PROFILE_ID,
  getProfileConfig,
  resolveRuntimeProfileConfig,
} from '@sdd-telemetry/api';
import {
  buildCodePlan,
  buildDeliveryPlan,
} from '../src/jobs/profile-projection/source-backed-operators';
import { matchSourceReference } from '../src/jobs/profile-projection/source-registry/matcher';
import type { SourceReferenceFact } from '../src/jobs/profile-projection/source-registry/types';

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
