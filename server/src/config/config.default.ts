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
};
