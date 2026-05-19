import { Provide } from '@midwayjs/core';
import type { CreateSddSemanticRequest, UpdateSddSemanticRequest } from '@sdd-telemetry/api';
import type { EntityManager } from 'typeorm';

export interface SemanticIdRow {
  id: string | number;
}

@Provide('sddWriteRepository')
export class SddWriteRepository {
  async upsertSemantic(manager: EntityManager, input: CreateSddSemanticRequest): Promise<void> {
    await manager.query(
      `INSERT INTO sdd_skill_semantics
        (semantic_code, display_name, description, artifact_filename_patterns,
         gmt_create, gmt_modified)
       VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3))
       ON DUPLICATE KEY UPDATE
         display_name = VALUES(display_name),
         description = VALUES(description),
         artifact_filename_patterns = VALUES(artifact_filename_patterns),
         gmt_modified = CURRENT_TIMESTAMP(3)`,
      [
        input.semanticCode,
        input.displayName,
        input.description ?? null,
        input.artifactFilenamePatterns === undefined
          ? null
          : JSON.stringify(input.artifactFilenamePatterns),
      ],
    );
  }

  async findSemanticIdByCode(
    manager: EntityManager,
    semanticCode: string,
  ): Promise<string | null> {
    const rows = (await manager.query(
      `SELECT id FROM sdd_skill_semantics WHERE semantic_code = ? LIMIT 1`,
      [semanticCode],
    )) as SemanticIdRow[];

    const semanticId = rows[0]?.id;
    return semanticId === undefined ? null : String(semanticId);
  }

  async upsertSemanticAlias(
    manager: EntityManager,
    semanticId: string,
    skillName: string,
  ): Promise<void> {
    await manager.query(
      `INSERT INTO sdd_skill_aliases
        (semantic_id, skill_name, gmt_create, gmt_modified)
       VALUES (?, ?, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3))
       ON DUPLICATE KEY UPDATE
         semantic_id = VALUES(semantic_id),
         gmt_modified = CURRENT_TIMESTAMP(3)`,
      [semanticId, skillName],
    );
  }

  async insertSemanticAlias(
    manager: EntityManager,
    semanticId: string,
    skillName: string,
  ): Promise<void> {
    await manager.query(
      `INSERT INTO sdd_skill_aliases
        (semantic_id, skill_name, gmt_create, gmt_modified)
       VALUES (?, ?, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3))`,
      [semanticId, skillName],
    );
  }

  async updateSemantic(
    manager: EntityManager,
    id: string,
    input: UpdateSddSemanticRequest,
  ): Promise<void> {
    await manager.query(
      `UPDATE sdd_skill_semantics
       SET display_name = ?,
           description = ?,
           artifact_filename_patterns = COALESCE(?, artifact_filename_patterns),
           gmt_modified = CURRENT_TIMESTAMP(3)
       WHERE id = ?`,
      [
        input.displayName,
        input.description ?? null,
        input.artifactFilenamePatterns === undefined
          ? null
          : JSON.stringify(input.artifactFilenamePatterns),
        id,
      ],
    );
  }

  async deleteSemanticAliases(manager: EntityManager, semanticId: string): Promise<void> {
    await manager.query(`DELETE FROM sdd_skill_aliases WHERE semantic_id = ?`, [semanticId]);
  }

  async deleteSemantic(manager: EntityManager, id: string): Promise<void> {
    await manager.query(`DELETE FROM sdd_skill_semantics WHERE id = ?`, [id]);
  }
}
