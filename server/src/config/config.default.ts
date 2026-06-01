const isProduction = process.env.NODE_ENV === 'production';

export default {
  keys: 'sdd-telemetry-local-secret',
  midwayLogger: {
    default: {
      transports: {
        console: {
          autoColors: true,
        },
        file: false,
        error: false,
      },
    },
    clients: {
      coreLogger: {},
      appLogger: {},
    },
  },
  koa: {
    port: Number(process.env.PORT ?? 4318),
  },
  bodyParser: {
    jsonLimit: process.env.MAX_OTLP_BODY_LIMIT ?? '20mb',
    textLimit: process.env.MAX_OTLP_BODY_LIMIT ?? '20mb',
    formLimit: process.env.MAX_OTLP_BODY_LIMIT ?? '20mb',
  },
  sddMonitor: {
    maxOtlpPayloadBytes: Number(process.env.MAX_OTLP_PAYLOAD_BYTES ?? 5 * 1024 * 1024),
    maxOtlpLogRecords: Number(process.env.MAX_OTLP_LOG_RECORDS ?? 500),
    rawRetentionDays: Number(process.env.RAW_RETENTION_DAYS ?? 7),
    eventRetentionDays: Number(process.env.EVENT_RETENTION_DAYS ?? 30),
    textRetentionDays: Number(process.env.TEXT_RETENTION_DAYS ?? 30),
  },
  auth: {
    sessionSecret:
      process.env.AUTH_SESSION_SECRET ??
      (isProduction ? '' : 'sdd-telemetry-development-session-secret-only'),
    sessionMaxAgeSeconds: Number(process.env.AUTH_SESSION_MAX_AGE_SECONDS ?? 7 * 24 * 60 * 60),
    cookieSecure: process.env.AUTH_COOKIE_SECURE
      ? process.env.AUTH_COOKIE_SECURE === '1'
      : isProduction,
  },
  mysql: {
    host: process.env.MYSQL_HOST ?? '127.0.0.1',
    port: Number(process.env.MYSQL_PORT ?? 3306),
    username: process.env.MYSQL_USER ?? 'sdd-telemetry',
    password: process.env.MYSQL_PASSWORD ?? 'sdd-telemetry',
    database: process.env.MYSQL_DATABASE ?? 'sdd-telemetry',
  },
  redis: {
    host: process.env.REDIS_HOST ?? '127.0.0.1',
    port: Number(process.env.REDIS_PORT ?? 46379),
  },
  knowledgeBase: {
    rootPath: process.env.KNOWLEDGE_BASE_ROOT ?? '',
    contentMaxBytes: Number(process.env.WIKI_CONTENT_MAX_BYTES ?? 512 * 1024),
    scanCacheTtlMs: Number(process.env.WIKI_SCAN_CACHE_TTL_MS ?? 600_000),
    deadKnowledgeGraceDays: Number(process.env.WIKI_DEAD_GRACE_DAYS ?? 30),
  },
  dailyReport: {
    scheduleEnabled: process.env.DAILY_REPORT_SCHEDULE_ENABLED !== 'false',
    scheduleTime: process.env.DAILY_REPORT_SCHEDULE_TIME ?? '12:00',
    timezone: process.env.DAILY_REPORT_TIMEZONE ?? 'Asia/Shanghai',
    baseUrl: process.env.DAILY_REPORT_BASE_URL ?? '',
  },
};
