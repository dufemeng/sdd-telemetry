import { Column, Entity, Index } from 'typeorm';
import { NullableDateColumn, TimestampedEntity, nullableLongTextColumn } from './common';

@Entity({ name: 'sdd_errors' })
@Index('uk_sdd_errors_error_key', ['errorKey'], { unique: true })
@Index('idx_sdd_errors_user_id', ['userId'])
@Index('idx_sdd_errors_batch_id', ['batchId'])
@Index('idx_sdd_errors_event_id', ['eventId'])
@Index('idx_sdd_errors_interaction_id', ['interactionId'])
@Index('idx_sdd_errors_usage_id', ['usageId'])
@Index('idx_sdd_errors_work_item_id', ['workItemId'])
@Index('idx_sdd_errors_error_type', ['errorType'])
@Index('idx_sdd_errors_severity', ['severity'])
@Index('idx_sdd_errors_error_message_hash', ['errorMessageHash'])
@Index('idx_sdd_errors_event_time', ['eventTime'])
export class SddErrorEntity extends TimestampedEntity {
  @Column({ name: 'error_key', type: 'char', length: 64 })
  errorKey!: string;

  @Column({ name: 'user_id', type: 'bigint', unsigned: true, nullable: true })
  userId!: string | null;

  @Column({ name: 'batch_id', type: 'bigint', unsigned: true, nullable: true })
  batchId!: string | null;

  @Column({ name: 'event_id', type: 'char', length: 64, nullable: true })
  eventId!: string | null;

  @Column({ name: 'interaction_id', type: 'bigint', unsigned: true, nullable: true })
  interactionId!: string | null;

  @Column({ name: 'usage_id', type: 'bigint', unsigned: true, nullable: true })
  usageId!: string | null;

  @Column({ name: 'work_item_id', type: 'bigint', unsigned: true, nullable: true })
  workItemId!: string | null;

  @Column({ name: 'error_type', type: 'varchar', length: 128 })
  errorType!: string;

  @Column({ name: 'severity', type: 'varchar', length: 32 })
  severity!: string;

  @Column({ name: 'source', type: 'varchar', length: 128, nullable: true })
  source!: string | null;

  @Column({ name: 'retryable', type: 'tinyint', width: 1, default: 0 })
  retryable!: boolean;

  @Column({ name: 'error_message_hash', type: 'char', length: 64, nullable: true })
  errorMessageHash!: string | null;

  @Column({ name: 'error_message', ...nullableLongTextColumn })
  errorMessage!: string | null;

  @Column({ name: 'stack_hash', type: 'char', length: 64, nullable: true })
  stackHash!: string | null;

  @Column({ name: 'stack_trace', ...nullableLongTextColumn })
  stackTrace!: string | null;

  @NullableDateColumn('event_time')
  eventTime!: Date | null;
}
