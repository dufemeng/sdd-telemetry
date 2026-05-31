import { Column, Entity, Index } from 'typeorm';
import { NullableDateColumn, TimestampedEntity } from './common';

@Entity({ name: 'sdd_work_item_artifact_turns' })
@Index('uk_artifact_turn_key', ['turnKey'], { unique: true })
@Index('idx_artifact_turns_artifact_event_time', ['artifactId', 'eventTime'])
@Index('idx_artifact_turns_work_item_id', ['workItemId'])
@Index('idx_artifact_turns_interaction_id', ['interactionId'])
export class SddWorkItemArtifactTurnEntity extends TimestampedEntity {
  @Column({ name: 'turn_key', type: 'char', length: 64 })
  turnKey!: string;

  @Column({ name: 'artifact_id', type: 'bigint', unsigned: true })
  artifactId!: string;

  @Column({ name: 'work_item_id', type: 'bigint', unsigned: true })
  workItemId!: string;

  @Column({ name: 'interaction_id', type: 'bigint', unsigned: true })
  interactionId!: string;

  @Column({ name: 'skill_usage_id', type: 'bigint', unsigned: true, nullable: true })
  skillUsageId!: string | null;

  @Column({ name: 'user_id', type: 'bigint', unsigned: true, nullable: true })
  userId!: string | null;

  @Column({ name: 'session_id', type: 'varchar', length: 191, nullable: true })
  sessionId!: string | null;

  @NullableDateColumn('anchor_event_time')
  anchorEventTime!: Date | null;

  @NullableDateColumn('write_event_time')
  writeEventTime!: Date | null;

  @NullableDateColumn('event_time')
  eventTime!: Date | null;

  @Column({ name: 'rule_version', type: 'varchar', length: 32 })
  ruleVersion!: string;
}
