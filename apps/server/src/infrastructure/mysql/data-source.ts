import { DataSource } from 'typeorm';

export function createAppDataSource(): DataSource {
  return new DataSource({
    type: 'mysql',
    host: process.env.MYSQL_HOST ?? '127.0.0.1',
    port: Number(process.env.MYSQL_PORT ?? 3306),
    username: process.env.MYSQL_USER ?? 'sdd_monitor',
    password: process.env.MYSQL_PASSWORD ?? 'sdd_monitor',
    database: process.env.MYSQL_DATABASE ?? 'sdd_monitor',
    timezone: 'Z',
    synchronize: false,
    logging: false,
    entities: [],
    migrations: [],
  });
}
