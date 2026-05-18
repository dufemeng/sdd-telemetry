import { Destroy, Provide } from '@midwayjs/core';
import type { DataSource } from 'typeorm';
import { createAppDataSource } from './data-source';

@Provide('mysqlDataSourceManager')
export class MysqlDataSourceManager {
  private dataSourcePromise: Promise<DataSource> | null = null;
  private dataSource: DataSource | null = null;

  async getDataSource(): Promise<DataSource> {
    if (!this.dataSourcePromise) {
      this.dataSourcePromise = this.initialize();
    }

    return this.dataSourcePromise;
  }

  @Destroy()
  async close(): Promise<void> {
    if (this.dataSource?.isInitialized) {
      await this.dataSource.destroy();
    }
  }

  private async initialize(): Promise<DataSource> {
    const dataSource = createAppDataSource();
    await dataSource.initialize();
    this.dataSource = dataSource;
    return dataSource;
  }
}
