import { createAppDataSource } from './data-source';

async function main(): Promise<void> {
  const dataSource = createAppDataSource();
  await dataSource.initialize();
  await dataSource.runMigrations();
  await dataSource.destroy();
}

void main();
