import { Inject, Provide } from '@midwayjs/core';
import type { AuthRole, AuthUserStatus, CreateAuthUserRequest } from '@sdd-telemetry/api';
import type { EntityManager } from 'typeorm';
import { MysqlDataSourceManager } from '../../infrastructure/mysql/data-source-manager';

export interface AuthUserRow {
  id: string | number;
  username: string;
  display_name: string;
  password_hash: string;
  role: AuthRole;
  status: AuthUserStatus;
  session_version: number;
  last_login_at: Date | null;
  gmt_create: Date;
  gmt_modified: Date;
}

@Provide('authRepository')
export class AuthRepository {
  @Inject('mysqlDataSourceManager')
  mysqlDataSourceManager!: MysqlDataSourceManager;

  async findByUsername(username: string): Promise<AuthUserRow | null> {
    const dataSource = await this.mysqlDataSourceManager.getDataSource();
    const rows = (await dataSource.query(
      `SELECT id, username, display_name, password_hash, role, status, session_version,
              last_login_at, gmt_create, gmt_modified
       FROM auth_users
       WHERE username = ?
       LIMIT 1`,
      [username],
    )) as AuthUserRow[];
    return rows[0] ?? null;
  }

  async findById(id: string): Promise<AuthUserRow | null> {
    const dataSource = await this.mysqlDataSourceManager.getDataSource();
    const rows = (await dataSource.query(
      `SELECT id, username, display_name, password_hash, role, status, session_version,
              last_login_at, gmt_create, gmt_modified
       FROM auth_users
       WHERE id = ?
       LIMIT 1`,
      [id],
    )) as AuthUserRow[];
    return rows[0] ?? null;
  }

  async listUsers(): Promise<AuthUserRow[]> {
    const dataSource = await this.mysqlDataSourceManager.getDataSource();
    return (await dataSource.query(
      `SELECT id, username, display_name, password_hash, role, status, session_version,
              last_login_at, gmt_create, gmt_modified
       FROM auth_users
       ORDER BY gmt_create ASC, id ASC`,
    )) as AuthUserRow[];
  }

  async touchLastLogin(id: string): Promise<void> {
    const dataSource = await this.mysqlDataSourceManager.getDataSource();
    await dataSource.query(
      `UPDATE auth_users
       SET last_login_at = CURRENT_TIMESTAMP(3), gmt_modified = gmt_modified
       WHERE id = ?`,
      [id],
    );
  }

  async create(
    manager: EntityManager,
    input: CreateAuthUserRequest,
    passwordHash: string,
    createdBy: string,
  ): Promise<AuthUserRow> {
    await manager.query(
      `INSERT INTO auth_users
        (username, display_name, password_hash, role, status, session_version, created_by,
         gmt_create, gmt_modified)
       VALUES (?, ?, ?, ?, 'active', 1, ?, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3))`,
      [input.username, input.displayName, passwordHash, input.role, createdBy],
    );
    const row = await this.lockByUsername(manager, input.username);
    if (!row) {
      throw new Error(`auth user not found after create: ${input.username}`);
    }
    return row;
  }

  async lockById(manager: EntityManager, id: string): Promise<AuthUserRow | null> {
    const rows = (await manager.query(
      `SELECT id, username, display_name, password_hash, role, status, session_version,
              last_login_at, gmt_create, gmt_modified
       FROM auth_users
       WHERE id = ?
       LIMIT 1 FOR UPDATE`,
      [id],
    )) as AuthUserRow[];
    return rows[0] ?? null;
  }

  async lockByUsername(manager: EntityManager, username: string): Promise<AuthUserRow | null> {
    const rows = (await manager.query(
      `SELECT id, username, display_name, password_hash, role, status, session_version,
              last_login_at, gmt_create, gmt_modified
       FROM auth_users
       WHERE username = ?
       LIMIT 1 FOR UPDATE`,
      [username],
    )) as AuthUserRow[];
    return rows[0] ?? null;
  }

  async updateProfile(
    manager: EntityManager,
    id: string,
    displayName: string,
    role: AuthRole,
    invalidateSession: boolean,
  ): Promise<AuthUserRow> {
    await manager.query(
      `UPDATE auth_users
       SET display_name = ?,
           role = ?,
           session_version = session_version + ?,
           gmt_modified = CURRENT_TIMESTAMP(3)
       WHERE id = ?`,
      [displayName, role, invalidateSession ? 1 : 0, id],
    );
    return this.requireLockedRow(manager, id);
  }

  async updateStatus(
    manager: EntityManager,
    id: string,
    status: AuthUserStatus,
  ): Promise<AuthUserRow> {
    await manager.query(
      `UPDATE auth_users
       SET status = ?,
           session_version = session_version + 1,
           gmt_modified = CURRENT_TIMESTAMP(3)
       WHERE id = ?`,
      [status, id],
    );
    return this.requireLockedRow(manager, id);
  }

  async updatePassword(
    manager: EntityManager,
    id: string,
    passwordHash: string,
  ): Promise<AuthUserRow> {
    await manager.query(
      `UPDATE auth_users
       SET password_hash = ?,
           session_version = session_version + 1,
           gmt_modified = CURRENT_TIMESTAMP(3)
       WHERE id = ?`,
      [passwordHash, id],
    );
    return this.requireLockedRow(manager, id);
  }

  async lockOtherActiveSuperAdmins(manager: EntityManager, id: string): Promise<number> {
    const rows = (await manager.query(
      `SELECT id
       FROM auth_users
       WHERE id <> ? AND role = 'super_admin' AND status = 'active'
       FOR UPDATE`,
      [id],
    )) as Array<{ id: string | number }>;
    return rows.length;
  }

  private async requireLockedRow(manager: EntityManager, id: string): Promise<AuthUserRow> {
    const row = await this.lockById(manager, id);
    if (!row) {
      throw new Error(`auth user not found after update: ${id}`);
    }
    return row;
  }
}
