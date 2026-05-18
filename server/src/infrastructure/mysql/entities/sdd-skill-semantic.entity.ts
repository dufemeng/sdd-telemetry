import { Column, Entity, Index } from 'typeorm';
import { TimestampedEntity, nullableJsonColumn } from './common';

@Entity({ name: 'sdd_skill_semantics' })
@Index('uk_sdd_skill_semantics_code', ['semanticCode'], { unique: true })
export class SddSkillSemanticEntity extends TimestampedEntity {
  @Column({ name: 'semantic_code', type: 'varchar', length: 64 })
  semanticCode!: string;

  @Column({ name: 'display_name', type: 'varchar', length: 191 })
  displayName!: string;

  @Column({ name: 'description', type: 'varchar', length: 1000, nullable: true })
  description!: string | null;

  @Column({ name: 'artifact_filename_patterns', ...nullableJsonColumn })
  artifactFilenamePatterns!: string[] | null;
}
