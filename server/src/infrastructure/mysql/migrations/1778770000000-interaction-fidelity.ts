import type { MigrationInterface, QueryRunner } from 'typeorm';

export class InteractionFidelity1778770000000 implements MigrationInterface {
  name = 'InteractionFidelity1778770000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE \`otel_log_events\`
        ADD COLUMN \`event_sequence\` INT UNSIGNED NULL AFTER \`event_time\`,
        ADD INDEX \`idx_otel_log_events_session_sequence\` (\`session_id\`, \`event_sequence\`)
    `);

    await queryRunner.query(`
      ALTER TABLE \`sdd_interactions\`
        ADD COLUMN \`cost_usd\` DECIMAL(10,6) NULL AFTER \`duration_ms\`,
        ADD COLUMN \`input_tokens\` INT UNSIGNED NULL AFTER \`cost_usd\`,
        ADD COLUMN \`output_tokens\` INT UNSIGNED NULL AFTER \`input_tokens\`,
        ADD COLUMN \`cache_read_tokens\` INT UNSIGNED NULL AFTER \`output_tokens\`,
        ADD COLUMN \`cache_creation_tokens\` INT UNSIGNED NULL AFTER \`cache_read_tokens\`,
        ADD COLUMN \`llm_call_count\` SMALLINT UNSIGNED NOT NULL DEFAULT 0 AFTER \`cache_creation_tokens\`,
        ADD COLUMN \`tool_call_count\` SMALLINT UNSIGNED NOT NULL DEFAULT 0 AFTER \`llm_call_count\`,
        ADD COLUMN \`skill_name\` VARCHAR(191) NULL AFTER \`tool_call_count\`,
        ADD COLUMN \`agent_name\` VARCHAR(191) NULL AFTER \`skill_name\`,
        ADD COLUMN \`plugin_name\` VARCHAR(191) NULL AFTER \`agent_name\`,
        ADD COLUMN \`query_source\` VARCHAR(64) NULL AFTER \`plugin_name\`,
        ADD COLUMN \`effort\` VARCHAR(16) NULL AFTER \`query_source\`,
        ADD COLUMN \`speed\` VARCHAR(16) NULL AFTER \`effort\`,
        ADD INDEX \`idx_sdd_interactions_skill_name\` (\`skill_name\`),
        ADD INDEX \`idx_sdd_interactions_cost_usd\` (\`cost_usd\`)
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS \`sdd_interaction_tool_calls\` (
        \`id\` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        \`interaction_id\` BIGINT UNSIGNED NOT NULL,
        \`tool_use_id\` VARCHAR(191) NOT NULL,
        \`tool_name\` VARCHAR(128) NOT NULL,
        \`sequence\` INT UNSIGNED NOT NULL,
        \`decision\` VARCHAR(16) NULL,
        \`decision_source\` VARCHAR(32) NULL,
        \`success\` TINYINT(1) NULL,
        \`duration_ms\` INT UNSIGNED NULL,
        \`input_size_bytes\` INT UNSIGNED NULL,
        \`result_size_bytes\` INT UNSIGNED NULL,
        \`error_type\` VARCHAR(128) NULL,
        \`tool_input_preview\` TEXT NULL,
        \`mcp_server_scope\` VARCHAR(191) NULL,
        \`evidence_json\` JSON NULL,
        \`gmt_create\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        \`gmt_modified\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`uk_sdd_interaction_tool_calls_tool_use_id\` (\`tool_use_id\`),
        KEY \`idx_sdd_interaction_tool_calls_interaction_id\` (\`interaction_id\`),
        KEY \`idx_sdd_interaction_tool_calls_tool_name\` (\`tool_name\`),
        KEY \`idx_sdd_interaction_tool_calls_interaction_sequence\` (\`interaction_id\`, \`sequence\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE IF EXISTS `sdd_interaction_tool_calls`');

    await queryRunner.query(`
      ALTER TABLE \`sdd_interactions\`
        DROP INDEX \`idx_sdd_interactions_cost_usd\`,
        DROP INDEX \`idx_sdd_interactions_skill_name\`,
        DROP COLUMN \`speed\`,
        DROP COLUMN \`effort\`,
        DROP COLUMN \`query_source\`,
        DROP COLUMN \`plugin_name\`,
        DROP COLUMN \`agent_name\`,
        DROP COLUMN \`skill_name\`,
        DROP COLUMN \`tool_call_count\`,
        DROP COLUMN \`llm_call_count\`,
        DROP COLUMN \`cache_creation_tokens\`,
        DROP COLUMN \`cache_read_tokens\`,
        DROP COLUMN \`output_tokens\`,
        DROP COLUMN \`input_tokens\`,
        DROP COLUMN \`cost_usd\`
    `);

    await queryRunner.query(`
      ALTER TABLE \`otel_log_events\`
        DROP INDEX \`idx_otel_log_events_session_sequence\`,
        DROP COLUMN \`event_sequence\`
    `);
  }
}
