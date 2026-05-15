import { createAppDataSource } from './data-source';

const expectedTables = [
  'sdd_users',
  'sdd_skill_semantics',
  'sdd_skill_aliases',
  'otel_ingest_batches',
  'otel_raw_payloads',
  'ingest_outbox',
  'otel_log_events',
  'sdd_interactions',
  'sdd_interaction_texts',
  'sdd_skill_usages',
  'sdd_work_items',
  'sdd_work_item_artifacts',
  'sdd_errors',
];

const expectedUniqueIndexes = [
  'uk_sdd_users_user_key',
  'uk_sdd_skill_semantics_code',
  'uk_sdd_skill_aliases_skill_name',
  'uk_otel_ingest_batches_payload_hash',
  'uk_otel_raw_payloads_batch_id',
  'uk_ingest_outbox_event_aggregate',
  'uk_otel_log_events_event_id',
  'uk_sdd_interactions_interaction_key',
  'uk_sdd_interaction_texts_interaction_id',
  'uk_sdd_skill_usages_usage_key',
  'uk_sdd_work_items_work_item_key',
  'uk_sdd_work_item_artifacts_artifact_key',
  'uk_sdd_errors_error_key',
];

async function main(): Promise<void> {
  const dataSource = createAppDataSource();
  await dataSource.initialize();

  try {
    const tables = (await dataSource.query(
      `SELECT table_name AS tableName
       FROM information_schema.tables
       WHERE table_schema = DATABASE()`,
    )) as Array<{ tableName: string }>;
    const actualTables = new Set(tables.map(row => row.tableName));
    const missingTables = expectedTables.filter(tableName => !actualTables.has(tableName));

    if (missingTables.length > 0) {
      throw new Error(`missing tables: ${missingTables.join(', ')}`);
    }

    const indexes = (await dataSource.query(
      `SELECT DISTINCT index_name AS indexName
       FROM information_schema.statistics
       WHERE table_schema = DATABASE()
         AND non_unique = 0`,
    )) as Array<{ indexName: string }>;
    const actualIndexes = new Set(indexes.map(row => row.indexName));
    const missingIndexes = expectedUniqueIndexes.filter(indexName => !actualIndexes.has(indexName));

    if (missingIndexes.length > 0) {
      throw new Error(`missing unique indexes: ${missingIndexes.join(', ')}`);
    }
  } finally {
    await dataSource.destroy();
  }

  console.info(
    `[sdd-telemetry] schema verified: ${expectedTables.length} tables, ${expectedUniqueIndexes.length} unique indexes`,
  );
}

void main();
