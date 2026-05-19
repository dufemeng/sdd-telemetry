import 'reflect-metadata';
import { Bootstrap } from '@midwayjs/bootstrap';
import { ApiErrorFilter } from './common/filter/api-error.filter';
import { MysqlDataSourceManager } from './infrastructure/mysql/data-source-manager';
import { IngestHealthRepository } from './modules/ingest/ingest-health.repository';
import { IngestHealthService } from './modules/ingest/ingest-health.service';
import { IngestReceiveService } from './modules/ingest/ingest-receive.service';
import { IngestWriteRepository } from './modules/ingest/ingest-write.repository';
import { EventsQueryRepository } from './modules/events/events-query.repository';
import { EventsQueryService } from './modules/events/events-query.service';
import { OpsQueryRepository } from './modules/ops/ops-query.repository';
import { OpsQueryService } from './modules/ops/ops-query.service';
import { SddQueryService } from './modules/sdd/sdd-query.service';
import { SddWriteRepository } from './modules/sdd/sdd-write.repository';

void Bootstrap.configure({
  preloadModules: [
    ApiErrorFilter,
    MysqlDataSourceManager,
    IngestHealthRepository,
    IngestHealthService,
    IngestReceiveService,
    IngestWriteRepository,
    EventsQueryRepository,
    EventsQueryService,
    OpsQueryRepository,
    OpsQueryService,
    SddQueryService,
    SddWriteRepository,
  ],
}).run();
