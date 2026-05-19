import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { appEntities } from './entities';
import { CreateP0Schema1778769900000 } from './migrations/1778769900000-create-p0-schema';
import { RenameAuditColumns1778769950000 } from './migrations/1778769950000-rename-audit-columns';
import { AddWorkItemDetectionFields1778769960000 } from './migrations/1778769960000-add-work-item-detection-fields';
import { InteractionFidelity1778770000000 } from './migrations/1778770000000-interaction-fidelity';

export function createAppDataSource(): DataSource {
  return new DataSource({
    type: 'mysql',
    host: process.env.MYSQL_HOST ?? '127.0.0.1',
    port: Number(process.env.MYSQL_PORT ?? 3306),
    username: process.env.MYSQL_USER ?? 'sdd-telemetry',
    password: process.env.MYSQL_PASSWORD ?? 'sdd-telemetry',
    database: process.env.MYSQL_DATABASE ?? 'sdd-telemetry',
    timezone: 'Z',
    synchronize: false,
    logging: false,
    extra: {
      connectionLimit: Number(process.env.MYSQL_CONNECTION_LIMIT ?? 5),
    },
    entities: appEntities,
    migrations: [
      CreateP0Schema1778769900000,
      RenameAuditColumns1778769950000,
      AddWorkItemDetectionFields1778769960000,
      InteractionFidelity1778770000000,
    ],
  });
}
