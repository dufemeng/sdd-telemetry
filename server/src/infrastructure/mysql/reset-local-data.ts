import { createAppDataSource } from './data-source';
import { seedDatabase } from './seed';

const dataTables = [
  'sdd_errors',
  'sdd_work_item_artifacts',
  'sdd_work_items',
  'sdd_skill_usages',
  'sdd_interaction_texts',
  'sdd_interactions',
  'otel_log_events',
  'ingest_outbox',
  'otel_raw_payloads',
  'otel_ingest_batches',
  'sdd_users',
  'sdd_skill_aliases',
  'sdd_skill_semantics',
];

async function main(): Promise<void> {
  if (process.env.CONFIRM_RESET !== '1') {
    throw new Error('Refusing to reset local data without CONFIRM_RESET=1');
  }

  const dataSource = createAppDataSource();
  await dataSource.initialize();

  try {
    await dataSource.query('SET FOREIGN_KEY_CHECKS = 0');
    for (const tableName of dataTables) {
      await dataSource.query(`DELETE FROM \`${tableName}\``);
      await dataSource.query(`ALTER TABLE \`${tableName}\` AUTO_INCREMENT = 1`);
    }
    await dataSource.query('SET FOREIGN_KEY_CHECKS = 1');
    await seedDatabase(dataSource);
  } finally {
    await dataSource.query('SET FOREIGN_KEY_CHECKS = 1').catch(() => undefined);
    await dataSource.destroy();
  }

  console.info('[sdd-telemetry] local data reset; seed semantics restored');
}

void main();
