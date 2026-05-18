import { Column, Entity, Index } from 'typeorm';
import { NullableDateColumn, TimestampedEntity, nullableLongTextColumn } from './common';

@Entity({ name: 'otel_ingest_batches' })
@Index('uk_otel_ingest_batches_payload_hash', ['payloadHash'], { unique: true })
@Index('idx_otel_ingest_batches_status_received', ['status', 'receivedAt'])
@Index('idx_otel_ingest_batches_user_received', ['userId', 'receivedAt'])
export class OtelIngestBatchEntity extends TimestampedEntity {
  @Column({ name: 'payload_hash', type: 'char', length: 64 })
  payloadHash!: string;

  @Column({ name: 'user_id', type: 'bigint', unsigned: true, nullable: true })
  userId!: string | null;

  @Column({ name: 'status', type: 'varchar', length: 32 })
  status!: string;

  @Column({ name: 'status_reason', type: 'varchar', length: 500, nullable: true })
  statusReason!: string | null;

  @Column({ name: 'payload_bytes', type: 'int', unsigned: true })
  payloadBytes!: number;

  @Column({ name: 'raw_log_count', type: 'int', unsigned: true, default: 0 })
  rawLogCount!: number;

  @Column({ name: 'event_count', type: 'int', unsigned: true, default: 0 })
  eventCount!: number;

  @Column({ name: 'derived_count', type: 'int', unsigned: true, default: 0 })
  derivedCount!: number;

  @Column({ name: 'duplicate_count', type: 'int', unsigned: true, default: 0 })
  duplicateCount!: number;

  @NullableDateColumn('last_duplicate_at')
  lastDuplicateAt!: Date | null;

  @Column({ name: 'received_at', type: 'datetime', precision: 3 })
  receivedAt!: Date;

  @NullableDateColumn('parse_started_at')
  parseStartedAt!: Date | null;

  @NullableDateColumn('parse_completed_at')
  parseCompletedAt!: Date | null;

  @Column({ name: 'parse_duration_ms', type: 'int', unsigned: true, nullable: true })
  parseDurationMs!: number | null;

  @Column({ name: 'retry_count', type: 'int', unsigned: true, default: 0 })
  retryCount!: number;

  @Column({ name: 'last_error', ...nullableLongTextColumn })
  lastError!: string | null;
}
