import type { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateOpsResourceSnapshots1780000002000 implements MigrationInterface {
  name = 'CreateOpsResourceSnapshots1780000002000';

  async up(queryRunner: QueryRunner): Promise<void> {
    if (await tableExists(queryRunner, 'ops_resource_snapshots')) return;

    await queryRunner.query(`
      CREATE TABLE \`ops_resource_snapshots\` (
        \`id\` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        \`captured_at\` DATETIME(3) NOT NULL,
        \`project_name\` VARCHAR(128) NOT NULL,
        \`service_name\` VARCHAR(64) NOT NULL,
        \`container_name\` VARCHAR(255) NULL,
        \`container_id\` VARCHAR(128) NULL,
        \`state\` VARCHAR(64) NULL,
        \`health\` VARCHAR(64) NULL,
        \`restart_count\` INT UNSIGNED NOT NULL DEFAULT 0,
        \`cpu_percent\` DECIMAL(8,4) NULL,
        \`memory_usage_bytes\` BIGINT UNSIGNED NULL,
        \`memory_limit_bytes\` BIGINT UNSIGNED NULL,
        \`network_rx_bytes\` BIGINT UNSIGNED NULL,
        \`network_tx_bytes\` BIGINT UNSIGNED NULL,
        \`block_read_bytes\` BIGINT UNSIGNED NULL,
        \`block_write_bytes\` BIGINT UNSIGNED NULL,
        \`writable_layer_bytes\` BIGINT UNSIGNED NULL,
        \`image_ref\` VARCHAR(255) NULL,
        \`image_size_bytes\` BIGINT UNSIGNED NULL,
        \`database_bytes\` BIGINT UNSIGNED NULL,
        \`deploy_directory_bytes\` BIGINT UNSIGNED NULL,
        \`gmt_create\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        PRIMARY KEY (\`id\`),
        KEY \`idx_ops_resource_snapshots_time\` (\`captured_at\`),
        KEY \`idx_ops_resource_snapshots_service_time\` (\`service_name\`, \`captured_at\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    if (await tableExists(queryRunner, 'ops_resource_snapshots')) {
      await queryRunner.query(`DROP TABLE \`ops_resource_snapshots\``);
    }
  }
}

async function tableExists(queryRunner: QueryRunner, tableName: string): Promise<boolean> {
  const rows = (await queryRunner.query(
    `SELECT 1 FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = ? LIMIT 1`,
    [tableName],
  )) as unknown[];
  return rows.length > 0;
}
