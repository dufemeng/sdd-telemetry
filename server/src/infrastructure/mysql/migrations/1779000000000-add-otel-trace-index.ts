import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddOtelTraceIndex1779000000000 implements MigrationInterface {
  name = 'AddOtelTraceIndex1779000000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE \`otel_log_events\`
        ADD INDEX \`idx_otel_log_events_trace_id\` (\`trace_id\`)
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE \`otel_log_events\`
        DROP INDEX \`idx_otel_log_events_trace_id\`
    `);
  }
}
