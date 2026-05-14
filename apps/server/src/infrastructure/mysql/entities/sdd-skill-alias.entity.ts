import { Column, Entity, Index } from 'typeorm';
import { TimestampedEntity } from './common';

@Entity({ name: 'sdd_skill_aliases' })
@Index('uk_sdd_skill_aliases_skill_name', ['skillName'], { unique: true })
@Index('idx_sdd_skill_aliases_semantic_id', ['semanticId'])
export class SddSkillAliasEntity extends TimestampedEntity {
  @Column({ name: 'semantic_id', type: 'bigint', unsigned: true })
  semanticId!: string;

  @Column({ name: 'skill_name', type: 'varchar', length: 191 })
  skillName!: string;
}
