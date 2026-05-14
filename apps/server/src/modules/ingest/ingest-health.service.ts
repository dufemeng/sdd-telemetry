import { Provide } from '@midwayjs/core';
import type { IngestHealth } from '@sdd-monitor/api';

@Provide('ingestHealthService')
export class IngestHealthService {
  async getHealth(windowHours: number): Promise<IngestHealth> {
    return {
      windowHours,
      totalBatches: 0,
      parsedBatches: 0,
      processingBatches: 0,
      failedBatches: 0,
      duplicateBatches: 0,
      totalPayloadBytes: 0,
      latestReceivedAt: null,
      latestParsedAt: null,
      queue: {
        pendingOutbox: 0,
        queuedJobs: 0,
        activeJobs: 0,
        failedJobs: 0,
      },
    };
  }
}
