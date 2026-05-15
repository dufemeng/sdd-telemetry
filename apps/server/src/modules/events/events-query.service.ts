import { Inject, Provide } from '@midwayjs/core';
import type {
  EventDistribution,
  EventDistributionQuery,
  EventTimeline,
  EventTimelineQuery,
  FieldCoverage,
  FieldValues,
  FieldValuesQuery,
  TimeRangeQuery,
} from '@sdd-monitor/api';
import { MysqlDataSourceManager } from '../../infrastructure/mysql/data-source-manager';
import {
  addTimeRangeWhere,
  parseJsonRecord,
  readPath,
  stringifyScalar,
  toIsoDate,
  toNumber,
  whereSql,
} from '../query-utils';

interface CountRow {
  count_value: string | number;
}

interface DistributionRow {
  event_name: string;
  count_value: string | number;
  latest_at: Date | string | null;
}

interface EventSampleRow {
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

interface TimelineRow {
  bucket_start: Date | string;
  event_count: string | number;
  distinct_event_names: string | number;
}

const eventDescriptions: Record<string, string> = {
  api_request_body: 'LLM 请求体事件，通常包含 prompt、session 和 skill 调用上下文。',
  api_response_body: 'LLM 响应体事件，通常包含模型输出、耗时和完成状态。',
  tool_exception: '工具或 skill 执行过程中的强错误事件。',
};

@Provide('eventsQueryService')
export class EventsQueryService {
  @Inject('mysqlDataSourceManager')
  mysqlDataSourceManager!: MysqlDataSourceManager;

  async getDistribution(query: EventDistributionQuery): Promise<EventDistribution> {
    const dataSource = await this.mysqlDataSourceManager.getDataSource();
    const clauses: string[] = [];
    const params: unknown[] = [];
    addTimeRangeWhere(clauses, params, 'event_time', query);

    const [totalRows, distinctRows, rows] = await Promise.all([
      dataSource.query(
        `SELECT COUNT(*) AS count_value FROM otel_log_events ${whereSql(clauses)}`,
        params,
      ) as Promise<CountRow[]>,
      dataSource.query(
        `SELECT COUNT(DISTINCT event_name) AS count_value FROM otel_log_events ${whereSql(clauses)}`,
        params,
      ) as Promise<CountRow[]>,
      dataSource.query(
        `SELECT event_name, COUNT(*) AS count_value, MAX(event_time) AS latest_at
         FROM otel_log_events
         ${whereSql(clauses)}
         GROUP BY event_name
         ORDER BY count_value DESC, event_name ASC
         LIMIT ?`,
        [...params, query.limit],
      ) as Promise<DistributionRow[]>,
    ]);
    const totalEvents = toNumber(totalRows[0]?.count_value);

    return {
      totalEvents,
      distinctEventNames: toNumber(distinctRows[0]?.count_value),
      items: rows.map(row => {
        const count = toNumber(row.count_value);
        return {
          eventName: row.event_name,
          description: eventDescriptions[row.event_name] ?? null,
          count,
          percentage: totalEvents > 0 ? count / totalEvents : 0,
          latestAt: toIsoDate(row.latest_at),
        };
      }),
    };
  }

  async getFieldCoverage(query: TimeRangeQuery): Promise<FieldCoverage> {
    const dataSource = await this.mysqlDataSourceManager.getDataSource();
    const clauses: string[] = [];
    const params: unknown[] = [];
    addTimeRangeWhere(clauses, params, 'event_time', query);

    const [totalRows, sampleRows] = await Promise.all([
      dataSource.query(
        `SELECT COUNT(*) AS count_value FROM otel_log_events ${whereSql(clauses)}`,
        params,
      ) as Promise<CountRow[]>,
      dataSource.query(
        `SELECT event_name, session_id, prompt_id, service_name, service_version,
                severity_text, attributes_json, resource_json, body_text
         FROM otel_log_events
         ${whereSql(clauses)}
         ORDER BY id DESC
         LIMIT 1000`,
        params,
      ) as Promise<EventSampleRow[]>,
    ]);

    const totalEvents = toNumber(totalRows[0]?.count_value);
    const coverage = new Map<string, { presentCount: number; examples: Set<string> }>();

    for (const row of sampleRows) {
      const fields: Record<string, unknown> = {
        event_name: row.event_name,
        session_id: row.session_id,
        prompt_id: row.prompt_id,
        service_name: row.service_name,
        service_version: row.service_version,
        severity_text: row.severity_text,
        body_text: row.body_text,
      };
      const attributes = parseJsonRecord(row.attributes_json);
      const resource = parseJsonRecord(row.resource_json);

      for (const [key, value] of Object.entries(attributes)) {
        fields[`attributes.${key}`] = value;
      }
      for (const [key, value] of Object.entries(resource)) {
        fields[`resource.${key}`] = value;
      }

      for (const [fieldPath, value] of Object.entries(fields)) {
        const example = stringifyScalar(value);
        if (!example) {
          continue;
        }

        const item = coverage.get(fieldPath) ?? { presentCount: 0, examples: new Set<string>() };
        item.presentCount += 1;
        if (item.examples.size < 5) {
          item.examples.add(example);
        }
        coverage.set(fieldPath, item);
      }
    }

    const denominator = totalEvents > 0 ? totalEvents : sampleRows.length;

    return {
      totalEvents,
      fields: Array.from(coverage.entries())
        .map(([fieldPath, value]) => ({
          fieldPath,
          presentCount: value.presentCount,
          coverageRate: denominator > 0 ? value.presentCount / denominator : 0,
          examples: Array.from(value.examples),
        }))
        .sort((a, b) => b.presentCount - a.presentCount || a.fieldPath.localeCompare(b.fieldPath)),
    };
  }

  async getFieldValues(query: FieldValuesQuery): Promise<FieldValues> {
    const dataSource = await this.mysqlDataSourceManager.getDataSource();
    const clauses: string[] = [];
    const params: unknown[] = [];
    addTimeRangeWhere(clauses, params, 'event_time', query);

    const rows = (await dataSource.query(
      `SELECT event_name, session_id, prompt_id, service_name, service_version,
              severity_text, attributes_json, resource_json, body_text
       FROM otel_log_events
       ${whereSql(clauses)}
       ORDER BY id DESC
       LIMIT 5000`,
      params,
    )) as EventSampleRow[];

    const counts = new Map<string, number>();
    for (const row of rows) {
      const value = this.readFieldValue(row, query.fieldPath);
      const scalar = stringifyScalar(value);
      if (!scalar) {
        continue;
      }

      counts.set(scalar, (counts.get(scalar) ?? 0) + 1);
    }

    const totalEvents = rows.length;
    const values = Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, query.limit)
      .map(([value, count]) => ({
        value,
        count,
        percentage: totalEvents > 0 ? count / totalEvents : 0,
      }));

    return {
      fieldPath: query.fieldPath,
      totalEvents,
      values,
    };
  }

  async getTimeline(query: EventTimelineQuery): Promise<EventTimeline> {
    const dataSource = await this.mysqlDataSourceManager.getDataSource();
    const clauses = ['event_time IS NOT NULL'];
    const params: unknown[] = [];
    addTimeRangeWhere(clauses, params, 'event_time', query);
    const format = query.bucket === 'day' ? '%Y-%m-%d 00:00:00' : '%Y-%m-%d %H:00:00';
    const intervalSql = query.bucket === 'day' ? 'INTERVAL 1 DAY' : 'INTERVAL 1 HOUR';

    const rows = (await dataSource.query(
      `SELECT STR_TO_DATE(DATE_FORMAT(event_time, ?), '%Y-%m-%d %H:%i:%s') AS bucket_start,
              COUNT(*) AS event_count,
              COUNT(DISTINCT event_name) AS distinct_event_names
       FROM otel_log_events
       ${whereSql(clauses)}
       GROUP BY bucket_start
       ORDER BY bucket_start ASC`,
      [format, ...params],
    )) as TimelineRow[];

    return {
      bucket: query.bucket,
      buckets: rows.map(row => ({
        bucketStart: toIsoDate(row.bucket_start) ?? new Date(0).toISOString(),
        bucketEnd:
          toIsoDate(row.bucket_start) === null
            ? new Date(0).toISOString()
            : new Date(
                new Date(row.bucket_start).getTime() + (query.bucket === 'day' ? 86400000 : 3600000),
              ).toISOString(),
        eventCount: toNumber(row.event_count),
        distinctEventNames: toNumber(row.distinct_event_names),
      })),
    };
  }

  private readFieldValue(row: EventSampleRow, fieldPath: string): unknown {
    if (fieldPath.startsWith('attributes.')) {
      return readPath(parseJsonRecord(row.attributes_json), fieldPath.slice('attributes.'.length));
    }

    if (fieldPath.startsWith('resource.')) {
      return readPath(parseJsonRecord(row.resource_json), fieldPath.slice('resource.'.length));
    }

    return (row as unknown as Record<string, unknown>)[fieldPath];
  }
}
