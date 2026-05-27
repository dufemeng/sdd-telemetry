import type { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateAuthUsers1779868800000 implements MigrationInterface {
  name = 'CreateAuthUsers1779868800000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS \`auth_users\` (
        \`id\` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        \`username\` VARCHAR(64) NOT NULL,
        \`display_name\` VARCHAR(64) NOT NULL,
        \`password_hash\` VARCHAR(255) NOT NULL,
        \`role\` VARCHAR(32) NOT NULL DEFAULT 'viewer',
        \`status\` VARCHAR(32) NOT NULL DEFAULT 'active',
        \`session_version\` INT UNSIGNED NOT NULL DEFAULT 1,
        \`last_login_at\` DATETIME(3) NULL,
        \`created_by\` BIGINT UNSIGNED NULL,
        \`gmt_create\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        \`gmt_modified\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`uk_auth_users_username\` (\`username\`),
        KEY \`idx_auth_users_role_status\` (\`role\`, \`status\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE IF EXISTS `auth_users`');
  }
}
