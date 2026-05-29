import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { appEntities } from './entities';
import { CreateP0Schema1778769900000 } from './migrations/1778769900000-create-p0-schema';
import { RenameAuditColumns1778769950000 } from './migrations/1778769950000-rename-audit-columns';
import { AddWorkItemDetectionFields1778769960000 } from './migrations/1778769960000-add-work-item-detection-fields';
import { InteractionFidelity1778770000000 } from './migrations/1778770000000-interaction-fidelity';
import { AddOtelTraceIndex1779000000000 } from './migrations/1779000000000-add-otel-trace-index';
import { CreateAuthUsers1779868800000 } from './migrations/1779868800000-create-auth-users';
import { AddSkillUsageIdToToolCalls1780000000000 } from './migrations/1780000000000-add-skill-usage-id-to-tool-calls';
import { CreateWikiRecalls1780000001000 } from './migrations/1780000001000-create-wiki-recalls';
import { CreateOpsResourceSnapshots1780000002000 } from './migrations/1780000002000-create-ops-resource-snapshots';

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
      AddOtelTraceIndex1779000000000,
      CreateAuthUsers1779868800000,
      AddSkillUsageIdToToolCalls1780000000000,
      CreateWikiRecalls1780000001000,
      CreateOpsResourceSnapshots1780000002000,
    ],
  });
}
