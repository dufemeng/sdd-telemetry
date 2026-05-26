import { Config, Inject, Provide } from '@midwayjs/core';
import type { IngestLogsResponse } from '@sdd-telemetry/api';
import { TypeOrmUnitOfWork } from '../../common/transaction/unit-of-work';
import { MysqlDataSourceManager } from '../../infrastructure/mysql/data-source-manager';
import { IngestWriteRepository } from './ingest-write.repository';
import {
  createUserKey,
  mergeUserHints,
  summarizeOtlpPayload,
  type OtlpUserHints,
} from './otel-payload-inspector';

interface SddMonitorConfig {
  maxOtlpPayloadBytes: number;
  maxOtlpLogRecords: number;
  rawRetentionDays: number;
}

export interface ReceiveLogsInput {
  payload: unknown;
  contentType: string | null;
  headerHints?: Partial<OtlpUserHints>;
  queryHints?: Partial<OtlpUserHints>;
}

@Provide('ingestReceiveService')
export class IngestReceiveService {
  @Inject('mysqlDataSourceManager')
  mysqlDataSourceManager!: MysqlDataSourceManager;

  @Inject('ingestWriteRepository')
  ingestWriteRepository!: IngestWriteRepository;

  @Config('sddMonitor')
  sddMonitorConfig!: SddMonitorConfig;

  async receiveLogs(input: ReceiveLogsInput): Promise<IngestLogsResponse> {
    const summary = summarizeOtlpPayload(input.payload);
    const maxPayloadBytes = this.sddMonitorConfig.maxOtlpPayloadBytes;

    if (summary.payloadBytes > maxPayloadBytes) {
      throw new Error(
        `OTLP payload is too large: ${summary.payloadBytes} bytes, limit ${maxPayloadBytes} bytes`,
      );
    }

    const maxLogRecords = this.sddMonitorConfig.maxOtlpLogRecords;
    if (summary.rawLogCount > maxLogRecords) {
      throw new Error(
        `OTLP payload has too many log records: ${summary.rawLogCount}, limit ${maxLogRecords}`,
      );
    }

    const withHeader = input.headerHints
      ? mergeUserHints(summary.userHints, input.headerHints)
      : summary.userHints;
    const mergedHints = input.queryHints
      ? mergeUserHints(withHeader, input.queryHints)
      : withHeader;
    const dataSource = await this.mysqlDataSourceManager.getDataSource();
    const unitOfWork = new TypeOrmUnitOfWork(dataSource);
    const userKey = createUserKey(mergedHints, summary.payloadHash);

    return unitOfWork.run(context => {
      if (!context.manager) {
        throw new Error('missing transaction manager');
      }

      return this.ingestWriteRepository.recordReceive(context.manager, {
        summary: { ...summary, userHints: mergedHints },
        userKey,
        rawRetentionDays: this.sddMonitorConfig.rawRetentionDays,
        contentType: input.contentType,
      });
    });
  }
}
