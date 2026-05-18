import { Column, CreateDateColumn, Entity, Index, UpdateDateColumn } from 'typeorm';
import { IdEntity } from './common';

@Entity({ name: 'otel_raw_payloads' })
@Index('uk_otel_raw_payloads_batch_id', ['batchId'], { unique: true })
@Index('idx_otel_raw_payloads_expires_at', ['expiresAt'])
export class OtelRawPayloadEntity extends IdEntity {
  @Column({ name: 'batch_id', type: 'bigint', unsigned: true })
  batchId!: string;

  @Column({ name: 'payload_json', type: 'longtext' })
  payloadJson!: string;

  @Column({ name: 'payload_bytes', type: 'int', unsigned: true })
  payloadBytes!: number;

  @Column({ name: 'content_type', type: 'varchar', length: 128, nullable: true })
  contentType!: string | null;

  @Column({ name: 'expires_at', type: 'datetime', precision: 3 })
  expiresAt!: Date;

  @CreateDateColumn({ name: 'gmt_create', type: 'datetime', precision: 3 })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'gmt_modified', type: 'datetime', precision: 3 })
  updatedAt!: Date;
}
