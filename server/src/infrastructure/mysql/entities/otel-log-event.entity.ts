import { Column, Entity, Index } from 'typeorm';
import {
  NullableDateColumn,
  TimestampedEntity,
  nullableJsonColumn,
  nullableLongTextColumn,
} from './common';

@Entity({ name: 'otel_log_events' })
@Index('uk_otel_log_events_event_id', ['eventId'], { unique: true })
@Index('idx_otel_log_events_batch_id', ['batchId'])
@Index('idx_otel_log_events_user_id', ['userId'])
@Index('idx_otel_log_events_session_id', ['sessionId'])
@Index('idx_otel_log_events_prompt_id', ['promptId'])
@Index('idx_otel_log_events_event_name', ['eventName'])
@Index('idx_otel_log_events_service_version', ['serviceVersion'])
@Index('idx_otel_log_events_event_time', ['eventTime'])
@Index('idx_otel_log_events_expires_at', ['expiresAt'])
export class OtelLogEventEntity extends TimestampedEntity {
  @Column({ name: 'event_id', type: 'char', length: 64 })
  eventId!: string;

  @Column({ name: 'batch_id', type: 'bigint', unsigned: true })
  batchId!: string;

  @Column({ name: 'user_id', type: 'bigint', unsigned: true, nullable: true })
  userId!: string | null;

  @Column({ name: 'session_id', type: 'varchar', length: 191, nullable: true })
  sessionId!: string | null;

  @Column({ name: 'prompt_id', type: 'varchar', length: 191, nullable: true })
  promptId!: string | null;

  @Column({ name: 'trace_id', type: 'varchar', length: 64, nullable: true })
  traceId!: string | null;

  @Column({ name: 'span_id', type: 'varchar', length: 64, nullable: true })
  spanId!: string | null;

  @Column({ name: 'event_name', type: 'varchar', length: 191 })
  eventName!: string;

  @Column({
    name: 'display_name',
    type: 'varchar',
    length: 191,
    nullable: true,
  })
  displayName!: string | null;

  @Column({
    name: 'service_name',
    type: 'varchar',
    length: 191,
    nullable: true,
  })
  serviceName!: string | null;

  @Column({
    name: 'service_version',
    type: 'varchar',
    length: 64,
    nullable: true,
  })
  serviceVersion!: string | null;

  @Column({
    name: 'severity_text',
    type: 'varchar',
    length: 64,
    nullable: true,
  })
  severityText!: string | null;

  @Column({ name: 'severity_number', type: 'int', nullable: true })
  severityNumber!: number | null;

  @NullableDateColumn('event_time')
  eventTime!: Date | null;

  @Column({
    name: 'event_sequence',
    type: 'int',
    unsigned: true,
    nullable: true,
  })
  eventSequence!: number | null;

  @NullableDateColumn('observed_at')
  observedAt!: Date | null;

  @Column({ name: 'attributes_json', ...nullableJsonColumn })
  attributesJson!: Record<string, unknown> | null;

  @Column({ name: 'resource_json', ...nullableJsonColumn })
  resourceJson!: Record<string, unknown> | null;

  @Column({ name: 'body_json', ...nullableJsonColumn })
  bodyJson!: Record<string, unknown> | null;

  @Column({ name: 'body_text', ...nullableLongTextColumn })
  bodyText!: string | null;

  @Column({ name: 'expires_at', type: 'datetime', precision: 3 })
  expiresAt!: Date;
}
