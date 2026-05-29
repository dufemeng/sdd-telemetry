import { Column, Entity, Index } from 'typeorm';
import { NullableDateColumn, TimestampedEntity } from './common';

@Entity({ name: 'sdd_work_item_artifact_writes' })
@Index('uk_artifact_write_key', ['writeKey'], { unique: true })
@Index('idx_artifact_writes_artifact_event_time', ['artifactId', 'eventTime'])
@Index('idx_artifact_writes_work_item_id', ['workItemId'])
@Index('idx_artifact_writes_interaction_id', ['interactionId'])
@Index('idx_artifact_writes_skill_usage_id', ['skillUsageId'])
export class SddWorkItemArtifactWriteEntity extends TimestampedEntity {
  @Column({ name: 'write_key', type: 'char', length: 64 })
  writeKey!: string;

  @Column({ name: 'artifact_id', type: 'bigint', unsigned: true })
  artifactId!: string;

  @Column({ name: 'work_item_id', type: 'bigint', unsigned: true })
  workItemId!: string;

  @Column({ name: 'interaction_id', type: 'bigint', unsigned: true, nullable: true })
  interactionId!: string | null;

  @Column({ name: 'skill_usage_id', type: 'bigint', unsigned: true, nullable: true })
  skillUsageId!: string | null;

  @Column({ name: 'user_id', type: 'bigint', unsigned: true, nullable: true })
  userId!: string | null;

  @Column({ name: 'session_id', type: 'varchar', length: 191, nullable: true })
  sessionId!: string | null;

  @Column({ name: 'prompt_id', type: 'varchar', length: 191, nullable: true })
  promptId!: string | null;

  @Column({ name: 'event_id', type: 'char', length: 64, nullable: true })
  eventId!: string | null;

  @Column({ name: 'write_kind', type: 'varchar', length: 32 })
  writeKind!: string;

  @Column({ name: 'content_preview', type: 'text', nullable: true })
  contentPreview!: string | null;

  @Column({ name: 'event_sequence', type: 'int', unsigned: true, nullable: true })
  eventSequence!: number | null;

  @NullableDateColumn('event_time')
  eventTime!: Date | null;

  @Column({ name: 'rule_version', type: 'varchar', length: 32 })
  ruleVersion!: string;
}
