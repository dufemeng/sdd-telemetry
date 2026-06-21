import { describe, expect, it, vi } from 'vitest';
import { ProfilesService } from '../src/modules/profiles/profiles.service';

function createService() {
  const service = new ProfilesService();
  const projectionOverview = {
    activeUserCount: 1,
    capabilityUsageCount: 12,
    deliveryUnitCount: 1,
    artifactCount: 3,
    knowledgeRecallCount: 2,
    codeWriteCount: 2,
    codeReadCount: 0,
  };
  Object.assign(service, {
    profileProjectionRepository: {
      getCurrentRunId: vi.fn().mockResolvedValue(21),
      getOverview: vi.fn().mockResolvedValue(projectionOverview),
    },
  });

  return {
    service,
    projectionOverview,
    profileProjectionRepository: service.profileProjectionRepository as {
      getCurrentRunId: ReturnType<typeof vi.fn>;
      getOverview: ReturnType<typeof vi.fn>;
    },
  };
}

describe('ProfilesService read source selection', () => {
  it('reads every active profile from its current projection', async () => {
    const { service, projectionOverview, profileProjectionRepository } = createService();

    const overview = await service.getOverview('e2e-monorepo', {});

    expect(overview).toEqual(projectionOverview);
    expect(profileProjectionRepository.getCurrentRunId).toHaveBeenCalledWith('e2e-monorepo');
    expect(profileProjectionRepository.getOverview).toHaveBeenCalledWith('e2e-monorepo', 21, {});
  });

  it('does not special-case sdd-default', async () => {
    const { service, projectionOverview, profileProjectionRepository } = createService();

    const overview = await service.getOverview('sdd-default', {});

    expect(overview).toEqual(projectionOverview);
    expect(profileProjectionRepository.getCurrentRunId).toHaveBeenCalledWith('sdd-default');
    expect(profileProjectionRepository.getOverview).toHaveBeenCalledWith('sdd-default', 21, {});
  });
});
