import { Controller, Get } from '@midwayjs/core';
import type { SddFunnel, SddSemantic } from '@sdd-monitor/api';
import { ok } from '../../common/response/api-response';

@Controller('/api/sdd')
export class SddController {
  @Get('/semantics')
  async semantics() {
    const data: SddSemantic[] = [];
    return ok(data);
  }

  @Get('/funnel')
  async funnel() {
    const data: SddFunnel = {
      totalInteractions: 0,
      totalSkillUsages: 0,
      stages: [],
    };
    return ok(data);
  }
}
