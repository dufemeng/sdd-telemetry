import { Inject, Provide } from '@midwayjs/core';
import type {
  EventDistributionQuery,
  EventTimelineQuery,
  FieldValuesQuery,
  TimeRangeQuery,
} from '@sdd-telemetry/api';
import { MysqlDataSourceManager } from '../../infrastructure/mysql/data-source-manager';
import { addTimeRangeWhere, whereSql } from '../query-utils';

export interface CountRow {
  count_value: string | number;
}

export interface DistributionRow {
  event_name: string;
  count_value: string | number;
  latest_at: Date | string | null;
}

export interface EventSampleRow {
  event_name: string;
  session_id: string | null;
  prompt_id: string | null;
  service_name: string | null;
  service_version: string | null;
  severity_text: string | null;
  attributes_json: unknown;
  resource_json: unknown;
  body_text: string | null;
}

export interface TimelineRow {
  bucket_start: Date | string;
  event_count: string | number;
  distinct_event_names: string | number;
}

type TimeRangeInput =
  | TimeRangeQuery
  | EventDistributionQuery
  | EventTimelineQuery
  | FieldValuesQuery;

@Provide('eventsQueryRepository')
export class EventsQueryRepository {
  @Inject('mysqlDataSourceManager')
  mysqlDataSourceManager!: MysqlDataSourceManager;

  async countTotal(window: TimeRangeInput): Promise<CountRow[]> {
    const dataSource = await this.mysqlDataSourceManager.getDataSource();
    const clauses: string[] = [];
    const params: unknown[] = [];
    addTimeRangeWhere(clauses, params, 'event_time', window);
    return (await dataSource.query(
      `SELECT COUNT(*) AS count_value FROM otel_log_events ${whereSql(clauses)}`,
      params,
    )) as CountRow[];
  }

  async countDistinctEventNames(window: TimeRangeInput): Promise<CountRow[]> {
    const dataSource = await this.mysqlDataSourceManager.getDataSource();
    const clauses: string[] = [];
    const params: unknown[] = [];
    addTimeRangeWhere(clauses, params, 'event_time', window);
    return (await dataSource.query(
      `SELECT COUNT(DISTINCT event_name) AS count_value FROM otel_log_events ${whereSql(clauses)}`,
      params,
    )) as CountRow[];
  }

  async aggregateByEventName(
    window: TimeRangeInput,
    limit: number,
  ): Promise<DistributionRow[]> {
    const dataSource = await this.mysqlDataSourceManager.getDataSource();
    const clauses: string[] = [];
    const params: unknown[] = [];
    addTimeRangeWhere(clauses, params, 'event_time', window);
    return (await dataSource.query(
      `SELECT event_name, COUNT(*) AS count_value, MAX(event_time) AS latest_at
       FROM otel_log_events
       ${whereSql(clauses)}
       GROUP BY event_name
       ORDER BY count_value DESC, event_name ASC
       LIMIT ?`,
      [...params, limit],
    )) as DistributionRow[];
  }

  async sampleEvents(window: TimeRangeInput, sampleSize: number): Promise<EventSampleRow[]> {
    const dataSource = await this.mysqlDataSourceManager.getDataSource();
    const clauses: string[] = [];
    const params: unknown[] = [];
    addTimeRangeWhere(clauses, params, 'event_time', window);
    return (await dataSource.query(
      `SELECT event_name, session_id, prompt_id, service_name, service_version,
              severity_text, attributes_json, resource_json, body_text
       FROM otel_log_events
       ${whereSql(clauses)}
       ORDER BY id DESC
       LIMIT ?`,
      [...params, sampleSize],
    )) as EventSampleRow[];
  }

  async bucketizeByTimestamp(
    window: TimeRangeInput,
    bucket: 'day' | 'hour',
  ): Promise<TimelineRow[]> {
    const dataSource = await this.mysqlDataSourceManager.getDataSource();
    const clauses: string[] = ['event_time IS NOT NULL'];
    const params: unknown[] = [];
    addTimeRangeWhere(clauses, params, 'event_time', window);
    const format = bucket === 'day' ? '%Y-%m-%d 00:00:00' : '%Y-%m-%d %H:00:00';

    return (await dataSource.query(
      `SELECT STR_TO_DATE(DATE_FORMAT(event_time, ?), '%Y-%m-%d %H:%i:%s') AS bucket_start,
              COUNT(*) AS event_count,
              COUNT(DISTINCT event_name) AS distinct_event_names
       FROM otel_log_events
       ${whereSql(clauses)}
       GROUP BY bucket_start
       ORDER BY bucket_start ASC`,
      [format, ...params],
    )) as TimelineRow[];
  }
}
