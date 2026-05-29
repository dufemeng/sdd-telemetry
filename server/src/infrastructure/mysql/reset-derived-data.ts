import type { DataSource } from 'typeorm';
import { createAppDataSource } from './data-source';

const derivedTables = [
  'sdd_work_item_artifact_writes',
  'sdd_errors',
  'sdd_work_item_artifacts',
  'sdd_work_items',
  'sdd_skill_usages',
  'sdd_interaction_tool_calls',
  'sdd_interaction_texts',
  'sdd_interactions',
  'otel_log_events',
];

export async function resetDerivedData(dataSource: DataSource): Promise<void> {
  try {
    await dataSource.query('SET FOREIGN_KEY_CHECKS = 0');
    for (const tableName of derivedTables) {
      await dataSource.query(`DELETE FROM \`${tableName}\``);
      await dataSource.query(`ALTER TABLE \`${tableName}\` AUTO_INCREMENT = 1`);
    }
    await dataSource.query('SET FOREIGN_KEY_CHECKS = 1');

    await dataSource.query(
      `UPDATE otel_ingest_batches b
       INNER JOIN otel_raw_payloads r ON r.batch_id = b.id
       SET b.status = 'received',
           b.status_reason = 'derived data reset',
           b.event_count = 0,
           b.derived_count = 0,
           b.parse_started_at = NULL,
           b.parse_completed_at = NULL,
           b.parse_duration_ms = NULL,
           b.retry_count = 0,
           b.last_error = NULL,
           b.gmt_modified = CURRENT_TIMESTAMP(3)`,
    );

    await dataSource.query(`DELETE FROM ingest_outbox WHERE event_type = 'clean_batch'`);
    await dataSource.query(
      `INSERT INTO ingest_outbox
        (event_type, aggregate_id, payload_json, status, attempts, max_attempts,
         next_retry_at, gmt_create, gmt_modified)
       SELECT 'clean_batch',
              b.id,
              JSON_OBJECT('batchId', CAST(b.id AS CHAR)),
              'pending',
              0,
              20,
              CURRENT_TIMESTAMP(3),
              CURRENT_TIMESTAMP(3),
              CURRENT_TIMESTAMP(3)
       FROM otel_ingest_batches b
       INNER JOIN otel_raw_payloads r ON r.batch_id = b.id`,
    );
  } finally {
    await dataSource.query('SET FOREIGN_KEY_CHECKS = 1').catch(() => undefined);
  }
}

async function main(): Promise<void> {
  if (process.env.CONFIRM_RESET_DERIVED !== '1') {
    throw new Error('Refusing to reset derived data without CONFIRM_RESET_DERIVED=1');
  }

  const dataSource = createAppDataSource();
  await dataSource.initialize();

  try {
    await resetDerivedData(dataSource);
  } finally {
    await dataSource.destroy();
  }

  console.info('[sdd-telemetry] derived data reset; raw payload batches queued for cleaning');
}

if (require.main === module) {
  void main();
}
