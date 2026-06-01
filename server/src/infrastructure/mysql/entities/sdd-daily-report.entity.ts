import { Column, Entity, Index, Unique } from 'typeorm';
import { TimestampedEntity } from './common';

@Entity('sdd_daily_reports')
@Unique('uk_daily_report_date_timezone', ['reportDate', 'timezone'])
@Index('idx_daily_reports_generated_at', ['generatedAt'])
@Index('idx_daily_reports_status_date', ['status', 'reportDate'])
export class SddDailyReportEntity extends TimestampedEntity {
  @Column({ name: 'report_date', type: 'date' })
  reportDate!: string;

  @Column({ name: 'timezone', type: 'varchar', length: 64, default: 'Asia/Shanghai' })
  timezone!: string;

  @Column({ name: 'period_start', type: 'datetime', precision: 3 })
  periodStart!: Date;

  @Column({ name: 'period_end', type: 'datetime', precision: 3 })
  periodEnd!: Date;

  @Column({ name: 'status', type: 'varchar', length: 32 })
  status!: string;

  @Column({ name: 'metrics_json', type: 'json' })
  metricsJson!: string;

  @Column({ name: 'markdown_text', type: 'mediumtext' })
  markdownText!: string;

  @Column({ name: 'html_snapshot', type: 'mediumtext', nullable: true })
  htmlSnapshot!: string | null;

  @Column({ name: 'data_health_json', type: 'json', nullable: true })
  dataHealthJson!: string | null;

  @Column({ name: 'template_version', type: 'varchar', length: 32 })
  templateVersion!: string;

  @Column({ name: 'query_version', type: 'varchar', length: 32 })
  queryVersion!: string;

  @Column({ name: 'generated_at', type: 'datetime', precision: 3 })
  generatedAt!: Date;

  @Column({ name: 'generated_by', type: 'varchar', length: 32 })
  generatedBy!: string;

  @Column({ name: 'error_message', type: 'text', nullable: true })
  errorMessage!: string | null;
}
