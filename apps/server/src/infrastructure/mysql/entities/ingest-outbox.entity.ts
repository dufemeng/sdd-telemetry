import { Column, Entity, Index } from 'typeorm';
import { NullableDateColumn, TimestampedEntity, nullableJsonColumn, nullableLongTextColumn } from './common';

@Entity({ name: 'ingest_outbox' })
@Index('uk_ingest_outbox_event_aggregate', ['eventType', 'aggregateId'], { unique: true })
@Index('idx_ingest_outbox_status_retry', ['status', 'nextRetryAt'])
export class IngestOutboxEntity extends TimestampedEntity {
  @Column({ name: 'event_type', type: 'varchar', length: 64 })
  eventType!: string;

  @Column({ name: 'aggregate_id', type: 'bigint', unsigned: true })
  aggregateId!: string;

  @Column({ name: 'payload_json', ...nullableJsonColumn })
  payloadJson!: Record<string, unknown> | null;

  @Column({ name: 'status', type: 'varchar', length: 32 })
  status!: string;

  @Column({ name: 'attempts', type: 'int', unsigned: true, default: 0 })
  attempts!: number;

  @Column({ name: 'max_attempts', type: 'int', unsigned: true, default: 20 })
  maxAttempts!: number;

  @NullableDateColumn('next_retry_at')
  nextRetryAt!: Date | null;

  @Column({ name: 'locked_by', type: 'varchar', length: 191, nullable: true })
  lockedBy!: string | null;

  @NullableDateColumn('locked_until')
  lockedUntil!: Date | null;

  @Column({ name: 'last_error', ...nullableLongTextColumn })
  lastError!: string | null;

  @NullableDateColumn('dispatched_at')
  dispatchedAt!: Date | null;
}
