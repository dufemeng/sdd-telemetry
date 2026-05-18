import { Destroy, Provide } from '@midwayjs/core';
import type { DataSource } from 'typeorm';
import { createAppDataSource } from './data-source';

// tsx watch 是同进程热重载（不发 SIGTERM，@Destroy 不会在热重载时触发）。
// 把 DataSource 存在 global 上，让它跨模块缓存清除存活，避免每次热重载泄漏连接池。
const DS_KEY = Symbol.for('sdd:mysql:dataSource');
type G = typeof globalThis & { [DS_KEY]?: DataSource };

@Provide('mysqlDataSourceManager')
export class MysqlDataSourceManager {
  private dataSourcePromise: Promise<DataSource> | null = null;

  async getDataSource(): Promise<DataSource> {
    if (!this.dataSourcePromise) {
      this.dataSourcePromise = this.initialize();
    }
    return this.dataSourcePromise;
  }

  @Destroy()
  async close(): Promise<void> {
    const ds = (global as G)[DS_KEY];
    if (ds?.isInitialized) {
      await ds.destroy();
      delete (global as G)[DS_KEY];
    }
    this.dataSourcePromise = null;
  }

  private async initialize(): Promise<DataSource> {
    const g = global as G;
    if (g[DS_KEY]?.isInitialized) {
      return g[DS_KEY]!;
    }
    const dataSource = createAppDataSource();
    await dataSource.initialize();
    g[DS_KEY] = dataSource;
    return dataSource;
  }
}
