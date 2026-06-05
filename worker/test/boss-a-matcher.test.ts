import { describe, expect, it } from 'vitest';
import { BOSS_A_MONOREPO_PROFILE_ID, getProfileConfig } from '@sdd-telemetry/api';
import {
  matchBossASource,
  resolveBossARules,
} from '../src/jobs/profile-projection/boss-a-matcher';

const root = '/repo/acme-monorepo';
const config = getProfileConfig(BOSS_A_MONOREPO_PROFILE_ID)!;
const rules = resolveBossARules(config, { BOSS_A_MONOREPO_ROOT: root });

describe('Boss A local path matcher', () => {
  it('matches plan directory docs as process documents with delivery unit identity', () => {
    const match = matchBossASource(`${root}/plan/pay-order/design.md`, 'write', BOSS_A_MONOREPO_PROFILE_ID, rules);
    expect(match?.sourceCategory).toBe('process_doc');
    expect(match?.capabilityCode).toBe('plan-doc-update');
    expect(match?.deliveryUnit?.unitSlug).toBe('pay-order');
    expect(match?.deliveryUnit?.normalizedUnitLocator).toBe('plan/pay-order');
    expect(match?.artifact?.artifactType).toBe('design');
    expect(match?.artifact?.artifactLocator).toBe('plan/pay-order/design.md');
  });

  it('matches single-file plan docs as delivery units', () => {
    const match = matchBossASource(`${root}/plan/pay-order.md`, 'edit', BOSS_A_MONOREPO_PROFILE_ID, rules);
    expect(match?.deliveryUnit?.unitSlug).toBe('pay-order');
    expect(match?.deliveryUnit?.normalizedUnitLocator).toBe('plan/pay-order');
    expect(match?.artifact?.artifactType).toBe('plan');
  });

  it('matches domain/unit plan layout conservatively', () => {
    const match = matchBossASource(`${root}/plan/payment/pay-order/tasks.md`, 'write', BOSS_A_MONOREPO_PROFILE_ID, rules);
    expect(match?.deliveryUnit?.businessDomain).toBe('payment');
    expect(match?.deliveryUnit?.unitSlug).toBe('pay-order');
    expect(match?.deliveryUnit?.normalizedUnitLocator).toBe('plan/payment/pay-order');
    expect(match?.artifact?.artifactType).toBe('task');
  });

  it('matches docs reads as knowledge recalls', () => {
    const match = matchBossASource(`${root}/docs/payment/api.md`, 'read', BOSS_A_MONOREPO_PROFILE_ID, rules);
    expect(match?.sourceCategory).toBe('knowledge');
    expect(match?.capabilityCode).toBe('knowledge-recall');
    expect(match?.knowledge?.knowledgeDomain).toBe('payment');
    expect(match?.knowledge?.relativePath).toBe('docs/payment/api.md');
  });

  it('matches frontend code paths with repo and module', () => {
    const match = matchBossASource(`${root}/frontend_repo/cashier-web/src/App.tsx`, 'edit', BOSS_A_MONOREPO_PROFILE_ID, rules);
    expect(match?.sourceCategory).toBe('code');
    expect(match?.capabilityCode).toBe('frontend-code-change');
    expect(match?.code).toEqual({ repoKind: 'frontend', repoName: 'cashier-web', moduleName: 'src' });
  });

  it('matches backend code paths with repo and module', () => {
    const match = matchBossASource(`${root}/backend_repo/payment-service/src/main/java/App.java`, 'grep', BOSS_A_MONOREPO_PROFILE_ID, rules);
    expect(match?.sourceCategory).toBe('code');
    expect(match?.capabilityCode).toBe('backend-code-read');
    expect(match?.code).toEqual({ repoKind: 'backend', repoName: 'payment-service', moduleName: 'src' });
  });

  it('does not match paths outside configured roots', () => {
    const match = matchBossASource(`${root}/scripts/build.ts`, 'read', BOSS_A_MONOREPO_PROFILE_ID, rules);
    expect(match).toBeNull();
  });

  it('falls back to repo root name for code files directly under the repo root', () => {
    const match = matchBossASource(`${root}/frontend_repo/App.tsx`, 'edit', BOSS_A_MONOREPO_PROFILE_ID, rules);
    expect(match?.sourceCategory).toBe('code');
    expect(match?.code).toEqual({ repoKind: 'frontend', repoName: 'frontend_repo', moduleName: null });
  });

  it('does not mint a delivery unit for a bare plan directory locator', () => {
    const match = matchBossASource(`${root}/plan`, 'write', BOSS_A_MONOREPO_PROFILE_ID, rules);
    expect(match).toBeNull();
  });

  it('does not emit a knowledge recall for a bare docs directory locator', () => {
    const match = matchBossASource(`${root}/docs`, 'read', BOSS_A_MONOREPO_PROFILE_ID, rules);
    expect(match).toBeNull();
  });
});
