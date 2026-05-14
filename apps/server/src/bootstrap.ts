import 'reflect-metadata';
import { Bootstrap } from '@midwayjs/bootstrap';
import { IngestHealthService } from './modules/ingest/ingest-health.service';

void Bootstrap.configure({
  preloadModules: [IngestHealthService],
}).run();
