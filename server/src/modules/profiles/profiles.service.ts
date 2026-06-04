import { Config, Inject, Provide } from '@midwayjs/core';
import type {
  ProfileCapabilityManifest,
  ProfileDemand,
  ProfileOverview,
  ProfileOverviewQuery,
  ProfileSummary,
} from '@sdd-telemetry/api';
import { ApiHttpError } from '../../common/auth/api-http-error';
import { SddQueryService } from '../sdd/sdd-query.service';
import {
  getProfileConfig,
  listProfileConfigs,
  type WorkflowProfileConfig,
} from './profile-config';
import { ProfileProjectionRepository } from './profile-projection.repository';

type ReadSource = 'legacy_sdd' | 'profile_projection';

@Provide('profilesService')
export class ProfilesService {
  @Inject('sddQueryService')
  sddQueryService!: SddQueryService;

  @Inject('profileProjectionRepository')
  profileProjectionRepository!: ProfileProjectionRepository;

  @Config('profileDashboard')
  profileDashboard!: { readSource: ReadSource };

  listProfiles(): ProfileSummary[] {
    return listProfileConfigs().map(toSummary);
  }

  getManifest(profileId: string): ProfileCapabilityManifest {
    return this.requireProfile(profileId).manifest;
  }

  /**
   * 读源策略（Task 17）：
   * - profile_projection：从 profile_* current run 读（含真实 knowledgeRecallCount）。
   *   无 current pointer 时自动回退 legacy，保证不破。
   * - legacy_sdd：复用 SddQueryService.getOverview，把 SDD 口径映射到通用 contract。
   */
  async getOverview(
    profileId: string,
    query: ProfileOverviewQuery,
  ): Promise<ProfileOverview> {
    this.requireProfile(profileId);

    if (this.profileDashboard.readSource === 'profile_projection') {
      const runId = await this.profileProjectionRepository.getCurrentRunId(profileId);
      if (runId != null) {
        return this.profileProjectionRepository.getOverview(profileId, runId, query);
      }
      // 无 current pointer：回退 legacy。
    }

    const sdd = await this.sddQueryService.getOverview(query);
    return {
      activeUserCount: sdd.activeUserCount,
      capabilityUsageCount: sdd.skillUsageCount,
      deliveryUnitCount: sdd.coveredWorkItemCount,
      artifactCount: sdd.generatedDocumentCount,
      knowledgeRecallCount: 0,
      codeWriteCount: 0,
      codeReadCount: 0,
    };
  }

  /**
   * 产出分析列表（Task 20）。profile_projection 有 current pointer 时读 projection，
   * 否则回退 legacy（sdd work items 映射成 delivery unit）。
   */
  async listDemands(
    profileId: string,
    query: ProfileOverviewQuery,
  ): Promise<ProfileDemand[]> {
    this.requireProfile(profileId);

    if (this.profileDashboard.readSource === 'profile_projection') {
      const runId = await this.profileProjectionRepository.getCurrentRunId(profileId);
      if (runId != null) {
        return this.profileProjectionRepository.listDemands(profileId, runId, query);
      }
    }

    const workItems = await this.sddQueryService.listWorkItems({ ...query, limit: 500 });
    return workItems.map((w) => ({
      id: w.id,
      deliveryUnitKey: w.workItemKey,
      businessDomain: w.businessDomain,
      unitSlug: w.workItemSlug,
      title: w.workItemTitle,
      locator: w.relativeDir,
      firstSeenAt: w.firstSeenAt,
      lastSeenAt: w.lastSeenAt,
      artifactCount: w.artifactCount,
      capabilityUsageCount: w.usageCount,
      errorCount: w.errorCount,
      coverageStages: w.coverageStages,
    }));
  }

  private requireProfile(profileId: string): WorkflowProfileConfig {
    const config = getProfileConfig(profileId);
    if (!config) {
      throw new ApiHttpError(404, 'PROFILE_NOT_FOUND', `profile not found: ${profileId}`);
    }
    return config;
  }
}

function toSummary(config: WorkflowProfileConfig): ProfileSummary {
  return {
    profileId: config.profileId,
    displayName: config.displayName,
    status: config.status,
    manifest: config.manifest,
  };
}
