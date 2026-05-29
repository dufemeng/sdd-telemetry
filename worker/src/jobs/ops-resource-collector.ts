import http from 'node:http';
import type { Pool, ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import type { Logger } from 'pino';

const DOCKER_SOCKET = process.env.DOCKER_SOCKET_PATH ?? '/var/run/docker.sock';
const PROJECT_NAME = process.env.COMPOSE_PROJECT_NAME ?? 'sdd-telemetry';
const SERVICE_ORDER = ['mysql', 'server', 'worker', 'web'];

interface DockerContainer {
  Id: string;
  Names?: string[];
  Image: string;
  ImageID?: string;
  State: string;
  Labels?: Record<string, string>;
  SizeRw?: number;
  SizeRootFs?: number;
}

interface DockerInspect {
  RestartCount?: number;
  State?: {
    Status?: string;
    Health?: {
      Status?: string;
    };
  };
}

interface DockerStats {
  cpu_stats?: {
    cpu_usage?: {
      total_usage?: number;
      percpu_usage?: number[];
    };
    system_cpu_usage?: number;
    online_cpus?: number;
  };
  precpu_stats?: {
    cpu_usage?: {
      total_usage?: number;
    };
    system_cpu_usage?: number;
  };
  memory_stats?: {
    usage?: number;
    limit?: number;
  };
  networks?: Record<string, { rx_bytes?: number; tx_bytes?: number }>;
  blkio_stats?: {
    io_service_bytes_recursive?: Array<{ op?: string; value?: number }>;
  };
}

interface DockerImage {
  Size?: number;
}

export async function collectOpsResourceSnapshot(pool: Pool, logger: Logger): Promise<number> {
  const containers = await listProjectContainers();
  const serviceContainers = containers
    .filter(container => SERVICE_ORDER.includes(serviceNameOf(container)))
    .sort((a, b) => SERVICE_ORDER.indexOf(serviceNameOf(a)) - SERVICE_ORDER.indexOf(serviceNameOf(b)));

  const databaseBytes = await readDatabaseBytes(pool);
  const deployDirectoryBytes = readOptionalNumber(process.env.DEPLOY_DIRECTORY_BYTES);
  const capturedAt = new Date();
  const imageSizeCache = new Map<string, number | null>();
  const rows = [];

  for (const container of serviceContainers) {
    const inspect: DockerInspect = await dockerGet<DockerInspect>(`/containers/${container.Id}/json`).catch(error => {
      logger.warn({ err: error, containerId: container.Id }, 'failed to inspect container');
      return {};
    });
    const stats =
      (inspect.State?.Status ?? container.State) === 'running'
        ? await dockerGet<DockerStats>(`/containers/${container.Id}/stats?stream=false`).catch(error => {
            logger.warn({ err: error, containerId: container.Id }, 'failed to read container stats');
            return null;
          })
        : null;
    const imageKey = container.ImageID || container.Image;
    const imageSizeBytes = await readImageSize(imageKey, imageSizeCache);
    const network = sumNetwork(stats);
    const block = sumBlockIo(stats);

    rows.push([
      capturedAt,
      PROJECT_NAME,
      serviceNameOf(container),
      cleanContainerName(container),
      container.Id,
      inspect.State?.Status ?? container.State,
      inspect.State?.Health?.Status ?? null,
      inspect.RestartCount ?? 0,
      calculateCpuPercent(stats),
      stats?.memory_stats?.usage ?? null,
      stats?.memory_stats?.limit ?? null,
      network.rx,
      network.tx,
      block.read,
      block.write,
      container.SizeRw ?? null,
      container.Image,
      imageSizeBytes,
      databaseBytes,
      deployDirectoryBytes,
    ]);
  }

  if (rows.length === 0) {
    logger.warn({ projectName: PROJECT_NAME }, 'no project containers found for ops resource snapshot');
    return 0;
  }

  const [result] = await pool.query<ResultSetHeader>(
    `INSERT INTO ops_resource_snapshots (
       captured_at, project_name, service_name, container_name, container_id,
       state, health, restart_count, cpu_percent, memory_usage_bytes,
       memory_limit_bytes, network_rx_bytes, network_tx_bytes, block_read_bytes,
       block_write_bytes, writable_layer_bytes, image_ref, image_size_bytes,
       database_bytes, deploy_directory_bytes
     ) VALUES ?`,
    [rows],
  );

  await pruneSnapshots(pool);
  return result.affectedRows;
}

async function listProjectContainers(): Promise<DockerContainer[]> {
  const filters = encodeURIComponent(JSON.stringify({
    label: [`com.docker.compose.project=${PROJECT_NAME}`],
  }));
  return dockerGet<DockerContainer[]>(`/containers/json?all=1&size=1&filters=${filters}`);
}

async function readDatabaseBytes(pool: Pool): Promise<number> {
  const [rows] = await pool.query<Array<RowDataPacket & { total_bytes: string | number | null }>>(
    `SELECT COALESCE(SUM(data_length + index_length), 0) AS total_bytes
     FROM information_schema.tables
     WHERE table_schema = DATABASE()`,
  );
  return Number(rows[0]?.total_bytes ?? 0);
}

async function readImageSize(
  imageKey: string,
  cache: Map<string, number | null>,
): Promise<number | null> {
  if (cache.has(imageKey)) return cache.get(imageKey) ?? null;
  const image = await dockerGet<DockerImage>(`/images/${encodeURIComponent(imageKey)}/json`).catch(() => null);
  const size = typeof image?.Size === 'number' ? image.Size : null;
  cache.set(imageKey, size);
  return size;
}

async function pruneSnapshots(pool: Pool): Promise<void> {
  const retentionDays = Number(process.env.OPS_RESOURCE_RETENTION_DAYS ?? 14);
  await pool.query(
    `DELETE FROM ops_resource_snapshots
     WHERE captured_at < DATE_SUB(UTC_TIMESTAMP(3), INTERVAL ? DAY)`,
    [retentionDays],
  );
}

function serviceNameOf(container: DockerContainer): string {
  return container.Labels?.['com.docker.compose.service'] ?? 'unknown';
}

function cleanContainerName(container: DockerContainer): string {
  const name = container.Names?.[0] ?? container.Id;
  return name.startsWith('/') ? name.slice(1) : name;
}

function calculateCpuPercent(stats: DockerStats | null): number | null {
  if (!stats?.cpu_stats || !stats.precpu_stats) return null;
  const cpuDelta =
    (stats.cpu_stats.cpu_usage?.total_usage ?? 0) -
    (stats.precpu_stats.cpu_usage?.total_usage ?? 0);
  const systemDelta =
    (stats.cpu_stats.system_cpu_usage ?? 0) - (stats.precpu_stats.system_cpu_usage ?? 0);
  const onlineCpus =
    stats.cpu_stats.online_cpus ?? stats.cpu_stats.cpu_usage?.percpu_usage?.length ?? 1;
  if (cpuDelta <= 0 || systemDelta <= 0) return null;
  return (cpuDelta / systemDelta) * onlineCpus * 100;
}

function sumNetwork(stats: DockerStats | null): { rx: number | null; tx: number | null } {
  if (!stats?.networks) return { rx: null, tx: null };
  let rx = 0;
  let tx = 0;
  for (const network of Object.values(stats.networks)) {
    rx += network.rx_bytes ?? 0;
    tx += network.tx_bytes ?? 0;
  }
  return { rx, tx };
}

function sumBlockIo(stats: DockerStats | null): { read: number | null; write: number | null } {
  const entries = stats?.blkio_stats?.io_service_bytes_recursive;
  if (!entries) return { read: null, write: null };
  let read = 0;
  let write = 0;
  for (const entry of entries) {
    if (entry.op === 'Read') read += entry.value ?? 0;
    if (entry.op === 'Write') write += entry.value ?? 0;
  }
  return { read, write };
}

function readOptionalNumber(value: string | undefined): number | null {
  if (!value) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

async function dockerGet<T>(path: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const req = http.request(
      {
        socketPath: DOCKER_SOCKET,
        path,
        method: 'GET',
      },
      res => {
        const chunks: Buffer[] = [];
        res.on('data', chunk => {
          chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        });
        res.on('end', () => {
          const body = Buffer.concat(chunks).toString('utf8');
          if (!res.statusCode || res.statusCode < 200 || res.statusCode >= 300) {
            reject(new Error(`Docker API ${res.statusCode}: ${body}`));
            return;
          }
          resolve(body ? (JSON.parse(body) as T) : ({} as T));
        });
      },
    );
    req.on('error', reject);
    req.end();
  });
}
