import { Column, Entity, Index } from 'typeorm';
import { NullableDateColumn, TimestampedEntity } from './common';

@Entity({ name: 'sdd_skill_usages' })
@Index('uk_sdd_skill_usages_usage_key', ['usageKey'], { unique: true })
@Index('idx_sdd_skill_usages_semantic_id', ['semanticId'])
@Index('idx_sdd_skill_usages_interaction_id', ['interactionId'])
@Index('idx_sdd_skill_usages_work_item_id', ['workItemId'])
@Index('idx_sdd_skill_usages_user_id', ['userId'])
@Index('idx_sdd_skill_usages_session_id', ['sessionId'])
@Index('idx_sdd_skill_usages_prompt_id', ['promptId'])
@Index('idx_sdd_skill_usages_raw_skill_name', ['rawSkillName'])
@Index('idx_sdd_skill_usages_service_version', ['serviceVersion'])
@Index('idx_sdd_skill_usages_observed_version', ['observedVersion'])
@Index('idx_sdd_skill_usages_event_time', ['eventTime'])
export class SddSkillUsageEntity extends TimestampedEntity {
  @Column({ name: 'usage_key', type: 'char', length: 64 })
  usageKey!: string;

  @Column({ name: 'semantic_id', type: 'bigint', unsigned: true, nullable: true })
  semanticId!: string | null;

  @Column({ name: 'alias_id', type: 'bigint', unsigned: true, nullable: true })
  aliasId!: string | null;

  @Column({ name: 'interaction_id', type: 'bigint', unsigned: true, nullable: true })
  interactionId!: string | null;

  @Column({ name: 'work_item_id', type: 'bigint', unsigned: true, nullable: true })
  workItemId!: string | null;

  @Column({ name: 'user_id', type: 'bigint', unsigned: true, nullable: true })
  userId!: string | null;

  @Column({ name: 'session_id', type: 'varchar', length: 191, nullable: true })
  sessionId!: string | null;

  @Column({ name: 'prompt_id', type: 'varchar', length: 191, nullable: true })
  promptId!: string | null;

  @Column({ name: 'raw_skill_name', type: 'varchar', length: 191 })
  rawSkillName!: string;

  @Column({ name: 'skill_source', type: 'varchar', length: 191, nullable: true })
  skillSource!: string | null;

  @Column({ name: 'invocation_trigger', type: 'varchar', length: 191, nullable: true })
  invocationTrigger!: string | null;

  @Column({ name: 'command_name', type: 'varchar', length: 191, nullable: true })
  commandName!: string | null;

  @Column({ name: 'service_version', type: 'varchar', length: 64, nullable: true })
  serviceVersion!: string | null;

  @Column({ name: 'observed_version', type: 'varchar', length: 64, nullable: true })
  observedVersion!: string | null;

  @Column({ name: 'matched_by', type: 'varchar', length: 64 })
  matchedBy!: string;

  @Column({ name: 'rule_version', type: 'varchar', length: 32 })
  ruleVersion!: string;

  @Column({ name: 'event_sequence', type: 'int', unsigned: true, nullable: true })
  eventSequence!: number | null;

  @Column({ name: 'status', type: 'varchar', length: 32 })
  status!: string;

  @NullableDateColumn('event_time')
  eventTime!: Date | null;
}
