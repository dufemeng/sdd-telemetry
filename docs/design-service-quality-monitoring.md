# 系统设计：服务质量与资源监测

## 背景

当前生产部署通过 `compose.prod.yml` 启动一个 Docker Compose project：

- `mysql`：`sdd-telemetry-mysql`，持久化卷 `mysql-data`
- `server`：`sdd-telemetry-server`，对外 API 默认 `4318`
- `worker`：`sdd-telemetry-worker`
- `web`：`sdd-telemetry-web`，对外 Web 默认 `18080`

部署脚本会在服务器部署目录写 `.env`，核心变量包括：

- `SDD_TELEMETRY_APP_IMAGE`
- `SDD_TELEMETRY_WEB_IMAGE`
- `DEPLOY_VERSION`
- `WEB_PUBLISHED_PORT`
- `API_PUBLISHED_PORT`

目标是在不误伤同事服务的前提下，只观察本项目占用，并在后台页面展示 CPU、内存、镜像/容器/部署包大小、数据库大小、队列健康等服务质量指标。

## 服务器上立即查看

以下命令建议在服务器部署目录执行，例如 `~/project/sdd-telemetry-deploy`。

### 项目部署目录大小

```bash
du -sh .
du -sh releases 2>/dev/null || true
du -sh *.tar.gz 2>/dev/null || true
```

含义：

- `.`：部署目录整体，包括 `.env`、compose 文件、release 包、解压目录等。
- `releases`：部署脚本下载或解包的历史发布产物。
- `*.tar.gz`：离线镜像包或 bundle。

### 当前项目容器 CPU / 内存

```bash
docker compose --env-file .env -f compose.prod.yml ps
docker stats --no-stream \
  sdd-telemetry-server \
  sdd-telemetry-worker \
  sdd-telemetry-web \
  sdd-telemetry-mysql
```

`docker stats --no-stream` 是当前快照，不是历史趋势。它能回答“现在是不是占满 CPU/内存”，不能回答“过去一小时是否抖动”。

### 当前项目镜像大小

```bash
set -a
. ./.env
set +a

docker images 'sdd-telemetry-*'
docker image inspect "$SDD_TELEMETRY_APP_IMAGE" --format '{{.Size}}'
docker image inspect "$SDD_TELEMETRY_WEB_IMAGE" --format '{{.Size}}'
docker system df -v
```

注意：Docker 镜像层会共享，单个镜像 `.Size` 相加通常会高估真实磁盘占用；`docker system df -v` 更适合看全机 Docker 层面的实际占用，但会包含同事服务。

### 当前项目容器可写层大小

```bash
docker ps -a --size --filter 'name=sdd-telemetry'
```

容器可写层应保持较小。大文件应进入 MySQL volume 或外部对象存储，而不是写进 `server/worker/web` 容器层。

### MySQL 数据库逻辑大小

```bash
docker compose --env-file .env -f compose.prod.yml exec mysql sh -lc '
mysql -u"$MYSQL_USER" -p"$MYSQL_PASSWORD" "$MYSQL_DATABASE" -e "
SELECT
  table_schema,
  ROUND(SUM(data_length + index_length) / 1024 / 1024, 2) AS total_mib,
  ROUND(SUM(data_length) / 1024 / 1024, 2) AS data_mib,
  ROUND(SUM(index_length) / 1024 / 1024, 2) AS index_mib
FROM information_schema.tables
WHERE table_schema = DATABASE()
GROUP BY table_schema;
SELECT
  table_name,
  table_rows,
  ROUND((data_length + index_length) / 1024 / 1024, 2) AS total_mib,
  ROUND(data_length / 1024 / 1024, 2) AS data_mib,
  ROUND(index_length / 1024 / 1024, 2) AS index_mib
FROM information_schema.tables
WHERE table_schema = DATABASE()
ORDER BY data_length + index_length DESC;"
'
```

逻辑大小来自 MySQL 元数据，适合展示“业务表和索引大概多大”。物理 volume 还会包含 redo/undo/binlog/临时文件等，不一定等于表大小。

### MySQL volume 物理大小

```bash
docker exec sdd-telemetry-mysql du -sh /var/lib/mysql
```

这更接近磁盘真实占用。如果 MySQL 镜像内没有 `du`，可改为在宿主机查看 Docker volume 路径，但不同服务器 Docker root 目录可能不同，不建议把该路径写死进系统设计。

## 风险边界

### 不要默认直接读取全机资源

当前需求关心“我的项目是否影响别人，以及别人是否影响我”。这需要区分两个范围：

- 项目内资源：只统计 Compose project `sdd-telemetry` 下的容器、镜像、卷、数据库。
- 宿主机资源：全机 CPU、内存、磁盘、Docker 总占用，用来判断外部服务是否挤压本项目。

项目页面默认应展示项目内资源；宿主机资源只展示必要摘要，例如磁盘剩余、全机内存剩余、Docker 总占用。不要列出同事服务的容器名、镜像名和端口，避免越权观察。

### Docker socket 权限很高

读取 Docker 容器 stats 最直接的方式是访问 `/var/run/docker.sock`。即使只读挂载，Docker socket 本身仍接近宿主机 root 级能力。因此不建议让 Web 或普通 API server 直接挂载 socket。

推荐方案：

- 新增独立 `ops-agent` 服务，最小权限运行，专门采集 Docker stats。
- `ops-agent` 只按 Compose label `com.docker.compose.project=sdd-telemetry` 过滤本项目容器。
- `ops-agent` 将快照写入 MySQL，`server` 只读 MySQL 后提供 API。
- 页面只访问已有登录体系保护下的 `/api/ops/*`。

## 推荐架构

```text
Docker Engine / MySQL
        │
        │ 10s / 30s polling
        ▼
ops-agent
  - 读取 Docker stats / image inspect / container size
  - 查询 MySQL information_schema
  - 只保留 sdd-telemetry compose project
        │
        │ write snapshots
        ▼
MySQL ops_resource_snapshots
        │
        │ read
        ▼
server /api/ops/resources/*
        │
        ▼
web /ops/resources
```

短期也可以先不落库，`server` 直接查询 `information_schema` 展示数据库大小，Docker 资源仍用命令人工查看。这样改动小，但没有 CPU/内存历史趋势。

## 数据来源

| 指标 | 来源 | 精度 | 备注 |
| --- | --- | --- | --- |
| 服务状态 | Docker container inspect | 当前值 | running、health、restartCount |
| CPU% | Docker stats stream=false | 当前值/快照 | 需按 Docker 公式计算 |
| 内存用量 | Docker stats | 当前值/快照 | usage、limit、percent |
| 网络 I/O | Docker stats | 累计值 | 可用相邻快照算增量 |
| Block I/O | Docker stats | 累计值 | 可用相邻快照算增量 |
| 容器可写层 | Docker inspect size=1 | 当前值 | sizeRw、sizeRootFs |
| 镜像大小 | Docker image inspect | 当前值 | `.Size` 是虚拟大小 |
| 部署目录大小 | agent 执行 `du` 或宿主机挂载 | 当前值 | 可选，依赖部署目录挂载 |
| 数据库总大小 | `information_schema.tables` | 当前值 | data_length + index_length |
| 表大小排行 | `information_schema.tables` | 当前值 | 可复用现有 Ops 数据库页 |
| 队列健康 | `ingest_outbox` 聚合 | 当前值 | 现有 `/api/ops/queue` 已有基础 |
| 采集健康 | 现有 ingest health | 当前值 | 现有页面可复用 |

## API contract

新增到 `packages/api/src/contracts/ops.contract.ts`。

### `GET /api/ops/resources/summary`

返回当前快照。

```ts
export const OpsResourceSummarySchema = z.object({
  capturedAt: ISODateTimeSchema,
  project: z.object({
    name: z.string(),
    deployVersion: z.string().nullable(),
    appImage: z.string().nullable(),
    webImage: z.string().nullable(),
  }),
  totals: z.object({
    cpuPercent: z.number().nullable(),
    memoryUsageBytes: z.number().nullable(),
    memoryLimitBytes: z.number().nullable(),
    imageSizeBytes: z.number().nullable(),
    containerWritableBytes: z.number().nullable(),
    databaseBytes: z.number().nullable(),
    deployDirectoryBytes: z.number().nullable(),
  }),
  services: z.array(z.object({
    serviceName: z.enum(['mysql', 'server', 'worker', 'web']),
    containerName: z.string(),
    state: z.string(),
    health: z.string().nullable(),
    restartCount: z.number(),
    cpuPercent: z.number().nullable(),
    memoryUsageBytes: z.number().nullable(),
    memoryLimitBytes: z.number().nullable(),
    memoryPercent: z.number().nullable(),
    networkRxBytes: z.number().nullable(),
    networkTxBytes: z.number().nullable(),
    blockReadBytes: z.number().nullable(),
    blockWriteBytes: z.number().nullable(),
    writableLayerBytes: z.number().nullable(),
    imageRef: z.string().nullable(),
    imageSizeBytes: z.number().nullable(),
  })),
  database: z.object({
    totalBytes: z.number(),
    dataBytes: z.number(),
    indexBytes: z.number(),
    tables: z.array(z.object({
      tableName: z.string(),
      estimatedRows: z.number(),
      totalBytes: z.number(),
      dataBytes: z.number(),
      indexBytes: z.number(),
      updatedAt: ISODateTimeSchema.nullable(),
    })),
  }),
  alerts: z.array(z.object({
    level: z.enum(['warn', 'bad']),
    code: z.string(),
    message: z.string(),
    target: z.string(),
  })),
});
```

### `GET /api/ops/resources/history`

查询历史趋势。

```ts
export const OpsResourceHistoryQuerySchema = z.object({
  range: z.enum(['1h', '6h', '24h', '7d']).default('6h'),
  serviceName: z.enum(['mysql', 'server', 'worker', 'web', 'total']).default('total'),
  metric: z.enum(['cpu', 'memory', 'database', 'writableLayer']).default('memory'),
});
```

Response：

```ts
export const OpsResourceHistorySchema = z.object({
  metric: z.string(),
  serviceName: z.string(),
  points: z.array(z.object({
    timestamp: ISODateTimeSchema,
    value: z.number().nullable(),
  })),
});
```

## 数据库表

建议新增一张快照表，保留 7 到 30 天。

```sql
CREATE TABLE ops_resource_snapshots (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  captured_at DATETIME(3) NOT NULL,
  project_name VARCHAR(128) NOT NULL,
  service_name VARCHAR(64) NOT NULL,
  container_name VARCHAR(255) NULL,
  container_id VARCHAR(128) NULL,
  state VARCHAR(64) NULL,
  health VARCHAR(64) NULL,
  restart_count INT UNSIGNED NOT NULL DEFAULT 0,
  cpu_percent DECIMAL(8,4) NULL,
  memory_usage_bytes BIGINT UNSIGNED NULL,
  memory_limit_bytes BIGINT UNSIGNED NULL,
  network_rx_bytes BIGINT UNSIGNED NULL,
  network_tx_bytes BIGINT UNSIGNED NULL,
  block_read_bytes BIGINT UNSIGNED NULL,
  block_write_bytes BIGINT UNSIGNED NULL,
  writable_layer_bytes BIGINT UNSIGNED NULL,
  image_ref VARCHAR(255) NULL,
  image_size_bytes BIGINT UNSIGNED NULL,
  database_bytes BIGINT UNSIGNED NULL,
  deploy_directory_bytes BIGINT UNSIGNED NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  KEY idx_ops_resource_snapshots_time (captured_at),
  KEY idx_ops_resource_snapshots_service_time (service_name, captured_at)
);
```

表大小明细可以不落库，`summary` 请求实时查 `information_schema.tables` 即可。若后续需要表大小趋势，再新增 `ops_database_table_size_snapshots`。

## 后端实现

### `ops-agent`

可复用现有 app image，新起一个 Compose service：

```yaml
ops-agent:
  image: ${SDD_TELEMETRY_APP_IMAGE:-sdd-telemetry-app:local}
  container_name: sdd-telemetry-ops-agent
  restart: unless-stopped
  working_dir: /app/worker
  environment: *app-env
  command: ["node", "dist/ops-resource-agent.js"]
  volumes:
    - /var/run/docker.sock:/var/run/docker.sock:ro
  depends_on:
    mysql:
      condition: service_healthy
```

采集策略：

- 默认 `OPS_RESOURCE_MONITOR_ENABLED=0`，生产确认后再打开。
- `OPS_RESOURCE_POLL_INTERVAL_SECONDS=30`。
- 只采集 label `com.docker.compose.project=sdd-telemetry` 的容器。
- 每轮采集失败只记日志，不影响 `server/worker/web`。
- 快照保留默认 14 天，定期删除旧记录。

### `server`

新增：

- `OpsResourceRepository`
- `OpsResourceService`
- `GET /api/ops/resources/summary`
- `GET /api/ops/resources/history`

权限沿用现有 `requiresSuperAdmin`：`/api/ops/*` 只有 `super_admin` 可访问。

数据库大小可在 `OpsQueryRepository` 当前 `information_schema.tables` 查询基础上扩展字段：

- `data_length`
- `index_length`
- `table_rows`

现有“数据检索”页已有表列表和 schema 视图，不建议混在一起；资源页只展示表大小排行和总量。

## 前端页面

新增路由：`/ops/resources`。

导航位置：

- 侧边栏“管理”分组新增 `服务质量`，图标可用 `Activity` 或 `Gauge`。
- 继续放在 `AdminOnly` 下，只给 `super_admin`。

页面结构：

```text
服务质量 /ops/resources
  KPI Row
    - 项目状态
    - CPU 当前占用
    - 内存当前占用
    - 数据库大小
    - 镜像大小
    - 容器可写层
  服务表
    mysql / server / worker / web
    state / health / restarts / cpu / memory / net io / block io / image
  趋势图
    CPU、内存、数据库大小，支持 1h / 6h / 24h / 7d
  数据库大小排行
    table / rows / data / index / total
  风险提示
    阈值超限、容器重启、健康检查失败、outbox 堆积
```

组件复用：

- `StatCard`
- `Panel`
- `DataTable`
- `StatusBadge`
- `formatBytes`

需要补强：

- `formatBytes` 当前最大到 MiB，资源页应支持 GiB / TiB。
- 趋势图可复用 `web/src/pages/sdd/skills/components/TrendChart.tsx` 的形态，但不要直接上提共享，先放在 ops/resources 目录内。

刷新策略：

- 当前快照：`refetchInterval: 10000`。
- 历史趋势：`refetchInterval: 30000`。
- 页面顶部显示 `capturedAt`，避免用户误以为是实时流。

## 阈值与告警

先用环境变量配置，避免做复杂告警配置 UI：

```text
OPS_CPU_WARN_PERCENT=80
OPS_MEMORY_WARN_PERCENT=80
OPS_OUTBOX_FAILED_WARN=1
OPS_OUTBOX_PENDING_WARN=1000
```

告警只在页面展示，不先做短信、邮件、Webhook。等页面口径稳定后再接通知。

## 服务隔离建议

为了降低“我影响别人 / 别人影响我”的风险，监测之外还应在部署层做约束：

```yaml
server:
  cpus: "1.0"
  mem_limit: 768m
  logging:
    driver: json-file
    options:
      max-size: "50m"
      max-file: "3"

worker:
  cpus: "1.0"
  mem_limit: 768m
  logging:
    driver: json-file
    options:
      max-size: "50m"
      max-file: "3"

web:
  cpus: "0.5"
  mem_limit: 128m
  logging:
    driver: json-file
    options:
      max-size: "20m"
      max-file: "3"

mysql:
  cpus: "2.0"
  mem_limit: 2g
  logging:
    driver: json-file
    options:
      max-size: "100m"
      max-file: "5"
```

具体数值要按服务器配置和实际流量调整。先监测一周，再收紧限制更稳妥。

## 分阶段实施

### P0：人工盘点与 DB 大小展示

- 文档补充服务器盘点命令。
- `/api/ops/tables` 扩展表大小字段。
- “数据检索”或新“服务质量”页展示数据库总大小和表大小排行。

收益：无 Docker socket 权限风险，能快速知道数据库占用。

### P1：当前资源快照

- 增加 `ops-agent`。
- 增加 `ops_resource_snapshots`。
- 页面展示当前 CPU、内存、服务状态、镜像大小、容器可写层。

收益：能看到本项目是否正在挤占服务器资源。

### P2：历史趋势与阈值提示

- 增加 `/api/ops/resources/history`。
- 展示 1h / 6h / 24h / 7d 趋势。
- 页面展示 warn/bad alerts。

收益：能定位偶发尖峰和资源增长趋势。

### P3：宿主机摘要

- 只展示宿主机剩余 CPU/内存/磁盘摘要。
- 不展示同事容器明细。
- 如需全公司共享视角，另建独立平台或接 Prometheus + cAdvisor + Grafana。

收益：判断外部服务是否挤压本项目，同时控制可见范围。

## 验收

- 能在服务器用命令确认项目部署目录、镜像、容器、MySQL 数据大小。
- `super_admin` 能在 Web 后台看到 `/ops/resources`。
- 页面只统计 `sdd-telemetry` Compose project，不混入其他服务。
- `viewer` 不能访问资源监测页面和 API。
- ops-agent 关闭或采集失败时，不影响 ingest、server、worker、web 主链路。
- 运行 `pnpm typecheck`、`pnpm build` 通过。
