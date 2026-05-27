import { Config, Inject, Provide } from '@midwayjs/core';
import type { Context } from '@midwayjs/koa';
import type {
  AuthLoginRequest,
  AuthSessionUser,
  AuthUser,
  AuthUserStatus,
  ChangePasswordRequest,
  CreateAuthUserRequest,
  ResetAuthPasswordRequest,
  UpdateAuthUserRequest,
} from '@sdd-telemetry/api';
import { forbidden, conflict, unauthorized } from '../../common/auth/api-http-error';
import { MysqlDataSourceManager } from '../../infrastructure/mysql/data-source-manager';
import { toIsoDate, toStringId } from '../query-utils';
import { hashPassword, issueSessionToken, readSessionToken, verifyPassword } from './auth-crypto';
import { AuthRepository, type AuthUserRow } from './auth.repository';

const SESSION_COOKIE_NAME = 'sdd_session';

interface AuthConfig {
  sessionSecret: string;
  sessionMaxAgeSeconds: number;
  cookieSecure: boolean;
}

export interface AuthLoginResult {
  user: AuthSessionUser;
  sessionVersion: number;
}

@Provide('authService')
export class AuthService {
  @Config('auth')
  authConfig!: AuthConfig;

  @Inject('authRepository')
  authRepository!: AuthRepository;

  @Inject('mysqlDataSourceManager')
  mysqlDataSourceManager!: MysqlDataSourceManager;

  async login(input: AuthLoginRequest): Promise<AuthLoginResult> {
    const row = await this.authRepository.findByUsername(input.username);
    const validPassword = row ? await verifyPassword(input.password, row.password_hash) : false;
    if (!row || !validPassword || row.status !== 'active') {
      throw unauthorized('用户名或密码错误');
    }
    await this.authRepository.touchLastLogin(toStringId(row.id));
    return {
      user: this.toSessionUser(row),
      sessionVersion: row.session_version,
    };
  }

  setSessionCookie(ctx: Context, result: AuthLoginResult): void {
    const token = issueSessionToken(
      result.user.id,
      result.sessionVersion,
      this.authConfig.sessionSecret,
      this.authConfig.sessionMaxAgeSeconds,
    );
    ctx.cookies.set(SESSION_COOKIE_NAME, token, {
      httpOnly: true,
      signed: false,
      secure: this.authConfig.cookieSecure,
      sameSite: 'lax',
      overwrite: true,
      maxAge: this.authConfig.sessionMaxAgeSeconds * 1000,
    });
  }

  clearSessionCookie(ctx: Context): void {
    ctx.cookies.set(SESSION_COOKIE_NAME, '', {
      httpOnly: true,
      signed: false,
      secure: this.authConfig.cookieSecure,
      sameSite: 'lax',
      overwrite: true,
      maxAge: 0,
    });
  }

  async authenticate(ctx: Context): Promise<AuthSessionUser | null> {
    const claims = readSessionToken(
      ctx.cookies.get(SESSION_COOKIE_NAME, { signed: false }),
      this.authConfig.sessionSecret,
    );
    if (!claims) {
      return null;
    }
    const row = await this.authRepository.findById(claims.userId);
    if (
      !row ||
      row.status !== 'active' ||
      row.session_version !== claims.sessionVersion
    ) {
      return null;
    }
    return this.toSessionUser(row);
  }

  async listUsers(): Promise<AuthUser[]> {
    return (await this.authRepository.listUsers()).map(row => this.toAuthUser(row));
  }

  async createUser(actor: AuthSessionUser, input: CreateAuthUserRequest): Promise<AuthUser> {
    const passwordHash = await hashPassword(input.password);
    const dataSource = await this.mysqlDataSourceManager.getDataSource();
    return dataSource.transaction(async manager => {
      if (await this.authRepository.lockByUsername(manager, input.username)) {
        throw conflict('用户名已存在');
      }
      const row = await this.authRepository.create(manager, input, passwordHash, actor.id);
      return this.toAuthUser(row);
    });
  }

  async updateUser(
    id: string,
    input: UpdateAuthUserRequest,
  ): Promise<AuthUser> {
    const dataSource = await this.mysqlDataSourceManager.getDataSource();
    return dataSource.transaction(async manager => {
      const row = await this.requireTargetUser(manager, id);
      const nextRole = input.role ?? row.role;
      if (row.role === 'super_admin' && nextRole !== 'super_admin' && row.status === 'active') {
        await this.assertAnotherActiveAdmin(manager, id);
      }
      return this.toAuthUser(
        await this.authRepository.updateProfile(
          manager,
          id,
          input.displayName ?? row.display_name,
          nextRole,
          nextRole !== row.role,
        ),
      );
    });
  }

  async resetPassword(id: string, input: ResetAuthPasswordRequest): Promise<AuthUser> {
    const passwordHash = await hashPassword(input.password);
    const dataSource = await this.mysqlDataSourceManager.getDataSource();
    return dataSource.transaction(async manager => {
      await this.requireTargetUser(manager, id);
      return this.toAuthUser(await this.authRepository.updatePassword(manager, id, passwordHash));
    });
  }

  async setStatus(id: string, status: AuthUserStatus): Promise<AuthUser> {
    const dataSource = await this.mysqlDataSourceManager.getDataSource();
    return dataSource.transaction(async manager => {
      const row = await this.requireTargetUser(manager, id);
      if (status === row.status) {
        return this.toAuthUser(row);
      }
      if (status === 'disabled' && row.role === 'super_admin' && row.status === 'active') {
        await this.assertAnotherActiveAdmin(manager, id);
      }
      return this.toAuthUser(await this.authRepository.updateStatus(manager, id, status));
    });
  }

  async changePassword(user: AuthSessionUser, input: ChangePasswordRequest): Promise<AuthLoginResult> {
    const passwordHash = await hashPassword(input.newPassword);
    const dataSource = await this.mysqlDataSourceManager.getDataSource();
    return dataSource.transaction(async manager => {
      const row = await this.requireTargetUser(manager, user.id);
      if (!(await verifyPassword(input.currentPassword, row.password_hash))) {
        throw forbidden('当前密码错误');
      }
      const updated = await this.authRepository.updatePassword(manager, user.id, passwordHash);
      return {
        user: this.toSessionUser(updated),
        sessionVersion: updated.session_version,
      };
    });
  }

  private async requireTargetUser(manager: import('typeorm').EntityManager, id: string): Promise<AuthUserRow> {
    const row = await this.authRepository.lockById(manager, id);
    if (!row) {
      throw conflict('登录成员不存在');
    }
    return row;
  }

  private async assertAnotherActiveAdmin(
    manager: import('typeorm').EntityManager,
    id: string,
  ): Promise<void> {
    if ((await this.authRepository.lockOtherActiveSuperAdmins(manager, id)) === 0) {
      throw conflict('必须保留至少一个启用中的超级管理员');
    }
  }

  private toSessionUser(row: AuthUserRow): AuthSessionUser {
    return {
      id: toStringId(row.id),
      username: row.username,
      displayName: row.display_name,
      role: row.role,
    };
  }

  private toAuthUser(row: AuthUserRow): AuthUser {
    return {
      ...this.toSessionUser(row),
      status: row.status,
      lastLoginAt: toIsoDate(row.last_login_at),
      createdAt: toIsoDate(row.gmt_create) ?? new Date(0).toISOString(),
      updatedAt: toIsoDate(row.gmt_modified) ?? new Date(0).toISOString(),
    };
  }
}
