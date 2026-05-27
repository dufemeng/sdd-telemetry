import { App, Configuration } from '@midwayjs/core';
import * as koa from '@midwayjs/koa';
import { join } from 'node:path';
import { ApiErrorFilter } from './common/filter/api-error.filter';
import { AuthMiddleware } from './common/auth/auth.middleware';
import './modules';

@Configuration({
  imports: [koa],
  importConfigs: [join(__dirname, './config')],
})
export class MainConfiguration {
  @App()
  app!: koa.Application;

  async onReady(): Promise<void> {
    assertAuthConfiguration();
    this.app.useMiddleware([AuthMiddleware]);
    this.app.useFilter([ApiErrorFilter]);
    console.info('[sdd-telemetry] server ready');
  }
}

function assertAuthConfiguration(): void {
  const secret = process.env.AUTH_SESSION_SECRET;
  if ((process.env.NODE_ENV === 'production' || secret) && (!secret || secret.length < 32)) {
    throw new Error('AUTH_SESSION_SECRET must be configured with at least 32 characters');
  }
}
