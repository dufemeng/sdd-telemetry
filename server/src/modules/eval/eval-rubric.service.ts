import { Inject, Provide } from '@midwayjs/core';
import {
  RubricSchema,
  type AuthSessionUser,
  type EvalArtifactType,
  type Rubric,
  type RubricOverviewResponse,
  type RubricVersion,
} from '@sdd-telemetry/api';
import { ApiHttpError } from '../../common/auth/api-http-error';
import { ProfileConfigRepository } from '../profiles/profile-config.repository';
import { builtinRubric, computeRubricHash } from './eval-rubric-domain';
import { EvalRubricRepository, type RubricVersionRow } from './eval-rubric.repository';

@Provide('evalRubricService')
export class EvalRubricService {
  @Inject('evalRubricRepository')
  evalRubricRepository!: EvalRubricRepository;

  @Inject('profileConfigRepository')
  profileConfigRepository!: ProfileConfigRepository;

  async getOverview(profileId: string, artifactType: EvalArtifactType): Promise<RubricOverviewResponse> {
    await this.requireEvaluationProfile(profileId);
    const [active, draft, versions] = await Promise.all([
      this.evalRubricRepository.getActiveVersion(profileId, artifactType),
      this.evalRubricRepository.getDraftVersion(profileId, artifactType),
      this.evalRubricRepository.listVersions(profileId, artifactType),
    ]);
    return {
      profileId,
      artifactType,
      active: active ? toVersionContract(active) : null,
      draft: draft ? toVersionContract(draft) : null,
      versions: versions.map((v) => ({
        id: v.id,
        versionNo: v.versionNo,
        versionStatus: v.versionStatus,
        definitionHash: v.definitionHash,
        publishedAt: v.publishedAt,
        gmtModified: v.gmtModified ?? new Date().toISOString(),
      })),
      builtinDefault: builtinRubric(artifactType),
    };
  }

  async saveDraft(input: {
    profileId: string;
    artifactType: EvalArtifactType;
    rubric: Rubric;
    actor: AuthSessionUser;
  }): Promise<{ id: string; versionNo: number; versionStatus: 'draft' }> {
    await this.requireEvaluationProfile(input.profileId);
    const rubricJson = JSON.stringify(input.rubric);
    const definitionHash = computeRubricHash(input.rubric);
    const result = await this.evalRubricRepository.runInTransaction((manager) =>
      this.evalRubricRepository.saveDraftInTransaction(manager, {
        profileId: input.profileId,
        artifactType: input.artifactType,
        rubricJson,
        definitionHash,
        createdBy: input.actor.id ?? null,
      }),
    );
    return { id: result.id, versionNo: result.versionNo, versionStatus: 'draft' };
  }

  async publish(id: string, input: { profileId: string; actor: AuthSessionUser }): Promise<{
    id: string;
    versionNo: number;
    versionStatus: 'published';
  }> {
    const result = await this.evalRubricRepository.runInTransaction((manager) =>
      this.evalRubricRepository.publishInTransaction(manager, { id, profileId: input.profileId }),
    );
    if (result.status === 'missing') {
      throw new ApiHttpError(404, 'EVAL_RUBRIC_NOT_FOUND', `rubric version not found: ${id}`);
    }
    if (result.status === 'not_draft') {
      throw new ApiHttpError(409, 'EVAL_RUBRIC_NOT_DRAFT', 'only a draft version can be published');
    }
    return { id, versionNo: result.versionNo, versionStatus: 'published' };
  }

  private async requireEvaluationProfile(profileId: string): Promise<void> {
    const snapshot = await this.profileConfigRepository.getServingProfileConfig(profileId);
    if (!snapshot || !snapshot.config.manifest.evaluation) {
      throw new ApiHttpError(409, 'EVAL_PROFILE_NOT_ENABLED', `evaluation not enabled for ${profileId}`);
    }
  }
}

function toVersionContract(row: RubricVersionRow): RubricVersion {
  return {
    id: row.id,
    versionNo: row.versionNo,
    versionStatus: row.versionStatus,
    definitionHash: row.definitionHash,
    publishedAt: row.publishedAt,
    gmtModified: row.gmtModified ?? new Date().toISOString(),
    profileId: row.profileId,
    artifactType: row.artifactType as EvalArtifactType,
    rubric: RubricSchema.parse(row.rubricJson),
  };
}
