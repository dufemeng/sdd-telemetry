import { Controller, Get, Inject, Post, Put } from '@midwayjs/core';
import type { Context } from '@midwayjs/koa';
import {
  AuthLoginRequestSchema,
  AuthSessionUserSchema,
  AuthUserSchema,
  ChangePasswordRequestSchema,
  CreateAuthUserRequestSchema,
  ResetAuthPasswordRequestSchema,
  UpdateAuthUserRequestSchema,
} from '@sdd-telemetry/api';
import { getAuthUser } from '../../common/auth/auth.middleware';
import { ok } from '../../common/response/api-response';
import { parseWithSchema } from '../../common/validation/parse-with-schema';
import { AuthService } from './auth.service';

@Controller('/api/auth')
export class AuthController {
  @Inject()
  ctx!: Context;

  @Inject('authService')
  authService!: AuthService;

  @Post('/login')
  async login() {
    const input = parseWithSchema(AuthLoginRequestSchema, this.ctx.request.body);
    const result = await this.authService.login(input);
    this.authService.setSessionCookie(this.ctx, result);
    return ok(parseWithSchema(AuthSessionUserSchema, result.user));
  }

  @Post('/logout')
  async logout() {
    this.authService.clearSessionCookie(this.ctx);
    return ok({ loggedOut: true });
  }

  @Get('/me')
  async me() {
    return ok(parseWithSchema(AuthSessionUserSchema, getAuthUser(this.ctx)));
  }

  @Post('/password')
  async changePassword() {
    const input = parseWithSchema(ChangePasswordRequestSchema, this.ctx.request.body);
    const result = await this.authService.changePassword(getAuthUser(this.ctx), input);
    this.authService.setSessionCookie(this.ctx, result);
    return ok(parseWithSchema(AuthSessionUserSchema, result.user));
  }

  @Get('/users')
  async users() {
    return ok(parseWithSchema(AuthUserSchema.array(), await this.authService.listUsers()));
  }

  @Post('/users')
  async createUser() {
    const input = parseWithSchema(CreateAuthUserRequestSchema, this.ctx.request.body);
    const user = await this.authService.createUser(getAuthUser(this.ctx), input);
    return ok(parseWithSchema(AuthUserSchema, user));
  }

  @Put('/users/:id')
  async updateUser() {
    const input = parseWithSchema(UpdateAuthUserRequestSchema, this.ctx.request.body);
    const user = await this.authService.updateUser(this.ctx.params.id as string, input);
    return ok(parseWithSchema(AuthUserSchema, user));
  }

  @Post('/users/:id/reset-password')
  async resetPassword() {
    const input = parseWithSchema(ResetAuthPasswordRequestSchema, this.ctx.request.body);
    const user = await this.authService.resetPassword(this.ctx.params.id as string, input);
    return ok(parseWithSchema(AuthUserSchema, user));
  }

  @Post('/users/:id/disable')
  async disableUser() {
    const user = await this.authService.setStatus(this.ctx.params.id as string, 'disabled');
    return ok(parseWithSchema(AuthUserSchema, user));
  }

  @Post('/users/:id/enable')
  async enableUser() {
    const user = await this.authService.setStatus(this.ctx.params.id as string, 'active');
    return ok(parseWithSchema(AuthUserSchema, user));
  }
}
