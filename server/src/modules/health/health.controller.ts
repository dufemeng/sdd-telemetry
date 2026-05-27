import { Controller, Get } from '@midwayjs/core';
import { HealthzSchema } from '@sdd-telemetry/api';
import { ok } from '../../common/response/api-response';
import { parseWithSchema } from '../../common/validation/parse-with-schema';

@Controller('/api')
export class HealthController {
  @Get('/healthz')
  async healthz() {
    return ok(parseWithSchema(HealthzSchema, { status: 'ok' }));
  }
}
