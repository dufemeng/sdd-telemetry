import { Middleware, type IMiddleware } from '@midwayjs/core';
import type { Context, NextFunction } from '@midwayjs/koa';
import type { AuthSessionUser } from '@sdd-telemetry/api';
import { forbidden, unauthorized } from './api-http-error';
import { AuthService } from '../../modules/auth/auth.service';

type AuthState = { authUser?: AuthSessionUser };

@Middleware()
export class AuthMiddleware implements IMiddleware<Context, NextFunction> {
  resolve() {
    return async (ctx: Context, next: NextFunction) => {
      const authService = await ctx.requestContext.getAsync<AuthService>('authService');
      const user = await authService.authenticate(ctx);
      if (!user) {
        throw unauthorized();
      }
      (ctx.state as AuthState).authUser = user;
      if (requiresSuperAdmin(ctx.method, ctx.path) && user.role !== 'super_admin') {
        throw forbidden();
      }
      await next();
    };
  }

  ignore(ctx: Context): boolean {
    return !requiresAuthentication(ctx.method, ctx.path);
  }
}

export function getAuthUser(ctx: Context): AuthSessionUser {
  const user = (ctx.state as AuthState).authUser;
  if (!user) {
    throw unauthorized();
  }
  return user;
}

export function requiresAuthentication(method: string, path: string): boolean {
  if (!path.startsWith('/api/')) {
    return false;
  }
  if (path === '/api/healthz' || path === '/api/auth/login' || path === '/api/auth/logout') {
    return false;
  }
  if (method === 'POST' && path === '/api/ingest/otlp-logs') {
    return false;
  }
  return true;
}

export function requiresSuperAdmin(method: string, path: string): boolean {
  if (path.startsWith('/api/admin/')) {
    return true;
  }
  if (path.startsWith('/api/eval/')) {
    return true;
  }
  if (path.startsWith('/api/auth/users')) {
    return true;
  }
  if (path.startsWith('/api/ops/')) {
    return true;
  }
  if (path === '/api/sdd/user-settings') {
    return true;
  }
  if (method === 'POST' && path.startsWith('/api/reports/daily/') && path.endsWith('/regenerate')) {
    return true;
  }
  return path.startsWith('/api/sdd/semantics') && method !== 'GET';
}
