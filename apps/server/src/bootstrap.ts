import 'reflect-metadata';
import { Bootstrap } from '@midwayjs/bootstrap';
import { MysqlDataSourceManager } from './infrastructure/mysql/data-source-manager';
import { IngestHealthService } from './modules/ingest/ingest-health.service';
import { IngestReceiveService } from './modules/ingest/ingest-receive.service';
import { IngestWriteRepository } from './modules/ingest/ingest-write.repository';
import { EventsQueryService } from './modules/events/events-query.service';
import { OpsQueryService } from './modules/ops/ops-query.service';
import { SddQueryService } from './modules/sdd/sdd-query.service';

void Bootstrap.configure({
  preloadModules: [
    MysqlDataSourceManager,
    IngestHealthService,
    IngestReceiveService,
    IngestWriteRepository,
    EventsQueryService,
    OpsQueryService,
    SddQueryService,
  ],
}).run();
