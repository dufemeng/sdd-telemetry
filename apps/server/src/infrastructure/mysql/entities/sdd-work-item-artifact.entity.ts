import { Column, Entity, Index } from 'typeorm';
import { NullableDateColumn, TimestampedEntity } from './common';

@Entity({ name: 'sdd_work_item_artifacts' })
@Index('uk_sdd_work_item_artifacts_artifact_key', ['artifactKey'], { unique: true })
@Index('idx_sdd_work_item_artifacts_work_item_id', ['workItemId'])
@Index('idx_sdd_work_item_artifacts_artifact_type', ['artifactType'])
@Index('idx_sdd_work_item_artifacts_system_module', ['systemModule'])
export class SddWorkItemArtifactEntity extends TimestampedEntity {
  @Column({ name: 'artifact_key', type: 'char', length: 64 })
  artifactKey!: string;

  @Column({ name: 'work_item_id', type: 'bigint', unsigned: true })
  workItemId!: string;

  @Column({ name: 'artifact_type', type: 'varchar', length: 64 })
  artifactType!: string;

  @Column({ name: 'artifact_relative_path', type: 'varchar', length: 1024 })
  artifactRelativePath!: string;

  @Column({ name: 'artifact_full_path', type: 'varchar', length: 2048 })
  artifactFullPath!: string;

  @Column({ name: 'system_module', type: 'varchar', length: 191, nullable: true })
  systemModule!: string | null;

  @Column({ name: 'first_seen_event_id', type: 'char', length: 64, nullable: true })
  firstSeenEventId!: string | null;

  @NullableDateColumn('first_seen_at')
  firstSeenAt!: Date | null;

  @NullableDateColumn('last_seen_at')
  lastSeenAt!: Date | null;
}
