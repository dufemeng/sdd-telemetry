import { App, Configuration } from '@midwayjs/core';
import * as koa from '@midwayjs/koa';
import { join } from 'node:path';
import { ApiErrorFilter } from './common/filter/api-error.filter';
import './modules';

@Configuration({
  imports: [koa],
  importConfigs: [join(__dirname, './config')],
})
export class MainConfiguration {
  @App()
  app!: koa.Application;

  async onReady(): Promise<void> {
    this.app.useFilter([ApiErrorFilter]);
    console.info('[sdd-telemetry] server ready');
  }
}
