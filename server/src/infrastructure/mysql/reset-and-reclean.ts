import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { createInterface } from 'node:readline';
import type { DataSource } from 'typeorm';
import { createAppDataSource } from './data-source';
import { resetDerivedData } from './reset-derived-data';

interface Flags {
  yes: boolean;
  forceRemote: boolean;
  acceptDataLoss: boolean;
  skipBuild: boolean;
  maxIterations: number;
  budgetMs: number;
  lossRateThreshold: number;
}

const LOCALHOST_HOSTS = new Set(['localhost', '127.0.0.1', '::1', 'mysql', 'db']);

function parseFlags(): Flags {
  const args = process.argv.slice(2);
  const has = (name: string): boolean => args.includes(`--${name}`);
  const num = (name: string, fallback: number): number => {
    const prefix = `--${name}=`;
    const found = args.find((a) => a.startsWith(prefix));
    if (!found) return fallback;
    const parsed = Number(found.slice(prefix.length));
    if (!Number.isFinite(parsed)) {
      throw new Error(`[reclean] invalid value for --${name}: ${found.slice(prefix.length)}`);
    }
    return parsed;
  };
  return {
    yes: has('yes'),
    forceRemote: has('force-remote'),
    acceptDataLoss: has('accept-data-loss'),
    skipBuild: has('skip-build'),
    maxIterations: num('max-iterations', 200),
    budgetMs: num('budget-ms', 45000),
    lossRateThreshold: num('loss-threshold', 0.05),
  };
}

async function promptUser(query: string): Promise<string> {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    rl.question(query, (answer) => {
      rl.close();
      resolve(answer);
    });
  });
}

async function scalar(dataSource: DataSource, sql: string): Promise<number> {
  const rows = (await dataSource.query(sql)) as Array<Record<string, unknown>>;
  const first = rows[0];
  if (!first) return 0;
  const value = Object.values(first)[0];
  return Number(value ?? 0);
}

async function pendingOutboxCount(dataSource: DataSource): Promise<number> {
  return scalar(
    dataSource,
    `SELECT COUNT(*) AS n FROM ingest_outbox
     WHERE event_type = 'clean_batch' AND status IN ('pending', 'dispatching')`,
  );
}

async function backfillWikiRecalls(dataSource: DataSource): Promise<number> {
  const result = await dataSource.query(
    `INSERT INTO sdd_wiki_recalls
      (recall_key, tool_call_id, interaction_id, skill_usage_id, work_item_id, user_id,
       action_type, raw_path, wiki_relative_path, wiki_domain, wiki_axis, wiki_system,
       event_id, event_sequence, event_time, rule_version, gmt_create, gmt_modified)
    SELECT
      SHA2(CONCAT(tc.id, ':', JSON_UNQUOTE(JSON_EXTRACT(tc.tool_input_preview, '$.file_path'))), 256),
      tc.id,
      tc.interaction_id,
      tc.skill_usage_id,
      su.work_item_id,
      i.user_id,
      LOWER(tc.tool_name),
      JSON_UNQUOTE(JSON_EXTRACT(tc.tool_input_preview, '$.file_path')),
      TRIM(LEADING '/' FROM SUBSTRING(
        JSON_UNQUOTE(JSON_EXTRACT(tc.tool_input_preview, '$.file_path')),
        LENGTH(u.wiki_root_path) + 1)),
      CASE
        WHEN SUBSTRING_INDEX(TRIM(LEADING '/' FROM SUBSTRING(
          JSON_UNQUOTE(JSON_EXTRACT(tc.tool_input_preview, '$.file_path')),
          LENGTH(u.wiki_root_path) + 1)), '/', 1) LIKE 'domain-%'
        THEN SUBSTRING(SUBSTRING_INDEX(TRIM(LEADING '/' FROM SUBSTRING(
          JSON_UNQUOTE(JSON_EXTRACT(tc.tool_input_preview, '$.file_path')),
          LENGTH(u.wiki_root_path) + 1)), '/', 1), 8)
        ELSE NULL
      END,
      CASE
        WHEN TRIM(LEADING '/' FROM SUBSTRING(
          JSON_UNQUOTE(JSON_EXTRACT(tc.tool_input_preview, '$.file_path')),
          LENGTH(u.wiki_root_path) + 1)) = '' THEN 'root'
        WHEN SUBSTRING_INDEX(TRIM(LEADING '/' FROM SUBSTRING(
          JSON_UNQUOTE(JSON_EXTRACT(tc.tool_input_preview, '$.file_path')),
          LENGTH(u.wiki_root_path) + 1)), '/', 1) NOT LIKE 'domain-%' THEN 'root'
        ELSE SUBSTRING_INDEX(SUBSTRING_INDEX(TRIM(LEADING '/' FROM SUBSTRING(
          JSON_UNQUOTE(JSON_EXTRACT(tc.tool_input_preview, '$.file_path')),
          LENGTH(u.wiki_root_path) + 1)), '/', 2), '/', -1)
      END,
      CASE
        WHEN SUBSTRING_INDEX(SUBSTRING_INDEX(TRIM(LEADING '/' FROM SUBSTRING(
          JSON_UNQUOTE(JSON_EXTRACT(tc.tool_input_preview, '$.file_path')),
          LENGTH(u.wiki_root_path) + 1)), '/', 3), '/', -1) = 'apps'
        THEN SUBSTRING_INDEX(SUBSTRING_INDEX(TRIM(LEADING '/' FROM SUBSTRING(
          JSON_UNQUOTE(JSON_EXTRACT(tc.tool_input_preview, '$.file_path')),
          LENGTH(u.wiki_root_path) + 1)), '/', 4), '/', -1)
        ELSE NULL
      END,
      NULL,
      tc.sequence,
      i.started_at,
      'backfill-wiki-v1',
      CURRENT_TIMESTAMP(3),
      CURRENT_TIMESTAMP(3)
    FROM sdd_interaction_tool_calls tc
    JOIN sdd_interactions i ON i.id = tc.interaction_id
    JOIN sdd_users u ON u.id = i.user_id
    LEFT JOIN sdd_skill_usages su ON su.id = tc.skill_usage_id
    WHERE tc.tool_name IN ('Read', 'Glob', 'Grep')
      AND u.wiki_root_path IS NOT NULL
      AND tc.tool_input_preview IS NOT NULL
      AND JSON_EXTRACT(tc.tool_input_preview, '$.file_path') IS NOT NULL
      AND JSON_UNQUOTE(JSON_EXTRACT(tc.tool_input_preview, '$.file_path')) LIKE CONCAT(u.wiki_root_path, '%')
    ON DUPLICATE KEY UPDATE
      sdd_wiki_recalls.skill_usage_id = COALESCE(VALUES(skill_usage_id), sdd_wiki_recalls.skill_usage_id),
      sdd_wiki_recalls.work_item_id = COALESCE(VALUES(work_item_id), sdd_wiki_recalls.work_item_id),
      gmt_modified = CURRENT_TIMESTAMP(3)`,
  );
  const affected = Number(result?.affectedRows ?? 0);
  const total = await scalar(dataSource, 'SELECT COUNT(*) AS n FROM sdd_wiki_recalls');
  console.info(`[reclean] wiki-recall backfill: affected=${affected} total=${total}`);
  return total;
}

async function main(): Promise<void> {
  const flags = parseFlags();
  const host = process.env.MYSQL_HOST ?? '127.0.0.1';
  const port = process.env.MYSQL_PORT ?? '3306';
  const db = process.env.MYSQL_DATABASE ?? 'sdd-telemetry';
  const user = process.env.MYSQL_USER ?? 'sdd-telemetry';

  console.info(`[reclean] target: mysql://${user}@${host}:${port}/${db}`);

  if (!LOCALHOST_HOSTS.has(host) && !flags.forceRemote) {
    throw new Error(
      `[reclean] host "${host}" is not localhost. ` +
        `add --force-remote to confirm you really mean to reset a remote database.`,
    );
  }

  const dataSource = createAppDataSource();
  await dataSource.initialize();

  try {
    const batches = await scalar(dataSource, 'SELECT COUNT(*) AS n FROM otel_ingest_batches');
    const raws = await scalar(dataSource, 'SELECT COUNT(*) AS n FROM otel_raw_payloads');
    const failedTerminal = await scalar(
      dataSource,
      `SELECT COUNT(*) AS n FROM otel_ingest_batches WHERE status = 'failed_terminal'`,
    );
    const recentProcessing = await scalar(
      dataSource,
      `SELECT COUNT(*) AS n FROM otel_ingest_batches
       WHERE status = 'processing' AND gmt_modified > DATE_SUB(NOW(), INTERVAL 30 SECOND)`,
    );
    const semantics = await scalar(dataSource, 'SELECT COUNT(*) AS n FROM sdd_skill_semantics');
    const aliases = await scalar(dataSource, 'SELECT COUNT(*) AS n FROM sdd_skill_aliases');
    const lossRate = batches > 0 ? (batches - raws) / batches : 0;

    console.info('[reclean] preflight:');
    console.info(`  batches=${batches}  raw_payloads=${raws}  loss_rate=${(lossRate * 100).toFixed(2)}%`);
    console.info(`  failed_terminal=${failedTerminal}  recent_processing=${recentProcessing}`);
    console.info(`  sdd_skill_semantics=${semantics}  sdd_skill_aliases=${aliases}`);

    if (lossRate > flags.lossRateThreshold && !flags.acceptDataLoss) {
      throw new Error(
        `[reclean] raw payload loss rate ${(lossRate * 100).toFixed(2)}% exceeds threshold ` +
          `${(flags.lossRateThreshold * 100).toFixed(2)}%. ` +
          `${batches - raws} batches will lose their derived data permanently. ` +
          `add --accept-data-loss to proceed anyway.`,
      );
    }

    if (recentProcessing > 0) {
      console.warn(
        `[reclean] WARN: ${recentProcessing} batches in 'processing' updated within last 30s — ` +
          `another worker may be running. consider stopping it (pnpm stop) before continuing.`,
      );
    }

    if (!flags.yes) {
      if (!process.stdin.isTTY) {
        throw new Error('[reclean] non-interactive run requires --yes flag.');
      }
      const answer = await promptUser(
        `[reclean] type RESET to confirm reset+reclean on ${host}/${db}: `,
      );
      if (answer.trim() !== 'RESET') {
        throw new Error('[reclean] aborted: confirmation not received.');
      }
    }

    if (!flags.skipBuild) {
      console.info('[reclean] building worker...');
      execSync('pnpm --filter @sdd-telemetry/worker build', { stdio: 'inherit' });
    } else {
      const workerDist = join(__dirname, '..', '..', '..', '..', 'worker', 'dist', 'main.js');
      if (!existsSync(workerDist)) {
        throw new Error(
          `[reclean] --skip-build set but worker dist not found at ${workerDist}. ` +
            `run pnpm --filter @sdd-telemetry/worker build first.`,
        );
      }
    }

    console.info('[reclean] resetting derived tables and re-queueing batches...');
    await resetDerivedData(dataSource);
    const initialPending = await pendingOutboxCount(dataSource);
    console.info(`[reclean] reset complete; ${initialPending} clean_batch entries queued.`);

    if (initialPending === 0) {
      console.info('[reclean] nothing to reclean (no raw payloads). done.');
      return;
    }

    let previousPending = initialPending;
    let iteration = 0;
    let stuck = false;

    while (iteration < flags.maxIterations) {
      iteration += 1;
      const pending = await pendingOutboxCount(dataSource);

      if (pending === 0) {
        console.info(`[reclean] outbox drained after ${iteration - 1} worker iterations.`);
        break;
      }

      console.info(
        `[reclean] iteration ${iteration}: pending=${pending} (was ${previousPending}); running worker once...`,
      );
      try {
        execSync('pnpm --filter @sdd-telemetry/worker once', {
          stdio: 'inherit',
          env: {
            ...process.env,
            SCHEDULE_CLEANING_BUDGET_MS: String(flags.budgetMs),
          },
        });
      } catch (error) {
        throw new Error(
          `[reclean] worker once failed in iteration ${iteration}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }

      const after = await pendingOutboxCount(dataSource);
      if (after >= pending) {
        console.error(
          `[reclean] no progress in iteration ${iteration}: pending ${pending} -> ${after}. ` +
            `outbox may be stuck on retry backoff or another worker is competing.`,
        );
        stuck = true;
        break;
      }
      previousPending = after;
    }

    if (iteration >= flags.maxIterations) {
      console.error(`[reclean] reached --max-iterations=${flags.maxIterations}; outbox not drained.`);
      stuck = true;
    }

    console.info('[reclean] running wiki-recall backfill...');
    await backfillWikiRecalls(dataSource);

    const statusRows = (await dataSource.query(
      `SELECT status, COUNT(*) AS n FROM otel_ingest_batches GROUP BY status ORDER BY n DESC`,
    )) as Array<{ status: string; n: number | string }>;
    console.info('[reclean] postflight batch status:');
    for (const row of statusRows) {
      console.info(`  ${row.status}: ${Number(row.n)}`);
    }

    const finalFailedTerminal = await scalar(
      dataSource,
      `SELECT COUNT(*) AS n FROM otel_ingest_batches WHERE status = 'failed_terminal'`,
    );
    if (finalFailedTerminal > 0) {
      const sample = (await dataSource.query(
        `SELECT id, last_error FROM otel_ingest_batches
         WHERE status = 'failed_terminal'
         ORDER BY gmt_modified DESC
         LIMIT 10`,
      )) as Array<{ id: number | string; last_error: string | null }>;
      console.warn(`[reclean] ${finalFailedTerminal} batches failed_terminal. sample (latest 10):`);
      for (const row of sample) {
        const snippet = (row.last_error ?? '(no error message)').replace(/\s+/g, ' ').slice(0, 200);
        console.warn(`  batch=${row.id}  err="${snippet}"`);
      }
    }

    if (stuck || finalFailedTerminal > failedTerminal) {
      process.exitCode = 1;
      console.error(
        `[reclean] completed with issues: stuck=${stuck} new_failed_terminal=${
          finalFailedTerminal - failedTerminal
        }. see logs above.`,
      );
    } else {
      console.info('[reclean] done.');
    }
  } finally {
    await dataSource.destroy().catch(() => undefined);
  }
}

if (require.main === module) {
  void main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
