import { describe, expect, it } from 'vitest';
import {
  getProfileConfig,
  ONLINE_DOCS_PROFILE_ID,
  type ProfileConfigSnapshot,
  type WorkflowProfileConfig,
} from '@sdd-telemetry/api';
import { ProfileConfigAdminService } from '../src/modules/profiles/profile-config-admin.service';
import type { ProfileConfigRepository } from '../src/modules/profiles/profile-config.repository';

const actor = { id: 'u1', role: 'super_admin' as const, username: 'admin' };

function snapshotOf(config: WorkflowProfileConfig): ProfileConfigSnapshot {
  return {
    profileId: config.profileId,
    config,
    source: 'database',
    origin: 'custom',
    configVersionId: '1',
    versionNo: 1,
    definitionHash: 'hash',
    publishedAt: null,
  };
}

function makeService(opts: { existing?: ProfileConfigSnapshot | null } = {}) {
  let published: ProfileConfigSnapshot | null = opts.existing ?? null;
  const calls = { publish: 0 };
  const service = new ProfileConfigAdminService();
  service.profileConfigRepository = {
    getDraftProfileConfig: async () => null,
    getPublishedProfileConfig: async () => published,
    getServingProfileConfig: async () => null,
    listVersions: async () => [],
    listAdminSummaries: async () => [],
    listServingProfileConfigs: async () => [],
    publishProfileConfig: async (input: { config: WorkflowProfileConfig }) => {
      calls.publish += 1;
      published = snapshotOf(input.config);
      return published;
    },
  } as unknown as ProfileConfigRepository;
  return { service, calls };
}

describe('ProfileConfigAdminService.publish create guard', () => {
  it('rejects a new profile whose id collides with a builtin profile', async () => {
    const { service, calls } = makeService();
    const config = { ...getProfileConfig(ONLINE_DOCS_PROFILE_ID)!, displayName: '我的在线文档' };

    await expect(
      service.publish(ONLINE_DOCS_PROFILE_ID, { config, expectNew: true, force: true, actor }),
    ).rejects.toMatchObject({ code: 'PROFILE_ALREADY_EXISTS' });
    expect(calls.publish).toBe(0);
  });

  it('rejects a new profile whose id collides with an existing custom profile', async () => {
    const base = getProfileConfig(ONLINE_DOCS_PROFILE_ID)!;
    const existing = { ...base, profileId: 'acme-docs', displayName: '老的' };
    const { service, calls } = makeService({ existing: snapshotOf(existing) });
    const incoming = { ...base, profileId: 'acme-docs', displayName: '新的' };

    await expect(
      service.publish('acme-docs', { config: incoming, expectNew: true, force: true, actor }),
    ).rejects.toMatchObject({ code: 'PROFILE_ALREADY_EXISTS' });
    expect(calls.publish).toBe(0);
  });

  it('allows publishing a brand-new profile id with expectNew', async () => {
    const config = { ...getProfileConfig(ONLINE_DOCS_PROFILE_ID)!, profileId: 'my-new-docs', displayName: '新增文档' };
    const { service, calls } = makeService();

    const detail = await service.publish('my-new-docs', { config, expectNew: true, force: true, actor });

    expect(calls.publish).toBe(1);
    expect(detail.config.profileId).toBe('my-new-docs');
  });

  it('still updates an existing profile when expectNew is not set', async () => {
    const base = getProfileConfig(ONLINE_DOCS_PROFILE_ID)!;
    const existing = { ...base, profileId: 'acme-docs' };
    const { service, calls } = makeService({ existing: snapshotOf(existing) });

    await service.publish('acme-docs', { config: { ...existing, displayName: '改名了' }, force: true, actor });

    expect(calls.publish).toBe(1);
  });
});
