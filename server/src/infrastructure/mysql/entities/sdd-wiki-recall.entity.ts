import { Column, Entity, Index } from 'typeorm';
import { TimestampedEntity } from './common';

@Entity({ name: 'sdd_wiki_recalls' })
@Index('uk_recall_key', ['recallKey'], { unique: true })
@Index('idx_recalls_tool_call_id', ['toolCallId'])
@Index('idx_recalls_interaction_id', ['interactionId'])
@Index('idx_recalls_skill_usage_id', ['skillUsageId'])
@Index('idx_recalls_work_item_id', ['workItemId'])
@Index('idx_recalls_user_event_time', ['userId', 'eventTime'])
@Index('idx_recalls_relative_path', ['wikiRelativePath'])
@Index('idx_recalls_domain', ['wikiDomain'])
@Index('idx_recalls_axis', ['wikiAxis'])
@Index('idx_recalls_system', ['wikiSystem'])
@Index('idx_recalls_action_type', ['actionType'])
@Index('idx_recalls_event_time', ['eventTime'])
export class SddWikiRecallEntity extends TimestampedEntity {
  @Column({ name: 'recall_key', type: 'char', length: 64 })
  recallKey!: string;

  @Column({ name: 'tool_call_id', type: 'bigint', unsigned: true })
  toolCallId!: string;

  @Column({ name: 'interaction_id', type: 'bigint', unsigned: true })
  interactionId!: string;

  @Column({ name: 'skill_usage_id', type: 'bigint', unsigned: true, nullable: true })
  skillUsageId!: string | null;

  @Column({ name: 'work_item_id', type: 'bigint', unsigned: true, nullable: true })
  workItemId!: string | null;

  @Column({ name: 'user_id', type: 'bigint', unsigned: true, nullable: true })
  userId!: string | null;

  @Column({ name: 'action_type', type: 'varchar', length: 32 })
  actionType!: string;

  @Column({ name: 'raw_path', type: 'varchar', length: 2048 })
  rawPath!: string;

  @Column({ name: 'wiki_relative_path', type: 'varchar', length: 1024, nullable: true })
  wikiRelativePath!: string | null;

  @Column({ name: 'wiki_domain', type: 'varchar', length: 191, nullable: true })
  wikiDomain!: string | null;

  @Column({ name: 'wiki_axis', type: 'varchar', length: 64, nullable: true })
  wikiAxis!: string | null;

  @Column({ name: 'wiki_system', type: 'varchar', length: 191, nullable: true })
  wikiSystem!: string | null;

  @Column({ name: 'event_id', type: 'char', length: 64, nullable: true })
  eventId!: string | null;

  @Column({ name: 'event_sequence', type: 'int', unsigned: true, nullable: true })
  eventSequence!: number | null;

  @Column({ name: 'event_time', type: 'datetime', precision: 3, nullable: true })
  eventTime!: Date | null;

  @Column({ name: 'rule_version', type: 'varchar', length: 32 })
  ruleVersion!: string;
}
