import { createAppDataSource } from './data-source';

const expectedTables = [
  'auth_users',
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
  'sdd_work_item_artifact_writes',
  'sdd_work_item_artifact_turns',
  'sdd_wiki_recalls',
  'sdd_errors',
];

const expectedUniqueIndexes = [
  'uk_auth_users_username',
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
  'uk_artifact_write_key',
  'uk_recall_key',
  'uk_sdd_errors_error_key',
];

const expectedColumns: Record<string, string[]> = {
  auth_users: ['password_hash', 'role', 'status', 'session_version'],
  sdd_users: ['requirements_root_path'],
  sdd_skill_semantics: ['artifact_filename_patterns'],
  sdd_interaction_tool_calls: ['skill_usage_id'],
  sdd_wiki_recalls: [
    'recall_key',
    'tool_call_id',
    'interaction_id',
    'skill_usage_id',
    'work_item_id',
    'user_id',
    'action_type',
    'raw_path',
    'wiki_relative_path',
    'wiki_domain',
    'wiki_axis',
    'wiki_system',
    'event_id',
    'event_sequence',
    'event_time',
    'rule_version',
  ],
};

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

    for (const [tableName, columnNames] of Object.entries(expectedColumns)) {
      const columns = (await dataSource.query(
        `SELECT column_name AS columnName
         FROM information_schema.columns
         WHERE table_schema = DATABASE()
           AND table_name = ?`,
        [tableName],
      )) as Array<{ columnName: string }>;
      const actualColumns = new Set(columns.map(row => row.columnName));
      const missingColumns = columnNames.filter(columnName => !actualColumns.has(columnName));

      if (missingColumns.length > 0) {
        throw new Error(`missing columns in ${tableName}: ${missingColumns.join(', ')}`);
      }
    }
  } finally {
    await dataSource.destroy();
  }

  console.info(
    `[sdd-telemetry] schema verified: ${expectedTables.length} tables, ${expectedUniqueIndexes.length} unique indexes`,
  );
}

void main();
