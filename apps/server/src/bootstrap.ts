import 'reflect-metadata';
import { Bootstrap } from '@midwayjs/bootstrap';
import { MysqlDataSourceManager } from './infrastructure/mysql/data-source-manager';
import { IngestHealthService } from './modules/ingest/ingest-health.service';
import { IngestReceiveService } from './modules/ingest/ingest-receive.service';
import { IngestWriteRepository } from './modules/ingest/ingest-write.repository';

void Bootstrap.configure({
  preloadModules: [
    MysqlDataSourceManager,
    IngestHealthService,
    IngestReceiveService,
    IngestWriteRepository,
  ],
}).run();
