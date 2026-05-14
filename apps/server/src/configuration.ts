import { App, Configuration } from '@midwayjs/core';
import * as koa from '@midwayjs/koa';
import { join } from 'node:path';
import './modules';

@Configuration({
  imports: [koa],
  importConfigs: [join(__dirname, './config')],
})
export class MainConfiguration {
  @App()
  app!: koa.Application;

  async onReady(): Promise<void> {
    console.info('[sdd-monitor] server ready');
  }
}
