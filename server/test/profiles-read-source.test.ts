import { describe, expect, it, vi } from 'vitest';
import { ProfilesService } from '../src/modules/profiles/profiles.service';

function createService(readSource: 'legacy_sdd' | 'profile_projection') {
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
  const sddOverview = {
    activeUserCount: 9,
    skillUsageCount: 8,
    coveredWorkItemCount: 7,
    generatedDocumentCount: 6,
  };

  Object.assign(service, {
    profileDashboard: { readSource },
    profileProjectionRepository: {
      getCurrentRunId: vi.fn().mockResolvedValue(21),
      getOverview: vi.fn().mockResolvedValue(projectionOverview),
    },
    sddQueryService: {
      getOverview: vi.fn().mockResolvedValue(sddOverview),
    },
  });

  return {
    service,
    projectionOverview,
    sddOverview,
    profileProjectionRepository: service.profileProjectionRepository as {
      getCurrentRunId: ReturnType<typeof vi.fn>;
      getOverview: ReturnType<typeof vi.fn>;
    },
    sddQueryService: service.sddQueryService as {
      getOverview: ReturnType<typeof vi.fn>;
    },
  };
}

describe('ProfilesService read source selection', () => {
  it('reads source-backed profiles from profile projection even when global read source is legacy', async () => {
    const { service, projectionOverview, profileProjectionRepository, sddQueryService } =
      createService('legacy_sdd');

    const overview = await service.getOverview('e2e-monorepo', {});

    expect(overview).toEqual(projectionOverview);
    expect(profileProjectionRepository.getCurrentRunId).toHaveBeenCalledWith('e2e-monorepo');
    expect(profileProjectionRepository.getOverview).toHaveBeenCalledWith('e2e-monorepo', 21, {});
    expect(sddQueryService.getOverview).not.toHaveBeenCalled();
  });

  it('keeps sdd-default on legacy SDD when global read source is legacy', async () => {
    const { service, profileProjectionRepository, sddQueryService } = createService('legacy_sdd');

    const overview = await service.getOverview('sdd-default', {});

    expect(overview).toEqual({
      activeUserCount: 9,
      capabilityUsageCount: 8,
      deliveryUnitCount: 7,
      artifactCount: 6,
      knowledgeRecallCount: 0,
      codeWriteCount: 0,
      codeReadCount: 0,
    });
    expect(profileProjectionRepository.getCurrentRunId).not.toHaveBeenCalled();
    expect(profileProjectionRepository.getOverview).not.toHaveBeenCalled();
    expect(sddQueryService.getOverview).toHaveBeenCalledWith({});
  });
});
