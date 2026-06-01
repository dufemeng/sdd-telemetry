import type { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateSddDailyReports1780000005000 implements MigrationInterface {
  name = 'CreateSddDailyReports1780000005000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE sdd_daily_reports (
        id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        report_date     DATE            NOT NULL,
        timezone        VARCHAR(64)     NOT NULL DEFAULT 'Asia/Shanghai',
        period_start    DATETIME(3)     NOT NULL,
        period_end      DATETIME(3)     NOT NULL,
        status          VARCHAR(32)     NOT NULL DEFAULT 'generated',
        metrics_json    JSON            NOT NULL,
        markdown_text   MEDIUMTEXT      NOT NULL,
        html_snapshot   MEDIUMTEXT      NULL,
        data_health_json JSON           NULL,
        template_version VARCHAR(32)    NOT NULL DEFAULT 'daily-report-v1',
        query_version   VARCHAR(32)     NOT NULL DEFAULT 'daily-report-query-v1',
        generated_at    DATETIME(3)     NOT NULL,
        generated_by    VARCHAR(32)     NOT NULL DEFAULT 'schedule',
        error_message   TEXT            NULL,
        gmt_create      DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        gmt_modified    DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
        PRIMARY KEY (id),
        UNIQUE KEY uk_daily_report_date_timezone (report_date, timezone),
        KEY idx_daily_reports_generated_at (generated_at),
        KEY idx_daily_reports_status_date (status, report_date)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS sdd_daily_reports`);
  }
}
