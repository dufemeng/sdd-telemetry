import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Rubric } from '@sdd-telemetry/api';
import { createConnection, type Connection } from 'mysql2/promise';
import { EvalRubricService } from '../../src/modules/eval/eval-rubric.service';
import { EvalRubricRepository } from '../../src/modules/eval/eval-rubric.repository';
import { ProfileConfigRepository } from '../../src/modules/profiles/profile-config.repository';
import { MysqlDataSourceManager } from '../../src/infrastructure/mysql/data-source-manager';

const PROFILES = ['sdd-default', 'e2e-monorepo'] as const;

describe.skipIf(process.env.RUN_EVAL_INTEGRATION !== '1')('eval rubrics integration (real MySQL)', () => {
  let connection: Connection;
  let service: EvalRubricService;

  beforeAll(async () => {
    connection = await createConnection({
      host: process.env.MYSQL_HOST ?? '127.0.0.1',
      port: Number(process.env.MYSQL_PORT ?? 3306),
      user: process.env.MYSQL_USER ?? 'sdd-telemetry',
      password: process.env.MYSQL_PASSWORD ?? 'sdd-telemetry',
      database: process.env.MYSQL_DATABASE ?? 'sdd-telemetry',
    });
    await cleanupRows();

    const repository = new EvalRubricRepository();
    const profileConfigRepository = new ProfileConfigRepository();
    const manager = new MysqlDataSourceManager();
    repository.mysqlDataSourceManager = manager;
    profileConfigRepository.mysqlDataSourceManager = manager;
    service = new EvalRubricService();
    service.evalRubricRepository = repository;
    service.profileConfigRepository = profileConfigRepository;
  });

  afterAll(async () => {
    if (connection) {
      await cleanupRows();
      await connection.end();
    }
  });

  it('saves, publishes, activates, and isolates rubric versions by profile', async () => {
    const actor = { id: '1', role: 'super_admin' as const, username: 'integration' };
    const sddDraft = await service.saveDraft({
      profileId: PROFILES[0], artifactType: 'tasks', rubric: rubric('IT_SDD'), actor,
    });
    await service.publish(sddDraft.id, { profileId: PROFILES[0], actor });

    const e2eDraft = await service.saveDraft({
      profileId: PROFILES[1], artifactType: 'tasks', rubric: rubric('IT_E2E'), actor,
    });
    await service.publish(e2eDraft.id, { profileId: PROFILES[1], actor });

    const sddOverview = await service.getOverview(PROFILES[0], 'tasks');
    const e2eOverview = await service.getOverview(PROFILES[1], 'tasks');

    expect(sddOverview.active?.rubric.dimensions[0]?.code).toBe('IT_SDD');
    expect(e2eOverview.active?.rubric.dimensions[0]?.code).toBe('IT_E2E');
    expect(sddOverview.active?.profileId).toBe(PROFILES[0]);
    expect(e2eOverview.active?.profileId).toBe(PROFILES[1]);
    expect(sddOverview.draft).toBeNull();
    expect(e2eOverview.draft).toBeNull();
    expect(sddOverview.versions).toHaveLength(1);
    expect(e2eOverview.versions).toHaveLength(1);
  });

  async function cleanupRows(): Promise<void> {
    await connection.query(
      `DELETE FROM eval_rubric_versions WHERE artifact_type = 'tasks' AND profile_id IN (?, ?)`,
      [...PROFILES],
    );
  }
});

function rubric(code: string): Rubric {
  return {
    judge: { temperature: 0, evidenceRequired: true, context: 'intrinsic' },
    dimensions: [{
      code,
      name: '集成测试维度',
      weight: 1,
      anchors: { '0': '未满足', '1': '部分满足', '2': '完全满足' },
    }],
  };
}
